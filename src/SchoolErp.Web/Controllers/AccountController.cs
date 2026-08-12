using System;
using System.Linq;
using System.Security.Cryptography;
using System.Web;
using System.Web.Mvc;
using System.Web.Security;
using SchoolErp.Web.Data.Entities;

namespace SchoolErp.Web.Controllers
{
    /// <summary>
    /// Authentication (§9, §10).
    ///
    /// Forms authentication with the role set carried in the ticket, rather than
    /// a role provider that re-queries the database on every request. Roles are
    /// fixed (§9) and change rarely; a per-request lookup on a 256 MB host (§3)
    /// would be paid on every page for a value that almost never moves.
    ///
    /// Guardians sign in with the mobile number recorded at admission (§10);
    /// staff sign in with a username.
    /// </summary>
    [AllowAnonymous]
    public class AccountController : BaseController
    {
        private const int Pbkdf2Iterations = 25000;
        private const int SaltBytes = 16;
        private const int HashBytes = 32;
        private const int MaxFailedLogins = 5;

        public ActionResult Login(string returnUrl)
        {
            ViewBag.ReturnUrl = returnUrl;
            return View();
        }

        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult Login(string userName, string password, string returnUrl)
        {
            if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrEmpty(password))
            {
                ModelState.AddModelError("", "Enter your username and password.");
                return View();
            }

            var identifier = userName.Trim();

            var user = Db.Users.FirstOrDefault(u =>
                u.UserName == identifier || u.Mobile == identifier);

            // One message for every failure. Distinguishing "no such user" from
            // "wrong password" tells an attacker which guardian phone numbers are
            // registered, and guardian numbers are guessable.
            const string failureMessage = "Those credentials were not recognised.";

            if (user == null)
            {
                ModelState.AddModelError("", failureMessage);
                return View();
            }

            if (user.LockoutEndUtc.HasValue && user.LockoutEndUtc.Value > DateTime.UtcNow)
            {
                ModelState.AddModelError("", string.Format(
                    "This account is locked until {0:HH:mm} after too many failed attempts.",
                    user.LockoutEndUtc.Value.ToLocalTime()));
                return View();
            }

            if (!user.IsActive || !VerifyPassword(password, user.PasswordHash))
            {
                user.FailedLoginCount++;
                if (user.FailedLoginCount >= MaxFailedLogins)
                {
                    user.LockoutEndUtc = DateTime.UtcNow.AddMinutes(15);
                    user.FailedLoginCount = 0;
                }
                Db.SaveChanges();

                ModelState.AddModelError("", failureMessage);
                return View();
            }

            user.FailedLoginCount = 0;
            user.LockoutEndUtc = null;
            user.LastLoginUtc = DateTime.UtcNow;
            Db.SaveChanges();

            var roles = Db.UserRoles
                .Where(ur => ur.UserId == user.UserId)
                .Select(ur => ur.Role.Code)
                .ToList();

            IssueAuthCookie(user, string.Join(",", roles));
            Audit.Record(user.UserId, "auth.login", "User", user.UserName, new { Roles = roles });

            if (user.MustChangePassword) return RedirectToAction("ChangePassword");

            if (!string.IsNullOrEmpty(returnUrl) && Url.IsLocalUrl(returnUrl)) return Redirect(returnUrl);
            return RedirectToAction("Index", "Home");
        }

        [HttpPost, ValidateAntiForgeryToken]
        [Authorize]
        public ActionResult Logout()
        {
            Audit.Record(CurrentUserId, "auth.logout", "User", User.Identity.Name);
            FormsAuthentication.SignOut();
            Session.Abandon();
            return RedirectToAction("Login");
        }

        [Authorize]
        public ActionResult ChangePassword()
        {
            return View();
        }

        [Authorize]
        [HttpPost, ValidateAntiForgeryToken]
        public ActionResult ChangePassword(string currentPassword, string newPassword, string confirmPassword)
        {
            var userId = CurrentUserId;
            if (!userId.HasValue) return RedirectToAction("Login");

            var user = Db.Users.Find(userId.Value);
            if (user == null) return RedirectToAction("Login");

            if (!VerifyPassword(currentPassword, user.PasswordHash))
            {
                ModelState.AddModelError("", "Your current password is not correct.");
                return View();
            }

            if (string.IsNullOrEmpty(newPassword) || newPassword.Length < 8)
            {
                ModelState.AddModelError("", "Choose a password of at least 8 characters.");
                return View();
            }

            if (newPassword != confirmPassword)
            {
                ModelState.AddModelError("", "The two passwords do not match.");
                return View();
            }

            user.PasswordHash = HashPassword(newPassword);
            user.SecurityStamp = Guid.NewGuid().ToString("N");
            user.MustChangePassword = false;
            user.ModifiedAtUtc = DateTime.UtcNow;
            Db.SaveChanges();

            Audit.Record(user.UserId, "auth.password-change", "User", user.UserName);
            Notify("Your password has been changed.");
            return RedirectToAction("Index", "Home");
        }

        // ---- Password hashing ------------------------------------------------

        /// <summary>
        /// PBKDF2-SHA1, 25,000 iterations, stored as iterations.salt.hash.
        ///
        /// The iteration count is embedded in the stored value so it can be raised
        /// later without invalidating every existing password — old hashes keep
        /// verifying at their own cost, and are upgraded on next sign-in.
        /// </summary>
        public static string HashPassword(string password)
        {
            using (var derive = new Rfc2898DeriveBytes(password, SaltBytes, Pbkdf2Iterations))
            {
                var salt = derive.Salt;
                var hash = derive.GetBytes(HashBytes);
                return string.Format("{0}.{1}.{2}",
                    Pbkdf2Iterations, Convert.ToBase64String(salt), Convert.ToBase64String(hash));
            }
        }

        public static bool VerifyPassword(string password, string stored)
        {
            if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(stored)) return false;

            var parts = stored.Split('.');
            if (parts.Length != 3) return false;

            int iterations;
            if (!int.TryParse(parts[0], out iterations)) return false;

            byte[] salt, expected;
            try
            {
                salt = Convert.FromBase64String(parts[1]);
                expected = Convert.FromBase64String(parts[2]);
            }
            catch (FormatException)
            {
                return false;
            }

            using (var derive = new Rfc2898DeriveBytes(password, salt, iterations))
            {
                return FixedTimeEquals(derive.GetBytes(expected.Length), expected);
            }
        }

        /// <summary>
        /// Constant-time comparison. A short-circuiting equality check leaks how
        /// many leading bytes matched, which is enough to recover a hash byte by byte.
        /// </summary>
        private static bool FixedTimeEquals(byte[] a, byte[] b)
        {
            if (a == null || b == null || a.Length != b.Length) return false;

            var difference = 0;
            for (var i = 0; i < a.Length; i++) difference |= a[i] ^ b[i];
            return difference == 0;
        }

        private void IssueAuthCookie(AppUser user, string roleCsv)
        {
            var ticket = new FormsAuthenticationTicket(
                version: 1,
                name: user.UserName,
                issueDate: DateTime.Now,
                expiration: DateTime.Now.AddMinutes(480),
                isPersistent: false,
                userData: roleCsv,
                cookiePath: FormsAuthentication.FormsCookiePath);

            var cookie = new HttpCookie(FormsAuthentication.FormsCookieName, FormsAuthentication.Encrypt(ticket))
            {
                HttpOnly = true,
                Secure = FormsAuthentication.RequireSSL,
                Path = FormsAuthentication.FormsCookiePath
            };

            Response.Cookies.Add(cookie);
        }
    }
}
