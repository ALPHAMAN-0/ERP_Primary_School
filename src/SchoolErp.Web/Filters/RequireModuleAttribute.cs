using System;
using System.Web.Mvc;
using System.Web.Routing;
using SchoolErp.Web.Services;

namespace SchoolErp.Web.Filters
{
    /// <summary>
    /// §4 — enforces the module switches at the controller boundary.
    ///
    /// Hiding a navigation link is presentation; this is the actual gate. Without
    /// it, a switched-off module stays reachable to anyone who types the URL, and
    /// the toggle would be decorative.
    ///
    /// An Admin still gets through, landing on a page that explains the module is
    /// off and offers to switch it on — so the setting stays discoverable rather
    /// than looking like a broken link.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false, Inherited = true)]
    public class RequireModuleAttribute : ActionFilterAttribute
    {
        private readonly string _moduleCode;

        public RequireModuleAttribute(string moduleCode)
        {
            if (string.IsNullOrWhiteSpace(moduleCode)) throw new ArgumentNullException("moduleCode");
            _moduleCode = moduleCode;
        }

        /// <summary>Resolved from the composition root so the filter stays testable.</summary>
        public static Func<IModuleService> ModuleServiceFactory { get; set; }

        public override void OnActionExecuting(ActionExecutingContext filterContext)
        {
            var factory = ModuleServiceFactory;
            if (factory == null) return;   // not yet wired: fail open rather than lock the app out

            var modules = factory();
            if (modules.IsEnabled(_moduleCode)) return;

            var user = filterContext.HttpContext.User;
            var isAdmin = user != null && user.Identity.IsAuthenticated && user.IsInRole("ADMIN");

            filterContext.Result = new RedirectToRouteResult(new RouteValueDictionary
            {
                { "controller", "Home" },
                { "action", "ModuleDisabled" },
                { "module", _moduleCode },
                { "canEnable", isAdmin }
            });
        }
    }
}
