using System;
using System.Collections.Generic;
using System.Data.Entity;
using System.Linq;
using SchoolErp.Domain.Grading;
using SchoolErp.Web.Data;
using SchoolErp.Web.Data.Entities;

namespace SchoolErp.Web.Services
{
    public interface IExamService
    {
        IReadOnlyList<Subject> SubjectsFor(int classSectionId);

        /// <summary>Every candidate's result for a class in a term, ranked.</summary>
        IReadOnlyList<RankedResult<StudentSummary>> Tabulate(int classSectionId, int examTermId);

        /// <summary>One candidate's result, computed live from the marks on file.</summary>
        TermResult ResultFor(string studentId, int examTermId);

        /// <summary>Save a subject's marks for a whole class and recompute affected results.</summary>
        int SaveMarks(int examTermId, int subjectId, IDictionary<string, decimal?> marksByStudent, int actingUserId, int? employeeId);
    }

    /// <summary>The identity a tabulation row carries.</summary>
    public class StudentSummary
    {
        public string StudentId { get; set; }
        public string FullName { get; set; }
        public string FullNameBn { get; set; }
        public short RollNumber { get; set; }
        public string ClassName { get; set; }
        public int? OptionalSubjectId { get; set; }
    }

    /// <summary>
    /// Examinations and results (§7).
    ///
    /// The grading rules themselves are not implemented here — they live in
    /// SchoolErp.Domain, which is unit-tested and shared with the browser twin.
    /// This service's job is to fetch marks, hand them to the calculator, and
    /// persist what comes back.
    /// </summary>
    public class ExamService : IExamService
    {
        private readonly SchoolErpContext _db;
        private readonly IAuditService _audit;

        public ExamService(SchoolErpContext db, IAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public IReadOnlyList<Subject> SubjectsFor(int classSectionId)
        {
            var section = _db.ClassSections.AsNoTracking()
                .FirstOrDefault(c => c.ClassSectionId == classSectionId);
            if (section == null) return new List<Subject>();

            // A curriculum row with a null GroupId applies to every group in the
            // grade — the common subjects. A row with a group is that group's own.
            return _db.CurriculumSubjects.AsNoTracking()
                .Where(cs => cs.GradeId == section.GradeId
                             && (cs.GroupId == null || cs.GroupId == section.GroupId))
                .OrderBy(cs => cs.DisplayOrder)
                .Select(cs => cs.Subject)
                .ToList();
        }

        public TermResult ResultFor(string studentId, int examTermId)
        {
            var enrolment = _db.Enrolments.AsNoTracking()
                .Include(e => e.AcademicYear)
                .FirstOrDefault(e => e.StudentId == studentId && e.IsActive);
            if (enrolment == null) return ResultCalculator.Compute(new SubjectMark[0]);

            var subjects = SubjectsFor(enrolment.ClassSectionId);

            var marks = _db.Marks.AsNoTracking()
                .Where(m => m.StudentId == studentId && m.ExamTermId == examTermId)
                .ToDictionary(m => m.SubjectId, m => m.ObtainedMarks);

            return ResultCalculator.Compute(
                BuildSubjectMarks(subjects, marks, enrolment.OptionalSubjectId),
                LoadBands());
        }

        public IReadOnlyList<RankedResult<StudentSummary>> Tabulate(int classSectionId, int examTermId)
        {
            var section = _db.ClassSections.AsNoTracking()
                .Include(c => c.Grade)
                .FirstOrDefault(c => c.ClassSectionId == classSectionId);
            if (section == null) return new List<RankedResult<StudentSummary>>();

            var subjects = SubjectsFor(classSectionId);
            var bands = LoadBands();

            var enrolments = _db.Enrolments.AsNoTracking()
                .Include(e => e.Student)
                .Where(e => e.ClassSectionId == classSectionId && e.IsActive)
                .OrderBy(e => e.RollNumber)
                .ToList();

            var studentIds = enrolments.Select(e => e.StudentId).ToList();

            // One query for the whole class rather than one per student: a
            // tabulation sheet is up to 66 candidates, and N+1 here would be 66
            // round trips on a 256 MB host (§3).
            var allMarks = _db.Marks.AsNoTracking()
                .Where(m => m.ExamTermId == examTermId && studentIds.Contains(m.StudentId))
                .ToList()
                .GroupBy(m => m.StudentId)
                .ToDictionary(g => g.Key, g => g.ToDictionary(m => m.SubjectId, m => m.ObtainedMarks));

            var entries = new List<KeyValuePair<StudentSummary, TermResult>>(enrolments.Count);

            foreach (var enrolment in enrolments)
            {
                Dictionary<int, decimal?> marks;
                if (!allMarks.TryGetValue(enrolment.StudentId, out marks))
                {
                    marks = new Dictionary<int, decimal?>();
                }

                var summary = new StudentSummary
                {
                    StudentId = enrolment.StudentId,
                    FullName = enrolment.Student.FullName,
                    FullNameBn = enrolment.Student.FullNameBn,
                    RollNumber = enrolment.RollNumber,
                    ClassName = section.DisplayName,
                    OptionalSubjectId = enrolment.OptionalSubjectId
                };

                var result = ResultCalculator.Compute(
                    BuildSubjectMarks(subjects, marks, enrolment.OptionalSubjectId),
                    bands);

                entries.Add(new KeyValuePair<StudentSummary, TermResult>(summary, result));
            }

            return ResultRanker.Rank(entries);
        }

        public int SaveMarks(
            int examTermId,
            int subjectId,
            IDictionary<string, decimal?> marksByStudent,
            int actingUserId,
            int? employeeId)
        {
            if (marksByStudent == null) throw new ArgumentNullException("marksByStudent");

            var term = _db.ExamTerms.FirstOrDefault(t => t.ExamTermId == examTermId);
            if (term == null) throw new InvalidOperationException("The examination term does not exist.");

            // A locked term is locked. Silently accepting the write and discarding
            // it would be worse than refusing it.
            if (term.IsLocked)
            {
                throw new InvalidOperationException(
                    string.Format("{0} is locked; marks can no longer be entered.", term.Name));
            }

            var subject = _db.Subjects.FirstOrDefault(s => s.SubjectId == subjectId);
            if (subject == null) throw new InvalidOperationException("The subject does not exist.");

            var studentIds = marksByStudent.Keys.ToList();
            var existing = _db.Marks
                .Where(m => m.ExamTermId == examTermId && m.SubjectId == subjectId && studentIds.Contains(m.StudentId))
                .ToDictionary(m => m.StudentId);

            var changed = 0;

            foreach (var pair in marksByStudent)
            {
                var value = pair.Value;

                if (value.HasValue && (value.Value < 0m || value.Value > subject.FullMarks))
                {
                    throw new ArgumentOutOfRangeException(
                        "marksByStudent",
                        string.Format("{0} is outside 0–{1} for {2}.", value, subject.FullMarks, subject.Name));
                }

                Mark row;
                if (existing.TryGetValue(pair.Key, out row))
                {
                    if (row.ObtainedMarks == value) continue;
                    row.ObtainedMarks = value;
                    row.IsAbsent = !value.HasValue;
                    row.ModifiedAtUtc = DateTime.UtcNow;
                    row.EnteredByEmployeeId = employeeId;
                }
                else
                {
                    _db.Marks.Add(new Mark
                    {
                        StudentId = pair.Key,
                        ExamTermId = examTermId,
                        SubjectId = subjectId,
                        ObtainedMarks = value,
                        IsAbsent = !value.HasValue,
                        EnteredByEmployeeId = employeeId,
                        EnteredAtUtc = DateTime.UtcNow
                    });
                }
                changed++;
            }

            if (changed == 0) return 0;

            _db.SaveChanges();

            // A mark change alters the whole result, not just one subject — the
            // fail rule (§7) means a single entry can flip a candidate from GPA
            // 5.00 to 0.00. So every affected result is recomputed and stored.
            foreach (var studentId in marksByStudent.Keys)
            {
                RecomputeStoredResult(studentId, examTermId);
            }
            _db.SaveChanges();

            _audit.Record(actingUserId, "marks.save", "Mark", subject.Code,
                new { Term = term.Code, Subject = subject.Name, Count = changed });

            return changed;
        }

        /// <summary>
        /// Recompute and persist the stored result row.
        ///
        /// The T-SQL procedure <c>usp_ComputeTermResult</c> does the same job for
        /// bulk operations. Both exist deliberately: this path keeps the write in
        /// the same transaction as the marks, and the procedure exists for
        /// end-of-term recomputation across thousands of candidates, where round
        /// trips would dominate.
        /// </summary>
        private void RecomputeStoredResult(string studentId, int examTermId)
        {
            var result = ResultFor(studentId, examTermId);

            var row = _db.TermResults
                .FirstOrDefault(r => r.StudentId == studentId && r.ExamTermId == examTermId);

            if (row == null)
            {
                row = new TermResultRow { StudentId = studentId, ExamTermId = examTermId };
                _db.TermResults.Add(row);
            }

            row.TotalMarks = result.TotalMarks;
            row.TotalFullMarks = result.TotalFullMarks;
            row.Gpa = result.Gpa;
            row.LetterGrade = result.Letter;
            row.HasFailed = !result.Passed && !result.IsIncomplete;
            row.FailedSubjectCodes = result.FailedSubjectCodes.Count == 0
                ? null
                : string.Join(", ", result.FailedSubjectCodes);
            row.ComputedAtUtc = DateTime.UtcNow;
        }

        private static IEnumerable<SubjectMark> BuildSubjectMarks(
            IEnumerable<Subject> subjects,
            IDictionary<int, decimal?> marks,
            int? optionalSubjectId)
        {
            foreach (var subject in subjects)
            {
                // A student sits only their own chosen optional subject; the others
                // in the curriculum are somebody else's fourth subject.
                var isOptional = subject.IsOptional;
                if (isOptional && optionalSubjectId != subject.SubjectId) continue;

                decimal? obtained;
                if (!marks.TryGetValue(subject.SubjectId, out obtained)) obtained = null;

                yield return new SubjectMark(
                    subject.Code, subject.Name, subject.NameBn, subject.FullMarks, obtained, isOptional);
            }
        }

        /// <summary>
        /// §7 — load the band table from the database so a board revision is a data
        /// change. Falls back to the compiled default if the table is unseeded.
        /// </summary>
        private IReadOnlyList<GradeBand> LoadBands()
        {
            var rows = _db.GradeScale.AsNoTracking()
                .OrderByDescending(g => g.MinPercent)
                .ToList();

            if (rows.Count == 0) return GradeScale.Default;

            return rows
                .Select(r => new GradeBand(r.MinPercent, r.MaxPercent, r.LetterGrade, r.GradePoint, r.Remark))
                .ToList();
        }
    }
}
