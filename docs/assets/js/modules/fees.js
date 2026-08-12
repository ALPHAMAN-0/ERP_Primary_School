/**
 * Fees & Accounts (§11).
 *
 * V1 is deliberately manual: parents pay at the office and the Accountant logs
 * it. The gateway seam exists — `PAYMENT_METHODS` below is where bKash, Nagad
 * or a card processor would slot in — but nothing is wired to a real provider,
 * because transaction fees have not been researched yet and a half-wired
 * gateway is worse than none.
 */

import {
  html, icon, card, table, badge, avatar, emptyState, toast, progressBar, modal, closeModal,
  barChart, downloadFile, toCsv, seriesColor, legend, stackBar,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as clock from '../core/clock.js';
import * as auth from '../core/auth.js';
import * as an from '../core/analytics.js';
import { allStudents, studentById } from '../core/data.js';
import { taka, fmtDate, toBn, lateFine, WAIVERS, MONTHS, MONTHS_BN } from '../core/domain.js';
import { GRADES, FEE_HEADS, TUITION_BY_LEVEL, INSTITUTION, ACADEMIC_YEAR } from '../core/spec.js';

/**
 * Payment channels. Only the first is active in v1; the rest are declared so
 * the receipt, ledger and reports already carry a method field (§11).
 */
const PAYMENT_METHODS = [
  { id: 'CASH', name: 'Cash at office', active: true },
  { id: 'CHEQUE', name: 'Cheque', active: true },
  { id: 'BANK', name: 'Bank deposit slip', active: true },
  { id: 'BKASH', name: 'bKash', active: false },
  { id: 'NAGAD', name: 'Nagad', active: false },
  { id: 'CARD', name: 'Card', active: false },
];

const state = { tab: 'collect', q: '', selectedId: null, gradeFilter: '' };

// ---------------------------------------------------------------------------
// Collect
// ---------------------------------------------------------------------------

function collect() {
  const q = state.q.trim().toLowerCase();
  const matches = q
    ? allStudents().filter((s) =>
        s.id.includes(q) || s.name.toLowerCase().includes(q) || s.guardianPhone.includes(q)).slice(0, 8)
    : [];
  const selected = state.selectedId ? studentById(state.selectedId) : null;
  const ledger = selected ? an.studentLedger(selected) : null;
  const payments = selected ? store.getPayments(selected.id) : [];

  return html`
    <div class="grid g-sidebar">
      <div class="col" style="gap:14px">
        ${card({
          title: 'Find the student',
          sub: 'Search by student ID, name, or guardian phone',
          body: html`
            <div class="search-box">
              ${icon('search')}
              <input class="input" id="fee-q" placeholder="e.g. 26010042, Rakib, 01712…" value="${state.q}" autocomplete="off">
            </div>
            ${matches.length ? html`
              <div class="col mt-2" style="gap:5px">
                ${matches.map((s) => html`
                  <button class="persona-card" data-pick="${s.id}">
                    ${avatar(s.name, s.id, 'sm')}
                    <div style="flex:1;min-width:0">
                      <div class="persona-name truncate">${s.name}</div>
                      <div class="persona-desc">${s.gradeName} ${s.sectionName} · ${s.id}</div>
                    </div>
                    ${icon('chevronRight')}
                  </button>`)}
              </div>` : q ? html`<p class="hint mt-2">No student matches “${state.q}”.</p>` : ''}`,
        })}

        ${selected ? card({
          title: `Ledger — ${selected.name}`,
          sub: `${selected.gradeName} — ${selected.sectionName} · ID ${selected.id} · ${ledger.monthsBilled} month${ledger.monthsBilled === 1 ? '' : 's'} billed`,
          actions: html`<a class="btn btn-sm" href="#/student/${selected.id}">Profile</a>`,
          flush: true,
          body: html`
            ${table(ledger.lines, [
              { key: 'name', label: 'Particulars', render: (l) => (l.isDiscount ? html`<span style="color:var(--ok-ink)">${l.name}</span>` : l.name) },
              {
                key: 'amount', label: 'Amount', align: 'right',
                render: (l) => html`<span class="${l.isDiscount ? '' : 'num'}" style="${l.isDiscount ? 'color:var(--ok-ink)' : ''}">${taka(l.amount)}</span>`,
              },
            ], { compact: true })}
            <div class="card-body" style="border-top:1px solid var(--line)">
              <div class="row between mb-1"><span class="dim">Total billed</span><strong>${taka(ledger.billed)}</strong></div>
              <div class="row between mb-1"><span class="dim">Received</span><strong style="color:var(--ok-ink)">${taka(ledger.paid)}</strong></div>
              <div class="row between" style="font-size:16px">
                <span class="strong">Outstanding</span>
                <strong style="${ledger.due ? 'color:var(--critical-ink)' : ''}">${taka(ledger.due)}</strong>
              </div>
              ${ledger.monthsOverdue > 0 ? html`
                <div class="row mt-2" style="gap:8px">
                  ${badge(`${ledger.monthsOverdue} month${ledger.monthsOverdue === 1 ? '' : 's'} overdue`, 'warn', 'alert')}
                  ${lateFine(ledger.monthsOverdue) ? badge(`Late fine ${taka(lateFine(ledger.monthsOverdue))}`, 'bad') : ''}
                </div>` : ''}
              <div class="mt-3">${progressBar((ledger.paid / Math.max(1, ledger.billed)) * 100, ledger.due ? 'warn' : 'ok')}</div>
            </div>`,
          foot: ledger.due
            ? html`<button class="btn btn-primary btn-sm" id="open-collect">${icon('cash')} Collect payment</button>`
            : html`<span style="color:var(--ok-ink)">${icon('checkCircle')} Fully settled for the year to date.</span>`,
        }) : card({
          body: emptyState('search', 'No student selected',
            'Search above to open a fee ledger. Try a student ID like 2601, or a guardian phone number.'),
        })}
      </div>

      <div class="col" style="gap:14px">
        ${card({
          title: 'Fee structure',
          sub: `${ACADEMIC_YEAR.label}`,
          flush: true,
          body: table(FEE_HEADS.filter((h) => !h.module || auth.isModuleOn(h.module)), [
            { key: 'name', label: 'Head', render: (h) => html`<div class="cell-main">${h.name}</div><div class="cell-sub">${h.recurrence}</div>` },
            {
              key: 'amount', label: 'Amount', align: 'right',
              render: (h) => (h.byLevel
                ? html`<span class="xsmall muted">${taka(TUITION_BY_LEVEL[0])}–${taka(TUITION_BY_LEVEL[12])}<br>by class</span>`
                : h.byRoute ? html`<span class="xsmall muted">by route</span>` : taka(h.amount)),
            },
          ], { compact: true }),
        })}

        ${card({
          title: 'Payment channels',
          body: html`
            <div class="col" style="gap:8px">
              ${PAYMENT_METHODS.map((m) => html`
                <div class="row between">
                  <span class="small">${m.name}</span>
                  ${m.active ? badge('Active', 'ok') : badge('Not configured', 'outline')}
                </div>`)}
            </div>
            <p class="hint mt-3">
              V1 collects manually at the office (§11). The ledger, receipt and reports already carry
              a payment-method field, so switching a gateway on is a provider integration — not a
              schema change.
            </p>`,
        })}

        ${payments.length ? card({
          title: 'Receipts issued',
          flush: true,
          body: table(payments, [
            { key: 'id', label: 'No.', render: (p) => html`<span class="mono xsmall">${p.id}</span>` },
            { key: 'amount', label: 'Amount', align: 'right', render: (p) => taka(p.amount) },
            {
              key: 'act', label: '', align: 'right',
              render: (p) => html`<button class="btn btn-sm" data-receipt="${p.id}">${icon('printer')}</button>`,
            },
          ], { compact: true }),
        }) : ''}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Dues report
// ---------------------------------------------------------------------------

function dues() {
  const summary = an.feeSummary();
  const defaulters = an.topDefaulters(200);
  const filtered = state.gradeFilter ? defaulters.filter((l) => l.student.gradeId === state.gradeFilter) : defaulters;
  const byGrade = GRADES.map((g) => ({
    label: g.name.replace('Class ', ''),
    full: g.name,
    value: Math.round((summary.byGrade[g.id]?.due || 0) / 1000),
  }));

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Billed to date</div><div class="stat-value">${taka(summary.billed)}</div></div>
      <div class="stat"><div class="stat-label">Collected</div><div class="stat-value" style="color:var(--ok-ink)">${taka(summary.collected)}</div>
        <div class="stat-meta">${summary.collectionRate.toFixed(1)}% collection rate</div></div>
      <div class="stat"><div class="stat-label">Outstanding</div><div class="stat-value" style="color:var(--critical-ink)">${taka(summary.due)}</div></div>
      <div class="stat"><div class="stat-label">Students overdue</div><div class="stat-value">${summary.overdueStudents.toLocaleString()}</div>
        <div class="stat-meta">of ${allStudents().length.toLocaleString()}</div></div>
    </div>

    ${card({
      title: 'Outstanding by class',
      sub: 'Thousands of taka',
      body: html`
        ${barChart(byGrade, { height: 185, valueFormat: (v) => `${v}k`, color: 'var(--series-2)', barLabel: false })}
        <p class="xsmall muted mt-2">
          Senior classes carry more because tuition rises with level and exam fees accumulate —
          not because those families pay less reliably.
        </p>`,
      cls: 'mb-3',
    })}

    ${card({
      title: 'Dues register',
      sub: `${filtered.length} student${filtered.length === 1 ? '' : 's'} with an outstanding balance`,
      actions: html`
        <select class="select" id="d-grade" style="width:auto">
          <option value="">All classes</option>
          ${GRADES.map((g) => html`<option value="${g.id}" ${state.gradeFilter === g.id ? 'selected' : ''}>${g.name}</option>`)}
        </select>
        <button class="btn btn-sm" id="dues-csv">${icon('download')} CSV</button>`,
      flush: true,
      body: table(filtered.slice(0, 60), [
        {
          key: 'name', label: 'Student',
          render: (l) => html`
            <a class="row" href="#/student/${l.student.id}" style="gap:8px;color:inherit">
              ${avatar(l.student.name, l.student.id, 'sm')}
              <div style="min-width:0">
                <div class="cell-main truncate">${l.student.name}</div>
                <div class="cell-sub mono">${l.student.id}</div>
              </div>
            </a>`,
        },
        { key: 'class', label: 'Class', render: (l) => `${l.student.gradeName} ${l.student.sectionName}` },
        { key: 'guardian', label: 'Guardian', render: (l) => html`<div class="cell-main truncate">${l.student.father}</div><div class="cell-sub mono">${l.student.guardianPhone}</div>` },
        { key: 'billed', label: 'Billed', align: 'right', render: (l) => taka(l.billed) },
        { key: 'paid', label: 'Paid', align: 'right', render: (l) => taka(l.paid) },
        { key: 'due', label: 'Due', align: 'right', render: (l) => html`<strong style="color:var(--critical-ink)">${taka(l.due)}</strong>` },
        { key: 'months', label: 'Overdue', align: 'center', render: (l) => badge(`${l.monthsOverdue} mo`, l.monthsOverdue > 3 ? 'bad' : 'warn') },
        {
          key: 'act', label: '', align: 'right',
          render: (l) => html`<button class="btn btn-sm" data-collect-for="${l.student.id}">Collect</button>`,
        },
      ], { compact: true }),
      foot: 'Showing the 60 largest balances. Export for the full register.',
    })}`;
}

// ---------------------------------------------------------------------------
// Receipt (§13 — Bangla-capable document)
// ---------------------------------------------------------------------------

function receiptDoc(payment, student) {
  const d = new Date(payment.at);
  return html`
    <div class="doc">
      <div class="doc-head">
        <div class="doc-inst-bn bn">${INSTITUTION.nameBn}</div>
        <div class="doc-inst">${INSTITUTION.name}</div>
        <div class="doc-addr">${INSTITUTION.address} · ${INSTITUTION.phone}</div>
        <div class="doc-kind">Money Receipt / রসিদ</div>
      </div>
      <table>
        <tr><th style="width:26%">Receipt No.</th><td>${payment.id}</td><th style="width:18%">Date</th><td>${fmtDate(d)}</td></tr>
        <tr><th>Student</th><td>${student.name}<div class="bn">${student.nameBn}</div></td><th>Student ID</th><td>${student.id}</td></tr>
        <tr><th>Class</th><td>${student.gradeName} — ${student.sectionName}</td><th>Roll</th><td>${student.roll}</td></tr>
        <tr><th>Guardian</th><td colspan="3">${student.father} · ${student.guardianPhone}</td></tr>
      </table>
      <table style="margin-top:10px">
        <thead><tr><th>Particulars / বিবরণ</th><th style="width:26%">Amount</th></tr></thead>
        <tbody>
          <tr><td>${payment.particulars || 'Fee payment'}</td><td style="text-align:right">${taka(payment.amount)}</td></tr>
          <tr style="background:#f4f4f4;font-weight:700">
            <td>Total received</td>
            <td style="text-align:right">${taka(payment.amount)}</td>
          </tr>
        </tbody>
      </table>
      <p style="font-size:11.5px;margin-top:10px">
        Received with thanks the sum of <strong>${taka(payment.amount)}</strong>
        (<span class="bn">${toBn(payment.amount)} টাকা</span>) by <strong>${PAYMENT_METHODS.find((m) => m.id === payment.method)?.name || payment.method}</strong>.
      </p>
      <div class="doc-sign">
        <div>Payer's Signature</div>
        <div>Accountant</div>
      </div>
      <div class="doc-watermark">
        Computer-generated receipt · ${fmtDate(d)} · ${fmtDate(d, 'bn')} — valid without a seal.
      </div>
    </div>`;
}

function openCollectModal(student) {
  const ledger = an.studentLedger(student);
  modal({
    title: `Collect payment — ${student.name}`,
    body: html`
      <div class="row mb-3" style="gap:12px;align-items:center">
        ${avatar(student.name, student.id, 'lg')}
        <div>
          <div class="strong">${student.name}</div>
          <div class="small muted">${student.gradeName} — ${student.sectionName} · ${student.id}</div>
          <div class="small">Outstanding <strong style="color:var(--critical-ink)">${taka(ledger.due)}</strong></div>
        </div>
      </div>
      <div class="form-grid" style="grid-template-columns:1fr 1fr">
        <div class="field">
          <label class="label" for="p-amount">Amount received<span class="req">*</span></label>
          <input class="input" type="number" id="p-amount" value="${ledger.due}" min="1" max="${ledger.due}">
          <div class="hint">Maximum ${taka(ledger.due)} — the outstanding balance.</div>
        </div>
        <div class="field">
          <label class="label" for="p-method">Method</label>
          <select class="select" id="p-method">
            ${PAYMENT_METHODS.map((m) => html`
              <option value="${m.id}" ${m.active ? '' : 'disabled'}>${m.name}${m.active ? '' : ' — not configured'}</option>`)}
          </select>
        </div>
        <div class="field" style="grid-column:span 2">
          <label class="label" for="p-note">Particulars</label>
          <input class="input" id="p-note" value="Tuition and exam fees, ${MONTHS[clock.today().getMonth()]} ${ACADEMIC_YEAR.year}">
        </div>
      </div>
      <p class="hint mt-2">
        The receipt number is issued on save and the ledger updates immediately.
      </p>`,
    foot: html`
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="p-save">${icon('check')} Record payment</button>`,
    onMount: (el) => {
      el.querySelector('#p-save').addEventListener('click', () => {
        const amount = Number(el.querySelector('#p-amount').value);
        if (!amount || amount <= 0 || amount > ledger.due) {
          toast('Check the amount', `Enter a value between ৳1 and ${taka(ledger.due)}.`, 'bad');
          return;
        }
        const payment = store.addPayment({
          studentId: student.id,
          amount,
          method: el.querySelector('#p-method').value,
          particulars: el.querySelector('#p-note').value,
        });
        closeModal();
        window.ERP.repaint();
        toast('Payment recorded', `Receipt ${payment.id} for ${taka(amount)}.`);
        setTimeout(() => openReceipt(payment, student), 250);
      });
    },
  });
}

function openReceipt(payment, student) {
  modal({
    title: `Receipt ${payment.id}`,
    size: 'wide',
    body: receiptDoc(payment, student),
    foot: html`
      <button class="btn" data-close>Close</button>
      <button class="btn btn-primary" id="print-doc">${icon('printer')} Print</button>`,
    onMount: (el) => el.querySelector('#print-doc').addEventListener('click', () => window.print()),
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'collect', label: 'Collect Fees' },
  { id: 'dues', label: 'Dues Report' },
];

export default {
  id: 'fees',
  aliases: ['invoice', 'fees-parent'],
  title: 'Fees & Accounts',
  module: 'fees',

  render(ctx) {
    if (ctx.query.tab) state.tab = ctx.query.tab;
    if (ctx.query.student) state.selectedId = ctx.query.student;

    return {
      title: 'Fees & Accounts',
      sub: 'Manual collection at the office, logged against a per-student ledger (§11).',
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${state.tab === 'dues' ? dues() : collect()}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));

    const q = root.querySelector('#fee-q');
    if (q) {
      let timer;
      q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = q.value;
          window.ERP.repaint();
          const next = document.querySelector('#fee-q');
          if (next) {
            next.focus();
            next.setSelectionRange(next.value.length, next.value.length);
          }
        }, 220);
      });
    }

    root.querySelectorAll('[data-pick]').forEach((b) =>
      b.addEventListener('click', () => {
        state.selectedId = b.dataset.pick;
        window.ERP.repaint();
      }));

    root.querySelector('#open-collect')?.addEventListener('click', () => {
      const student = studentById(state.selectedId);
      if (student) openCollectModal(student);
    });

    root.querySelectorAll('[data-collect-for]').forEach((b) =>
      b.addEventListener('click', () => {
        const student = studentById(b.dataset.collectFor);
        if (student) openCollectModal(student);
      }));

    root.querySelectorAll('[data-receipt]').forEach((b) =>
      b.addEventListener('click', () => {
        const payment = store.getPayments().find((p) => p.id === b.dataset.receipt);
        const student = studentById(payment?.studentId);
        if (payment && student) openReceipt(payment, student);
      }));

    root.querySelector('#d-grade')?.addEventListener('change', (e) => {
      state.gradeFilter = e.target.value;
      window.ERP.repaint();
    });

    root.querySelector('#dues-csv')?.addEventListener('click', () => {
      const rows = an.topDefaulters(3000);
      downloadFile(`dues-${clock.todayIso()}.csv`, toCsv(rows, [
        { label: 'Student ID', value: (l) => l.student.id },
        { label: 'Name', value: (l) => l.student.name },
        { label: 'Class', value: (l) => l.student.gradeName },
        { label: 'Section', value: (l) => l.student.sectionName },
        { label: 'Guardian', value: (l) => l.student.father },
        { label: 'Phone', value: (l) => l.student.guardianPhone },
        { label: 'Billed', value: (l) => l.billed },
        { label: 'Paid', value: (l) => l.paid },
        { label: 'Due', value: (l) => l.due },
        { label: 'Months Overdue', value: (l) => l.monthsOverdue },
      ]), 'text/csv');
      toast('Dues register exported', `${rows.length.toLocaleString()} students.`);
    });
  },
};
