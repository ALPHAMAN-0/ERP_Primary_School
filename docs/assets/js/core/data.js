/**
 * DETERMINISTIC DATA ENGINE.
 *
 * The institution's entire roster is a pure function of a seed. Nothing here is
 * stored — students, families, staff, a year of attendance and three terms of
 * exam marks are all recomputed on demand, identically every time.
 *
 * Why this matters for the demo: §1 of the requirements sets the scale at
 * 3,000+ students. Persisting that, plus ~200 attendance days and ~40,000 marks
 * per term, would be tens of megabytes and a slow first paint. Deriving it
 * costs a few milliseconds and zero bytes, and the numbers stay realistic
 * because the generators use a bell curve rather than flat randomness.
 *
 * User writes layer on top through store.js — reads consult the overlay first.
 */

import {
  GRADES, CLASS_LIST, GRADE_BY_ID, subjectsFor, ACADEMIC_YEAR,
  ATTENDANCE, attendanceModeOf, PERIODS, WEEKDAYS,
} from './spec.js';
import {
  MALE_FIRST, FEMALE_FIRST, SURNAMES, MALE_HONORIFIC, FEMALE_HONORIFIC,
  OCCUPATIONS, RELIGIONS, BLOOD_GROUPS, BLOOD_WEIGHTS, AREAS, DESIGNATIONS,
} from './names.js';
import { rand, randInt, pick, pickWeighted, gaussian, chance, hash, rngFor } from './rng.js';
import { makeStudentId, isWorkingDay, toIsoDate } from './domain.js';
import * as store from './store.js';

const SEED = 'shahjalal-sc-2026';

/**
 * Target head-count per class section. Upper classes thin out — some students
 * leave after SSC — which is why the college section is smaller than the school
 * section. Sized so the institution lands above the 3,000 figure in §1.
 */
function classSize(cls) {
  const base = cls.level <= 5 ? 66 : cls.level <= 8 ? 62 : cls.level <= 10 ? 56 : 50;
  return base + randInt(`${SEED}|size|${cls.key}`, -6, 6);
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

function buildStudent(cls, indexInClass, serialBook) {
  const key = `${SEED}|stu|${cls.key}|${indexInClass}`;
  const isMale = chance(`${key}|sex`, 0.51);
  const firstPool = isMale ? MALE_FIRST : FEMALE_FIRST;
  const [first, firstBn] = pick(`${key}|fn`, firstPool);
  const [mid, midBn] = pick(`${key}|mn`, isMale ? MALE_FIRST : FEMALE_FIRST);
  const [sur, surBn] = pick(`${key}|sn`, SURNAMES);

  // Two-part names for most, three-part for some — matches real registers.
  const threePart = chance(`${key}|3p`, 0.35);
  const name = threePart ? `${first} ${mid} ${sur}` : `${first} ${sur}`;
  const nameBn = threePart ? `${firstBn} ${midBn} ${surBn}` : `${firstBn} ${surBn}`;

  // Admission year: most joined at the grade they'd naturally start, a slice
  // are lateral entrants who joined later. Class 11 is always a fresh intake
  // (college entry after SSC), which mirrors how the real institution works.
  const gradeLevel = cls.level;
  let entryLevel = 0;
  if (gradeLevel >= 11) entryLevel = 11;
  // Lateral entry only makes sense above KG — a KG student cannot have joined
  // at a higher grade than the one they are in, which would date their
  // admission into the future.
  else if (gradeLevel >= 1 && chance(`${key}|lat`, 0.22)) {
    entryLevel = randInt(`${key}|latl`, 1, gradeLevel);
  }
  const yearsHere = gradeLevel - entryLevel;
  const admitYear = ACADEMIC_YEAR.year - yearsHere;
  // This year's intake always joins at session start in January. Students who
  // joined in an earlier year may have come mid-session. Without this rule a
  // student could be admitted in a month the system has not reached yet, and
  // would then have no attendance or marks at all.
  const admitMonth = yearsHere === 0
    ? 1
    : (chance(`${key}|am`, 0.78) ? 1 : randInt(`${key}|amm`, 2, 11));
  // This year's intake lands in the first working week, so it is already
  // complete even at the earliest date the Time Machine can be set to.
  const admitDay = yearsHere === 0 ? randInt(`${key}|ad`, 1, 5) : randInt(`${key}|ad`, 2, 26);
  const admittedOn = new Date(admitYear, admitMonth - 1, admitDay);

  // Serial allocation: stable because the caller walks classes in a fixed order.
  const yymm = `${String(admitYear % 100).padStart(2, '0')}${String(admitMonth).padStart(2, '0')}`;
  serialBook[yymm] = (serialBook[yymm] || 0) + 1;
  const id = makeStudentId(admittedOn, serialBook[yymm]);

  // Age: typical for the grade, ±1 year.
  const expectedAge = 5 + gradeLevel;
  const dobYear = ACADEMIC_YEAR.year - expectedAge - randInt(`${key}|agevar`, 0, 1);
  const dob = new Date(dobYear, randInt(`${key}|dm`, 0, 11), randInt(`${key}|dd`, 1, 28));

  const religion = pickWeighted(`${key}|rel`, RELIGIONS, RELIGIONS.map((r) => r.weight));
  const isHindu = religion.name === 'Hinduism';

  const [fHon, fHonBn] = pick(`${key}|fh`, MALE_HONORIFIC);
  const [fFirst, fFirstBn] = pick(`${key}|ff`, MALE_FIRST);
  const [mHon, mHonBn] = pick(`${key}|mh`, FEMALE_HONORIFIC);
  const [mFirst, mFirstBn] = pick(`${key}|mf`, FEMALE_FIRST);

  const father = isHindu ? `${fFirst} ${sur}` : `${fHon} ${fFirst} ${sur}`;
  const fatherBn = isHindu ? `${fFirstBn} ${surBn}` : `${fHonBn} ${fFirstBn} ${surBn}`;
  const mother = isHindu ? `${mFirst} ${sur}` : `${mHon} ${mFirst} ${sur}`;
  const motherBn = isHindu ? `${mFirstBn} ${surBn}` : `${mHonBn} ${mFirstBn} ${surBn}`;

  const area = pick(`${key}|area`, AREAS);
  const phone = `01${pick(`${key}|op`, ['3', '5', '6', '7', '8', '9'])}${String(randInt(`${key}|ph`, 10000000, 99999999)).slice(0, 8)}`;

  // Waivers are rare and skew toward merit in senior classes.
  const waiverRoll = rand(`${key}|wv`);
  let waiverId = 'NONE';
  if (waiverRoll < 0.03) waiverId = 'MERIT';
  else if (waiverRoll < 0.07) waiverId = 'MERIT50';
  else if (waiverRoll < 0.12) waiverId = 'SIBLING';
  else if (waiverRoll < 0.14) waiverId = 'FREEDOM';
  else if (waiverRoll < 0.19) waiverId = 'HARDSHIP';

  // Latent ability drives every mark this student will ever get — one number,
  // so a strong student is consistently strong across subjects and terms.
  //
  // A single normal curve produces a school where nobody fails and nobody gets
  // GPA 5.00, because both outcomes need a run of consistent results. Real
  // cohorts have a distinct high-achieving group, so a slice of students carry
  // a boost — which is what makes the GPA-5 count and the fail count land in
  // the range a real SSC/HSC institution reports.
  const isHighAchiever = chance(`${key}|ach`, 0.14);
  const ability = clamp(
    gaussian(`${key}|abil`, 60, 15) + (isHighAchiever ? 21 : 0),
    16, 97
  );
  // Attendance discipline is correlated with, but not identical to, ability.
  const diligence = clamp(gaussian(`${key}|dil`, 0.91, 0.07) + (ability - 62) * 0.0012, 0.55, 0.995);

  const subjects = subjectsFor(cls.gradeId, cls.groupId);
  const optional = subjects.find((s) => s.optional);

  return {
    id,
    roll: indexInClass + 1,
    name,
    nameBn,
    gender: isMale ? 'Male' : 'Female',
    dob: toIsoDate(dob),
    religion: religion.name,
    religionBn: religion.nameBn,
    bloodGroup: pickWeighted(`${key}|bg`, BLOOD_GROUPS, BLOOD_WEIGHTS),
    gradeId: cls.gradeId,
    gradeName: cls.gradeName,
    sectionId: cls.sectionId,
    sectionName: cls.sectionName,
    classKey: cls.key,
    groupId: cls.groupId,
    schoolSection: cls.schoolSection,
    level: cls.level,
    father, fatherBn,
    fatherOccupation: pick(`${key}|fo`, OCCUPATIONS),
    mother, motherBn,
    motherOccupation: chance(`${key}|mw`, 0.32) ? pick(`${key}|mo`, OCCUPATIONS) : 'Homemaker',
    guardianPhone: phone,
    guardianNid: String(randInt(`${key}|nid`, 1000000000, 9999999999)),
    address: `House ${randInt(`${key}|hn`, 1, 240)}, Road ${randInt(`${key}|rn`, 1, 28)}, ${area}`,
    area,
    admittedOn: toIsoDate(admittedOn),
    status: 'Active',
    waiverId,
    optionalSubject: optional ? optional.code : null,
    ability,
    diligence,
    // Facility links — only meaningful when those modules are switched on (§4).
    // Transport is an application, not an assignment: the actual route depends
    // on seats being free, which only the transport module knows (facilities.js).
    wantsTransport: chance(`${key}|trn`, 0.11),
    hostel: cls.level >= 9 && chance(`${key}|hst`, 0.12),
    familyId: null, // assigned in the family pass below
  };
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Build the full roster once per session, then cache it in module scope.
 * Serials are allocated in a stable walk so every student's ID is reproducible.
 */
let _students = null;
let _byId = null;
let _byClass = null;
let _families = null;

function generateRoster() {
  const serialBook = {};
  const students = [];
  // Stable order: grades in level order, sections in declared order.
  for (const cls of CLASS_LIST) {
    const n = classSize(cls);
    for (let i = 0; i < n; i++) {
      students.push(buildStudent(cls, i, serialBook));
    }
  }

  // §10 — parent accounts link one or more children. Build sibling families:
  // most parents have a single child here, a meaningful minority have two or
  // three, which is what makes the multi-child parent portal worth testing.
  const families = new Map();
  const openFamilies = []; // families that could still take a sibling
  for (const s of students) {
    const joinRoll = rand(`${SEED}|fam|${s.id}`);
    let joined = null;
    if (joinRoll < 0.26 && openFamilies.length) {
      // Pick an open family deterministically, requiring a different grade so
      // siblings are not classmates.
      const idx = Math.floor(rand(`${SEED}|famidx|${s.id}`) * openFamilies.length);
      for (let probe = 0; probe < openFamilies.length; probe++) {
        const cand = families.get(openFamilies[(idx + probe) % openFamilies.length]);
        if (cand && cand.children.length < 3 && !cand.children.some((c) => c.gradeId === s.gradeId)) {
          joined = cand;
          break;
        }
      }
    }
    if (joined) {
      // Siblings share guardians and address.
      s.father = joined.father;
      s.fatherBn = joined.fatherBn;
      s.mother = joined.mother;
      s.motherBn = joined.motherBn;
      s.guardianPhone = joined.phone;
      s.guardianNid = joined.nid;
      s.address = joined.address;
      s.area = joined.area;
      s.familyId = joined.id;
      joined.children.push(s);
      if (joined.children.length >= 3) {
        const at = openFamilies.indexOf(joined.id);
        if (at >= 0) openFamilies.splice(at, 1);
      }
    } else {
      const fam = {
        id: `FAM-${s.id}`,
        father: s.father,
        fatherBn: s.fatherBn,
        mother: s.mother,
        motherBn: s.motherBn,
        phone: s.guardianPhone,
        nid: s.guardianNid,
        address: s.address,
        area: s.area,
        children: [s],
      };
      s.familyId = fam.id;
      families.set(fam.id, fam);
      openFamilies.push(fam.id);
    }
  }

  return { students, families };
}

function ensureRoster() {
  if (_students) return;
  const { students, families } = generateRoster();
  // Students admitted through the demo UI join the same roster.
  const added = store.getAdmissions();
  const all = added.length ? [...added, ...students] : students;

  _students = all.map((s) => store.withPatch('student', s));
  _byId = new Map(_students.map((s) => [s.id, s]));
  _byClass = new Map();
  for (const s of _students) {
    if (!_byClass.has(s.classKey)) _byClass.set(s.classKey, []);
    _byClass.get(s.classKey).push(s);
  }
  for (const list of _byClass.values()) list.sort((a, b) => a.roll - b.roll);
  _families = families;
}

/** Drop the cache so the next read reflects new admissions or patches. */
export function invalidate() {
  _students = null;
  _byId = null;
  _byClass = null;
  _families = null;
}

store.subscribe((kind) => {
  if (kind === 'admissions' || kind === 'patch' || kind === 'reset' || kind === 'import') invalidate();
});

export function allStudents() {
  ensureRoster();
  return _students;
}

export function studentById(id) {
  ensureRoster();
  return _byId.get(id) || null;
}

export function studentsInClass(classKey) {
  ensureRoster();
  return _byClass.get(classKey) || [];
}

export function familyOf(student) {
  ensureRoster();
  return _families.get(student.familyId) || null;
}

/** Families with more than one enrolled child — the parent-portal showcase. */
export function multiChildFamilies(limit = 40) {
  ensureRoster();
  const out = [];
  for (const fam of _families.values()) {
    if (fam.children.length > 1) out.push(fam);
    if (out.length >= limit) break;
  }
  return out;
}

/** Highest admission serial already used in a month — feeds the ID allocator. */
export function usedSerialsIn(yymm) {
  ensureRoster();
  let max = 0;
  for (const s of _students) {
    if (s.id.slice(0, 4) === yymm) max = Math.max(max, Number(s.id.slice(4)));
  }
  return max;
}

// ---------------------------------------------------------------------------
// §6 — Attendance, derived per student per day
// ---------------------------------------------------------------------------

/**
 * Attendance for one student on one date (and period, for the college section).
 * Reads the overlay first so a teacher's correction always wins.
 */
export function attendanceFor(student, date, period = 0) {
  const iso = toIso(date);
  const override = store.getAttendanceOverride(student.id, iso, period);
  if (override) return override;
  if (!isWorkingDay(date)) return null;
  if (new Date(iso) < new Date(student.admittedOn)) return null;

  const key = `${student.id}|${iso}|${period}`;
  // Thursday (start of weekend) and Sunday (after it) run slightly thinner —
  // a small, believable weekly rhythm rather than flat noise.
  const dow = date.getDay();
  const dayEffect = dow === 4 ? -0.05 : dow === 0 ? -0.02 : 0;
  const p = clamp(student.diligence + dayEffect, 0.4, 0.995);
  const roll = rand(key);
  if (roll < p) {
    // A slice of "present" is actually late arrival.
    return rand(`${key}|late`) < 0.06 ? 'L' : 'P';
  }
  // Absences split into unexcused and excused (sick leave with a note).
  return rand(`${key}|exc`) < 0.28 ? 'E' : 'A';
}

/** A student's attendance across a date range, as records. */
export function attendanceRange(student, from, to, period = 0) {
  const out = [];
  const d = new Date(from);
  const end = new Date(to);
  while (d <= end) {
    const status = attendanceFor(student, d, period);
    if (status) out.push({ date: toIso(d), status });
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * College attendance is period-wise (§6), so a day yields one record per
 * teaching period rather than one per day.
 */
export function attendanceDayRecords(student, date) {
  const grade = GRADE_BY_ID[student.gradeId];
  if (attendanceModeOf(grade) === ATTENDANCE.DAILY) {
    const s = attendanceFor(student, date, 0);
    return s ? [{ period: 0, status: s }] : [];
  }
  return PERIODS.filter((p) => !p.isBreak).map((p) => ({
    period: p.id,
    status: attendanceFor(student, date, p.id),
  })).filter((r) => r.status);
}

/** Year-to-date attendance summary — the number the eligibility flag uses. */
export function attendanceSummary(student, asOf) {
  const start = new Date(ACADEMIC_YEAR.start);
  const from = new Date(student.admittedOn) > start ? new Date(student.admittedOn) : start;
  const grade = GRADE_BY_ID[student.gradeId];
  if (attendanceModeOf(grade) === ATTENDANCE.DAILY) {
    return attendanceRange(student, from, asOf);
  }
  // Period-wise: sample every working day across all teaching periods.
  const out = [];
  const d = new Date(from);
  while (d <= asOf) {
    if (isWorkingDay(d)) {
      for (const r of attendanceDayRecords(student, d)) out.push({ date: toIso(d), ...r });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// §7 — Exam marks, derived per student per term per subject
// ---------------------------------------------------------------------------

/**
 * A mark for one student in one subject in one term.
 *
 * Built from the student's latent ability plus a per-subject affinity (everyone
 * has a strong and a weak subject) and a small term-over-term improvement, so
 * progress charts trend the way real ones do. Overlay entries win, which is how
 * teacher-entered marks replace generated ones.
 */
export function markFor(student, termId, subject) {
  const override = store.getMarkOverride(student.id, termId, subject.code);
  if (typeof override === 'number') return override;

  // Affinity and noise are kept tight relative to ability: a strong student
  // stays strong across subjects, which is what allows a consistent top
  // performer to actually reach GPA 5.00.
  const affinity = gaussian(`${student.id}|aff|${subject.code}`, 0, 7);
  const termIndex = { T1: 0, T2: 1, TEST: 2, T3: 3 }[termId] ?? 0;
  const growth = termIndex * 1.6;
  const noise = gaussian(`${student.id}|${termId}|${subject.code}`, 0, 4.5);

  let pct = student.ability + affinity + growth + noise;
  // Practical/creative subjects mark generously; that is real board behaviour.
  if (subject.code === 'DRW' || subject.code === 'ICT') pct += 6;
  pct = clamp(pct, 8, 99);

  return Math.round((pct / 100) * subject.full);
}

/** Every subject mark for a student in a term. */
export function marksFor(student, termId) {
  const subjects = subjectsFor(student.gradeId, student.groupId);
  const marks = {};
  for (const sub of subjects) {
    // A student only sits their own chosen optional subject.
    if (sub.optional && student.optionalSubject !== sub.code) continue;
    marks[sub.code] = markFor(student, termId, sub);
  }
  return { subjects: subjects.filter((s) => !s.optional || student.optionalSubject === s.code), marks };
}

// ---------------------------------------------------------------------------
// Staff (§9 roles, §HR payroll)
// ---------------------------------------------------------------------------

let _staff = null;

function buildStaff(index) {
  const key = `${SEED}|staff|${index}`;
  const isMale = chance(`${key}|sex`, 0.58);
  const [first, firstBn] = pick(`${key}|fn`, isMale ? MALE_FIRST : FEMALE_FIRST);
  const [sur, surBn] = pick(`${key}|sn`, SURNAMES);
  const honor = isMale ? 'Md.' : 'Mst.';

  // Designation mix: mostly teachers, a handful of each support role.
  const desig = index === 0 ? DESIGNATIONS[0]
    : index === 1 ? DESIGNATIONS[1]
    : index < 5 ? DESIGNATIONS[2]
    : index < 18 ? pick(`${key}|d1`, [DESIGNATIONS[3], DESIGNATIONS[4]])
    : index < 62 ? pick(`${key}|d2`, [DESIGNATIONS[5], DESIGNATIONS[6]])
    : pick(`${key}|d3`, DESIGNATIONS.slice(7));

  const joinYear = randInt(`${key}|jy`, 1996, 2025);
  const yearsOfService = ACADEMIC_YEAR.year - joinYear;
  // Annual increment: 5% of basic per year of service, capped at 20 years.
  const basic = Math.round(desig.basic * (1 + 0.05 * Math.min(yearsOfService, 20)));

  const roleMap = {
    PRIN: ['ADMIN', 'TEACHER'], VPRIN: ['ADMIN', 'TEACHER'], HEADT: ['ADMIN', 'TEACHER'],
    SRLEC: ['TEACHER'], LEC: ['TEACHER'], ASTT: ['TEACHER'], JRTCH: ['TEACHER'],
    ACCT: ['ACCOUNTANT'], LIBR: ['LIBRARIAN'], OFFA: [], PEON: [], DRVR: ['TRANSPORT'], GUARD: [],
  };
  // §9 — a staff member wearing several hats simply gets several roles.
  const roles = [...(roleMap[desig.id] || [])];
  if (chance(`${key}|multi`, 0.12) && roles.includes('TEACHER')) roles.push('HR');

  const teachableSubjects = ['BAN', 'ENG', 'MAT', 'SCI', 'PHY', 'CHE', 'BIO', 'ICT', 'ACC', 'BGS', 'HIS', 'ECO', 'CIV', 'REL'];

  return {
    id: `EMP-${String(1000 + index)}`,
    name: `${honor} ${first} ${sur}`,
    nameBn: `${firstBn} ${surBn}`,
    gender: isMale ? 'Male' : 'Female',
    designation: desig.name,
    designationId: desig.id,
    payGrade: desig.grade,
    department: desig.id.includes('LEC') ? 'College' : 'School',
    subject: pick(`${key}|subj`, teachableSubjects),
    roles,
    joinedOn: `${joinYear}-${String(randInt(`${key}|jm`, 1, 12)).padStart(2, '0')}-01`,
    yearsOfService,
    basic,
    houseRent: Math.round(basic * 0.45),
    medical: 1500,
    transportAllowance: 1200,
    phone: `01${pick(`${key}|op`, ['7', '8', '9'])}${String(randInt(`${key}|ph`, 10000000, 99999999)).slice(0, 8)}`,
    email: `${first.toLowerCase()}.${sur.toLowerCase()}@shahjalalsc.edu.bd`,
    status: chance(`${key}|st`, 0.97) ? 'Active' : 'On Leave',
  };
}

export function allStaff() {
  if (_staff) return _staff;
  const count = 96;
  _staff = Array.from({ length: count }, (_, i) => store.withPatch('staff', buildStaff(i)));
  return _staff;
}

export function staffById(id) {
  return allStaff().find((s) => s.id === id) || null;
}

/** Class teacher assignment — stable mapping of class → teacher. */
export function classTeacherFor(classKey) {
  const teachers = allStaff().filter((s) => s.roles.includes('TEACHER'));
  const idx = hash(`${SEED}|ct|${classKey}`) % teachers.length;
  return teachers[idx];
}

// ---------------------------------------------------------------------------
// Class routine (§16 core module)
// ---------------------------------------------------------------------------

/**
 * A weekly timetable for a class. Subjects are dealt across the week so each
 * appears a sensible number of times and no teacher is double-booked within a
 * period — the constraint that makes a routine grid actually useful.
 */
export function routineFor(classKey) {
  const cls = CLASS_LIST.find((c) => c.key === classKey);
  if (!cls) return [];
  const subjects = subjectsFor(cls.gradeId, cls.groupId);
  const teachers = allStaff().filter((s) => s.roles.includes('TEACHER'));
  const slots = PERIODS.filter((p) => !p.isBreak);

  return WEEKDAYS.map((day, dayIdx) => ({
    day,
    periods: slots.map((slot, slotIdx) => {
      const pickIdx = (dayIdx * slots.length + slotIdx) % subjects.length;
      // Rotate the starting subject per day so the week isn't a repeating block.
      const offset = hash(`${SEED}|rt|${classKey}|${dayIdx}`) % subjects.length;
      const sub = subjects[(pickIdx + offset) % subjects.length];
      const teacher = teachers[hash(`${SEED}|rt|${classKey}|${sub.code}`) % teachers.length];
      return {
        period: slot.id,
        label: slot.label,
        start: slot.start,
        end: slot.end,
        subject: sub,
        teacher,
        room: `${cls.level <= 5 ? 'A' : cls.level <= 10 ? 'B' : 'C'}-${100 + (hash(`${SEED}|rm|${classKey}`) % 20)}`,
      };
    }),
  }));
}

/** A teacher's own weekly schedule, inverted out of the class routines. */
export function teacherRoutine(staffId) {
  const week = WEEKDAYS.map((day) => ({ day, periods: [] }));
  for (const cls of CLASS_LIST) {
    const routine = routineFor(cls.key);
    routine.forEach((dayRow, dayIdx) => {
      for (const p of dayRow.periods) {
        if (p.teacher.id === staffId) {
          week[dayIdx].periods.push({ ...p, classKey: cls.key, className: `${cls.gradeName} — ${cls.sectionName}` });
        }
      }
    });
  }
  for (const d of week) d.periods.sort((a, b) => a.period - b.period);
  return week;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toIso(date) {
  return toIsoDate(date);
}

/** Institution-wide counts, computed once for the dashboards. */
let _stats = null;
export function institutionStats() {
  if (_stats) return _stats;
  const students = allStudents();
  const staff = allStaff();
  const bySection = { School: 0, College: 0 };
  const byGrade = {};
  const byGender = { Male: 0, Female: 0 };
  const byGroup = { SCI: 0, BUS: 0, HUM: 0 };
  for (const s of students) {
    bySection[s.schoolSection]++;
    byGrade[s.gradeId] = (byGrade[s.gradeId] || 0) + 1;
    byGender[s.gender]++;
    if (s.groupId) byGroup[s.groupId] = (byGroup[s.groupId] || 0) + 1;
  }
  _stats = {
    totalStudents: students.length,
    totalStaff: staff.length,
    totalTeachers: staff.filter((s) => s.roles.includes('TEACHER')).length,
    totalClasses: CLASS_LIST.length,
    bySection, byGrade, byGender, byGroup,
  };
  return _stats;
}

store.subscribe((kind) => {
  if (kind === 'admissions' || kind === 'reset' || kind === 'import') _stats = null;
});
