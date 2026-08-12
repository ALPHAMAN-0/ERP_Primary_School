using System.Data.Entity;
using System.Data.Entity.ModelConfiguration.Conventions;
using SchoolErp.Web.Data.Entities;

namespace SchoolErp.Web.Data
{
    /// <summary>
    /// The Entity Framework 6 context (§2).
    ///
    /// Database-first in effect: <c>database/schema.sql</c> is the authority, and
    /// the mapping below matches it exactly rather than generating it. Migrations
    /// are deliberately not enabled — on a host with one database and no automatic
    /// backups (§3), a schema change should be a reviewed script, not something an
    /// application start-up can trigger.
    /// </summary>
    public class SchoolErpContext : DbContext
    {
        public SchoolErpContext() : base("name=SchoolErpContext")
        {
            // Lazy loading off by default: a tabulation sheet that lazily loads a
            // student per row is 3,000 round trips. Every query in the services
            // states its Includes explicitly.
            Configuration.LazyLoadingEnabled = false;
            Configuration.ProxyCreationEnabled = false;
        }

        public SchoolErpContext(string nameOrConnectionString) : base(nameOrConnectionString)
        {
            Configuration.LazyLoadingEnabled = false;
            Configuration.ProxyCreationEnabled = false;
        }

        // Academic
        public virtual DbSet<AcademicYear> AcademicYears { get; set; }
        public virtual DbSet<Grade> Grades { get; set; }
        public virtual DbSet<Group> Groups { get; set; }
        public virtual DbSet<ClassSection> ClassSections { get; set; }
        public virtual DbSet<Subject> Subjects { get; set; }
        public virtual DbSet<CurriculumSubject> CurriculumSubjects { get; set; }
        public virtual DbSet<GradeScaleRow> GradeScale { get; set; }

        // Security
        public virtual DbSet<AppUser> Users { get; set; }
        public virtual DbSet<AppRole> Roles { get; set; }
        public virtual DbSet<UserRole> UserRoles { get; set; }

        // People
        public virtual DbSet<Guardian> Guardians { get; set; }
        public virtual DbSet<Student> Students { get; set; }
        public virtual DbSet<StudentIdSequence> StudentIdSequences { get; set; }
        public virtual DbSet<Enrolment> Enrolments { get; set; }
        public virtual DbSet<Employee> Employees { get; set; }

        // Attendance and exams
        public virtual DbSet<AttendanceEntry> Attendance { get; set; }
        public virtual DbSet<ExamTerm> ExamTerms { get; set; }
        public virtual DbSet<Mark> Marks { get; set; }
        public virtual DbSet<TermResultRow> TermResults { get; set; }
        public virtual DbSet<RoutineSlot> RoutineSlots { get; set; }

        // Fees
        public virtual DbSet<FeeHead> FeeHeads { get; set; }
        public virtual DbSet<FeeStructure> FeeStructures { get; set; }
        public virtual DbSet<WaiverRow> Waivers { get; set; }
        public virtual DbSet<Invoice> Invoices { get; set; }
        public virtual DbSet<InvoiceLine> InvoiceLines { get; set; }
        public virtual DbSet<Payment> Payments { get; set; }

        // Communication
        public virtual DbSet<Notice> Notices { get; set; }
        public virtual DbSet<NotificationQueueItem> NotificationQueue { get; set; }

        // System
        public virtual DbSet<ModuleSetting> ModuleSettings { get; set; }
        public virtual DbSet<AppSetting> AppSettings { get; set; }
        public virtual DbSet<AuditEntry> AuditLog { get; set; }
        public virtual DbSet<BackupEntry> BackupLog { get; set; }

        protected override void OnModelCreating(DbModelBuilder modelBuilder)
        {
            // The schema pluralises deliberately and irregularly in places, so the
            // convention is switched off and every table named explicitly.
            modelBuilder.Conventions.Remove<PluralizingTableNameConvention>();

            // §13 — every string column is nvarchar so Bangla round-trips. EF6
            // defaults to Unicode, but stating it removes any doubt for anyone
            // reading this file next to the DDL.
            modelBuilder.Properties<string>().Configure(c => c.IsUnicode(true));

            // Money is decimal(12,2) throughout — never float. A fee ledger that
            // drifts is a ledger nobody trusts.
            modelBuilder.Properties<decimal>().Configure(c => c.HasPrecision(12, 2));

            ConfigureAcademic(modelBuilder);
            ConfigureSecurity(modelBuilder);
            ConfigurePeople(modelBuilder);
            ConfigureAttendanceAndExams(modelBuilder);
            ConfigureFees(modelBuilder);
            ConfigureCommunication(modelBuilder);
            ConfigureSystem(modelBuilder);

            base.OnModelCreating(modelBuilder);
        }

        private static void ConfigureAcademic(DbModelBuilder b)
        {
            b.Entity<AcademicYear>().ToTable("AcademicYears");
            b.Entity<Grade>().ToTable("Grades");
            b.Entity<Group>().ToTable("Groups");
            b.Entity<Subject>().ToTable("Subjects");
            b.Entity<CurriculumSubject>().ToTable("CurriculumSubjects");

            b.Entity<GradeScaleRow>().ToTable("GradeScale");
            b.Entity<GradeScaleRow>().Property(g => g.MinPercent).HasPrecision(5, 2);
            b.Entity<GradeScaleRow>().Property(g => g.MaxPercent).HasPrecision(5, 2);
            b.Entity<GradeScaleRow>().Property(g => g.GradePoint).HasPrecision(3, 2);

            b.Entity<ClassSection>().ToTable("ClassSections");
            b.Entity<ClassSection>()
                .HasRequired(c => c.Grade)
                .WithMany(g => g.ClassSections)
                .HasForeignKey(c => c.GradeId)
                .WillCascadeOnDelete(false);
            b.Entity<ClassSection>()
                .HasOptional(c => c.Group)
                .WithMany()
                .HasForeignKey(c => c.GroupId)
                .WillCascadeOnDelete(false);
            b.Entity<ClassSection>()
                .HasOptional(c => c.ClassTeacher)
                .WithMany()
                .HasForeignKey(c => c.ClassTeacherId)
                .WillCascadeOnDelete(false);
        }

        private static void ConfigureSecurity(DbModelBuilder b)
        {
            b.Entity<AppUser>().ToTable("Users");
            b.Entity<AppRole>().ToTable("Roles");

            b.Entity<UserRole>().ToTable("UserRoles");
            b.Entity<UserRole>().HasKey(ur => new { ur.UserId, ur.RoleId });
            b.Entity<UserRole>()
                .HasRequired(ur => ur.User)
                .WithMany(u => u.UserRoles)
                .HasForeignKey(ur => ur.UserId);
            b.Entity<UserRole>()
                .HasRequired(ur => ur.Role)
                .WithMany(r => r.UserRoles)
                .HasForeignKey(ur => ur.RoleId)
                .WillCascadeOnDelete(false);
        }

        private static void ConfigurePeople(DbModelBuilder b)
        {
            b.Entity<Guardian>().ToTable("Guardians");
            b.Entity<Guardian>()
                .HasOptional(g => g.User)
                .WithMany()
                .HasForeignKey(g => g.UserId)
                .WillCascadeOnDelete(false);

            b.Entity<Student>().ToTable("Students");
            b.Entity<Student>().Property(s => s.StudentId).IsFixedLength().HasMaxLength(8);
            b.Entity<Student>()
                .HasRequired(s => s.Guardian)
                .WithMany(g => g.Children)
                .HasForeignKey(s => s.GuardianId)
                .WillCascadeOnDelete(false);

            b.Entity<StudentIdSequence>().ToTable("StudentIdSequence");
            b.Entity<StudentIdSequence>().Property(s => s.YearMonth).IsFixedLength().HasMaxLength(4);

            b.Entity<Enrolment>().ToTable("Enrolments");
            b.Entity<Enrolment>()
                .HasRequired(e => e.Student)
                .WithMany(s => s.Enrolments)
                .HasForeignKey(e => e.StudentId)
                .WillCascadeOnDelete(false);
            b.Entity<Enrolment>()
                .HasRequired(e => e.ClassSection)
                .WithMany(c => c.Enrolments)
                .HasForeignKey(e => e.ClassSectionId)
                .WillCascadeOnDelete(false);
            b.Entity<Enrolment>()
                .HasRequired(e => e.AcademicYear)
                .WithMany(y => y.Enrolments)
                .HasForeignKey(e => e.AcademicYearId)
                .WillCascadeOnDelete(false);
            b.Entity<Enrolment>()
                .HasOptional(e => e.OptionalSubject)
                .WithMany()
                .HasForeignKey(e => e.OptionalSubjectId)
                .WillCascadeOnDelete(false);

            b.Entity<Employee>().ToTable("Employees");
            b.Entity<Employee>()
                .HasOptional(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .WillCascadeOnDelete(false);
            b.Entity<Employee>()
                .HasOptional(e => e.PrimarySubject)
                .WithMany()
                .HasForeignKey(e => e.PrimarySubjectId)
                .WillCascadeOnDelete(false);
        }

        private static void ConfigureAttendanceAndExams(DbModelBuilder b)
        {
            b.Entity<AttendanceEntry>().ToTable("Attendance");
            b.Entity<AttendanceEntry>().Property(a => a.Status).IsFixedLength().HasMaxLength(1).IsUnicode(false);
            b.Entity<AttendanceEntry>()
                .HasRequired(a => a.Student)
                .WithMany(s => s.AttendanceEntries)
                .HasForeignKey(a => a.StudentId)
                .WillCascadeOnDelete(false);
            b.Entity<AttendanceEntry>()
                .HasOptional(a => a.Subject)
                .WithMany()
                .HasForeignKey(a => a.SubjectId)
                .WillCascadeOnDelete(false);

            b.Entity<ExamTerm>().ToTable("ExamTerms");
            b.Entity<ExamTerm>()
                .HasRequired(t => t.AcademicYear)
                .WithMany(y => y.ExamTerms)
                .HasForeignKey(t => t.AcademicYearId)
                .WillCascadeOnDelete(false);

            b.Entity<Mark>().ToTable("Marks");
            b.Entity<Mark>().Property(m => m.ObtainedMarks).HasPrecision(6, 2);
            b.Entity<Mark>()
                .HasRequired(m => m.Student)
                .WithMany(s => s.Marks)
                .HasForeignKey(m => m.StudentId)
                .WillCascadeOnDelete(false);
            b.Entity<Mark>()
                .HasRequired(m => m.Subject)
                .WithMany()
                .HasForeignKey(m => m.SubjectId)
                .WillCascadeOnDelete(false);
            b.Entity<Mark>()
                .HasRequired(m => m.ExamTerm)
                .WithMany()
                .HasForeignKey(m => m.ExamTermId)
                .WillCascadeOnDelete(false);

            b.Entity<TermResultRow>().ToTable("TermResults");
            b.Entity<TermResultRow>().Property(r => r.TotalMarks).HasPrecision(8, 2);
            b.Entity<TermResultRow>().Property(r => r.TotalFullMarks).HasPrecision(8, 2);
            b.Entity<TermResultRow>().Property(r => r.Gpa).HasPrecision(3, 2);
            b.Entity<TermResultRow>()
                .HasRequired(r => r.Student)
                .WithMany()
                .HasForeignKey(r => r.StudentId)
                .WillCascadeOnDelete(false);
            b.Entity<TermResultRow>()
                .HasRequired(r => r.ExamTerm)
                .WithMany()
                .HasForeignKey(r => r.ExamTermId)
                .WillCascadeOnDelete(false);

            b.Entity<RoutineSlot>().ToTable("RoutineSlots");
            b.Entity<RoutineSlot>()
                .HasRequired(r => r.ClassSection)
                .WithMany()
                .HasForeignKey(r => r.ClassSectionId)
                .WillCascadeOnDelete(false);
            b.Entity<RoutineSlot>()
                .HasRequired(r => r.Subject)
                .WithMany()
                .HasForeignKey(r => r.SubjectId)
                .WillCascadeOnDelete(false);
            b.Entity<RoutineSlot>()
                .HasRequired(r => r.Employee)
                .WithMany()
                .HasForeignKey(r => r.EmployeeId)
                .WillCascadeOnDelete(false);
        }

        private static void ConfigureFees(DbModelBuilder b)
        {
            b.Entity<FeeHead>().ToTable("FeeHeads");
            b.Entity<WaiverRow>().ToTable("Waivers");
            b.Entity<WaiverRow>().Property(w => w.Percent).HasPrecision(5, 2);

            b.Entity<FeeStructure>().ToTable("FeeStructures");
            b.Entity<FeeStructure>()
                .HasRequired(f => f.FeeHead)
                .WithMany()
                .HasForeignKey(f => f.FeeHeadId)
                .WillCascadeOnDelete(false);
            b.Entity<FeeStructure>()
                .HasOptional(f => f.Grade)
                .WithMany()
                .HasForeignKey(f => f.GradeId)
                .WillCascadeOnDelete(false);

            b.Entity<Invoice>().ToTable("Invoices");
            b.Entity<Invoice>()
                .HasRequired(i => i.Student)
                .WithMany()
                .HasForeignKey(i => i.StudentId)
                .WillCascadeOnDelete(false);

            b.Entity<InvoiceLine>().ToTable("InvoiceLines");
            b.Entity<InvoiceLine>()
                .HasRequired(l => l.Invoice)
                .WithMany(i => i.Lines)
                .HasForeignKey(l => l.InvoiceId);
            b.Entity<InvoiceLine>()
                .HasRequired(l => l.FeeHead)
                .WithMany()
                .HasForeignKey(l => l.FeeHeadId)
                .WillCascadeOnDelete(false);

            b.Entity<Payment>().ToTable("Payments");
            b.Entity<Payment>()
                .HasRequired(p => p.Student)
                .WithMany()
                .HasForeignKey(p => p.StudentId)
                .WillCascadeOnDelete(false);
            b.Entity<Payment>()
                .HasOptional(p => p.Invoice)
                .WithMany()
                .HasForeignKey(p => p.InvoiceId)
                .WillCascadeOnDelete(false);
        }

        private static void ConfigureCommunication(DbModelBuilder b)
        {
            b.Entity<Notice>().ToTable("Notices");
            b.Entity<Notice>().Property(n => n.Body).IsMaxLength();

            b.Entity<NotificationQueueItem>().ToTable("NotificationQueue");
            b.Entity<NotificationQueueItem>().Property(n => n.EstimatedCostBdt).HasPrecision(8, 4);
        }

        private static void ConfigureSystem(DbModelBuilder b)
        {
            b.Entity<ModuleSetting>().ToTable("ModuleSettings");
            b.Entity<AppSetting>().ToTable("AppSettings");
            b.Entity<AuditEntry>().ToTable("AuditLog");
            b.Entity<BackupEntry>().ToTable("BackupLog");
        }
    }
}
