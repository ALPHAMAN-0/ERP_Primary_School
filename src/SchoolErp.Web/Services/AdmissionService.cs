using System;
using System.Data.Entity;
using System.Data.SqlClient;
using System.Linq;
using System.Transactions;
using SchoolErp.Domain.Identity;
using SchoolErp.Web.Data;
using SchoolErp.Web.Data.Entities;

namespace SchoolErp.Web.Services
{
    public interface IAdmissionService
    {
        /// <summary>The identifier the next admission this month would receive.</summary>
        string PeekNextIdentifier(DateTime admissionDate);

        /// <summary>How many identifiers have been issued for a month, and how many remain.</summary>
        MonthlyCapacity CapacityFor(DateTime admissionDate);

        /// <summary>Admit a student, allocating a permanent identifier (§8).</summary>
        Student Admit(AdmissionRequest request, int actingUserId);
    }

    public class MonthlyCapacity
    {
        public string YearMonth { get; set; }
        public int Issued { get; set; }
        public int Remaining { get; set; }
        public int Capacity { get; set; }
    }

    public class AdmissionRequest
    {
        public string FullName { get; set; }
        public string FullNameBn { get; set; }
        public string Gender { get; set; }
        public DateTime DateOfBirth { get; set; }
        public string Religion { get; set; }
        public string BloodGroup { get; set; }
        public string BirthCertificateNo { get; set; }

        public int ClassSectionId { get; set; }
        public int? OptionalSubjectId { get; set; }
        public string WaiverCode { get; set; }

        /// <summary>
        /// When set, the student joins an existing guardian account rather than
        /// creating a second one — which is what makes §10's multi-child family work.
        /// </summary>
        public int? ExistingGuardianId { get; set; }

        public string FatherName { get; set; }
        public string FatherNameBn { get; set; }
        public string FatherOccupation { get; set; }
        public string MotherName { get; set; }
        public string MotherNameBn { get; set; }
        public string GuardianMobile { get; set; }
        public string GuardianNid { get; set; }
        public string Address { get; set; }
        public string Area { get; set; }
    }

    /// <summary>
    /// Admissions (§8).
    ///
    /// The whole point of this service is the identifier allocation. Everything
    /// else here is bookkeeping.
    /// </summary>
    public class AdmissionService : IAdmissionService
    {
        private readonly SchoolErpContext _db;
        private readonly IAuditService _audit;

        public AdmissionService(SchoolErpContext db, IAuditService audit)
        {
            _db = db;
            _audit = audit;
        }

        public string PeekNextIdentifier(DateTime admissionDate)
        {
            var key = StudentIdentifier.YearMonthKey(admissionDate);
            var row = _db.StudentIdSequences.AsNoTracking().FirstOrDefault(s => s.YearMonth == key);
            var next = row == null ? 1 : row.NextSerial;
            return StudentIdentifier.Create(admissionDate, next);
        }

        public MonthlyCapacity CapacityFor(DateTime admissionDate)
        {
            var key = StudentIdentifier.YearMonthKey(admissionDate);
            var row = _db.StudentIdSequences.AsNoTracking().FirstOrDefault(s => s.YearMonth == key);
            var issued = row == null ? 0 : row.NextSerial - 1;

            return new MonthlyCapacity
            {
                YearMonth = key,
                Issued = issued,
                Remaining = StudentIdentifier.MonthlyCapacity - issued,
                Capacity = StudentIdentifier.MonthlyCapacity
            };
        }

        public Student Admit(AdmissionRequest request, int actingUserId)
        {
            if (request == null) throw new ArgumentNullException("request");

            var section = _db.ClassSections
                .Include(c => c.Grade)
                .FirstOrDefault(c => c.ClassSectionId == request.ClassSectionId);
            if (section == null) throw new InvalidOperationException("The selected class section does not exist.");

            var year = _db.AcademicYears.FirstOrDefault(y => y.IsCurrent);
            if (year == null) throw new InvalidOperationException("No academic year is marked current.");

            var admittedOn = DateTime.Now.Date;

            // Serializable, because allocating the identifier and inserting the
            // student must be one atomic act. If the insert fails, the serial must
            // roll back with it — otherwise a number is burned and the audit trail
            // shows a gap nobody can explain.
            using (var scope = new TransactionScope(
                TransactionScopeOption.Required,
                new TransactionOptions { IsolationLevel = System.Transactions.IsolationLevel.Serializable }))
            {
                var studentId = AllocateIdentifier(admittedOn);

                var guardianId = request.ExistingGuardianId ?? CreateGuardian(request);

                var student = new Student
                {
                    StudentId = studentId,
                    FullName = request.FullName,
                    FullNameBn = request.FullNameBn,
                    Gender = request.Gender,
                    DateOfBirth = request.DateOfBirth,
                    Religion = request.Religion,
                    BloodGroup = request.BloodGroup,
                    BirthCertificateNo = request.BirthCertificateNo,
                    GuardianId = guardianId,
                    AdmittedOn = admittedOn,
                    AdmissionGradeId = section.GradeId,
                    Status = "Active",
                    CreatedAtUtc = DateTime.UtcNow
                };
                _db.Students.Add(student);

                // Roll numbers are allocated per class per year and are not
                // permanent — unlike the student identifier, they are reassigned
                // on promotion.
                var nextRoll = _db.Enrolments
                    .Where(e => e.ClassSectionId == section.ClassSectionId && e.AcademicYearId == year.AcademicYearId)
                    .Select(e => (short?)e.RollNumber)
                    .Max() ?? 0;

                _db.Enrolments.Add(new Enrolment
                {
                    StudentId = studentId,
                    AcademicYearId = year.AcademicYearId,
                    ClassSectionId = section.ClassSectionId,
                    RollNumber = (short)(nextRoll + 1),
                    OptionalSubjectId = request.OptionalSubjectId,
                    WaiverCode = string.IsNullOrEmpty(request.WaiverCode) ? "NONE" : request.WaiverCode,
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                });

                _db.SaveChanges();

                _audit.Record(actingUserId, "admission.create", "Student", studentId,
                    new { student.FullName, Class = section.DisplayName, Roll = nextRoll + 1 });

                scope.Complete();
                return student;
            }
        }

        /// <summary>
        /// Allocate the next serial for the admission month.
        ///
        /// Delegates to <c>usp_AllocateStudentId</c> rather than reading and
        /// incrementing in C#: the procedure takes UPDLOCK/HOLDLOCK on the counter
        /// row, which is what stops two clerks admitting at the same moment from
        /// being handed the same identifier. A read-then-write here would leave
        /// exactly that race open.
        /// </summary>
        private string AllocateIdentifier(DateTime admissionDate)
        {
            var dateParam = new SqlParameter("@AdmissionDate", admissionDate.Date);
            var outParam = new SqlParameter
            {
                ParameterName = "@StudentId",
                SqlDbType = System.Data.SqlDbType.Char,
                Size = 8,
                Direction = System.Data.ParameterDirection.Output
            };

            _db.Database.ExecuteSqlCommand(
                "EXEC dbo.usp_AllocateStudentId @AdmissionDate, @StudentId OUTPUT",
                dateParam, outParam);

            var allocated = outParam.Value as string;
            if (string.IsNullOrEmpty(allocated))
            {
                throw new InvalidOperationException("The identifier allocator returned no value.");
            }

            // Belt and braces: the procedure and the domain rule must agree on the
            // format, and a mismatch means one of them has drifted.
            if (!StudentIdentifier.IsValid(allocated))
            {
                throw new InvalidOperationException(
                    string.Format("The allocator returned '{0}', which is not a valid {1} identifier.",
                        allocated, StudentIdentifier.Format));
            }

            return allocated;
        }

        private int CreateGuardian(AdmissionRequest r)
        {
            var guardian = new Guardian
            {
                FatherName = r.FatherName,
                FatherNameBn = r.FatherNameBn ?? r.FatherName,
                FatherOccupation = r.FatherOccupation,
                MotherName = r.MotherName,
                MotherNameBn = r.MotherNameBn ?? r.MotherName,
                Mobile = r.GuardianMobile,
                NationalId = r.GuardianNid,
                Address = r.Address,
                Area = r.Area,
                IsVerified = false,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.Guardians.Add(guardian);
            _db.SaveChanges();
            return guardian.GuardianId;
        }
    }
}
