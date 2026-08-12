using System;
using System.Configuration;
using System.Web.Mvc;
using System.Web.Optimization;
using System.Web.Routing;
using Hangfire;
using Hangfire.SqlServer;
using SchoolErp.Web.Data;
using SchoolErp.Web.Filters;
using SchoolErp.Web.Services;

namespace SchoolErp.Web
{
    public static class RouteConfig
    {
        public static void RegisterRoutes(RouteCollection routes)
        {
            routes.IgnoreRoute("{resource}.axd/{*pathInfo}");

            // Student identifiers are eight digits and appear in URLs constantly
            // (§8), so they get a named route ahead of the default. It keeps
            // /students/26080005 readable rather than /students/details/26080005.
            routes.MapRoute(
                name: "StudentProfile",
                url: "students/{id}",
                defaults: new { controller = "Students", action = "Details" },
                constraints: new { id = @"^\d{8}$" });

            routes.MapRoute(
                name: "ReportCard",
                url: "exams/report-card/{studentId}/{examTermId}",
                defaults: new { controller = "Exams", action = "ReportCard" },
                constraints: new { studentId = @"^\d{8}$", examTermId = @"^\d+$" });

            routes.MapRoute(
                name: "Default",
                url: "{controller}/{action}/{id}",
                defaults: new { controller = "Home", action = "Index", id = UrlParameter.Optional });
        }
    }

    public static class FilterConfig
    {
        public static void RegisterGlobalFilters(GlobalFilterCollection filters)
        {
            filters.Add(new HandleErrorAttribute());

            // Authentication is required everywhere by default; screens that are
            // genuinely public opt out with [AllowAnonymous]. The inverse — opting
            // in per controller — is the arrangement where one forgotten attribute
            // exposes a student record.
            filters.Add(new AuthorizeAttribute());
        }
    }

    public static class BundleConfig
    {
        public static void RegisterBundles(BundleCollection bundles)
        {
            bundles.Add(new ScriptBundle("~/bundles/jquery").Include(
                "~/Scripts/jquery-{version}.js"));

            bundles.Add(new ScriptBundle("~/bundles/jqueryval").Include(
                "~/Scripts/jquery.validate*"));

            bundles.Add(new ScriptBundle("~/bundles/bootstrap").Include(
                "~/Scripts/bootstrap.bundle.js"));

            bundles.Add(new ScriptBundle("~/bundles/app").Include(
                "~/Scripts/app.js"));

            // §2 — Bootstrap 5, because most parents and teachers are on phones.
            bundles.Add(new StyleBundle("~/Content/css").Include(
                "~/Content/bootstrap.css",
                "~/Content/site.css"));
        }
    }

    /// <summary>
    /// §2, §15 — Hangfire, which runs the backup and the notification queue.
    /// </summary>
    public static class HangfireConfig
    {
        public static void Register()
        {
            var connectionString = ConfigurationManager
                .ConnectionStrings["SchoolErpContext"].ConnectionString;

            GlobalConfiguration.Configuration.UseSqlServerStorage(
                connectionString,
                new SqlServerStorageOptions
                {
                    // The free tier gives 256 MB of RAM and one database (§3), so
                    // Hangfire is tuned to stay quiet rather than to be responsive.
                    // A 30-second poll on an ERP whose only jobs run nightly is
                    // pure overhead.
                    QueuePollInterval = TimeSpan.FromMinutes(1),
                    SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
                    JobExpirationCheckInterval = TimeSpan.FromHours(1),
                    UseRecommendedIsolationLevel = true,
                    DisableGlobalLocks = true
                });

            // §15 — nightly at 02:00 Dhaka time, exported and shipped off-site.
            RecurringJob.AddOrUpdate<IBackupService>(
                "nightly-backup",
                service => service.RunNightlyBackup(),
                "0 2 * * *",
                TimeZoneInfo.FindSystemTimeZoneById("Bangladesh Standard Time"));

            // §12 — drain the outbound queue. Email is delivered; SMS rows are
            // moved to Held, because no gateway is wired.
            RecurringJob.AddOrUpdate<INotificationService>(
                "drain-notifications",
                service => service.Drain(100),
                "*/15 * * * *",
                TimeZoneInfo.FindSystemTimeZoneById("Bangladesh Standard Time"));
        }
    }

    /// <summary>
    /// The composition root.
    ///
    /// A single static factory rather than a container: with fourteen controllers
    /// and eight services, a DI framework buys configuration to maintain and very
    /// little else, and container start-up is not free on a 256 MB host (§3).
    /// </summary>
    public static class ServiceLocator
    {
        public static void Register()
        {
            // The module filter is the one place a static hook is genuinely needed:
            // an ActionFilterAttribute is constructed by MVC, so it cannot take
            // constructor dependencies.
            RequireModuleAttribute.ModuleServiceFactory = () =>
            {
                var db = new SchoolErpContext();
                return new ModuleService(db, new AuditService(db));
            };

            // Hangfire activates job types by interface; these map them.
            GlobalConfiguration.Configuration.UseActivator(new SimpleJobActivator());
        }

        private class SimpleJobActivator : JobActivator
        {
            public override object ActivateJob(Type jobType)
            {
                var db = new SchoolErpContext();

                if (jobType == typeof(IBackupService) || jobType == typeof(BackupService))
                    return new BackupService(db);

                if (jobType == typeof(INotificationService) || jobType == typeof(NotificationService))
                    return new NotificationService(db);

                return base.ActivateJob(jobType);
            }
        }
    }
}
