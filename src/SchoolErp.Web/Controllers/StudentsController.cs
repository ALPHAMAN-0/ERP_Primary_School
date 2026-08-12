using System;
using System.Data.Entity;
using System.Linq;
using System.Web.Mvc;
using SchoolErp.Web.Data.Entities;
using SchoolErp.Web.Filters;
using SchoolErp.Web.Services;
using SchoolErp.Web.ViewModels;

namespace SchoolErp.Web.Controllers
{
    /// <summary>
    /// The student directory and profile (§8, §10).
    /// </summary>
    [Authorize(Roles = "ADMIN,TEACHER,ACCOUNTANT,LIBRARIAN,TRANSPORT")]
    [RequireModule("students")]
    public class StudentsController : BaseController
    {
        private const int PageSize = 25;

        public ActionResult Index(string q, int? classSectionId, int page = 1)
        {
            var year = CurrentYear;
            if (year == null) return View("NoAcademicYear");

            var query = Db.Enrolments.AsNoTracking()
                .Include(e => e.Student)
                .Include(e => e.Student.Guardian)
                .Include(e => e.ClassSection)
                .Include(e => e.ClassSection.Grade)
                .Include(e => e.ClassSection.Group)
                .Where(e => e.IsActive
                            && e.AcademicYearId == year.AcademicYearId
                            && e.Student.Status == "Active");

            if (classSectionId.HasValue)
            {
                query = query.Where(e => e.ClassSectionId == classSectionId.Value);
            }

            if (!string.IsNullOrWhiteSpace(q))
            {
                var term = q.Trim();
                // Deliberately a small set of fields: the office searches by name,
                // by identifier, or by the guardian's phone, and a wider LIKE sweep
                // across 3,000 rows on a 256 MB host (§3) is not worth the cost.
                query = query.Where(e =>
                    e.StudentId.Contains(term) ||
                    e.Student.FullName.Contains(term) ||
                    e.Student.Guardian.FatherName.Contains(term) ||
                    e.Student.Guardian.Mobile.Contains(term));
            }

            var total = query.Count();
            if (page < 1) page = 1;

            var items = query
                .OrderBy(e => e.ClassSection.GradeId)
                .ThenBy(e => e.ClassSection.Code)
                .ThenBy(e => e.RollNumber)
                .Skip((page - 1) * PageSize)
                .Take(PageSize)
                .Select(e => new StudentListItem
                {
                    StudentId = e.StudentId,
                    FullName = e.Student.FullName,
                    FullNameBn = e.Student.FullNameBn,
                    Gender = e.Student.Gender,
                    RollNumber = e.RollNumber,
                    ClassName = e.ClassSection.Grade.Name,
                    SectionName = e.ClassSection.Name,
                    GroupName = e.ClassSection.Group == null ? null : e.ClassSection.Group.Name,
                    GuardianName = e.Student.Guardian.FatherName,
                    GuardianMobile = e.Student.Guardian.Mobile
                })
                .ToList();

            return View(new StudentListViewModel
            {
                Items = items,
                Sections = Db.ClassSections.AsNoTracking()
                    .Include(c => c.Grade)
                    .Where(c => c.IsActive)
                    .OrderBy(c => c.GradeId).ThenBy(c => c.Code)
                    .ToList(),
                Query = q,
                ClassSectionId = classSectionId,
                Page = page,
                PageSize = PageSize,
                TotalCount = total
            });
        }

        public ActionResult Details(string id)
        {
            if (string.IsNullOrEmpty(id)) return HttpNotFound();

            var student = Db.Students.AsNoTracking()
                .Include(s => s.Guardian)
                .FirstOrDefault(s => s.StudentId == id);
            if (student == null) return HttpNotFound();

            var enrolment = Db.Enrolments.AsNoTracking()
                .Include(e => e.ClassSection)
                .Include(e => e.ClassSection.Grade)
                .Include(e => e.ClassSection.Group)
                .FirstOrDefault(e => e.StudentId == id && e.IsActive);

            // §10 — the other children on the same guardian account. This is the
            // relationship the parent portal is built on, so it is surfaced here
            // too: the office needs to see the family, not just the child.
            var siblings = Db.Students.AsNoTracking()
                .Where(s => s.GuardianId == student.GuardianId && s.StudentId != id)
                .ToList();

            var year = CurrentYear;
            var attendance = new AttendanceService(Db, Audit).SummaryFor(
                id,
                year == null ? DateTime.Now.AddMonths(-6) : year.StartDate,
                DateTime.Now);

            var results = Db.TermResults.AsNoTracking()
                .Include(r => r.ExamTerm)
                .Where(r => r.StudentId == id)
                .OrderBy(r => r.ExamTermId)
                .ToList();

            return View(new StudentDetailViewModel
            {
                Student = student,
                Enrolment = enrolment,
                Guardian = student.Guardian,
                Siblings = siblings,
                Attendance = attendance,
                Ledger = new FeeService(Db, Audit).LedgerFor(id),
                Results = results
            });
        }

        [Authorize(Roles = "ADMIN")]
        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult ChangeStatus(string id, string status, string reason)
        {
            var student = Db.Students.Find(id);
            if (student == null) return HttpNotFound();

            var allowed = new[] { "Active", "Withdrawn", "Graduated", "Transferred" };
            if (!allowed.Contains(status))
            {
                Notify("Unrecognised status.", "bad");
                return RedirectToAction("Details", new { id });
            }

            student.Status = status;
            student.StatusChangedOn = DateTime.Now.Date;
            student.StatusReason = reason;
            student.ModifiedAtUtc = DateTime.UtcNow;

            // Withdrawal closes the enrolment but leaves the student row and its
            // identifier in place forever (§8) — the number is never released.
            if (status != "Active")
            {
                foreach (var enrolment in Db.Enrolments.Where(e => e.StudentId == id && e.IsActive))
                {
                    enrolment.IsActive = false;
                }
            }

            Db.SaveChanges();
            Audit.Record(CurrentUserId, "student.status", "Student", id, new { status, reason });

            Notify(string.Format(
                "{0} is now marked {1}. The identifier {2} stays retired and will never be reissued.",
                student.FullName, status.ToLowerInvariant(), id));

            return RedirectToAction("Details", new { id });
        }
    }
}
