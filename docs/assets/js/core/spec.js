/**
 * DOMAIN SPECIFICATION — single source of truth.
 *
 * This file encodes every rule from `school_college_erp_requirements.md` that
 * both runtimes must agree on. The ASP.NET MVC production app and this browser
 * twin are generated from the same shape, so demo and production cannot drift.
 *
 * Section references (§n) point back to the requirements document.
 */

export const INSTITUTION = {
  name: 'Shahjalal School & College',
  nameBn: 'শাহজালাল স্কুল অ্যান্ড কলেজ',
  eiin: '132907',
  address: 'Zindabazar, Sylhet 3100, Bangladesh',
  phone: '+880 821 720 145',
  email: 'office@shahjalalsc.edu.bd',
  established: 1994,
  // §1 — one composite institution, school section + college section
  sections: ['School', 'College'],
};

/** §7 — SSC/HSC board grading table. Order matters: first match wins. */
export const GRADE_SCALE = [
  { min: 80, max: 100, letter: 'A+', gp: 5.0, label: 'Excellent' },
  { min: 70, max: 79, letter: 'A', gp: 4.0, label: 'Very Good' },
  { min: 60, max: 69, letter: 'A-', gp: 3.5, label: 'Good' },
  { min: 50, max: 59, letter: 'B', gp: 3.0, label: 'Satisfactory' },
  { min: 40, max: 49, letter: 'C', gp: 2.0, label: 'Average' },
  { min: 33, max: 39, letter: 'D', gp: 1.0, label: 'Pass' },
  { min: 0, max: 32, letter: 'F', gp: 0.0, label: 'Fail' },
];

export const PASS_MARK = 33;

/** §5 — academic structure. `stage` drives attendance mode and subject lists. */
export const GRADES = [
  { id: 'KG', name: 'KG', level: 0, section: 'School', grouped: false },
  { id: 'C1', name: 'Class 1', level: 1, section: 'School', grouped: false },
  { id: 'C2', name: 'Class 2', level: 2, section: 'School', grouped: false },
  { id: 'C3', name: 'Class 3', level: 3, section: 'School', grouped: false },
  { id: 'C4', name: 'Class 4', level: 4, section: 'School', grouped: false },
  { id: 'C5', name: 'Class 5', level: 5, section: 'School', grouped: false },
  { id: 'C6', name: 'Class 6', level: 6, section: 'School', grouped: false },
  { id: 'C7', name: 'Class 7', level: 7, section: 'School', grouped: false },
  { id: 'C8', name: 'Class 8', level: 8, section: 'School', grouped: false },
  { id: 'C9', name: 'Class 9', level: 9, section: 'School', grouped: true },
  { id: 'C10', name: 'Class 10', level: 10, section: 'School', grouped: true, terminal: 'SSC' },
  { id: 'C11', name: 'Class 11', level: 11, section: 'College', grouped: true },
  { id: 'C12', name: 'Class 12', level: 12, section: 'College', grouped: true, terminal: 'HSC' },
];

/** §5 — groups apply from Class 9 upward. */
export const GROUPS = [
  { id: 'SCI', name: 'Science', nameBn: 'বিজ্ঞান' },
  { id: 'BUS', name: 'Business Studies', nameBn: 'ব্যবসায় শিক্ষা' },
  { id: 'HUM', name: 'Humanities', nameBn: 'মানবিক' },
];

/**
 * Class sections. Ungrouped grades use A–D; grouped grades map each section to
 * a group so a student's group is implied by their class section.
 */
export const CLASS_SECTIONS = {
  ungrouped: [
    { id: 'A', name: 'A' },
    { id: 'B', name: 'B' },
    { id: 'C', name: 'C' },
    { id: 'D', name: 'D' },
  ],
  grouped: [
    { id: 'SCI-A', name: 'Science A', group: 'SCI' },
    { id: 'SCI-B', name: 'Science B', group: 'SCI' },
    { id: 'BUS-A', name: 'Business A', group: 'BUS' },
    { id: 'HUM-A', name: 'Humanities A', group: 'HUM' },
  ],
};

/**
 * Subject catalogue. `optional: true` marks the 4th-subject rule (§7 extension):
 * grade points above 2.00 are added as bonus and the subject is excluded from
 * the divisor. A failing optional subject does not fail the student.
 */
const SUB = (code, name, nameBn, full = 100, opts = {}) => ({ code, name, nameBn, full, ...opts });

export const SUBJECTS_BY_STAGE = {
  KG: [
    SUB('BAN', 'Bangla', 'বাংলা'),
    SUB('ENG', 'English', 'ইংরেজি'),
    SUB('MAT', 'Mathematics', 'গণিত'),
    SUB('GK', 'General Knowledge', 'সাধারণ জ্ঞান'),
    SUB('DRW', 'Drawing', 'চিত্রাঙ্কন', 50),
  ],
  PRIMARY: [
    SUB('BAN', 'Bangla', 'বাংলা'),
    SUB('ENG', 'English', 'ইংরেজি'),
    SUB('MAT', 'Mathematics', 'গণিত'),
    SUB('BGS', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়'),
    SUB('SCI', 'Elementary Science', 'প্রাথমিক বিজ্ঞান'),
    SUB('REL', 'Religion & Moral Education', 'ধর্ম ও নৈতিক শিক্ষা'),
  ],
  JUNIOR: [
    SUB('BAN', 'Bangla', 'বাংলা'),
    SUB('ENG', 'English', 'ইংরেজি'),
    SUB('MAT', 'Mathematics', 'গণিত'),
    SUB('SCI', 'Science', 'বিজ্ঞান'),
    SUB('BGS', 'Bangladesh & Global Studies', 'বাংলাদেশ ও বিশ্বপরিচয়'),
    SUB('REL', 'Religion & Moral Education', 'ধর্ম ও নৈতিক শিক্ষা'),
    SUB('ICT', 'ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 50),
    SUB('AGR', 'Agriculture Studies', 'কৃষিশিক্ষা', 100, { optional: true }),
  ],
  SSC: {
    common: [
      SUB('BAN1', 'Bangla 1st Paper', 'বাংলা ১ম পত্র'),
      SUB('BAN2', 'Bangla 2nd Paper', 'বাংলা ২য় পত্র'),
      SUB('ENG1', 'English 1st Paper', 'ইংরেজি ১ম পত্র'),
      SUB('ENG2', 'English 2nd Paper', 'ইংরেজি ২য় পত্র'),
      SUB('MAT', 'Mathematics', 'গণিত'),
      SUB('REL', 'Religion & Moral Education', 'ধর্ম ও নৈতিক শিক্ষা'),
      SUB('ICT', 'ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 50),
    ],
    SCI: [
      SUB('PHY', 'Physics', 'পদার্থবিজ্ঞান'),
      SUB('CHE', 'Chemistry', 'রসায়ন'),
      SUB('BIO', 'Biology', 'জীববিজ্ঞান'),
      SUB('HMT', 'Higher Mathematics', 'উচ্চতর গণিত', 100, { optional: true }),
    ],
    BUS: [
      SUB('ACC', 'Accounting', 'হিসাববিজ্ঞান'),
      SUB('BE', 'Business Entrepreneurship', 'ব্যবসায় উদ্যোগ'),
      SUB('FB', 'Finance & Banking', 'ফিন্যান্স ও ব্যাংকিং'),
      SUB('AGR', 'Agriculture Studies', 'কৃষিশিক্ষা', 100, { optional: true }),
    ],
    HUM: [
      SUB('HIS', 'History of Bangladesh & World Civilization', 'বাংলাদেশ ও বিশ্বসভ্যতা'),
      SUB('GEO', 'Geography & Environment', 'ভূগোল ও পরিবেশ'),
      SUB('CIV', 'Civics & Citizenship', 'পৌরনীতি ও নাগরিকতা'),
      SUB('ECO', 'Economics', 'অর্থনীতি', 100, { optional: true }),
    ],
  },
  HSC: {
    common: [
      SUB('BAN1', 'Bangla 1st Paper', 'বাংলা ১ম পত্র'),
      SUB('BAN2', 'Bangla 2nd Paper', 'বাংলা ২য় পত্র'),
      SUB('ENG1', 'English 1st Paper', 'ইংরেজি ১ম পত্র'),
      SUB('ENG2', 'English 2nd Paper', 'ইংরেজি ২য় পত্র'),
      SUB('ICT', 'ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', 100),
    ],
    SCI: [
      SUB('PHY', 'Physics', 'পদার্থবিজ্ঞান', 200),
      SUB('CHE', 'Chemistry', 'রসায়ন', 200),
      SUB('BIO', 'Biology', 'জীববিজ্ঞান', 200),
      SUB('HMT', 'Higher Mathematics', 'উচ্চতর গণিত', 200, { optional: true }),
    ],
    BUS: [
      SUB('ACC', 'Accounting', 'হিসাববিজ্ঞান', 200),
      SUB('BOM', 'Business Organization & Management', 'ব্যবসায় সংগঠন ও ব্যবস্থাপনা', 200),
      SUB('FBI', 'Finance, Banking & Insurance', 'ফিন্যান্স, ব্যাংকিং ও বিমা', 200),
      SUB('ECO', 'Economics', 'অর্থনীতি', 200, { optional: true }),
    ],
    HUM: [
      SUB('CIV', 'Civics & Good Governance', 'পৌরনীতি ও সুশাসন', 200),
      SUB('ECO', 'Economics', 'অর্থনীতি', 200),
      SUB('HIS', 'History', 'ইতিহাস', 200),
      SUB('LOG', 'Logic', 'যুক্তিবিদ্যা', 200, { optional: true }),
    ],
  },
};

/** §9 — fixed roles, not a permission matrix. Multi-hat staff get many roles. */
export const ROLES = {
  ADMIN: {
    id: 'ADMIN',
    name: 'Admin',
    icon: 'shield',
    color: 'violet',
    desc: 'Full system access, settings, and feature toggles',
  },
  TEACHER: {
    id: 'TEACHER',
    name: 'Teacher',
    icon: 'academic',
    color: 'blue',
    desc: 'Attendance, mark entry, class routine, notices',
  },
  ACCOUNTANT: {
    id: 'ACCOUNTANT',
    name: 'Accountant',
    icon: 'cash',
    color: 'emerald',
    desc: 'Fee collection, invoices, receipts, dues reports',
  },
  LIBRARIAN: {
    id: 'LIBRARIAN',
    name: 'Librarian',
    icon: 'book',
    color: 'amber',
    desc: 'Catalogue, issue and return, overdue fines',
  },
  TRANSPORT: {
    id: 'TRANSPORT',
    name: 'Transport Manager',
    icon: 'bus',
    color: 'orange',
    desc: 'Routes, vehicles, stoppages, student assignments',
  },
  HR: {
    id: 'HR',
    name: 'HR Manager',
    icon: 'users',
    color: 'rose',
    desc: 'Staff records, payroll runs, payslips',
  },
  STUDENT: {
    id: 'STUDENT',
    name: 'Student',
    icon: 'user',
    color: 'cyan',
    desc: 'Own results, attendance, routine, fee status',
  },
  PARENT: {
    id: 'PARENT',
    name: 'Parent',
    icon: 'heart',
    color: 'pink',
    desc: 'All linked children, results, dues, notices',
  },
};

/**
 * §4 — every module has an on/off switch. `defaultOn` reflects the launch
 * configuration agreed in the requirements.
 */
export const MODULES = [
  { id: 'admissions', name: 'Admissions', defaultOn: true, core: true, icon: 'plus', roles: ['ADMIN'] },
  { id: 'students', name: 'Student Profiles', defaultOn: true, core: true, icon: 'users', roles: ['ADMIN', 'TEACHER'] },
  { id: 'attendance', name: 'Attendance', defaultOn: true, core: true, icon: 'check', roles: ['ADMIN', 'TEACHER'] },
  { id: 'exams', name: 'Exams & Results', defaultOn: true, core: true, icon: 'chart', roles: ['ADMIN', 'TEACHER'] },
  { id: 'routine', name: 'Class Routine', defaultOn: true, core: true, icon: 'calendar', roles: ['ADMIN', 'TEACHER'] },
  { id: 'fees', name: 'Fees & Accounts', defaultOn: true, icon: 'cash', roles: ['ADMIN', 'ACCOUNTANT'] },
  { id: 'notices', name: 'Notice Board', defaultOn: true, icon: 'megaphone', roles: ['ADMIN', 'TEACHER'] },
  { id: 'portal', name: 'Parent Portal', defaultOn: true, icon: 'heart', roles: ['PARENT', 'STUDENT'] },
  { id: 'library', name: 'Library', defaultOn: false, icon: 'book', roles: ['ADMIN', 'LIBRARIAN'] },
  { id: 'transport', name: 'Transport', defaultOn: false, icon: 'bus', roles: ['ADMIN', 'TRANSPORT'] },
  { id: 'hr', name: 'HR & Payroll', defaultOn: false, icon: 'briefcase', roles: ['ADMIN', 'HR'] },
  { id: 'hostel', name: 'Hostel / Boarding', defaultOn: false, icon: 'home', roles: ['ADMIN'] },
];

/** §11 — fee heads. Monthly tuition varies by grade level. */
export const FEE_HEADS = [
  { id: 'ADM', name: 'Admission Fee', recurrence: 'once', amount: 3000 },
  { id: 'TUI', name: 'Monthly Tuition', recurrence: 'monthly', byLevel: true },
  { id: 'EXM', name: 'Exam Fee', recurrence: 'per-term', amount: 600 },
  { id: 'DEV', name: 'Development Fee', recurrence: 'yearly', amount: 1500 },
  { id: 'LIB', name: 'Library Fee', recurrence: 'yearly', amount: 400, module: 'library' },
  { id: 'TRN', name: 'Transport Fee', recurrence: 'monthly', byRoute: true, module: 'transport' },
  { id: 'HST', name: 'Hostel Fee', recurrence: 'monthly', amount: 3500, module: 'hostel' },
];

/** Monthly tuition in BDT keyed by grade level (0 = KG). */
export const TUITION_BY_LEVEL = {
  0: 700, 1: 750, 2: 750, 3: 800, 4: 800, 5: 900,
  6: 1000, 7: 1000, 8: 1100, 9: 1400, 10: 1500, 11: 1800, 12: 1900,
};

/** §6 — exam terms. Grades 10 and 12 add a board-prep Test Exam. */
export const EXAM_TERMS = [
  { id: 'T1', name: '1st Terminal', short: '1st Term', month: 4, weight: 0.2 },
  { id: 'T2', name: 'Half-Yearly', short: 'Half-Yearly', month: 7, weight: 0.3 },
  { id: 'T3', name: 'Annual Examination', short: 'Annual', month: 11, weight: 0.5 },
  { id: 'TEST', name: 'Test Examination', short: 'Test', month: 9, weight: 0, boardPrepOnly: true },
];

/** §6 — attendance modes. */
export const ATTENDANCE = {
  DAILY: 'daily',       // School section (KG–10): once per day
  PERIOD: 'period',     // College section (11–12): period/subject-wise
  /** HSC board eligibility threshold — students below this are flagged. */
  ELIGIBILITY_THRESHOLD: 70,
  STATUSES: [
    { id: 'P', name: 'Present', color: 'ok' },
    { id: 'A', name: 'Absent', color: 'bad' },
    { id: 'L', name: 'Late', color: 'warn' },
    { id: 'E', name: 'Excused', color: 'info' },
  ],
};

/** Weekly routine. Bangladesh school week: Sunday–Thursday. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

export const PERIODS = [
  { id: 1, label: '1st', start: '09:00', end: '09:45' },
  { id: 2, label: '2nd', start: '09:45', end: '10:30' },
  { id: 3, label: '3rd', start: '10:30', end: '11:15' },
  { id: 0, label: 'Break', start: '11:15', end: '11:45', isBreak: true },
  { id: 4, label: '4th', start: '11:45', end: '12:30' },
  { id: 5, label: '5th', start: '12:30', end: '13:15' },
  { id: 6, label: '6th', start: '13:15', end: '14:00' },
];

/** §8 — student ID format YYMMSSSS, permanent, never reused. */
export const STUDENT_ID = {
  format: 'YYMMSSSS',
  description: '2-digit year + 2-digit month + 4-digit serial',
  monthlyCapacity: 9999,
};

/** §3 — free-tier hosting budget, surfaced live in the System Health screen. */
export const HOSTING = {
  provider: 'MonsterASP.NET',
  tier: 'Free',
  storageGb: 5,
  ramMb: 256,
  databases: 1,
  dbStorageGb: 1,
  customDomain: false,
  uptimeSla: false,
  upgrade: { name: 'Premium Single', priceUsd: 1.95, ramMb: 512, dbStorageGb: 2, databases: 2 },
};

/** §12 — notification channels. SMS is scaffolded but intentionally inactive. */
export const NOTIFICATION_CHANNELS = [
  {
    id: 'email',
    name: 'Email',
    status: 'active',
    provider: 'Brevo (free tier)',
    dailyCap: 300,
    note: 'Dev uses Gmail SMTP; production switches provider via config only.',
  },
  {
    id: 'sms',
    name: 'SMS',
    status: 'not-configured',
    provider: null,
    unitCostBdt: 0.3,
    note: 'Queue and toggle are built. No paid gateway wired — cost deferred.',
  },
];

/** §15 — nightly Hangfire backup to Google Drive, 30-day retention. */
export const BACKUP = {
  schedule: '0 2 * * *',
  scheduleLabel: 'Daily at 02:00 Asia/Dhaka',
  destination: 'Google Drive (15 GB free)',
  retentionDays: 30,
  engine: 'Hangfire recurring job',
};

/** Academic year currently loaded in the demo. */
export const ACADEMIC_YEAR = {
  year: 2026,
  start: '2026-01-01',
  end: '2026-12-15',
  label: 'Academic Year 2026',
};

// ---------------------------------------------------------------------------
// Derived lookups
// ---------------------------------------------------------------------------

export const GRADE_BY_ID = Object.fromEntries(GRADES.map((g) => [g.id, g]));
export const GROUP_BY_ID = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

/** Which subject bundle a grade level draws from. */
export function stageOf(grade) {
  if (grade.level === 0) return 'KG';
  if (grade.level <= 5) return 'PRIMARY';
  if (grade.level <= 8) return 'JUNIOR';
  if (grade.level <= 10) return 'SSC';
  return 'HSC';
}

/** §6 — College section takes period-wise attendance, School takes daily. */
export function attendanceModeOf(grade) {
  return grade.section === 'College' ? ATTENDANCE.PERIOD : ATTENDANCE.DAILY;
}

/** Full subject list for a grade + group combination. */
export function subjectsFor(gradeId, groupId) {
  const grade = GRADE_BY_ID[gradeId];
  if (!grade) return [];
  const stage = stageOf(grade);
  const bundle = SUBJECTS_BY_STAGE[stage];
  if (Array.isArray(bundle)) return bundle;
  return [...bundle.common, ...(bundle[groupId] || bundle.SCI)];
}

/** Class sections available for a grade. */
export function sectionsFor(gradeId) {
  const grade = GRADE_BY_ID[gradeId];
  return grade?.grouped ? CLASS_SECTIONS.grouped : CLASS_SECTIONS.ungrouped;
}

/** Exam terms applicable to a grade (board-prep Test only for 10 and 12). */
export function termsFor(gradeId) {
  const grade = GRADE_BY_ID[gradeId];
  const isBoard = Boolean(grade?.terminal);
  return EXAM_TERMS.filter((t) => !t.boardPrepOnly || isBoard);
}

/** Every (grade, section) pair in the institution — the class roster index. */
export const CLASS_LIST = GRADES.flatMap((g) =>
  sectionsFor(g.id).map((s) => ({
    key: `${g.id}-${s.id}`,
    gradeId: g.id,
    gradeName: g.name,
    sectionId: s.id,
    sectionName: s.name,
    groupId: s.group || null,
    schoolSection: g.section,
    level: g.level,
  }))
);

export const CLASS_BY_KEY = Object.fromEntries(CLASS_LIST.map((c) => [c.key, c]));
