using System;
using System.Collections.Generic;

namespace SchoolErp.Domain.Common
{
    /// <summary>
    /// The institution's working week.
    ///
    /// Bangladesh schools run Sunday to Thursday; Friday and Saturday are the
    /// weekend. Every attendance calculation depends on this, so it lives in one
    /// place rather than being re-derived per screen.
    /// </summary>
    public static class AcademicCalendar
    {
        public static bool IsWorkingDay(DateTime date)
        {
            var d = date.DayOfWeek;
            return d != DayOfWeek.Friday && d != DayOfWeek.Saturday;
        }

        /// <summary>Every working day in a calendar month.</summary>
        public static IReadOnlyList<DateTime> WorkingDaysIn(int year, int month)
        {
            var days = new List<DateTime>();
            var cursor = new DateTime(year, month, 1);
            while (cursor.Month == month)
            {
                if (IsWorkingDay(cursor)) days.Add(cursor);
                cursor = cursor.AddDays(1);
            }
            return days;
        }

        /// <summary>Working days in a closed date range, inclusive of both ends.</summary>
        public static int CountWorkingDays(DateTime from, DateTime to)
        {
            if (to < from) return 0;

            var count = 0;
            for (var cursor = from.Date; cursor <= to.Date; cursor = cursor.AddDays(1))
            {
                if (IsWorkingDay(cursor)) count++;
            }
            return count;
        }

        /// <summary>
        /// A student's age on a given date, counting completed years — the figure
        /// an admission register records.
        /// </summary>
        public static int AgeOn(DateTime dateOfBirth, DateTime asOf)
        {
            var age = asOf.Year - dateOfBirth.Year;
            if (asOf.Month < dateOfBirth.Month ||
                (asOf.Month == dateOfBirth.Month && asOf.Day < dateOfBirth.Day))
            {
                age--;
            }
            return age;
        }
    }
}
