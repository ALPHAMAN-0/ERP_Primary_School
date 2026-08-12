/* =============================================================================
   Shahjalal School & College — ERP database schema
   SQL Server 2019+ · Entity Framework 6 (Code First compatible)

   This is the production counterpart to the browser twin in /docs. Both are
   generated from the same domain specification, so the constraints below are
   the same rules the demo enforces in JavaScript.

   Conventions, and the requirement each one comes from:
     · Every user-facing text column is NVARCHAR — Bangla must round-trip
       through report cards, admit cards and certificates (§13).
     · No VARBINARY anywhere. Photos and scanned documents live on the
       filesystem; only the relative path is stored (§14).
     · Money is DECIMAL(12,2), never FLOAT — a fee ledger must not drift.
     · Every table carries CreatedAtUtc / ModifiedAtUtc for the audit trail.
     · Indexes target the queries the UI actually issues, listed above each one.

   Run order: this file is idempotent-ish for a fresh database. It creates
   schema objects only; see seed.sql for reference data.
   ============================================================================= */

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* -----------------------------------------------------------------------------
   1. Reference data (§5 academic structure, §7 grading)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.AcademicYears (
    AcademicYearId      INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    [Year]              SMALLINT        NOT NULL,
    StartDate           DATE            NOT NULL,
    EndDate             DATE            NOT NULL,
    IsCurrent           BIT             NOT NULL CONSTRAINT DF_AcademicYears_IsCurrent DEFAULT (0),
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_AcademicYears_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_AcademicYears_Year UNIQUE ([Year]),
    CONSTRAINT CK_AcademicYears_Range CHECK (EndDate > StartDate)
);
GO

-- Only one year may be current at a time.
CREATE UNIQUE INDEX UX_AcademicYears_Current
    ON dbo.AcademicYears (IsCurrent) WHERE IsCurrent = 1;
GO

CREATE TABLE dbo.Grades (
    GradeId             TINYINT         NOT NULL PRIMARY KEY,   -- 0 = KG … 12
    Code                NVARCHAR(8)     NOT NULL,               -- 'KG', 'C1' …
    [Name]              NVARCHAR(40)    NOT NULL,
    NameBn              NVARCHAR(40)    NOT NULL,
    -- §1 — one institution, two sections under a single administration.
    SchoolSection       NVARCHAR(10)    NOT NULL,               -- 'School' | 'College'
    -- §5 — groups apply from Class 9 upward.
    HasGroups           BIT             NOT NULL,
    -- §6 — 'Daily' for KG–10, 'Period' for 11–12.
    AttendanceMode      NVARCHAR(10)    NOT NULL,
    -- Terminal board examination, if this grade leads to one.
    TerminalExam        NVARCHAR(10)    NULL,                   -- 'SSC' | 'HSC' | NULL
    CONSTRAINT UQ_Grades_Code UNIQUE (Code),
    CONSTRAINT CK_Grades_Section CHECK (SchoolSection IN (N'School', N'College')),
    CONSTRAINT CK_Grades_AttMode CHECK (AttendanceMode IN (N'Daily', N'Period'))
);
GO

CREATE TABLE dbo.Groups (
    GroupId             TINYINT         NOT NULL PRIMARY KEY,
    Code                NVARCHAR(8)     NOT NULL,               -- SCI | BUS | HUM
    [Name]              NVARCHAR(40)    NOT NULL,
    NameBn              NVARCHAR(40)    NOT NULL,
    CONSTRAINT UQ_Groups_Code UNIQUE (Code)
);
GO

CREATE TABLE dbo.ClassSections (
    ClassSectionId      INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    GradeId             TINYINT         NOT NULL,
    Code                NVARCHAR(12)    NOT NULL,               -- 'A' | 'SCI-A' …
    [Name]              NVARCHAR(40)    NOT NULL,
    GroupId             TINYINT         NULL,                   -- NULL below Class 9
    Capacity            SMALLINT        NOT NULL CONSTRAINT DF_ClassSections_Cap DEFAULT (60),
    ClassTeacherId      INT             NULL,                   -- FK added after Employees
    IsActive            BIT             NOT NULL CONSTRAINT DF_ClassSections_Active DEFAULT (1),
    CONSTRAINT FK_ClassSections_Grade FOREIGN KEY (GradeId) REFERENCES dbo.Grades (GradeId),
    CONSTRAINT FK_ClassSections_Group FOREIGN KEY (GroupId) REFERENCES dbo.Groups (GroupId),
    CONSTRAINT UQ_ClassSections UNIQUE (GradeId, Code)
);
GO

CREATE TABLE dbo.Subjects (
    SubjectId           INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Code                NVARCHAR(12)    NOT NULL,
    [Name]              NVARCHAR(120)   NOT NULL,
    NameBn              NVARCHAR(120)   NOT NULL,
    FullMarks           SMALLINT        NOT NULL CONSTRAINT DF_Subjects_Full DEFAULT (100),
    -- §7 — the optional (4th) subject: excluded from the GPA divisor, its grade
    -- points above 2.00 added as a bonus, and a fail in it is not fatal.
    IsOptional          BIT             NOT NULL CONSTRAINT DF_Subjects_Optional DEFAULT (0),
    CONSTRAINT UQ_Subjects_Code UNIQUE (Code),
    CONSTRAINT CK_Subjects_FullMarks CHECK (FullMarks BETWEEN 1 AND 500)
);
GO

-- Which subjects a (grade, group) combination sits.
CREATE TABLE dbo.CurriculumSubjects (
    CurriculumSubjectId INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    GradeId             TINYINT         NOT NULL,
    GroupId             TINYINT         NULL,                   -- NULL = all groups
    SubjectId           INT             NOT NULL,
    DisplayOrder        SMALLINT        NOT NULL CONSTRAINT DF_CurrSub_Order DEFAULT (0),
    CONSTRAINT FK_CurrSub_Grade FOREIGN KEY (GradeId) REFERENCES dbo.Grades (GradeId),
    CONSTRAINT FK_CurrSub_Group FOREIGN KEY (GroupId) REFERENCES dbo.Groups (GroupId),
    CONSTRAINT FK_CurrSub_Subject FOREIGN KEY (SubjectId) REFERENCES dbo.Subjects (SubjectId),
    CONSTRAINT UQ_CurrSub UNIQUE (GradeId, GroupId, SubjectId)
);
GO

/* §7 — the SSC/HSC grading table, stored rather than hard-coded so a board
   revision is a data change, not a deployment. */
CREATE TABLE dbo.GradeScale (
    GradeScaleId        TINYINT         NOT NULL PRIMARY KEY,
    MinPercent          DECIMAL(5,2)    NOT NULL,
    MaxPercent          DECIMAL(5,2)    NOT NULL,
    LetterGrade         NVARCHAR(4)     NOT NULL,
    GradePoint          DECIMAL(3,2)    NOT NULL,
    Remark              NVARCHAR(40)    NOT NULL,
    CONSTRAINT CK_GradeScale_Range CHECK (MaxPercent >= MinPercent),
    CONSTRAINT CK_GradeScale_Gp CHECK (GradePoint BETWEEN 0 AND 5)
);
GO

/* -----------------------------------------------------------------------------
   2. Security (§9 fixed roles, §10 guardian accounts)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.Roles (
    RoleId              TINYINT         NOT NULL PRIMARY KEY,
    Code                NVARCHAR(20)    NOT NULL,   -- ADMIN, TEACHER, ACCOUNTANT …
    [Name]              NVARCHAR(60)    NOT NULL,
    [Description]       NVARCHAR(200)   NULL,
    CONSTRAINT UQ_Roles_Code UNIQUE (Code)
);
GO

CREATE TABLE dbo.Users (
    UserId              INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    UserName            NVARCHAR(64)    NOT NULL,
    -- Guardians sign in with the mobile number recorded at admission (§10).
    Mobile              NVARCHAR(14)    NULL,
    Email               NVARCHAR(160)   NULL,
    PasswordHash        NVARCHAR(200)   NOT NULL,
    SecurityStamp       NVARCHAR(64)    NOT NULL,
    IsActive            BIT             NOT NULL CONSTRAINT DF_Users_Active DEFAULT (1),
    MustChangePassword  BIT             NOT NULL CONSTRAINT DF_Users_MustChange DEFAULT (1),
    LastLoginUtc        DATETIME2(0)    NULL,
    FailedLoginCount    TINYINT         NOT NULL CONSTRAINT DF_Users_Failed DEFAULT (0),
    LockoutEndUtc       DATETIME2(0)    NULL,
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Users_Created DEFAULT (SYSUTCDATETIME()),
    ModifiedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT UQ_Users_UserName UNIQUE (UserName)
);
GO

CREATE UNIQUE INDEX UX_Users_Mobile ON dbo.Users (Mobile) WHERE Mobile IS NOT NULL;
GO

/* §9 — a staff member wearing several hats simply holds several roles. There is
   no permission matrix; the role set IS the permission. */
CREATE TABLE dbo.UserRoles (
    UserId              INT             NOT NULL,
    RoleId              TINYINT         NOT NULL,
    AssignedAtUtc       DATETIME2(0)    NOT NULL CONSTRAINT DF_UserRoles_At DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_UserRoles PRIMARY KEY (UserId, RoleId),
    CONSTRAINT FK_UserRoles_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId) ON DELETE CASCADE,
    CONSTRAINT FK_UserRoles_Role FOREIGN KEY (RoleId) REFERENCES dbo.Roles (RoleId)
);
GO

/* -----------------------------------------------------------------------------
   3. People — guardians, students, employees (§8, §10)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.Guardians (
    GuardianId          INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    UserId              INT             NULL,       -- set once the account is verified
    FatherName          NVARCHAR(120)   NOT NULL,
    FatherNameBn        NVARCHAR(120)   NOT NULL,
    FatherOccupation    NVARCHAR(60)    NULL,
    MotherName          NVARCHAR(120)   NOT NULL,
    MotherNameBn        NVARCHAR(120)   NOT NULL,
    MotherOccupation    NVARCHAR(60)    NULL,
    Mobile              NVARCHAR(14)    NOT NULL,
    AlternateMobile     NVARCHAR(14)    NULL,
    Email               NVARCHAR(160)   NULL,
    NationalId          NVARCHAR(20)    NULL,
    [Address]           NVARCHAR(300)   NOT NULL,
    Area                NVARCHAR(80)    NULL,
    -- §10 — registration requires a verification step before the account links.
    IsVerified          BIT             NOT NULL CONSTRAINT DF_Guardians_Verified DEFAULT (0),
    VerifiedAtUtc       DATETIME2(0)    NULL,
    VerifiedByUserId    INT             NULL,
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Guardians_Created DEFAULT (SYSUTCDATETIME()),
    ModifiedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT FK_Guardians_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT FK_Guardians_Verifier FOREIGN KEY (VerifiedByUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_Guardians_Mobile CHECK (Mobile LIKE N'01[3-9]%' AND LEN(Mobile) = 11)
);
GO

-- The office looks guardians up by phone constantly (fee counter, admissions).
CREATE INDEX IX_Guardians_Mobile ON dbo.Guardians (Mobile);
GO

CREATE TABLE dbo.Students (
    /* §8 — the permanent identifier. YYMMSSSS: 2-digit year, 2-digit month,
       4-digit serial within that month. It is the PRIMARY KEY rather than a
       surrogate precisely because it must never be reused, not even after
       graduation or withdrawal — making it the key means the database itself
       enforces that guarantee. */
    StudentId           CHAR(8)         NOT NULL PRIMARY KEY,

    FullName            NVARCHAR(120)   NOT NULL,
    FullNameBn          NVARCHAR(120)   NOT NULL,
    Gender              NVARCHAR(10)    NOT NULL,
    DateOfBirth         DATE            NOT NULL,
    BirthCertificateNo  NVARCHAR(30)    NULL,
    Religion            NVARCHAR(30)    NULL,
    BloodGroup          NVARCHAR(4)     NULL,

    GuardianId          INT             NOT NULL,
    -- §14 — a relative path on the 5 GB website storage, never the image bytes.
    PhotoPath           NVARCHAR(260)   NULL,

    AdmittedOn          DATE            NOT NULL,
    AdmissionGradeId    TINYINT         NOT NULL,
    [Status]            NVARCHAR(16)    NOT NULL CONSTRAINT DF_Students_Status DEFAULT (N'Active'),
    StatusChangedOn     DATE            NULL,
    StatusReason        NVARCHAR(200)   NULL,

    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Students_Created DEFAULT (SYSUTCDATETIME()),
    ModifiedAtUtc       DATETIME2(0)    NULL,

    CONSTRAINT FK_Students_Guardian FOREIGN KEY (GuardianId) REFERENCES dbo.Guardians (GuardianId),
    CONSTRAINT FK_Students_AdmGrade FOREIGN KEY (AdmissionGradeId) REFERENCES dbo.Grades (GradeId),
    CONSTRAINT CK_Students_Id CHECK (StudentId NOT LIKE N'%[^0-9]%'),
    CONSTRAINT CK_Students_Month CHECK (CAST(SUBSTRING(StudentId, 3, 2) AS INT) BETWEEN 1 AND 12),
    CONSTRAINT CK_Students_Gender CHECK (Gender IN (N'Male', N'Female')),
    CONSTRAINT CK_Students_Status CHECK ([Status] IN (N'Active', N'Withdrawn', N'Graduated', N'Transferred'))
);
GO

-- Directory search (§ students screen) and the guardian's child list (§10).
CREATE INDEX IX_Students_Guardian ON dbo.Students (GuardianId) INCLUDE (FullName, [Status]);
CREATE INDEX IX_Students_Name ON dbo.Students (FullName) INCLUDE (StudentId, [Status]);
CREATE INDEX IX_Students_Status ON dbo.Students ([Status]) WHERE [Status] = N'Active';
GO

/* §8 — the serial allocator. One row per YYMM bucket; NextSerial only ever
   increases, so a withdrawn student never frees their number. The application
   takes an UPDLOCK on this row inside the admission transaction, which is what
   makes concurrent admissions safe. */
CREATE TABLE dbo.StudentIdSequence (
    YearMonth           CHAR(4)         NOT NULL PRIMARY KEY,   -- 'YYMM'
    NextSerial          SMALLINT        NOT NULL CONSTRAINT DF_StudentIdSeq_Next DEFAULT (1),
    ModifiedAtUtc       DATETIME2(0)    NOT NULL CONSTRAINT DF_StudentIdSeq_Mod DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT CK_StudentIdSeq_Cap CHECK (NextSerial BETWEEN 1 AND 10000)
);
GO

/* A student's placement in a class for a given year. Kept separate from the
   student record so promotion history survives — the transcript needs it. */
CREATE TABLE dbo.Enrolments (
    EnrolmentId         INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    StudentId           CHAR(8)         NOT NULL,
    AcademicYearId      INT             NOT NULL,
    ClassSectionId      INT             NOT NULL,
    RollNumber          SMALLINT        NOT NULL,
    -- §7 — which optional subject this student sits, if any.
    OptionalSubjectId   INT             NULL,
    WaiverCode          NVARCHAR(20)    NOT NULL CONSTRAINT DF_Enrolments_Waiver DEFAULT (N'NONE'),
    IsActive            BIT             NOT NULL CONSTRAINT DF_Enrolments_Active DEFAULT (1),
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Enrolments_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_Enrolments_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_Enrolments_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId),
    CONSTRAINT FK_Enrolments_Class FOREIGN KEY (ClassSectionId) REFERENCES dbo.ClassSections (ClassSectionId),
    CONSTRAINT FK_Enrolments_Optional FOREIGN KEY (OptionalSubjectId) REFERENCES dbo.Subjects (SubjectId),
    -- A student sits in exactly one class per year …
    CONSTRAINT UQ_Enrolments_StudentYear UNIQUE (StudentId, AcademicYearId),
    -- … and a roll number is unique within that class.
    CONSTRAINT UQ_Enrolments_Roll UNIQUE (ClassSectionId, AcademicYearId, RollNumber)
);
GO

CREATE INDEX IX_Enrolments_Class ON dbo.Enrolments (ClassSectionId, AcademicYearId) INCLUDE (StudentId, RollNumber);
GO

CREATE TABLE dbo.Employees (
    EmployeeId          INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    EmployeeCode        NVARCHAR(16)    NOT NULL,
    UserId              INT             NULL,
    FullName            NVARCHAR(120)   NOT NULL,
    FullNameBn          NVARCHAR(120)   NOT NULL,
    Gender              NVARCHAR(10)    NOT NULL,
    Designation         NVARCHAR(60)    NOT NULL,
    PayGrade            TINYINT         NOT NULL,
    Department          NVARCHAR(30)    NULL,
    PrimarySubjectId    INT             NULL,
    Mobile              NVARCHAR(14)    NOT NULL,
    Email               NVARCHAR(160)   NULL,
    NationalId          NVARCHAR(20)    NULL,
    JoinedOn            DATE            NOT NULL,
    BasicSalary         DECIMAL(12,2)   NOT NULL,
    HouseRent           DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Employees_House DEFAULT (0),
    MedicalAllowance    DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Employees_Med DEFAULT (0),
    TransportAllowance  DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Employees_Trans DEFAULT (0),
    PhotoPath           NVARCHAR(260)   NULL,
    [Status]            NVARCHAR(16)    NOT NULL CONSTRAINT DF_Employees_Status DEFAULT (N'Active'),
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Employees_Created DEFAULT (SYSUTCDATETIME()),
    ModifiedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT UQ_Employees_Code UNIQUE (EmployeeCode),
    CONSTRAINT FK_Employees_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT FK_Employees_Subject FOREIGN KEY (PrimarySubjectId) REFERENCES dbo.Subjects (SubjectId),
    CONSTRAINT CK_Employees_Salary CHECK (BasicSalary >= 0)
);
GO

ALTER TABLE dbo.ClassSections
    ADD CONSTRAINT FK_ClassSections_Teacher FOREIGN KEY (ClassTeacherId) REFERENCES dbo.Employees (EmployeeId);
GO

/* -----------------------------------------------------------------------------
   4. Attendance (§6)
   -------------------------------------------------------------------------- */

/* The single largest table in the system. At 3,000 students × ~220 working days
   that is ~660,000 rows a year for the school section alone, so the column set
   is kept deliberately narrow — this is the table that decides whether the
   1 GB free-tier database ceiling (§3) holds. */
CREATE TABLE dbo.Attendance (
    AttendanceId        BIGINT          NOT NULL IDENTITY(1,1),
    StudentId           CHAR(8)         NOT NULL,
    [Date]              DATE            NOT NULL,
    -- §6 — 0 for the school section's once-a-day record; 1–6 for the college
    -- section's period-wise record, which HSC eligibility is assessed on.
    Period              TINYINT         NOT NULL CONSTRAINT DF_Attendance_Period DEFAULT (0),
    [Status]            CHAR(1)         NOT NULL,   -- P present, A absent, L late, E excused
    SubjectId           INT             NULL,       -- set for period-wise records
    MarkedByEmployeeId  INT             NULL,
    MarkedAtUtc         DATETIME2(0)    NOT NULL CONSTRAINT DF_Attendance_At DEFAULT (SYSUTCDATETIME()),
    Remarks             NVARCHAR(120)   NULL,
    CONSTRAINT PK_Attendance PRIMARY KEY CLUSTERED (StudentId, [Date], Period),
    CONSTRAINT FK_Attendance_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_Attendance_Subject FOREIGN KEY (SubjectId) REFERENCES dbo.Subjects (SubjectId),
    CONSTRAINT FK_Attendance_Marker FOREIGN KEY (MarkedByEmployeeId) REFERENCES dbo.Employees (EmployeeId),
    CONSTRAINT CK_Attendance_Status CHECK ([Status] IN ('P', 'A', 'L', 'E')),
    CONSTRAINT CK_Attendance_Period CHECK (Period BETWEEN 0 AND 8)
);
GO

/* The clustered key is (StudentId, Date, Period) because the hottest query is
   "this student's attendance across the year" — the portal, the eligibility
   check and the report card all ask it. The register asks the transposed
   question ("this class on this date"), which this covering index serves. */
CREATE INDEX IX_Attendance_Date ON dbo.Attendance ([Date], Period) INCLUDE (StudentId, [Status]);
GO

/* -----------------------------------------------------------------------------
   5. Examinations and results (§7)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.ExamTerms (
    ExamTermId          INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    AcademicYearId      INT             NOT NULL,
    Code                NVARCHAR(10)    NOT NULL,   -- T1 | T2 | T3 | TEST
    [Name]              NVARCHAR(60)    NOT NULL,
    NameBn              NVARCHAR(60)    NOT NULL,
    StartDate           DATE            NULL,
    EndDate             DATE            NULL,
    -- Board-prep Test Examination applies only to Class 10 and 12.
    BoardPrepOnly       BIT             NOT NULL CONSTRAINT DF_ExamTerms_Board DEFAULT (0),
    -- Marks cannot be entered once the term is locked; results cannot be seen
    -- by students or guardians until it is published.
    IsLocked            BIT             NOT NULL CONSTRAINT DF_ExamTerms_Locked DEFAULT (0),
    IsPublished         BIT             NOT NULL CONSTRAINT DF_ExamTerms_Pub DEFAULT (0),
    PublishedAtUtc      DATETIME2(0)    NULL,
    CONSTRAINT FK_ExamTerms_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId),
    CONSTRAINT UQ_ExamTerms UNIQUE (AcademicYearId, Code)
);
GO

CREATE TABLE dbo.Marks (
    MarkId              BIGINT          NOT NULL IDENTITY(1,1),
    StudentId           CHAR(8)         NOT NULL,
    ExamTermId          INT             NOT NULL,
    SubjectId           INT             NOT NULL,
    ObtainedMarks       DECIMAL(6,2)    NULL,       -- NULL = absent from the paper
    IsAbsent            BIT             NOT NULL CONSTRAINT DF_Marks_Absent DEFAULT (0),
    EnteredByEmployeeId INT             NULL,
    EnteredAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Marks_At DEFAULT (SYSUTCDATETIME()),
    ModifiedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT PK_Marks PRIMARY KEY CLUSTERED (StudentId, ExamTermId, SubjectId),
    CONSTRAINT FK_Marks_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_Marks_Term FOREIGN KEY (ExamTermId) REFERENCES dbo.ExamTerms (ExamTermId),
    CONSTRAINT FK_Marks_Subject FOREIGN KEY (SubjectId) REFERENCES dbo.Subjects (SubjectId),
    CONSTRAINT FK_Marks_Enterer FOREIGN KEY (EnteredByEmployeeId) REFERENCES dbo.Employees (EmployeeId),
    CONSTRAINT CK_Marks_Value CHECK (ObtainedMarks IS NULL OR ObtainedMarks >= 0)
);
GO

-- Mark entry works subject-by-subject for a whole class.
CREATE INDEX IX_Marks_TermSubject ON dbo.Marks (ExamTermId, SubjectId) INCLUDE (StudentId, ObtainedMarks);
GO

/* Computed results are stored rather than derived on every read: the tabulation
   sheet and the report card are read far more often than marks change, and on
   256 MB of RAM (§3) recomputing 3,000 GPAs per page view is not affordable.
   The application recalculates and rewrites these rows whenever a mark in the
   term changes. */
CREATE TABLE dbo.TermResults (
    TermResultId        BIGINT          NOT NULL IDENTITY(1,1),
    StudentId           CHAR(8)         NOT NULL,
    ExamTermId          INT             NOT NULL,
    TotalMarks          DECIMAL(8,2)    NOT NULL,
    TotalFullMarks      DECIMAL(8,2)    NOT NULL,
    Gpa                 DECIMAL(3,2)    NOT NULL,
    LetterGrade         NVARCHAR(4)     NOT NULL,
    -- §7 — a fail in any compulsory subject fails the whole result.
    HasFailed           BIT             NOT NULL,
    FailedSubjectCodes  NVARCHAR(200)   NULL,
    ClassPosition       SMALLINT        NULL,
    ComputedAtUtc       DATETIME2(0)    NOT NULL CONSTRAINT DF_TermResults_At DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_TermResults PRIMARY KEY CLUSTERED (StudentId, ExamTermId),
    CONSTRAINT FK_TermResults_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_TermResults_Term FOREIGN KEY (ExamTermId) REFERENCES dbo.ExamTerms (ExamTermId),
    CONSTRAINT CK_TermResults_Gpa CHECK (Gpa BETWEEN 0 AND 5),
    -- The invariant §7 is really about: a failed result publishes GPA 0.00.
    CONSTRAINT CK_TermResults_FailGpa CHECK (HasFailed = 0 OR Gpa = 0)
);
GO

CREATE INDEX IX_TermResults_Term ON dbo.TermResults (ExamTermId, Gpa DESC) INCLUDE (StudentId, HasFailed);
GO

/* -----------------------------------------------------------------------------
   6. Class routine
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.RoutineSlots (
    RoutineSlotId       INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    AcademicYearId      INT             NOT NULL,
    ClassSectionId      INT             NOT NULL,
    DayOfWeek           TINYINT         NOT NULL,   -- 0 Sunday … 4 Thursday
    Period              TINYINT         NOT NULL,
    SubjectId           INT             NOT NULL,
    EmployeeId          INT             NOT NULL,
    RoomCode            NVARCHAR(16)    NULL,
    StartTime           TIME(0)         NOT NULL,
    EndTime             TIME(0)         NOT NULL,
    CONSTRAINT FK_Routine_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId),
    CONSTRAINT FK_Routine_Class FOREIGN KEY (ClassSectionId) REFERENCES dbo.ClassSections (ClassSectionId),
    CONSTRAINT FK_Routine_Subject FOREIGN KEY (SubjectId) REFERENCES dbo.Subjects (SubjectId),
    CONSTRAINT FK_Routine_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees (EmployeeId),
    CONSTRAINT CK_Routine_Day CHECK (DayOfWeek BETWEEN 0 AND 4),
    CONSTRAINT CK_Routine_Time CHECK (EndTime > StartTime),
    -- A class cannot be in two places at once …
    CONSTRAINT UQ_Routine_Class UNIQUE (AcademicYearId, ClassSectionId, DayOfWeek, Period)
);
GO

-- … and neither can a teacher. This is the constraint that catches clashes.
CREATE UNIQUE INDEX UX_Routine_Teacher
    ON dbo.RoutineSlots (AcademicYearId, EmployeeId, DayOfWeek, Period);
GO

/* -----------------------------------------------------------------------------
   7. Fees and accounts (§11)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.FeeHeads (
    FeeHeadId           INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Code                NVARCHAR(10)    NOT NULL,
    [Name]              NVARCHAR(80)    NOT NULL,
    NameBn              NVARCHAR(80)    NOT NULL,
    Recurrence          NVARCHAR(16)    NOT NULL,   -- once | monthly | per-term | yearly
    -- Heads belonging to a switched-off module stop being billed (§4).
    ModuleCode          NVARCHAR(20)    NULL,
    DefaultAmount       DECIMAL(12,2)   NULL,       -- NULL when it varies by grade or route
    IsActive            BIT             NOT NULL CONSTRAINT DF_FeeHeads_Active DEFAULT (1),
    CONSTRAINT UQ_FeeHeads_Code UNIQUE (Code),
    CONSTRAINT CK_FeeHeads_Recurrence CHECK (Recurrence IN (N'once', N'monthly', N'per-term', N'yearly'))
);
GO

CREATE TABLE dbo.FeeStructures (
    FeeStructureId      INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    AcademicYearId      INT             NOT NULL,
    FeeHeadId           INT             NOT NULL,
    GradeId             TINYINT         NULL,       -- NULL = applies to all grades
    Amount              DECIMAL(12,2)   NOT NULL,
    CONSTRAINT FK_FeeStructures_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId),
    CONSTRAINT FK_FeeStructures_Head FOREIGN KEY (FeeHeadId) REFERENCES dbo.FeeHeads (FeeHeadId),
    CONSTRAINT FK_FeeStructures_Grade FOREIGN KEY (GradeId) REFERENCES dbo.Grades (GradeId),
    CONSTRAINT UQ_FeeStructures UNIQUE (AcademicYearId, FeeHeadId, GradeId),
    CONSTRAINT CK_FeeStructures_Amount CHECK (Amount >= 0)
);
GO

CREATE TABLE dbo.Waivers (
    WaiverId            INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Code                NVARCHAR(20)    NOT NULL,
    [Name]              NVARCHAR(80)    NOT NULL,
    Percent             DECIMAL(5,2)    NOT NULL,
    CONSTRAINT UQ_Waivers_Code UNIQUE (Code),
    CONSTRAINT CK_Waivers_Percent CHECK (Percent BETWEEN 0 AND 100)
);
GO

CREATE TABLE dbo.Invoices (
    InvoiceId           BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    InvoiceNo           NVARCHAR(20)    NOT NULL,
    StudentId           CHAR(8)         NOT NULL,
    AcademicYearId      INT             NOT NULL,
    BillingMonth        TINYINT         NULL,       -- 1–12 for monthly invoices
    IssuedOn            DATE            NOT NULL,
    DueOn               DATE            NOT NULL,
    GrossAmount         DECIMAL(12,2)   NOT NULL,
    DiscountAmount      DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Invoices_Disc DEFAULT (0),
    FineAmount          DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Invoices_Fine DEFAULT (0),
    -- Persisted computed column: the payable figure can never disagree with its parts.
    NetAmount           AS (GrossAmount - DiscountAmount + FineAmount) PERSISTED,
    PaidAmount          DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Invoices_Paid DEFAULT (0),
    [Status]            NVARCHAR(16)    NOT NULL CONSTRAINT DF_Invoices_Status DEFAULT (N'Unpaid'),
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Invoices_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Invoices_No UNIQUE (InvoiceNo),
    CONSTRAINT FK_Invoices_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_Invoices_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId),
    CONSTRAINT CK_Invoices_Status CHECK ([Status] IN (N'Unpaid', N'Partial', N'Paid', N'Waived', N'Cancelled')),
    CONSTRAINT CK_Invoices_Paid CHECK (PaidAmount >= 0),
    CONSTRAINT CK_Invoices_Month CHECK (BillingMonth IS NULL OR BillingMonth BETWEEN 1 AND 12)
);
GO

CREATE INDEX IX_Invoices_Student ON dbo.Invoices (StudentId, AcademicYearId) INCLUDE ([Status], NetAmount, PaidAmount);
-- The dues register scans unpaid invoices; a filtered index keeps it cheap.
CREATE INDEX IX_Invoices_Outstanding ON dbo.Invoices ([Status], DueOn)
    INCLUDE (StudentId, NetAmount, PaidAmount) WHERE [Status] IN (N'Unpaid', N'Partial');
GO

CREATE TABLE dbo.InvoiceLines (
    InvoiceLineId       BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    InvoiceId           BIGINT          NOT NULL,
    FeeHeadId           INT             NOT NULL,
    [Description]       NVARCHAR(120)   NOT NULL,
    Quantity            SMALLINT        NOT NULL CONSTRAINT DF_InvoiceLines_Qty DEFAULT (1),
    UnitAmount          DECIMAL(12,2)   NOT NULL,
    LineTotal           AS (Quantity * UnitAmount) PERSISTED,
    CONSTRAINT FK_InvoiceLines_Invoice FOREIGN KEY (InvoiceId) REFERENCES dbo.Invoices (InvoiceId) ON DELETE CASCADE,
    CONSTRAINT FK_InvoiceLines_Head FOREIGN KEY (FeeHeadId) REFERENCES dbo.FeeHeads (FeeHeadId)
);
GO

/* §11 — V1 is manual collection: the Accountant logs what was paid at the
   office. PaymentMethod already carries the gateway values so switching an
   online provider on later is an integration, not a migration. */
CREATE TABLE dbo.Payments (
    PaymentId           BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    ReceiptNo           NVARCHAR(20)    NOT NULL,
    StudentId           CHAR(8)         NOT NULL,
    InvoiceId           BIGINT          NULL,       -- NULL = on-account payment
    Amount              DECIMAL(12,2)   NOT NULL,
    PaymentMethod       NVARCHAR(16)    NOT NULL,   -- CASH | CHEQUE | BANK | BKASH | NAGAD | CARD
    ReferenceNo         NVARCHAR(60)    NULL,       -- cheque no, bank slip, or gateway txn id
    GatewayTxnId        NVARCHAR(80)    NULL,
    Particulars         NVARCHAR(200)   NULL,
    ReceivedOn          DATE            NOT NULL,
    CollectedByUserId   INT             NOT NULL,
    IsCancelled         BIT             NOT NULL CONSTRAINT DF_Payments_Cancelled DEFAULT (0),
    CancelledReason     NVARCHAR(200)   NULL,
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Payments_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT UQ_Payments_Receipt UNIQUE (ReceiptNo),
    CONSTRAINT FK_Payments_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_Payments_Invoice FOREIGN KEY (InvoiceId) REFERENCES dbo.Invoices (InvoiceId),
    CONSTRAINT FK_Payments_User FOREIGN KEY (CollectedByUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_Payments_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Payments_Method CHECK (PaymentMethod IN (N'CASH', N'CHEQUE', N'BANK', N'BKASH', N'NAGAD', N'CARD'))
);
GO

CREATE INDEX IX_Payments_Student ON dbo.Payments (StudentId, ReceivedOn DESC);
CREATE INDEX IX_Payments_Date ON dbo.Payments (ReceivedOn) INCLUDE (Amount, PaymentMethod) WHERE IsCancelled = 0;
GO

/* -----------------------------------------------------------------------------
   8. Notices and the notification queue (§12)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.Notices (
    NoticeId            INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Title               NVARCHAR(200)   NOT NULL,
    Body                NVARCHAR(MAX)   NOT NULL,
    Audience            NVARCHAR(30)    NOT NULL,   -- all | guardians | students | staff | class
    GradeId             TINYINT         NULL,       -- when Audience = 'class'
    Priority            NVARCHAR(10)    NOT NULL CONSTRAINT DF_Notices_Priority DEFAULT (N'normal'),
    IsPinned            BIT             NOT NULL CONSTRAINT DF_Notices_Pinned DEFAULT (0),
    PublishedOn         DATE            NOT NULL,
    ExpiresOn           DATE            NULL,
    -- §14 — attachments are paths, never bytes.
    AttachmentPath      NVARCHAR(260)   NULL,
    CreatedByUserId     INT             NOT NULL,
    CreatedAtUtc        DATETIME2(0)    NOT NULL CONSTRAINT DF_Notices_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT FK_Notices_Grade FOREIGN KEY (GradeId) REFERENCES dbo.Grades (GradeId),
    CONSTRAINT FK_Notices_User FOREIGN KEY (CreatedByUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_Notices_Priority CHECK (Priority IN (N'normal', N'urgent'))
);
GO

/* The Hangfire-drained outbound queue (§2, §12).

   Email is delivered for real through the abstracted notification service.
   SMS rows are written and then sit at 'Held' indefinitely, because no paid
   gateway is configured — the cost is real (~0.30 BDT a message, no free tier)
   and the decision to buy it belongs to the institution. Recording the rows
   anyway is what makes that decision an informed one: the queue shows exactly
   what would have been sent and what it would have cost. */
CREATE TABLE dbo.NotificationQueue (
    NotificationId      BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Channel             NVARCHAR(10)    NOT NULL,   -- EMAIL | SMS
    NoticeId            INT             NULL,
    RecipientUserId     INT             NULL,
    RecipientAddress    NVARCHAR(160)   NOT NULL,   -- email address or mobile number
    Subject             NVARCHAR(200)   NULL,
    Body                NVARCHAR(1000)  NOT NULL,
    [Status]            NVARCHAR(16)    NOT NULL CONSTRAINT DF_NotifQueue_Status DEFAULT (N'Pending'),
    AttemptCount        TINYINT         NOT NULL CONSTRAINT DF_NotifQueue_Attempts DEFAULT (0),
    LastError           NVARCHAR(400)   NULL,
    EstimatedCostBdt    DECIMAL(8,4)    NOT NULL CONSTRAINT DF_NotifQueue_Cost DEFAULT (0),
    QueuedAtUtc         DATETIME2(0)    NOT NULL CONSTRAINT DF_NotifQueue_At DEFAULT (SYSUTCDATETIME()),
    SentAtUtc           DATETIME2(0)    NULL,
    CONSTRAINT FK_NotifQueue_Notice FOREIGN KEY (NoticeId) REFERENCES dbo.Notices (NoticeId),
    CONSTRAINT FK_NotifQueue_User FOREIGN KEY (RecipientUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_NotifQueue_Channel CHECK (Channel IN (N'EMAIL', N'SMS')),
    CONSTRAINT CK_NotifQueue_Status CHECK ([Status] IN (N'Pending', N'Sent', N'Failed', N'Held'))
);
GO

-- The worker polls for pending work; a filtered index keeps that poll cheap
-- on 256 MB of RAM (§3).
CREATE INDEX IX_NotifQueue_Pending ON dbo.NotificationQueue ([Status], QueuedAtUtc)
    WHERE [Status] = N'Pending';
GO

/* -----------------------------------------------------------------------------
   9. Library (§4 — off by default)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.Books (
    BookId              INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    AccessionNo         NVARCHAR(30)    NOT NULL,
    Isbn                NVARCHAR(20)    NULL,
    Title               NVARCHAR(250)   NOT NULL,
    Author              NVARCHAR(160)   NOT NULL,
    Publisher           NVARCHAR(120)   NULL,
    Subject             NVARCHAR(60)    NULL,
    PublishedYear       SMALLINT        NULL,
    ShelfCode           NVARCHAR(16)    NULL,
    CONSTRAINT UQ_Books_Accession UNIQUE (AccessionNo)
);
GO

CREATE TABLE dbo.BookCopies (
    BookCopyId          INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    BookId              INT             NOT NULL,
    CopyCode            NVARCHAR(30)    NOT NULL,
    [Condition]         NVARCHAR(20)    NOT NULL CONSTRAINT DF_BookCopies_Cond DEFAULT (N'Good'),
    IsAvailable         BIT             NOT NULL CONSTRAINT DF_BookCopies_Avail DEFAULT (1),
    CONSTRAINT FK_BookCopies_Book FOREIGN KEY (BookId) REFERENCES dbo.Books (BookId) ON DELETE CASCADE,
    CONSTRAINT UQ_BookCopies_Code UNIQUE (CopyCode)
);
GO

CREATE TABLE dbo.BookLoans (
    BookLoanId          BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    BookCopyId          INT             NOT NULL,
    StudentId           CHAR(8)         NOT NULL,
    IssuedOn            DATE            NOT NULL,
    DueOn               DATE            NOT NULL,
    ReturnedOn          DATE            NULL,
    FineAmount          DECIMAL(8,2)    NOT NULL CONSTRAINT DF_BookLoans_Fine DEFAULT (0),
    FinePaid            BIT             NOT NULL CONSTRAINT DF_BookLoans_FinePaid DEFAULT (0),
    IssuedByUserId      INT             NOT NULL,
    CONSTRAINT FK_BookLoans_Copy FOREIGN KEY (BookCopyId) REFERENCES dbo.BookCopies (BookCopyId),
    CONSTRAINT FK_BookLoans_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_BookLoans_User FOREIGN KEY (IssuedByUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_BookLoans_Dates CHECK (DueOn >= IssuedOn AND (ReturnedOn IS NULL OR ReturnedOn >= IssuedOn))
);
GO

-- A copy can only be on loan once at a time.
CREATE UNIQUE INDEX UX_BookLoans_ActiveCopy ON dbo.BookLoans (BookCopyId) WHERE ReturnedOn IS NULL;
CREATE INDEX IX_BookLoans_Overdue ON dbo.BookLoans (DueOn) INCLUDE (StudentId, BookCopyId) WHERE ReturnedOn IS NULL;
GO

/* -----------------------------------------------------------------------------
   10. Transport (§4 — off by default)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.Vehicles (
    VehicleId           INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    RegistrationNo      NVARCHAR(40)    NOT NULL,
    Model               NVARCHAR(80)    NULL,
    SeatCapacity        SMALLINT        NOT NULL,
    DriverEmployeeId    INT             NULL,
    IsActive            BIT             NOT NULL CONSTRAINT DF_Vehicles_Active DEFAULT (1),
    CONSTRAINT UQ_Vehicles_Reg UNIQUE (RegistrationNo),
    CONSTRAINT FK_Vehicles_Driver FOREIGN KEY (DriverEmployeeId) REFERENCES dbo.Employees (EmployeeId),
    CONSTRAINT CK_Vehicles_Seats CHECK (SeatCapacity > 0)
);
GO

CREATE TABLE dbo.Routes (
    RouteId             INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Code                NVARCHAR(10)    NOT NULL,
    [Name]              NVARCHAR(120)   NOT NULL,
    VehicleId           INT             NULL,
    MonthlyFare         DECIMAL(12,2)   NOT NULL,
    DepartureTime       TIME(0)         NULL,
    ArrivalTime         TIME(0)         NULL,
    IsActive            BIT             NOT NULL CONSTRAINT DF_Routes_Active DEFAULT (1),
    CONSTRAINT UQ_Routes_Code UNIQUE (Code),
    CONSTRAINT FK_Routes_Vehicle FOREIGN KEY (VehicleId) REFERENCES dbo.Vehicles (VehicleId)
);
GO

CREATE TABLE dbo.RouteStops (
    RouteStopId         INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    RouteId             INT             NOT NULL,
    StopName            NVARCHAR(120)   NOT NULL,
    StopOrder           TINYINT         NOT NULL,
    PickupTime          TIME(0)         NULL,
    CONSTRAINT FK_RouteStops_Route FOREIGN KEY (RouteId) REFERENCES dbo.Routes (RouteId) ON DELETE CASCADE,
    CONSTRAINT UQ_RouteStops_Order UNIQUE (RouteId, StopOrder)
);
GO

CREATE TABLE dbo.TransportAssignments (
    TransportAssignmentId INT           NOT NULL IDENTITY(1,1) PRIMARY KEY,
    StudentId           CHAR(8)         NOT NULL,
    AcademicYearId      INT             NOT NULL,
    RouteId             INT             NOT NULL,
    RouteStopId         INT             NOT NULL,
    AssignedOn          DATE            NOT NULL,
    EndedOn             DATE            NULL,
    CONSTRAINT FK_TransportAssign_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_TransportAssign_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId),
    CONSTRAINT FK_TransportAssign_Route FOREIGN KEY (RouteId) REFERENCES dbo.Routes (RouteId),
    CONSTRAINT FK_TransportAssign_Stop FOREIGN KEY (RouteStopId) REFERENCES dbo.RouteStops (RouteStopId)
);
GO

-- A student rides one route at a time.
CREATE UNIQUE INDEX UX_TransportAssign_Active
    ON dbo.TransportAssignments (StudentId, AcademicYearId) WHERE EndedOn IS NULL;
GO

/* -----------------------------------------------------------------------------
   11. Hostel (§4 — off by default)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.HostelBlocks (
    HostelBlockId       INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    Code                NVARCHAR(10)    NOT NULL,
    [Name]              NVARCHAR(80)    NOT NULL,
    Gender              NVARCHAR(10)    NOT NULL,
    WardenEmployeeId    INT             NULL,
    CONSTRAINT UQ_HostelBlocks_Code UNIQUE (Code),
    CONSTRAINT FK_HostelBlocks_Warden FOREIGN KEY (WardenEmployeeId) REFERENCES dbo.Employees (EmployeeId),
    CONSTRAINT CK_HostelBlocks_Gender CHECK (Gender IN (N'Male', N'Female'))
);
GO

CREATE TABLE dbo.HostelRooms (
    HostelRoomId        INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    HostelBlockId       INT             NOT NULL,
    RoomNumber          NVARCHAR(10)    NOT NULL,
    Floor               TINYINT         NOT NULL,
    BedCapacity         TINYINT         NOT NULL,
    CONSTRAINT FK_HostelRooms_Block FOREIGN KEY (HostelBlockId) REFERENCES dbo.HostelBlocks (HostelBlockId) ON DELETE CASCADE,
    CONSTRAINT UQ_HostelRooms UNIQUE (HostelBlockId, RoomNumber),
    CONSTRAINT CK_HostelRooms_Beds CHECK (BedCapacity BETWEEN 1 AND 12)
);
GO

CREATE TABLE dbo.HostelAllocations (
    HostelAllocationId  INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    StudentId           CHAR(8)         NOT NULL,
    HostelRoomId        INT             NOT NULL,
    AcademicYearId      INT             NOT NULL,
    AllocatedOn         DATE            NOT NULL,
    VacatedOn           DATE            NULL,
    CONSTRAINT FK_HostelAlloc_Student FOREIGN KEY (StudentId) REFERENCES dbo.Students (StudentId),
    CONSTRAINT FK_HostelAlloc_Room FOREIGN KEY (HostelRoomId) REFERENCES dbo.HostelRooms (HostelRoomId),
    CONSTRAINT FK_HostelAlloc_Year FOREIGN KEY (AcademicYearId) REFERENCES dbo.AcademicYears (AcademicYearId)
);
GO

-- A student occupies one bed at a time.
CREATE UNIQUE INDEX UX_HostelAlloc_Active
    ON dbo.HostelAllocations (StudentId) WHERE VacatedOn IS NULL;
GO

/* -----------------------------------------------------------------------------
   12. HR / Payroll (§4 — off by default)
   -------------------------------------------------------------------------- */

CREATE TABLE dbo.PayrollRuns (
    PayrollRunId        INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    [Year]              SMALLINT        NOT NULL,
    [Month]             TINYINT         NOT NULL,
    [Status]            NVARCHAR(16)    NOT NULL CONSTRAINT DF_PayrollRuns_Status DEFAULT (N'Draft'),
    GrossTotal          DECIMAL(14,2)   NOT NULL CONSTRAINT DF_PayrollRuns_Gross DEFAULT (0),
    DeductionTotal      DECIMAL(14,2)   NOT NULL CONSTRAINT DF_PayrollRuns_Deduct DEFAULT (0),
    NetTotal            DECIMAL(14,2)   NOT NULL CONSTRAINT DF_PayrollRuns_Net DEFAULT (0),
    ApprovedByUserId    INT             NULL,
    ApprovedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT UQ_PayrollRuns UNIQUE ([Year], [Month]),
    CONSTRAINT FK_PayrollRuns_User FOREIGN KEY (ApprovedByUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_PayrollRuns_Month CHECK ([Month] BETWEEN 1 AND 12),
    CONSTRAINT CK_PayrollRuns_Status CHECK ([Status] IN (N'Draft', N'Approved', N'Paid'))
);
GO

CREATE TABLE dbo.Payslips (
    PayslipId           BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    PayrollRunId        INT             NOT NULL,
    EmployeeId          INT             NOT NULL,
    BasicSalary         DECIMAL(12,2)   NOT NULL,
    HouseRent           DECIMAL(12,2)   NOT NULL,
    MedicalAllowance    DECIMAL(12,2)   NOT NULL,
    TransportAllowance  DECIMAL(12,2)   NOT NULL,
    OtherAllowance      DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Payslips_Other DEFAULT (0),
    GrossPay            AS (BasicSalary + HouseRent + MedicalAllowance + TransportAllowance + OtherAllowance) PERSISTED,
    ProvidentFund       DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Payslips_Pf DEFAULT (0),
    IncomeTax           DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Payslips_Tax DEFAULT (0),
    OtherDeduction      DECIMAL(12,2)   NOT NULL CONSTRAINT DF_Payslips_OtherDed DEFAULT (0),
    NetPay              AS (BasicSalary + HouseRent + MedicalAllowance + TransportAllowance + OtherAllowance
                            - ProvidentFund - IncomeTax - OtherDeduction) PERSISTED,
    CONSTRAINT FK_Payslips_Run FOREIGN KEY (PayrollRunId) REFERENCES dbo.PayrollRuns (PayrollRunId) ON DELETE CASCADE,
    CONSTRAINT FK_Payslips_Employee FOREIGN KEY (EmployeeId) REFERENCES dbo.Employees (EmployeeId),
    CONSTRAINT UQ_Payslips UNIQUE (PayrollRunId, EmployeeId)
);
GO

/* -----------------------------------------------------------------------------
   13. Configuration, audit, backups (§4, §15)
   -------------------------------------------------------------------------- */

/* §4 — the module switches. Every module ships in the codebase; the institution
   only sees what is switched on here. */
CREATE TABLE dbo.ModuleSettings (
    ModuleCode          NVARCHAR(20)    NOT NULL PRIMARY KEY,
    [Name]              NVARCHAR(60)    NOT NULL,
    IsEnabled           BIT             NOT NULL,
    -- Core modules cannot be switched off.
    IsCore              BIT             NOT NULL CONSTRAINT DF_ModuleSettings_Core DEFAULT (0),
    ModifiedByUserId    INT             NULL,
    ModifiedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT FK_ModuleSettings_User FOREIGN KEY (ModifiedByUserId) REFERENCES dbo.Users (UserId),
    CONSTRAINT CK_ModuleSettings_Core CHECK (IsCore = 0 OR IsEnabled = 1)
);
GO

CREATE TABLE dbo.AppSettings (
    SettingKey          NVARCHAR(80)    NOT NULL PRIMARY KEY,
    SettingValue        NVARCHAR(500)   NULL,
    [Description]       NVARCHAR(200)   NULL,
    ModifiedByUserId    INT             NULL,
    ModifiedAtUtc       DATETIME2(0)    NULL,
    CONSTRAINT FK_AppSettings_User FOREIGN KEY (ModifiedByUserId) REFERENCES dbo.Users (UserId)
);
GO

/* Append-only. Nothing updates or deletes from this table; the fee ledger and
   mark entry both depend on being able to answer "who changed this, when". */
CREATE TABLE dbo.AuditLog (
    AuditId             BIGINT          NOT NULL IDENTITY(1,1) PRIMARY KEY,
    OccurredAtUtc       DATETIME2(0)    NOT NULL CONSTRAINT DF_AuditLog_At DEFAULT (SYSUTCDATETIME()),
    UserId              INT             NULL,
    RoleCode            NVARCHAR(20)    NULL,
    [Action]            NVARCHAR(60)    NOT NULL,   -- fee.collect, marks.save, admission.create …
    EntityName          NVARCHAR(60)    NOT NULL,
    EntityKey           NVARCHAR(60)    NULL,
    Details             NVARCHAR(1000)  NULL,       -- JSON payload
    IpAddress           NVARCHAR(45)    NULL,
    CONSTRAINT FK_AuditLog_User FOREIGN KEY (UserId) REFERENCES dbo.Users (UserId)
);
GO

CREATE INDEX IX_AuditLog_Time ON dbo.AuditLog (OccurredAtUtc DESC) INCLUDE (UserId, [Action], EntityKey);
CREATE INDEX IX_AuditLog_Entity ON dbo.AuditLog (EntityName, EntityKey);
GO

/* §15 — the nightly Hangfire job records each run here so the Admin screen can
   show when the last successful off-site backup happened. Backups themselves go
   to Google Drive, deliberately a different provider from the host: an outage
   on one should not take out the other. */
CREATE TABLE dbo.BackupLog (
    BackupId            INT             NOT NULL IDENTITY(1,1) PRIMARY KEY,
    StartedAtUtc        DATETIME2(0)    NOT NULL,
    CompletedAtUtc      DATETIME2(0)    NULL,
    [Status]            NVARCHAR(16)    NOT NULL,   -- Running | Success | Failed
    SizeBytes           BIGINT          NULL,
    DestinationFileId   NVARCHAR(120)   NULL,       -- Google Drive file id
    ErrorMessage        NVARCHAR(1000)  NULL,
    PurgedOlderThan     DATE            NULL,       -- 30-day retention sweep
    CONSTRAINT CK_BackupLog_Status CHECK ([Status] IN (N'Running', N'Success', N'Failed'))
);
GO

/* -----------------------------------------------------------------------------
   14. Views the application reads from
   -------------------------------------------------------------------------- */

/* The active roster — every screen that lists students starts here. */
CREATE VIEW dbo.vw_ActiveStudents
AS
SELECT
    s.StudentId,
    s.FullName,
    s.FullNameBn,
    s.Gender,
    s.DateOfBirth,
    e.RollNumber,
    cs.ClassSectionId,
    cs.[Name]           AS SectionName,
    g.GradeId,
    g.[Name]            AS GradeName,
    g.SchoolSection,
    g.AttendanceMode,
    gr.Code             AS GroupCode,
    gr.[Name]           AS GroupName,
    gd.GuardianId,
    gd.FatherName,
    gd.Mobile           AS GuardianMobile,
    e.WaiverCode,
    ay.AcademicYearId
FROM dbo.Students s
JOIN dbo.Enrolments e       ON e.StudentId = s.StudentId AND e.IsActive = 1
JOIN dbo.AcademicYears ay   ON ay.AcademicYearId = e.AcademicYearId AND ay.IsCurrent = 1
JOIN dbo.ClassSections cs   ON cs.ClassSectionId = e.ClassSectionId
JOIN dbo.Grades g           ON g.GradeId = cs.GradeId
LEFT JOIN dbo.Groups gr     ON gr.GroupId = cs.GroupId
JOIN dbo.Guardians gd       ON gd.GuardianId = s.GuardianId
WHERE s.[Status] = N'Active';
GO

/* §6 — year-to-date attendance and the board-eligibility flag. Late counts as
   present: the board measures presence, not punctuality. */
CREATE VIEW dbo.vw_AttendanceSummary
AS
SELECT
    a.StudentId,
    COUNT(*)                                                        AS TotalRecords,
    SUM(CASE WHEN a.[Status] IN ('P', 'L') THEN 1 ELSE 0 END)        AS PresentCount,
    SUM(CASE WHEN a.[Status] = 'A' THEN 1 ELSE 0 END)                AS AbsentCount,
    SUM(CASE WHEN a.[Status] = 'L' THEN 1 ELSE 0 END)                AS LateCount,
    SUM(CASE WHEN a.[Status] = 'E' THEN 1 ELSE 0 END)                AS ExcusedCount,
    CAST(100.0 * SUM(CASE WHEN a.[Status] IN ('P', 'L') THEN 1 ELSE 0 END)
         / NULLIF(COUNT(*), 0) AS DECIMAL(5,2))                      AS AttendancePercent,
    CASE WHEN 100.0 * SUM(CASE WHEN a.[Status] IN ('P', 'L') THEN 1 ELSE 0 END)
              / NULLIF(COUNT(*), 0) >= 70 THEN 1 ELSE 0 END          AS IsBoardEligible
FROM dbo.Attendance a
JOIN dbo.AcademicYears ay ON ay.IsCurrent = 1
                         AND a.[Date] BETWEEN ay.StartDate AND ay.EndDate
GROUP BY a.StudentId;
GO

/* §11 — the outstanding balance per student, which the dues register and the
   parent portal both read. */
CREATE VIEW dbo.vw_StudentLedger
AS
SELECT
    i.StudentId,
    SUM(i.NetAmount)                            AS BilledAmount,
    SUM(i.PaidAmount)                           AS PaidAmount,
    SUM(i.NetAmount - i.PaidAmount)             AS DueAmount,
    SUM(CASE WHEN i.[Status] IN (N'Unpaid', N'Partial') AND i.DueOn < CAST(SYSDATETIME() AS DATE)
             THEN 1 ELSE 0 END)                 AS OverdueInvoiceCount,
    MIN(CASE WHEN i.[Status] IN (N'Unpaid', N'Partial') THEN i.DueOn END) AS EarliestDueDate
FROM dbo.Invoices i
JOIN dbo.AcademicYears ay ON ay.AcademicYearId = i.AcademicYearId AND ay.IsCurrent = 1
WHERE i.[Status] <> N'Cancelled'
GROUP BY i.StudentId;
GO

/* -----------------------------------------------------------------------------
   15. Procedures where a constraint alone is not enough
   -------------------------------------------------------------------------- */

/* §8 — allocate the next permanent student identifier.

   The UPDLOCK/HOLDLOCK pair serialises concurrent admissions on the same
   YYMM bucket, which is the only way two clerks admitting at the same moment
   cannot be handed the same number. The counter is never rewound, so a
   withdrawn student's ID stays retired forever. */
CREATE PROCEDURE dbo.usp_AllocateStudentId
    @AdmissionDate  DATE,
    @StudentId      CHAR(8) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @YearMonth CHAR(4) = FORMAT(@AdmissionDate, 'yyMM');
    DECLARE @Serial SMALLINT;

    BEGIN TRANSACTION;

        SELECT @Serial = NextSerial
        FROM dbo.StudentIdSequence WITH (UPDLOCK, HOLDLOCK)
        WHERE YearMonth = @YearMonth;

        IF @Serial IS NULL
        BEGIN
            INSERT INTO dbo.StudentIdSequence (YearMonth, NextSerial) VALUES (@YearMonth, 2);
            SET @Serial = 1;
        END
        ELSE
        BEGIN
            IF @Serial > 9999
            BEGIN
                ROLLBACK TRANSACTION;
                THROW 50001, N'Monthly admission capacity of 9,999 has been exhausted for this month.', 1;
            END
            UPDATE dbo.StudentIdSequence
            SET NextSerial = NextSerial + 1, ModifiedAtUtc = SYSUTCDATETIME()
            WHERE YearMonth = @YearMonth;
        END

        SET @StudentId = @YearMonth + RIGHT('0000' + CAST(@Serial AS VARCHAR(4)), 4);

    COMMIT TRANSACTION;
END
GO

/* §7 — recompute a student's term result.

   The rules, in the order they are applied:
     1. Each subject's grade point comes from dbo.GradeScale, looked up on the
        percentage so a 200-mark HSC paper grades on the same scale.
     2. The optional (4th) subject is excluded from the divisor; its grade
        points above 2.00 are added as a bonus and a fail in it is not fatal.
     3. A fail in ANY compulsory subject fails the whole result — GPA 0.00,
        letter F, regardless of the other grades.
     4. GPA is capped at 5.00 and truncated, not rounded: the boards publish
        4.99, never 5.00, for a student who fell fractionally short. */
CREATE PROCEDURE dbo.usp_ComputeTermResult
    @StudentId  CHAR(8),
    @ExamTermId INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @OptionalSubjectId INT;
    SELECT @OptionalSubjectId = e.OptionalSubjectId
    FROM dbo.Enrolments e
    JOIN dbo.AcademicYears ay ON ay.AcademicYearId = e.AcademicYearId AND ay.IsCurrent = 1
    WHERE e.StudentId = @StudentId AND e.IsActive = 1;

    ;WITH Scored AS (
        SELECT
            m.SubjectId,
            sub.Code,
            sub.FullMarks,
            m.ObtainedMarks,
            CAST(100.0 * m.ObtainedMarks / sub.FullMarks AS DECIMAL(6,2)) AS Pct,
            CASE WHEN m.SubjectId = @OptionalSubjectId THEN 1 ELSE 0 END  AS IsOptional
        FROM dbo.Marks m
        JOIN dbo.Subjects sub ON sub.SubjectId = m.SubjectId
        WHERE m.StudentId = @StudentId
          AND m.ExamTermId = @ExamTermId
          AND m.ObtainedMarks IS NOT NULL
    ),
    Graded AS (
        SELECT s.*, gs.GradePoint, gs.LetterGrade
        FROM Scored s
        JOIN dbo.GradeScale gs ON s.Pct BETWEEN gs.MinPercent AND gs.MaxPercent
    ),
    Agg AS (
        SELECT
            SUM(CASE WHEN IsOptional = 0 THEN GradePoint END)                    AS CompulsoryGpSum,
            COUNT(CASE WHEN IsOptional = 0 THEN 1 END)                           AS CompulsoryCount,
            MAX(CASE WHEN IsOptional = 1 THEN GradePoint END)                    AS OptionalGp,
            SUM(CASE WHEN IsOptional = 0 AND GradePoint = 0 THEN 1 ELSE 0 END)   AS FailedCount,
            SUM(ObtainedMarks)                                                   AS TotalMarks,
            SUM(FullMarks)                                                       AS TotalFull
        FROM Graded
    )
    MERGE dbo.TermResults AS target
    USING (
        SELECT
            @StudentId  AS StudentId,
            @ExamTermId AS ExamTermId,
            a.TotalMarks,
            a.TotalFull,
            CASE
                WHEN a.CompulsoryCount = 0 OR a.FailedCount > 0 THEN 0.00
                ELSE
                    -- Truncate to 2dp rather than round, then cap at 5.00.
                    CASE WHEN FLOOR(100.0 * (
                            a.CompulsoryGpSum / a.CompulsoryCount
                            + CASE WHEN a.OptionalGp > 2
                                   THEN (a.OptionalGp - 2) / a.CompulsoryCount ELSE 0 END
                         )) / 100.0 > 5.00
                    THEN 5.00
                    ELSE FLOOR(100.0 * (
                            a.CompulsoryGpSum / a.CompulsoryCount
                            + CASE WHEN a.OptionalGp > 2
                                   THEN (a.OptionalGp - 2) / a.CompulsoryCount ELSE 0 END
                         )) / 100.0
                    END
            END AS Gpa,
            CASE WHEN a.FailedCount > 0 THEN 1 ELSE 0 END AS HasFailed,
            (SELECT STUFF((SELECT N', ' + g2.Code FROM Graded g2
                           WHERE g2.IsOptional = 0 AND g2.GradePoint = 0
                           FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(200)'), 1, 2, N''))
                AS FailedSubjectCodes
        FROM Agg a
    ) AS src
    ON target.StudentId = src.StudentId AND target.ExamTermId = src.ExamTermId
    WHEN MATCHED THEN UPDATE SET
        TotalMarks         = src.TotalMarks,
        TotalFullMarks     = src.TotalFull,
        Gpa                = src.Gpa,
        LetterGrade        = CASE WHEN src.HasFailed = 1 THEN N'F'
                                  WHEN src.Gpa >= 5 THEN N'A+'
                                  WHEN src.Gpa >= 4 THEN N'A'
                                  WHEN src.Gpa >= 3.5 THEN N'A-'
                                  WHEN src.Gpa >= 3 THEN N'B'
                                  WHEN src.Gpa >= 2 THEN N'C'
                                  WHEN src.Gpa >= 1 THEN N'D' ELSE N'F' END,
        HasFailed          = src.HasFailed,
        FailedSubjectCodes = src.FailedSubjectCodes,
        ComputedAtUtc      = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT
        (StudentId, ExamTermId, TotalMarks, TotalFullMarks, Gpa, LetterGrade, HasFailed, FailedSubjectCodes)
        VALUES (src.StudentId, src.ExamTermId, src.TotalMarks, src.TotalFull, src.Gpa,
                CASE WHEN src.HasFailed = 1 THEN N'F'
                     WHEN src.Gpa >= 5 THEN N'A+'
                     WHEN src.Gpa >= 4 THEN N'A'
                     WHEN src.Gpa >= 3.5 THEN N'A-'
                     WHEN src.Gpa >= 3 THEN N'B'
                     WHEN src.Gpa >= 2 THEN N'C'
                     WHEN src.Gpa >= 1 THEN N'D' ELSE N'F' END,
                src.HasFailed, src.FailedSubjectCodes);
END
GO

/* -----------------------------------------------------------------------------
   16. Storage note (§3, §17)

   The free tier caps the database at 1 GB. The dominant tables are Attendance
   (~660k rows/year for the school section, plus period-wise rows for the
   college section) and Marks (~130k rows/year). At the measured row widths
   that is roughly 60–70 MB a year, so the ceiling is a multi-year concern
   rather than an immediate one — but only while the §14 rule holds and no
   binary ever lands in a column. Archive plan: move Attendance and Marks rows
   older than three academic years to a cold table, then to an off-box export.
   -------------------------------------------------------------------------- */
