using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data.Entity;
using System.Linq;
using System.Net.Mail;
using System.Web;
using System.Web.Script.Serialization;
using SchoolErp.Domain.Attendance;
using SchoolErp.Domain.Fees;
using SchoolErp.Web.Data;
using SchoolErp.Web.Data.Entities;

namespace SchoolErp.Web.Services
{
    // =========================================================================
    // §4 — module switches
    // =========================================================================

    public interface IModuleService
    {
        bool IsEnabled(string moduleCode);
        IReadOnlyList<ModuleSetting> All();
        void SetEnabled(string moduleCode, bool enabled, int actingUserId);
        void InvalidateCache();
    }

    /// <summary>
    /// §4 — every module ships in the codebase; the institution sees only what is
    /// switched on.
    ///
    /// Cached in application state because <see cref="IsEnabled"/> is called on
    /// every request by the route filter and again by the layout when it builds
    /// the navigation. Hitting the database twelve times per page render on a
    /// 256 MB host (§3) would be a self-inflicted wound.
    /// </summary>
    public class ModuleService : IModuleService
    {
        private const string CacheKey = "SchoolErp.Modules";
        private static readonly object CacheLock = new object();
        private static Dictionary<string, bool> _cache;

        private readonly SchoolErpContext _db;
        private readonly IAuditService _audit;

        public ModuleService(SchoolErpContext db, IAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public bool IsEnabled(string moduleCode)
        {
            if (string.IsNullOrEmpty(moduleCode)) return true;

            var cache = GetCache();
            bool enabled;
            // An unknown module code is treated as enabled rather than hidden: a
            // typo in a filter attribute should surface as a visible screen, not
            // as a silently missing one.
            return !cache.TryGetValue(moduleCode, out enabled) || enabled;
        }

        public IReadOnlyList<ModuleSetting> All()
        {
            return _db.ModuleSettings.AsNoTracking().OrderBy(m => m.Name).ToList();
        }

        public void SetEnabled(string moduleCode, bool enabled, int actingUserId)
        {
            var module = _db.ModuleSettings.FirstOrDefault(m => m.ModuleCode == moduleCode);
            if (module == null) throw new InvalidOperationException("Unknown module: " + moduleCode);

            // Core modules cannot be switched off. The database carries the same
            // rule as a CHECK constraint; this is the friendly half of it.
            if (module.IsCore && !enabled)
            {
                throw new InvalidOperationException(
                    string.Format("{0} is a core module and cannot be switched off.", module.Name));
            }

            if (module.IsEnabled == enabled) return;

            module.IsEnabled = enabled;
            module.ModifiedByUserId = actingUserId;
            module.ModifiedAtUtc = DateTime.UtcNow;
            _db.SaveChanges();

            InvalidateCache();

            _audit.Record(actingUserId, enabled ? "module.enable" : "module.disable",
                "ModuleSetting", moduleCode, new { module.Name, enabled });
        }

        public void InvalidateCache()
        {
            lock (CacheLock) { _cache = null; }
        }

        private Dictionary<string, bool> GetCache()
        {
            var cache = _cache;
            if (cache != null) return cache;

            lock (CacheLock)
            {
                if (_cache != null) return _cache;
                _cache = _db.ModuleSettings.AsNoTracking()
                    .ToDictionary(m => m.ModuleCode, m => m.IsEnabled, StringComparer.OrdinalIgnoreCase);
                return _cache;
            }
        }
    }

    // =========================================================================
    // Audit
    // =========================================================================

    public interface IAuditService
    {
        void Record(int? userId, string action, string entityName, string entityKey, object details = null);
        IReadOnlyList<AuditEntry> Recent(int limit = 100);
    }

    /// <summary>
    /// Append-only audit trail.
    ///
    /// Deliberately swallows its own failures: an audit write that throws must not
    /// roll back a fee collection. A lost audit row is bad; a lost payment is worse.
    /// </summary>
    public class AuditService : IAuditService
    {
        private readonly SchoolErpContext _db;

        public AuditService(SchoolErpContext db)
        {
            _db = db;
        }

        public void Record(int? userId, string action, string entityName, string entityKey, object details = null)
        {
            try
            {
                var json = details == null
                    ? null
                    : new JavaScriptSerializer().Serialize(details);

                if (json != null && json.Length > 1000) json = json.Substring(0, 1000);

                _db.AuditLog.Add(new AuditEntry
                {
                    OccurredAtUtc = DateTime.UtcNow,
                    UserId = userId,
                    RoleCode = HttpContext.Current == null ? null : CurrentRoleCode(),
                    Action = action,
                    EntityName = entityName,
                    EntityKey = entityKey,
                    Details = json,
                    IpAddress = HttpContext.Current == null
                        ? null
                        : HttpContext.Current.Request.UserHostAddress
                });
                _db.SaveChanges();
            }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.TraceError("Audit write failed: " + ex);
            }
        }

        public IReadOnlyList<AuditEntry> Recent(int limit = 100)
        {
            return _db.AuditLog.AsNoTracking()
                .OrderByDescending(a => a.OccurredAtUtc)
                .Take(limit)
                .ToList();
        }

        private static string CurrentRoleCode()
        {
            var user = HttpContext.Current.User;
            if (user == null || user.Identity == null || !user.Identity.IsAuthenticated) return null;

            foreach (var role in new[] { "ADMIN", "TEACHER", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT", "HR", "STUDENT", "PARENT" })
            {
                if (user.IsInRole(role)) return role;
            }
            return null;
        }
    }

    // =========================================================================
    // §12 — notifications
    // =========================================================================

    public interface INotificationService
    {
        /// <summary>Queue a message. Whether it is ever sent depends on the channel.</summary>
        void Queue(string channel, string recipientAddress, string subject, string body, int? noticeId = null);

        /// <summary>Drain pending work. Called by the Hangfire recurring job.</summary>
        NotificationDrainResult Drain(int batchSize = 100);
    }

    public class NotificationDrainResult
    {
        public int Sent { get; set; }
        public int Failed { get; set; }
        public int Held { get; set; }
    }

    /// <summary>
    /// §12 — the notification service.
    ///
    /// Email is real and goes through whatever SMTP the configuration names, so
    /// moving from Gmail in development to Brevo in production is a config change
    /// rather than a rewrite.
    ///
    /// SMS is queued and then held. There is no gateway, and that is a decision
    /// rather than an omission: Bangladesh bulk SMS runs about ৳0.30 a message
    /// with no free tier, which at 2,500 guardians and two sends a month is
    /// roughly ৳18,000 a year — an order of magnitude above the hosting bill.
    /// The rows are still written, with their cost, so the institution can see
    /// exactly what it would be buying.
    /// </summary>
    public class NotificationService : INotificationService
    {
        public const string ChannelEmail = "EMAIL";
        public const string ChannelSms = "SMS";

        private const string StatusPending = "Pending";
        private const string StatusSent = "Sent";
        private const string StatusFailed = "Failed";
        private const string StatusHeld = "Held";

        private static readonly decimal SmsUnitCostBdt = 0.30m;

        private readonly SchoolErpContext _db;

        public NotificationService(SchoolErpContext db)
        {
            _db = db;
        }

        private static bool SmsGatewayConfigured
        {
            get { return !string.IsNullOrWhiteSpace(ConfigurationManager.AppSettings["Sms:Provider"]); }
        }

        public void Queue(string channel, string recipientAddress, string subject, string body, int? noticeId = null)
        {
            if (string.IsNullOrWhiteSpace(recipientAddress)) return;

            var isSms = string.Equals(channel, ChannelSms, StringComparison.OrdinalIgnoreCase);

            _db.NotificationQueue.Add(new NotificationQueueItem
            {
                Channel = isSms ? ChannelSms : ChannelEmail,
                NoticeId = noticeId,
                RecipientAddress = recipientAddress,
                Subject = subject,
                Body = body.Length > 1000 ? body.Substring(0, 1000) : body,
                // An SMS with no gateway is Held from birth. Marking it Pending
                // would have the worker retry it forever.
                Status = isSms && !SmsGatewayConfigured ? StatusHeld : StatusPending,
                EstimatedCostBdt = isSms ? SmsUnitCostBdt : 0m,
                QueuedAtUtc = DateTime.UtcNow
            });
            _db.SaveChanges();
        }

        public NotificationDrainResult Drain(int batchSize = 100)
        {
            var result = new NotificationDrainResult();

            var pending = _db.NotificationQueue
                .Where(n => n.Status == StatusPending)
                .OrderBy(n => n.QueuedAtUtc)
                .Take(batchSize)
                .ToList();

            foreach (var item in pending)
            {
                if (item.Channel == ChannelSms && !SmsGatewayConfigured)
                {
                    item.Status = StatusHeld;
                    item.LastError = "No SMS gateway configured.";
                    result.Held++;
                    continue;
                }

                try
                {
                    if (item.Channel == ChannelEmail) SendEmail(item);
                    else SendSms(item);

                    item.Status = StatusSent;
                    item.SentAtUtc = DateTime.UtcNow;
                    item.LastError = null;
                    result.Sent++;
                }
                catch (Exception ex)
                {
                    item.AttemptCount++;
                    item.LastError = ex.Message.Length > 400 ? ex.Message.Substring(0, 400) : ex.Message;

                    // Five attempts, then stop. The free email tier is capped at
                    // 300 a day (§12); burning that allowance on a bad address is
                    // worse than dropping the message.
                    if (item.AttemptCount >= 5) item.Status = StatusFailed;
                    result.Failed++;
                }
            }

            _db.SaveChanges();
            return result;
        }

        private static void SendEmail(NotificationQueueItem item)
        {
            // Provider comes entirely from <system.net><mailSettings> in Web.config,
            // which is the whole point of the abstraction (§12).
            using (var message = new MailMessage())
            {
                message.To.Add(item.RecipientAddress);
                message.Subject = item.Subject ?? "Notice";
                message.Body = item.Body;
                message.IsBodyHtml = false;

                using (var client = new SmtpClient())
                {
                    client.Send(message);
                }
            }
        }

        private static void SendSms(NotificationQueueItem item)
        {
            // Unreachable while SmsGatewayConfigured is false. Left explicit so the
            // seam is visible rather than implied.
            throw new NotSupportedException(
                "No SMS gateway is wired. Configure Sms:Provider and implement the provider call here.");
        }
    }

    // =========================================================================
    // §6 — attendance
    // =========================================================================

    public interface IAttendanceService
    {
        IReadOnlyList<AttendanceEntry> ForClassOnDate(int classSectionId, DateTime date, byte period);
        int SaveRegister(int classSectionId, DateTime date, byte period, IDictionary<string, char> statuses, int actingUserId, int? employeeId);
        AttendanceSummary SummaryFor(string studentId, DateTime from, DateTime to);
    }

    public class AttendanceService : IAttendanceService
    {
        private readonly SchoolErpContext _db;
        private readonly IAuditService _audit;

        public AttendanceService(SchoolErpContext db, IAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public IReadOnlyList<AttendanceEntry> ForClassOnDate(int classSectionId, DateTime date, byte period)
        {
            var day = date.Date;
            var studentIds = _db.Enrolments.AsNoTracking()
                .Where(e => e.ClassSectionId == classSectionId && e.IsActive)
                .Select(e => e.StudentId);

            return _db.Attendance.AsNoTracking()
                .Where(a => a.Date == day && a.Period == period && studentIds.Contains(a.StudentId))
                .ToList();
        }

        public int SaveRegister(
            int classSectionId,
            DateTime date,
            byte period,
            IDictionary<string, char> statuses,
            int actingUserId,
            int? employeeId)
        {
            if (statuses == null) throw new ArgumentNullException("statuses");

            var day = date.Date;

            // Refuse to write attendance for a day the institution does not run.
            // A register saved against a Friday is a data-entry error, and it will
            // quietly depress every eligibility percentage that counts it.
            if (!SchoolErp.Domain.Common.AcademicCalendar.IsWorkingDay(day))
            {
                throw new InvalidOperationException(
                    string.Format("{0:dd MMM yyyy} is not a working day — the institution runs Sunday to Thursday.", day));
            }

            var ids = statuses.Keys.ToList();
            var existing = _db.Attendance
                .Where(a => a.Date == day && a.Period == period && ids.Contains(a.StudentId))
                .ToDictionary(a => a.StudentId);

            var changed = 0;

            foreach (var pair in statuses)
            {
                var code = char.ToUpperInvariant(pair.Value).ToString();

                // Validates the code and throws on anything unrecognised.
                AttendanceCalculator.FromCode(pair.Value);

                AttendanceEntry row;
                if (existing.TryGetValue(pair.Key, out row))
                {
                    if (row.Status == code) continue;
                    row.Status = code;
                    row.MarkedAtUtc = DateTime.UtcNow;
                    row.MarkedByEmployeeId = employeeId;
                }
                else
                {
                    _db.Attendance.Add(new AttendanceEntry
                    {
                        StudentId = pair.Key,
                        Date = day,
                        Period = period,
                        Status = code,
                        MarkedByEmployeeId = employeeId,
                        MarkedAtUtc = DateTime.UtcNow
                    });
                }
                changed++;
            }

            if (changed == 0) return 0;

            _db.SaveChanges();
            _audit.Record(actingUserId, "attendance.save", "Attendance",
                classSectionId.ToString(), new { Date = day.ToString("yyyy-MM-dd"), Period = period, Count = changed });

            return changed;
        }

        public AttendanceSummary SummaryFor(string studentId, DateTime from, DateTime to)
        {
            var records = _db.Attendance.AsNoTracking()
                .Where(a => a.StudentId == studentId && a.Date >= from.Date && a.Date <= to.Date)
                .Select(a => new { a.Date, a.Status, a.Period })
                .ToList()
                .Select(a => new AttendanceRecord(a.Date, AttendanceCalculator.FromCode(a.Status[0]), a.Period));

            return AttendanceCalculator.Summarise(records);
        }
    }

    // =========================================================================
    // §11 — fees
    // =========================================================================

    public interface IFeeService
    {
        LedgerSummary LedgerFor(string studentId);
        Payment Collect(string studentId, decimal amount, string method, string particulars, int actingUserId);
    }

    public class LedgerSummary
    {
        public string StudentId { get; set; }
        public decimal Billed { get; set; }
        public decimal Paid { get; set; }
        public decimal Due { get; set; }
        public int MonthsOverdue { get; set; }
        public decimal LateFine { get; set; }
        public IReadOnlyList<Invoice> Invoices { get; set; }
    }

    public class FeeService : IFeeService
    {
        private readonly SchoolErpContext _db;
        private readonly IAuditService _audit;

        public FeeService(SchoolErpContext db, IAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public LedgerSummary LedgerFor(string studentId)
        {
            var year = _db.AcademicYears.AsNoTracking().FirstOrDefault(y => y.IsCurrent);
            if (year == null) throw new InvalidOperationException("No academic year is marked current.");

            var invoices = _db.Invoices.AsNoTracking()
                .Where(i => i.StudentId == studentId
                            && i.AcademicYearId == year.AcademicYearId
                            && i.Status != "Cancelled")
                .OrderBy(i => i.DueOn)
                .ToList();

            var billed = invoices.Sum(i => i.NetAmount);
            var paid = invoices.Sum(i => i.PaidAmount);

            var earliestUnpaid = invoices
                .Where(i => i.Status == "Unpaid" || i.Status == "Partial")
                .Select(i => (DateTime?)i.DueOn)
                .FirstOrDefault();

            var monthsOverdue = earliestUnpaid.HasValue
                ? FeeCalculator.MonthsOverdue(earliestUnpaid.Value, DateTime.Now)
                : 0;

            return new LedgerSummary
            {
                StudentId = studentId,
                Billed = billed,
                Paid = paid,
                Due = billed - paid,
                MonthsOverdue = monthsOverdue,
                LateFine = FeeCalculator.LateFine(monthsOverdue),
                Invoices = invoices
            };
        }

        public Payment Collect(string studentId, decimal amount, string method, string particulars, int actingUserId)
        {
            if (amount <= 0m) throw new ArgumentOutOfRangeException("amount", "A receipt must be for more than zero.");

            var ledger = LedgerFor(studentId);
            if (amount > ledger.Due)
            {
                throw new ArgumentOutOfRangeException(
                    "amount",
                    string.Format("The outstanding balance is {0:N2}; a payment cannot exceed it.", ledger.Due));
            }

            var payment = new Payment
            {
                ReceiptNo = NextReceiptNo(),
                StudentId = studentId,
                Amount = amount,
                PaymentMethod = method,
                Particulars = particulars,
                ReceivedOn = DateTime.Now.Date,
                CollectedByUserId = actingUserId,
                IsCancelled = false,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.Payments.Add(payment);

            // Settle oldest invoice first — the office's convention, and the one
            // that keeps the overdue count meaningful.
            var remaining = amount;
            foreach (var invoice in ledger.Invoices.Where(i => i.Status == "Unpaid" || i.Status == "Partial"))
            {
                if (remaining <= 0m) break;

                var tracked = _db.Invoices.First(i => i.InvoiceId == invoice.InvoiceId);
                var owing = tracked.NetAmount - tracked.PaidAmount;
                var applied = Math.Min(owing, remaining);

                tracked.PaidAmount += applied;
                tracked.Status = FeeCalculator.StatusFor(tracked.NetAmount, tracked.PaidAmount).ToString();
                remaining -= applied;

                if (payment.InvoiceId == null) payment.InvoiceId = tracked.InvoiceId;
            }

            _db.SaveChanges();

            _audit.Record(actingUserId, "fee.collect", "Payment", payment.ReceiptNo,
                new { studentId, amount, method });

            return payment;
        }

        private string NextReceiptNo()
        {
            var prefix = "RCP-" + DateTime.Now.ToString("yyyyMM") + "-";
            var last = _db.Payments
                .Where(p => p.ReceiptNo.StartsWith(prefix))
                .OrderByDescending(p => p.ReceiptNo)
                .Select(p => p.ReceiptNo)
                .FirstOrDefault();

            var next = 1;
            if (last != null)
            {
                int parsed;
                if (int.TryParse(last.Substring(prefix.Length), out parsed)) next = parsed + 1;
            }
            return prefix + next.ToString("0000");
        }
    }
}
