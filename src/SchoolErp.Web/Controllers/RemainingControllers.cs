using System;
using System.Collections.Generic;
using System.Configuration;
using System.Data.Entity;
using System.Linq;
using System.Web.Mvc;
using SchoolErp.Domain.Attendance;
using SchoolErp.Domain.Common;
using SchoolErp.Web.Data.Entities;
using SchoolErp.Web.Filters;
using SchoolErp.Web.Services;
using SchoolErp.Web.ViewModels;

namespace SchoolErp.Web.Controllers
{
    // =========================================================================
    // Home
    // =========================================================================

    [Authorize]
    public class HomeController : BaseController
    {
        public ActionResult Index()
        {
            // The dashboard a user lands on depends on the role they hold (§9).
            if (User.IsInRole("PARENT") || User.IsInRole("STUDENT")) return RedirectToAction("Index", "Portal");
            if (User.IsInRole("ACCOUNTANT")) return RedirectToAction("Dues", "Fees");
            if (User.IsInRole("TEACHER")) return RedirectToAction("Register", "Attendance");
            return View();
        }

        /// <summary>
        /// §4 — where RequireModuleAttribute sends a request for a switched-off
        /// module. It explains rather than 404s, and offers an Admin the switch.
        /// </summary>
        [AllowAnonymous]
        public ActionResult ModuleDisabled(string module, bool canEnable = false)
        {
            var setting = Db.ModuleSettings.AsNoTracking().FirstOrDefault(m => m.ModuleCode == module);
            ViewBag.ModuleName = setting == null ? module : setting.Name;
            ViewBag.ModuleCode = module;
            ViewBag.CanEnable = canEnable;
            return View();
        }
    }

    // =========================================================================
    // Admissions (§8)
    // =========================================================================

    [Authorize(Roles = "ADMIN")]
    [RequireModule("admissions")]
    public class AdmissionsController : BaseController
    {
        private IAdmissionService Admissions
        {
            get { return new AdmissionService(Db, Audit); }
        }

        public ActionResult Create()
        {
            return View(BuildForm(new AdmissionRequest { WaiverCode = "NONE" }));
        }

        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult Create(AdmissionRequest request)
        {
            if (!ModelState.IsValid) return View(BuildForm(request));

            if (string.IsNullOrWhiteSpace(request.GuardianMobile) ||
                !System.Text.RegularExpressions.Regex.IsMatch(request.GuardianMobile, @"^01[3-9]\d{8}$"))
            {
                ModelState.AddModelError("GuardianMobile",
                    "A Bangladeshi mobile number is required — 11 digits beginning 01.");
                return View(BuildForm(request));
            }

            try
            {
                var student = Admissions.Admit(request, CurrentUserId ?? 0);
                Notify(string.Format(
                    "{0} is admitted. Permanent identifier {1} has been issued and will never be reused.",
                    student.FullName, student.StudentId));
                return RedirectToAction("Details", "Students", new { id = student.StudentId });
            }
            catch (Exception ex)
            {
                ModelState.AddModelError("", ex.Message);
                return View(BuildForm(request));
            }
        }

        private AdmissionFormViewModel BuildForm(AdmissionRequest request)
        {
            var today = DateTime.Now.Date;
            return new AdmissionFormViewModel
            {
                Request = request,
                Sections = Db.ClassSections.AsNoTracking()
                    .Include(c => c.Grade)
                    .Where(c => c.IsActive)
                    .OrderBy(c => c.GradeId).ThenBy(c => c.Code)
                    .ToList(),
                OptionalSubjects = Db.Subjects.AsNoTracking()
                    .Where(s => s.IsOptional)
                    .OrderBy(s => s.Name)
                    .ToList(),
                Waivers = Db.Waivers.AsNoTracking().OrderBy(w => w.Percent).ToList(),
                NextIdentifier = Admissions.PeekNextIdentifier(today),
                Capacity = Admissions.CapacityFor(today)
            };
        }
    }

    // =========================================================================
    // Attendance (§6)
    // =========================================================================

    [Authorize(Roles = "ADMIN,TEACHER")]
    [RequireModule("attendance")]
    public class AttendanceController : BaseController
    {
        private IAttendanceService Attendance
        {
            get { return new AttendanceService(Db, Audit); }
        }

        public ActionResult Register(int? classSectionId, DateTime? date, byte period = 0)
        {
            var day = (date ?? DateTime.Now).Date;

            var sections = Db.ClassSections.AsNoTracking()
                .Include(c => c.Grade)
                .Where(c => c.IsActive)
                .OrderBy(c => c.GradeId).ThenBy(c => c.Code)
                .ToList();

            var section = sections.FirstOrDefault(s => s.ClassSectionId == (classSectionId ?? 0))
                          ?? sections.FirstOrDefault();

            var model = new RegisterViewModel
            {
                Sections = sections,
                Date = day,
                Period = period,
                IsWorkingDay = AcademicCalendar.IsWorkingDay(day),
                Rows = new List<RegisterRow>()
            };

            if (section == null) return View(model);

            model.ClassSectionId = section.ClassSectionId;
            model.SectionName = section.DisplayName;

            // §6 — the mode follows the grade, not a setting. The college section
            // takes a period; the school section takes the day.
            model.IsPeriodWise = section.Grade != null &&
                                 string.Equals(section.Grade.AttendanceMode, "Period", StringComparison.OrdinalIgnoreCase);
            if (!model.IsPeriodWise) model.Period = 0;
            else if (model.Period == 0) model.Period = 1;

            if (!model.IsWorkingDay) return View(model);

            var year = CurrentYear;
            var enrolments = Db.Enrolments.AsNoTracking()
                .Include(e => e.Student)
                .Where(e => e.ClassSectionId == section.ClassSectionId && e.IsActive)
                .OrderBy(e => e.RollNumber)
                .ToList();

            var existing = Attendance
                .ForClassOnDate(section.ClassSectionId, day, model.Period)
                .ToDictionary(a => a.StudentId, a => a.Status);

            model.Rows = enrolments.Select(e =>
            {
                string status;
                var summary = Attendance.SummaryFor(
                    e.StudentId,
                    year == null ? day.AddMonths(-6) : year.StartDate,
                    day);

                return new RegisterRow
                {
                    StudentId = e.StudentId,
                    RollNumber = e.RollNumber,
                    FullName = e.Student.FullName,
                    // Default to present: on a normal day most of the class is
                    // there, and the teacher marks the exceptions.
                    Status = existing.TryGetValue(e.StudentId, out status) ? status[0] : 'P',
                    YearToDatePercent = summary.Percent,
                    IsEligible = summary.IsEligible
                };
            }).ToList();

            return View(model);
        }

        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult Register(int classSectionId, DateTime date, byte period, RegisterRow[] rows)
        {
            if (rows == null || rows.Length == 0)
            {
                Notify("Nothing to save.", "warn");
                return RedirectToAction("Register", new { classSectionId, date, period });
            }

            try
            {
                var statuses = rows
                    .Where(r => !string.IsNullOrEmpty(r.StudentId))
                    .ToDictionary(r => r.StudentId, r => r.Status);

                var saved = Attendance.SaveRegister(classSectionId, date, period, statuses,
                    CurrentUserId ?? 0, CurrentEmployee == null ? (int?)null : CurrentEmployee.EmployeeId);

                Notify(saved == 0
                    ? "No attendance was changed."
                    : string.Format("{0} record{1} saved for {2:dd MMM yyyy}.", saved, saved == 1 ? "" : "s", date));
            }
            catch (Exception ex)
            {
                Notify(ex.Message, "bad");
            }

            return RedirectToAction("Register", new { classSectionId, date, period });
        }

        /// <summary>§6 — candidates below the 70% board threshold.</summary>
        public ActionResult Eligibility()
        {
            var year = CurrentYear;
            if (year == null) return View("NoAcademicYear");

            // The heavy lifting is a single grouped query rather than a per-student
            // round trip: at 3,000 students the latter is not survivable on this host.
            var rows = Db.Database.SqlQuery<EligibilityRow>(@"
                SELECT  s.StudentId,
                        s.FullName,
                        g.Name + N' — ' + cs.Name AS ClassName,
                        v.AttendancePercent,
                        v.PresentCount,
                        v.TotalRecords
                FROM    dbo.vw_AttendanceSummary v
                JOIN    dbo.Students s      ON s.StudentId = v.StudentId
                JOIN    dbo.Enrolments e    ON e.StudentId = s.StudentId AND e.IsActive = 1
                JOIN    dbo.ClassSections cs ON cs.ClassSectionId = e.ClassSectionId
                JOIN    dbo.Grades g        ON g.GradeId = cs.GradeId
                WHERE   v.IsBoardEligible = 0
                ORDER BY v.AttendancePercent ASC").ToList();

            ViewBag.Threshold = AttendanceCalculator.BoardEligibilityThreshold;
            return View(rows);
        }

        public class EligibilityRow
        {
            public string StudentId { get; set; }
            public string FullName { get; set; }
            public string ClassName { get; set; }
            public decimal AttendancePercent { get; set; }
            public int PresentCount { get; set; }
            public int TotalRecords { get; set; }
        }
    }

    // =========================================================================
    // Fees (§11)
    // =========================================================================

    [Authorize(Roles = "ADMIN,ACCOUNTANT")]
    [RequireModule("fees")]
    public class FeesController : BaseController
    {
        private IFeeService Fees
        {
            get { return new FeeService(Db, Audit); }
        }

        public ActionResult Collect(string studentId, string q)
        {
            var model = new FeeCollectionViewModel { Query = q };

            if (!string.IsNullOrWhiteSpace(q) && string.IsNullOrEmpty(studentId))
            {
                var term = q.Trim();
                model.Matches = Db.Enrolments.AsNoTracking()
                    .Include(e => e.Student)
                    .Include(e => e.ClassSection)
                    .Include(e => e.ClassSection.Grade)
                    .Where(e => e.IsActive && (
                        e.StudentId.Contains(term) ||
                        e.Student.FullName.Contains(term) ||
                        e.Student.Guardian.Mobile.Contains(term)))
                    .Take(8)
                    .Select(e => new StudentListItem
                    {
                        StudentId = e.StudentId,
                        FullName = e.Student.FullName,
                        RollNumber = e.RollNumber,
                        ClassName = e.ClassSection.Grade.Name,
                        SectionName = e.ClassSection.Name
                    })
                    .ToList();
            }

            if (!string.IsNullOrEmpty(studentId))
            {
                model.Student = Db.Students.AsNoTracking()
                    .Include(s => s.Guardian)
                    .FirstOrDefault(s => s.StudentId == studentId);

                if (model.Student != null)
                {
                    model.Ledger = Fees.LedgerFor(studentId);
                    model.RecentPayments = Db.Payments.AsNoTracking()
                        .Where(p => p.StudentId == studentId && !p.IsCancelled)
                        .OrderByDescending(p => p.ReceivedOn)
                        .Take(10)
                        .ToList();
                }
            }

            return View(model);
        }

        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult Collect(string studentId, decimal amount, string method, string particulars)
        {
            try
            {
                var payment = Fees.Collect(studentId, amount, method, particulars, CurrentUserId ?? 0);
                Notify(string.Format("Receipt {0} issued for {1:N2}.", payment.ReceiptNo, amount));
                return RedirectToAction("Receipt", new { id = payment.PaymentId });
            }
            catch (Exception ex)
            {
                Notify(ex.Message, "bad");
                return RedirectToAction("Collect", new { studentId });
            }
        }

        public ActionResult Receipt(long id)
        {
            var payment = Db.Payments.AsNoTracking()
                .Include(p => p.Student)
                .Include(p => p.Student.Guardian)
                .FirstOrDefault(p => p.PaymentId == id);

            return payment == null ? (ActionResult)HttpNotFound() : View(payment);
        }

        /// <summary>§11 — the outstanding register, read from vw_StudentLedger.</summary>
        public ActionResult Dues()
        {
            var rows = Db.Database.SqlQuery<DuesRow>(@"
                SELECT  l.StudentId,
                        s.FullName,
                        g.Name + N' — ' + cs.Name AS ClassName,
                        gd.FatherName AS GuardianName,
                        gd.Mobile AS GuardianMobile,
                        l.BilledAmount AS Billed,
                        l.PaidAmount AS Paid,
                        l.DueAmount AS Due,
                        l.OverdueInvoiceCount AS MonthsOverdue
                FROM    dbo.vw_StudentLedger l
                JOIN    dbo.Students s       ON s.StudentId = l.StudentId
                JOIN    dbo.Guardians gd     ON gd.GuardianId = s.GuardianId
                JOIN    dbo.Enrolments e     ON e.StudentId = s.StudentId AND e.IsActive = 1
                JOIN    dbo.ClassSections cs ON cs.ClassSectionId = e.ClassSectionId
                JOIN    dbo.Grades g         ON g.GradeId = cs.GradeId
                WHERE   l.DueAmount > 0
                ORDER BY l.DueAmount DESC").ToList();

            return View(new DuesViewModel
            {
                Rows = rows,
                TotalBilled = rows.Sum(r => r.Billed),
                TotalCollected = rows.Sum(r => r.Paid),
                TotalDue = rows.Sum(r => r.Due)
            });
        }
    }

    // =========================================================================
    // Notices (§12)
    // =========================================================================

    [Authorize]
    [RequireModule("notices")]
    public class NoticesController : BaseController
    {
        public ActionResult Index()
        {
            var today = DateTime.Now.Date;
            var notices = Db.Notices.AsNoTracking()
                .Where(n => n.PublishedOn <= today && (n.ExpiresOn == null || n.ExpiresOn >= today))
                .OrderByDescending(n => n.IsPinned)
                .ThenByDescending(n => n.PublishedOn)
                .Take(50)
                .ToList();

            return View(notices);
        }

        [Authorize(Roles = "ADMIN,TEACHER")]
        public ActionResult Create()
        {
            return View(new Notice { PublishedOn = DateTime.Now.Date, Priority = "normal", Audience = "all" });
        }

        [Authorize(Roles = "ADMIN,TEACHER")]
        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult Create(Notice notice, bool sendEmail = true, bool sendSms = false)
        {
            if (!ModelState.IsValid) return View(notice);

            notice.CreatedByUserId = CurrentUserId ?? 0;
            notice.CreatedAtUtc = DateTime.UtcNow;
            Db.Notices.Add(notice);
            Db.SaveChanges();

            var notifications = new NotificationService(Db);
            var recipients = ResolveRecipients(notice);

            foreach (var recipient in recipients)
            {
                if (sendEmail && !string.IsNullOrWhiteSpace(recipient.Email))
                {
                    notifications.Queue(NotificationService.ChannelEmail, recipient.Email,
                        notice.Title, notice.Body, notice.NoticeId);
                }

                if (sendSms && !string.IsNullOrWhiteSpace(recipient.Mobile))
                {
                    notifications.Queue(NotificationService.ChannelSms, recipient.Mobile,
                        null, notice.Title, notice.NoticeId);
                }
            }

            Audit.Record(CurrentUserId, "notice.publish", "Notice", notice.NoticeId.ToString(),
                new { notice.Title, notice.Audience, Recipients = recipients.Count });

            // Says plainly what happened to the SMS half, rather than implying it
            // was sent (§12).
            Notify(sendSms
                ? string.Format(
                    "Notice published. {0} email{1} queued; SMS is held — no gateway is configured.",
                    recipients.Count, recipients.Count == 1 ? "" : "s")
                : string.Format("Notice published and queued to {0} recipient{1}.",
                    recipients.Count, recipients.Count == 1 ? "" : "s"));

            return RedirectToAction("Index");
        }

        public class Recipient
        {
            public string Email { get; set; }
            public string Mobile { get; set; }
        }

        /// <summary>
        /// Resolve an audience to a recipient list.
        ///
        /// Each branch projects to an anonymous type, materialises, and only then
        /// shapes and deduplicates. Two reasons that ordering matters: EF6 cannot
        /// reliably project a LINQ-to-Entities query into an arbitrary class, and
        /// <c>Distinct()</c> over a class has no SQL translation — it would either
        /// throw or silently return duplicates, and a duplicate here means a family
        /// gets the same notice twice.
        /// </summary>
        private List<Recipient> ResolveRecipients(Notice notice)
        {
            switch ((notice.Audience ?? "all").ToLowerInvariant())
            {
                case "staff":
                    return Db.Employees.AsNoTracking()
                        .Where(e => e.Status == "Active")
                        .Select(e => new { e.Email, e.Mobile })
                        .ToList()
                        .Select(x => new Recipient { Email = x.Email, Mobile = x.Mobile })
                        .ToList();

                case "class":
                    var gradeId = notice.GradeId;
                    return Db.Enrolments.AsNoTracking()
                        .Where(e => e.IsActive && e.ClassSection.GradeId == gradeId)
                        .Select(e => new { e.Student.Guardian.Email, e.Student.Guardian.Mobile })
                        .Distinct()
                        .ToList()
                        .Select(x => new Recipient { Email = x.Email, Mobile = x.Mobile })
                        .ToList();

                default:
                    // §10 — deduplicated by guardian account, not by child. A family
                    // with three children gets one message, not three.
                    return Db.Guardians.AsNoTracking()
                        .Select(g => new { g.Email, g.Mobile })
                        .Distinct()
                        .ToList()
                        .Select(x => new Recipient { Email = x.Email, Mobile = x.Mobile })
                        .ToList();
            }
        }
    }

    // =========================================================================
    // Parent / student portal (§10)
    // =========================================================================

    [Authorize(Roles = "PARENT,STUDENT")]
    [RequireModule("portal")]
    public class PortalController : BaseController
    {
        public ActionResult Index(string childId)
        {
            var userId = CurrentUserId;
            if (!userId.HasValue) return RedirectToAction("Login", "Account");

            // §10 — one guardian account, one or more children. The child switcher
            // is the whole requirement, so the list comes first and the selected
            // child second.
            var children = Db.Students.AsNoTracking()
                .Include(s => s.Guardian)
                .Where(s => s.Guardian.UserId == userId.Value && s.Status == "Active")
                .OrderBy(s => s.FullName)
                .ToList();

            if (children.Count == 0) return View("NoChildrenLinked");

            var student = children.FirstOrDefault(c => c.StudentId == childId) ?? children[0];

            var enrolment = Db.Enrolments.AsNoTracking()
                .Include(e => e.ClassSection)
                .Include(e => e.ClassSection.Grade)
                .FirstOrDefault(e => e.StudentId == student.StudentId && e.IsActive);

            var year = CurrentYear;

            // Results are visible only once the term is published — an unpublished
            // mark is a working figure, not a result.
            var results = Db.TermResults.AsNoTracking()
                .Include(r => r.ExamTerm)
                .Where(r => r.StudentId == student.StudentId && r.ExamTerm.IsPublished)
                .OrderBy(r => r.ExamTermId)
                .ToList();

            ViewBag.Children = children;
            ViewBag.SelectedChildId = student.StudentId;

            return View(new StudentDetailViewModel
            {
                Student = student,
                Enrolment = enrolment,
                Guardian = student.Guardian,
                Siblings = children.Where(c => c.StudentId != student.StudentId).ToList(),
                Attendance = new AttendanceService(Db, Audit).SummaryFor(
                    student.StudentId,
                    year == null ? DateTime.Now.AddMonths(-6) : year.StartDate,
                    DateTime.Now),
                Ledger = new FeeService(Db, Audit).LedgerFor(student.StudentId),
                Results = results
            });
        }
    }

    // =========================================================================
    // Settings (§3, §4, §12, §15)
    // =========================================================================

    [Authorize(Roles = "ADMIN")]
    public class SettingsController : BaseController
    {
        public ActionResult Index()
        {
            var guardianCount = Db.Guardians.Count();
            var smsCostPerSend = guardianCount * 0.30m;

            return View(new SettingsViewModel
            {
                Modules = Modules.All(),
                RecentAudit = Audit.Recent(50),
                RecentBackups = Db.BackupLog.AsNoTracking()
                    .OrderByDescending(b => b.StartedAtUtc)
                    .Take(10)
                    .ToList(),
                GuardianCount = guardianCount,
                SmsCostPerSend = smsCostPerSend,
                // Two sends a month is the realistic cadence the requirement
                // assumed; showing the annual figure is what makes §12's deferral
                // an informed decision rather than an omission.
                SmsCostPerYear = smsCostPerSend * 24m,
                SmsGatewayConfigured = !string.IsNullOrWhiteSpace(ConfigurationManager.AppSettings["Sms:Provider"]),
                EmailDailyCap = 300
            });
        }

        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult ToggleModule(string moduleCode, bool enabled)
        {
            try
            {
                Modules.SetEnabled(moduleCode, enabled, CurrentUserId ?? 0);
                Notify(enabled
                    ? "Module switched on. It now appears for every role that uses it."
                    : "Module switched off. It is hidden from every role except Admin.");
            }
            catch (Exception ex)
            {
                Notify(ex.Message, "bad");
            }
            return RedirectToAction("Index");
        }
    }
}
