using System;
using System.Collections.Generic;
using System.Linq;

namespace SchoolErp.Domain.Fees
{
    /// <summary>A concession the office grants, as a percentage of tuition (§11).</summary>
    public sealed class Waiver
    {
        public Waiver(string code, string name, decimal percent)
        {
            if (percent < 0m || percent > 100m)
                throw new ArgumentOutOfRangeException("percent", percent, "A waiver must be between 0 and 100 percent.");

            Code = code;
            Name = name;
            Percent = percent;
        }

        public string Code { get; }
        public string Name { get; }
        public decimal Percent { get; }
    }

    /// <summary>The catalogue of waivers, mirroring <c>dbo.Waivers</c>.</summary>
    public static class Waivers
    {
        public static readonly Waiver None = new Waiver("NONE", "None", 0m);

        private static readonly Waiver[] AllWaivers =
        {
            None,
            new Waiver("MERIT", "Merit Scholarship", 100m),
            new Waiver("MERIT50", "Merit (Half-Free)", 50m),
            new Waiver("SIBLING", "Sibling Discount", 25m),
            new Waiver("FREEDOM", "Freedom Fighter Quota", 100m),
            new Waiver("HARDSHIP", "Hardship Waiver", 50m)
        };

        public static IReadOnlyList<Waiver> All
        {
            get { return AllWaivers; }
        }

        public static Waiver ByCode(string code)
        {
            if (string.IsNullOrEmpty(code)) return None;
            return AllWaivers.FirstOrDefault(w =>
                string.Equals(w.Code, code, StringComparison.OrdinalIgnoreCase)) ?? None;
        }
    }

    /// <summary>The outcome of applying a waiver to an amount.</summary>
    public sealed class WaiverApplication
    {
        internal WaiverApplication(Waiver waiver, decimal gross, decimal discount, decimal payable)
        {
            Waiver = waiver;
            Gross = gross;
            Discount = discount;
            Payable = payable;
        }

        public Waiver Waiver { get; }
        public decimal Gross { get; }
        public decimal Discount { get; }
        public decimal Payable { get; }
    }

    /// <summary>
    /// Fee arithmetic (§11).
    ///
    /// Every amount is <see cref="decimal"/>, never double. A fee ledger that
    /// drifts by a paisa per invoice is a ledger the accountant stops trusting.
    /// </summary>
    public static class FeeCalculator
    {
        /// <summary>Late fine per month overdue, in BDT (office policy).</summary>
        public const decimal LateFinePerMonth = 20m;

        /// <summary>The cap on accumulated late fines, in BDT.</summary>
        public const decimal LateFineCap = 200m;

        /// <summary>
        /// Monthly tuition by grade level, 0 = KG through 12. Held here as the
        /// compiled default; production reads <c>dbo.FeeStructures</c> for the
        /// current academic year, which is what allows a mid-year revision.
        /// </summary>
        private static readonly Dictionary<int, decimal> DefaultTuition = new Dictionary<int, decimal>
        {
            { 0, 700m },  { 1, 750m },  { 2, 750m },  { 3, 800m },  { 4, 800m },
            { 5, 900m },  { 6, 1000m }, { 7, 1000m }, { 8, 1100m }, { 9, 1400m },
            { 10, 1500m }, { 11, 1800m }, { 12, 1900m }
        };

        public static decimal MonthlyTuition(int gradeLevel)
        {
            decimal amount;
            return DefaultTuition.TryGetValue(gradeLevel, out amount) ? amount : 0m;
        }

        /// <summary>
        /// Apply a waiver. The discount is rounded to whole taka using banker's
        /// rounding, and the payable amount is derived by subtraction rather than
        /// computed independently — so gross, discount and payable always reconcile
        /// exactly, with no rounding residue left over.
        /// </summary>
        public static WaiverApplication ApplyWaiver(decimal gross, Waiver waiver)
        {
            if (waiver == null) waiver = Waivers.None;

            var discount = Math.Round(gross * waiver.Percent / 100m, 0, MidpointRounding.ToEven);
            return new WaiverApplication(waiver, gross, discount, gross - discount);
        }

        public static WaiverApplication ApplyWaiver(decimal gross, string waiverCode)
        {
            return ApplyWaiver(gross, Waivers.ByCode(waiverCode));
        }

        /// <summary>
        /// Late fine for an overdue balance: ৳20 per month, capped at ৳200.
        /// Negative or zero months attract nothing.
        /// </summary>
        public static decimal LateFine(int monthsOverdue)
        {
            if (monthsOverdue <= 0) return 0m;
            return Math.Min(LateFineCap, monthsOverdue * LateFinePerMonth);
        }

        /// <summary>
        /// The status an invoice carries given what has been received against it.
        /// </summary>
        public static InvoiceStatus StatusFor(decimal netAmount, decimal paidAmount)
        {
            if (paidAmount <= 0m) return InvoiceStatus.Unpaid;
            if (paidAmount >= netAmount) return InvoiceStatus.Paid;
            return InvoiceStatus.Partial;
        }

        /// <summary>
        /// Full months between two dates, used for the overdue count. Counts
        /// completed months only — an invoice due on the 5th is one month overdue
        /// on the 5th of the following month, not on the 1st.
        /// </summary>
        public static int MonthsOverdue(DateTime dueOn, DateTime asOf)
        {
            if (asOf <= dueOn) return 0;
            var months = ((asOf.Year - dueOn.Year) * 12) + asOf.Month - dueOn.Month;
            if (asOf.Day < dueOn.Day) months--;
            return Math.Max(0, months);
        }
    }

    public enum InvoiceStatus
    {
        Unpaid = 0,
        Partial = 1,
        Paid = 2,
        Waived = 3,
        Cancelled = 4
    }
}
