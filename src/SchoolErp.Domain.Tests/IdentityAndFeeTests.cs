using System;
using System.Collections.Generic;
using System.Linq;
using SchoolErp.Domain.Attendance;
using SchoolErp.Domain.Common;
using SchoolErp.Domain.Fees;
using SchoolErp.Domain.Identity;
using Xunit;

namespace SchoolErp.Domain.Tests
{
    /// <summary>§8 — the permanent student identifier.</summary>
    public class StudentIdentifierTests
    {
        [Fact]
        public void Formats_as_year_month_serial()
        {
            // The worked example from §8: the 5th student admitted in August 2026.
            Assert.Equal("26080005", StudentIdentifier.Create(new DateTime(2026, 8, 3), 5));
        }

        [Theory]
        [InlineData(2026, 1, 1, "26010001")]
        [InlineData(2026, 12, 9999, "26129999")]
        [InlineData(2005, 7, 42, "05070042")]
        [InlineData(2099, 11, 1234, "99111234")]
        public void Pads_every_component(int year, int month, int serial, string expected)
        {
            Assert.Equal(expected, StudentIdentifier.Create(new DateTime(year, month, 15), serial));
        }

        [Fact]
        public void Round_trips_through_parse()
        {
            var parts = StudentIdentifier.Parse("26080005");

            Assert.NotNull(parts);
            Assert.Equal(2026, parts.Year);
            Assert.Equal(8, parts.Month);
            Assert.Equal(5, parts.Serial);
            Assert.Equal("2608", parts.YearMonthKey);
            Assert.Equal("August 2026", parts.AdmittedLabel);
        }

        [Theory]
        [InlineData("2608000")]     // too short
        [InlineData("260800055")]   // too long
        [InlineData("2608000a")]    // not numeric
        [InlineData("26130001")]    // month 13
        [InlineData("26000001")]    // month 0
        [InlineData("26080000")]    // serial 0
        [InlineData("")]
        [InlineData(null)]
        public void Rejects_malformed_identifiers(string candidate)
        {
            Assert.Null(StudentIdentifier.Parse(candidate));
            Assert.False(StudentIdentifier.IsValid(candidate));
        }

        [Theory]
        [InlineData(0)]
        [InlineData(-1)]
        [InlineData(10000)]
        public void Refuses_serials_outside_the_monthly_capacity(int serial)
        {
            // Wrapping silently would hand out a duplicate identifier, which §8
            // forbids outright — so this throws rather than degrades.
            Assert.Throws<ArgumentOutOfRangeException>(
                () => StudentIdentifier.Create(new DateTime(2026, 8, 1), serial));
        }

        [Fact]
        public void Year_month_key_matches_the_bucket_the_serial_is_drawn_from()
        {
            var date = new DateTime(2026, 8, 20);
            var key = StudentIdentifier.YearMonthKey(date);

            Assert.Equal("2608", key);
            Assert.Equal(key, StudentIdentifier.Create(date, 1).Substring(0, 4));
        }
    }

    /// <summary>§6 — attendance and board eligibility.</summary>
    public class AttendanceTests
    {
        private static AttendanceRecord R(AttendanceStatus s)
        {
            return new AttendanceRecord(new DateTime(2026, 8, 12), s);
        }

        [Fact]
        public void Late_counts_as_present_because_the_board_measures_presence()
        {
            var summary = AttendanceCalculator.Summarise(new[] { R(AttendanceStatus.Late) });

            Assert.Equal(100m, summary.Percent);
            Assert.Equal(1, summary.Present);
            Assert.Equal(1, summary.Late);
        }

        [Fact]
        public void Excused_absence_does_not_count_as_present()
        {
            var summary = AttendanceCalculator.Summarise(new[] { R(AttendanceStatus.Excused) });

            Assert.Equal(0m, summary.Percent);
            Assert.Equal(1, summary.Excused);
            Assert.Equal(0, summary.Absent);
        }

        [Fact]
        public void Summarises_a_mixed_register()
        {
            var records = new List<AttendanceRecord>();
            for (var i = 0; i < 70; i++) records.Add(R(AttendanceStatus.Present));
            for (var i = 0; i < 10; i++) records.Add(R(AttendanceStatus.Late));
            for (var i = 0; i < 15; i++) records.Add(R(AttendanceStatus.Absent));
            for (var i = 0; i < 5; i++) records.Add(R(AttendanceStatus.Excused));

            var summary = AttendanceCalculator.Summarise(records);

            Assert.Equal(100, summary.Total);
            Assert.Equal(80, summary.Present);
            Assert.Equal(80m, summary.Percent);
            Assert.True(summary.IsEligible);
            Assert.Equal(0, summary.Shortfall);
        }

        [Fact]
        public void Seventy_percent_is_eligible_and_anything_below_is_not()
        {
            var at70 = AttendanceCalculator.Summarise(
                Enumerable.Repeat(R(AttendanceStatus.Present), 70)
                    .Concat(Enumerable.Repeat(R(AttendanceStatus.Absent), 30)));

            var at69 = AttendanceCalculator.Summarise(
                Enumerable.Repeat(R(AttendanceStatus.Present), 69)
                    .Concat(Enumerable.Repeat(R(AttendanceStatus.Absent), 31)));

            Assert.True(at70.IsEligible);
            Assert.False(at69.IsEligible);
            Assert.Equal(EligibilityLevel.Eligible, AttendanceCalculator.Classify(at70.Percent));
            Assert.Equal(EligibilityLevel.AtRisk, AttendanceCalculator.Classify(at69.Percent));
        }

        [Fact]
        public void Shortfall_says_how_many_more_days_are_needed()
        {
            // 60 of 100 present; 70 are needed, so 10 more.
            var summary = AttendanceCalculator.Summarise(
                Enumerable.Repeat(R(AttendanceStatus.Present), 60)
                    .Concat(Enumerable.Repeat(R(AttendanceStatus.Absent), 40)));

            Assert.False(summary.IsEligible);
            Assert.Equal(10, summary.Shortfall);
        }

        [Fact]
        public void An_empty_register_does_not_divide_by_zero()
        {
            var summary = AttendanceCalculator.Summarise(new AttendanceRecord[0]);

            Assert.Equal(0, summary.Total);
            Assert.Equal(0m, summary.Percent);
        }

        [Fact]
        public void Below_sixty_percent_is_not_eligible_rather_than_at_risk()
        {
            Assert.Equal(EligibilityLevel.NotEligible, AttendanceCalculator.Classify(59.9m));
            Assert.Equal(EligibilityLevel.AtRisk, AttendanceCalculator.Classify(60m));
        }

        [Theory]
        [InlineData('P', AttendanceStatus.Present)]
        [InlineData('A', AttendanceStatus.Absent)]
        [InlineData('L', AttendanceStatus.Late)]
        [InlineData('E', AttendanceStatus.Excused)]
        public void Status_codes_round_trip_to_the_database_representation(char code, AttendanceStatus expected)
        {
            Assert.Equal(expected, AttendanceCalculator.FromCode(code));
            Assert.Equal(code, AttendanceCalculator.ToCode(expected));
        }

        [Fact]
        public void An_unknown_status_code_is_rejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => AttendanceCalculator.FromCode('X'));
        }
    }

    /// <summary>§11 — fee arithmetic.</summary>
    public class FeeTests
    {
        [Fact]
        public void A_full_waiver_leaves_nothing_payable()
        {
            var applied = FeeCalculator.ApplyWaiver(12000m, "MERIT");

            Assert.Equal(12000m, applied.Discount);
            Assert.Equal(0m, applied.Payable);
        }

        [Fact]
        public void A_half_waiver_halves_the_bill()
        {
            var applied = FeeCalculator.ApplyWaiver(12000m, "MERIT50");

            Assert.Equal(6000m, applied.Discount);
            Assert.Equal(6000m, applied.Payable);
        }

        [Fact]
        public void Gross_always_reconciles_to_discount_plus_payable()
        {
            // The property that matters: no rounding residue may escape, at any
            // waiver percentage or any amount.
            foreach (var waiver in Waivers.All)
            {
                for (var gross = 1m; gross <= 3000m; gross += 137m)
                {
                    var applied = FeeCalculator.ApplyWaiver(gross, waiver);
                    Assert.Equal(gross, applied.Discount + applied.Payable);
                }
            }
        }

        [Fact]
        public void An_unknown_waiver_code_falls_back_to_none_rather_than_throwing()
        {
            var applied = FeeCalculator.ApplyWaiver(1000m, "NOT-A-REAL-CODE");

            Assert.Equal(0m, applied.Discount);
            Assert.Equal(1000m, applied.Payable);
            Assert.Equal("NONE", applied.Waiver.Code);
        }

        [Fact]
        public void A_waiver_outside_zero_to_hundred_percent_is_rejected()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new Waiver("BAD", "Bad", 150m));
            Assert.Throws<ArgumentOutOfRangeException>(() => new Waiver("BAD", "Bad", -1m));
        }

        [Theory]
        [InlineData(0, 0)]
        [InlineData(-3, 0)]
        [InlineData(1, 20)]
        [InlineData(5, 100)]
        [InlineData(10, 200)]
        [InlineData(11, 200)]   // capped
        [InlineData(60, 200)]   // still capped
        public void Late_fine_accrues_monthly_and_caps_at_two_hundred(int months, int expected)
        {
            Assert.Equal(expected, FeeCalculator.LateFine(months));
        }

        [Fact]
        public void Tuition_rises_with_grade_level()
        {
            Assert.Equal(700m, FeeCalculator.MonthlyTuition(0));    // KG
            Assert.Equal(1500m, FeeCalculator.MonthlyTuition(10));  // Class 10
            Assert.Equal(1900m, FeeCalculator.MonthlyTuition(12));  // Class 12
            Assert.Equal(0m, FeeCalculator.MonthlyTuition(99));     // unknown level
        }

        [Fact]
        public void Invoice_status_follows_what_has_been_received()
        {
            Assert.Equal(InvoiceStatus.Unpaid, FeeCalculator.StatusFor(1000m, 0m));
            Assert.Equal(InvoiceStatus.Partial, FeeCalculator.StatusFor(1000m, 400m));
            Assert.Equal(InvoiceStatus.Paid, FeeCalculator.StatusFor(1000m, 1000m));
            Assert.Equal(InvoiceStatus.Paid, FeeCalculator.StatusFor(1000m, 1200m));  // overpayment
        }

        [Fact]
        public void Months_overdue_counts_only_completed_months()
        {
            var due = new DateTime(2026, 5, 10);

            Assert.Equal(0, FeeCalculator.MonthsOverdue(due, new DateTime(2026, 5, 10)));
            Assert.Equal(0, FeeCalculator.MonthsOverdue(due, new DateTime(2026, 6, 9)));   // a day short
            Assert.Equal(1, FeeCalculator.MonthsOverdue(due, new DateTime(2026, 6, 10)));
            Assert.Equal(3, FeeCalculator.MonthsOverdue(due, new DateTime(2026, 8, 12)));
            Assert.Equal(0, FeeCalculator.MonthsOverdue(due, new DateTime(2026, 4, 1)));   // not yet due
        }
    }

    /// <summary>§13 — Bangla output for student-facing documents.</summary>
    public class BanglaFormatterTests
    {
        [Fact]
        public void Digits_convert_to_bangla_numerals()
        {
            Assert.Equal("২০২৬", BanglaFormatter.ToBanglaDigits("2026"));
            Assert.Equal("০১৭১২৩৪৫৬৭৮", BanglaFormatter.ToBanglaDigits("01712345678"));
        }

        [Fact]
        public void Non_digits_are_left_alone()
        {
            Assert.Equal("৪.৫০", BanglaFormatter.ToBanglaDigits("4.50"));
            Assert.Equal("GPA ৫.০০", BanglaFormatter.ToBanglaDigits("GPA 5.00"));
        }

        [Fact]
        public void Dates_render_in_bangla()
        {
            Assert.Equal("১২ আগস্ট ২০২৬", BanglaFormatter.FormatDate(new DateTime(2026, 8, 12)));
        }

        [Theory]
        [InlineData(600, "৳600")]
        [InlineData(5000, "৳5,000")]
        [InlineData(150000, "৳1,50,000")]
        [InlineData(28401600, "৳2,84,01,600")]
        [InlineData(0, "৳0")]
        public void Taka_uses_south_asian_digit_grouping(int amount, string expected)
        {
            // ৳1,50,000 rather than ৳150,000 — the grouping a receipt here uses.
            Assert.Equal(expected, BanglaFormatter.FormatTaka(amount));
        }

        [Fact]
        public void Negative_amounts_carry_a_minus_sign()
        {
            Assert.Equal("−৳1,200", BanglaFormatter.FormatTaka(-1200m));
        }

        [Fact]
        public void Decimals_are_kept_when_asked_for()
        {
            Assert.Equal("৳1,234.56", BanglaFormatter.FormatTaka(1234.56m, 2));
        }

        [Fact]
        public void Amounts_can_be_rendered_wholly_in_bangla()
        {
            Assert.Equal("৳১,৫০,০০০", BanglaFormatter.FormatTaka(150000m, 0, banglaDigits: true));
        }
    }

    /// <summary>The Sunday–Thursday working week.</summary>
    public class AcademicCalendarTests
    {
        [Theory]
        [InlineData(2026, 8, 9, true)]    // Sunday
        [InlineData(2026, 8, 10, true)]   // Monday
        [InlineData(2026, 8, 13, true)]   // Thursday
        [InlineData(2026, 8, 14, false)]  // Friday
        [InlineData(2026, 8, 15, false)]  // Saturday
        public void The_week_runs_sunday_to_thursday(int y, int m, int d, bool isWorking)
        {
            Assert.Equal(isWorking, AcademicCalendar.IsWorkingDay(new DateTime(y, m, d)));
        }

        [Fact]
        public void August_2026_has_twenty_two_working_days()
        {
            Assert.Equal(22, AcademicCalendar.WorkingDaysIn(2026, 8).Count);
        }

        [Fact]
        public void Working_days_in_a_range_are_counted_inclusively()
        {
            // Sunday 9 August to Thursday 13 August is five working days.
            Assert.Equal(5, AcademicCalendar.CountWorkingDays(
                new DateTime(2026, 8, 9), new DateTime(2026, 8, 13)));

            // A reversed range is zero, not negative.
            Assert.Equal(0, AcademicCalendar.CountWorkingDays(
                new DateTime(2026, 8, 13), new DateTime(2026, 8, 9)));
        }

        [Fact]
        public void Age_counts_completed_years()
        {
            var dob = new DateTime(2010, 8, 20);

            Assert.Equal(16, AcademicCalendar.AgeOn(dob, new DateTime(2026, 8, 20)));  // birthday
            Assert.Equal(16, AcademicCalendar.AgeOn(dob, new DateTime(2026, 8, 21)));
            Assert.Equal(16, AcademicCalendar.AgeOn(dob, new DateTime(2026, 12, 31)));
            Assert.Equal(15, AcademicCalendar.AgeOn(dob, new DateTime(2026, 8, 19)));  // day before
            Assert.Equal(15, AcademicCalendar.AgeOn(dob, new DateTime(2026, 1, 1)));   // earlier month
        }
    }
}
