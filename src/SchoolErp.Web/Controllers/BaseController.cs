using System;
using System.Linq;
using System.Web.Mvc;
using SchoolErp.Web.Data;
using SchoolErp.Web.Data.Entities;
using SchoolErp.Web.Services;

namespace SchoolErp.Web.Controllers
{
    /// <summary>
    /// Shared plumbing for every controller: one DbContext per request, the
    /// current user, and the services built on top.
    ///
    /// Constructed by hand rather than through a container. With fourteen
    /// controllers and eight services, a DI framework would add a configuration
    /// file to keep in step and very little else — and on a 256 MB host (§3),
    /// container startup is not free.
    /// </summary>
    public abstract class BaseController : Controller
    {
        private SchoolErpContext _db;
        private IAuditService _audit;
        private IModuleService _modules;

        protected SchoolErpContext Db
        {
            get { return _db ?? (_db = new SchoolErpContext()); }
        }

        protected IAuditService Audit
        {
            get { return _audit ?? (_audit = new AuditService(Db)); }
        }

        protected IModuleService Modules
        {
            get { return _modules ?? (_modules = new ModuleService(Db, Audit)); }
        }

        /// <summary>The signed-in user's id, or null when anonymous.</summary>
        protected int? CurrentUserId
        {
            get
            {
                if (User == null || User.Identity == null || !User.Identity.IsAuthenticated) return null;

                var cached = Session == null ? null : Session["UserId"];
                if (cached is int) return (int)cached;

                var name = User.Identity.Name;
                var id = Db.Users.Where(u => u.UserName == name).Select(u => (int?)u.UserId).FirstOrDefault();
                if (id.HasValue && Session != null) Session["UserId"] = id.Value;
                return id;
            }
        }

        /// <summary>The employee record behind the signed-in user, when there is one.</summary>
        protected Employee CurrentEmployee
        {
            get
            {
                var userId = CurrentUserId;
                if (!userId.HasValue) return null;
                return Db.Employees.FirstOrDefault(e => e.UserId == userId.Value);
            }
        }

        protected AcademicYear CurrentYear
        {
            get { return Db.AcademicYears.FirstOrDefault(y => y.IsCurrent); }
        }

        /// <summary>Flash a message for the next rendered view.</summary>
        protected void Notify(string message, string tone = "ok")
        {
            TempData["Notice"] = message;
            TempData["NoticeTone"] = tone;
        }

        protected override void OnActionExecuting(ActionExecutingContext filterContext)
        {
            // The layout builds its navigation from these, so every view has them
            // without each action having to remember.
            ViewBag.Modules = Modules;
            ViewBag.AcademicYear = CurrentYear;
            base.OnActionExecuting(filterContext);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing && _db != null)
            {
                _db.Dispose();
                _db = null;
            }
            base.Dispose(disposing);
        }
    }
}
