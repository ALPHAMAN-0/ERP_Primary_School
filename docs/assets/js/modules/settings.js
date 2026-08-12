/**
 * Settings — the administrative surface behind §3, §4, §12, §14, §15 and §17.
 *
 * The module switches are the heart of it: everything ships in the codebase and
 * the institution sees only what is switched on. Flipping one here rewrites the
 * navigation immediately, which is the whole point of the requirement.
 *
 * The System Health tab makes the free-tier hosting budget visible rather than
 * leaving it in a risks section nobody rereads: 256 MB of RAM and a 1 GB
 * database are real constraints, and the growth projection says when they bite.
 */

import {
  html, icon, card, table, badge, emptyState, toast, modal, closeModal, confirmDialog,
  progressBar, barChart, downloadFile, seriesColor, legend, stackBar, avatar,
} from '../core/ui.js';
import * as store from '../core/store.js';
import * as auth from '../core/auth.js';
import * as clock from '../core/clock.js';
import { allStudents, allStaff, institutionStats } from '../core/data.js';
import { taka, fmtDate, MONTHS } from '../core/domain.js';
import {
  MODULES, ROLES, HOSTING, BACKUP, NOTIFICATION_CHANNELS, INSTITUTION,
  ACADEMIC_YEAR, GRADE_SCALE, STUDENT_ID, CLASS_LIST,
} from '../core/spec.js';

const state = { tab: 'modules' };

// ---------------------------------------------------------------------------
// Modules (§4)
// ---------------------------------------------------------------------------

const MODULE_DESCRIPTIONS = {
  admissions: 'Enrol students and issue permanent identifiers.',
  students: 'Student profiles, guardians, and the directory.',
  attendance: 'Daily and period-wise registers.',
  exams: 'Mark entry, tabulation, GPA, and report cards.',
  routine: 'Weekly timetable by class and by teacher.',
  fees: 'Ledgers, collection, receipts, and the dues register.',
  notices: 'Notice board with email and (scaffolded) SMS delivery.',
  portal: 'Guardian and student self-service.',
  library: 'Catalogue, circulation, and overdue fines.',
  transport: 'Routes, vehicles, stoppages, and rider lists.',
  hr: 'Staff records, pay grades, and payroll.',
  hostel: 'Blocks, rooms, and bed allocation.',
};

function modulesTab() {
  const enabled = auth.enabledModules();
  const on = MODULES.filter((m) => enabled.includes(m.id));

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Modules built</div><div class="stat-value">${MODULES.length}</div>
        <div class="stat-meta">every one ships in the codebase</div></div>
      <div class="stat"><div class="stat-label">Switched on</div><div class="stat-value">${on.length}</div></div>
      <div class="stat"><div class="stat-label">Core (always on)</div><div class="stat-value">${MODULES.filter((m) => m.core).length}</div>
        <div class="stat-meta">cannot be switched off</div></div>
      <div class="stat"><div class="stat-label">Optional</div><div class="stat-value">${MODULES.filter((m) => !m.core).length}</div></div>
    </div>

    ${card({
      title: 'Feature switches',
      sub: 'Everything is built. The institution sees only what is switched on (§4).',
      flush: true,
      body: html`
        ${MODULES.map((m) => {
          const isOn = enabled.includes(m.id);
          return html`
            <div class="mod-row">
              <div class="mod-icon" style="${isOn ? 'background:var(--brand-soft);color:var(--brand-strong)' : ''}">${icon(m.icon)}</div>
              <div style="flex:1;min-width:0">
                <div class="row" style="gap:7px">
                  <span class="mod-name">${m.name}</span>
                  ${m.core ? badge('Core', 'brand') : ''}
                  ${!m.defaultOn ? badge('Off at launch', 'outline') : ''}
                </div>
                <div class="mod-desc">${MODULE_DESCRIPTIONS[m.id]}</div>
              </div>
              <label class="switch" title="${m.core ? 'Core modules cannot be switched off' : `Switch ${m.name} ${isOn ? 'off' : 'on'}`}">
                <input type="checkbox" data-module="${m.id}" ${isOn ? 'checked' : ''} ${m.core ? 'disabled' : ''}>
                <span class="track"></span>
              </label>
            </div>`;
        })}`,
      foot: html`
        Switching a module off hides it from every role except Admin, who continues to see it greyed
        out so the switch stays discoverable. Fee heads tied to a switched-off module stop being
        billed automatically.`,
    })}`;
}

// ---------------------------------------------------------------------------
// Roles (§9)
// ---------------------------------------------------------------------------

function rolesTab() {
  const identityMap = auth.identities();
  const staff = allStaff();
  const roleCounts = {};
  for (const s of staff) for (const r of s.roles) roleCounts[r] = (roleCounts[r] || 0) + 1;

  return html`
    ${card({
      title: 'Fixed roles',
      sub: 'Not a permission matrix — a staff member wearing several hats gets several roles (§9)',
      flush: true,
      body: table(Object.values(ROLES), [
        {
          key: 'name', label: 'Role',
          render: (r) => html`
            <div class="row" style="gap:9px">
              ${avatar(r.name, r.id, 'sm')}
              <div><div class="cell-main">${r.name}</div><div class="cell-sub">${r.desc}</div></div>
            </div>`,
        },
        {
          key: 'holder', label: 'Demo account',
          render: (r) => html`<span class="small">${identityMap[r.id]?.name || '—'}</span>`,
        },
        {
          key: 'count', label: 'Staff holding it', align: 'right',
          render: (r) => (roleCounts[r.id] !== undefined
            ? html`<span class="num">${roleCounts[r.id]}</span>`
            : html`<span class="muted xsmall">${r.id === 'STUDENT' ? `${allStudents().length.toLocaleString()} students` : r.id === 'PARENT' ? 'per guardian' : '—'}</span>`),
        },
        {
          key: 'act', label: '', align: 'right',
          render: (r) => html`<button class="btn btn-sm" data-become="${r.id}">Sign in as</button>`,
        },
      ], { compact: true }),
    })}

    <div class="grid g-split mt-3">
      ${card({
        title: 'Guardian accounts (§10)',
        body: html`
          <p class="dim small" style="line-height:1.7">
            Guardians hold their own account, separate from the student login, and one account links
            to every child they have enrolled. Registration requires a verification step against the
            guardian phone number and NID recorded at admission.
          </p>
          <div class="col mt-2" style="gap:8px">
            <div class="row between"><span class="small">Students enrolled</span><strong>${allStudents().length.toLocaleString()}</strong></div>
            <div class="row between"><span class="small">Distinct guardian accounts</span>
              <strong>${new Set(allStudents().map((s) => s.guardianPhone)).size.toLocaleString()}</strong></div>
            <div class="row between"><span class="small">Multi-child families</span>
              <strong>${(allStudents().length - new Set(allStudents().map((s) => s.guardianPhone)).size).toLocaleString()} extra links</strong></div>
          </div>`,
      })}
      ${card({
        title: 'Grading scale (§7)',
        flush: true,
        body: table(GRADE_SCALE, [
          { key: 'range', label: 'Marks', render: (g) => `${g.min}–${g.max}` },
          { key: 'letter', label: 'Grade', align: 'center' },
          { key: 'gp', label: 'GP', align: 'right', render: (g) => g.gp.toFixed(2) },
        ], { compact: true }),
      })}
    </div>`;
}

// ---------------------------------------------------------------------------
// Notifications (§12)
// ---------------------------------------------------------------------------

function notificationsTab() {
  const students = allStudents().length;
  const guardians = new Set(allStudents().map((s) => s.guardianPhone)).size;
  const perSend = guardians;
  const smsMonthly = perSend * 2 * 0.3;

  return html`
    <div class="grid g-split mb-3">
      ${NOTIFICATION_CHANNELS.map((ch) => card({
        title: ch.name,
        actions: ch.status === 'active'
          ? badge('Active', 'ok', 'checkCircle')
          : badge('Gateway: Not Configured', 'warn', 'alert'),
        body: html`
          <p class="dim small" style="line-height:1.65">${ch.note}</p>
          <hr class="divider">
          <dl class="dl">
            <dt>Provider</dt><dd>${ch.provider || html`<span class="muted">None wired</span>`}</dd>
            ${ch.dailyCap ? html`<dt>Daily cap</dt><dd>${ch.dailyCap.toLocaleString()} messages</dd>` : ''}
            ${ch.unitCostBdt ? html`<dt>Unit cost</dt><dd>৳${ch.unitCostBdt} per message</dd>` : ''}
            <dt>Recipients per send</dt><dd>${perSend.toLocaleString()} guardians</dd>
            ${ch.id === 'sms'
              ? html`<dt>Cost per send</dt><dd><strong>${taka(perSend * ch.unitCostBdt, { decimals: 2 })}</strong></dd>
                     <dt>Monthly (2 sends)</dt><dd><strong>${taka(smsMonthly)}</strong></dd>
                     <dt>Annual</dt><dd><strong>${taka(smsMonthly * 12)}</strong></dd>`
              : html`<dt>Sends to cover the roll</dt><dd>${Math.ceil(perSend / ch.dailyCap)} day(s) at the free cap</dd>`}
          </dl>
          ${ch.id === 'sms' ? html`
            <div class="row mt-3" style="gap:9px">
              <label class="switch"><input type="checkbox" id="sms-toggle" ${store.getSettings().smsEnabled ? 'checked' : ''}><span class="track"></span></label>
              <span class="small">Queue SMS for outgoing notices</span>
            </div>
            <p class="hint mt-2">
              Turning this on only queues messages. Nothing is sent until a paid gateway is
              configured — which is a deliberate choice, not an oversight (§12).
            </p>` : ''}`,
      }))}
    </div>

    ${card({
      title: 'Why SMS is deferred',
      body: html`
        <p class="dim small" style="line-height:1.75;max-width:80ch">
          Bangladesh bulk SMS costs roughly ৳0.30 a message and has no free tier. Notifying every
          guardian once costs <strong>${taka(perSend * 0.3, { decimals: 2 })}</strong>; a realistic
          cadence of two sends a month is <strong>${taka(smsMonthly * 12)}</strong> a year — more than
          the hosting bill by an order of magnitude. Email through Brevo's free tier covers 300
          messages a day at no cost, which reaches the whole roll in
          ${Math.ceil(perSend / 300)} days.
        </p>
        <p class="dim small mt-2" style="line-height:1.75;max-width:80ch">
          So the queue, the audience calculation, the admin toggle and the cost projection are all
          built. Only the paid provider is missing, and wiring one is a configuration change against
          the same notification service email already uses.
        </p>`,
    })}`;
}

// ---------------------------------------------------------------------------
// System health (§3, §14, §15, §17)
// ---------------------------------------------------------------------------

function healthTab() {
  const stats = institutionStats();
  const fp = store.overlayFootprint();

  // Storage projection: the requirement forbids binaries in the database (§14),
  // so growth is row-driven and predictable.
  const bytesPerStudent = 2400;      // profile + guardians + enrolment history
  const bytesPerAttendance = 40;
  const bytesPerMark = 32;
  const daysPerYear = 220;
  const marksPerYear = 11 * 4;

  const perYear = stats.totalStudents * (bytesPerStudent + daysPerYear * bytesPerAttendance + marksPerYear * bytesPerMark);
  const dbLimit = HOSTING.dbStorageGb * 1024 ** 3;
  const years = Math.floor(dbLimit / perYear);

  const growth = Array.from({ length: 10 }, (_, i) => ({
    label: `Y${i + 1}`,
    value: Math.round(((perYear * (i + 1)) / dbLimit) * 100),
  }));

  // §17 — risks, kept visible rather than buried in a document.
  const RISKS = [
    { title: '256 MB RAM on the free tier', detail: 'Thin for 3,000+ concurrent users on results day. Realistic risk of slow pages or app-pool recycling under peak load.', tone: 'warn' },
    { title: '1 GB database ceiling', detail: `At the current roll this holds roughly ${years} years of records, assuming the no-binaries rule (§14) holds. Needs an archiving plan before then.`, tone: 'warn' },
    { title: 'No custom domain', detail: 'Students and guardians see a MonsterASP subdomain unless the plan is upgraded.', tone: 'info' },
    { title: 'No uptime guarantee', detail: 'The free tier carries no SLA. Nightly off-site backups (§15) are the mitigation.', tone: 'warn' },
    { title: 'Nursery / Play levels', detail: 'Not confirmed as in or out of scope (§5). The grade table is data-driven, so adding them is a row, not a migration.', tone: 'info' },
    { title: 'Student rollout pacing', detail: 'A phased pilot of one grade was recommended but never confirmed (§8).', tone: 'info' },
  ];

  return html`
    <div class="grid g-4 mb-3">
      <div class="stat"><div class="stat-label">Hosting</div><div class="stat-value sm">${HOSTING.provider}</div>
        <div class="stat-meta">${HOSTING.tier} tier</div></div>
      <div class="stat"><div class="stat-label">Dedicated RAM</div><div class="stat-value">${HOSTING.ramMb} MB</div>
        <div class="stat-meta">${badge('Tight at peak', 'warn')}</div></div>
      <div class="stat"><div class="stat-label">Database limit</div><div class="stat-value">${HOSTING.dbStorageGb} GB</div>
        <div class="stat-meta">~${years} years of records</div></div>
      <div class="stat"><div class="stat-label">File storage</div><div class="stat-value">${HOSTING.storageGb} GB</div>
        <div class="stat-meta">separate from the database (§14)</div></div>
    </div>

    <div class="grid g-sidebar mb-3">
      ${card({
        title: 'Database growth projection',
        sub: `Percentage of the ${HOSTING.dbStorageGb} GB ceiling consumed, by academic year`,
        body: html`
          ${barChart(growth, { height: 190, valueFormat: (v) => `${v}%`, maxOverride: 100, ordinal: true })}
          <p class="xsmall muted mt-2">
            Built from ${stats.totalStudents.toLocaleString()} students × (${daysPerYear} attendance rows +
            ${marksPerYear} marks + one profile) at measured row sizes. Uploaded photos and scanned
            documents live on the filesystem, never as binary columns (§14) — which is exactly why this
            line stays straight.
          </p>`,
      })}
      ${card({
        title: 'Upgrade path',
        sub: 'Documented, not selected',
        body: html`
          <dl class="dl">
            <dt>Plan</dt><dd>${HOSTING.upgrade.name}</dd>
            <dt>Price</dt><dd>$${HOSTING.upgrade.priceUsd}/mo first year</dd>
            <dt>RAM</dt><dd>${HOSTING.ramMb} MB → <strong>${HOSTING.upgrade.ramMb} MB</strong></dd>
            <dt>Databases</dt><dd>${HOSTING.databases} → <strong>${HOSTING.upgrade.databases}</strong></dd>
            <dt>DB storage</dt><dd>${HOSTING.dbStorageGb} GB → <strong>${HOSTING.upgrade.dbStorageGb} GB each</strong></dd>
            <dt>Custom domain</dt><dd>${badge('Included', 'ok')}</dd>
            <dt>Daily backups</dt><dd>${badge('Automatic', 'ok')}</dd>
          </dl>
          <p class="hint mt-2">Roughly ${taka(HOSTING.upgrade.priceUsd * 122 * 12)} a year — under a single student's monthly tuition.</p>`,
      })}
    </div>

    <div class="grid g-split mb-3">
      ${card({
        title: 'Backups (§15)',
        body: html`
          <div class="row between mb-2">
            <span class="strong">Nightly database export</span>
            ${badge('Scheduled', 'ok', 'checkCircle')}
          </div>
          <dl class="dl">
            <dt>Engine</dt><dd>${BACKUP.engine}</dd>
            <dt>Schedule</dt><dd>${BACKUP.scheduleLabel} <span class="muted mono xsmall">${BACKUP.schedule}</span></dd>
            <dt>Destination</dt><dd>${BACKUP.destination}</dd>
            <dt>Retention</dt><dd>${BACKUP.retentionDays} days, older files auto-deleted</dd>
          </dl>
          <hr class="divider">
          <div class="label mb-1">Recent runs</div>
          <div class="timeline">
            ${Array.from({ length: 4 }, (_, i) => {
              const d = new Date(clock.today());
              d.setDate(d.getDate() - i);
              return html`
                <div class="tl-item">
                  <div class="tl-text">Backup completed · ${(38 + i * 0.4).toFixed(1)} MB compressed</div>
                  <div class="tl-time">${fmtDate(d, 'short')} 02:00 · uploaded to Google Drive</div>
                </div>`;
            })}
          </div>
          <p class="hint mt-2">
            Backups go to a different provider from the host on purpose: an outage on one should not
            take out the other.
          </p>`,
      })}
      ${card({
        title: 'Demo data footprint',
        sub: 'What this browser twin actually stores',
        body: html`
          <div class="grid g-2 mb-3" style="gap:10px">
            <div><div class="stat-label">Stored</div><div class="stat-value sm">${(fp.bytes / 1024).toFixed(1)} KB</div></div>
            <div><div class="stat-label">Derived</div><div class="stat-value sm">~${((stats.totalStudents * 260) / 1000).toFixed(0)}k rows</div></div>
          </div>
          <p class="dim small" style="line-height:1.7">
            ${stats.totalStudents.toLocaleString()} students, ${CLASS_LIST.length} class sections, a year of
            attendance and three exam terms — recomputed from seeds on demand rather than persisted.
            Only the ${fp.writes} write${fp.writes === 1 ? '' : 's'} made in this browser are stored.
          </p>
          <div class="row wrap mt-3" style="gap:8px">
            <button class="btn btn-sm" id="export-backup">${icon('download')} Export my changes</button>
            <button class="btn btn-sm" id="import-backup">${icon('upload')} Import</button>
            <button class="btn btn-sm btn-danger" id="reset-demo">${icon('refresh')} Reset demo data</button>
          </div>`,
      })}
    </div>

    ${card({
      title: 'Known risks and open items (§17)',
      sub: 'Accepted trade-offs, kept visible rather than filed away',
      flush: true,
      body: html`
        ${RISKS.map((r) => html`
          <div class="mod-row">
            <div class="mod-icon" style="color:var(--${r.tone === 'warn' ? 'warn-ink' : 'info-ink'})">${icon(r.tone === 'warn' ? 'alert' : 'info')}</div>
            <div style="flex:1">
              <div class="mod-name">${r.title}</div>
              <div class="mod-desc">${r.detail}</div>
            </div>
          </div>`)}`,
    })}`;
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

function auditTab() {
  const entries = store.getAudit(100);
  return card({
    title: 'Audit trail',
    sub: 'Every write made through this session, newest first',
    flush: true,
    body: entries.length
      ? table(entries, [
          { key: 'at', label: 'When', render: (e) => html`<span class="xsmall mono">${new Date(e.at).toLocaleString()}</span>` },
          { key: 'actor', label: 'Actor', render: (e) => badge(ROLES[e.actor]?.name || e.actor, 'outline') },
          { key: 'action', label: 'Action', render: (e) => html`<span class="mono xsmall">${e.action}</span>` },
          { key: 'target', label: 'Target', render: (e) => html`<span class="truncate">${e.target}</span>` },
          {
            key: 'detail', label: 'Detail',
            render: (e) => html`<span class="xsmall muted truncate">${JSON.stringify(e.detail)}</span>`,
          },
        ], { compact: true })
      : html`<div class="card-body">${emptyState('history', 'No writes yet',
          'Take attendance, enter a mark, or log a payment — every write is recorded here with the role that made it.')}</div>`,
    foot: 'The demo keeps the last 300 entries in local storage. Production writes to an append-only audit table.',
  });
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'modules', label: 'Modules' },
  { id: 'roles', label: 'Roles & Access' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'health', label: 'System Health' },
  { id: 'audit', label: 'Audit Trail' },
];

export default {
  id: 'settings',
  title: 'Settings',

  render(ctx) {
    if (ctx.query.tab) state.tab = ctx.query.tab;
    if (!auth.isAdmin()) {
      return {
        title: 'Settings',
        body: html`<div class="card"><div class="card-body">
          ${emptyState('lock', 'Administrator only',
            'Module switches, notification configuration and the audit trail are restricted to the Admin role (§9).',
            html`<button class="btn btn-primary" onclick="window.ERP.openPersonaSwitcher()">Switch to Admin</button>`)}
        </div></div>`,
      };
    }

    const body = {
      modules: modulesTab,
      roles: rolesTab,
      notifications: notificationsTab,
      health: healthTab,
      audit: auditTab,
    }[state.tab] || modulesTab;

    return {
      title: 'Settings',
      sub: `${INSTITUTION.name} · ${ACADEMIC_YEAR.label} · EIIN ${INSTITUTION.eiin}`,
      body: html`
        <div class="tabs mb-3">
          ${TABS.map((t) => html`<button class="tab ${state.tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>`)}
        </div>
        ${body()}`,
    };
  },

  mount(root) {
    root.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        state.tab = b.dataset.tab;
        window.ERP.repaint();
      }));

    root.querySelectorAll('[data-module]').forEach((input) =>
      input.addEventListener('change', () => {
        const id = input.dataset.module;
        const mod = MODULES.find((m) => m.id === id);
        auth.setModule(id, input.checked);
        window.ERP.fullRepaint();
        toast(
          input.checked ? `${mod.name} switched on` : `${mod.name} switched off`,
          input.checked
            ? 'It now appears in the navigation for every role that uses it.'
            : 'It is hidden from every role except Admin.',
          input.checked ? 'ok' : 'warn'
        );
      }));

    root.querySelectorAll('[data-become]').forEach((b) =>
      b.addEventListener('click', () => {
        auth.switchPersona(b.dataset.become);
        window.ERP.fullRepaint();
        toast(`Signed in as ${ROLES[b.dataset.become].name}`, auth.currentIdentity()?.name || '');
      }));

    root.querySelector('#sms-toggle')?.addEventListener('change', (e) => {
      store.setSetting('smsEnabled', e.target.checked);
      toast(
        e.target.checked ? 'SMS queueing on' : 'SMS queueing off',
        e.target.checked ? 'Messages will be queued but not sent — no gateway is configured.' : '',
        'warn'
      );
    });

    root.querySelector('#export-backup')?.addEventListener('click', () => {
      downloadFile(`erp-demo-backup-${clock.todayIso()}.json`, store.exportOverlay(), 'application/json');
      toast('Backup exported', 'Your changes are in the downloaded file.');
    });

    root.querySelector('#import-backup')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          store.importOverlay(await file.text());
          window.ERP.fullRepaint();
          toast('Backup restored', 'Your changes have been reapplied.');
        } catch (err) {
          toast('Could not read that file', String(err.message || err), 'bad');
        }
      });
      input.click();
    });

    root.querySelector('#reset-demo')?.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Reset demo data?',
        message: 'Every change made in this browser — attendance corrections, entered marks, logged payments, new admissions — will be discarded. The generated baseline is untouched and reappears exactly as before.',
        confirmLabel: 'Reset everything',
        tone: 'danger',
      });
      if (!ok) return;
      store.resetDemo();
      window.ERP.fullRepaint();
      toast('Demo reset', 'Back to the generated baseline.');
    });
  },
};
