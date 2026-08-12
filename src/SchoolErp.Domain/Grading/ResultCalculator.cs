using System;
using System.Collections.Generic;
using System.Linq;

namespace SchoolErp.Domain.Grading
{
    /// <summary>
    /// One subject a student sat, as handed to the calculator.
    /// </summary>
    public sealed class SubjectMark
    {
        public SubjectMark(string code, string name, string nameBn, decimal fullMarks, decimal? obtained, bool isOptional = false)
        {
            if (string.IsNullOrWhiteSpace(code)) throw new ArgumentException("Subject code is required.", "code");
            if (fullMarks <= 0) throw new ArgumentOutOfRangeException("fullMarks", "Full marks must be greater than zero.");

            Code = code;
            Name = name;
            NameBn = nameBn;
            FullMarks = fullMarks;
            Obtained = obtained;
            IsOptional = isOptional;
        }

        public string Code { get; }
        public string Name { get; }
        public string NameBn { get; }
        public decimal FullMarks { get; }

        /// <summary>Null means the candidate did not sit the paper.</summary>
        public decimal? Obtained { get; }

        /// <summary>
        /// The optional (4th) subject. Excluded from the GPA divisor; grade points
        /// above 2.00 count as a bonus; a fail in it does not fail the student (§7).
        /// </summary>
        public bool IsOptional { get; }
    }

    /// <summary>One graded row of a result.</summary>
    public sealed class SubjectResult
    {
        internal SubjectResult(SubjectMark mark, GradeBand band)
        {
            Code = mark.Code;
            Name = mark.Name;
            NameBn = mark.NameBn;
            FullMarks = mark.FullMarks;
            Obtained = mark.Obtained;
            IsOptional = mark.IsOptional;

            if (mark.Obtained.HasValue && band != null)
            {
                Letter = band.Letter;
                GradePoint = band.GradePoint;
                Percent = mark.FullMarks == 100m
                    ? mark.Obtained.Value
                    : (mark.Obtained.Value / mark.FullMarks) * 100m;
                Passed = Percent >= GradeScale.PassPercent;
            }
            else
            {
                Letter = "—";
                GradePoint = null;
                Percent = null;
                Passed = null;
            }
        }

        public string Code { get; }
        public string Name { get; }
        public string NameBn { get; }
        public decimal FullMarks { get; }
        public decimal? Obtained { get; }
        public bool IsOptional { get; }
        public string Letter { get; }
        public decimal? GradePoint { get; }
        public decimal? Percent { get; }
        public bool? Passed { get; }
    }

    /// <summary>A student's complete result for one examination term.</summary>
    public sealed class TermResult
    {
        internal TermResult(
            IReadOnlyList<SubjectResult> rows,
            decimal gpa,
            string letter,
            bool passed,
            bool isIncomplete,
            IReadOnlyList<string> failedSubjectCodes,
            decimal totalMarks,
            decimal totalFullMarks)
        {
            Rows = rows;
            Gpa = gpa;
            Letter = letter;
            Passed = passed;
            IsIncomplete = isIncomplete;
            FailedSubjectCodes = failedSubjectCodes;
            TotalMarks = totalMarks;
            TotalFullMarks = totalFullMarks;
        }

        public IReadOnlyList<SubjectResult> Rows { get; }
        public decimal Gpa { get; }
        public string Letter { get; }
        public bool Passed { get; }

        /// <summary>No compulsory subject carried a mark — the result cannot be computed.</summary>
        public bool IsIncomplete { get; }

        /// <summary>The compulsory subjects that failed, and therefore failed the whole result.</summary>
        public IReadOnlyList<string> FailedSubjectCodes { get; }

        public decimal TotalMarks { get; }
        public decimal TotalFullMarks { get; }

        public decimal Percent
        {
            get
            {
                return TotalFullMarks == 0m
                    ? 0m
                    : GradeScale.Truncate2((TotalMarks / TotalFullMarks) * 100m);
            }
        }

        public int SubjectCount
        {
            get { return Rows.Count(r => r.Obtained.HasValue); }
        }
    }

    /// <summary>
    /// The §7 grading rules.
    ///
    /// This is the C# counterpart of <c>computeResult()</c> in
    /// <c>docs/assets/js/core/domain.js</c> and of <c>usp_ComputeTermResult</c> in
    /// <c>database/schema.sql</c>. All three implement the same four rules, and
    /// the unit tests in SchoolErp.Domain.Tests pin them.
    /// </summary>
    public static class ResultCalculator
    {
        /// <summary>
        /// Compute a term result from a set of subject marks.
        ///
        /// The rules, in the order they apply:
        ///
        ///   1. Each subject's grade point comes from the board table, looked up on
        ///      the percentage so a 200-mark paper grades on the same scale.
        ///   2. A fail in ANY compulsory subject fails the whole result. GPA is
        ///      published as 0.00 and the letter as F, however strong the other
        ///      subjects are. This is the rule that surprises people, and it is the
        ///      reason the mark-entry screen recomputes on every keystroke.
        ///   3. The optional (4th) subject is excluded from the divisor. Grade
        ///      points above 2.00 are added as a bonus; a fail in it is harmless.
        ///   4. GPA is truncated to two decimals — never rounded — then capped at
        ///      5.00.
        /// </summary>
        /// <param name="marks">Every subject the candidate was entered for.</param>
        /// <param name="bands">Optional band table; the §7 default is used when null.</param>
        public static TermResult Compute(IEnumerable<SubjectMark> marks, IReadOnlyList<GradeBand> bands = null)
        {
            if (marks == null) throw new ArgumentNullException("marks");

            var input = marks.ToList();

            var rows = input
                .Select(m => new SubjectResult(
                    m,
                    m.Obtained.HasValue ? GradeScale.BandForMark(m.Obtained.Value, m.FullMarks, bands) : null))
                .ToList();

            var graded = rows.Where(r => r.Obtained.HasValue).ToList();
            var compulsory = graded.Where(r => !r.IsOptional).ToList();
            var optional = graded.FirstOrDefault(r => r.IsOptional);

            var isIncomplete = compulsory.Count == 0;

            // Rule 2 — one F in a compulsory subject fails everything.
            var failed = compulsory.Where(r => r.Passed == false).ToList();
            var hasFailed = failed.Count > 0;

            var gpa = 0m;
            if (!isIncomplete && !hasFailed)
            {
                var basePoints = compulsory.Sum(r => r.GradePoint.Value) / compulsory.Count;

                // Rule 3 — the 4th subject contributes only its excess over 2.00,
                // spread across the compulsory divisor.
                var bonus = 0m;
                if (optional != null && optional.GradePoint.HasValue && optional.GradePoint.Value > 2.00m)
                {
                    bonus = (optional.GradePoint.Value - 2.00m) / compulsory.Count;
                }

                // Rule 4 — truncate, then cap.
                gpa = Math.Min(GradeScale.MaxGpa, GradeScale.Truncate2(basePoints + bonus));
            }

            return new TermResult(
                rows,
                gpa,
                hasFailed || isIncomplete ? "F" : GradeScale.LetterForGpa(gpa),
                !hasFailed && !isIncomplete,
                isIncomplete,
                failed.Select(r => r.Code).ToList(),
                graded.Sum(r => r.Obtained.Value),
                graded.Sum(r => r.FullMarks));
        }
    }

    /// <summary>A ranked entry on a tabulation sheet.</summary>
    public sealed class RankedResult<T>
    {
        internal RankedResult(T subject, TermResult result, int rank)
        {
            Subject = subject;
            Result = result;
            Rank = rank;
        }

        public T Subject { get; }
        public TermResult Result { get; }
        public int Rank { get; }
    }

    /// <summary>
    /// Class-position ranking for a tabulation sheet.
    /// </summary>
    public static class ResultRanker
    {
        /// <summary>
        /// Rank a class by GPA, then by total marks as the tie-break.
        ///
        /// Failed candidates rank below every passing candidate regardless of the
        /// marks they scored — a student who failed one paper does not out-rank a
        /// student who passed everything, whatever their totals say.
        ///
        /// Genuine ties share a rank, and the next rank skips accordingly
        /// (1, 2, 2, 4), which is how the office publishes positions.
        /// </summary>
        public static IReadOnlyList<RankedResult<T>> Rank<T>(IEnumerable<KeyValuePair<T, TermResult>> entries)
        {
            if (entries == null) throw new ArgumentNullException("entries");

            var ordered = entries
                .OrderByDescending(e => e.Value.Passed)
                .ThenByDescending(e => e.Value.Gpa)
                .ThenByDescending(e => e.Value.TotalMarks)
                .ToList();

            var output = new List<RankedResult<T>>(ordered.Count);
            string lastKey = null;
            var lastRank = 0;

            for (var i = 0; i < ordered.Count; i++)
            {
                var e = ordered[i];
                var key = string.Format("{0}|{1}|{2}", e.Value.Passed, e.Value.Gpa, e.Value.TotalMarks);
                var rank = key == lastKey ? lastRank : i + 1;
                lastKey = key;
                lastRank = rank;
                output.Add(new RankedResult<T>(e.Key, e.Value, rank));
            }

            return output;
        }
    }
}
