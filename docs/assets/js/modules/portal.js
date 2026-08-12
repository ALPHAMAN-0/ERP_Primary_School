/**
 * Parent / Student Portal (§10).
 *
 * A guardian gets one account that links to every child they have enrolled —
 * the child switcher at the top is the whole point of the requirement. Students
 * see the same screen scoped to themselves.
 */

import {
  html, icon, card, table, badge, avatar, gradePill, emptyState, progressBar,
  barChart, legend, seriesColor, modal, toast,
} from '../core/ui.js';
import * as auth from '../core/auth.js';
import * as clock from '../core/clock.js';
import * as an from '../core/analytics.js';
import {
  studentById, attendanceSummary, attendanceRange, marksFor, routineFor, classTeacherFor, familyOf,
} from '../core/data.js';
import {
  summariseAttendance, computeResult, eligibilityStatus, taka, fmtDate, ageFrom,
  workingDaysIn, parseDate, toIsoDate, MONTHS, truncate2,
} from '../core/domain.js';
import { EXAM_TERMS, WEEKDAYS, ACADEMIC_YEAR, GROUPS, ATTENDANCE } from '../core/spec.js';
import { activeLoans, isOverdue } from '../core/facilities.js';
import { reportCardDoc } from './exams.js';

const state = { childId: null, tab: 'overview' };

function activeChild() {
  const children = auth.linkedChildren();
  if (!children.length) return null;
  return children.find((c) => c.id === state.childId) || children[0];
}

function childSwitcher(children, active) {
  if (children.length < 2) return '';
  return html`
    <div class="card mb-3">
      <div class="card-body" style="padding:10px 12px">
        <div class="row wrap" style="gap:8px;align-items:center">
          <span class="label" style="margin:0">Viewing</span>
          ${children.map((c) => html`
            <button class="chip ${c.id === active.id ? 'on' : ''}" data-child="${c.id}">
              ${c.name.split(' ')[0]} · ${c.gradeName}
            </button>`)}
          <span class="muted xsmall" style="margin-left:auto">
            One guardian account, ${children.length} enrolled children (§10)
          </span>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function overview(child) {
  const t = clock.today();
  const summary = summariseAttendance(attendanceSummary(child, t));
  const status = eligibilityStatus(summary.percent);
  const ledger = an.studentLedger(child);
  const teacher = classTeacherFor(child.classKey);
  const loans = activeLoans(t).filter((l) => l.studentId === child.id);

  const termResults = EXAM_TERMS.filter((e) => !e.boardPrepOnly).map((term) => {
    const { subjects, marks } = marksFor(child, term.id);
    return { term, result: computeResult(subjects, marks) };
  });
  const latest = termResults.filter((r) => r.result.subjectCount).slice(-1)[0] || termResults[0];

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat">
        <div class="stat-label">Attendance</div>
        <div class="stat-value">${summary.percent.toFixed(1)}%</div>
        <div class="mt-1">${progressBar(summary.percent, status.tone)}</div>
        <div class="stat-meta">${badge(status.label, status.tone)} ${summary.present}/${summary.total} days</div>
      </div>
      <div class="stat">
        <div class="stat-label">${latest.term.short} result</div>
        <div class="stat-value">${latest.result.passed ? latest.result.gpa.toFixed(2) : '0.00'}</div>
        <div class="stat-meta">${latest.result.passed ? gradePill(latest.result.letter) : badge('Failed', 'bad')} GPA out of 5.00</div>
      </div>
      <div class="stat">
        <div class="stat-label">Fees outstanding</div>
        <div class="stat-value">${ledger.due === 0 ? '—' : taka(ledger.due)}</div>
        <div class="stat-meta">${ledger.due === 0 ? badge('Settled', 'ok') : badge(`${ledger.monthsOverdue} month(s) behind`, 'warn')}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Class teacher</div>
        <div class="stat-value sm">${teacher.name.split(' ').slice(-2).join(' ')}</div>
        <div class="stat-meta mono">${teacher.phone}</div>
      </div>
    </div>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: `${latest.term.name} — subject marks`,
        actions: html`<button class="btn btn-sm" data-report="${latest.term.id}">${icon('printer')} Report card</button>`,
        flush: true,
        body: table(latest.result.rows.filter((r) => r.mark !== null), [
          { key: 'name', label: 'Subject', render: (r) => html`<div class="cell-main">${r.name}${r.optional ? ' *' : ''}</div><div class="cell-sub bn">${r.nameBn}</div>` },
          { key: 'mark', label: 'Mark', align: 'right', render: (r) => html`<span class="num">${r.mark}/${r.full}</span>` },
          { key: 'letter', label: 'Grade', align: 'center', render: (r) => gradePill(r.letter) },
          { key: 'gp', label: 'GP', align: 'right', render: (r) => r.gp.toFixed(2) },
        ], { compact: true }),
        foot: latest.result.passed
          ? html`GPA <strong>${latest.result.gpa.toFixed(2)}</strong> · ${latest.result.totalMarks}/${latest.result.totalFull} (${latest.result.percent.toFixed(1)}%)`
          : html`<span style="color:var(--critical-ink)">Failed — a grade below 33 in ${latest.result.failedSubjects.join(', ')} fails the whole result (§7).</span>`,
      })}
      ${card({
        title: 'Progress across terms',
        body: html`
          ${barChart(termResults.map((r) => ({ label: r.term.short, value: r.result.passed ? r.result.gpa : 0 })), {
            height: 175, maxOverride: 5, valueFormat: (v) => v.toFixed(2),
          })}
          <p class="xsmall muted mt-2">GPA on the board scale, maximum 5.00.</p>`,
      })}
    </div>

    ${loans.length ? card({
      title: 'Library books on loan',
      flush: true,
      body: table(loans, [
        { key: 'title', label: 'Title', render: (l) => html`<div class="cell-main">${l.book.title}</div><div class="cell-sub">${l.book.author}</div>` },
        { key: 'due', label: 'Due back', render: (l) => html`${fmtDate(l.dueOn, 'short')} ${isOverdue(l, t) ? badge('Overdue', 'bad') : ''}` },
      ], { compact: true }),
    }) : ''}`;
}

function attendanceTab(child) {
  const t = clock.today();
  const month = t.getMonth();
  const days = workingDaysIn(ACADEMIC_YEAR.year, month).filter((d) => d <= t);
  const records = attendanceRange(child, new Date(ACADEMIC_YEAR.start), t);
  const summary = summariseAttendance(records);
  const status = eligibilityStatus(summary.percent);

  // Month-by-month rate, so a decline is visible before it becomes a problem.
  const byMonth = [];
  for (let m = 0; m <= month; m++) {
    const inMonth = records.filter((r) => parseDate(r.date).getMonth() === m);
    if (!inMonth.length) continue;
    const present = inMonth.filter((r) => r.status === 'P' || r.status === 'L').length;
    byMonth.push({ label: MONTHS[m].slice(0, 3), value: truncate2((present / inMonth.length) * 100) });
  }

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Overall</div><div class="stat-value">${summary.percent.toFixed(1)}%</div>
        <div class="stat-meta">${badge(status.label, status.tone)}</div></div>
      <div class="stat"><div class="stat-label">Present</div><div class="stat-value">${summary.present}</div>
        <div class="stat-meta">including ${summary.late} late</div></div>
      <div class="stat"><div class="stat-label">Absent</div><div class="stat-value">${summary.absent}</div>
        <div class="stat-meta">${summary.excused} excused separately</div></div>
      <div class="stat"><div class="stat-label">To reach 70%</div>
        <div class="stat-value">${summary.eligible ? '—' : summary.shortfall}</div>
        <div class="stat-meta">${summary.eligible ? 'Above the threshold' : 'more present days needed'}</div></div>
    </div>

    <div class="grid g-sidebar">
      ${card({
        title: `${MONTHS[month]} ${ACADEMIC_YEAR.year}`,
        sub: 'Day-by-day record for the current month',
        body: html`
          <div class="row wrap" style="gap:5px">
            ${days.map((d) => {
              const rec = records.find((r) => r.date === toIsoDate(d));
              const st = rec?.status || 'none';
              return html`
                <div class="att-cell att-${st}" title="${fmtDate(d)} — ${ATTENDANCE.STATUSES.find((s) => s.id === st)?.name || 'No record'}">
                  ${d.getDate()}
                </div>`;
            })}
          </div>
          <div class="row wrap mt-3" style="gap:12px">
            ${ATTENDANCE.STATUSES.map((s) => html`
              <span class="legend-item xsmall">
                <span class="att-cell att-${s.id}" style="width:18px;height:18px;font-size:9px">${s.id}</span>${s.name}
              </span>`)}
          </div>`,
      })}
      ${card({
        title: 'Monthly rate',
        body: barChart(byMonth, { height: 180, maxOverride: 100, valueFormat: (v) => Math.round(v) }),
        foot: 'Late arrival counts as present — the board measures presence, not punctuality (§6).',
      })}
    </div>`;
}

function feesTab(child) {
  const ledger = an.studentLedger(child);
  const family = familyOf(child);
  const siblings = family ? family.children : [child];

  return html`
    ${siblings.length > 1 ? html`
      <div class="card mb-3">
        <div class="card-body">
          <div class="label mb-2">Family total</div>
          <div class="row wrap" style="gap:18px">
            ${siblings.map((s) => {
              const l = an.studentLedger(s);
              return html`
                <div>
                  <div class="xsmall muted">${s.name.split(' ')[0]} · ${s.gradeName}</div>
                  <div class="strong" style="${l.due ? 'color:var(--critical-ink)' : 'color:var(--ok-ink)'}">${l.due ? taka(l.due) : 'Settled'}</div>
                </div>`;
            })}
            <div style="margin-left:auto;text-align:right">
              <div class="xsmall muted">Total outstanding</div>
              <div class="stat-value sm">${taka(siblings.reduce((s, c) => s + an.studentLedger(c).due, 0))}</div>
            </div>
          </div>
        </div>
      </div>` : ''}

    ${card({
      title: `Fee ledger — ${child.name}`,
      sub: `${ledger.monthsBilled} month${ledger.monthsBilled === 1 ? '' : 's'} billed · ${ACADEMIC_YEAR.label}`,
      flush: true,
      body: html`
        ${table(ledger.lines, [
          { key: 'name', label: 'Particulars', render: (l) => (l.isDiscount ? html`<span style="color:var(--ok-ink)">${l.name}</span>` : l.name) },
          { key: 'amount', label: 'Amount', align: 'right', render: (l) => html`<span style="${l.isDiscount ? 'color:var(--ok-ink)' : ''}">${taka(l.amount)}</span>` },
        ], { compact: true })}
        <div class="card-body" style="border-top:1px solid var(--line)">
          <div class="row between mb-1"><span class="dim">Billed</span><strong>${taka(ledger.billed)}</strong></div>
          <div class="row between mb-1"><span class="dim">Paid</span><strong style="color:var(--ok-ink)">${taka(ledger.paid)}</strong></div>
          <div class="row between" style="font-size:16px">
            <span class="strong">Outstanding</span>
            <strong style="${ledger.due ? 'color:var(--critical-ink)' : ''}">${taka(ledger.due)}</strong>
          </div>
        </div>`,
      foot: html`
        Payment is made at the accounts office and logged by the Accountant (§11). Online payment
        is planned but not yet wired to a provider — the ledger is already built for it.`,
    })}`;
}

function routineTab(child) {
  const routine = routineFor(child.classKey);
  const todayIdx = clock.today().getDay();
  return card({
    title: `Weekly routine — ${child.gradeName} ${child.sectionName}`,
    sub: 'Sunday to Thursday',
    flush: true,
    body: html`
      ${routine.map((day, di) => html`
        <div style="border-bottom:1px solid var(--line)">
          <div class="row" style="padding:9px 15px;background:var(--surface-2);gap:8px">
            <strong>${day.day}</strong>${di === todayIdx ? badge('today', 'brand') : ''}
          </div>
          ${table(day.periods, [
            { key: 'time', label: 'Time', render: (p) => html`<span class="mono">${p.start}–${p.end}</span>` },
            { key: 'sub', label: 'Subject', render: (p) => html`<div class="cell-main">${p.subject.name}</div><div class="cell-sub bn">${p.subject.nameBn}</div>` },
            { key: 'teacher', label: 'Teacher', render: (p) => p.teacher.name },
            { key: 'room', label: 'Room', align: 'center', render: (p) => html`<span class="mono">${p.room}</span>` },
          ], { compact: true })}
        </div>`)}`,
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'fees', label: 'Fees' },
  { id: 'routine', label: 'Routine' },
];

export default {
  id: 'portal',
  title: 'My Portal',
  module: 'portal',

  render(ctx) {
    if (ctx.query.child) state.childId = ctx.query.child;
    const children = auth.linkedChildren();
    const child = activeChild();

    if (!child) {
      return {
        title: 'My Portal',
        body: html`<div class="card"><div class="card-body">
          ${emptyState('heart', 'No student linked to this account',
            'The Student and Parent personas bind to real records in the roster. Switch to one of them to see the portal.',
            html`<button class="btn btn-primary" onclick="window.ERP.openPersonaSwitcher()">Switch role</button>`)}
        </div></div>`,
      };
    }

    const isParent = auth.currentRole() === 'PARENT';
    const body = state.tab === 'attendance' ? attendanceTab(child)
      : state.tab === 'fees' ? feesTab(child)
      : state.tab === 'routine' ? routineTab(child)
      : overview(child);

    return {
      title: isParent ? `${child.name}` : 'My Portal',
      sub: html`
        ${child.gradeName} — ${child.sectionName} · Roll ${child.roll} · ID <span class="mono">${child.id}</span>
        ${child.groupId ? html` · ${GROUPS.find((g) => g.id === child.groupId)?.name}` : ''}`,
      body: html`
        ${isParent ? childSwitcher(children, child) : ''}
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

    root.querySelectorAll('[data-child]').forEach((b) =>
      b.addEventListener('click', () => {
        state.childId = b.dataset.child;
        window.ERP.repaint();
      }));

    root.querySelectorAll('[data-report]').forEach((b) =>
      b.addEventListener('click', () => {
        const child = activeChild();
        const term = EXAM_TERMS.find((t) => t.id === b.dataset.report);
        modal({
          title: `Report card — ${term.name}`,
          size: 'wide',
          body: reportCardDoc(child, term),
          foot: html`
            <button class="btn" data-close>Close</button>
            <button class="btn btn-primary" id="print-doc">${icon('printer')} Print</button>`,
          onMount: (el) => el.querySelector('#print-doc').addEventListener('click', () => window.print()),
        });
      }));
  },
};
