using System;
using System.Collections.Generic;
using SchoolErp.Domain.Attendance;
using SchoolErp.Domain.Grading;
using SchoolErp.Web.Data.Entities;
using SchoolErp.Web.Services;

namespace SchoolErp.Web.ViewModels
{
    // =========================================================================
    // Exams (§7)
    // =========================================================================

    /// <summary>The class/term selection every exam screen shares.</summary>
    public class ExamContextViewModel
    {
        public IReadOnlyList<ClassSection> Sections { get; set; }
        public IReadOnlyList<ExamTerm> Terms { get; set; }
        public int ClassSectionId { get; set; }
        public int ExamTermId { get; set; }
        public string SectionName { get; set; }
        public string TermName { get; set; }
        public bool IsPublished { get; set; }
        public bool IsLocked { get; set; }
    }

    public class TabulationViewModel : ExamContextViewModel
    {
        public IReadOnlyList<RankedResult<StudentSummary>> Ranked { get; set; }
        public IReadOnlyList<Subject> Subjects { get; set; }
        public int Appeared { get; set; }
        public int Passed { get; set; }
        public int GpaFive { get; set; }
        public decimal AverageGpa { get; set; }

        public decimal PassRate
        {
            get { return Appeared == 0 ? 0m : Math.Round((decimal)Passed / Appeared * 100m, 1); }
        }
    }

    public class MarkEntryRow
    {
        public string StudentId { get; set; }
        public short RollNumber { get; set; }
        public string FullName { get; set; }
        public string FullNameBn { get; set; }
        public decimal? Obtained { get; set; }
    }

    public class MarkEntryViewModel
    {
        public ExamContextViewModel Context { get; set; }
        public IReadOnlyList<Subject> Subjects { get; set; }
        public Subject Subject { get; set; }
        public IReadOnlyList<MarkEntryRow> Rows { get; set; }

        /// <summary>A locked term refuses writes — the form renders read-only.</summary>
        public bool IsLocked { get; set; }
    }

    /// <summary>§13 — the Bangla-capable transcript.</summary>
    public class ReportCardViewModel
    {
        public Student Student { get; set; }
        public Enrolment Enrolment { get; set; }
        public ExamTerm Term { get; set; }
        public TermResult Result { get; set; }
        public int? ClassPosition { get; set; }
        public int ClassSize { get; set; }
        public AttendanceSummary Attendance { get; set; }
    }

    // =========================================================================
    // Students (§8, §10)
    // =========================================================================

    public class StudentListItem
    {
        public string StudentId { get; set; }
        public string FullName { get; set; }
        public string FullNameBn { get; set; }
        public string Gender { get; set; }
        public short RollNumber { get; set; }
        public string ClassName { get; set; }
        public string SectionName { get; set; }
        public string GroupName { get; set; }
        public string GuardianName { get; set; }
        public string GuardianMobile { get; set; }
    }

    public class StudentListViewModel
    {
        public IReadOnlyList<StudentListItem> Items { get; set; }
        public IReadOnlyList<ClassSection> Sections { get; set; }

        public string Query { get; set; }
        public int? ClassSectionId { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public int TotalCount { get; set; }

        public int TotalPages
        {
            get { return PageSize == 0 ? 1 : (int)Math.Ceiling((double)TotalCount / PageSize); }
        }
    }

    public class StudentDetailViewModel
    {
        public Student Student { get; set; }
        public Enrolment Enrolment { get; set; }
        public Guardian Guardian { get; set; }

        /// <summary>§10 — the other children on the same guardian account.</summary>
        public IReadOnlyList<Student> Siblings { get; set; }

        public AttendanceSummary Attendance { get; set; }
        public LedgerSummary Ledger { get; set; }
        public IReadOnlyList<TermResultRow> Results { get; set; }
    }

    // =========================================================================
    // Admissions (§8)
    // =========================================================================

    public class AdmissionFormViewModel
    {
        public AdmissionRequest Request { get; set; }
        public IReadOnlyList<ClassSection> Sections { get; set; }
        public IReadOnlyList<Subject> OptionalSubjects { get; set; }
        public IReadOnlyList<WaiverRow> Waivers { get; set; }

        /// <summary>The identifier this admission will receive, previewed before submit.</summary>
        public string NextIdentifier { get; set; }
        public MonthlyCapacity Capacity { get; set; }
    }

    // =========================================================================
    // Attendance (§6)
    // =========================================================================

    public class RegisterRow
    {
        public string StudentId { get; set; }
        public short RollNumber { get; set; }
        public string FullName { get; set; }
        public char Status { get; set; }
        public decimal YearToDatePercent { get; set; }
        public bool IsEligible { get; set; }
    }

    public class RegisterViewModel
    {
        public IReadOnlyList<ClassSection> Sections { get; set; }
        public int ClassSectionId { get; set; }
        public string SectionName { get; set; }
        public DateTime Date { get; set; }

        /// <summary>§6 — period-wise for the college section, daily for the school section.</summary>
        public bool IsPeriodWise { get; set; }
        public byte Period { get; set; }

        public bool IsWorkingDay { get; set; }
        public IReadOnlyList<RegisterRow> Rows { get; set; }
    }

    // =========================================================================
    // Fees (§11)
    // =========================================================================

    public class FeeCollectionViewModel
    {
        public Student Student { get; set; }
        public LedgerSummary Ledger { get; set; }
        public IReadOnlyList<Payment> RecentPayments { get; set; }
        public string Query { get; set; }
        public IReadOnlyList<StudentListItem> Matches { get; set; }
    }

    public class DuesRow
    {
        public string StudentId { get; set; }
        public string FullName { get; set; }
        public string ClassName { get; set; }
        public string GuardianName { get; set; }
        public string GuardianMobile { get; set; }
        public decimal Billed { get; set; }
        public decimal Paid { get; set; }
        public decimal Due { get; set; }
        public int MonthsOverdue { get; set; }
    }

    public class DuesViewModel
    {
        public IReadOnlyList<DuesRow> Rows { get; set; }
        public decimal TotalBilled { get; set; }
        public decimal TotalCollected { get; set; }
        public decimal TotalDue { get; set; }

        public decimal CollectionRate
        {
            get { return TotalBilled == 0m ? 0m : Math.Round(TotalCollected / TotalBilled * 100m, 1); }
        }
    }

    // =========================================================================
    // Settings (§3, §4, §12, §15)
    // =========================================================================

    public class SettingsViewModel
    {
        public IReadOnlyList<ModuleSetting> Modules { get; set; }
        public IReadOnlyList<AuditEntry> RecentAudit { get; set; }
        public IReadOnlyList<BackupEntry> RecentBackups { get; set; }

        /// <summary>§12 — what SMS would cost if the gateway were bought.</summary>
        public int GuardianCount { get; set; }
        public decimal SmsCostPerSend { get; set; }
        public decimal SmsCostPerYear { get; set; }
        public bool SmsGatewayConfigured { get; set; }
        public int EmailDailyCap { get; set; }
    }
}
