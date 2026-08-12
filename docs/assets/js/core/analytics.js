/**
 * Institution-wide aggregates.
 *
 * Derived data is cheap per record but not free at 3,000+ students, so every
 * roll-up here is computed once and cached for the session. Caches are keyed by
 * the effective date, because the Time Machine can move the whole system.
 */

import { CLASS_LIST, GRADES, GRADE_BY_ID, ACADEMIC_YEAR, subjectsFor, EXAM_TERMS } from './spec.js';
import {
  allStudents, studentsInClass, attendanceFor, attendanceSummary, marksFor, allStaff,
} from './data.js';
import {
  computeResult, summariseAttendance, isWorkingDay, tuitionFor, applyWaiver, toIsoDate, MONTHS,
} from './domain.js';
import { todayIso, today } from './clock.js';
import * as store from './store.js';

const cache = new Map();

function memo(key, fn) {
  const full = `${key}|${todayIso()}`;
  if (cache.has(full)) return cache.get(full);
  const value = fn();
  cache.set(full, value);
  return value;
}

store.subscribe(() => cache.clear());

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/** Institution-wide attendance for a single day. Exact, not sampled. */
export function attendanceOn(date) {
  const iso = date instanceof Date ? toIsoDate(date) : String(date);
  return memo(`att-day|${iso}`, () => {
    const counts = { P: 0, A: 0, L: 0, E: 0, none: 0 };
    if (!isWorkingDay(date)) return { ...counts, total: 0, percent: 0, holiday: true };
    for (const s of allStudents()) {
      const st = attendanceFor(s, date, 0);
      if (!st) counts.none++;
      else counts[st]++;
    }
    const total = counts.P + counts.A + counts.L + counts.E;
    const present = counts.P + counts.L;
    return { ...counts, total, present, percent: total ? (present / total) * 100 : 0, holiday: false };
  });
}

/**
 * Month-by-month attendance rate for the academic year to date.
 * Computed from a fixed stride across the roster — every 4th student — which
 * keeps a full-year roll-up under a frame budget while staying stable (the same
 * students are always sampled, so the series never jitters between paints).
 */
export function attendanceTrend() {
  return memo('att-trend', () => {
    const t = today();
    const students = allStudents();
    const sample = students.filter((_, i) => i % 4 === 0);
    const months = [];
    for (let m = 0; m <= Math.min(11, t.getMonth()); m++) {
      let present = 0;
      let total = 0;
      let schoolP = 0; let schoolT = 0; let collegeP = 0; let collegeT = 0;
      const d = new Date(ACADEMIC_YEAR.year, m, 1);
      while (d.getMonth() === m && d <= t) {
        if (isWorkingDay(d)) {
          for (const s of sample) {
            const st = attendanceFor(s, d, 0);
            if (!st) continue;
            total++;
            const p = st === 'P' || st === 'L' ? 1 : 0;
            present += p;
            if (s.schoolSection === 'School') { schoolT++; schoolP += p; }
            else { collegeT++; collegeP += p; }
          }
        }
        d.setDate(d.getDate() + 1);
      }
      months.push({
        month: m,
        label: MONTHS[m].slice(0, 3),
        percent: total ? (present / total) * 100 : 0,
        school: schoolT ? (schoolP / schoolT) * 100 : 0,
        college: collegeT ? (collegeP / collegeT) * 100 : 0,
        sampled: sample.length,
      });
    }
    return months;
  });
}

/** Students whose year-to-date attendance puts board eligibility at risk (§6). */
export function eligibilityRisk(limit = 200) {
  return memo(`elig|${limit}`, () => {
    const t = today();
    const out = [];
    for (const s of allStudents()) {
      // The rule bites hardest in the college section, where the HSC board
      // checks attendance — but school students are surfaced too.
      const summary = summariseAttendance(attendanceSummary(s, t));
      if (summary.percent < 70 && summary.total > 10) {
        out.push({ student: s, summary });
      }
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => a.summary.percent - b.summary.percent);
  });
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Full result set for one class in one term, ranked. */
export function classResults(classKey, termId) {
  return memo(`cls-res|${classKey}|${termId}`, () => {
    const students = studentsInClass(classKey);
    return students.map((student) => {
      const { subjects, marks } = marksFor(student, termId);
      return { student, result: computeResult(subjects, marks) };
    });
  });
}

/** Grade-band distribution for a class, or the whole institution. */
export function gradeDistribution(termId, classKey = null) {
  return memo(`gd|${termId}|${classKey || 'all'}`, () => {
    const bands = { 'A+': 0, A: 0, 'A-': 0, B: 0, C: 0, D: 0, F: 0 };
    const classes = classKey ? [{ key: classKey }] : CLASS_LIST;
    let total = 0;
    let passed = 0;
    let gpaSum = 0;
    for (const cls of classes) {
      for (const { result } of classResults(cls.key, termId)) {
        bands[result.letter] = (bands[result.letter] || 0) + 1;
        total++;
        if (result.passed) { passed++; gpaSum += result.gpa; }
      }
    }
    return {
      bands, total, passed,
      passRate: total ? (passed / total) * 100 : 0,
      avgGpa: passed ? gpaSum / passed : 0,
      gpa5: bands['A+'],
    };
  });
}

/** Top performers across the institution for a term. */
export function topPerformers(termId, limit = 10) {
  return memo(`top|${termId}|${limit}`, () => {
    const all = [];
    for (const cls of CLASS_LIST) {
      for (const entry of classResults(cls.key, termId)) {
        if (entry.result.passed) all.push(entry);
      }
    }
    return all
      .sort((a, b) => b.result.gpa - a.result.gpa || b.result.totalMarks - a.result.totalMarks)
      .slice(0, limit);
  });
}

// ---------------------------------------------------------------------------
// Fees (§11)
// ---------------------------------------------------------------------------

/**
 * The fee ledger for one student for the year to date: what was billed, what
 * the office has logged as paid, and what is outstanding.
 *
 * Billing is monthly tuition from admission (or session start) to the current
 * month, plus exam fees for terms already sat, plus the annual development fee.
 */
export function studentLedger(student) {
  const t = today();
  const monthsBilled = Math.max(1, t.getMonth() + 1);
  const tuition = tuitionFor(student.gradeId);
  const { payable: tuitionPayable, discount, waiver } = applyWaiver(tuition * monthsBilled, student.waiverId);

  const termsSat = EXAM_TERMS.filter((e) => !e.boardPrepOnly && e.month <= t.getMonth() + 1).length;
  const examFee = termsSat * 600;
  const devFee = 1500;

  const billed = tuitionPayable + examFee + devFee;
  const paid = store.getPayments(student.id).reduce((s, p) => s + p.amount, 0);

  // Baseline collection: most families are up to date, some are behind. This is
  // derived so the dues report is populated before anyone logs a payment.
  const baselinePaidMonths = baselinePaidMonthsFor(student, monthsBilled);
  const baselinePaid = Math.round(
    (tuitionPayable / monthsBilled) * baselinePaidMonths + (baselinePaidMonths >= 4 ? examFee : 0) + (baselinePaidMonths >= 2 ? devFee : 0)
  );

  const totalPaid = Math.min(billed, baselinePaid + paid);
  const due = Math.max(0, billed - totalPaid);
  const monthsOverdue = Math.max(0, monthsBilled - baselinePaidMonths - Math.floor(paid / (tuition || 1)));

  return {
    student,
    monthsBilled,
    tuitionPerMonth: tuition,
    waiver,
    discount,
    lines: [
      { name: `Monthly Tuition × ${monthsBilled}`, amount: tuition * monthsBilled },
      { name: `Waiver — ${waiver.name}`, amount: -discount, isDiscount: true },
      { name: `Exam Fee × ${termsSat}`, amount: examFee },
      { name: 'Development Fee', amount: devFee },
    ].filter((l) => l.amount !== 0),
    billed,
    paid: totalPaid,
    due,
    monthsOverdue,
    status: due === 0 ? 'Paid' : due < tuition * 2 ? 'Partial' : 'Overdue',
  };
}

/** Deterministic baseline of how many months a family has already settled. */
function baselinePaidMonthsFor(student, monthsBilled) {
  // Reuse the student's diligence as a proxy for household regularity, then
  // add a small independent roll so the two are correlated but not identical.
  const seedRoll = Number(`0.${String(hashCode(student.id)).slice(0, 6)}`);
  const punctuality = student.diligence * 0.7 + seedRoll * 0.3;
  if (punctuality > 0.86) return monthsBilled;
  if (punctuality > 0.78) return Math.max(0, monthsBilled - 1);
  if (punctuality > 0.7) return Math.max(0, monthsBilled - 2);
  if (punctuality > 0.62) return Math.max(0, monthsBilled - 3);
  return Math.max(0, monthsBilled - Math.min(monthsBilled, 5));
}

function hashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Institution-wide fee position — the Accountant dashboard headline. */
export function feeSummary() {
  return memo('fee-summary', () => {
    let billed = 0;
    let collected = 0;
    let due = 0;
    let overdueStudents = 0;
    const byGrade = {};
    for (const s of allStudents()) {
      const l = studentLedger(s);
      billed += l.billed;
      collected += l.paid;
      due += l.due;
      if (l.status === 'Overdue') overdueStudents++;
      byGrade[s.gradeId] = byGrade[s.gradeId] || { billed: 0, collected: 0, due: 0 };
      byGrade[s.gradeId].billed += l.billed;
      byGrade[s.gradeId].collected += l.paid;
      byGrade[s.gradeId].due += l.due;
    }
    return {
      billed, collected, due, overdueStudents,
      collectionRate: billed ? (collected / billed) * 100 : 0,
      byGrade,
    };
  });
}

/** Students with the largest outstanding balance. */
export function topDefaulters(limit = 25) {
  return memo(`defaulters|${limit}`, () => {
    const rows = allStudents().map(studentLedger).filter((l) => l.due > 0);
    return rows.sort((a, b) => b.due - a.due).slice(0, limit);
  });
}

/** Monthly collection series for the year to date. */
export function collectionTrend() {
  return memo('collection-trend', () => {
    const t = today();
    const summary = feeSummary();
    // Distribute the year-to-date collection across elapsed months with a
    // realistic shape: intake month is heaviest, exam months lift slightly.
    const shape = [1.6, 1.0, 0.95, 1.15, 0.9, 0.85, 1.2, 1.0, 0.95, 1.1, 1.05, 0.7];
    const months = Math.min(12, t.getMonth() + 1);
    const weights = shape.slice(0, months);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return weights.map((w, m) => ({
      month: m,
      label: MONTHS[m].slice(0, 3),
      amount: Math.round((summary.collected * w) / totalWeight),
    }));
  });
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

export function enrolmentByGrade() {
  return memo('enrol-grade', () => {
    const counts = {};
    for (const s of allStudents()) counts[s.gradeId] = (counts[s.gradeId] || 0) + 1;
    return GRADES.map((g) => ({ label: g.name.replace('Class ', ''), full: g.name, value: counts[g.id] || 0, gradeId: g.id, section: g.section }));
  });
}

export function staffSummary() {
  return memo('staff-summary', () => {
    const staff = allStaff();
    const payroll = staff.reduce((s, e) => s + e.basic + e.houseRent + e.medical + e.transportAllowance, 0);
    return {
      total: staff.length,
      teaching: staff.filter((s) => s.roles.includes('TEACHER')).length,
      onLeave: staff.filter((s) => s.status === 'On Leave').length,
      monthlyPayroll: payroll,
      avgService: staff.reduce((s, e) => s + e.yearsOfService, 0) / staff.length,
    };
  });
}
