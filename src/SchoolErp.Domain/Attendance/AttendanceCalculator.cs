using System;
using System.Collections.Generic;
using System.Linq;

namespace SchoolErp.Domain.Attendance
{
    /// <summary>Attendance states recorded by the register (§6).</summary>
    public enum AttendanceStatus
    {
        Present = 'P',
        Absent = 'A',
        Late = 'L',
        Excused = 'E'
    }

    /// <summary>
    /// §6 — the school section records attendance once a day; the college section
    /// records it per teaching period, because that is what HSC board eligibility
    /// is assessed on. The mode is a property of the grade, not a setting.
    /// </summary>
    public enum AttendanceMode
    {
        Daily = 0,
        Period = 1
    }

    /// <summary>How a student's attendance stands against the board threshold.</summary>
    public enum EligibilityLevel
    {
        NotEligible = 0,
        AtRisk = 1,
        Eligible = 2
    }

    /// <summary>One attendance record, as stored.</summary>
    public sealed class AttendanceRecord
    {
        public AttendanceRecord(DateTime date, AttendanceStatus status, byte period = 0)
        {
            Date = date.Date;
            Status = status;
            Period = period;
        }

        public DateTime Date { get; }
        public AttendanceStatus Status { get; }

        /// <summary>0 for the school section's daily record; 1–8 for period-wise.</summary>
        public byte Period { get; }
    }

    /// <summary>The roll-up a portal, report card or eligibility check reads.</summary>
    public sealed class AttendanceSummary
    {
        internal AttendanceSummary(int total, int present, int absent, int late, int excused, int threshold)
        {
            Total = total;
            Present = present;
            Absent = absent;
            Late = late;
            Excused = excused;
            Threshold = threshold;

            Percent = total == 0
                ? 0m
                : Math.Truncate(((decimal)present / total) * 10000m) / 100m;

            IsEligible = Percent >= threshold;

            // How many more present days would clear the threshold, assuming the
            // total does not grow. Useful precisely because it is actionable —
            // "you need 9 more days" is guidance; "you are at 64%" is not.
            Shortfall = IsEligible
                ? 0
                : (int)Math.Ceiling(((decimal)threshold / 100m) * total - present);
        }

        public int Total { get; }
        public int Present { get; }
        public int Absent { get; }
        public int Late { get; }
        public int Excused { get; }
        public int Threshold { get; }
        public decimal Percent { get; }
        public bool IsEligible { get; }
        public int Shortfall { get; }
    }

    /// <summary>
    /// Attendance rules (§6).
    ///
    /// The C# counterpart of <c>summariseAttendance()</c> in
    /// <c>docs/assets/js/core/domain.js</c> and of <c>dbo.vw_AttendanceSummary</c>.
    /// </summary>
    public static class AttendanceCalculator
    {
        /// <summary>
        /// The HSC board will not forward a candidate below this percentage (§6).
        /// </summary>
        public const int BoardEligibilityThreshold = 70;

        /// <summary>
        /// Summarise a set of records.
        ///
        /// Late counts as present. The board measures presence, not punctuality —
        /// a student who arrived at 09:10 was in the room. Excused absence does not
        /// count as present: the leave was granted, but the candidate was not there,
        /// and the board counts bodies.
        /// </summary>
        public static AttendanceSummary Summarise(
            IEnumerable<AttendanceRecord> records,
            int threshold = BoardEligibilityThreshold)
        {
            if (records == null) throw new ArgumentNullException("records");

            var list = records as IList<AttendanceRecord> ?? records.ToList();

            var present = 0;
            var absent = 0;
            var late = 0;
            var excused = 0;

            foreach (var r in list)
            {
                switch (r.Status)
                {
                    case AttendanceStatus.Present:
                        present++;
                        break;
                    case AttendanceStatus.Late:
                        present++;
                        late++;
                        break;
                    case AttendanceStatus.Absent:
                        absent++;
                        break;
                    case AttendanceStatus.Excused:
                        excused++;
                        break;
                }
            }

            return new AttendanceSummary(list.Count, present, absent, late, excused, threshold);
        }

        /// <summary>
        /// Bucket a percentage for display. The band boundaries are what the
        /// watchlist colours and sorts on.
        /// </summary>
        public static EligibilityLevel Classify(decimal percent, int threshold = BoardEligibilityThreshold)
        {
            if (percent >= threshold) return EligibilityLevel.Eligible;
            if (percent >= 60m) return EligibilityLevel.AtRisk;
            return EligibilityLevel.NotEligible;
        }

        /// <summary>Parse the single-character code stored in <c>dbo.Attendance</c>.</summary>
        public static AttendanceStatus FromCode(char code)
        {
            switch (char.ToUpperInvariant(code))
            {
                case 'P': return AttendanceStatus.Present;
                case 'A': return AttendanceStatus.Absent;
                case 'L': return AttendanceStatus.Late;
                case 'E': return AttendanceStatus.Excused;
                default:
                    throw new ArgumentOutOfRangeException("code", code, "Unknown attendance status code.");
            }
        }

        public static char ToCode(AttendanceStatus status)
        {
            return (char)status;
        }
    }
}
