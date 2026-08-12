using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SchoolErp.Web.Data.Entities
{
    // =========================================================================
    // Academic structure (§5, §7)
    // =========================================================================

    public class AcademicYear
    {
        public int AcademicYearId { get; set; }
        public short Year { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public bool IsCurrent { get; set; }
        public DateTime CreatedAtUtc { get; set; }

        public virtual ICollection<Enrolment> Enrolments { get; set; }
        public virtual ICollection<ExamTerm> ExamTerms { get; set; }
    }

    public class Grade
    {
        /// <summary>0 = KG, 1–12 = Class 1–12. Not generated: these are fixed identifiers.</summary>
        [DatabaseGenerated(DatabaseGeneratedOption.None)]
        public byte GradeId { get; set; }

        [Required, StringLength(8)]
        public string Code { get; set; }

        [Required, StringLength(40)]
        public string Name { get; set; }

        [Required, StringLength(40)]
        public string NameBn { get; set; }

        /// <summary>"School" (KG–10) or "College" (11–12) — §1.</summary>
        [Required, StringLength(10)]
        public string SchoolSection { get; set; }

        /// <summary>§5 — groups apply from Class 9 upward.</summary>
        public bool HasGroups { get; set; }

        /// <summary>§6 — "Daily" for KG–10, "Period" for 11–12.</summary>
        [Required, StringLength(10)]
        public string AttendanceMode { get; set; }

        [StringLength(10)]
        public string TerminalExam { get; set; }

        public virtual ICollection<ClassSection> ClassSections { get; set; }
    }

    public class Group
    {
        [DatabaseGenerated(DatabaseGeneratedOption.None)]
        public byte GroupId { get; set; }

        [Required, StringLength(8)]
        public string Code { get; set; }

        [Required, StringLength(40)]
        public string Name { get; set; }

        [Required, StringLength(40)]
        public string NameBn { get; set; }
    }

    public class ClassSection
    {
        public int ClassSectionId { get; set; }
        public byte GradeId { get; set; }

        [Required, StringLength(12)]
        public string Code { get; set; }

        [Required, StringLength(40)]
        public string Name { get; set; }

        public byte? GroupId { get; set; }
        public short Capacity { get; set; }
        public int? ClassTeacherId { get; set; }
        public bool IsActive { get; set; }

        public virtual Grade Grade { get; set; }
        public virtual Group Group { get; set; }
        public virtual Employee ClassTeacher { get; set; }
        public virtual ICollection<Enrolment> Enrolments { get; set; }

        [NotMapped]
        public string DisplayName
        {
            get { return Grade == null ? Name : Grade.Name + " — " + Name; }
        }
    }

    public class Subject
    {
        public int SubjectId { get; set; }

        [Required, StringLength(12)]
        public string Code { get; set; }

        [Required, StringLength(120)]
        public string Name { get; set; }

        [Required, StringLength(120)]
        public string NameBn { get; set; }

        public short FullMarks { get; set; }

        /// <summary>§7 — the optional (4th) subject.</summary>
        public bool IsOptional { get; set; }
    }

    public class CurriculumSubject
    {
        public int CurriculumSubjectId { get; set; }
        public byte GradeId { get; set; }
        public byte? GroupId { get; set; }
        public int SubjectId { get; set; }
        public short DisplayOrder { get; set; }

        public virtual Grade Grade { get; set; }
        public virtual Group Group { get; set; }
        public virtual Subject Subject { get; set; }
    }

    /// <summary>
    /// §7 — the board grading table, loaded from the database so a board revision
    /// is a data change rather than a deployment.
    /// </summary>
    public class GradeScaleRow
    {
        [DatabaseGenerated(DatabaseGeneratedOption.None)]
        public byte GradeScaleId { get; set; }

        public decimal MinPercent { get; set; }
        public decimal MaxPercent { get; set; }

        [Required, StringLength(4)]
        public string LetterGrade { get; set; }

        public decimal GradePoint { get; set; }

        [Required, StringLength(40)]
        public string Remark { get; set; }
    }

    // =========================================================================
    // Security (§9, §10)
    // =========================================================================

    public class AppRole
    {
        [DatabaseGenerated(DatabaseGeneratedOption.None)]
        public byte RoleId { get; set; }

        [Required, StringLength(20)]
        public string Code { get; set; }

        [Required, StringLength(60)]
        public string Name { get; set; }

        [StringLength(200)]
        public string Description { get; set; }

        public virtual ICollection<UserRole> UserRoles { get; set; }
    }

    public class AppUser
    {
        public int UserId { get; set; }

        [Required, StringLength(64)]
        public string UserName { get; set; }

        /// <summary>§10 — guardians sign in with the mobile recorded at admission.</summary>
        [StringLength(14)]
        public string Mobile { get; set; }

        [StringLength(160)]
        public string Email { get; set; }

        [Required, StringLength(200)]
        public string PasswordHash { get; set; }

        [Required, StringLength(64)]
        public string SecurityStamp { get; set; }

        public bool IsActive { get; set; }
        public bool MustChangePassword { get; set; }
        public DateTime? LastLoginUtc { get; set; }
        public byte FailedLoginCount { get; set; }
        public DateTime? LockoutEndUtc { get; set; }
        public DateTime CreatedAtUtc { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }

        public virtual ICollection<UserRole> UserRoles { get; set; }
    }

    /// <summary>
    /// §9 — fixed roles, not a permission matrix. A staff member wearing several
    /// hats simply holds several of these rows.
    /// </summary>
    public class UserRole
    {
        public int UserId { get; set; }
        public byte RoleId { get; set; }
        public DateTime AssignedAtUtc { get; set; }

        public virtual AppUser User { get; set; }
        public virtual AppRole Role { get; set; }
    }

    // =========================================================================
    // People (§8, §10)
    // =========================================================================

    public class Guardian
    {
        public int GuardianId { get; set; }
        public int? UserId { get; set; }

        [Required, StringLength(120)]
        public string FatherName { get; set; }

        [Required, StringLength(120)]
        public string FatherNameBn { get; set; }

        [StringLength(60)]
        public string FatherOccupation { get; set; }

        [Required, StringLength(120)]
        public string MotherName { get; set; }

        [Required, StringLength(120)]
        public string MotherNameBn { get; set; }

        [StringLength(60)]
        public string MotherOccupation { get; set; }

        [Required, StringLength(14)]
        public string Mobile { get; set; }

        [StringLength(14)]
        public string AlternateMobile { get; set; }

        [StringLength(160)]
        public string Email { get; set; }

        [StringLength(20)]
        public string NationalId { get; set; }

        [Required, StringLength(300)]
        public string Address { get; set; }

        [StringLength(80)]
        public string Area { get; set; }

        /// <summary>§10 — the account links only after the office verifies it.</summary>
        public bool IsVerified { get; set; }
        public DateTime? VerifiedAtUtc { get; set; }
        public int? VerifiedByUserId { get; set; }

        public DateTime CreatedAtUtc { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }

        public virtual AppUser User { get; set; }

        /// <summary>§10 — one guardian account, one or more children.</summary>
        public virtual ICollection<Student> Children { get; set; }
    }

    public class Student
    {
        /// <summary>
        /// §8 — the permanent YYMMSSSS identifier, and the primary key.
        ///
        /// Making it the key rather than a surrogate is the point: the database
        /// itself then guarantees the identifier is never reused, including after
        /// graduation or withdrawal.
        /// </summary>
        [Key, DatabaseGenerated(DatabaseGeneratedOption.None), StringLength(8)]
        public string StudentId { get; set; }

        [Required, StringLength(120)]
        public string FullName { get; set; }

        [Required, StringLength(120)]
        public string FullNameBn { get; set; }

        [Required, StringLength(10)]
        public string Gender { get; set; }

        public DateTime DateOfBirth { get; set; }

        [StringLength(30)]
        public string BirthCertificateNo { get; set; }

        [StringLength(30)]
        public string Religion { get; set; }

        [StringLength(4)]
        public string BloodGroup { get; set; }

        public int GuardianId { get; set; }

        /// <summary>
        /// §14 — a relative path on the website's file storage. Never the image
        /// bytes: the free tier gives 5 GB of disk but only 1 GB of database.
        /// </summary>
        [StringLength(260)]
        public string PhotoPath { get; set; }

        public DateTime AdmittedOn { get; set; }
        public byte AdmissionGradeId { get; set; }

        [Required, StringLength(16)]
        public string Status { get; set; }

        public DateTime? StatusChangedOn { get; set; }

        [StringLength(200)]
        public string StatusReason { get; set; }

        public DateTime CreatedAtUtc { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }

        public virtual Guardian Guardian { get; set; }
        public virtual ICollection<Enrolment> Enrolments { get; set; }
        public virtual ICollection<AttendanceEntry> AttendanceEntries { get; set; }
        public virtual ICollection<Mark> Marks { get; set; }
    }

    /// <summary>
    /// §8 — one monotonic serial counter per YYMM bucket.
    ///
    /// Never rewound, so withdrawing a student does not free their number. The
    /// admission transaction takes UPDLOCK on the row (see AdmissionService), which
    /// is what makes concurrent admissions safe.
    /// </summary>
    public class StudentIdSequence
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.None), StringLength(4)]
        public string YearMonth { get; set; }

        public short NextSerial { get; set; }
        public DateTime ModifiedAtUtc { get; set; }
    }

    public class Enrolment
    {
        public int EnrolmentId { get; set; }

        [Required, StringLength(8)]
        public string StudentId { get; set; }

        public int AcademicYearId { get; set; }
        public int ClassSectionId { get; set; }
        public short RollNumber { get; set; }

        /// <summary>§7 — which optional subject this student sits, if any.</summary>
        public int? OptionalSubjectId { get; set; }

        [Required, StringLength(20)]
        public string WaiverCode { get; set; }

        public bool IsActive { get; set; }
        public DateTime CreatedAtUtc { get; set; }

        public virtual Student Student { get; set; }
        public virtual AcademicYear AcademicYear { get; set; }
        public virtual ClassSection ClassSection { get; set; }
        public virtual Subject OptionalSubject { get; set; }
    }

    public class Employee
    {
        public int EmployeeId { get; set; }

        [Required, StringLength(16)]
        public string EmployeeCode { get; set; }

        public int? UserId { get; set; }

        [Required, StringLength(120)]
        public string FullName { get; set; }

        [Required, StringLength(120)]
        public string FullNameBn { get; set; }

        [Required, StringLength(10)]
        public string Gender { get; set; }

        [Required, StringLength(60)]
        public string Designation { get; set; }

        public byte PayGrade { get; set; }

        [StringLength(30)]
        public string Department { get; set; }

        public int? PrimarySubjectId { get; set; }

        [Required, StringLength(14)]
        public string Mobile { get; set; }

        [StringLength(160)]
        public string Email { get; set; }

        [StringLength(20)]
        public string NationalId { get; set; }

        public DateTime JoinedOn { get; set; }

        public decimal BasicSalary { get; set; }
        public decimal HouseRent { get; set; }
        public decimal MedicalAllowance { get; set; }
        public decimal TransportAllowance { get; set; }

        [StringLength(260)]
        public string PhotoPath { get; set; }

        [Required, StringLength(16)]
        public string Status { get; set; }

        public DateTime CreatedAtUtc { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }

        public virtual AppUser User { get; set; }
        public virtual Subject PrimarySubject { get; set; }
    }

    // =========================================================================
    // Attendance and examinations (§6, §7)
    // =========================================================================

    public class AttendanceEntry
    {
        public long AttendanceId { get; set; }

        [Required, StringLength(8)]
        public string StudentId { get; set; }

        public DateTime Date { get; set; }

        /// <summary>§6 — 0 for the school section's daily record; 1–8 for period-wise.</summary>
        public byte Period { get; set; }

        /// <summary>P present, A absent, L late, E excused.</summary>
        [Required, StringLength(1)]
        public string Status { get; set; }

        public int? SubjectId { get; set; }
        public int? MarkedByEmployeeId { get; set; }
        public DateTime MarkedAtUtc { get; set; }

        [StringLength(120)]
        public string Remarks { get; set; }

        public virtual Student Student { get; set; }
        public virtual Subject Subject { get; set; }
    }

    public class ExamTerm
    {
        public int ExamTermId { get; set; }
        public int AcademicYearId { get; set; }

        [Required, StringLength(10)]
        public string Code { get; set; }

        [Required, StringLength(60)]
        public string Name { get; set; }

        [Required, StringLength(60)]
        public string NameBn { get; set; }

        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }

        /// <summary>The board-prep Test Examination, taken only by Class 10 and 12.</summary>
        public bool BoardPrepOnly { get; set; }

        /// <summary>Marks cannot be entered once locked.</summary>
        public bool IsLocked { get; set; }

        /// <summary>Students and guardians see nothing until published.</summary>
        public bool IsPublished { get; set; }

        public DateTime? PublishedAtUtc { get; set; }

        public virtual AcademicYear AcademicYear { get; set; }
    }

    public class Mark
    {
        public long MarkId { get; set; }

        [Required, StringLength(8)]
        public string StudentId { get; set; }

        public int ExamTermId { get; set; }
        public int SubjectId { get; set; }

        /// <summary>Null means the candidate did not sit the paper.</summary>
        public decimal? ObtainedMarks { get; set; }

        public bool IsAbsent { get; set; }
        public int? EnteredByEmployeeId { get; set; }
        public DateTime EnteredAtUtc { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }

        public virtual Student Student { get; set; }
        public virtual ExamTerm ExamTerm { get; set; }
        public virtual Subject Subject { get; set; }
    }

    /// <summary>
    /// §7 — the computed result.
    ///
    /// Stored rather than derived on read: on 256 MB of RAM (§3), recomputing
    /// 3,000 GPAs per page view is not affordable. ExamService rewrites the row
    /// whenever a mark in the term changes.
    /// </summary>
    public class TermResultRow
    {
        public long TermResultId { get; set; }

        [Required, StringLength(8)]
        public string StudentId { get; set; }

        public int ExamTermId { get; set; }
        public decimal TotalMarks { get; set; }
        public decimal TotalFullMarks { get; set; }
        public decimal Gpa { get; set; }

        [Required, StringLength(4)]
        public string LetterGrade { get; set; }

        /// <summary>§7 — a fail in any compulsory subject fails the whole result.</summary>
        public bool HasFailed { get; set; }

        [StringLength(200)]
        public string FailedSubjectCodes { get; set; }

        public short? ClassPosition { get; set; }
        public DateTime ComputedAtUtc { get; set; }

        public virtual Student Student { get; set; }
        public virtual ExamTerm ExamTerm { get; set; }
    }

    public class RoutineSlot
    {
        public int RoutineSlotId { get; set; }
        public int AcademicYearId { get; set; }
        public int ClassSectionId { get; set; }

        /// <summary>0 = Sunday … 4 = Thursday. The institution runs Sun–Thu.</summary>
        public byte DayOfWeek { get; set; }

        public byte Period { get; set; }
        public int SubjectId { get; set; }
        public int EmployeeId { get; set; }

        [StringLength(16)]
        public string RoomCode { get; set; }

        public TimeSpan StartTime { get; set; }
        public TimeSpan EndTime { get; set; }

        public virtual ClassSection ClassSection { get; set; }
        public virtual Subject Subject { get; set; }
        public virtual Employee Employee { get; set; }
    }

    // =========================================================================
    // Fees (§11)
    // =========================================================================

    public class FeeHead
    {
        public int FeeHeadId { get; set; }

        [Required, StringLength(10)]
        public string Code { get; set; }

        [Required, StringLength(80)]
        public string Name { get; set; }

        [Required, StringLength(80)]
        public string NameBn { get; set; }

        [Required, StringLength(16)]
        public string Recurrence { get; set; }

        /// <summary>§4 — a head belonging to a switched-off module stops being billed.</summary>
        [StringLength(20)]
        public string ModuleCode { get; set; }

        public decimal? DefaultAmount { get; set; }
        public bool IsActive { get; set; }
    }

    public class FeeStructure
    {
        public int FeeStructureId { get; set; }
        public int AcademicYearId { get; set; }
        public int FeeHeadId { get; set; }
        public byte? GradeId { get; set; }
        public decimal Amount { get; set; }

        public virtual FeeHead FeeHead { get; set; }
        public virtual Grade Grade { get; set; }
    }

    public class WaiverRow
    {
        public int WaiverId { get; set; }

        [Required, StringLength(20)]
        public string Code { get; set; }

        [Required, StringLength(80)]
        public string Name { get; set; }

        public decimal Percent { get; set; }
    }

    public class Invoice
    {
        public long InvoiceId { get; set; }

        [Required, StringLength(20)]
        public string InvoiceNo { get; set; }

        [Required, StringLength(8)]
        public string StudentId { get; set; }

        public int AcademicYearId { get; set; }
        public byte? BillingMonth { get; set; }
        public DateTime IssuedOn { get; set; }
        public DateTime DueOn { get; set; }

        public decimal GrossAmount { get; set; }
        public decimal DiscountAmount { get; set; }
        public decimal FineAmount { get; set; }

        /// <summary>Computed and persisted in SQL — gross − discount + fine.</summary>
        [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
        public decimal NetAmount { get; set; }

        public decimal PaidAmount { get; set; }

        [Required, StringLength(16)]
        public string Status { get; set; }

        public DateTime CreatedAtUtc { get; set; }

        public virtual Student Student { get; set; }
        public virtual ICollection<InvoiceLine> Lines { get; set; }

        [NotMapped]
        public decimal DueAmount
        {
            get { return NetAmount - PaidAmount; }
        }
    }

    public class InvoiceLine
    {
        public long InvoiceLineId { get; set; }
        public long InvoiceId { get; set; }
        public int FeeHeadId { get; set; }

        [Required, StringLength(120)]
        public string Description { get; set; }

        public short Quantity { get; set; }
        public decimal UnitAmount { get; set; }

        [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
        public decimal LineTotal { get; set; }

        public virtual Invoice Invoice { get; set; }
        public virtual FeeHead FeeHead { get; set; }
    }

    /// <summary>
    /// §11 — V1 is manual collection at the office. PaymentMethod already carries
    /// the gateway values, so turning an online provider on is an integration
    /// rather than a schema change.
    /// </summary>
    public class Payment
    {
        public long PaymentId { get; set; }

        [Required, StringLength(20)]
        public string ReceiptNo { get; set; }

        [Required, StringLength(8)]
        public string StudentId { get; set; }

        public long? InvoiceId { get; set; }
        public decimal Amount { get; set; }

        [Required, StringLength(16)]
        public string PaymentMethod { get; set; }

        [StringLength(60)]
        public string ReferenceNo { get; set; }

        [StringLength(80)]
        public string GatewayTxnId { get; set; }

        [StringLength(200)]
        public string Particulars { get; set; }

        public DateTime ReceivedOn { get; set; }
        public int CollectedByUserId { get; set; }
        public bool IsCancelled { get; set; }

        [StringLength(200)]
        public string CancelledReason { get; set; }

        public DateTime CreatedAtUtc { get; set; }

        public virtual Student Student { get; set; }
        public virtual Invoice Invoice { get; set; }
    }

    // =========================================================================
    // Communication (§12)
    // =========================================================================

    public class Notice
    {
        public int NoticeId { get; set; }

        [Required, StringLength(200)]
        public string Title { get; set; }

        [Required]
        public string Body { get; set; }

        [Required, StringLength(30)]
        public string Audience { get; set; }

        public byte? GradeId { get; set; }

        [Required, StringLength(10)]
        public string Priority { get; set; }

        public bool IsPinned { get; set; }
        public DateTime PublishedOn { get; set; }
        public DateTime? ExpiresOn { get; set; }

        /// <summary>§14 — a path, never the bytes.</summary>
        [StringLength(260)]
        public string AttachmentPath { get; set; }

        public int CreatedByUserId { get; set; }
        public DateTime CreatedAtUtc { get; set; }
    }

    /// <summary>
    /// §12 — the Hangfire-drained outbound queue.
    ///
    /// Email rows are delivered. SMS rows are written and then sit at "Held",
    /// because no paid gateway is configured — at ~0.30 BDT a message with no
    /// free tier, that is the institution's decision to make. Writing the rows
    /// anyway is what makes the decision an informed one.
    /// </summary>
    public class NotificationQueueItem
    {
        public long NotificationId { get; set; }

        [Required, StringLength(10)]
        public string Channel { get; set; }

        public int? NoticeId { get; set; }
        public int? RecipientUserId { get; set; }

        [Required, StringLength(160)]
        public string RecipientAddress { get; set; }

        [StringLength(200)]
        public string Subject { get; set; }

        [Required, StringLength(1000)]
        public string Body { get; set; }

        [Required, StringLength(16)]
        public string Status { get; set; }

        public byte AttemptCount { get; set; }

        [StringLength(400)]
        public string LastError { get; set; }

        public decimal EstimatedCostBdt { get; set; }
        public DateTime QueuedAtUtc { get; set; }
        public DateTime? SentAtUtc { get; set; }
    }

    // =========================================================================
    // System configuration and audit (§4, §15)
    // =========================================================================

    /// <summary>
    /// §4 — the module switches. Every module ships in the codebase; the
    /// institution sees only what is switched on here.
    /// </summary>
    public class ModuleSetting
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.None), StringLength(20)]
        public string ModuleCode { get; set; }

        [Required, StringLength(60)]
        public string Name { get; set; }

        public bool IsEnabled { get; set; }

        /// <summary>Core modules cannot be switched off; a CHECK constraint enforces it.</summary>
        public bool IsCore { get; set; }

        public int? ModifiedByUserId { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }
    }

    public class AppSetting
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.None), StringLength(80)]
        public string SettingKey { get; set; }

        [StringLength(500)]
        public string SettingValue { get; set; }

        [StringLength(200)]
        public string Description { get; set; }

        public int? ModifiedByUserId { get; set; }
        public DateTime? ModifiedAtUtc { get; set; }
    }

    /// <summary>Append-only. Nothing updates or deletes from this table.</summary>
    public class AuditEntry
    {
        public long AuditId { get; set; }
        public DateTime OccurredAtUtc { get; set; }
        public int? UserId { get; set; }

        [StringLength(20)]
        public string RoleCode { get; set; }

        [Required, StringLength(60)]
        public string Action { get; set; }

        [Required, StringLength(60)]
        public string EntityName { get; set; }

        [StringLength(60)]
        public string EntityKey { get; set; }

        [StringLength(1000)]
        public string Details { get; set; }

        [StringLength(45)]
        public string IpAddress { get; set; }
    }

    /// <summary>§15 — one row per nightly backup run.</summary>
    public class BackupEntry
    {
        public int BackupId { get; set; }
        public DateTime StartedAtUtc { get; set; }
        public DateTime? CompletedAtUtc { get; set; }

        [Required, StringLength(16)]
        public string Status { get; set; }

        public long? SizeBytes { get; set; }

        [StringLength(120)]
        public string DestinationFileId { get; set; }

        [StringLength(1000)]
        public string ErrorMessage { get; set; }

        public DateTime? PurgedOlderThan { get; set; }
    }
}
