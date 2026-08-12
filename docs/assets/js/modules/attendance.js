/**
 * Attendance (§6).
 *
 * Two modes, chosen by the class rather than by a setting:
 *   School section (KG–10) — one record per student per day.
 *   College section (11–12) — one record per student per teaching period, which
 *   is what HSC board attendance-eligibility rules are calculated from.
 *
 * The register is the same screen for both; it grows a period selector when the
 * selected class is in the college section.
 */

import {
  html, icon, card, table, badge, avatar, emptyState, toast, progressBar,
  barChart, legend, seriesColor, downloadFile, toCsv, toStr, confirmDialog,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as clock from '../core/clock.js';
import * as an from '../core/analytics.js';
import { studentsInClass, attendanceFor, attendanceSummary, classTeacherFor } from '../core/data.js';
import {
  summariseAttendance, eligibilityStatus, fmtDate, workingDaysIn, isWorkingDay, MONTHS,
} from '../core/domain.js';
import {
  CLASS_LIST, GRADE_BY_ID, ATTENDANCE, PERIODS, attendanceModeOf, ACADEMIC_YEAR, WEEKDAYS,
} from '../core/spec.js';

const state = {
  tab: 'register',
  classKey: CLASS_LIST[0].key,
  dateIso: null,
  period: 1,
  month: null,
};

function currentClass() {
  return CLASS_LIST.find((c) => c.key === state.classKey) || CLASS_LIST[0];
}

function currentDate() {
  return state.dateIso ? new Date(`${state.dateIso}T00:00:00`) : clock.today();
}

function isPeriodMode() {
  return attendanceModeOf(GRADE_BY_ID[currentClass().gradeId]) === ATTENDANCE.PERIOD;
}

function controls() {
  const cls = currentClass();
  return html`
    <div class="row wrap" style="gap:9px">
      <select class="select" id="a-class" style="width:auto">
        ${CLASS_LIST.map((c) => html`
          <option value="${c.key}" ${c.key === state.classKey ? 'selected' : ''}>
            ${c.gradeName} — ${c.sectionName}${c.schoolSection === 'College' ? ' (period-wise)' : ''}
          </option>`)}
      </select>
      ${state.tab === 'register' ? html`
        <input class="input" type="date" id="a-date" style="width:auto"
               value="${state.dateIso || clock.todayIso()}"
               min="${ACADEMIC_YEAR.start}" max="${ACADEMIC_YEAR.end}">
        ${isPeriodMode() ? html`
          <select class="select" id="a-period" style="width:auto">
            ${PERIODS.filter((p) => !p.isBreak).map((p) => html`
              <option value="${p.id}" ${p.id === state.period ? 'selected' : ''}>${p.label} period · ${p.start}</option>`)}
          </select>` : ''}` : ''}
      ${state.tab === 'monthly' ? html`
        <select class="select" id="a-month" style="width:auto">
          ${MONTHS.map((m, i) => html`<option value="${i}" ${(state.month ?? clock.today().getMonth()) === i ? 'selected' : ''}>${m}</option>`)}
        </select>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Daily register
// ---------------------------------------------------------------------------

function register() {
  const cls = currentClass();
  const date = currentDate();
  const roster = studentsInClass(cls.key);
  const periodMode = isPeriodMode();
  const period = periodMode ? state.period : 0;
  const teacher = classTeacherFor(cls.key);

  if (!isWorkingDay(date)) {
    return card({
      body: emptyState('calendar', 'Not a working day',
        `${fmtDate(date)} falls on the weekend. The institution runs Sunday to Thursday — pick another date or use the Time Machine.`),
    });
  }

  const marks = roster.map((s) => ({ student: s, status: attendanceFor(s, date, period) })).filter((r) => r.status);
  const present = marks.filter((m) => m.status === 'P' || m.status === 'L').length;
  const absent = marks.filter((m) => m.status === 'A').length;
  const late = marks.filter((m) => m.status === 'L').length;
  const excused = marks.filter((m) => m.status === 'E').length;

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Present</div><div class="stat-value">${present}</div>
        <div class="stat-meta">${marks.length ? ((present / marks.length) * 100).toFixed(1) : '0'}% of ${marks.length}</div></div>
      <div class="stat"><div class="stat-label">Absent</div><div class="stat-value">${absent}</div></div>
      <div class="stat"><div class="stat-label">Late</div><div class="stat-value">${late}</div>
        <div class="stat-meta">counted as present</div></div>
      <div class="stat"><div class="stat-label">Excused</div><div class="stat-value">${excused}</div>
        <div class="stat-meta">leave with a note</div></div>
    </div>

    ${card({
      title: `${cls.gradeName} — ${cls.sectionName}`,
      sub: html`${fmtDate(date)} · ${periodMode
        ? `${PERIODS.find((p) => p.id === period)?.label} period (${PERIODS.find((p) => p.id === period)?.start})`
        : 'Daily attendance'} · Class teacher: ${teacher.name}`,
      actions: html`
        <button class="btn btn-sm" id="mark-all-present">${icon('checkCircle')} Mark all present</button>
        <button class="btn btn-sm" id="att-csv">${icon('download')} CSV</button>
        <button class="btn btn-sm btn-primary" id="att-save">${icon('check')} Save register</button>`,
      flush: true,
      body: html`
        <div class="card-body" style="padding:10px 14px;border-bottom:1px solid var(--line)">
          <div class="row wrap" style="gap:12px">
            ${ATTENDANCE.STATUSES.map((s) => html`
              <span class="legend-item xsmall">
                <span class="att-cell att-${s.id}" style="width:20px;height:20px;font-size:10px">${s.id}</span>
                ${s.name}
              </span>`)}
            <span class="muted xsmall" style="margin-left:auto">Click a status to change it — click the same one twice to cycle.</span>
          </div>
        </div>
        ${table(marks, [
          { key: 'roll', label: 'Roll', align: 'center', render: (m) => html`<strong>${m.student.roll}</strong>` },
          {
            key: 'name', label: 'Student',
            render: (m) => html`
              <a class="row" href="#/student/${m.student.id}" style="gap:8px;color:inherit">
                ${avatar(m.student.name, m.student.id, 'sm')}
                <div style="min-width:0">
                  <div class="cell-main truncate">${m.student.name}</div>
                  <div class="cell-sub mono">${m.student.id}</div>
                </div>
              </a>`,
          },
          {
            key: 'status', label: 'Attendance', align: 'center', width: '200px',
            render: (m) => html`
              <div class="row" style="gap:4px;justify-content:center" data-att-row="${m.student.id}">
                ${ATTENDANCE.STATUSES.map((s) => html`
                  <button class="att-cell ${m.status === s.id ? `att-${s.id}` : 'att-none'}"
                          data-set="${s.id}" data-student="${m.student.id}" title="${s.name}">${s.id}</button>`)}
              </div>`,
          },
          {
            key: 'ytd', label: 'Year to date', align: 'right', width: '150px',
            render: (m) => {
              const sum = summariseAttendance(attendanceSummary(m.student, clock.today()));
              const st = eligibilityStatus(sum.percent);
              return html`
                <div class="row" style="gap:7px;justify-content:flex-end">
                  <span class="num">${sum.percent.toFixed(1)}%</span>
                  ${badge(st.label, st.tone)}
                </div>`;
            },
          },
        ], { compact: true, emptyMessage: 'No students enrolled on this date' })}`,
      foot: periodMode
        ? 'The college section records attendance per period, which is what HSC board eligibility is assessed on (§6).'
        : 'The school section records attendance once per day (§6).',
    })}`;
}

// ---------------------------------------------------------------------------
// Monthly sheet
// ---------------------------------------------------------------------------

function monthly() {
  const cls = currentClass();
  const month = state.month ?? clock.today().getMonth();
  const roster = studentsInClass(cls.key);
  const days = workingDaysIn(ACADEMIC_YEAR.year, month).filter((d) => d <= clock.today());

  if (!days.length) {
    return card({
      body: emptyState('calendar', 'No working days yet',
        `${MONTHS[month]} ${ACADEMIC_YEAR.year} has not started, relative to the system date (${fmtDate(clock.today())}).`),
    });
  }

  const rows = roster.map((s) => {
    const marks = days.map((d) => attendanceFor(s, d, 0));
    const present = marks.filter((x) => x === 'P' || x === 'L').length;
    const counted = marks.filter(Boolean).length;
    return { student: s, marks, present, counted, percent: counted ? (present / counted) * 100 : 0 };
  });

  return card({
    title: `Monthly register — ${MONTHS[month]} ${ACADEMIC_YEAR.year}`,
    sub: `${cls.gradeName} — ${cls.sectionName} · ${days.length} working days`,
    actions: html`<button class="btn btn-sm" id="month-csv">${icon('download')} CSV</button>`,
    flush: true,
    body: html`
      <div class="table-wrap">
        <table class="tbl compact bordered">
          <thead>
            <tr>
              <th style="position:sticky;left:0;z-index:3;background:var(--surface-2)">Student</th>
              ${days.map((d) => html`<th class="center" title="${fmtDate(d)}">${d.getDate()}</th>`)}
              <th class="num">%</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => html`
              <tr>
                <td style="position:sticky;left:0;z-index:1;background:var(--surface);min-width:170px">
                  <div class="cell-main truncate">${r.student.roll}. ${r.student.name}</div>
                </td>
                ${r.marks.map((m) => html`
                  <td class="center" style="padding:2px">
                    <span class="att-cell att-${m || 'none'}" style="width:22px;height:22px;font-size:10px;margin:auto">${m || '·'}</span>
                  </td>`)}
                <td class="num"><strong>${r.percent.toFixed(0)}</strong></td>
              </tr>`)}
          </tbody>
        </table>
      </div>`,
    foot: `Generated from the same source the daily register writes to — corrections made there appear here immediately.`,
  });
}

// ---------------------------------------------------------------------------
// Eligibility watchlist (§6)
// ---------------------------------------------------------------------------

function eligibility() {
  const risk = an.eligibilityRisk(120);
  const trend = an.attendanceTrend();

  return html`
    <div class="grid g-split mb-3">
      ${card({
        title: 'Attendance rate by month',
        sub: 'Whole institution',
        body: html`
          ${legend([
            { label: 'School (KG–10)', color: seriesColor(0) },
            { label: 'College (11–12)', color: seriesColor(1) },
          ])}
          <div class="mt-2">
            ${barChart(trend.map((m) => ({ label: m.label, value: Number(m.percent.toFixed(1)) })), {
              height: 190, maxOverride: 100, valueFormat: (v) => `${Math.round(v)}`,
            })}
          </div>`,
      })}
      ${card({
        title: 'The rule',
        body: html`
          <p class="dim small" style="line-height:1.7">
            The HSC board will not forward a candidate whose attendance falls below
            <strong>${ATTENDANCE.ELIGIBILITY_THRESHOLD}%</strong>. The register flags students as soon
            as they cross that line so the office can act while there is still time in the session
            to recover — not on the day forms are filed.
          </p>
          <div class="col mt-2" style="gap:9px">
            <div class="row between"><span class="small">Eligible</span>${badge('≥ 70%', 'ok')}</div>
            <div class="row between"><span class="small">At risk</span>${badge('60–69%', 'warn')}</div>
            <div class="row between"><span class="small">Not eligible</span>${badge('< 60%', 'bad')}</div>
          </div>
          <p class="xsmall muted mt-3">
            Late arrival counts as present here — the board measures presence, not punctuality.
          </p>`,
      })}
    </div>

    ${card({
      title: 'Shortfall watchlist',
      sub: `${risk.length} student${risk.length === 1 ? '' : 's'} below the threshold, worst first`,
      flush: true,
      actions: html`<button class="btn btn-sm" id="risk-csv">${icon('download')} CSV</button>`,
      body: risk.length
        ? table(risk.slice(0, 60), [
            {
              key: 'name', label: 'Student',
              render: (r) => html`
                <a class="row" href="#/student/${r.student.id}" style="gap:8px;color:inherit">
                  ${avatar(r.student.name, r.student.id, 'sm')}
                  <div style="min-width:0">
                    <div class="cell-main truncate">${r.student.name}</div>
                    <div class="cell-sub mono">${r.student.id}</div>
                  </div>
                </a>`,
            },
            { key: 'class', label: 'Class', render: (r) => `${r.student.gradeName} ${r.student.sectionName}` },
            { key: 'section', label: 'Section', render: (r) => badge(r.student.schoolSection, 'outline') },
            { key: 'present', label: 'Present', align: 'right', render: (r) => `${r.summary.present} / ${r.summary.total}` },
            {
              key: 'pct', label: 'Rate', align: 'right', width: '150px',
              render: (r) => html`
                <div class="row" style="gap:8px;justify-content:flex-end">
                  <span class="num strong">${r.summary.percent.toFixed(1)}%</span>
                  <div style="width:60px">${progressBar(r.summary.percent, eligibilityStatus(r.summary.percent).tone)}</div>
                </div>`,
            },
            {
              key: 'need', label: 'Days needed', align: 'right',
              render: (r) => html`<span class="num">${r.summary.shortfall}</span>`,
            },
          ], { compact: true })
        : html`<div class="card-body">${emptyState('checkCircle', 'Everyone is eligible',
            'No student is below the 70% threshold at this point in the session.')}</div>`,
    })}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'register', label: 'Daily Register' },
  { id: 'monthly', label: 'Monthly Sheet' },
  { id: 'eligibility', label: 'Eligibility Watchlist' },
];

export default {
  id: 'attendance',
  title: 'Attendance',
  module: 'attendance',

  render(ctx) {
    if (ctx.query.class && CLASS_LIST.some((c) => c.key === ctx.query.class)) state.classKey = ctx.query.class;
    if (ctx.query.tab) state.tab = ctx.query.tab;

    const body = state.tab === 'monthly' ? monthly() : state.tab === 'eligibility' ? eligibility() : register();

    return {
      title: 'Attendance',
      sub: 'Daily for the school section, period-wise for the college section — one register, two modes (§6).',
      actions: controls(),
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
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

    root.querySelector('#a-class')?.addEventListener('change', (e) => {
      state.classKey = e.target.value;
      window.ERP.repaint();
    });
    root.querySelector('#a-date')?.addEventListener('change', (e) => {
      state.dateIso = e.target.value;
      window.ERP.repaint();
    });
    root.querySelector('#a-period')?.addEventListener('change', (e) => {
      state.period = Number(e.target.value);
      window.ERP.repaint();
    });
    root.querySelector('#a-month')?.addEventListener('change', (e) => {
      state.month = Number(e.target.value);
      window.ERP.repaint();
    });

    // ---- Register editing --------------------------------------------------
    const pending = new Map();
    const dateIso = state.dateIso || clock.todayIso();
    const period = isPeriodMode() ? state.period : 0;

    root.querySelectorAll('[data-set]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const { set, student } = btn.dataset;
        pending.set(student, set);
        const row = root.querySelector(`[data-att-row="${CSS.escape(student)}"]`);
        row?.querySelectorAll('[data-set]').forEach((b) => {
          const on = b.dataset.set === set;
          b.className = `att-cell ${on ? `att-${set}` : 'att-none'}`;
        });
      }));

    root.querySelector('#mark-all-present')?.addEventListener('click', () => {
      root.querySelectorAll('[data-att-row]').forEach((row) => {
        const student = row.dataset.attRow;
        pending.set(student, 'P');
        row.querySelectorAll('[data-set]').forEach((b) => {
          b.className = `att-cell ${b.dataset.set === 'P' ? 'att-P' : 'att-none'}`;
        });
      });
      toast('All marked present', 'Nothing is saved until you press Save register.', 'warn');
    });

    root.querySelector('#att-save')?.addEventListener('click', () => {
      if (!pending.size) {
        toast('Nothing to save', 'No attendance was changed.', 'warn');
        return;
      }
      store.setAttendanceBulk([...pending.entries()].map(([studentId, status]) => ({
        studentId, dateIso, status, period,
      })));
      toast('Register saved', `${pending.size} record${pending.size === 1 ? '' : 's'} written for ${fmtDate(dateIso)}.`);
      pending.clear();
      window.ERP.repaint();
    });

    // ---- Exports -----------------------------------------------------------
    root.querySelector('#att-csv')?.addEventListener('click', () => {
      const roster = studentsInClass(state.classKey);
      const date = currentDate();
      const rows = roster.map((s) => ({ s, status: attendanceFor(s, date, period) })).filter((r) => r.status);
      downloadFile(`attendance-${state.classKey}-${dateIso}.csv`, toCsv(rows, [
        { label: 'Roll', value: (r) => r.s.roll },
        { label: 'Student ID', value: (r) => r.s.id },
        { label: 'Name', value: (r) => r.s.name },
        { label: 'Status', value: (r) => ATTENDANCE.STATUSES.find((x) => x.id === r.status)?.name },
      ]), 'text/csv');
      toast('Register exported');
    });

    root.querySelector('#month-csv')?.addEventListener('click', () => {
      const month = state.month ?? clock.today().getMonth();
      const days = workingDaysIn(ACADEMIC_YEAR.year, month).filter((d) => d <= clock.today());
      const roster = studentsInClass(state.classKey);
      downloadFile(`attendance-${state.classKey}-${MONTHS[month]}.csv`, toCsv(roster, [
        { label: 'Roll', value: (s) => s.roll },
        { label: 'Name', value: (s) => s.name },
        ...days.map((d) => ({ label: String(d.getDate()), value: (s) => attendanceFor(s, d, 0) || '' })),
      ]), 'text/csv');
      toast('Monthly sheet exported');
    });

    root.querySelector('#risk-csv')?.addEventListener('click', () => {
      const risk = an.eligibilityRisk(500);
      downloadFile(`attendance-shortfall-${clock.todayIso()}.csv`, toCsv(risk, [
        { label: 'Student ID', value: (r) => r.student.id },
        { label: 'Name', value: (r) => r.student.name },
        { label: 'Class', value: (r) => `${r.student.gradeName} ${r.student.sectionName}` },
        { label: 'Present', value: (r) => r.summary.present },
        { label: 'Total', value: (r) => r.summary.total },
        { label: 'Percent', value: (r) => r.summary.percent.toFixed(2) },
        { label: 'Days Needed', value: (r) => r.summary.shortfall },
      ]), 'text/csv');
      toast('Watchlist exported', `${risk.length} students.`);
    });
  },
};
