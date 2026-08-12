/**
 * Notices & Communication (§12).
 *
 * Two channels, deliberately asymmetric:
 *   Email — real, abstracted behind a notification service so the provider is a
 *           config change (Gmail SMTP in dev, Brevo's free tier in production).
 *   SMS   — scaffolded only. The queue, the audience calculation, and the admin
 *           toggle all exist; no paid gateway is wired. At ~0.30 BDT a message
 *           and 3,000+ students, that is a recurring cost with no free tier, so
 *           it was deferred rather than half-built.
 *
 * The queue below shows exactly what *would* be sent, including the cost — which
 * is the information needed to decide whether to buy the gateway.
 */

import {
  html, icon, card, table, badge, emptyState, toast, modal, closeModal, avatar, progressBar,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as clock from '../core/clock.js';
import * as auth from '../core/auth.js';
import { allStudents, allStaff } from '../core/data.js';
import { taka, fmtDate, MONTHS } from '../core/domain.js';
import { NOTIFICATION_CHANNELS, GRADES, ACADEMIC_YEAR, INSTITUTION } from '../core/spec.js';

/** Seed notices — the board is never empty on first open. */
export const NOTICES_SEED = [
  {
    id: 'N-seed-1', title: 'Half-Yearly Examination results published',
    body: 'Tabulation sheets for all classes are now available with class teachers. Report cards may be collected from the office between 10:00 and 13:00. Guardians wishing to discuss a result should book a slot with the class teacher.',
    audience: 'All students and guardians', date: `${ACADEMIC_YEAR.year}-07-22`, priority: 'normal', pinned: true, channels: ['email'],
  },
  {
    id: 'N-seed-2', title: 'Class 10 & 12 Test Examination schedule',
    body: 'The Test Examination begins on 15 September. Candidates below 70% attendance will not be forwarded to the board and should meet the Examination Controller immediately.',
    audience: 'Class 10, Class 12', date: `${ACADEMIC_YEAR.year}-08-30`, priority: 'urgent', pinned: true, channels: ['email', 'sms'],
  },
  {
    id: 'N-seed-3', title: 'Monthly tuition — August',
    body: 'August tuition is payable at the accounts office by the 10th. A late fine of ৳20 per month applies thereafter, capped at ৳200.',
    audience: 'All guardians', date: `${ACADEMIC_YEAR.year}-08-01`, priority: 'normal', channels: ['email'],
  },
  {
    id: 'N-seed-4', title: 'National Mourning Day observance',
    body: 'The institution will remain closed on 15 August. A discussion meeting and doa mahfil will be held on 16 August at 11:00 in the auditorium.',
    audience: 'All', date: `${ACADEMIC_YEAR.year}-08-11`, priority: 'normal', channels: ['email'],
  },
  {
    id: 'N-seed-5', title: 'Science fair registration open',
    body: 'Registration for the annual science fair is open to Classes 6–12. Submit project abstracts to the Physics department by 20 September.',
    audience: 'Class 6–12', date: `${ACADEMIC_YEAR.year}-08-05`, priority: 'normal', channels: ['email'],
  },
  {
    id: 'N-seed-6', title: 'Library return drive',
    body: 'All overdue books must be returned by 25 August. Fines accrue at ৳2 per day per book and are settled at the accounts office.',
    audience: 'All students', date: `${ACADEMIC_YEAR.year}-07-30`, priority: 'normal', channels: ['email'],
  },
];

const AUDIENCES = [
  { id: 'all', name: 'Everyone (students, guardians, staff)' },
  { id: 'guardians', name: 'All guardians' },
  { id: 'students', name: 'All students' },
  { id: 'staff', name: 'All staff' },
  { id: 'class', name: 'A specific class' },
];

const state = { tab: 'board' };

function allNotices() {
  return [...store.getNotices(), ...NOTICES_SEED];
}

/** How many recipients an audience resolves to — drives the SMS cost estimate. */
function audienceSize(audienceId, gradeId) {
  const students = allStudents();
  switch (audienceId) {
    case 'students': return students.length;
    case 'guardians': return new Set(students.map((s) => s.guardianPhone)).size;
    case 'staff': return allStaff().length;
    case 'class': return students.filter((s) => s.gradeId === gradeId).length;
    default: return students.length + new Set(students.map((s) => s.guardianPhone)).size + allStaff().length;
  }
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

function board() {
  const notices = allNotices();
  const pinned = notices.filter((n) => n.pinned);
  const rest = notices.filter((n) => !n.pinned);

  return html`
    <div class="grid g-sidebar">
      <div class="col" style="gap:12px">
        ${pinned.length ? html`<div class="label">Pinned</div>` : ''}
        ${pinned.map(noticeCard)}
        ${rest.length ? html`<div class="label mt-2">Recent</div>` : ''}
        ${rest.map(noticeCard)}
        ${notices.length ? '' : emptyState('megaphone', 'No notices', 'Nothing has been published yet.')}
      </div>

      <div class="col" style="gap:14px">
        ${card({
          title: 'Delivery channels',
          sub: 'How a published notice reaches people (§12)',
          body: html`
            <div class="col" style="gap:12px">
              ${NOTIFICATION_CHANNELS.map((ch) => html`
                <div>
                  <div class="row between">
                    <span class="strong">${ch.name}</span>
                    ${ch.status === 'active'
                      ? badge('Active', 'ok', 'checkCircle')
                      : badge('Gateway: Not Configured', 'warn', 'alert')}
                  </div>
                  <div class="xsmall muted mt-1">${ch.note}</div>
                  ${ch.provider ? html`<div class="xsmall mt-1">Provider: <strong>${ch.provider}</strong> · cap ${ch.dailyCap}/day</div>` : ''}
                  ${ch.unitCostBdt ? html`<div class="xsmall mt-1">Estimated cost: <strong>৳${ch.unitCostBdt}</strong> per message</div>` : ''}
                </div>`)}
            </div>
            <hr class="divider">
            <p class="hint">
              Email goes through an abstracted notification service, so moving from Gmail SMTP to
              Brevo is a configuration change rather than a rewrite. SMS is queued but never sent —
              see the Queue tab for what it would cost.
            </p>`,
        })}
      </div>
    </div>`;
}

function noticeCard(n) {
  return html`
    <article class="notice ${n.priority === 'urgent' ? 'urgent' : n.pinned ? 'pinned' : ''}">
      <div class="row between" style="align-items:flex-start;gap:10px">
        <div style="min-width:0">
          <div class="notice-title">${n.title}</div>
          <div class="notice-meta">
            ${fmtDate(n.date || n.at)} · ${n.audience || 'All'}
            ${(n.channels || []).map((c) => html` · ${c === 'sms' ? badge('SMS queued', 'warn') : badge('Emailed', 'ok')}`)}
          </div>
        </div>
        <div class="row" style="gap:6px">
          ${n.pinned ? badge('Pinned', 'brand', 'bookmark') : ''}
          ${n.priority === 'urgent' ? badge('Urgent', 'bad', 'alert') : ''}
        </div>
      </div>
      <p class="notice-body">${n.body}</p>
    </article>`;
}

// ---------------------------------------------------------------------------
// Notification queue
// ---------------------------------------------------------------------------

function queue() {
  const notices = allNotices();
  const smsJobs = notices.filter((n) => (n.channels || []).includes('sms'));
  const emailJobs = notices.filter((n) => (n.channels || []).includes('email'));

  const smsRecipients = smsJobs.reduce((s, n) => s + audienceSize(n.audienceId || 'guardians', n.gradeId), 0);
  const smsCost = smsRecipients * 0.3;
  const emailRecipients = emailJobs.reduce((s, n) => s + audienceSize(n.audienceId || 'guardians', n.gradeId), 0);
  const emailDays = Math.ceil(emailRecipients / 300);

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Email queued</div><div class="stat-value">${emailRecipients.toLocaleString()}</div>
        <div class="stat-meta">${emailDays} day${emailDays === 1 ? '' : 's'} at the 300/day free cap</div></div>
      <div class="stat"><div class="stat-label">SMS queued</div><div class="stat-value">${smsRecipients.toLocaleString()}</div>
        <div class="stat-meta">held — no gateway configured</div></div>
      <div class="stat"><div class="stat-label">SMS cost if sent</div><div class="stat-value">${taka(smsCost, { decimals: 2 })}</div>
        <div class="stat-meta">at ৳0.30 per message</div></div>
      <div class="stat"><div class="stat-label">Annualised SMS</div><div class="stat-value">${taka(smsCost * 24)}</div>
        <div class="stat-meta">assuming two sends a month</div></div>
    </div>

    ${card({
      title: 'Outbound queue',
      sub: 'Hangfire processes this queue in the background (§2). Held jobs stay queued until a gateway is configured.',
      flush: true,
      body: table(
        [...emailJobs.map((n) => ({ n, channel: 'email' })), ...smsJobs.map((n) => ({ n, channel: 'sms' }))],
        [
          { key: 'channel', label: 'Channel', render: (j) => badge(j.channel.toUpperCase(), j.channel === 'sms' ? 'warn' : 'info') },
          { key: 'title', label: 'Notice', render: (j) => html`<div class="cell-main truncate">${j.n.title}</div><div class="cell-sub">${j.n.audience}</div>` },
          { key: 'recipients', label: 'Recipients', align: 'right', render: (j) => audienceSize(j.n.audienceId || 'guardians', j.n.gradeId).toLocaleString() },
          {
            key: 'cost', label: 'Cost', align: 'right',
            render: (j) => (j.channel === 'sms'
              ? taka(audienceSize(j.n.audienceId || 'guardians', j.n.gradeId) * 0.3, { decimals: 2 })
              : html`<span class="muted">free tier</span>`),
          },
          {
            key: 'status', label: 'Status', align: 'center',
            render: (j) => (j.channel === 'sms' ? badge('Held', 'warn', 'clock') : badge('Sent', 'ok', 'checkCircle')),
          },
        ], { compact: true }
      ),
      foot: html`
        Bangladesh bulk SMS runs around ৳0.30 a message with no free tier. At this roll size that is a
        real recurring cost, so the channel ships built but switched off — the decision to buy it stays
        with the institution, and the numbers to make that decision are on this screen.`,
    })}`;
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

function openCompose() {
  modal({
    title: 'Publish a notice',
    size: 'wide',
    body: html`
      <form id="notice-form">
        <div class="field mb-2">
          <label class="label" for="n-title">Title<span class="req">*</span></label>
          <input class="input" id="n-title" required placeholder="Annual Examination schedule">
        </div>
        <div class="field mb-2">
          <label class="label" for="n-body">Notice text<span class="req">*</span></label>
          <textarea class="textarea" id="n-body" required placeholder="Write the notice as it should appear on the board…"></textarea>
        </div>
        <div class="form-grid" style="grid-template-columns:1fr 1fr">
          <div class="field">
            <label class="label" for="n-audience">Audience</label>
            <select class="select" id="n-audience">
              ${AUDIENCES.map((a) => html`<option value="${a.id}">${a.name}</option>`)}
            </select>
          </div>
          <div class="field" id="n-grade-wrap" hidden>
            <label class="label" for="n-grade">Class</label>
            <select class="select" id="n-grade">
              ${GRADES.map((g) => html`<option value="${g.id}">${g.name}</option>`)}
            </select>
          </div>
          <div class="field">
            <label class="label" for="n-priority">Priority</label>
            <select class="select" id="n-priority">
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <hr class="divider">
        <div class="label mb-1">Send through</div>
        <div class="col" style="gap:9px">
          <label class="row" style="gap:9px;cursor:pointer">
            <span class="switch"><input type="checkbox" id="n-email" checked><span class="track"></span></span>
            <span><strong>Email</strong> <span class="muted small">— sent immediately through the notification service</span></span>
          </label>
          <label class="row" style="gap:9px;cursor:pointer">
            <span class="switch"><input type="checkbox" id="n-sms"><span class="track"></span></span>
            <span><strong>SMS</strong> <span class="muted small">— queued only, no gateway configured</span></span>
          </label>
          <label class="row" style="gap:9px;cursor:pointer">
            <span class="switch"><input type="checkbox" id="n-pin"><span class="track"></span></span>
            <span><strong>Pin to the top</strong> of the board</span>
          </label>
        </div>
        <div class="card mt-3" style="background:var(--surface-2)">
          <div class="card-body" style="padding:11px 13px">
            <div class="row between"><span class="small dim">Recipients</span><strong id="n-count">—</strong></div>
            <div class="row between mt-1"><span class="small dim">SMS cost if enabled</span><strong id="n-cost">৳0.00</strong></div>
          </div>
        </div>
      </form>`,
    foot: html`
      <button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="n-publish">${icon('send')} Publish</button>`,
    onMount: (el) => {
      const audience = el.querySelector('#n-audience');
      const gradeWrap = el.querySelector('#n-grade-wrap');
      const grade = el.querySelector('#n-grade');
      const smsToggle = el.querySelector('#n-sms');

      const recount = () => {
        gradeWrap.hidden = audience.value !== 'class';
        const n = audienceSize(audience.value, grade.value);
        el.querySelector('#n-count').textContent = n.toLocaleString();
        el.querySelector('#n-cost').textContent = smsToggle.checked
          ? `৳${(n * 0.3).toFixed(2)}`
          : '৳0.00 (SMS off)';
      };
      audience.addEventListener('change', recount);
      grade.addEventListener('change', recount);
      smsToggle.addEventListener('change', recount);
      recount();

      el.querySelector('#n-publish').addEventListener('click', () => {
        const title = el.querySelector('#n-title').value.trim();
        const body = el.querySelector('#n-body').value.trim();
        if (!title || !body) {
          toast('Title and text are required', '', 'bad');
          return;
        }
        const channels = [];
        if (el.querySelector('#n-email').checked) channels.push('email');
        if (smsToggle.checked) channels.push('sms');

        const audienceId = audience.value;
        store.addNotice({
          title, body, channels,
          audienceId,
          gradeId: audienceId === 'class' ? grade.value : null,
          audience: audienceId === 'class'
            ? GRADES.find((g) => g.id === grade.value)?.name
            : AUDIENCES.find((a) => a.id === audienceId)?.name,
          priority: el.querySelector('#n-priority').value,
          pinned: el.querySelector('#n-pin').checked,
          date: clock.todayIso(),
        });
        closeModal();
        window.ERP.repaint();
        const n = audienceSize(audienceId, grade.value);
        toast('Notice published',
          channels.includes('sms')
            ? `Emailed to ${n.toLocaleString()}. SMS held — no gateway configured.`
            : `Emailed to ${n.toLocaleString()} recipients.`);
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'board', label: 'Notice Board' },
  { id: 'queue', label: 'Notification Queue' },
];

export default {
  id: 'notices',
  title: 'Notice Board',
  module: 'notices',

  render() {
    const canPublish = ['ADMIN', 'TEACHER'].includes(auth.currentRole());
    return {
      title: 'Notice Board',
      sub: 'Published notices and the outbound queue behind them (§12).',
      actions: canPublish
        ? html`<button class="btn btn-sm btn-primary" id="compose">${icon('plus')} Publish notice</button>`
        : '',
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${state.tab === 'queue' ? queue() : board()}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));
    document.querySelector('#compose')?.addEventListener('click', openCompose);
  },
};
