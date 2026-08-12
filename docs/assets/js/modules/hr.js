/**
 * HR & Payroll — ships switched OFF by default (§4).
 *
 * Staff directory plus a payroll run. Salary follows the Bangladeshi government
 * pay-grade structure the institution mirrors: a basic per grade, house rent as
 * a percentage of basic, fixed medical and transport allowances, and deductions
 * for provident fund and income tax.
 */

import {
  html, icon, card, table, badge, avatar, emptyState, toast, modal, closeModal,
  barChart, downloadFile, toCsv, progressBar, seriesColor, legend,
} from '../core/ui.js';
import * as clock from '../core/clock.js';
import * as an from '../core/analytics.js';
import { allStaff, staffById, teacherRoutine } from '../core/data.js';
import { taka, fmtDate, toBn, MONTHS } from '../core/domain.js';
import { ROLES, INSTITUTION, ACADEMIC_YEAR } from '../core/spec.js';
import { DESIGNATIONS } from '../core/names.js';

/** Provident fund is 10% of basic; income tax is a simplified slab. */
function payslipFor(staff) {
  const gross = staff.basic + staff.houseRent + staff.medical + staff.transportAllowance;
  const pf = Math.round(staff.basic * 0.1);
  const annualGross = gross * 12;
  // Simplified slab: first 350,000 exempt, then 5%, then 10% above 450,000.
  let tax = 0;
  if (annualGross > 450000) tax = (100000 * 0.05) + (annualGross - 450000) * 0.1;
  else if (annualGross > 350000) tax = (annualGross - 350000) * 0.05;
  const monthlyTax = Math.round(tax / 12);
  const deductions = pf + monthlyTax;
  return {
    staff, gross, pf, tax: monthlyTax, deductions,
    net: gross - deductions,
    lines: [
      { name: 'Basic Salary', amount: staff.basic },
      { name: 'House Rent Allowance (45%)', amount: staff.houseRent },
      { name: 'Medical Allowance', amount: staff.medical },
      { name: 'Transport Allowance', amount: staff.transportAllowance },
    ],
    deductionLines: [
      { name: 'Provident Fund (10% of basic)', amount: pf },
      { name: 'Income Tax (monthly instalment)', amount: monthlyTax },
    ],
  };
}

const state = { tab: 'directory', q: '', designation: '', staffId: null };

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

function directory() {
  const q = state.q.trim().toLowerCase();
  let rows = allStaff();
  if (state.designation) rows = rows.filter((s) => s.designationId === state.designation);
  if (q) rows = rows.filter((s) =>
    s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.email.includes(q));

  const summary = an.staffSummary();

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Total staff</div><div class="stat-value">${summary.total}</div>
        <div class="stat-meta">${summary.teaching} teaching, ${summary.total - summary.teaching} support</div></div>
      <div class="stat"><div class="stat-label">On leave</div><div class="stat-value">${summary.onLeave}</div></div>
      <div class="stat"><div class="stat-label">Monthly payroll</div><div class="stat-value">${taka(summary.monthlyPayroll)}</div>
        <div class="stat-meta">gross, before deductions</div></div>
      <div class="stat"><div class="stat-label">Average service</div><div class="stat-value">${summary.avgService.toFixed(1)} yr</div></div>
    </div>

    <div class="card mb-3">
      <div class="card-body" style="padding:12px 14px">
        <div class="row wrap" style="gap:9px">
          <div class="search-box" style="flex:1;min-width:200px">
            ${icon('search')}
            <input class="input" id="hr-q" placeholder="Name, employee ID, or email…" value="${state.q}">
          </div>
          <select class="select" id="hr-desig" style="width:auto">
            <option value="">All designations</option>
            ${DESIGNATIONS.map((d) => html`<option value="${d.id}" ${state.designation === d.id ? 'selected' : ''}>${d.name}</option>`)}
          </select>
        </div>
      </div>
    </div>

    ${card({
      title: 'Staff directory',
      sub: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
      actions: html`<button class="btn btn-sm" id="hr-csv">${icon('download')} CSV</button>`,
      flush: true,
      body: table(rows, [
        {
          key: 'name', label: 'Employee',
          render: (s) => html`
            <div class="row" style="gap:9px">
              ${avatar(s.name, s.id, 'sm')}
              <div style="min-width:0">
                <div class="cell-main truncate">${s.name}</div>
                <div class="cell-sub mono">${s.id}</div>
              </div>
            </div>`,
        },
        { key: 'designation', label: 'Designation', render: (s) => html`<div class="cell-main">${s.designation}</div><div class="cell-sub">Grade ${s.payGrade} · ${s.department}</div>` },
        {
          key: 'roles', label: 'System roles',
          render: (s) => (s.roles.length
            ? html`<div class="row wrap" style="gap:4px">${s.roles.map((r) => badge(ROLES[r]?.name || r, 'outline'))}</div>`
            : html`<span class="muted xsmall">No login</span>`),
        },
        { key: 'service', label: 'Service', align: 'right', render: (s) => html`${s.yearsOfService} yr<div class="cell-sub">since ${fmtDate(s.joinedOn, 'short')}</div>` },
        { key: 'basic', label: 'Basic', align: 'right', render: (s) => taka(s.basic) },
        { key: 'status', label: 'Status', align: 'center', render: (s) => badge(s.status, s.status === 'Active' ? 'ok' : 'warn') },
        {
          key: 'act', label: '', align: 'right',
          render: (s) => html`<button class="btn btn-sm" data-staff="${s.id}">Payslip</button>`,
        },
      ], { compact: true, emptyMessage: 'No staff match this search' }),
      foot: html`
        A staff member wearing several hats simply gets several roles (§9) — there is no permission
        matrix to configure.`,
    })}`;
}

// ---------------------------------------------------------------------------
// Payroll run
// ---------------------------------------------------------------------------

function payroll() {
  const month = clock.today().getMonth();
  const slips = allStaff().map(payslipFor);
  const gross = slips.reduce((s, p) => s + p.gross, 0);
  const deductions = slips.reduce((s, p) => s + p.deductions, 0);
  const net = slips.reduce((s, p) => s + p.net, 0);

  const byGrade = {};
  for (const p of slips) {
    byGrade[p.staff.payGrade] = (byGrade[p.staff.payGrade] || 0) + p.net;
  }

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Gross payroll</div><div class="stat-value">${taka(gross)}</div>
        <div class="stat-meta">${MONTHS[month]} ${ACADEMIC_YEAR.year}</div></div>
      <div class="stat"><div class="stat-label">Deductions</div><div class="stat-value">${taka(deductions)}</div>
        <div class="stat-meta">provident fund and tax</div></div>
      <div class="stat"><div class="stat-label">Net payable</div><div class="stat-value" style="color:var(--ok-ink)">${taka(net)}</div></div>
      <div class="stat"><div class="stat-label">Annualised</div><div class="stat-value">${taka(net * 12)}</div></div>
    </div>

    ${card({
      title: 'Net payroll by pay grade',
      body: barChart(
        Object.entries(byGrade).sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([grade, amount]) => ({ label: `G${grade}`, value: Math.round(amount / 1000) })),
        { height: 180, valueFormat: (v) => `${v}k` }
      ),
      foot: 'Thousands of taka. Lower grade numbers are senior posts, following the national pay scale.',
      cls: 'mb-3',
    })}

    ${card({
      title: `Payroll register — ${MONTHS[month]} ${ACADEMIC_YEAR.year}`,
      actions: html`<button class="btn btn-sm" id="pay-csv">${icon('download')} CSV</button>`,
      flush: true,
      body: table(slips.slice(0, 60), [
        { key: 'name', label: 'Employee', render: (p) => html`<div class="cell-main">${p.staff.name}</div><div class="cell-sub mono">${p.staff.id} · ${p.staff.designation}</div>` },
        { key: 'basic', label: 'Basic', align: 'right', render: (p) => taka(p.staff.basic) },
        { key: 'gross', label: 'Gross', align: 'right', render: (p) => taka(p.gross) },
        { key: 'pf', label: 'PF', align: 'right', render: (p) => taka(p.pf) },
        { key: 'tax', label: 'Tax', align: 'right', render: (p) => taka(p.tax) },
        { key: 'net', label: 'Net', align: 'right', render: (p) => html`<strong>${taka(p.net)}</strong>` },
        {
          key: 'act', label: '', align: 'right',
          render: (p) => html`<button class="btn btn-sm" data-staff="${p.staff.id}">${icon('printer')}</button>`,
        },
      ], { compact: true }),
      foot: 'Showing the first 60 employees. Export for the full register.',
    })}`;
}

// ---------------------------------------------------------------------------
// Payslip document
// ---------------------------------------------------------------------------

function payslipDoc(staff) {
  const p = payslipFor(staff);
  const month = clock.today().getMonth();
  return html`
    <div class="doc">
      <div class="doc-head">
        <div class="doc-inst-bn bn">${INSTITUTION.nameBn}</div>
        <div class="doc-inst">${INSTITUTION.name}</div>
        <div class="doc-addr">${INSTITUTION.address}</div>
        <div class="doc-kind">Payslip — ${MONTHS[month]} ${ACADEMIC_YEAR.year}</div>
      </div>
      <table style="margin-bottom:12px">
        <tr><th style="width:24%">Employee</th><td>${staff.name}</td><th style="width:18%">Employee ID</th><td>${staff.id}</td></tr>
        <tr><th>Designation</th><td>${staff.designation}</td><th>Pay Grade</th><td>${staff.payGrade}</td></tr>
        <tr><th>Department</th><td>${staff.department} section</td><th>Joined</th><td>${fmtDate(staff.joinedOn, 'short')}</td></tr>
      </table>
      <table>
        <thead><tr><th>Earnings</th><th style="width:20%">Amount</th><th>Deductions</th><th style="width:20%">Amount</th></tr></thead>
        <tbody>
          ${p.lines.map((l, i) => html`
            <tr>
              <td>${l.name}</td><td style="text-align:right">${taka(l.amount)}</td>
              <td>${p.deductionLines[i]?.name || ''}</td>
              <td style="text-align:right">${p.deductionLines[i] ? taka(p.deductionLines[i].amount) : ''}</td>
            </tr>`)}
          <tr style="background:#f4f4f4;font-weight:700">
            <td>Gross</td><td style="text-align:right">${taka(p.gross)}</td>
            <td>Total Deductions</td><td style="text-align:right">${taka(p.deductions)}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:13px;margin-top:12px;font-weight:700">
        Net Payable: ${taka(p.net)} <span class="bn" style="font-weight:400">(${toBn(p.net)} টাকা)</span>
      </p>
      <div class="doc-sign">
        <div>Employee</div>
        <div>Accounts</div>
        <div>Principal</div>
      </div>
      <div class="doc-watermark">Generated ${fmtDate(clock.today())} — computer-generated payslip, valid without signature.</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'directory', label: 'Staff Directory' },
  { id: 'payroll', label: 'Payroll' },
];

export default {
  id: 'hr',
  aliases: ['staff'],
  title: 'HR & Payroll',
  module: 'hr',

  render(ctx) {
    if (ctx.query.tab) state.tab = ctx.query.tab;
    if (ctx.id === 'staff' && ctx.params[0]) state.staffId = ctx.params[0];
    return {
      title: 'HR & Payroll',
      sub: 'Staff records, pay grades, and monthly payroll. Ships switched off by default (§4).',
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${state.tab === 'payroll' ? payroll() : directory()}`,
    };
  },

  mount(root, ctx) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));

    const q = root.querySelector('#hr-q');
    if (q) {
      let timer;
      q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = q.value;
          window.ERP.repaint();
          document.querySelector('#hr-q')?.focus();
        }, 200);
      });
    }

    root.querySelector('#hr-desig')?.addEventListener('change', (e) => {
      state.designation = e.target.value;
      window.ERP.repaint();
    });

    const openPayslip = (id) => {
      const staff = staffById(id);
      if (!staff) return;
      modal({
        title: `Payslip — ${staff.name}`,
        size: 'wide',
        body: payslipDoc(staff),
        foot: html`
          <button class="btn" data-close>Close</button>
          <button class="btn btn-primary" id="print-doc">${icon('printer')} Print</button>`,
        onMount: (el) => el.querySelector('#print-doc').addEventListener('click', () => window.print()),
      });
    };

    root.querySelectorAll('[data-staff]').forEach((b) =>
      b.addEventListener('click', () => openPayslip(b.dataset.staff)));

    if (ctx.id === 'staff' && ctx.params[0]) {
      setTimeout(() => openPayslip(ctx.params[0]), 60);
    }

    root.querySelector('#hr-csv')?.addEventListener('click', () => {
      downloadFile('staff-directory.csv', toCsv(allStaff(), [
        { label: 'Employee ID', value: (s) => s.id },
        { label: 'Name', value: (s) => s.name },
        { label: 'Designation', value: (s) => s.designation },
        { label: 'Pay Grade', value: (s) => s.payGrade },
        { label: 'Department', value: (s) => s.department },
        { label: 'Roles', value: (s) => s.roles.join('; ') },
        { label: 'Joined', value: (s) => s.joinedOn },
        { label: 'Basic', value: (s) => s.basic },
        { label: 'Phone', value: (s) => s.phone },
        { label: 'Email', value: (s) => s.email },
        { label: 'Status', value: (s) => s.status },
      ]), 'text/csv');
      toast('Directory exported');
    });

    root.querySelector('#pay-csv')?.addEventListener('click', () => {
      const slips = allStaff().map(payslipFor);
      downloadFile(`payroll-${clock.todayIso()}.csv`, toCsv(slips, [
        { label: 'Employee ID', value: (p) => p.staff.id },
        { label: 'Name', value: (p) => p.staff.name },
        { label: 'Designation', value: (p) => p.staff.designation },
        { label: 'Basic', value: (p) => p.staff.basic },
        { label: 'Gross', value: (p) => p.gross },
        { label: 'Provident Fund', value: (p) => p.pf },
        { label: 'Income Tax', value: (p) => p.tax },
        { label: 'Net Payable', value: (p) => p.net },
      ]), 'text/csv');
      toast('Payroll register exported');
    });
  },
};
