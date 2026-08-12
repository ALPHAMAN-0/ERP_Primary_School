/**
 * Dashboard — one screen, eight faces.
 *
 * Each role sees the numbers it acts on, not a generic overview: a teacher sees
 * today's periods and whose attendance is still unmarked; an accountant sees
 * what came in and what is outstanding; a parent sees their children.
 */

import {
  html, icon, card, statTile, table, badge, avatar, gradePill, legend,
  barChart, lineChart, sparkline, donut, progressBar, seriesColor, emptyState, stackBar,
} from '../core/ui.js';
import * as auth from '../core/auth.js';
import * as clock from '../core/clock.js';
import * as store from '../core/store.js';
import * as an from '../core/analytics.js';
import {
  allStudents, institutionStats, studentsInClass, teacherRoutine, classTeacherFor,
  attendanceSummary, attendanceFor, marksFor, staffById, studentById, allStaff, routineFor,
} from '../core/data.js';
import {
  taka, fmtDate, parseDate, summariseAttendance, computeResult, eligibilityStatus, MONTHS, truncate2,
} from '../core/domain.js';
import { CLASS_LIST, EXAM_TERMS, ACADEMIC_YEAR, WEEKDAYS, INSTITUTION, GRADE_BY_ID } from '../core/spec.js';
import {
  activeLoans, fineFor, isOverdue, allRoutes, routeRoster, transportWaitlist,
} from '../core/facilities.js';
import { NOTICES_SEED } from './notices.js';

const currentTerm = () => {
  const m = clock.today().getMonth() + 1;
  if (m <= 4) return EXAM_TERMS[0];
  if (m <= 8) return EXAM_TERMS[1];
  return EXAM_TERMS[2];
};

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function todayStrip() {
  const t = clock.today();
  const day = WEEKDAYS[t.getDay()] || 'Weekend';
  return html`<span class="muted">${day}, ${fmtDate(t)} · ${ACADEMIC_YEAR.label}</span>`;
}

function noticeList(limit = 4) {
  const all = [...store.getNotices(), ...NOTICES_SEED].slice(0, limit);
  if (!all.length) return emptyState('megaphone', 'No notices', 'Nothing has been published yet.');
  return html`
    <div class="col" style="gap:10px">
      ${all.map((n) => html`
        <div class="notice ${n.priority === 'urgent' ? 'urgent' : n.pinned ? 'pinned' : ''}">
          <div class="row between">
            <div class="notice-title">${n.title}</div>
            ${n.priority === 'urgent' ? badge('Urgent', 'bad') : ''}
          </div>
          <div class="notice-meta">${fmtDate(n.date || n.at)} · ${n.audience || 'All'}</div>
        </div>`)}
    </div>`;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

function adminDashboard() {
  const stats = institutionStats();
  const t = clock.today();
  const attToday = an.attendanceOn(t);
  const trend = an.attendanceTrend();
  const fees = an.feeSummary();
  const term = currentTerm();
  const dist = an.gradeDistribution(term.id);
  const enrol = an.enrolmentByGrade();

  const trendPoints = trend.map((m) => ({ x: m.month, y: truncate2(m.percent) }));
  const schoolPoints = trend.map((m) => ({ x: m.month, y: truncate2(m.school) }));
  const collegePoints = trend.map((m) => ({ x: m.month, y: truncate2(m.college) }));

  const bands = Object.entries(dist.bands).map(([label, value]) => ({ label, value }));

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({
        label: 'Total students', iconName: 'users',
        value: stats.totalStudents.toLocaleString(),
        meta: html`${stats.bySection.School.toLocaleString()} school · ${stats.bySection.College.toLocaleString()} college`,
      })}
      ${statTile({
        label: attToday.holiday ? 'Attendance (last working day)' : 'Attendance today', iconName: 'check',
        value: attToday.holiday ? '—' : `${attToday.percent.toFixed(1)}%`,
        meta: attToday.holiday
          ? html`<span class="muted">Weekend — the institution runs Sun–Thu</span>`
          : html`${attToday.present.toLocaleString()} present · <span class="delta down">${attToday.A.toLocaleString()} absent</span>`,
        spark: attToday.holiday ? null : sparkline(trend.map((m) => m.percent), { color: 'var(--series-1)' }),
      })}
      ${statTile({
        label: 'Collected this year', iconName: 'cash',
        value: taka(fees.collected),
        meta: html`${fees.collectionRate.toFixed(1)}% of ${taka(fees.billed)} billed`,
        spark: sparkline(an.collectionTrend().map((m) => m.amount), { color: 'var(--series-3)' }),
      })}
      ${statTile({
        label: 'Outstanding dues', iconName: 'alert',
        value: taka(fees.due),
        meta: html`<span class="delta down">${fees.overdueStudents.toLocaleString()} students overdue</span>`,
      })}
    </div>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: 'Attendance rate by month',
        sub: `School section vs college section · ${ACADEMIC_YEAR.label}`,
        body: html`
          ${legend([
            { label: 'School (KG–10)', color: seriesColor(0), line: true },
            { label: 'College (11–12)', color: seriesColor(1), line: true },
          ])}
          <div class="mt-2">
            ${lineChart(
              [
                { name: 'School', color: seriesColor(0), points: schoolPoints },
                { name: 'College', color: seriesColor(1), points: collegePoints },
              ],
              { labels: trend.map((m) => m.label), height: 215, yMin: 60, yMax: 100, valueFormat: (v) => `${v}%` }
            )}
          </div>
          <p class="xsmall muted mt-2">
            The college section is measured period-wise and the school section once a day (§6),
            so the two lines answer slightly different questions — they are plotted on one
            axis because both are a percentage of expected presence.
          </p>`,
      })}
      ${card({
        title: 'Enrolment by section',
        body: html`
          <div class="row" style="gap:18px;align-items:center">
            ${donut(
              [
                { label: 'School', value: stats.bySection.School, color: seriesColor(0) },
                { label: 'College', value: stats.bySection.College, color: seriesColor(1) },
              ],
              { centerLabel: stats.totalStudents.toLocaleString(), centerSub: 'students' }
            )}
            <div class="col" style="gap:9px;flex:1">
              ${legend([
                { label: 'School (KG–10)', value: stats.bySection.School.toLocaleString(), color: seriesColor(0) },
                { label: 'College (11–12)', value: stats.bySection.College.toLocaleString(), color: seriesColor(1) },
              ])}
              <hr class="divider" style="margin:6px 0">
              <div class="small dim">Group split (Class 9–12)</div>
              ${stackBar([
                { label: 'Science', value: stats.byGroup.SCI, color: seriesColor(0) },
                { label: 'Business', value: stats.byGroup.BUS, color: seriesColor(1) },
                { label: 'Humanities', value: stats.byGroup.HUM, color: seriesColor(2) },
              ])}
              ${legend([
                { label: 'Science', value: stats.byGroup.SCI, color: seriesColor(0) },
                { label: 'Business', value: stats.byGroup.BUS, color: seriesColor(1) },
                { label: 'Humanities', value: stats.byGroup.HUM, color: seriesColor(2) },
              ])}
            </div>
          </div>`,
      })}
    </div>

    <div class="grid g-split mb-3">
      ${card({
        title: 'Students per class',
        sub: 'Head-count across all four sections of each grade',
        body: barChart(enrol.map((e) => ({ label: e.label, value: e.value })), {
          height: 190, color: 'var(--series-1)', barLabel: false,
        }),
        foot: html`Largest: ${enrol.reduce((a, b) => (b.value > a.value ? b : a)).full} · Smallest: ${enrol.reduce((a, b) => (b.value < a.value ? b : a)).full}`,
      })}
      ${card({
        title: `Grade distribution — ${term.name}`,
        sub: `${dist.total.toLocaleString()} results · pass rate ${dist.passRate.toFixed(1)}%`,
        body: html`
          ${barChart(bands, { height: 190, ordinal: true, barLabel: true })}
          <div class="row wrap mt-2" style="gap:14px">
            <div><span class="muted xsmall">Average GPA</span> <strong>${dist.avgGpa.toFixed(2)}</strong></div>
            <div><span class="muted xsmall">GPA 5.00</span> <strong>${dist.gpa5.toLocaleString()}</strong></div>
            <div><span class="muted xsmall">Failed</span> <strong>${dist.bands.F.toLocaleString()}</strong></div>
          </div>`,
        foot: 'One F in any compulsory subject fails the whole result (§7) — those students land in the F band regardless of their other grades.',
      })}
    </div>

    <div class="grid g-sidebar">
      ${card({
        title: 'Attendance shortfall watchlist',
        sub: 'Below the 70% board-eligibility threshold',
        actions: html`<a class="btn btn-sm" href="#/attendance">Open register</a>`,
        flush: true,
        body: (() => {
          const risk = an.eligibilityRisk(60).slice(0, 6);
          if (!risk.length) return html`<div class="card-body">${emptyState('checkCircle', 'Nobody at risk', 'Every student is above the threshold.')}</div>`;
          return table(risk, [
            {
              key: 'name', label: 'Student',
              render: (r) => html`
                <a class="row" href="#/student/${r.student.id}" style="gap:8px;color:inherit">
                  ${avatar(r.student.name, r.student.id, 'sm')}
                  <div style="min-width:0">
                    <div class="cell-main truncate">${r.student.name}</div>
                    <div class="cell-sub">${r.student.gradeName} ${r.student.sectionName}</div>
                  </div>
                </a>`,
            },
            { key: 'pct', label: 'Attendance', align: 'right', render: (r) => html`<strong>${r.summary.percent.toFixed(1)}%</strong>` },
            {
              key: 'status', label: 'Status', align: 'center',
              render: (r) => {
                const st = eligibilityStatus(r.summary.percent);
                return badge(st.label, st.tone, st.tone === 'bad' ? 'alert' : 'info');
              },
            },
          ], { compact: true });
        })(),
      })}
      ${card({
        title: 'Recent notices',
        actions: html`<a class="btn btn-sm" href="#/notices">All</a>`,
        body: noticeList(4),
      })}
    </div>`;
}

// ---------------------------------------------------------------------------
// Teacher
// ---------------------------------------------------------------------------

function teacherDashboard() {
  const identity = auth.currentIdentity();
  const staff = staffById(identity.staffId);
  const t = clock.today();
  const dayIdx = t.getDay();
  const week = teacherRoutine(staff.id);
  const todayPeriods = week[dayIdx]?.periods || [];

  // Classes where this teacher is the class teacher — the ones they own.
  const myClasses = CLASS_LIST.filter((c) => classTeacherFor(c.key).id === staff.id);
  const term = currentTerm();

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({ label: 'Periods today', iconName: 'clock', value: todayPeriods.length,
        meta: todayPeriods.length ? html`Next: ${todayPeriods[0].subject.name} at ${todayPeriods[0].start}` : html`<span class="muted">No classes scheduled</span>` })}
      ${statTile({ label: 'Classes I own', iconName: 'academic', value: myClasses.length,
        meta: myClasses.map((c) => `${c.gradeName} ${c.sectionName}`).join(', ') || 'None assigned' })}
      ${statTile({ label: 'Students in my classes', iconName: 'users',
        value: myClasses.reduce((s, c) => s + studentsInClass(c.key).length, 0) })}
      ${statTile({ label: 'Subject', iconName: 'book', value: staff.subject, meta: staff.designation })}
    </div>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: `Today's periods — ${WEEKDAYS[dayIdx] || 'Weekend'}`,
        sub: fmtDate(t),
        flush: true,
        body: todayPeriods.length
          ? table(todayPeriods, [
              { key: 'time', label: 'Time', render: (p) => html`<span class="mono">${p.start}–${p.end}</span>` },
              { key: 'cls', label: 'Class', render: (p) => html`<div class="cell-main">${p.className}</div><div class="cell-sub">Room ${p.room}</div>` },
              { key: 'sub', label: 'Subject', render: (p) => p.subject.name },
              {
                key: 'act', label: '', align: 'right',
                render: (p) => html`<a class="btn btn-sm" href="#/attendance?class=${p.classKey}">Take attendance</a>`,
              },
            ], { compact: true })
          : html`<div class="card-body">${emptyState('calendar', 'No periods today',
              'The institution runs Sunday to Thursday. Use the Time Machine to move to a working day.')}</div>`,
      })}
      ${card({
        title: 'Quick actions',
        body: html`
          <div class="col">
            <a class="btn" href="#/attendance">${icon('check')} Take attendance</a>
            <a class="btn" href="#/exams">${icon('edit')} Enter marks — ${term.short}</a>
            <a class="btn" href="#/routine">${icon('calendar')} My weekly routine</a>
            <a class="btn" href="#/notices">${icon('megaphone')} Publish a notice</a>
          </div>`,
      })}
    </div>

    ${myClasses.length ? html`
      <div class="grid g-split">
        ${myClasses.slice(0, 2).map((cls) => {
          const roster = studentsInClass(cls.key);
          const attToday = roster.map((s) => attendanceFor(s, t, 0)).filter(Boolean);
          const present = attToday.filter((s) => s === 'P' || s === 'L').length;
          const results = an.classResults(cls.key, term.id);
          const passed = results.filter((r) => r.result.passed).length;
          return card({
            title: `${cls.gradeName} — ${cls.sectionName}`,
            sub: `${roster.length} students · class teacher`,
            actions: html`<a class="btn btn-sm" href="#/students?class=${cls.key}">Roster</a>`,
            body: html`
              <div class="grid g-2" style="gap:10px">
                <div>
                  <div class="stat-label">Present today</div>
                  <div class="stat-value sm">${attToday.length ? `${present}/${attToday.length}` : '—'}</div>
                  ${attToday.length ? progressBar((present / attToday.length) * 100, present / attToday.length > 0.85 ? 'ok' : 'warn') : ''}
                </div>
                <div>
                  <div class="stat-label">${term.short} pass rate</div>
                  <div class="stat-value sm">${((passed / results.length) * 100).toFixed(0)}%</div>
                  ${progressBar((passed / results.length) * 100, 'ok')}
                </div>
              </div>`,
          });
        })}
      </div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Accountant
// ---------------------------------------------------------------------------

function accountantDashboard() {
  const fees = an.feeSummary();
  const trend = an.collectionTrend();
  const recent = store.getPayments().slice(0, 6);
  const defaulters = an.topDefaulters(6);

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({ label: 'Collected (year to date)', iconName: 'cash', value: taka(fees.collected),
        meta: html`${fees.collectionRate.toFixed(1)}% of billed`,
        spark: sparkline(trend.map((m) => m.amount), { color: 'var(--series-3)' }) })}
      ${statTile({ label: 'Outstanding', iconName: 'alert', value: taka(fees.due),
        meta: html`<span class="delta down">${fees.overdueStudents.toLocaleString()} students overdue</span>` })}
      ${statTile({ label: 'Billed to date', iconName: 'file', value: taka(fees.billed),
        meta: `${allStudents().length.toLocaleString()} student ledgers` })}
      ${statTile({ label: 'Logged this session', iconName: 'clipboard', value: recent.length,
        meta: 'Payments you have entered' })}
    </div>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: 'Collection by month',
        sub: 'Cash and office payments logged against the ledger',
        body: barChart(trend.map((m) => ({ label: m.label, value: m.amount })), {
          height: 200, valueFormat: (v) => `${Math.round(v / 1000)}k`, color: 'var(--series-3)',
        }),
        foot: 'V1 is manual collection — the Accountant logs each payment at the office (§11). The gateway seam exists but is not wired to a provider.',
      })}
      ${card({
        title: 'Quick actions',
        body: html`
          <div class="col">
            <a class="btn btn-primary" href="#/fees">${icon('cash')} Collect a fee</a>
            <a class="btn" href="#/fees?tab=dues">${icon('alert')} Dues report</a>
            <a class="btn" href="#/students">${icon('search')} Find a student</a>
          </div>`,
      })}
    </div>

    <div class="grid g-split">
      ${card({
        title: 'Largest outstanding balances',
        flush: true,
        actions: html`<a class="btn btn-sm" href="#/fees?tab=dues">Full report</a>`,
        body: table(defaulters, [
          {
            key: 'name', label: 'Student',
            render: (l) => html`
              <a href="#/student/${l.student.id}" style="color:inherit">
                <div class="cell-main">${l.student.name}</div>
                <div class="cell-sub">${l.student.gradeName} ${l.student.sectionName} · ${l.student.id}</div>
              </a>`,
          },
          { key: 'due', label: 'Due', align: 'right', render: (l) => html`<strong>${taka(l.due)}</strong>` },
          { key: 'm', label: 'Months', align: 'center', render: (l) => badge(`${l.monthsOverdue}`, l.monthsOverdue > 3 ? 'bad' : 'warn') },
        ], { compact: true }),
      })}
      ${card({
        title: 'Recent receipts',
        flush: true,
        body: recent.length
          ? table(recent, [
              { key: 'id', label: 'Receipt', render: (p) => html`<span class="mono">${p.id}</span>` },
              { key: 'student', label: 'Student', render: (p) => studentById(p.studentId)?.name || p.studentId },
              { key: 'amount', label: 'Amount', align: 'right', render: (p) => taka(p.amount) },
            ], { compact: true })
          : html`<div class="card-body">${emptyState('wallet', 'No payments logged yet',
              'Payments you record are kept locally and appear here immediately.',
              html`<a class="btn btn-primary btn-sm" href="#/fees">Collect a fee</a>`)}</div>`,
      })}
    </div>`;
}

// ---------------------------------------------------------------------------
// Librarian
// ---------------------------------------------------------------------------

function librarianDashboard() {
  const t = clock.today();
  const loans = activeLoans(t);
  const overdue = loans.filter((l) => isOverdue(l, t));
  const fines = overdue.reduce((s, l) => s + fineFor(l, t), 0);

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({ label: 'Books on loan', iconName: 'book', value: loans.length })}
      ${statTile({ label: 'Overdue', iconName: 'alert', value: overdue.length,
        meta: html`<span class="delta down">${((overdue.length / Math.max(1, loans.length)) * 100).toFixed(0)}% of active loans</span>` })}
      ${statTile({ label: 'Fines accrued', iconName: 'cash', value: taka(fines), meta: '৳2 per day, per book' })}
      ${statTile({ label: 'Titles catalogued', iconName: 'layers', value: 36, meta: 'Across 15 subjects' })}
    </div>
    ${card({
      title: 'Overdue loans',
      sub: 'Longest overdue first',
      flush: true,
      actions: html`<a class="btn btn-sm" href="#/library">Open library</a>`,
      body: overdue.length
        ? table(overdue.sort((a, b) => parseDate(a.dueOn) - parseDate(b.dueOn)).slice(0, 10), [
            { key: 'title', label: 'Title', render: (l) => html`<div class="cell-main">${l.book.title}</div><div class="cell-sub">${l.book.author}</div>` },
            { key: 'student', label: 'Borrower', render: (l) => html`<a href="#/student/${l.studentId}" style="color:inherit">${l.studentName}</a>` },
            { key: 'due', label: 'Due', render: (l) => fmtDate(l.dueOn, 'short') },
            { key: 'fine', label: 'Fine', align: 'right', render: (l) => html`<strong>${taka(fineFor(l, t))}</strong>` },
          ], { compact: true })
        : html`<div class="card-body">${emptyState('checkCircle', 'Nothing overdue', 'Every loan is within its 14-day window.')}</div>`,
    })}`;
}

// ---------------------------------------------------------------------------
// Transport manager
// ---------------------------------------------------------------------------

function transportDashboard() {
  const routes = allRoutes();
  const rosters = routes.map((r) => ({ route: r, riders: routeRoster(r.id) }));
  const total = rosters.reduce((s, r) => s + r.riders.length, 0);
  const capacity = routes.reduce((s, r) => s + r.vehicle.capacity, 0);

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({ label: 'Active routes', iconName: 'bus', value: routes.length })}
      ${statTile({ label: 'Students carried', iconName: 'users', value: total.toLocaleString(),
        meta: `${((total / allStudents().length) * 100).toFixed(1)}% of the roll` })}
      ${statTile({ label: 'Fleet capacity', iconName: 'package', value: capacity,
        meta: html`Utilisation ${((total / capacity) * 100).toFixed(0)}%${transportWaitlist().length
          ? html` · <span class="delta down">${transportWaitlist().length} waiting</span>` : ''}` })}
      ${statTile({ label: 'Monthly transport revenue', iconName: 'cash',
        value: taka(rosters.reduce((s, r) => s + r.riders.length * r.route.fare, 0)) })}
    </div>
    ${card({
      title: 'Route load',
      sub: 'Riders against vehicle capacity',
      flush: true,
      actions: html`<a class="btn btn-sm" href="#/transport">Manage routes</a>`,
      body: table(rosters, [
        { key: 'route', label: 'Route', render: (r) => html`<div class="cell-main">${r.route.name}</div><div class="cell-sub">${r.route.vehicle.reg}</div>` },
        { key: 'dep', label: 'Departs', render: (r) => html`<span class="mono">${r.route.departure}</span>` },
        { key: 'riders', label: 'Riders', align: 'right', render: (r) => `${r.riders.length} / ${r.route.vehicle.capacity}` },
        {
          key: 'load', label: 'Load', width: '160px',
          render: (r) => {
            const pct = (r.riders.length / r.route.vehicle.capacity) * 100;
            return progressBar(pct, pct > 95 ? 'bad' : pct > 80 ? 'warn' : 'ok');
          },
        },
      ], { compact: true }),
    })}`;
}

// ---------------------------------------------------------------------------
// HR manager
// ---------------------------------------------------------------------------

function hrDashboard() {
  const s = an.staffSummary();
  const staff = allStaff();
  const byDept = {};
  for (const e of staff) byDept[e.designation] = (byDept[e.designation] || 0) + 1;
  const top = Object.entries(byDept).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({ label: 'Total staff', iconName: 'briefcase', value: s.total, meta: `${s.teaching} teaching` })}
      ${statTile({ label: 'On leave', iconName: 'clock', value: s.onLeave })}
      ${statTile({ label: 'Monthly payroll', iconName: 'cash', value: taka(s.monthlyPayroll), meta: 'Gross, before deductions' })}
      ${statTile({ label: 'Average service', iconName: 'award', value: `${s.avgService.toFixed(1)} yrs` })}
    </div>
    <div class="grid g-split">
      ${card({
        title: 'Headcount by designation',
        body: barChart(top.map(([label, value]) => ({ label: label.split(' ')[0], value })), { height: 200 }),
      })}
      ${card({
        title: 'Quick actions',
        body: html`
          <div class="col">
            <a class="btn btn-primary" href="#/hr">${icon('briefcase')} Staff directory</a>
            <a class="btn" href="#/hr?tab=payroll">${icon('cash')} Run payroll</a>
            <a class="btn" href="#/notices">${icon('megaphone')} Staff notice</a>
          </div>
          <p class="xsmall muted mt-3">
            HR &amp; Payroll ships switched off by default (§4) and is enabled here so the module can be reviewed.
          </p>`,
      })}
    </div>`;
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

function studentDashboard() {
  const identity = auth.currentIdentity();
  const student = studentById(identity.studentId);
  if (!student) return emptyState('user', 'No student linked', 'This persona has no record bound to it.');
  return studentOverview(student);
}

function studentOverview(student) {
  const t = clock.today();
  const summary = summariseAttendance(attendanceSummary(student, t));
  const status = eligibilityStatus(summary.percent);
  const term = currentTerm();
  const { subjects, marks } = marksFor(student, term.id);
  const result = computeResult(subjects, marks);
  const ledger = an.studentLedger(student);
  const routine = routineFor(student.classKey);
  const todayRoutine = routine[t.getDay()]?.periods || [];

  const termSeries = EXAM_TERMS.filter((e) => !e.boardPrepOnly).map((e) => {
    const m = marksFor(student, e.id);
    return { label: e.short, value: computeResult(m.subjects, m.marks).gpa };
  });

  return html`
    <div class="grid g-4 mb-3">
      ${statTile({ label: 'Attendance', iconName: 'check', value: `${summary.percent.toFixed(1)}%`,
        meta: html`${summary.present} of ${summary.total} · ${badge(status.label, status.tone)}` })}
      ${statTile({ label: `${term.short} GPA`, iconName: 'award',
        value: result.passed ? result.gpa.toFixed(2) : '0.00',
        meta: result.passed ? html`Grade ${gradePill(result.letter)}` : html`<span class="delta down">Failed ${result.failedSubjects.join(', ')}</span>` })}
      ${statTile({ label: 'Fees due', iconName: 'cash', value: taka(ledger.due),
        meta: ledger.due === 0 ? html`<span class="delta up">All settled</span>` : html`${ledger.monthsOverdue} month(s) behind` })}
      ${statTile({ label: 'Class', iconName: 'academic', value: `${student.gradeName}`,
        meta: `${student.sectionName} · Roll ${student.roll}` })}
    </div>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: `${term.name} — subject marks`,
        sub: 'Marks as entered by subject teachers',
        flush: true,
        body: table(result.rows.filter((r) => r.mark !== null), [
          { key: 'name', label: 'Subject', render: (r) => html`<div class="cell-main">${r.name}</div><div class="cell-sub bn">${r.nameBn}</div>` },
          { key: 'mark', label: 'Mark', align: 'right', render: (r) => html`<span class="num">${r.mark} / ${r.full}</span>` },
          { key: 'gp', label: 'GP', align: 'right', render: (r) => r.gp.toFixed(2) },
          { key: 'letter', label: 'Grade', align: 'center', render: (r) => gradePill(r.letter) },
        ], { compact: true }),
        foot: result.passed
          ? html`GPA <strong>${result.gpa.toFixed(2)}</strong> · Total ${result.totalMarks}/${result.totalFull} (${result.percent.toFixed(1)}%)`
          : html`<span style="color:var(--critical-ink)"><strong>Failed.</strong> A grade below 33 in any compulsory subject fails the whole result (§7).</span>`,
      })}
      ${card({
        title: 'GPA across terms',
        body: html`
          ${barChart(termSeries.map((s) => ({ label: s.label, value: s.value })), {
            height: 170, maxOverride: 5, valueFormat: (v) => v.toFixed(2), color: 'var(--series-1)',
          })}
          <p class="xsmall muted mt-2">Board scale, maximum 5.00.</p>`,
      })}
    </div>

    ${card({
      title: `Today's classes — ${WEEKDAYS[t.getDay()] || 'Weekend'}`,
      flush: true,
      actions: html`<a class="btn btn-sm" href="#/routine">Full routine</a>`,
      body: todayRoutine.length
        ? table(todayRoutine, [
            { key: 'time', label: 'Time', render: (p) => html`<span class="mono">${p.start}–${p.end}</span>` },
            { key: 'sub', label: 'Subject', render: (p) => html`<div class="cell-main">${p.subject.name}</div><div class="cell-sub bn">${p.subject.nameBn}</div>` },
            { key: 'teacher', label: 'Teacher', render: (p) => p.teacher.name },
            { key: 'room', label: 'Room', align: 'center', render: (p) => html`<span class="mono">${p.room}</span>` },
          ], { compact: true })
        : html`<div class="card-body">${emptyState('calendar', 'No classes today', 'The institution runs Sunday to Thursday.')}</div>`,
    })}`;
}

// ---------------------------------------------------------------------------
// Parent (§10 — one account, many children)
// ---------------------------------------------------------------------------

function parentDashboard() {
  const children = auth.linkedChildren();
  if (!children.length) return emptyState('heart', 'No children linked', 'This guardian account has no verified links.');
  const t = clock.today();

  const totalDue = children.reduce((s, c) => s + an.studentLedger(c).due, 0);

  return html`
    <div class="card mb-3">
      <div class="card-body row wrap" style="gap:16px;align-items:center">
        ${icon('heart')}
        <div style="flex:1;min-width:220px">
          <div class="strong">${auth.currentIdentity().name}</div>
          <div class="small muted">
            Guardian account linked to ${children.length} student${children.length > 1 ? 's' : ''} —
            one login covers the whole family (§10).
          </div>
        </div>
        <div class="right">
          <div class="stat-label">Total outstanding</div>
          <div class="stat-value sm">${taka(totalDue)}</div>
        </div>
      </div>
    </div>

    <div class="grid ${children.length > 1 ? 'g-2' : ''} mb-3">
      ${children.map((child) => {
        const summary = summariseAttendance(attendanceSummary(child, t));
        const status = eligibilityStatus(summary.percent);
        const term = currentTerm();
        const { subjects, marks } = marksFor(child, term.id);
        const result = computeResult(subjects, marks);
        const ledger = an.studentLedger(child);
        return card({
          title: html`<span class="row" style="gap:8px">${avatar(child.name, child.id, 'sm')} ${child.name}</span>`,
          sub: `${child.gradeName} — ${child.sectionName} · Roll ${child.roll} · ID ${child.id}`,
          actions: html`<a class="btn btn-sm" href="#/portal?child=${child.id}">Details</a>`,
          body: html`
            <div class="grid g-3" style="gap:12px">
              <div>
                <div class="stat-label">Attendance</div>
                <div class="stat-value sm">${summary.percent.toFixed(1)}%</div>
                <div class="xsmall">${badge(status.label, status.tone)}</div>
              </div>
              <div>
                <div class="stat-label">${term.short} GPA</div>
                <div class="stat-value sm">${result.passed ? result.gpa.toFixed(2) : '0.00'}</div>
                <div class="xsmall">${result.passed ? gradePill(result.letter) : badge('Failed', 'bad')}</div>
              </div>
              <div>
                <div class="stat-label">Fees due</div>
                <div class="stat-value sm">${ledger.due === 0 ? '—' : taka(ledger.due)}</div>
                <div class="xsmall">${ledger.due === 0 ? badge('Settled', 'ok') : badge(`${ledger.monthsOverdue} mo behind`, 'warn')}</div>
              </div>
            </div>`,
        });
      })}
    </div>

    ${card({ title: 'Notices for guardians', actions: html`<a class="btn btn-sm" href="#/notices">All</a>`, body: noticeList(5) })}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default {
  id: 'dashboard',
  title: 'Dashboard',

  render() {
    const role = auth.currentRole();
    const identity = auth.currentIdentity();
    const bodies = {
      ADMIN: adminDashboard,
      TEACHER: teacherDashboard,
      ACCOUNTANT: accountantDashboard,
      LIBRARIAN: librarianDashboard,
      TRANSPORT: transportDashboard,
      HR: hrDashboard,
      STUDENT: studentDashboard,
      PARENT: parentDashboard,
    };
    const subtitles = {
      ADMIN: 'Everything across both sections of the institution.',
      TEACHER: 'Your periods, your classes, and what still needs marking.',
      ACCOUNTANT: 'Collections, dues, and receipts.',
      LIBRARIAN: 'Loans, returns, and overdue fines.',
      TRANSPORT: 'Routes, vehicles, and riders.',
      HR: 'Staff records and payroll.',
      STUDENT: 'Your attendance, results, routine, and fees.',
      PARENT: 'Every child on one account.',
    };

    return {
      title: `Good ${greeting()}, ${firstName(identity?.name || '')}`,
      sub: html`${subtitles[role]} ${todayStrip()}`,
      actions: html`
        <button class="btn btn-sm" onclick="window.ERP.openPersonaSwitcher()">${icon('layers')} Switch role</button>`,
      body: bodies[role](),
    };
  },
};

function greeting() {
  const h = clock.now().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function firstName(name) {
  const clean = String(name).replace(/^(Md\.|Mst\.|Mrs\.|Most\.|Prof\.|Dr\.|Mohammad)\s+/i, '');
  return clean.split(' ')[0] || 'there';
}
