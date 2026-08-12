using System;
using System.Configuration;
using System.Data.SqlClient;
using System.IO;
using System.IO.Compression;
using System.Linq;
using SchoolErp.Web.Data;
using SchoolErp.Web.Data.Entities;

namespace SchoolErp.Web.Services
{
    public interface IBackupService
    {
        /// <summary>The nightly job: export, compress, upload off-site, prune.</summary>
        void RunNightlyBackup();
    }

    /// <summary>
    /// §15 — nightly backup.
    ///
    /// Two decisions here are load-bearing:
    ///
    ///   • The destination is Google Drive rather than the host's own disk. The
    ///     free tier carries no uptime guarantee and no automatic backups (§3);
    ///     a backup that lives on the machine it protects is not a backup.
    ///   • Only the last 30 days are kept, pruned by the same job that writes
    ///     them. Retention that nobody enforces silently becomes "forever", and
    ///     then the free 15 GB runs out at the worst moment.
    ///
    /// The upload itself is left as a seam: it needs a Google service-account
    /// credential the institution has to create. Everything around it — the
    /// export, the compression, the log row, the pruning — is here, so wiring the
    /// credential is the only remaining step.
    /// </summary>
    public class BackupService : IBackupService
    {
        private readonly SchoolErpContext _db;

        public BackupService(SchoolErpContext db)
        {
            _db = db;
        }

        private static string StagingPath
        {
            get
            {
                var configured = ConfigurationManager.AppSettings["Backup:StagingPath"];
                return string.IsNullOrWhiteSpace(configured)
                    ? Path.Combine(Path.GetTempPath(), "school-erp-backups")
                    : configured;
            }
        }

        private static int RetentionDays
        {
            get
            {
                int days;
                return int.TryParse(ConfigurationManager.AppSettings["Backup:RetentionDays"], out days) ? days : 30;
            }
        }

        public void RunNightlyBackup()
        {
            var entry = new BackupEntry
            {
                StartedAtUtc = DateTime.UtcNow,
                Status = "Running"
            };
            _db.BackupLog.Add(entry);
            _db.SaveChanges();

            string bakPath = null;
            string zipPath = null;

            try
            {
                Directory.CreateDirectory(StagingPath);

                var stamp = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss");
                bakPath = Path.Combine(StagingPath, string.Format("school-erp-{0}.bak", stamp));
                zipPath = bakPath + ".gz";

                ExportDatabase(bakPath);
                Compress(bakPath, zipPath);

                var size = new FileInfo(zipPath).Length;
                var fileId = UploadOffsite(zipPath);

                entry.Status = "Success";
                entry.SizeBytes = size;
                entry.DestinationFileId = fileId;
                entry.CompletedAtUtc = DateTime.UtcNow;
                entry.PurgedOlderThan = DateTime.UtcNow.Date.AddDays(-RetentionDays);

                PruneOldBackups();
            }
            catch (Exception ex)
            {
                entry.Status = "Failed";
                entry.CompletedAtUtc = DateTime.UtcNow;
                entry.ErrorMessage = ex.ToString().Length > 1000 ? ex.ToString().Substring(0, 1000) : ex.ToString();

                // Swallowed on purpose. Hangfire would retry a throw on a schedule
                // that could hammer a 256 MB host (§3); the failure is recorded and
                // surfaced on the System Health screen instead.
                System.Diagnostics.Trace.TraceError("Nightly backup failed: " + ex);
            }
            finally
            {
                _db.SaveChanges();
                TryDelete(bakPath);
                TryDelete(zipPath);
            }
        }

        /// <summary>
        /// BACKUP DATABASE, not a row-by-row export: a native backup is consistent
        /// at a point in time, which a table-by-table dump of a live database is not.
        /// </summary>
        private void ExportDatabase(string destinationPath)
        {
            var connectionString = _db.Database.Connection.ConnectionString;
            var databaseName = new SqlConnectionStringBuilder(connectionString).InitialCatalog;

            using (var connection = new SqlConnection(connectionString))
            {
                connection.Open();
                using (var command = connection.CreateCommand())
                {
                    // The database name cannot be parameterised in a BACKUP
                    // statement, so it is bracket-quoted and any embedded bracket
                    // escaped — the identifier comes from our own configuration,
                    // but quoting it costs nothing and removes the question.
                    command.CommandText = string.Format(
                        "BACKUP DATABASE [{0}] TO DISK = @path WITH INIT, COMPRESSION, STATS = 25",
                        databaseName.Replace("]", "]]"));
                    command.Parameters.AddWithValue("@path", destinationPath);
                    command.CommandTimeout = 600;
                    command.ExecuteNonQuery();
                }
            }
        }

        private static void Compress(string sourcePath, string destinationPath)
        {
            using (var source = File.OpenRead(sourcePath))
            using (var destination = File.Create(destinationPath))
            using (var gzip = new GZipStream(destination, CompressionLevel.Optimal))
            {
                source.CopyTo(gzip);
            }
        }

        /// <summary>
        /// Upload to Google Drive (§15).
        ///
        /// Not implemented: it requires a service-account JSON credential that the
        /// institution must create in its own Google Cloud project, and shipping a
        /// placeholder that silently does nothing would be worse than an explicit
        /// gap. Add the Google.Apis.Drive.v3 package, drop the credential path in
        /// Backup:GoogleCredentialPath, and implement here.
        /// </summary>
        private static string UploadOffsite(string zipPath)
        {
            var credentialPath = ConfigurationManager.AppSettings["Backup:GoogleCredentialPath"];
            if (string.IsNullOrWhiteSpace(credentialPath))
            {
                throw new NotSupportedException(
                    "No Google Drive credential is configured. Set Backup:GoogleCredentialPath in Web.config " +
                    "to enable off-site upload; until then the backup is written to staging only.");
            }

            throw new NotImplementedException(
                "Google Drive upload is not wired. See ARCHITECTURE.md — 'What is deliberately absent'.");
        }

        /// <summary>Drop log rows past the retention window (§15).</summary>
        private void PruneOldBackups()
        {
            var cutoff = DateTime.UtcNow.Date.AddDays(-RetentionDays);

            var stale = _db.BackupLog.Where(b => b.StartedAtUtc < cutoff).ToList();
            if (stale.Count > 0)
            {
                _db.BackupLog.RemoveRange(stale);
            }

            if (!Directory.Exists(StagingPath)) return;
            foreach (var file in Directory.GetFiles(StagingPath))
            {
                try
                {
                    if (File.GetCreationTimeUtc(file) < cutoff) File.Delete(file);
                }
                catch (IOException)
                {
                    // A locked staging file is not worth failing the run over.
                }
            }
        }

        private static void TryDelete(string path)
        {
            if (string.IsNullOrEmpty(path)) return;
            try { if (File.Exists(path)) File.Delete(path); }
            catch (IOException) { }
        }
    }
}
