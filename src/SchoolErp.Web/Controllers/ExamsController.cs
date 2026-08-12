using System;
using System.Collections.Generic;
using System.Data.Entity;
using System.Linq;
using System.Web.Mvc;
using SchoolErp.Domain.Grading;
using SchoolErp.Web.Data.Entities;
using SchoolErp.Web.Filters;
using SchoolErp.Web.Services;
using SchoolErp.Web.ViewModels;

namespace SchoolErp.Web.Controllers
{
    /// <summary>
    /// Exams and results (§7).
    ///
    /// Teachers enter marks; admins tabulate and publish. Everything a student or
    /// guardian sees comes through PortalController instead, gated on the term
    /// being published.
    /// </summary>
    [Authorize(Roles = "ADMIN,TEACHER")]
    [RequireModule("exams")]
    public class ExamsController : BaseController
    {
        private IExamService _exams;

        private IExamService Exams
        {
            get { return _exams ?? (_exams = new ExamService(Db, Audit)); }
        }

        // ---- Tabulation ------------------------------------------------------

        public ActionResult Index(int? classSectionId, int? examTermId)
        {
            var context = BuildContext(classSectionId, examTermId);
            if (context.ClassSectionId == 0 || context.ExamTermId == 0) return View("NoData", context);

            var model = new TabulationViewModel
            {
                Sections = context.Sections,
                Terms = context.Terms,
                ClassSectionId = context.ClassSectionId,
                ExamTermId = context.ExamTermId,
                SectionName = context.SectionName,
                TermName = context.TermName,
                IsPublished = context.IsPublished,
                IsLocked = context.IsLocked
            };

            model.Ranked = Exams.Tabulate(model.ClassSectionId, model.ExamTermId);
            model.Subjects = Exams.SubjectsFor(model.ClassSectionId);

            var results = model.Ranked.Select(r => r.Result).ToList();
            model.Appeared = results.Count;
            model.Passed = results.Count(r => r.Passed);
            model.GpaFive = results.Count(r => r.Passed && r.Gpa >= 5.00m);
            model.AverageGpa = results.Any(r => r.Passed)
                ? Math.Round(results.Where(r => r.Passed).Average(r => r.Gpa), 2)
                : 0m;

            return View(model);
        }

        // ---- Mark entry ------------------------------------------------------

        public ActionResult MarkEntry(int? classSectionId, int? examTermId, int? subjectId)
        {
            var context = BuildContext(classSectionId, examTermId);
            if (context.ClassSectionId == 0 || context.ExamTermId == 0) return View("NoData", context);

            var subjects = Exams.SubjectsFor(context.ClassSectionId);
            if (subjects.Count == 0) return View("NoData", context);

            var subject = subjects.FirstOrDefault(s => s.SubjectId == (subjectId ?? 0)) ?? subjects[0];

            var term = Db.ExamTerms.Find(context.ExamTermId);
            var enrolments = Db.Enrolments.AsNoTracking()
                .Include(e => e.Student)
                .Where(e => e.ClassSectionId == context.ClassSectionId && e.IsActive)
                .OrderBy(e => e.RollNumber)
                .ToList();

            // A student sits only their own optional subject (§7), so the entry
            // sheet for an optional paper lists just its candidates.
            if (subject.IsOptional)
            {
                enrolments = enrolments.Where(e => e.OptionalSubjectId == subject.SubjectId).ToList();
            }

            var studentIds = enrolments.Select(e => e.StudentId).ToList();
            var existing = Db.Marks.AsNoTracking()
                .Where(m => m.ExamTermId == context.ExamTermId
                            && m.SubjectId == subject.SubjectId
                            && studentIds.Contains(m.StudentId))
                .ToDictionary(m => m.StudentId, m => m.ObtainedMarks);

            var model = new MarkEntryViewModel
            {
                Context = context,
                Subjects = subjects,
                Subject = subject,
                IsLocked = term != null && term.IsLocked,
                Rows = enrolments.Select(e =>
                {
                    decimal? mark;
                    existing.TryGetValue(e.StudentId, out mark);
                    return new MarkEntryRow
                    {
                        StudentId = e.StudentId,
                        RollNumber = e.RollNumber,
                        FullName = e.Student.FullName,
                        FullNameBn = e.Student.FullNameBn,
                        Obtained = mark
                    };
                }).ToList()
            };

            return View(model);
        }

        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult MarkEntry(int classSectionId, int examTermId, int subjectId, MarkEntryRow[] rows)
        {
            if (rows == null || rows.Length == 0)
            {
                Notify("Nothing to save — no marks were submitted.", "warn");
                return RedirectToAction("MarkEntry", new { classSectionId, examTermId, subjectId });
            }

            var payload = new Dictionary<string, decimal?>();
            foreach (var row in rows)
            {
                if (string.IsNullOrEmpty(row.StudentId)) continue;
                payload[row.StudentId] = row.Obtained;
            }

            try
            {
                var saved = Exams.SaveMarks(examTermId, subjectId, payload, CurrentUserId ?? 0,
                    CurrentEmployee == null ? (int?)null : CurrentEmployee.EmployeeId);

                Notify(saved == 0
                    ? "No marks were changed."
                    : string.Format("{0} mark{1} saved. Affected results have been recomputed.",
                        saved, saved == 1 ? "" : "s"));
            }
            catch (Exception ex)
            {
                // Includes the locked-term refusal and out-of-range marks, both of
                // which are the user's problem to fix rather than a server fault.
                Notify(ex.Message, "bad");
            }

            return RedirectToAction("MarkEntry", new { classSectionId, examTermId, subjectId });
        }

        // ---- Report card -----------------------------------------------------

        public ActionResult ReportCard(string studentId, int examTermId)
        {
            if (string.IsNullOrEmpty(studentId)) return HttpNotFound();

            var student = Db.Students.AsNoTracking()
                .Include(s => s.Guardian)
                .FirstOrDefault(s => s.StudentId == studentId);
            if (student == null) return HttpNotFound();

            var enrolment = Db.Enrolments.AsNoTracking()
                .Include(e => e.ClassSection)
                .Include(e => e.ClassSection.Grade)
                .Include(e => e.ClassSection.Group)
                .FirstOrDefault(e => e.StudentId == studentId && e.IsActive);

            var term = Db.ExamTerms.AsNoTracking().FirstOrDefault(t => t.ExamTermId == examTermId);
            if (term == null || enrolment == null) return HttpNotFound();

            var result = Exams.ResultFor(studentId, examTermId);

            // Class position comes from the same ranking the tabulation sheet uses,
            // so the two documents can never disagree.
            var ranked = Exams.Tabulate(enrolment.ClassSectionId, examTermId);
            var position = ranked.FirstOrDefault(r => r.Subject.StudentId == studentId);

            var year = CurrentYear;
            var attendance = new AttendanceService(Db, Audit)
                .SummaryFor(studentId,
                    year == null ? DateTime.Now.AddMonths(-6) : year.StartDate,
                    DateTime.Now);

            return View(new ReportCardViewModel
            {
                Student = student,
                Enrolment = enrolment,
                Term = term,
                Result = result,
                ClassPosition = position == null ? (int?)null : position.Rank,
                ClassSize = ranked.Count,
                Attendance = attendance
            });
        }

        // ---- Publishing ------------------------------------------------------

        [Authorize(Roles = "ADMIN")]
        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult Publish(int examTermId, bool publish)
        {
            var term = Db.ExamTerms.Find(examTermId);
            if (term == null) return HttpNotFound();

            term.IsPublished = publish;
            term.PublishedAtUtc = publish ? DateTime.UtcNow : (DateTime?)null;

            // Publishing locks mark entry. Results that can still change after
            // guardians have seen them are how disputes start.
            if (publish) term.IsLocked = true;

            Db.SaveChanges();
            Audit.Record(CurrentUserId, publish ? "exam.publish" : "exam.unpublish",
                "ExamTerm", term.Code, new { term.Name });

            Notify(publish
                ? string.Format("{0} results are published and mark entry is locked.", term.Name)
                : string.Format("{0} results are no longer visible to students and guardians.", term.Name));

            return RedirectToAction("Index");
        }

        // ---- Helpers ---------------------------------------------------------

        private ExamContextViewModel BuildContext(int? classSectionId, int? examTermId)
        {
            var year = CurrentYear;

            var sections = Db.ClassSections.AsNoTracking()
                .Include(c => c.Grade)
                .Where(c => c.IsActive)
                .OrderBy(c => c.GradeId).ThenBy(c => c.Code)
                .ToList();

            var terms = year == null
                ? new List<ExamTerm>()
                : Db.ExamTerms.AsNoTracking()
                    .Where(t => t.AcademicYearId == year.AcademicYearId)
                    .OrderBy(t => t.ExamTermId)
                    .ToList();

            var section = sections.FirstOrDefault(s => s.ClassSectionId == (classSectionId ?? 0)) ?? sections.FirstOrDefault();

            // The board-prep Test Examination applies only to the grades that lead
            // to a board exam, so it is filtered out for everyone else.
            if (section != null && section.Grade != null && string.IsNullOrEmpty(section.Grade.TerminalExam))
            {
                terms = terms.Where(t => !t.BoardPrepOnly).ToList();
            }

            var term = terms.FirstOrDefault(t => t.ExamTermId == (examTermId ?? 0)) ?? terms.FirstOrDefault();

            return new ExamContextViewModel
            {
                Sections = sections,
                Terms = terms,
                ClassSectionId = section == null ? 0 : section.ClassSectionId,
                ExamTermId = term == null ? 0 : term.ExamTermId,
                SectionName = section == null ? null : section.DisplayName,
                TermName = term == null ? null : term.Name,
                IsPublished = term != null && term.IsPublished,
                IsLocked = term != null && term.IsLocked
            };
        }
    }
}
