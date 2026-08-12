/**
 * Exams & Results (§7).
 *
 * Three views over the same engine:
 *   Mark Entry   — a teacher types marks; GPA recomputes live, including the
 *                  "one F fails everything" rule, so the consequence of a mark
 *                  is visible while it is being entered rather than after.
 *   Tabulation   — the ranked class sheet the office publishes.
 *   Report Card  — the Bangla-capable student document (§13).
 */

import {
  html, icon, card, table, badge, gradePill, emptyState, toast, avatar, toStr,
  barChart, legend, seriesColor, progressBar, downloadFile, toCsv, modal, closeModal,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as clock from '../core/clock.js';
import * as auth from '../core/auth.js';
import * as an from '../core/analytics.js';
import { studentsInClass, marksFor, classTeacherFor, studentById, attendanceSummary } from '../core/data.js';
import {
  computeResult, rankResults, gradeForMark, taka, fmtDate, toBn, MONTHS_BN,
  summariseAttendance, truncate2,
} from '../core/domain.js';
import {
  CLASS_LIST, EXAM_TERMS, GRADE_SCALE, subjectsFor, termsFor, ACADEMIC_YEAR,
  INSTITUTION, GROUPS, GRADE_BY_ID,
} from '../core/spec.js';

const state = {
  tab: 'tabulation',
  classKey: CLASS_LIST[9]?.key || CLASS_LIST[0].key,
  termId: 'T2',
  subjectCode: null,
};

function currentClass() {
  return CLASS_LIST.find((c) => c.key === state.classKey) || CLASS_LIST[0];
}

function controls() {
  const cls = currentClass();
  const terms = termsFor(cls.gradeId);
  if (!terms.some((t) => t.id === state.termId)) state.termId = terms[0].id;

  return html`
    <div class="row wrap" style="gap:9px">
      <select class="select" id="x-class" style="width:auto">
        ${CLASS_LIST.map((c) => html`<option value="${c.key}" ${c.key === state.classKey ? 'selected' : ''}>${c.gradeName} — ${c.sectionName}</option>`)}
      </select>
      <select class="select" id="x-term" style="width:auto">
        ${terms.map((t) => html`<option value="${t.id}" ${t.id === state.termId ? 'selected' : ''}>${t.name}</option>`)}
      </select>
    </div>`;
}

// ---------------------------------------------------------------------------
// Tabulation sheet
// ---------------------------------------------------------------------------

function tabulation() {
  const cls = currentClass();
  const term = EXAM_TERMS.find((t) => t.id === state.termId);
  const results = an.classResults(cls.key, state.termId);
  const ranked = rankResults(results);
  const dist = an.gradeDistribution(state.termId, cls.key);
  const subjects = subjectsFor(cls.gradeId, cls.groupId);

  const bands = Object.entries(dist.bands).map(([label, value]) => ({ label, value }));

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Appeared</div><div class="stat-value">${dist.total}</div></div>
      <div class="stat"><div class="stat-label">Pass rate</div><div class="stat-value">${dist.passRate.toFixed(1)}%</div>
        <div class="mt-1">${progressBar(dist.passRate, dist.passRate > 90 ? 'ok' : dist.passRate > 75 ? 'warn' : 'bad')}</div></div>
      <div class="stat"><div class="stat-label">Average GPA</div><div class="stat-value">${dist.avgGpa.toFixed(2)}</div>
        <div class="stat-meta">of passing students</div></div>
      <div class="stat"><div class="stat-label">GPA 5.00</div><div class="stat-value">${dist.gpa5}</div>
        <div class="stat-meta">${dist.bands.F} failed</div></div>
    </div>

    <div class="grid g-split mb-3">
      ${card({
        title: 'Grade distribution',
        sub: `${cls.gradeName} — ${cls.sectionName} · ${term.name}`,
        body: barChart(bands, { height: 180, ordinal: true }),
      })}
      ${card({
        title: 'Subject averages',
        sub: 'Mean percentage per subject',
        body: (() => {
          const avgs = subjects.map((sub) => {
            let sum = 0;
            let n = 0;
            for (const { student } of results) {
              const { marks } = marksFor(student, state.termId);
              if (typeof marks[sub.code] === 'number') {
                sum += (marks[sub.code] / sub.full) * 100;
                n++;
              }
            }
            return { label: sub.code, full: sub.name, value: n ? truncate2(sum / n) : 0 };
          }).filter((a) => a.value > 0);
          return html`
            ${barChart(avgs, { height: 180, valueFormat: (v) => v.toFixed(0), maxOverride: 100 })}
            <p class="xsmall muted mt-2">Normalised to a percentage, so 200-mark HSC papers compare against 100-mark ones.</p>`;
        })(),
      })}
    </div>

    ${card({
      title: 'Tabulation sheet',
      sub: `${cls.gradeName} — ${cls.sectionName} · ${term.name} · ranked by GPA, then total marks`,
      actions: html`
        <button class="btn btn-sm" id="tab-csv">${icon('download')} CSV</button>
        <button class="btn btn-sm" id="tab-print">${icon('printer')} Print</button>`,
      flush: true,
      body: table(ranked, [
        { key: 'rank', label: '#', align: 'center', render: (r) => html`<strong>${r.rank}</strong>` },
        {
          key: 'name', label: 'Student',
          render: (r) => html`
            <a class="row" href="#/student/${r.student.id}" style="gap:8px;color:inherit">
              ${avatar(r.student.name, r.student.id, 'sm')}
              <div style="min-width:0">
                <div class="cell-main truncate">${r.student.name}</div>
                <div class="cell-sub mono">${r.student.id} · Roll ${r.student.roll}</div>
              </div>
            </a>`,
        },
        ...subjects.filter((s) => !s.optional).map((sub) => ({
          key: sub.code, label: sub.code, align: 'right',
          render: (r) => {
            const row = r.result.rows.find((x) => x.code === sub.code);
            if (!row || row.mark === null) return html`<span class="muted">—</span>`;
            return html`<span class="num ${row.passed ? '' : 'strong'}" style="${row.passed ? '' : 'color:var(--critical-ink)'}">${row.mark}</span>`;
          },
        })),
        { key: 'total', label: 'Total', align: 'right', render: (r) => html`<span class="num">${r.result.totalMarks}</span>` },
        { key: 'gpa', label: 'GPA', align: 'right', render: (r) => html`<strong>${r.result.passed ? r.result.gpa.toFixed(2) : '0.00'}</strong>` },
        { key: 'grade', label: 'Grade', align: 'center', render: (r) => (r.result.passed ? gradePill(r.result.letter) : gradePill('F')) },
        {
          key: 'act', label: '', align: 'right',
          render: (r) => html`<button class="btn btn-sm" data-report-for="${r.student.id}">Report</button>`,
        },
      ], { compact: true }),
      foot: html`
        Failing marks are shown in red. A grade below 33% in any compulsory subject fails the whole
        result regardless of the other grades (§7); the optional 4th subject is exempt and contributes
        only grade points above 2.00.`,
    })}`;
}

// ---------------------------------------------------------------------------
// Mark entry
// ---------------------------------------------------------------------------

function markEntry() {
  const cls = currentClass();
  const term = EXAM_TERMS.find((t) => t.id === state.termId);
  const subjects = subjectsFor(cls.gradeId, cls.groupId);
  if (!state.subjectCode || !subjects.some((s) => s.code === state.subjectCode)) {
    state.subjectCode = subjects[0].code;
  }
  const subject = subjects.find((s) => s.code === state.subjectCode);
  const students = studentsInClass(cls.key).filter(
    (s) => !subject.optional || s.optionalSubject === subject.code
  );

  return html`
    <div class="card mb-3">
      <div class="card-body" style="padding:12px 14px">
        <div class="row wrap" style="gap:9px;align-items:flex-end">
          <div class="field" style="min-width:190px">
            <label class="label">Subject</label>
            <select class="select" id="x-subject">
              ${subjects.map((s) => html`
                <option value="${s.code}" ${s.code === state.subjectCode ? 'selected' : ''}>
                  ${s.name}${s.optional ? ' (4th subject)' : ''} — ${s.full} marks
                </option>`)}
            </select>
          </div>
          <div class="row" style="gap:6px;margin-left:auto">
            <button class="btn btn-sm" id="me-clear">${icon('refresh')} Reset my entries</button>
            <button class="btn btn-sm btn-primary" id="me-save">${icon('check')} Save marks</button>
          </div>
        </div>
        <p class="hint mt-2">
          Type a mark out of <strong>${subject.full}</strong>. The grade and the student's overall GPA
          update as you type — including the fail rule, so you can see immediately if a mark
          would fail the whole result.
        </p>
      </div>
    </div>

    ${card({
      title: `${subject.name} — ${term.name}`,
      sub: `${cls.gradeName} — ${cls.sectionName} · ${students.length} candidates`,
      flush: true,
      body: table(students, [
        { key: 'roll', label: 'Roll', align: 'center', render: (s) => html`<strong>${s.roll}</strong>` },
        {
          key: 'name', label: 'Student',
          render: (s) => html`<div class="cell-main">${s.name}</div><div class="cell-sub mono">${s.id}</div>`,
        },
        {
          key: 'mark', label: `Mark / ${subject.full}`, align: 'right', width: '130px',
          render: (s) => {
            const value = marksFor(s, state.termId).marks[subject.code];
            const overridden = typeof store.getMarkOverride(s.id, state.termId, subject.code) === 'number';
            return html`
              <input class="input mark-input" type="number" min="0" max="${subject.full}"
                     data-student="${s.id}" value="${value ?? ''}"
                     style="width:88px;text-align:right${overridden ? ';border-color:var(--brand)' : ''}">`;
          },
        },
        { key: 'grade', label: 'Grade', align: 'center', width: '80px', render: (s) => html`<span data-grade-for="${s.id}">${gradePill(gradeForMark(marksFor(s, state.termId).marks[subject.code] ?? 0, subject.full).letter)}</span>` },
        {
          key: 'gpa', label: 'Overall GPA', align: 'right', width: '110px',
          render: (s) => {
            const { subjects: subs, marks } = marksFor(s, state.termId);
            const r = computeResult(subs, marks);
            return html`<span data-gpa-for="${s.id}" class="${r.passed ? '' : 'strong'}" style="${r.passed ? '' : 'color:var(--critical-ink)'}">${r.passed ? r.gpa.toFixed(2) : 'Failed'}</span>`;
          },
        },
      ], { compact: true }),
      foot: html`
        Marks you enter are stored as an overlay on top of the generated baseline — they survive a
        reload and can be reset per subject. Fields with a green border have been edited.`,
    })}`;
}

// ---------------------------------------------------------------------------
// Grade scale reference
// ---------------------------------------------------------------------------

function scaleReference() {
  return card({
    title: 'Grading scale',
    sub: 'The SSC/HSC board table used for every internal exam (§7)',
    flush: true,
    body: html`
      ${table(GRADE_SCALE, [
        { key: 'range', label: 'Marks', render: (g) => `${g.min}–${g.max}` },
        { key: 'letter', label: 'Letter Grade', align: 'center', render: (g) => gradePill(g.letter) },
        { key: 'gp', label: 'Grade Point', align: 'right', render: (g) => g.gp.toFixed(2) },
        { key: 'label', label: 'Remark' },
      ], { compact: true })}
      <div class="card-body">
        <div class="label mb-1">Rules applied by the engine</div>
        <ul class="small dim" style="line-height:1.7;padding-left:18px;margin:0">
          <li>A grade below 33% in any <strong>compulsory</strong> subject fails the entire result; GPA is published as 0.00.</li>
          <li>The <strong>optional (4th) subject</strong> is excluded from the divisor. Grade points above 2.00 are added as a bonus, and a fail in it does not fail the student.</li>
          <li>GPA is capped at 5.00 and <strong>truncated</strong>, not rounded — 4.999 publishes as 4.99.</li>
          <li>Marks in 200-mark HSC papers are normalised to a percentage before the band is looked up.</li>
        </ul>
      </div>`,
  });
}

// ---------------------------------------------------------------------------
// Report card document (§13 — Bangla-capable)
// ---------------------------------------------------------------------------

export function reportCardDoc(student, term) {
  const { subjects, marks } = marksFor(student, term.id);
  const result = computeResult(subjects, marks);
  const classResults = an.classResults(student.classKey, term.id);
  const ranked = rankResults(classResults);
  const position = ranked.find((r) => r.student.id === student.id)?.rank ?? '—';
  const attendance = summariseAttendance(attendanceSummary(student, clock.today()));
  const group = student.groupId ? GROUPS.find((g) => g.id === student.groupId) : null;

  return html`
    <div class="doc">
      <div class="doc-head">
        <div class="doc-inst-bn bn">${INSTITUTION.nameBn}</div>
        <div class="doc-inst">${INSTITUTION.name}</div>
        <div class="doc-addr">${INSTITUTION.address} · EIIN ${INSTITUTION.eiin}</div>
        <div class="doc-kind">Academic Transcript — ${term.name}, ${ACADEMIC_YEAR.year}</div>
      </div>

      <table style="margin-bottom:12px">
        <tr>
          <th style="width:22%">Name / নাম</th>
          <td>${student.name}<div class="bn">${student.nameBn}</div></td>
          <th style="width:18%">Student ID</th>
          <td style="width:22%">${student.id}</td>
        </tr>
        <tr>
          <th>Father / পিতা</th>
          <td>${student.father}<div class="bn">${student.fatherBn}</div></td>
          <th>Class / শ্রেণি</th>
          <td>${student.gradeName} (${student.sectionName})</td>
        </tr>
        <tr>
          <th>Mother / মাতা</th>
          <td>${student.mother}<div class="bn">${student.motherBn}</div></td>
          <th>Roll / রোল</th>
          <td>${student.roll} <span style="color:#666">(${toBn(student.roll)})</span></td>
        </tr>
        ${group ? html`<tr><th>Group / বিভাগ</th><td>${group.name} <span class="bn">(${group.nameBn})</span></td><th>Session</th><td>${ACADEMIC_YEAR.year}</td></tr>` : ''}
      </table>

      <table>
        <thead>
          <tr>
            <th style="width:38%">Subject / বিষয়</th>
            <th>Full Marks</th>
            <th>Obtained</th>
            <th>Letter Grade</th>
            <th>Grade Point</th>
          </tr>
        </thead>
        <tbody>
          ${result.rows.filter((r) => r.mark !== null).map((r) => html`
            <tr>
              <td>${r.name}${r.optional ? ' *' : ''}<div class="bn" style="color:#555">${r.nameBn}</div></td>
              <td style="text-align:center">${r.full}</td>
              <td style="text-align:center;${r.passed ? '' : 'color:#b00;font-weight:700'}">${r.mark}</td>
              <td style="text-align:center;font-weight:700">${r.letter}</td>
              <td style="text-align:center">${r.gp.toFixed(2)}</td>
            </tr>`)}
          <tr style="background:#f4f4f4;font-weight:700">
            <td>Total</td>
            <td style="text-align:center">${result.totalFull}</td>
            <td style="text-align:center">${result.totalMarks}</td>
            <td style="text-align:center">${result.passed ? result.letter : 'F'}</td>
            <td style="text-align:center">${result.passed ? result.gpa.toFixed(2) : '0.00'}</td>
          </tr>
        </tbody>
      </table>

      <table style="margin-top:12px">
        <tr>
          <th>Result / ফলাফল</th>
          <td style="font-weight:700;${result.passed ? '' : 'color:#b00'}">
            ${result.passed ? 'PASSED / উত্তীর্ণ' : 'FAILED / অকৃতকার্য'}
          </td>
          <th>GPA</th>
          <td style="font-weight:700">${result.passed ? result.gpa.toFixed(2) : '0.00'} <span style="color:#666">(${toBn(result.passed ? result.gpa.toFixed(2) : '0.00')})</span></td>
        </tr>
        <tr>
          <th>Class Position</th>
          <td>${position} of ${ranked.length}</td>
          <th>Attendance</th>
          <td>${attendance.percent.toFixed(1)}% (${attendance.present}/${attendance.total})</td>
        </tr>
      </table>

      ${result.passed
        ? ''
        : html`<p style="font-size:11px;color:#b00;margin-top:8px">
            <strong>Note:</strong> A letter grade of F in ${result.failedSubjects.join(', ')} fails the
            overall result regardless of grade points earned in other subjects.
          </p>`}
      ${result.rows.some((r) => r.optional && r.mark !== null)
        ? html`<p style="font-size:10.5px;color:#555;margin-top:6px">
            * Optional (4th) subject. Grade points above 2.00 are added to the GPA as bonus; the
            subject is excluded from the divisor and a fail in it does not affect the result.
          </p>`
        : ''}

      <div class="doc-sign">
        <div>Class Teacher</div>
        <div>Examination Controller</div>
        <div>Principal</div>
      </div>
      <div class="doc-watermark">
        Issued ${fmtDate(clock.today())} · ${fmtDate(clock.today(), 'bn')} — generated by ${INSTITUTION.name} ERP
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'tabulation', label: 'Tabulation Sheet', icon: 'list' },
  { id: 'entry', label: 'Mark Entry', icon: 'edit' },
  { id: 'scale', label: 'Grading Scale', icon: 'award' },
];

export default {
  id: 'exams',
  aliases: ['marksheet'],
  title: 'Exams & Results',
  module: 'exams',

  render(ctx) {
    if (ctx.query.class && CLASS_LIST.some((c) => c.key === ctx.query.class)) state.classKey = ctx.query.class;
    if (ctx.query.tab) state.tab = ctx.query.tab;

    const body = state.tab === 'entry' ? markEntry() : state.tab === 'scale' ? scaleReference() : tabulation();

    return {
      title: 'Exams & Results',
      sub: 'Board-accurate GPA, tabulation, and Bangla report cards.',
      actions: controls(),
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`
            <button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${body}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));

    root.querySelector('#x-class')?.addEventListener('change', (e) => {
      state.classKey = e.target.value;
      state.subjectCode = null;
      window.ERP.repaint();
    });
    root.querySelector('#x-term')?.addEventListener('change', (e) => {
      state.termId = e.target.value;
      window.ERP.repaint();
    });
    root.querySelector('#x-subject')?.addEventListener('change', (e) => {
      state.subjectCode = e.target.value;
      window.ERP.repaint();
    });

    // ---- Mark entry: live recompute without a full repaint -----------------
    const cls = currentClass();
    const subjects = subjectsFor(cls.gradeId, cls.groupId);
    const subject = subjects.find((s) => s.code === state.subjectCode);

    const pending = new Map();

    root.querySelectorAll('.mark-input').forEach((input) => {
      input.addEventListener('input', () => {
        const studentId = input.dataset.student;
        const raw = input.value.trim();
        let mark = raw === '' ? null : Number(raw);
        if (mark !== null && (Number.isNaN(mark) || mark < 0 || mark > subject.full)) {
          input.classList.add('invalid');
          return;
        }
        input.classList.remove('invalid');
        pending.set(studentId, mark);

        // Recompute this student's row against the pending value.
        const student = studentById(studentId);
        const { subjects: subs, marks } = marksFor(student, state.termId);
        if (mark === null) delete marks[subject.code];
        else marks[subject.code] = mark;

        const gradeCell = root.querySelector(`[data-grade-for="${CSS.escape(studentId)}"]`);
        if (gradeCell) {
          gradeCell.innerHTML = mark === null
            ? '<span class="muted">—</span>'
            : toStr(gradePill(gradeForMark(mark, subject.full).letter));
        }

        const r = computeResult(subs, marks);
        const gpaCell = root.querySelector(`[data-gpa-for="${CSS.escape(studentId)}"]`);
        if (gpaCell) {
          gpaCell.textContent = r.passed ? r.gpa.toFixed(2) : 'Failed';
          gpaCell.style.color = r.passed ? '' : 'var(--critical-ink)';
          gpaCell.classList.toggle('strong', !r.passed);
        }
        input.style.borderColor = 'var(--brand)';
      });
    });

    root.querySelector('#me-save')?.addEventListener('click', () => {
      if (!pending.size) {
        toast('Nothing to save', 'No marks were changed.', 'warn');
        return;
      }
      store.setMarksBulk([...pending.entries()].map(([studentId, mark]) => ({
        studentId, termId: state.termId, subjectCode: subject.code, mark,
      })));
      toast('Marks saved', `${pending.size} entr${pending.size === 1 ? 'y' : 'ies'} recorded for ${subject.name}.`);
      pending.clear();
      window.ERP.repaint();
    });

    root.querySelector('#me-clear')?.addEventListener('click', () => {
      const students = studentsInClass(state.classKey);
      store.setMarksBulk(students.map((s) => ({
        studentId: s.id, termId: state.termId, subjectCode: subject.code, mark: null,
      })));
      toast('Entries reset', `${subject.name} is back to the generated baseline.`);
      window.ERP.repaint();
    });

    // ---- Tabulation actions -----------------------------------------------
    root.querySelectorAll('[data-report-for]').forEach((b) =>
      b.addEventListener('click', () => {
        const student = studentById(b.dataset.reportFor);
        const term = EXAM_TERMS.find((t) => t.id === state.termId);
        modal({
          title: `Report card — ${student.name}`,
          size: 'wide',
          body: reportCardDoc(student, term),
          foot: html`
            <button class="btn" data-close>Close</button>
            <button class="btn btn-primary" id="print-doc">${icon('printer')} Print</button>`,
          onMount: (el) => el.querySelector('#print-doc').addEventListener('click', () => window.print()),
        });
      }));

    root.querySelector('#tab-print')?.addEventListener('click', () => window.print());

    root.querySelector('#tab-csv')?.addEventListener('click', () => {
      const ranked = rankResults(an.classResults(state.classKey, state.termId));
      const subs = subjectsFor(currentClass().gradeId, currentClass().groupId);
      const csv = toCsv(ranked, [
        { label: 'Rank', value: (r) => r.rank },
        { label: 'Student ID', value: (r) => r.student.id },
        { label: 'Roll', value: (r) => r.student.roll },
        { label: 'Name', value: (r) => r.student.name },
        ...subs.map((s) => ({ label: s.name, value: (r) => r.result.rows.find((x) => x.code === s.code)?.mark ?? '' })),
        { label: 'Total', value: (r) => r.result.totalMarks },
        { label: 'GPA', value: (r) => (r.result.passed ? r.result.gpa.toFixed(2) : '0.00') },
        { label: 'Grade', value: (r) => (r.result.passed ? r.result.letter : 'F') },
        { label: 'Result', value: (r) => (r.result.passed ? 'Pass' : 'Fail') },
      ]);
      downloadFile(`tabulation-${state.classKey}-${state.termId}.csv`, csv, 'text/csv');
      toast('Tabulation exported', `${ranked.length} results written to CSV.`);
    });
  },
};
