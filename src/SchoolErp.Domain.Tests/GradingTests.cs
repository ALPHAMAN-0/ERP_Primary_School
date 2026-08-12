using System;
using System.Collections.Generic;
using System.Linq;
using SchoolErp.Domain.Grading;
using Xunit;

namespace SchoolErp.Domain.Tests
{
    /// <summary>
    /// §7 — the grading rules.
    ///
    /// These are the assertions that keep the C# engine, the browser twin
    /// (docs/assets/js/core/domain.js) and the T-SQL procedure
    /// (usp_ComputeTermResult) saying the same thing.
    /// </summary>
    public class GradingTests
    {
        private static SubjectMark Sub(string code, decimal? obtained, decimal full = 100m, bool optional = false)
        {
            return new SubjectMark(code, code, code, full, obtained, optional);
        }

        // ---- The band table -------------------------------------------------

        [Theory]
        [InlineData(100, "A+", 5.00)]
        [InlineData(80, "A+", 5.00)]
        [InlineData(79, "A", 4.00)]
        [InlineData(70, "A", 4.00)]
        [InlineData(69, "A-", 3.50)]
        [InlineData(60, "A-", 3.50)]
        [InlineData(59, "B", 3.00)]
        [InlineData(50, "B", 3.00)]
        [InlineData(49, "C", 2.00)]
        [InlineData(40, "C", 2.00)]
        [InlineData(39, "D", 1.00)]
        [InlineData(33, "D", 1.00)]
        [InlineData(32, "F", 0.00)]
        [InlineData(0, "F", 0.00)]
        public void Every_band_boundary_maps_to_the_published_grade(int mark, string letter, double gradePoint)
        {
            var band = GradeScale.BandFor(mark);

            Assert.Equal(letter, band.Letter);
            Assert.Equal((decimal)gradePoint, band.GradePoint);
        }

        [Fact]
        public void Thirty_three_passes_and_thirty_two_fails()
        {
            Assert.True(GradeScale.IsPass(33m, 100m));
            Assert.False(GradeScale.IsPass(32m, 100m));
        }

        [Fact]
        public void Marks_are_normalised_against_full_marks_before_banding()
        {
            // An HSC paper out of 200: 160 is 80 percent, so A+.
            Assert.Equal("A+", GradeScale.BandForMark(160m, 200m).Letter);

            // 65 out of 200 is 32.5 percent — below the 33 percent pass mark.
            Assert.False(GradeScale.IsPass(65m, 200m));
            Assert.Equal("F", GradeScale.BandForMark(65m, 200m).Letter);

            // 66 out of 200 is exactly 33 percent, and passes.
            Assert.True(GradeScale.IsPass(66m, 200m));
        }

        [Fact]
        public void Full_marks_of_zero_is_rejected_rather_than_dividing_by_zero()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => GradeScale.BandForMark(50m, 0m));
        }

        // ---- Rule 2: one F fails everything ---------------------------------

        [Fact]
        public void A_single_failed_compulsory_subject_fails_the_whole_result()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 100m), Sub("ENG", 100m), Sub("MAT", 100m),
                Sub("SCI", 100m), Sub("ICT", 30m)   // 30 percent — a fail
            });

            Assert.False(result.Passed);
            Assert.Equal(0.00m, result.Gpa);
            Assert.Equal("F", result.Letter);
            Assert.Equal(new[] { "ICT" }, result.FailedSubjectCodes);
        }

        [Fact]
        public void Multiple_failures_are_all_reported()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 20m), Sub("ENG", 90m), Sub("MAT", 10m)
            });

            Assert.False(result.Passed);
            Assert.Equal(2, result.FailedSubjectCodes.Count);
            Assert.Contains("BAN", result.FailedSubjectCodes);
            Assert.Contains("MAT", result.FailedSubjectCodes);
        }

        [Fact]
        public void Straight_A_plus_gives_the_maximum_gpa()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 90m), Sub("ENG", 85m), Sub("MAT", 92m), Sub("SCI", 88m), Sub("ICT", 95m)
            });

            Assert.True(result.Passed);
            Assert.Equal(5.00m, result.Gpa);
            Assert.Equal("A+", result.Letter);
        }

        // ---- Rule 3: the optional 4th subject -------------------------------

        [Fact]
        public void Optional_subject_adds_only_its_excess_over_two_points()
        {
            // Three compulsory subjects at A (4.00) → base GPA 4.00.
            var withoutOptional = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 70m), Sub("ENG", 70m), Sub("MAT", 70m)
            });
            Assert.Equal(4.00m, withoutOptional.Gpa);

            // Add an A+ optional (5.00): bonus is (5 − 2) / 3 = 1.00.
            var withOptional = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 70m), Sub("ENG", 70m), Sub("MAT", 70m),
                Sub("HMT", 90m, optional: true)
            });
            Assert.Equal(5.00m, withOptional.Gpa);
        }

        [Fact]
        public void Optional_subject_at_exactly_two_points_adds_nothing()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 70m), Sub("ENG", 70m), Sub("MAT", 70m),
                Sub("HMT", 45m, optional: true)   // C = 2.00, no excess
            });

            Assert.Equal(4.00m, result.Gpa);
        }

        [Fact]
        public void Failing_the_optional_subject_does_not_fail_the_student()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 70m), Sub("ENG", 70m), Sub("MAT", 70m),
                Sub("HMT", 10m, optional: true)
            });

            Assert.True(result.Passed);
            Assert.Equal(4.00m, result.Gpa);
            Assert.Empty(result.FailedSubjectCodes);
        }

        [Fact]
        public void Optional_subject_is_excluded_from_the_divisor()
        {
            // Were the optional counted as a fourth subject, three A+ and one C
            // would average (5+5+5+2)/4 = 4.25. Excluded, it is 5.00 base with no
            // bonus, and the cap holds it at 5.00.
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 85m), Sub("ENG", 85m), Sub("MAT", 85m),
                Sub("HMT", 45m, optional: true)
            });

            Assert.Equal(5.00m, result.Gpa);
        }

        // ---- Rule 4: truncation and the cap ---------------------------------

        [Fact]
        public void Gpa_is_truncated_not_rounded()
        {
            Assert.Equal(4.99m, GradeScale.Truncate2(4.999m));
            Assert.Equal(4.99m, GradeScale.Truncate2(4.9999999m));
            Assert.Equal(3.33m, GradeScale.Truncate2(3.3399m));
        }

        [Fact]
        public void Truncation_changes_the_published_gpa()
        {
            // Two A+ and one A: (5 + 5 + 4) / 3 = 4.6666… → published 4.66, not 4.67.
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 90m), Sub("ENG", 90m), Sub("MAT", 75m)
            });

            Assert.Equal(4.66m, result.Gpa);
        }

        [Fact]
        public void Gpa_never_exceeds_five_even_with_a_strong_optional()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 100m), Sub("ENG", 100m), Sub("MAT", 100m),
                Sub("HMT", 100m, optional: true)
            });

            Assert.Equal(5.00m, result.Gpa);
        }

        // ---- Totals and edge cases ------------------------------------------

        [Fact]
        public void Totals_sum_across_mixed_full_marks()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("PHY", 150m, 200m), Sub("ICT", 60m, 100m)
            });

            Assert.Equal(210m, result.TotalMarks);
            Assert.Equal(300m, result.TotalFullMarks);
            Assert.Equal(70.00m, result.Percent);
        }

        [Fact]
        public void Unsat_papers_are_excluded_from_totals_but_kept_as_rows()
        {
            var result = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 70m), Sub("ENG", null), Sub("MAT", 80m)
            });

            Assert.Equal(3, result.Rows.Count);
            Assert.Equal(2, result.SubjectCount);
            Assert.Equal(150m, result.TotalMarks);
            Assert.Equal("—", result.Rows.Single(r => r.Code == "ENG").Letter);
        }

        [Fact]
        public void A_result_with_no_marks_at_all_is_incomplete_not_failed()
        {
            var result = ResultCalculator.Compute(new[] { Sub("BAN", null), Sub("ENG", null) });

            Assert.True(result.IsIncomplete);
            Assert.False(result.Passed);
            Assert.Equal(0.00m, result.Gpa);
        }

        [Fact]
        public void An_optional_subject_alone_is_still_incomplete()
        {
            // A candidate cannot pass on the 4th subject alone; there is no divisor.
            var result = ResultCalculator.Compute(new[] { Sub("HMT", 90m, optional: true) });

            Assert.True(result.IsIncomplete);
            Assert.False(result.Passed);
        }

        [Fact]
        public void Null_input_is_rejected()
        {
            Assert.Throws<ArgumentNullException>(() => ResultCalculator.Compute(null));
        }

        // ---- Ranking ---------------------------------------------------------

        [Fact]
        public void Failed_candidates_rank_below_every_passing_candidate()
        {
            var strongFail = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 100m), Sub("ENG", 100m), Sub("MAT", 20m)   // huge total, one fail
            });
            var weakPass = ResultCalculator.Compute(new[]
            {
                Sub("BAN", 40m), Sub("ENG", 40m), Sub("MAT", 40m)     // small total, all passed
            });

            var ranked = ResultRanker.Rank(new[]
            {
                new KeyValuePair<string, TermResult>("failed-but-high-marks", strongFail),
                new KeyValuePair<string, TermResult>("passed-but-low-marks", weakPass)
            });

            Assert.Equal("passed-but-low-marks", ranked[0].Subject);
            Assert.Equal(1, ranked[0].Rank);
            Assert.Equal("failed-but-high-marks", ranked[1].Subject);
        }

        [Fact]
        public void Identical_results_share_a_rank_and_the_next_rank_skips()
        {
            TermResult Same() => ResultCalculator.Compute(new[] { Sub("BAN", 80m), Sub("ENG", 80m) });
            var lower = ResultCalculator.Compute(new[] { Sub("BAN", 50m), Sub("ENG", 50m) });

            var ranked = ResultRanker.Rank(new[]
            {
                new KeyValuePair<string, TermResult>("a", Same()),
                new KeyValuePair<string, TermResult>("b", Same()),
                new KeyValuePair<string, TermResult>("c", lower)
            });

            Assert.Equal(1, ranked[0].Rank);
            Assert.Equal(1, ranked[1].Rank);
            Assert.Equal(3, ranked[2].Rank);   // 2 is skipped, as the office publishes it
        }

        [Fact]
        public void Total_marks_break_a_gpa_tie()
        {
            // Both land in the A+ band, so both are GPA 5.00 — totals decide.
            var higher = ResultCalculator.Compute(new[] { Sub("BAN", 95m), Sub("ENG", 95m) });
            var lower = ResultCalculator.Compute(new[] { Sub("BAN", 82m), Sub("ENG", 82m) });

            var ranked = ResultRanker.Rank(new[]
            {
                new KeyValuePair<string, TermResult>("lower", lower),
                new KeyValuePair<string, TermResult>("higher", higher)
            });

            Assert.Equal("higher", ranked[0].Subject);
            Assert.Equal(5.00m, ranked[0].Result.Gpa);
            Assert.Equal(5.00m, ranked[1].Result.Gpa);
        }
    }
}
