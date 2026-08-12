using System;
using System.Globalization;
using System.Text;

namespace SchoolErp.Domain.Common
{
    /// <summary>
    /// Bangla rendering for student-facing documents (§13).
    ///
    /// Admin and teacher screens stay in English. Report cards, admit cards,
    /// certificates and receipts must render in Bangla, which means Bangla
    /// numerals and Bangla month names as well as Bangla names — a transcript
    /// showing "৪.৫০" beside "12 August 2026" reads as half-translated.
    /// </summary>
    public static class BanglaFormatter
    {
        private static readonly char[] BanglaDigits =
        {
            '০', '১', '২', '৩', '৪',
            '৫', '৬', '৭', '৮', '৯'
        };

        private static readonly string[] BanglaMonths =
        {
            "জানুয়ারি",              // January
            "ফেব্রুয়ারি",  // February
            "মার্চ",                                // March
            "এপ্রিল",                          // April
            "মে",                                                  // May
            "জুন",                                            // June
            "জুলাই",                                // July
            "আগস্ট",                                // August
            "সেপ্টেম্বর",  // September
            "অক্টোবর",                    // October
            "নভেম্বর",                    // November
            "ডিসেম্বর"               // December
        };

        /// <summary>The taka sign, U+09F3.</summary>
        public const string TakaSign = "৳";

        /// <summary>
        /// Convert the ASCII digits in a string to Bangla numerals, leaving
        /// everything else — decimal points, separators, letters — untouched.
        /// </summary>
        public static string ToBanglaDigits(string value)
        {
            if (string.IsNullOrEmpty(value)) return value;

            var sb = new StringBuilder(value.Length);
            foreach (var c in value)
            {
                sb.Append(c >= '0' && c <= '9' ? BanglaDigits[c - '0'] : c);
            }
            return sb.ToString();
        }

        public static string ToBanglaDigits(int value)
        {
            return ToBanglaDigits(value.ToString(CultureInfo.InvariantCulture));
        }

        public static string ToBanglaDigits(decimal value, int decimals = 2)
        {
            return ToBanglaDigits(value.ToString("F" + decimals, CultureInfo.InvariantCulture));
        }

        public static string MonthName(int month)
        {
            if (month < 1 || month > 12) throw new ArgumentOutOfRangeException("month");
            return BanglaMonths[month - 1];
        }

        /// <summary>Render a date in Bangla, e.g. "১২ আগস্ট ২০২৬".</summary>
        public static string FormatDate(DateTime date)
        {
            return string.Format(
                "{0} {1} {2}",
                ToBanglaDigits(date.Day),
                MonthName(date.Month),
                ToBanglaDigits(date.Year));
        }

        /// <summary>
        /// Format an amount in taka using South Asian digit grouping: the last
        /// three digits, then pairs — ৳1,50,000 rather than ৳150,000. Getting this
        /// wrong is immediately visible to anyone reading a receipt here.
        /// </summary>
        public static string FormatTaka(decimal amount, int decimals = 0, bool banglaDigits = false)
        {
            var negative = amount < 0m;
            var abs = Math.Abs(amount);

            var fixedText = abs.ToString("F" + decimals, CultureInfo.InvariantCulture);
            var parts = fixedText.Split('.');
            var integerPart = parts[0];
            var decimalPart = parts.Length > 1 ? parts[1] : null;

            string grouped;
            if (integerPart.Length > 3)
            {
                var last3 = integerPart.Substring(integerPart.Length - 3);
                var rest = integerPart.Substring(0, integerPart.Length - 3);

                var sb = new StringBuilder();
                var count = 0;
                for (var i = rest.Length - 1; i >= 0; i--)
                {
                    sb.Insert(0, rest[i]);
                    count++;
                    if (count % 2 == 0 && i > 0) sb.Insert(0, ',');
                }
                grouped = sb + "," + last3;
            }
            else
            {
                grouped = integerPart;
            }

            var body = decimalPart != null ? grouped + "." + decimalPart : grouped;
            if (banglaDigits) body = ToBanglaDigits(body);

            return (negative ? "−" : string.Empty) + TakaSign + body;
        }
    }
}
