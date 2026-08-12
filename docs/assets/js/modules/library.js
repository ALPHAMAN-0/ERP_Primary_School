/**
 * Library — ships switched OFF by default (§4).
 *
 * Catalogue, issue/return, and overdue fines. Loans are the clearest example of
 * the overlay model: the baseline set of borrowed copies is derived, and every
 * issue or return you perform is stored as a delta on top of it.
 */

import {
  html, icon, card, table, badge, avatar, emptyState, toast, modal, closeModal,
  barChart, progressBar, downloadFile, toCsv,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as clock from '../core/clock.js';
import { allStudents, studentById } from '../core/data.js';
import { taka, fmtDate, daysBetween, parseDate, toIsoDate } from '../core/domain.js';
import { allBooks, activeLoans, fineFor, isOverdue, LIBRARY_POLICY } from '../core/facilities.js';

const state = { tab: 'catalogue', q: '', subject: '' };

function loanIndex() {
  const loans = activeLoans(clock.today());
  const byCopy = new Map(loans.map((l) => [l.copyId, l]));
  return { loans, byCopy };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

function catalogue() {
  const { byCopy } = loanIndex();
  const q = state.q.trim().toLowerCase();
  const subjects = [...new Set(allBooks().map((b) => b.subject))].sort();

  let books = allBooks();
  if (state.subject) books = books.filter((b) => b.subject === state.subject);
  if (q) books = books.filter((b) =>
    b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.isbn.includes(q));

  const rows = books.map((b) => {
    const out = b.copyIds.filter((c) => byCopy.has(c)).length;
    return { book: b, out, available: b.copies - out };
  });

  return html`
    <div class="card mb-3">
      <div class="card-body" style="padding:12px 14px">
        <div class="row wrap" style="gap:9px">
          <div class="search-box" style="flex:1;min-width:210px">
            ${icon('search')}
            <input class="input" id="lb-q" placeholder="Title, author, or ISBN…" value="${state.q}">
          </div>
          <select class="select" id="lb-subject" style="width:auto">
            <option value="">All subjects</option>
            ${subjects.map((s) => html`<option value="${s}" ${state.subject === s ? 'selected' : ''}>${s}</option>`)}
          </select>
        </div>
      </div>
    </div>

    ${card({
      title: 'Catalogue',
      sub: `${rows.length} title${rows.length === 1 ? '' : 's'} · ${rows.reduce((s, r) => s + r.book.copies, 0)} copies`,
      flush: true,
      body: table(rows, [
        {
          key: 'title', label: 'Title',
          render: (r) => html`
            <div class="cell-main">${r.book.title}</div>
            <div class="cell-sub">${r.book.author} · ${r.book.publisher}, ${r.book.year}</div>`,
        },
        { key: 'subject', label: 'Subject', render: (r) => badge(r.book.subject, 'outline') },
        { key: 'shelf', label: 'Shelf', align: 'center', render: (r) => html`<span class="mono">${r.book.shelf}</span>` },
        { key: 'isbn', label: 'ISBN', render: (r) => html`<span class="mono xsmall">${r.book.isbn}</span>` },
        {
          key: 'avail', label: 'Available', align: 'center',
          render: (r) => html`
            <div class="row" style="gap:7px;justify-content:center">
              <span class="num">${r.available}/${r.book.copies}</span>
              ${r.available === 0 ? badge('All out', 'warn') : ''}
            </div>`,
        },
        {
          key: 'act', label: '', align: 'right',
          render: (r) => (r.available > 0
            ? html`<button class="btn btn-sm btn-primary" data-issue="${r.book.id}">Issue</button>`
            : html`<button class="btn btn-sm" disabled>Issue</button>`),
        },
      ], { compact: true, emptyMessage: 'No titles match this search' }),
    })}`;
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

function loansView() {
  const t = clock.today();
  const { loans } = loanIndex();
  const overdue = loans.filter((l) => isOverdue(l, t));
  const dueSoon = loans.filter((l) => {
    const days = daysBetween(t, l.dueOn);
    return days >= 0 && days <= 3;
  });
  const fines = overdue.reduce((s, l) => s + fineFor(l, t), 0);

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">On loan</div><div class="stat-value">${loans.length}</div></div>
      <div class="stat"><div class="stat-label">Overdue</div><div class="stat-value" style="color:var(--critical-ink)">${overdue.length}</div>
        <div class="mt-1">${progressBar((overdue.length / Math.max(1, loans.length)) * 100, 'bad')}</div></div>
      <div class="stat"><div class="stat-label">Due within 3 days</div><div class="stat-value">${dueSoon.length}</div></div>
      <div class="stat"><div class="stat-label">Fines accrued</div><div class="stat-value">${taka(fines)}</div>
        <div class="stat-meta">৳${LIBRARY_POLICY.finePerDay}/day per book</div></div>
    </div>

    ${card({
      title: 'Active loans',
      sub: `${LIBRARY_POLICY.loanDays}-day loan period · maximum ${LIBRARY_POLICY.maxBooks} books per student`,
      actions: html`<button class="btn btn-sm" id="loans-csv">${icon('download')} CSV</button>`,
      flush: true,
      body: table(loans.slice().sort((a, b) => parseDate(a.dueOn) - parseDate(b.dueOn)).slice(0, 80), [
        { key: 'title', label: 'Title', render: (l) => html`<div class="cell-main truncate">${l.book.title}</div><div class="cell-sub mono">${l.copyId}</div>` },
        {
          key: 'borrower', label: 'Borrower',
          render: (l) => html`
            <a class="row" href="#/student/${l.studentId}" style="gap:8px;color:inherit">
              ${avatar(l.studentName, l.studentId, 'sm')}
              <div style="min-width:0"><div class="cell-main truncate">${l.studentName}</div>
              <div class="cell-sub mono">${l.studentId}</div></div>
            </a>`,
        },
        { key: 'issued', label: 'Issued', render: (l) => fmtDate(l.issuedOn, 'short') },
        {
          key: 'due', label: 'Due', render: (l) => html`
            ${fmtDate(l.dueOn, 'short')}
            ${isOverdue(l, t) ? badge(`${daysBetween(l.dueOn, t)}d late`, 'bad') : ''}`,
        },
        {
          key: 'fine', label: 'Fine', align: 'right',
          render: (l) => {
            const f = fineFor(l, t);
            return f ? html`<strong style="color:var(--critical-ink)">${taka(f)}</strong>` : html`<span class="muted">—</span>`;
          },
        },
        {
          key: 'act', label: '', align: 'right',
          render: (l) => html`<button class="btn btn-sm" data-return="${l.copyId}">Return</button>`,
        },
      ], { compact: true, emptyMessage: 'No books are currently on loan' }),
    })}`;
}

// ---------------------------------------------------------------------------
// Issue flow
// ---------------------------------------------------------------------------

function openIssue(book) {
  const { byCopy } = loanIndex();
  const freeCopy = book.copyIds.find((c) => !byCopy.has(c));

  modal({
    title: `Issue — ${book.title}`,
    body: html`
      <div class="row mb-3" style="gap:12px">
        <div class="mod-icon" style="width:44px;height:44px">${icon('book')}</div>
        <div>
          <div class="strong">${book.title}</div>
          <div class="small muted">${book.author} · ${book.publisher}, ${book.year}</div>
          <div class="xsmall mono muted">Copy ${freeCopy} · Shelf ${book.shelf}</div>
        </div>
      </div>
      <div class="field">
        <label class="label" for="i-student">Borrower<span class="req">*</span></label>
        <div class="search-box">
          ${icon('search')}
          <input class="input" id="i-student" placeholder="Student ID or name…" autocomplete="off">
        </div>
        <div class="hint">Loans run ${LIBRARY_POLICY.loanDays} days. Overdue fines are ৳${LIBRARY_POLICY.finePerDay} per day.</div>
      </div>
      <div id="i-results" class="col mt-2" style="gap:5px"></div>
      <div id="i-picked" class="mt-2"></div>`,
    foot: html`
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="i-confirm" disabled>${icon('check')} Issue book</button>`,
    onMount: (el) => {
      let picked = null;
      const input = el.querySelector('#i-student');
      const results = el.querySelector('#i-results');
      const confirm = el.querySelector('#i-confirm');

      input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        if (q.length < 2) {
          results.innerHTML = '';
          return;
        }
        const matches = allStudents()
          .filter((s) => s.id.includes(q) || s.name.toLowerCase().includes(q))
          .slice(0, 5);
        results.innerHTML = matches.map((s) => `
          <button class="persona-card" data-pick="${s.id}">
            <div style="flex:1;min-width:0">
              <div class="persona-name">${s.name}</div>
              <div class="persona-desc">${s.gradeName} ${s.sectionName} · ${s.id}</div>
            </div>
          </button>`).join('');
        results.querySelectorAll('[data-pick]').forEach((b) =>
          b.addEventListener('click', () => {
            picked = studentById(b.dataset.pick);
            input.value = picked.name;
            results.innerHTML = '';
            el.querySelector('#i-picked').innerHTML =
              `<div class="badge badge-ok">Borrower: ${picked.name} (${picked.id})</div>`;
            confirm.disabled = false;
          }));
      });

      confirm.addEventListener('click', () => {
        if (!picked || !freeCopy) return;
        const issued = clock.today();
        const due = new Date(issued);
        due.setDate(due.getDate() + LIBRARY_POLICY.loanDays);
        store.setLoan(freeCopy, {
          studentId: picked.id,
          studentName: picked.name,
          classKey: picked.classKey,
          issuedOn: toIsoDate(issued),
          dueOn: toIsoDate(due),
        });
        closeModal();
        window.ERP.repaint();
        toast('Book issued', `${book.title} → ${picked.name}, due ${fmtDate(due, 'short')}.`);
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'loans', label: 'Loans & Overdue' },
];

export default {
  id: 'library',
  title: 'Library',
  module: 'library',

  render() {
    return {
      title: 'Library',
      sub: 'Catalogue, circulation, and fines. Ships switched off by default (§4).',
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${state.tab === 'loans' ? loansView() : catalogue()}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));

    const q = root.querySelector('#lb-q');
    if (q) {
      let timer;
      q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = q.value;
          window.ERP.repaint();
          document.querySelector('#lb-q')?.focus();
        }, 200);
      });
    }

    root.querySelector('#lb-subject')?.addEventListener('change', (e) => {
      state.subject = e.target.value;
      window.ERP.repaint();
    });

    root.querySelectorAll('[data-issue]').forEach((b) =>
      b.addEventListener('click', () => {
        const book = allBooks().find((x) => x.id === b.dataset.issue);
        if (book) openIssue(book);
      }));

    root.querySelectorAll('[data-return]').forEach((b) =>
      b.addEventListener('click', () => {
        const copyId = b.dataset.return;
        const loan = activeLoans(clock.today()).find((l) => l.copyId === copyId);
        const fine = loan ? fineFor(loan, clock.today()) : 0;
        store.setLoan(copyId, null);
        window.ERP.repaint();
        toast('Book returned', fine ? `Fine of ${taka(fine)} payable at the accounts office.` : 'Returned on time.',
          fine ? 'warn' : 'ok');
      }));

    root.querySelector('#loans-csv')?.addEventListener('click', () => {
      const t = clock.today();
      const loans = activeLoans(t);
      downloadFile(`library-loans-${clock.todayIso()}.csv`, toCsv(loans, [
        { label: 'Copy', value: (l) => l.copyId },
        { label: 'Title', value: (l) => l.book.title },
        { label: 'Student ID', value: (l) => l.studentId },
        { label: 'Student', value: (l) => l.studentName },
        { label: 'Issued', value: (l) => l.issuedOn },
        { label: 'Due', value: (l) => l.dueOn },
        { label: 'Fine', value: (l) => fineFor(l, t) },
      ]), 'text/csv');
      toast('Loan register exported');
    });
  },
};
