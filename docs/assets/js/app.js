/**
 * Application shell — navigation, chrome, and screen dispatch.
 *
 * Each screen module exports { id, title, render(ctx), mount?(root, ctx) }.
 * `render` returns markup; `mount` wires events after paint. That split keeps
 * every screen a pure function of state plus one imperative hook, which is what
 * makes them individually testable.
 */

import { INSTITUTION, MODULES, ROLES, ACADEMIC_YEAR } from './core/spec.js';
import * as store from './core/store.js';
import * as auth from './core/auth.js';
import * as clock from './core/clock.js';
import * as router from './core/router.js';
import { allStudents, allStaff, institutionStats } from './core/data.js';
import { fmtDate } from './core/domain.js';
import {
  html, render, raw, icon, toStr, avatar, modal, closeModal, toast, badge,
  bindChartTips, initials, debounce, emptyState,
} from './core/ui.js';

import dashboard from './modules/dashboard.js';
import students from './modules/students.js';
import admissions from './modules/admissions.js';
import attendance from './modules/attendance.js';
import exams from './modules/exams.js';
import routine from './modules/routine.js';
import fees from './modules/fees.js';
import notices from './modules/notices.js';
import portal from './modules/portal.js';
import library from './modules/library.js';
import transport from './modules/transport.js';
import hr from './modules/hr.js';
import hostel from './modules/hostel.js';
import settings from './modules/settings.js';

// ---------------------------------------------------------------------------
// Screen registry
// ---------------------------------------------------------------------------

const SCREENS = {};
for (const mod of [
  dashboard, students, admissions, attendance, exams, routine, fees,
  notices, portal, library, transport, hr, hostel, settings,
]) {
  SCREENS[mod.id] = mod;
  for (const alias of mod.aliases || []) SCREENS[alias] = mod;
}

// ---------------------------------------------------------------------------
// Navigation model
// ---------------------------------------------------------------------------

const NAV = [
  {
    group: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard' }],
  },
  {
    group: 'Academics',
    items: [
      { id: 'admissions', label: 'Admissions', icon: 'plus', module: 'admissions' },
      { id: 'students', label: 'Students', icon: 'users', module: 'students' },
      { id: 'attendance', label: 'Attendance', icon: 'check', module: 'attendance' },
      { id: 'exams', label: 'Exams & Results', icon: 'chart', module: 'exams' },
      { id: 'routine', label: 'Class Routine', icon: 'calendar', module: 'routine' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'fees', label: 'Fees & Accounts', icon: 'cash', module: 'fees' },
      { id: 'notices', label: 'Notice Board', icon: 'megaphone', module: 'notices' },
      { id: 'library', label: 'Library', icon: 'book', module: 'library' },
      { id: 'transport', label: 'Transport', icon: 'bus', module: 'transport' },
      { id: 'hostel', label: 'Hostel', icon: 'home', module: 'hostel' },
      { id: 'hr', label: 'HR & Payroll', icon: 'briefcase', module: 'hr' },
    ],
  },
  {
    group: 'Portal',
    items: [{ id: 'portal', label: 'My Portal', icon: 'heart', module: 'portal' }],
  },
  {
    group: 'System',
    items: [{ id: 'settings', label: 'Settings', icon: 'settings' }],
  },
];

function visibleNav() {
  const enabled = auth.enabledModules();
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (!auth.can(item.id)) return false;
      // A switched-off module stays visible to Admin (greyed) so the toggle is
      // discoverable; everyone else simply doesn't see it (§4).
      if (item.module && !enabled.includes(item.module)) return auth.isAdmin();
      return true;
    }).map((item) => ({
      ...item,
      off: Boolean(item.module && !enabled.includes(item.module)),
    })),
  })).filter((g) => g.items.length);
}

// ---------------------------------------------------------------------------
// Shell rendering
// ---------------------------------------------------------------------------

function renderSidebar() {
  const activeId = router.currentRoute()?.id || 'dashboard';
  const identity = auth.currentIdentity();
  const role = auth.currentRoleMeta();

  return html`
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-head">
        <div class="crest">SC</div>
        <div style="min-width:0">
          <div class="sidebar-title truncate">Shahjalal S&amp;C</div>
          <div class="sidebar-sub">${ACADEMIC_YEAR.label}</div>
        </div>
      </div>
      <nav class="sidebar-nav" aria-label="Main">
        ${visibleNav().map((group) => html`
          <div class="nav-group-label">${group.group}</div>
          ${group.items.map((item) => html`
            <a class="nav-item ${item.id === activeId ? 'active' : ''} ${item.off ? 'nav-off' : ''}"
               href="#/${item.id}" title="${item.off ? `${item.label} — module switched off` : item.label}">
              ${icon(item.icon)}
              <span class="truncate">${item.label}</span>
              ${item.off ? html`<span class="nav-badge">off</span>` : ''}
            </a>`)}
        `)}
      </nav>
      <div class="sidebar-foot">
        <button class="sidebar-persona" id="persona-btn">
          ${avatar(identity?.name || 'User', role.id, 'sm')}
          <div style="min-width:0;flex:1">
            <div class="nm truncate">${identity?.name || 'User'}</div>
            <div class="rl truncate">${role.name}</div>
          </div>
          ${icon('layers')}
        </button>
      </div>
    </aside>`;
}

function renderTopbar(screen) {
  return html`
    <header class="topbar">
      <button class="icon-btn menu-toggle" id="menu-btn" aria-label="Open menu">${icon('menu')}</button>
      <div>
        <div class="topbar-title">${screen?.title || 'Dashboard'}</div>
      </div>
      <div class="topbar-spacer"></div>
      <button class="btn btn-sm btn-ghost" id="search-btn" title="Search (Ctrl K)">
        ${icon('search')}<span class="hide-sm">Search</span>
        <kbd class="xsmall muted" style="border:1px solid var(--line);border-radius:4px;padding:0 4px">⌘K</kbd>
      </button>
      <button class="icon-btn" id="time-btn" title="Time Machine — ${fmtDate(clock.today())}">${icon('clock')}</button>
      <button class="icon-btn" id="theme-btn" title="Toggle theme">${icon(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>
      <button class="icon-btn" id="help-btn" title="About this demo">${icon('info')}</button>
    </header>`;
}

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = toStr(html`
    <div class="shell">
      ${renderSidebar()}
      <div class="main">
        ${renderTopbar(null)}
        ${clock.isOverridden() ? html`
          <div class="tm-banner">
            ${icon('clock')}
            <span>Time Machine engaged — the system is showing <strong>${fmtDate(clock.today())}</strong></span>
            <button class="btn btn-sm" id="tm-clear" style="margin-left:auto">Return to today</button>
          </div>` : ''}
        <main class="content" id="content"></main>
      </div>
    </div>`);
  wireShell();
}

function wireShell() {
  document.getElementById('menu-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    if (document.getElementById('sidebar')?.classList.contains('open')) {
      const scrim = document.createElement('div');
      scrim.className = 'scrim';
      scrim.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.remove('open');
        scrim.remove();
      });
      document.body.appendChild(scrim);
    } else {
      document.querySelector('.scrim')?.remove();
    }
  });
  document.getElementById('persona-btn')?.addEventListener('click', openPersonaSwitcher);
  document.getElementById('theme-btn')?.addEventListener('click', toggleTheme);
  document.getElementById('search-btn')?.addEventListener('click', openCommandPalette);
  document.getElementById('time-btn')?.addEventListener('click', openTimeMachine);
  document.getElementById('help-btn')?.addEventListener('click', openAbout);
  document.getElementById('tm-clear')?.addEventListener('click', () => {
    clock.clearDate();
    fullRepaint();
  });
}

// ---------------------------------------------------------------------------
// Screen dispatch
// ---------------------------------------------------------------------------

function paintScreen(ctx) {
  const screen = SCREENS[ctx.id];
  const content = document.getElementById('content');
  if (!content) return;

  if (!screen) {
    render(content, html`
      <div class="card"><div class="card-body">
        ${emptyState('alert', 'Screen not found', `No screen is registered for "${ctx.id}".`,
          html`<a class="btn btn-primary" href="#/dashboard">Back to dashboard</a>`)}
      </div></div>`);
    return;
  }

  if (!auth.can(ctx.id)) {
    render(content, html`
      <div class="card"><div class="card-body">
        ${emptyState('lock', 'Not authorised',
          `The ${auth.currentRoleMeta().name} role cannot open this screen. Roles are fixed (§9) — switch persona to view it.`,
          html`<button class="btn btn-primary" id="switch-from-denied">Switch persona</button>`)}
      </div></div>`);
    document.getElementById('switch-from-denied')?.addEventListener('click', openPersonaSwitcher);
    return;
  }

  // A screen whose module is switched off explains itself rather than 404ing.
  const modId = screen.module;
  if (modId && !auth.isModuleOn(modId)) {
    const mod = MODULES.find((m) => m.id === modId);
    render(content, html`
      <div class="card"><div class="card-body">
        ${emptyState('sliders', `${mod?.name || screen.title} is switched off`,
          'Every module ships in the codebase and is switched on or off per institution (§4). This one is currently off.',
          auth.isAdmin()
            ? html`<button class="btn btn-primary" id="enable-mod" data-mod="${modId}">Switch ${mod?.name} on</button>`
            : html`<span class="muted small">Ask an administrator to enable it in Settings.</span>`)}
      </div></div>`);
    document.getElementById('enable-mod')?.addEventListener('click', (e) => {
      auth.setModule(e.currentTarget.dataset.mod, true);
      toast('Module switched on', `${mod?.name} is now available.`);
      fullRepaint();
    });
    return;
  }

  const out = screen.render(ctx) || {};
  render(content, html`
    <div class="page-head">
      <div style="min-width:0">
        <h1 class="page-title">${out.title ?? screen.title}</h1>
        ${out.sub ? html`<p class="page-sub">${out.sub}</p>` : ''}
      </div>
      ${out.actions ? html`<div class="page-actions">${out.actions}</div>` : ''}
    </div>
    ${out.body}`);

  // Keep chrome in sync with the screen we just painted.
  const titleEl = document.querySelector('.topbar-title');
  if (titleEl) titleEl.textContent = out.title ?? screen.title;
  document.title = `${out.title ?? screen.title} · ${INSTITUTION.name} ERP`;
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('href') === `#/${ctx.id}`);
  });
  document.getElementById('sidebar')?.classList.remove('open');
  document.querySelector('.scrim')?.remove();

  screen.mount?.(content, ctx);
  bindChartTips(content);
  content.scrollTop = 0;
  window.scrollTo(0, 0);
}

/** Repaint the whole shell — used when the persona, modules, or date change. */
export function fullRepaint() {
  renderShell();
  paintScreen(router.currentRoute() || router.parseHash());
}

/** Repaint only the current screen — used after a data write. */
export function repaint() {
  paintScreen(router.currentRoute() || router.parseHash());
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

function currentTheme() {
  const stored = store.getSettings().theme;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme());
}

function toggleTheme() {
  store.setSetting('theme', currentTheme() === 'dark' ? 'light' : 'dark');
  applyTheme();
  fullRepaint();
}

// ---------------------------------------------------------------------------
// Persona switcher (§9 — eight fixed roles)
// ---------------------------------------------------------------------------

export function openPersonaSwitcher() {
  const identityMap = auth.identities();
  const active = auth.currentRole();
  modal({
    title: 'Switch role',
    size: 'wide',
    body: html`
      <p class="dim small mb-3">
        Roles are fixed rather than a permission matrix (§9). Each one below is a real
        account bound to a real record in the roster — switching changes the navigation,
        the dashboard, and what each screen will let you do.
      </p>
      <div class="grid g-2">
        ${Object.values(ROLES).map((role) => {
          const id = identityMap[role.id];
          return html`
            <button class="persona-card ${role.id === active ? 'active' : ''}" data-role="${role.id}">
              ${avatar(id?.name || role.name, role.id)}
              <div style="min-width:0;flex:1">
                <div class="persona-name">${role.name} ${role.id === active ? badge('current', 'brand') : ''}</div>
                <div class="persona-desc truncate">${id?.name || ''}</div>
                <div class="persona-desc">${role.desc}</div>
              </div>
            </button>`;
        })}
      </div>`,
    onMount: (el) => {
      el.querySelectorAll('[data-role]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const roleId = btn.dataset.role;
          auth.switchPersona(roleId);
          closeModal();
          // Land somewhere the new role can actually open.
          const landing = auth.can(router.currentRoute()?.id || 'dashboard') ? null : 'dashboard';
          if (landing) router.navigate(landing);
          fullRepaint();
          toast(`Signed in as ${ROLES[roleId].name}`, auth.currentIdentity()?.name || '');
        });
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Time Machine
// ---------------------------------------------------------------------------

function openTimeMachine() {
  const presets = [
    { label: 'Admissions week', date: `${ACADEMIC_YEAR.year}-01-08`, note: 'New session intake' },
    { label: '1st Terminal exam', date: `${ACADEMIC_YEAR.year}-04-14`, note: 'Mark entry open' },
    { label: 'Half-Yearly results', date: `${ACADEMIC_YEAR.year}-07-22`, note: 'Tabulation published' },
    { label: 'Mid-session (default)', date: `${ACADEMIC_YEAR.year}-08-12`, note: 'Ordinary working day' },
    { label: 'Test exam — Class 10 & 12', date: `${ACADEMIC_YEAR.year}-09-15`, note: 'Board eligibility check' },
    { label: 'Annual exam', date: `${ACADEMIC_YEAR.year}-11-18`, note: 'Final tabulation' },
  ];
  modal({
    title: 'Time Machine',
    body: html`
      <p class="dim small mb-3">
        Every screen reads the date from one function, so the whole system can stand on any
        day of the academic year. Useful for seeing what staff would see on results day or
        on a fee deadline — without waiting for it.
      </p>
      <div class="field mb-3">
        <label class="label" for="tm-date">Set the system date</label>
        <input class="input" type="date" id="tm-date" value="${clock.todayIso()}"
               min="${ACADEMIC_YEAR.start}" max="${ACADEMIC_YEAR.end}">
      </div>
      <div class="label mb-1">Jump to a moment</div>
      <div class="col">
        ${presets.map((p) => html`
          <button class="persona-card" data-date="${p.date}">
            <div class="mod-icon">${icon('calendar')}</div>
            <div style="flex:1">
              <div class="persona-name">${p.label}</div>
              <div class="persona-desc">${fmtDate(p.date)} · ${p.note}</div>
            </div>
          </button>`)}
      </div>`,
    foot: html`
      <button class="btn" id="tm-reset">Return to today</button>
      <button class="btn btn-primary" id="tm-apply">Apply date</button>`,
    onMount: (el) => {
      el.querySelectorAll('[data-date]').forEach((b) =>
        b.addEventListener('click', () => {
          clock.setDate(b.dataset.date);
          closeModal();
          fullRepaint();
          toast('Time Machine engaged', fmtDate(b.dataset.date), 'warn');
        }));
      el.querySelector('#tm-apply').addEventListener('click', () => {
        const v = el.querySelector('#tm-date').value;
        clock.setDate(v);
        closeModal();
        fullRepaint();
        toast('Time Machine engaged', fmtDate(v), 'warn');
      });
      el.querySelector('#tm-reset').addEventListener('click', () => {
        clock.clearDate();
        closeModal();
        fullRepaint();
        toast('Back to the present');
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Command palette
// ---------------------------------------------------------------------------

function buildSearchIndex() {
  const nav = visibleNav().flatMap((g) => g.items.map((i) => ({
    kind: 'Screen', label: i.label, href: `#/${i.id}`, icon: i.icon, group: 'Go to',
  })));
  return { nav };
}

export function openCommandPalette() {
  const { nav } = buildSearchIndex();

  const search = (q) => {
    const term = q.trim().toLowerCase();
    if (!term) return nav.slice(0, 8);

    const results = nav.filter((n) => n.label.toLowerCase().includes(term));

    // Students by ID, name, or class — capped so typing stays responsive at
    // 3,000+ records.
    if (auth.can('students') || auth.can('student')) {
      let count = 0;
      for (const s of allStudents()) {
        if (count >= 7) break;
        if (s.id.includes(term) || s.name.toLowerCase().includes(term)) {
          results.push({
            kind: 'Student', label: s.name, sub: `${s.id} · ${s.gradeName} ${s.sectionName}`,
            href: `#/student/${s.id}`, icon: 'user', group: 'Students',
          });
          count++;
        }
      }
    }
    if (auth.can('hr') || auth.can('staff')) {
      let count = 0;
      for (const s of allStaff()) {
        if (count >= 4) break;
        if (s.name.toLowerCase().includes(term) || s.id.toLowerCase().includes(term)) {
          results.push({
            kind: 'Staff', label: s.name, sub: `${s.id} · ${s.designation}`,
            href: `#/staff/${s.id}`, icon: 'briefcase', group: 'Staff',
          });
          count++;
        }
      }
    }
    return results.slice(0, 14);
  };

  const paint = (el, items, sel) => {
    const list = el.querySelector('.cmdk-list');
    if (!items.length) {
      list.innerHTML = toStr(html`<div class="empty"><div class="empty-desc">No matches. Try a student ID like <code>2601</code>.</div></div>`);
      return;
    }
    let lastGroup = null;
    const parts = [];
    items.forEach((it, i) => {
      if (it.group !== lastGroup) {
        parts.push(html`<div class="cmdk-group">${it.group}</div>`);
        lastGroup = it.group;
      }
      parts.push(html`
        <div class="cmdk-item ${i === sel ? 'sel' : ''}" data-href="${it.href}" data-i="${i}">
          ${icon(it.icon)}
          <div style="min-width:0">
            <div class="truncate">${it.label}</div>
            ${it.sub ? html`<div class="xsmall muted truncate">${it.sub}</div>` : ''}
          </div>
          <span class="cmdk-kind">${it.kind}</span>
        </div>`);
    });
    list.innerHTML = toStr(html`${parts}`);
    list.querySelectorAll('[data-href]').forEach((row) =>
      row.addEventListener('click', () => {
        router.navigate(row.dataset.href);
        closeModal();
      }));
  };

  modal({
    size: '',
    body: html`
      <div class="cmdk">
        <input class="cmdk-input" id="cmdk-input" placeholder="Search students, staff, or screens…" autocomplete="off">
        <div class="cmdk-list"></div>
      </div>`,
    onMount: (el) => {
      el.querySelector('.modal').style.padding = '0';
      el.querySelector('.modal-body').style.padding = '0';
      let items = search('');
      let sel = 0;
      paint(el, items, sel);
      const input = el.querySelector('#cmdk-input');
      input.focus();
      input.addEventListener('input', debounce(() => {
        items = search(input.value);
        sel = 0;
        paint(el, items, sel);
      }, 110));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(el, items, sel); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(el, items, sel); }
        else if (e.key === 'Enter' && items[sel]) { router.navigate(items[sel].href); closeModal(); }
      });
    },
  });
}

// ---------------------------------------------------------------------------
// About / tour
// ---------------------------------------------------------------------------

function openAbout() {
  const stats = institutionStats();
  const fp = store.overlayFootprint();
  modal({
    title: 'About this demo',
    size: 'wide',
    body: html`
      <p class="mb-3">
        This is a working browser twin of the <strong>${INSTITUTION.name}</strong> ERP.
        The production system is ASP.NET MVC 5 on SQL Server (§2); this build runs the same
        domain rules client-side so the whole thing can be reviewed from a static page.
      </p>
      <div class="grid g-3 mb-3">
        <div class="stat"><div class="stat-label">Students</div><div class="stat-value">${stats.totalStudents.toLocaleString()}</div><div class="stat-meta">across ${stats.totalClasses} class sections</div></div>
        <div class="stat"><div class="stat-label">Staff</div><div class="stat-value">${stats.totalStaff}</div><div class="stat-meta">${stats.totalTeachers} teaching</div></div>
        <div class="stat"><div class="stat-label">Stored data</div><div class="stat-value">${(fp.bytes / 1024).toFixed(1)} KB</div><div class="stat-meta">${fp.writes} write${fp.writes === 1 ? '' : 's'} kept as an overlay</div></div>
      </div>
      <h3 class="card-title mb-1">How it works</h3>
      <ul class="dim small" style="line-height:1.75;padding-left:18px;margin:0 0 14px">
        <li><strong>One spec, two runtimes.</strong> Grading bands, ID format, roles, fee heads and module switches live in a single spec file that both the SQL schema and this app are built from.</li>
        <li><strong>Derived, not stored.</strong> The roster and a year of attendance and marks are recomputed from seeds on demand — which is why ${stats.totalStudents.toLocaleString()} students cost kilobytes, not megabytes.</li>
        <li><strong>Writes overlay reads.</strong> Anything you change is saved locally and wins over the generated baseline, so edits persist across reloads and reset in one click.</li>
      </ul>
      <h3 class="card-title mb-1">Try this</h3>
      <ul class="dim small" style="line-height:1.75;padding-left:18px;margin:0">
        <li>Switch to the <strong>Parent</strong> role — it lands on a guardian with several children (§10).</li>
        <li>Open <strong>Settings → Modules</strong> and switch Library or Transport on; navigation changes immediately (§4).</li>
        <li>Enter a failing mark in <strong>Exams → Mark Entry</strong> and watch the GPA drop to 0.00 — one F fails the result (§7).</li>
        <li>Use the <strong>Time Machine</strong> in the toolbar to stand on results day.</li>
      </ul>`,
    foot: html`<button class="btn btn-primary" data-close>Got it</button>`,
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function registerRoutes() {
  for (const id of Object.keys(SCREENS)) router.route(id, paintScreen);
  router.setNotFound(paintScreen);
}

function wireGlobalKeys() {
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
    } else if (e.key === '/' && !typing) {
      e.preventDefault();
      openCommandPalette();
    }
  });
}

function boot() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (store.getSettings().theme === 'auto') {
      applyTheme();
      fullRepaint();
    }
  });

  registerRoutes();
  renderShell();
  wireGlobalKeys();
  router.start();

  // Repaint chrome whenever module switches or the persona change.
  store.subscribe((kind, detail) => {
    if (kind === 'settings' && (detail.key === 'modules' || detail.key === 'persona')) {
      // The screen itself triggers its own repaint; only chrome needs refreshing.
    }
  });

  if (!store.getSettings().seenTour) {
    store.setSetting('seenTour', true);
    setTimeout(openAbout, 500);
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support is a bonus, never a hard requirement.
    });
  }
}

document.addEventListener('DOMContentLoaded', boot);

// Exposed for screens that need to trigger chrome actions.
window.ERP = { repaint, fullRepaint, openPersonaSwitcher, openCommandPalette };
