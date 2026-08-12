using System;
using System.Collections.Generic;
using System.Linq;

namespace SchoolErp.Domain.Grading
{
    /// <summary>
    /// A single band of the SSC/HSC grading table (§7).
    /// </summary>
    public sealed class GradeBand
    {
        public GradeBand(decimal minPercent, decimal maxPercent, string letter, decimal gradePoint, string remark)
        {
            MinPercent = minPercent;
            MaxPercent = maxPercent;
            Letter = letter;
            GradePoint = gradePoint;
            Remark = remark;
        }

        public decimal MinPercent { get; }
        public decimal MaxPercent { get; }
        public string Letter { get; }
        public decimal GradePoint { get; }
        public string Remark { get; }

        public bool Contains(decimal percent)
        {
            return percent >= MinPercent && percent <= MaxPercent;
        }

        public override string ToString()
        {
            return string.Format("{0} ({1:0.00})", Letter, GradePoint);
        }
    }

    /// <summary>
    /// The board grading table from §7 of the requirements.
    ///
    /// Held here as the compiled default so the domain layer is usable without a
    /// database. The production application loads the same rows from
    /// <c>dbo.GradeScale</c> at startup and passes them in, which is what lets a
    /// board revision be a data change rather than a deployment.
    /// </summary>
    public static class GradeScale
    {
        /// <summary>Marks at or above this percentage are a pass (§7).</summary>
        public const decimal PassPercent = 33m;

        /// <summary>The maximum GPA the board publishes.</summary>
        public const decimal MaxGpa = 5.00m;

        private static readonly GradeBand[] DefaultBands =
        {
            new GradeBand(80m, 100m, "A+", 5.00m, "Excellent"),
            new GradeBand(70m, 79m,  "A",  4.00m, "Very Good"),
            new GradeBand(60m, 69m,  "A-", 3.50m, "Good"),
            new GradeBand(50m, 59m,  "B",  3.00m, "Satisfactory"),
            new GradeBand(40m, 49m,  "C",  2.00m, "Average"),
            new GradeBand(33m, 39m,  "D",  1.00m, "Pass"),
            new GradeBand(0m,  32m,  "F",  0.00m, "Fail")
        };

        /// <summary>The default band table, ordered highest to lowest.</summary>
        public static IReadOnlyList<GradeBand> Default
        {
            get { return DefaultBands; }
        }

        /// <summary>
        /// Find the band a percentage falls into. Values outside 0–100 are clamped
        /// rather than rejected, because a data-entry slip should surface as a
        /// visible grade rather than an exception in the middle of a tabulation run.
        /// </summary>
        public static GradeBand BandFor(decimal percent, IReadOnlyList<GradeBand> bands = null)
        {
            var table = bands ?? DefaultBands;
            var clamped = Math.Max(0m, Math.Min(100m, percent));
            for (var i = 0; i < table.Count; i++)
            {
                if (table[i].Contains(clamped)) return table[i];
            }
            // Unreachable with a well-formed table; fall back to the lowest band.
            return table[table.Count - 1];
        }

        /// <summary>
        /// Grade a mark against its subject's full marks. The mark is normalised to
        /// a percentage first, so a 200-mark HSC paper grades on the same scale as
        /// a 100-mark one.
        /// </summary>
        public static GradeBand BandForMark(decimal obtained, decimal fullMarks, IReadOnlyList<GradeBand> bands = null)
        {
            if (fullMarks <= 0) throw new ArgumentOutOfRangeException("fullMarks", "Full marks must be greater than zero.");
            var percent = fullMarks == 100m ? obtained : (obtained / fullMarks) * 100m;
            return BandFor(percent, bands);
        }

        /// <summary>Does this mark clear the 33% pass threshold (§7)?</summary>
        public static bool IsPass(decimal obtained, decimal fullMarks)
        {
            if (fullMarks <= 0) throw new ArgumentOutOfRangeException("fullMarks", "Full marks must be greater than zero.");
            var percent = fullMarks == 100m ? obtained : (obtained / fullMarks) * 100m;
            return percent >= PassPercent;
        }

        /// <summary>
        /// The letter a computed GPA corresponds to on a transcript.
        /// </summary>
        public static string LetterForGpa(decimal gpa)
        {
            if (gpa >= 5.00m) return "A+";
            if (gpa >= 4.00m) return "A";
            if (gpa >= 3.50m) return "A-";
            if (gpa >= 3.00m) return "B";
            if (gpa >= 2.00m) return "C";
            if (gpa >= 1.00m) return "D";
            return "F";
        }

        /// <summary>
        /// Truncate to two decimal places.
        ///
        /// The boards truncate rather than round: a student who computes to 4.999
        /// is published at 4.99, never 5.00. Rounding here would hand out GPA-5s
        /// that the board would not.
        /// </summary>
        public static decimal Truncate2(decimal value)
        {
            return Math.Truncate(value * 100m) / 100m;
        }
    }
}
