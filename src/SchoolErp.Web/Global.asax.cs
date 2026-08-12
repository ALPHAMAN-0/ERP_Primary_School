using System;
using System.Security.Principal;
using System.Web;
using System.Web.Mvc;
using System.Web.Optimization;
using System.Web.Routing;
using System.Web.Security;

namespace SchoolErp.Web
{
    public class MvcApplication : HttpApplication
    {
        protected void Application_Start()
        {
            AreaRegistration.RegisterAllAreas();
            FilterConfig.RegisterGlobalFilters(GlobalFilters.Filters);
            RouteConfig.RegisterRoutes(RouteTable.Routes);
            BundleConfig.RegisterBundles(BundleTable.Bundles);

            ServiceLocator.Register();
            HangfireConfig.Register();

            // Do not advertise the framework version to anyone probing the site.
            MvcHandler.DisableMvcResponseHeader = true;
        }

        /// <summary>
        /// Rebuild the principal from the roles stored in the auth ticket.
        ///
        /// §9 fixes the role set, so it is written into the ticket at sign-in and
        /// read back here. The alternative — a role provider hitting the database
        /// on every request — costs a query per page for a value that changes
        /// perhaps twice a year, and on 256 MB of RAM (§3) that is a poor trade.
        ///
        /// The cost is that a role change only takes effect at next sign-in, which
        /// is why the account screens rotate the security stamp when roles move.
        /// </summary>
        protected void Application_PostAuthenticateRequest(object sender, EventArgs e)
        {
            var identity = HttpContext.Current.User == null ? null : HttpContext.Current.User.Identity;
            if (identity == null || !identity.IsAuthenticated) return;

            var formsIdentity = identity as FormsIdentity;
            if (formsIdentity == null) return;

            var userData = formsIdentity.Ticket.UserData;
            var roles = string.IsNullOrEmpty(userData)
                ? new string[0]
                : userData.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);

            HttpContext.Current.User = new GenericPrincipal(formsIdentity, roles);
        }

        protected void Application_Error()
        {
            var exception = Server.GetLastError();
            if (exception != null)
            {
                // Traced, not rendered: customErrors decides what the user sees,
                // and a parent looking at a fee page must never see a stack trace.
                System.Diagnostics.Trace.TraceError("Unhandled: " + exception);
            }
        }
    }
}
