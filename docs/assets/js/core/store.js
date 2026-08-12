/**
 * OVERLAY STORE.
 *
 * The browser twin never persists the 3,000-student baseline — that is
 * recomputed from seeds (see data.js). What it *does* persist is every write
 * the user makes: a corrected attendance mark, an entered exam score, a logged
 * fee payment, a new admission.
 *
 * Those writes live in a thin overlay keyed by the same identity the generator
 * uses, and reads check the overlay before falling back to the generated
 * baseline. Result: the demo is a few kilobytes of localStorage instead of tens
 * of megabytes, and "Reset demo data" is a single key deletion.
 *
 * In production this layer is Entity Framework 6 against SQL Server; the
 * read-through pattern is the only thing unique to the twin.
 */

const KEY = 'erp.overlay.v1';
const SETTINGS_KEY = 'erp.settings.v1';

const listeners = new Set();

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    // Quota exceeded — surfaced to the user rather than failing silently,
    // because a silent write loss in a fee ledger is the worst kind of bug.
    console.error('[store] write failed', err);
    return false;
  }
}

const EMPTY_OVERLAY = {
  attendance: {},   // `${studentId}|${dateIso}|${period}` → status
  marks: {},        // `${studentId}|${termId}|${subjectCode}` → mark
  payments: [],     // logged fee payments
  admissions: [],   // students admitted through the demo UI
  notices: [],      // notices published through the demo UI
  loans: {},        // library issue/return state
  edits: {},        // arbitrary per-entity field patches: `${type}:${id}` → patch
  audit: [],        // append-only trail of every write
  counters: {},     // admission serial counters keyed by YYMM
};

const DEFAULT_SETTINGS = {
  modules: null,          // null → fall back to spec defaults
  persona: 'ADMIN',
  theme: 'auto',
  language: 'en',
  today: null,            // Time Machine override (ISO date) or null for real today
  density: 'comfortable',
  seenTour: false,
  smsEnabled: false,
  emailEnabled: true,
};

let overlay = readJson(KEY, EMPTY_OVERLAY);
let settings = { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) };

function emit(kind, detail) {
  for (const fn of listeners) {
    try {
      fn(kind, detail);
    } catch (err) {
      console.error('[store] listener error', err);
    }
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persistOverlay() {
  writeJson(KEY, overlay);
}

function persistSettings() {
  writeJson(SETTINGS_KEY, settings);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function getSettings() {
  return settings;
}

export function setSetting(key, value) {
  settings = { ...settings, [key]: value };
  persistSettings();
  emit('settings', { key, value });
}

// ---------------------------------------------------------------------------
// Audit trail — every mutation is recorded (§ accountability)
// ---------------------------------------------------------------------------

function audit(action, target, detail) {
  overlay.audit.unshift({
    at: new Date().toISOString(),
    actor: settings.persona,
    action,
    target,
    detail,
  });
  // Keep the trail bounded; the production app writes to a real audit table.
  if (overlay.audit.length > 300) overlay.audit.length = 300;
}

export function getAudit(limit = 50) {
  return overlay.audit.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Generic entity patches
// ---------------------------------------------------------------------------

export function patch(type, id, fields) {
  const key = `${type}:${id}`;
  overlay.edits[key] = { ...(overlay.edits[key] || {}), ...fields };
  audit('update', key, fields);
  persistOverlay();
  emit('patch', { type, id, fields });
}

export function getPatch(type, id) {
  return overlay.edits[`${type}:${id}`] || null;
}

/** Apply any stored patch on top of a generated entity. */
export function withPatch(type, entity) {
  if (!entity) return entity;
  const p = overlay.edits[`${type}:${entity.id}`];
  return p ? { ...entity, ...p } : entity;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export function attendanceKey(studentId, dateIso, period = 0) {
  return `${studentId}|${dateIso}|${period}`;
}

export function setAttendance(studentId, dateIso, status, period = 0) {
  overlay.attendance[attendanceKey(studentId, dateIso, period)] = status;
  persistOverlay();
  emit('attendance', { studentId, dateIso, status, period });
}

export function setAttendanceBulk(entries) {
  for (const e of entries) {
    overlay.attendance[attendanceKey(e.studentId, e.dateIso, e.period || 0)] = e.status;
  }
  audit('attendance.save', `${entries.length} records`, { date: entries[0]?.dateIso });
  persistOverlay();
  emit('attendance', { bulk: entries.length });
}

export function getAttendanceOverride(studentId, dateIso, period = 0) {
  return overlay.attendance[attendanceKey(studentId, dateIso, period)];
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

export function markKey(studentId, termId, subjectCode) {
  return `${studentId}|${termId}|${subjectCode}`;
}

export function setMark(studentId, termId, subjectCode, mark) {
  const k = markKey(studentId, termId, subjectCode);
  if (mark === null || mark === '' || Number.isNaN(Number(mark))) {
    delete overlay.marks[k];
  } else {
    overlay.marks[k] = Number(mark);
  }
  persistOverlay();
  emit('marks', { studentId, termId, subjectCode, mark });
}

export function setMarksBulk(entries) {
  for (const e of entries) {
    const k = markKey(e.studentId, e.termId, e.subjectCode);
    if (e.mark === null || e.mark === '') delete overlay.marks[k];
    else overlay.marks[k] = Number(e.mark);
  }
  audit('marks.save', `${entries.length} marks`, { term: entries[0]?.termId });
  persistOverlay();
  emit('marks', { bulk: entries.length });
}

export function getMarkOverride(studentId, termId, subjectCode) {
  return overlay.marks[markKey(studentId, termId, subjectCode)];
}

// ---------------------------------------------------------------------------
// Payments (§11 — Accountant logs manual/cash payments)
// ---------------------------------------------------------------------------

export function addPayment(payment) {
  const record = {
    ...payment,
    id: `RCP-${Date.now().toString(36).toUpperCase()}`,
    at: new Date().toISOString(),
    collectedBy: settings.persona,
  };
  overlay.payments.unshift(record);
  audit('fee.collect', record.id, { student: payment.studentId, amount: payment.amount });
  persistOverlay();
  emit('payments', record);
  return record;
}

export function getPayments(studentId = null) {
  return studentId ? overlay.payments.filter((p) => p.studentId === studentId) : overlay.payments;
}

// ---------------------------------------------------------------------------
// Admissions (§8 — serial counter per YYMM, IDs never reused)
// ---------------------------------------------------------------------------

/**
 * Reserve the next admission serial for a month. Monotonic and never rewound,
 * so a withdrawn admission does not free its ID — matching the §8 guarantee.
 */
export function nextAdmissionSerial(yymm, baselineUsed) {
  const current = overlay.counters[yymm];
  const next = Math.max(current ?? 0, baselineUsed) + 1;
  overlay.counters[yymm] = next;
  persistOverlay();
  return next;
}

export function addAdmission(student) {
  overlay.admissions.unshift(student);
  audit('admission.create', student.id, { name: student.name, class: student.classKey });
  persistOverlay();
  emit('admissions', student);
  return student;
}

export function getAdmissions() {
  return overlay.admissions;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export function addNotice(notice) {
  const record = { ...notice, id: `N-${Date.now().toString(36)}`, at: new Date().toISOString() };
  overlay.notices.unshift(record);
  audit('notice.publish', record.id, { title: notice.title });
  persistOverlay();
  emit('notices', record);
  return record;
}

export function getNotices() {
  return overlay.notices;
}

// ---------------------------------------------------------------------------
// Library loans
// ---------------------------------------------------------------------------

export function setLoan(copyId, loan) {
  if (loan === null) delete overlay.loans[copyId];
  else overlay.loans[copyId] = loan;
  audit(loan ? 'library.issue' : 'library.return', copyId, loan || {});
  persistOverlay();
  emit('loans', { copyId, loan });
}

export function getLoans() {
  return overlay.loans;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Size of the persisted overlay — shown in the System Health screen. */
export function overlayFootprint() {
  const raw = localStorage.getItem(KEY) || '';
  const writes =
    Object.keys(overlay.attendance).length +
    Object.keys(overlay.marks).length +
    Object.keys(overlay.edits).length +
    overlay.payments.length +
    overlay.admissions.length +
    overlay.notices.length +
    Object.keys(overlay.loans).length;
  return { bytes: raw.length, writes, audit: overlay.audit.length };
}

export function resetDemo() {
  overlay = structuredClone(EMPTY_OVERLAY);
  localStorage.removeItem(KEY);
  emit('reset', {});
}

export function exportOverlay() {
  return JSON.stringify({ overlay, settings, exportedAt: new Date().toISOString() }, null, 2);
}

export function importOverlay(json) {
  const parsed = JSON.parse(json);
  if (!parsed.overlay) throw new Error('Not a valid ERP backup file');
  overlay = { ...structuredClone(EMPTY_OVERLAY), ...parsed.overlay };
  if (parsed.settings) settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
  persistOverlay();
  persistSettings();
  emit('import', {});
}
