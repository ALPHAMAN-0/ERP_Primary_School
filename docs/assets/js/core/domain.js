/**
 * DOMAIN RULES — the business logic that must behave identically in the
 * ASP.NET production app and in this browser twin.
 *
 * Nothing here touches the DOM or storage. These are pure functions, which is
 * what makes them portable: each one maps 1:1 to a method on a C# domain
 * service (see ARCHITECTURE.md → "One spec, two runtimes").
 */

import {
  GRADE_SCALE, PASS_MARK, GRADE_BY_ID, ATTENDANCE, TUITION_BY_LEVEL, STUDENT_ID,
} from './spec.js';

/**
 * Parse a date-only ISO string as LOCAL midnight.
 *
 * `new Date('2026-08-12')` is parsed as UTC by specification, so comparing it
 * against a locally-built Date silently shifts by the timezone offset. In a
 * fee or fine calculation that is a real bug — a book reads as overdue a day
 * early west of Greenwich. Every date-only string goes through here.
 */
export function parseDate(iso) {
  if (iso instanceof Date) return iso;
  return new Date(`${iso}T00:00:00`);
}

/** Whole days from `from` to `to`, floored. Negative if `to` precedes `from`. */
export function daysBetween(from, to) {
  return Math.floor((parseDate(to) - parseDate(from)) / 86400000);
}

/**
 * Serialise a Date to `YYYY-MM-DD` using its LOCAL calendar fields.
 *
 * The counterpart to parseDate, and the reason it exists: `toISOString()`
 * converts to UTC first, so a Date built as local midnight in Dhaka (UTC+6)
 * serialises as the *previous* day. That silently backdates admissions,
 * due dates and attendance keys by one day for every user east of Greenwich.
 */
export function toIsoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// §7 — Grading
// ---------------------------------------------------------------------------

/**
 * Map a mark to its grade band. Marks are normalised against the subject's
 * full mark first, so a 200-mark HSC subject grades on the same scale.
 */
export function gradeForMark(mark, fullMark = 100) {
  const pct = fullMark === 100 ? mark : (mark / fullMark) * 100;
  const band = GRADE_SCALE.find((g) => pct >= g.min && pct <= g.max);
  return band || GRADE_SCALE[GRADE_SCALE.length - 1];
}

export function isPass(mark, fullMark = 100) {
  const pct = fullMark === 100 ? mark : (mark / fullMark) * 100;
  return pct >= PASS_MARK;
}

/**
 * Compute a full result from per-subject marks.
 *
 * Implements the board rules the requirements pin down in §7, plus the
 * standard 4th-subject handling that goes with them:
 *
 *   1. Each subject's grade point comes from the SSC/HSC table.
 *   2. A fail (below 33%) in ANY compulsory subject fails the whole result,
 *      regardless of how strong the other subjects are — GPA is reported 0.00.
 *   3. The optional (4th) subject does not count toward the divisor. Grade
 *      points above 2.00 are added as a bonus; a fail in it is harmless.
 *   4. GPA is capped at 5.00 and truncated (not rounded) to 2 decimals, which
 *      is how the boards publish it.
 *
 * @param {Array<{code,name,full,optional?}>} subjects
 * @param {Record<string, number>} marks  subject code → obtained mark
 */
export function computeResult(subjects, marks) {
  const rows = subjects.map((sub) => {
    const mark = marks[sub.code];
    const has = typeof mark === 'number' && !Number.isNaN(mark);
    const band = has ? gradeForMark(mark, sub.full) : null;
    return {
      code: sub.code,
      name: sub.name,
      nameBn: sub.nameBn,
      full: sub.full,
      optional: Boolean(sub.optional),
      mark: has ? mark : null,
      percent: has ? (mark / sub.full) * 100 : null,
      letter: band ? band.letter : '—',
      gp: band ? band.gp : null,
      passed: has ? isPass(mark, sub.full) : null,
    };
  });

  const graded = rows.filter((r) => r.mark !== null);
  const compulsory = graded.filter((r) => !r.optional);
  const optional = graded.find((r) => r.optional);

  const incomplete = graded.length === 0 || compulsory.length === 0;
  // Rule 2 — one F in a compulsory subject fails everything.
  const failedSubjects = compulsory.filter((r) => !r.passed);
  const failed = failedSubjects.length > 0;

  let gpa = 0;
  if (!incomplete && !failed) {
    const base = compulsory.reduce((sum, r) => sum + r.gp, 0) / compulsory.length;
    // Rule 3 — 4th subject contributes only its excess over 2.00.
    const bonus = optional && optional.gp > 2 ? (optional.gp - 2) / compulsory.length : 0;
    gpa = Math.min(5, base + bonus);
  }

  const totalMarks = graded.reduce((s, r) => s + r.mark, 0);
  const totalFull = graded.reduce((s, r) => s + r.full, 0);

  return {
    rows,
    gpa: truncate2(gpa),
    letter: failed ? 'F' : letterForGpa(gpa),
    passed: !failed && !incomplete,
    incomplete,
    failedSubjects: failedSubjects.map((r) => r.code),
    totalMarks,
    totalFull,
    percent: totalFull ? truncate2((totalMarks / totalFull) * 100) : 0,
    subjectCount: graded.length,
  };
}

/** Reverse lookup: which letter a GPA corresponds to on a transcript. */
export function letterForGpa(gpa) {
  if (gpa >= 5) return 'A+';
  if (gpa >= 4) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3) return 'B';
  if (gpa >= 2) return 'C';
  if (gpa >= 1) return 'D';
  return 'F';
}

/** Boards truncate GPA rather than rounding — 4.999 publishes as 4.99. */
export function truncate2(n) {
  return Math.floor(n * 100) / 100;
}

/** Class-position ranking. Failed students rank below all passing students. */
export function rankResults(results) {
  const sorted = results.slice().sort((a, b) => {
    if (a.result.passed !== b.result.passed) return a.result.passed ? -1 : 1;
    if (b.result.gpa !== a.result.gpa) return b.result.gpa - a.result.gpa;
    return b.result.totalMarks - a.result.totalMarks;
  });
  let lastKey = null;
  let lastRank = 0;
  return sorted.map((entry, i) => {
    const key = `${entry.result.passed}|${entry.result.gpa}|${entry.result.totalMarks}`;
    const rank = key === lastKey ? lastRank : i + 1;
    lastKey = key;
    lastRank = rank;
    return { ...entry, rank };
  });
}

// ---------------------------------------------------------------------------
// §8 — Student identity
// ---------------------------------------------------------------------------

/**
 * Build a permanent student ID: YYMMSSSS.
 * The serial is scoped to the admission month, giving 9,999 per month.
 * IDs are never reused, including after graduation or withdrawal (§8).
 */
export function makeStudentId(date, serial) {
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const ssss = String(serial).padStart(4, '0');
  if (serial > STUDENT_ID.monthlyCapacity) {
    throw new RangeError(`Monthly admission capacity (${STUDENT_ID.monthlyCapacity}) exceeded`);
  }
  return `${yy}${mm}${ssss}`;
}

/** Decompose an ID back into its parts — used for audit trails and search. */
export function parseStudentId(id) {
  if (!/^\d{8}$/.test(id)) return null;
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const serial = Number(id.slice(4));
  if (mm < 1 || mm > 12) return null;
  return { year: 2000 + yy, month: mm, serial, admittedLabel: `${MONTHS[mm - 1]} ${2000 + yy}` };
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const MONTHS_BN = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
];

// ---------------------------------------------------------------------------
// §6 — Attendance
// ---------------------------------------------------------------------------

/**
 * Summarise an attendance record set.
 * Late counts as present for the percentage — the board cares about presence,
 * and the requirement (§6) ties eligibility to attendance, not punctuality.
 */
export function summariseAttendance(records) {
  const total = records.length;
  const present = records.filter((r) => r.status === 'P' || r.status === 'L').length;
  const absent = records.filter((r) => r.status === 'A').length;
  const late = records.filter((r) => r.status === 'L').length;
  const excused = records.filter((r) => r.status === 'E').length;
  const percent = total ? (present / total) * 100 : 0;
  return {
    total, present, absent, late, excused,
    percent: truncate2(percent),
    eligible: percent >= ATTENDANCE.ELIGIBILITY_THRESHOLD,
    shortfall: percent >= ATTENDANCE.ELIGIBILITY_THRESHOLD
      ? 0
      : Math.ceil((ATTENDANCE.ELIGIBILITY_THRESHOLD / 100) * total - present),
  };
}

/**
 * §6 — HSC board eligibility. College students below the threshold cannot be
 * forwarded for the board exam, so this is surfaced as a hard flag, not a stat.
 */
export function eligibilityStatus(percent) {
  if (percent >= 85) return { id: 'good', label: 'Eligible', tone: 'ok' };
  if (percent >= ATTENDANCE.ELIGIBILITY_THRESHOLD) return { id: 'ok', label: 'Eligible', tone: 'ok' };
  if (percent >= 60) return { id: 'at-risk', label: 'At Risk', tone: 'warn' };
  return { id: 'ineligible', label: 'Not Eligible', tone: 'bad' };
}

// ---------------------------------------------------------------------------
// §11 — Fees
// ---------------------------------------------------------------------------

/** Monthly tuition for a grade, from the level-indexed table. */
export function tuitionFor(gradeId) {
  const grade = GRADE_BY_ID[gradeId];
  return TUITION_BY_LEVEL[grade?.level ?? 0] || 0;
}

/** Waiver categories the office grants — applied as a percentage of tuition. */
export const WAIVERS = [
  { id: 'NONE', name: 'None', percent: 0 },
  { id: 'MERIT', name: 'Merit Scholarship', percent: 100 },
  { id: 'MERIT50', name: 'Merit (Half-Free)', percent: 50 },
  { id: 'SIBLING', name: 'Sibling Discount', percent: 25 },
  { id: 'FREEDOM', name: 'Freedom Fighter Quota', percent: 100 },
  { id: 'HARDSHIP', name: 'Hardship Waiver', percent: 50 },
];

export function applyWaiver(amount, waiverId) {
  const w = WAIVERS.find((x) => x.id === waiverId) || WAIVERS[0];
  return { discount: Math.round((amount * w.percent) / 100), payable: Math.round(amount * (1 - w.percent / 100)), waiver: w };
}

/** Late fine: 20 BDT per month overdue, capped at 200 (office policy). */
export function lateFine(monthsOverdue) {
  return Math.min(200, Math.max(0, monthsOverdue) * 20);
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by every screen
// ---------------------------------------------------------------------------

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

/** Render a number in Bangla numerals — required for §13 documents. */
export function toBn(value) {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/** BDT formatting with the ৳ sign and lakh-style grouping. */
export function taka(amount, { decimals = 0 } = {}) {
  const n = Number(amount) || 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  // Indian/Bangladeshi grouping: last 3 digits, then pairs.
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${n < 0 ? '−' : ''}৳${grouped}${decPart ? '.' + decPart : ''}`;
}

export function fmtDate(date, style = 'medium') {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const day = d.getDate();
  const mon = MONTHS[d.getMonth()];
  const year = d.getFullYear();
  if (style === 'short') return `${String(day).padStart(2, '0')} ${mon.slice(0, 3)} ${year}`;
  if (style === 'iso') return toIsoDate(d);
  if (style === 'bn') return `${toBn(day)} ${MONTHS_BN[d.getMonth()]} ${toBn(year)}`;
  return `${day} ${mon} ${year}`;
}

export function ageFrom(dobIso, asOf) {
  const dob = new Date(dobIso);
  const now = asOf instanceof Date ? asOf : new Date(asOf);
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

/** Working day check — the institution runs Sunday–Thursday (§ routine). */
export function isWorkingDay(date) {
  const dow = date.getDay(); // 0 Sun … 6 Sat
  return dow >= 0 && dow <= 4;
}

/** All working days in a month, used by the attendance register. */
export function workingDaysIn(year, month) {
  const days = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    if (isWorkingDay(d)) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}
