/**
 * Student directory and profile (§8 identity, §10 guardians).
 *
 * The directory filters and paginates over the full 3,000+ roster in the
 * browser. Because the roster is derived rather than fetched, filtering is a
 * synchronous array pass — no spinner, no request.
 */

import {
  html, icon, card, table, badge, avatar, gradePill, pager, emptyState, toast,
  progressBar, downloadFile, toCsv, modal, closeModal, barChart, legend, seriesColor,
} from '../core/ui.js';
import * as router from '../core/router.js';
import * as clock from '../core/clock.js';
import * as store from '../core/store.js';
import * as auth from '../core/auth.js';
import * as an from '../core/analytics.js';
import {
  allStudents, studentById, familyOf, attendanceSummary, marksFor, routineFor, classTeacherFor,
} from '../core/data.js';
import {
  taka, fmtDate, ageFrom, summariseAttendance, computeResult, eligibilityStatus,
  parseStudentId, MONTHS, WAIVERS,
} from '../core/domain.js';
import { GRADES, GROUPS, CLASS_LIST, EXAM_TERMS, sectionsFor, ACADEMIC_YEAR, WEEKDAYS } from '../core/spec.js';
import { activeLoans, isOverdue } from '../core/facilities.js';
import { reportCardDoc } from './exams.js';

const PAGE_SIZE = 25;

const state = {
  q: '',
  grade: '',
  section: '',
  group: '',
  gender: '',
  status: 'Active',
  page: 1,
  sortKey: 'roll',
  sortDir: 'asc',
};

function applyFilters() {
  const q = state.q.trim().toLowerCase();
  let rows = allStudents();

  if (state.grade) rows = rows.filter((s) => s.gradeId === state.grade);
  if (state.section) rows = rows.filter((s) => s.sectionId === state.section);
  if (state.group) rows = rows.filter((s) => s.groupId === state.group);
  if (state.gender) rows = rows.filter((s) => s.gender === state.gender);
  if (state.status) rows = rows.filter((s) => s.status === state.status);
  if (q) {
    rows = rows.filter((s) =>
      s.id.includes(q) ||
      s.name.toLowerCase().includes(q) ||
      s.father.toLowerCase().includes(q) ||
      s.guardianPhone.includes(q) ||
      s.area.toLowerCase().includes(q));
  }

  const dir = state.sortDir === 'asc' ? 1 : -1;
  rows = rows.slice().sort((a, b) => {
    const k = state.sortKey;
    if (k === 'roll') {
      // Roll is only meaningful within a class, so sort by class first.
      const ca = `${String(a.level).padStart(2, '0')}${a.sectionId}`;
      const cb = `${String(b.level).padStart(2, '0')}${b.sectionId}`;
      if (ca !== cb) return ca < cb ? -dir : dir;
      return (a.roll - b.roll) * dir;
    }
    const va = a[k];
    const vb = b[k];
    if (typeof va === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

function directory() {
  const rows = applyFilters();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const pageRows = rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
  const sections = state.grade ? sectionsFor(state.grade) : [];

  return html`
    <div class="card mb-3">
      <div class="card-body" style="padding:12px 14px">
        <div class="row wrap" style="gap:9px">
          <div class="search-box" style="flex:1;min-width:210px">
            ${icon('search')}
            <input class="input" id="f-q" placeholder="Name, student ID, guardian, phone, or area…" value="${state.q}">
          </div>
          <select class="select" id="f-grade" style="width:auto">
            <option value="">All classes</option>
            ${GRADES.map((g) => html`<option value="${g.id}" ${state.grade === g.id ? 'selected' : ''}>${g.name}</option>`)}
          </select>
          ${sections.length ? html`
            <select class="select" id="f-section" style="width:auto">
              <option value="">All sections</option>
              ${sections.map((s) => html`<option value="${s.id}" ${state.section === s.id ? 'selected' : ''}>${s.name}</option>`)}
            </select>` : ''}
          <select class="select" id="f-group" style="width:auto">
            <option value="">All groups</option>
            ${GROUPS.map((g) => html`<option value="${g.id}" ${state.group === g.id ? 'selected' : ''}>${g.name}</option>`)}
          </select>
          <select class="select" id="f-gender" style="width:auto">
            <option value="">Any gender</option>
            <option value="Male" ${state.gender === 'Male' ? 'selected' : ''}>Male</option>
            <option value="Female" ${state.gender === 'Female' ? 'selected' : ''}>Female</option>
          </select>
          ${state.q || state.grade || state.group || state.gender || state.section
            ? html`<button class="btn btn-sm" id="f-clear">${icon('x')} Clear</button>` : ''}
        </div>
        <div class="row between mt-2">
          <div class="small muted">
            <strong>${rows.length.toLocaleString()}</strong> of ${allStudents().length.toLocaleString()} students
            ${state.grade ? html`· filtered to ${GRADES.find((g) => g.id === state.grade)?.name}` : ''}
          </div>
          <button class="btn btn-sm" id="export-csv">${icon('download')} Export CSV</button>
        </div>
      </div>
    </div>

    ${card({
      flush: true,
      body: html`
        ${table(pageRows, [
          {
            key: 'name', label: 'Student', sortable: true,
            render: (s) => html`
              <div class="row" style="gap:9px">
                ${avatar(s.name, s.id, 'sm')}
                <div style="min-width:0">
                  <div class="cell-main truncate">${s.name}</div>
                  <div class="cell-sub bn truncate">${s.nameBn}</div>
                </div>
              </div>`,
          },
          { key: 'id', label: 'Student ID', sortable: true, render: (s) => html`<span class="mono">${s.id}</span>` },
          {
            key: 'class', label: 'Class',
            render: (s) => html`<div class="cell-main">${s.gradeName}</div><div class="cell-sub">${s.sectionName} · Roll ${s.roll}</div>`,
          },
          { key: 'group', label: 'Group', render: (s) => (s.groupId ? badge(GROUPS.find((g) => g.id === s.groupId)?.name || s.groupId, 'outline') : html`<span class="muted">—</span>`) },
          { key: 'father', label: 'Guardian', render: (s) => html`<div class="cell-main truncate">${s.father}</div><div class="cell-sub mono">${s.guardianPhone}</div>` },
          { key: 'gender', label: 'Gender', align: 'center', sortable: true },
          {
            key: 'act', label: '', align: 'right',
            render: (s) => html`<a class="btn btn-sm" href="#/student/${s.id}">Open</a>`,
          },
        ], {
          rowAttrs: (s) => `class="clickable" data-student="${s.id}"`,
          sortKey: state.sortKey, sortDir: state.sortDir,
          emptyMessage: 'No students match these filters',
        })}
        ${pager(state.page, totalPages)}`,
    })}`;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

function profile(student) {
  const t = clock.today();
  const summary = summariseAttendance(attendanceSummary(student, t));
  const status = eligibilityStatus(summary.percent);
  const family = familyOf(student);
  const siblings = family ? family.children.filter((c) => c.id !== student.id) : [];
  const ledger = an.studentLedger(student);
  const idParts = parseStudentId(student.id);
  const teacher = classTeacherFor(student.classKey);
  const loans = activeLoans(t).filter((l) => l.studentId === student.id);

  const termResults = EXAM_TERMS.filter((e) => !e.boardPrepOnly).map((term) => {
    const { subjects, marks } = marksFor(student, term.id);
    return { term, result: computeResult(subjects, marks) };
  });

  return html`
    <div class="grid g-sidebar mb-3">
      ${card({
        body: html`
          <div class="row" style="gap:16px;align-items:flex-start">
            ${avatar(student.name, student.id, 'xl')}
            <div style="flex:1;min-width:0">
              <div class="row wrap" style="gap:8px;align-items:baseline">
                <h2 style="font-size:19px;font-weight:660;letter-spacing:-.02em;margin:0">${student.name}</h2>
                ${badge(student.status, student.status === 'Active' ? 'ok' : 'outline')}
              </div>
              <div class="bn dim" style="font-size:15px">${student.nameBn}</div>
              <div class="row wrap mt-2" style="gap:7px">
                ${badge(student.gradeName, 'brand')}
                ${badge(`Section ${student.sectionName}`, 'outline')}
                ${badge(`Roll ${student.roll}`, 'outline')}
                ${student.groupId ? badge(GROUPS.find((g) => g.id === student.groupId)?.name, 'info') : ''}
                ${student.waiverId !== 'NONE' ? badge(WAIVERS.find((w) => w.id === student.waiverId)?.name, 'ok', 'award') : ''}
              </div>
              <hr class="divider">
              <dl class="dl">
                <dt>Student ID</dt><dd class="mono">${student.id}</dd>
                <dt>Admitted</dt><dd>${fmtDate(student.admittedOn)} ${idParts ? html`<span class="muted xsmall">· serial ${idParts.serial} of ${idParts.admittedLabel}</span>` : ''}</dd>
                <dt>Date of birth</dt><dd>${fmtDate(student.dob)} <span class="muted">(${ageFrom(student.dob, t)} years)</span></dd>
                <dt>Gender</dt><dd>${student.gender}</dd>
                <dt>Religion</dt><dd>${student.religion}</dd>
                <dt>Blood group</dt><dd>${student.bloodGroup}</dd>
                <dt>Class teacher</dt><dd>${teacher.name}</dd>
              </dl>
            </div>
          </div>`,
      })}
      <div class="col" style="gap:14px">
        <div class="grid g-2" style="gap:12px">
          <div class="stat">
            <div class="stat-label">Attendance</div>
            <div class="stat-value sm">${summary.percent.toFixed(1)}%</div>
            <div class="mt-1">${progressBar(summary.percent, status.tone)}</div>
            <div class="stat-meta">${badge(status.label, status.tone)}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Fees due</div>
            <div class="stat-value sm">${ledger.due === 0 ? '—' : taka(ledger.due)}</div>
            <div class="stat-meta">${ledger.due === 0 ? badge('Settled', 'ok') : badge(ledger.status, ledger.status === 'Overdue' ? 'bad' : 'warn')}</div>
          </div>
        </div>
        ${card({
          title: 'Guardians',
          sub: '§10 — one parent account, many children',
          body: html`
            <dl class="dl">
              <dt>Father</dt><dd>${student.father}<div class="xsmall muted">${student.fatherOccupation}</div></dd>
              <dt>Mother</dt><dd>${student.mother}<div class="xsmall muted">${student.motherOccupation}</div></dd>
              <dt>Phone</dt><dd class="mono">${student.guardianPhone}</dd>
              <dt>NID</dt><dd class="mono">${student.guardianNid}</dd>
              <dt>Address</dt><dd>${student.address}</dd>
            </dl>
            ${siblings.length ? html`
              <hr class="divider">
              <div class="label mb-1">Siblings enrolled</div>
              <div class="col" style="gap:6px">
                ${siblings.map((s) => html`
                  <a class="row" href="#/student/${s.id}" style="gap:8px;color:inherit">
                    ${avatar(s.name, s.id, 'sm')}
                    <div style="min-width:0">
                      <div class="cell-main truncate">${s.name}</div>
                      <div class="cell-sub">${s.gradeName} ${s.sectionName}</div>
                    </div>
                  </a>`)}
              </div>` : ''}`,
        })}
      </div>
    </div>

    <div class="grid g-split mb-3">
      ${card({
        title: 'Results by term',
        sub: 'Board GPA scale, maximum 5.00',
        flush: true,
        body: table(termResults, [
          { key: 'term', label: 'Examination', render: (r) => r.term.name },
          { key: 'total', label: 'Total', align: 'right', render: (r) => html`<span class="num">${r.result.totalMarks}/${r.result.totalFull}</span>` },
          { key: 'gpa', label: 'GPA', align: 'right', render: (r) => html`<strong>${r.result.passed ? r.result.gpa.toFixed(2) : '0.00'}</strong>` },
          { key: 'grade', label: 'Grade', align: 'center', render: (r) => (r.result.passed ? gradePill(r.result.letter) : badge('Failed', 'bad')) },
          {
            key: 'act', label: '', align: 'right',
            render: (r) => html`<button class="btn btn-sm" data-report="${r.term.id}">${icon('printer')} Report card</button>`,
          },
        ], { compact: true }),
      })}
      ${card({
        title: 'Attendance breakdown',
        sub: `${ACADEMIC_YEAR.label} to ${fmtDate(t, 'short')}`,
        body: html`
          ${barChart([
            { label: 'Present', value: summary.present - summary.late, color: 'var(--ok)' },
            { label: 'Late', value: summary.late, color: 'var(--warn)' },
            { label: 'Excused', value: summary.excused, color: 'var(--info)' },
            { label: 'Absent', value: summary.absent, color: 'var(--critical)' },
          ], { height: 170 })}
          <p class="xsmall muted mt-2">
            ${summary.total} records. Late counts as present for the eligibility percentage —
            the board measures presence, not punctuality (§6).
            ${summary.eligible ? '' : html` <strong>${summary.shortfall}</strong> more present days are needed to reach 70%.`}
          </p>`,
      })}
    </div>

    ${loans.length ? card({
      title: 'Library loans',
      flush: true,
      body: table(loans, [
        { key: 'book', label: 'Title', render: (l) => html`<div class="cell-main">${l.book.title}</div><div class="cell-sub">${l.book.author}</div>` },
        { key: 'issued', label: 'Issued', render: (l) => fmtDate(l.issuedOn, 'short') },
        { key: 'due', label: 'Due', render: (l) => html`${fmtDate(l.dueOn, 'short')} ${isOverdue(l, t) ? badge('Overdue', 'bad') : ''}` },
      ], { compact: true }),
    }) : ''}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default {
  id: 'students',
  aliases: ['student'],
  title: 'Students',
  module: 'students',

  render(ctx) {
    // Profile view: #/student/<id>
    if (ctx.id === 'student') {
      const student = studentById(ctx.params[0]);
      if (!student) {
        return {
          title: 'Student not found',
          body: html`<div class="card"><div class="card-body">
            ${emptyState('alert', 'No such student', `No record matches ID "${ctx.params[0] || ''}".`,
              html`<a class="btn btn-primary" href="#/students">Back to directory</a>`)}
          </div></div>`,
        };
      }
      return {
        title: student.name,
        sub: html`${student.gradeName} — ${student.sectionName} · Roll ${student.roll} · Student ID <span class="mono">${student.id}</span>`,
        actions: html`
          <a class="btn btn-sm" href="#/students">${icon('arrowLeft')} Directory</a>
          <button class="btn btn-sm" data-admit-card>${icon('file')} Admit card</button>
          ${auth.isAdmin() ? html`<button class="btn btn-sm btn-primary" data-edit>${icon('edit')} Edit</button>` : ''}`,
        body: profile(student),
      };
    }

    // Directory: honour ?class= from other screens.
    if (ctx.query.class) {
      const cls = CLASS_LIST.find((c) => c.key === ctx.query.class);
      if (cls) {
        state.grade = cls.gradeId;
        state.section = cls.sectionId;
        state.page = 1;
      }
    }

    return {
      title: 'Students',
      sub: `Every enrolled student across both sections. ${allStudents().length.toLocaleString()} records, filtered in the browser.`,
      actions: auth.isAdmin()
        ? html`<a class="btn btn-sm btn-primary" href="#/admissions">${icon('plus')} New admission</a>`
        : '',
      body: directory(),
    };
  },

  mount(root, ctx) {
    if (ctx.id === 'student') {
      const student = studentById(ctx.params[0]);
      if (!student) return;

      root.querySelectorAll('[data-report]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const term = EXAM_TERMS.find((e) => e.id === btn.dataset.report);
          modal({
            title: `Report card — ${term.name}`,
            size: 'wide',
            body: reportCardDoc(student, term),
            foot: html`
              <button class="btn" data-close>Close</button>
              <button class="btn btn-primary" id="print-doc">${icon('printer')} Print</button>`,
            onMount: (el) => el.querySelector('#print-doc').addEventListener('click', () => window.print()),
          });
        }));

      root.querySelector('[data-admit-card]')?.addEventListener('click', () => {
        modal({ title: 'Admit card', size: 'wide', body: admitCardDoc(student),
          foot: html`<button class="btn" data-close>Close</button><button class="btn btn-primary" id="print-doc">${icon('printer')} Print</button>`,
          onMount: (el) => el.querySelector('#print-doc').addEventListener('click', () => window.print()) });
      });

      root.querySelector('[data-edit]')?.addEventListener('click', () => openEditModal(student));
      return;
    }

    const rerender = () => window.ERP.repaint();

    const q = root.querySelector('#f-q');
    if (q) {
      let timer;
      q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = q.value;
          state.page = 1;
          rerender();
          document.querySelector('#f-q')?.focus();
        }, 200);
      });
    }

    const bindSelect = (sel, key, resetSection = false) => {
      root.querySelector(sel)?.addEventListener('change', (e) => {
        state[key] = e.target.value;
        if (resetSection) state.section = '';
        state.page = 1;
        rerender();
      });
    };
    bindSelect('#f-grade', 'grade', true);
    bindSelect('#f-section', 'section');
    bindSelect('#f-group', 'group');
    bindSelect('#f-gender', 'gender');

    root.querySelector('#f-clear')?.addEventListener('click', () => {
      Object.assign(state, { q: '', grade: '', section: '', group: '', gender: '', page: 1 });
      rerender();
    });

    root.querySelectorAll('[data-page]').forEach((btn) =>
      btn.addEventListener('click', () => {
        state.page = Number(btn.dataset.page);
        rerender();
      }));

    root.querySelectorAll('th[data-sort]').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        else { state.sortKey = key; state.sortDir = 'asc'; }
        rerender();
      }));

    root.querySelectorAll('tr[data-student]').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a,button')) return;
        router.navigate(`student/${tr.dataset.student}`);
      }));

    root.querySelector('#export-csv')?.addEventListener('click', () => {
      const rows = applyFilters();
      const csv = toCsv(rows, [
        { label: 'Student ID', value: (s) => s.id },
        { label: 'Name', value: (s) => s.name },
        { label: 'Name (Bangla)', value: (s) => s.nameBn },
        { label: 'Class', value: (s) => s.gradeName },
        { label: 'Section', value: (s) => s.sectionName },
        { label: 'Roll', value: (s) => s.roll },
        { label: 'Group', value: (s) => s.groupId || '' },
        { label: 'Gender', value: (s) => s.gender },
        { label: 'Date of Birth', value: (s) => s.dob },
        { label: 'Guardian', value: (s) => s.father },
        { label: 'Phone', value: (s) => s.guardianPhone },
        { label: 'Address', value: (s) => s.address },
        { label: 'Admitted On', value: (s) => s.admittedOn },
      ]);
      downloadFile(`students-${clock.todayIso()}.csv`, csv, 'text/csv');
      toast('Export ready', `${rows.length.toLocaleString()} rows written to CSV.`);
    });
  },
};

// ---------------------------------------------------------------------------
// Edit modal — writes land in the overlay, not the generated baseline
// ---------------------------------------------------------------------------

function openEditModal(student) {
  modal({
    title: `Edit — ${student.name}`,
    body: html`
      <div class="form-grid g-2" style="grid-template-columns:1fr 1fr">
        <div class="field"><label class="label">Name (English)</label><input class="input" id="e-name" value="${student.name}"></div>
        <div class="field"><label class="label">Name (Bangla)</label><input class="input bn" id="e-nameBn" value="${student.nameBn}"></div>
        <div class="field"><label class="label">Guardian phone</label><input class="input" id="e-phone" value="${student.guardianPhone}"></div>
        <div class="field"><label class="label">Blood group</label><input class="input" id="e-blood" value="${student.bloodGroup}"></div>
        <div class="field" style="grid-column:span 2"><label class="label">Address</label><input class="input" id="e-address" value="${student.address}"></div>
        <div class="field">
          <label class="label">Fee waiver</label>
          <select class="select" id="e-waiver">
            ${WAIVERS.map((w) => html`<option value="${w.id}" ${student.waiverId === w.id ? 'selected' : ''}>${w.name}${w.percent ? ` (${w.percent}%)` : ''}</option>`)}
          </select>
        </div>
        <div class="field">
          <label class="label">Status</label>
          <select class="select" id="e-status">
            ${['Active', 'Withdrawn', 'Graduated'].map((s) => html`<option ${student.status === s ? 'selected' : ''}>${s}</option>`)}
          </select>
        </div>
      </div>
      <p class="hint mt-2">
        The student ID is permanent and never reused, including after withdrawal or graduation (§8),
        so it cannot be edited.
      </p>`,
    foot: html`
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="save-student">Save changes</button>`,
    onMount: (el) => {
      el.querySelector('#save-student').addEventListener('click', () => {
        store.patch('student', student.id, {
          name: el.querySelector('#e-name').value.trim() || student.name,
          nameBn: el.querySelector('#e-nameBn').value.trim() || student.nameBn,
          guardianPhone: el.querySelector('#e-phone').value.trim(),
          bloodGroup: el.querySelector('#e-blood').value.trim(),
          address: el.querySelector('#e-address').value.trim(),
          waiverId: el.querySelector('#e-waiver').value,
          status: el.querySelector('#e-status').value,
        });
        closeModal();
        window.ERP.repaint();
        toast('Student updated', 'Changes are saved locally and override the generated record.');
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Admit card (§13 — Bangla-capable student document)
// ---------------------------------------------------------------------------

export function admitCardDoc(student) {
  const term = EXAM_TERMS[2];
  return html`
    <div class="doc">
      <div class="doc-head">
        <div class="doc-inst-bn bn">শাহজালাল স্কুল অ্যান্ড কলেজ</div>
        <div class="doc-inst">Shahjalal School &amp; College</div>
        <div class="doc-addr">Zindabazar, Sylhet 3100 · EIIN 132907</div>
        <div class="doc-kind">Admit Card — ${term.name} ${ACADEMIC_YEAR.year}</div>
      </div>
      <table>
        <tr><th style="width:26%">Student Name</th><td>${student.name}</td><th style="width:20%">Student ID</th><td>${student.id}</td></tr>
        <tr><th>নাম</th><td class="bn">${student.nameBn}</td><th>Roll</th><td>${student.roll}</td></tr>
        <tr><th>Class</th><td>${student.gradeName}</td><th>Section</th><td>${student.sectionName}</td></tr>
        <tr><th>Group</th><td>${student.groupId ? GROUPS.find((g) => g.id === student.groupId)?.name : 'N/A'}</td><th>Session</th><td>${ACADEMIC_YEAR.year}</td></tr>
        <tr><th>Father's Name</th><td colspan="3">${student.father}</td></tr>
        <tr><th>পিতার নাম</th><td colspan="3" class="bn">${student.fatherBn}</td></tr>
      </table>
      <p style="font-size:11px;margin-top:12px">
        <strong>Instructions:</strong> Candidates must bring this admit card to every examination hall.
        Mobile phones and calculators are prohibited. Arrive 30 minutes before the scheduled start.
      </p>
      <div class="doc-sign">
        <div>Student's Signature</div>
        <div>Class Teacher</div>
        <div>Principal</div>
      </div>
      <div class="doc-watermark">
        Generated by Shahjalal School &amp; College ERP on ${fmtDate(clock.today())} — no signature required if issued electronically.
      </div>
    </div>`;
}
