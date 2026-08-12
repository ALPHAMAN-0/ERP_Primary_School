using System;
using System.Globalization;

namespace SchoolErp.Domain.Identity
{
    /// <summary>The parts a student identifier decomposes into.</summary>
    public sealed class StudentIdentifierParts
    {
        internal StudentIdentifierParts(int year, int month, int serial)
        {
            Year = year;
            Month = month;
            Serial = serial;
        }

        public int Year { get; }
        public int Month { get; }
        public int Serial { get; }

        /// <summary>The month bucket the serial was drawn from, e.g. "2608".</summary>
        public string YearMonthKey
        {
            get { return string.Format("{0:00}{1:00}", Year % 100, Month); }
        }

        public string AdmittedLabel
        {
            get
            {
                return string.Format(
                    "{0} {1}",
                    CultureInfo.InvariantCulture.DateTimeFormat.GetMonthName(Month),
                    Year);
            }
        }
    }

    /// <summary>
    /// The permanent student identifier (§8).
    ///
    /// Format <c>YYMMSSSS</c>: two-digit year, two-digit month, four-digit serial
    /// scoped to that month — 9,999 admissions per month.
    ///
    /// The requirement that identifiers are never reused, including after
    /// graduation or withdrawal, is not enforced here: this class only formats and
    /// parses. It is enforced structurally, in two places:
    ///
    ///   • <c>dbo.StudentIdSequence</c> holds one monotonic counter per month, and
    ///     <c>usp_AllocateStudentId</c> takes UPDLOCK/HOLDLOCK on that row inside a
    ///     transaction so two clerks admitting at the same moment cannot receive
    ///     the same number.
    ///   • <c>StudentId</c> is the primary key of <c>dbo.Students</c>, so the
    ///     database itself refuses a duplicate.
    /// </summary>
    public static class StudentIdentifier
    {
        /// <summary>Serials available per admission month.</summary>
        public const int MonthlyCapacity = 9999;

        public const string Format = "YYMMSSSS";

        /// <summary>
        /// Build an identifier for an admission date and an allocated serial.
        /// </summary>
        /// <exception cref="ArgumentOutOfRangeException">
        /// The serial is outside 1..9999 — the month's capacity is exhausted and the
        /// caller must escalate rather than silently wrap.
        /// </exception>
        public static string Create(DateTime admissionDate, int serial)
        {
            if (serial < 1 || serial > MonthlyCapacity)
            {
                throw new ArgumentOutOfRangeException(
                    "serial",
                    serial,
                    string.Format(
                        "Serial must be between 1 and {0}. The monthly admission capacity for {1:MMMM yyyy} is exhausted.",
                        MonthlyCapacity,
                        admissionDate));
            }

            return string.Format(
                CultureInfo.InvariantCulture,
                "{0:00}{1:00}{2:0000}",
                admissionDate.Year % 100,
                admissionDate.Month,
                serial);
        }

        /// <summary>
        /// Decompose an identifier. Returns null when the value is not a
        /// well-formed identifier, so callers can treat a search box entry as
        /// "maybe an ID, maybe a name" without exception handling.
        /// </summary>
        public static StudentIdentifierParts Parse(string studentId)
        {
            if (string.IsNullOrEmpty(studentId) || studentId.Length != 8) return null;

            for (var i = 0; i < studentId.Length; i++)
            {
                if (!char.IsDigit(studentId[i])) return null;
            }

            var yy = int.Parse(studentId.Substring(0, 2), CultureInfo.InvariantCulture);
            var mm = int.Parse(studentId.Substring(2, 2), CultureInfo.InvariantCulture);
            var serial = int.Parse(studentId.Substring(4, 4), CultureInfo.InvariantCulture);

            if (mm < 1 || mm > 12) return null;
            if (serial < 1) return null;

            return new StudentIdentifierParts(2000 + yy, mm, serial);
        }

        public static bool IsValid(string studentId)
        {
            return Parse(studentId) != null;
        }

        /// <summary>The month bucket key an admission date draws its serial from.</summary>
        public static string YearMonthKey(DateTime admissionDate)
        {
            return string.Format(
                CultureInfo.InvariantCulture,
                "{0:00}{1:00}",
                admissionDate.Year % 100,
                admissionDate.Month);
        }
    }
}
