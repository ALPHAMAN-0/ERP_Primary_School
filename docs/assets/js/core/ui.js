/**
 * UI toolkit — rendering helpers and components.
 *
 * Everything renders through a tagged template that escapes interpolations by
 * default, so student names and free-text notices cannot inject markup. Use
 * `raw()` to opt out deliberately.
 */

// ---------------------------------------------------------------------------
// Templating
// ---------------------------------------------------------------------------

const RAW = Symbol('raw');

export function raw(str) {
  return { [RAW]: String(str) };
}

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function interpolate(value) {
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return value.map(interpolate).join('');
  if (typeof value === 'object' && RAW in value) return value[RAW];
  return esc(value);
}

/** Tagged template producing an escaped HTML string. */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += interpolate(values[i]) + strings[i + 1];
  }
  return raw(out);
}

/** Render an html`` result (or string) into a container. */
export function render(container, content) {
  const node = typeof container === 'string' ? document.querySelector(container) : container;
  if (!node) return;
  node.innerHTML = typeof content === 'object' && RAW in content ? content[RAW] : String(content);
  return node;
}

export function toStr(content) {
  return typeof content === 'object' && content !== null && RAW in content ? content[RAW] : String(content ?? '');
}

// ---------------------------------------------------------------------------
// Icons — inline SVG, 24×24 viewBox, stroke-based
// ---------------------------------------------------------------------------

const ICONS = {
  dashboard: '<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chart: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  cash: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  bus: '<path d="M8 6v6M16 6v6M2 12h19.6M18 18h2a1 1 0 0 0 1-1v-5a8 8 0 0 0-8-8H8a8 8 0 0 0-8 8v5a1 1 0 0 0 1 1h2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  academic: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/>',
  cloud: '<path d="M18 10h-1.3A7 7 0 1 0 4 15.9"/><path d="M12 12v9M8 17l4-4 4 4"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  award: '<circle cx="12" cy="8" r="7"/><path d="M8.2 13.9 7 23l5-3 5 3-1.2-9.1"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  history: '<path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  bookmark: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4 20-7z"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
  package: '<path d="m21 16-9 5-9-5V8l9-5 9 5z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
};

/** Render an inline icon. */
export function icon(name, cls = 'ic') {
  const body = ICONS[name] || ICONS.info;
  return raw(
    `<svg class="${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
  );
}

export const hasIcon = (name) => Boolean(ICONS[name]);

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

const AVATAR_HUES = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7',
  '#0b6b4f', '#d03b3b', '#0891b2', '#7c3aed', '#be185d',
];

export function avatarColor(seedText) {
  let h = 0;
  for (let i = 0; i < seedText.length; i++) h = (h * 31 + seedText.charCodeAt(i)) >>> 0;
  return AVATAR_HUES[h % AVATAR_HUES.length];
}

export function initials(name) {
  const parts = String(name).replace(/^(Md\.|Mst\.|Mrs\.|Most\.|Prof\.|Dr\.|Mohammad)\s+/i, '').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatar(name, seed, size = '') {
  return html`<div class="avatar ${size}" style="background:${raw(avatarColor(seed || name))}" aria-hidden="true">${initials(name)}</div>`;
}

export function badge(text, tone = '', iconName = null) {
  const cls = tone ? `badge badge-${tone}` : 'badge';
  return html`<span class="${cls}">${iconName ? icon(iconName) : ''}${text}</span>`;
}

/** Grade letter pill — carries the letter, so color never stands alone. */
export function gradePill(letter) {
  const cls = { 'A+': 'gp-Aplus', A: 'gp-A', 'A-': 'gp-Aminus', B: 'gp-B', C: 'gp-C', D: 'gp-D', F: 'gp-F' }[letter] || 'gp-F';
  return html`<span class="gp ${cls}">${letter}</span>`;
}

export function statTile({ label, value, meta, iconName, tone, spark }) {
  return html`
    <div class="stat">
      <div class="stat-label">${iconName ? icon(iconName) : ''}${label}</div>
      <div class="stat-value ${tone ? `tone-${tone}` : ''}">${value}</div>
      ${meta ? html`<div class="stat-meta">${meta}</div>` : ''}
      ${spark ? html`<div class="stat-spark">${spark}</div>` : ''}
    </div>`;
}

export function emptyState(iconName, title, desc, action = '') {
  return html`
    <div class="empty">
      ${icon(iconName)}
      <div class="empty-title">${title}</div>
      <div class="empty-desc">${desc}</div>
      ${action ? html`<div class="mt-2">${action}</div>` : ''}
    </div>`;
}

export function card({ title, sub, actions, body, foot, flush, cls = '' }) {
  return html`
    <section class="card ${cls}">
      ${title || actions
        ? html`<header class="card-head">
            <div>
              <div class="card-title">${title}</div>
              ${sub ? html`<div class="card-sub">${sub}</div>` : ''}
            </div>
            ${actions ? html`<div class="card-actions">${actions}</div>` : ''}
          </header>`
        : ''}
      <div class="card-body ${flush ? 'flush' : ''}">${body}</div>
      ${foot ? html`<footer class="card-foot">${foot}</footer>` : ''}
    </section>`;
}

export function progressBar(percent, tone = '') {
  const p = Math.max(0, Math.min(100, percent));
  return html`<div class="bar ${tone}" role="progressbar" aria-valuenow="${Math.round(p)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${raw(p.toFixed(1))}%"></span></div>`;
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

let toastHost = null;

export function toast(title, desc = '', tone = 'ok') {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toasts';
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  const ic = tone === 'bad' ? 'alert' : tone === 'warn' ? 'alert' : 'checkCircle';
  el.innerHTML = toStr(html`
    ${icon(ic)}
    <div>
      <div class="toast-title">${title}</div>
      ${desc ? html`<div class="toast-desc">${desc}</div>` : ''}
    </div>`);
  toastHost.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .2s, transform .2s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(10px)';
    setTimeout(() => el.remove(), 220);
  }, 3200);
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

let openModal = null;

export function modal({ title, body, foot, size = '', onClose, onMount }) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = toStr(html`
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${title || 'Dialog'}">
      ${title
        ? html`<header class="modal-head">
            <div class="modal-title">${title}</div>
            <div style="margin-left:auto"><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
          </header>`
        : ''}
      <div class="modal-body">${body}</div>
      ${foot ? html`<footer class="modal-foot">${foot}</footer>` : ''}
    </div>`);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('[data-close]')) closeModal();
  });
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';
  openModal = { el: backdrop, onClose };
  onMount?.(backdrop);

  const focusable = backdrop.querySelector('input, select, textarea, button:not([data-close])');
  focusable?.focus();
  return backdrop;
}

export function closeModal() {
  if (!openModal) return;
  openModal.onClose?.();
  openModal.el.remove();
  openModal = null;
  document.body.style.overflow = '';
}

export function isModalOpen() {
  return Boolean(openModal);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openModal) closeModal();
});

/** Confirmation dialog — returns a promise resolving to true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'primary' }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const el = modal({
      title,
      body: html`<p class="dim">${message}</p>`,
      foot: html`
        <button class="btn" data-close>Cancel</button>
        <button class="btn btn-${tone}" data-confirm>${confirmLabel}</button>`,
      onClose: () => done(false),
    });
    el.querySelector('[data-confirm]').addEventListener('click', () => {
      done(true);
      closeModal();
    });
  });
}

// ---------------------------------------------------------------------------
// Table helper with sorting + pagination
// ---------------------------------------------------------------------------

/**
 * Render a data table.
 * @param {Array} rows
 * @param {Array<{key,label,align?,render?,sortable?,width?}>} columns
 */
export function table(rows, columns, opts = {}) {
  const { rowAttrs, compact, emptyMessage = 'No records found', sortKey, sortDir } = opts;
  if (!rows.length) {
    return html`<div class="empty"><div class="empty-title">${emptyMessage}</div></div>`;
  }
  return html`
    <div class="table-wrap">
      <table class="tbl ${compact ? 'compact' : ''}">
        <thead>
          <tr>${columns.map((c) => html`
            <th class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''} ${c.sortable ? 'sortable' : ''}"
                ${c.sortable ? raw(`data-sort="${esc(c.key)}"`) : ''}
                ${c.width ? raw(`style="width:${esc(c.width)}"`) : ''}>
              ${c.label}${c.sortable && sortKey === c.key ? html`<span class="sort-ind">${sortDir === 'asc' ? '▲' : '▼'}</span>` : ''}
            </th>`)}</tr>
        </thead>
        <tbody>
          ${rows.map((row, i) => html`
            <tr ${raw(rowAttrs ? rowAttrs(row, i) : '')}>
              ${columns.map((c) => html`
                <td class="${c.align === 'right' ? 'num' : c.align === 'center' ? 'center' : ''}">
                  ${c.render ? c.render(row, i) : row[c.key]}
                </td>`)}
            </tr>`)}
        </tbody>
      </table>
    </div>`;
}

export function pager(page, totalPages, opts = {}) {
  if (totalPages <= 1) return html``;
  const { attr = 'data-page' } = opts;
  const nums = [];
  const push = (n) => nums.push(n);
  push(1);
  for (let n = Math.max(2, page - 1); n <= Math.min(totalPages - 1, page + 1); n++) push(n);
  if (totalPages > 1) push(totalPages);
  const uniq = [...new Set(nums)].sort((a, b) => a - b);

  const items = [];
  let prev = 0;
  for (const n of uniq) {
    if (n - prev > 1) items.push(html`<span class="muted" style="padding:0 4px">…</span>`);
    items.push(html`<button ${raw(`${attr}="${n}"`)} class="${n === page ? 'active' : ''}">${n}</button>`);
    prev = n;
  }
  return html`
    <nav class="pager" aria-label="Pagination">
      <button ${raw(`${attr}="${page - 1}"`)} ${page <= 1 ? raw('disabled') : ''} aria-label="Previous">${icon('chevronLeft')}</button>
      ${items}
      <button ${raw(`${attr}="${page + 1}"`)} ${page >= totalPages ? raw('disabled') : ''} aria-label="Next">${icon('chevronRight')}</button>
    </nav>`;
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------

const SERIES_VARS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)'];
export const seriesColor = (i) => SERIES_VARS[i % SERIES_VARS.length];

const RAMP_VARS = ['var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-5)', 'var(--ramp-6)', 'var(--ramp-7)'];
export const rampColor = (i, n) => RAMP_VARS[Math.min(RAMP_VARS.length - 1, Math.round((i / Math.max(1, n - 1)) * (RAMP_VARS.length - 1)))];

let tipEl = null;

function ensureTip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.style.opacity = '0';
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

export function showTip(evt, htmlContent) {
  const el = ensureTip();
  el.innerHTML = toStr(htmlContent);
  el.style.opacity = '1';
  const pad = 12;
  const rect = el.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY - rect.height - pad;
  if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
  if (y < 8) y = evt.clientY + pad;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function hideTip() {
  if (tipEl) tipEl.style.opacity = '0';
}

/**
 * Horizontal or vertical bar chart.
 * Single series → no legend (the title names it). Values are direct-labeled
 * rather than printed on every axis tick.
 */
export function barChart(data, opts = {}) {
  const {
    height = 200, valueFormat = (v) => v, color = 'var(--series-1)',
    ordinal = false, maxOverride = null, labelEvery = 1, horizontal = false, barLabel = true,
  } = opts;
  if (!data.length) return html`<div class="empty"><div class="empty-title">No data</div></div>`;

  const max = maxOverride ?? Math.max(...data.map((d) => d.value), 1);

  if (horizontal) {
    const rowH = 26;
    const h = data.length * rowH;
    const labelW = 108;
    return html`
      <svg class="chart" viewBox="0 0 400 ${h}" preserveAspectRatio="none" style="height:${h}px" role="img">
        ${data.map((d, i) => {
          const y = i * rowH + 4;
          const w = Math.max(2, ((400 - labelW - 46) * d.value) / max);
          const c = ordinal ? rampColor(i, data.length) : (d.color || color);
          return html`
            <text class="axis-text" x="0" y="${y + 12}" dominant-baseline="middle">${d.label}</text>
            <rect class="bar-mark" x="${labelW}" y="${y + 2}" width="${w}" height="${rowH - 10}" fill="${raw(c)}"
                  data-tip="${d.label}: ${valueFormat(d.value)}"></rect>
            <text class="value-text" x="${labelW + w + 6}" y="${y + 12}" dominant-baseline="middle">${valueFormat(d.value)}</text>`;
        })}
      </svg>`;
  }

  const w = 100 * data.length;
  const padB = 22;
  const padT = barLabel ? 16 : 4;
  const plotH = height - padB - padT;
  const bw = 62;
  return html`
    <svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" style="height:${height}px" role="img">
      ${[0.25, 0.5, 0.75, 1].map((f) => html`<line class="grid-line" x1="0" x2="${w}" y1="${padT + plotH * (1 - f)}" y2="${padT + plotH * (1 - f)}" vector-effect="non-scaling-stroke"/>`)}
      <line class="axis-line" x1="0" x2="${w}" y1="${padT + plotH}" y2="${padT + plotH}" vector-effect="non-scaling-stroke"/>
      ${data.map((d, i) => {
        const bh = Math.max(2, (plotH * d.value) / max);
        const x = i * 100 + (100 - bw) / 2;
        const y = padT + plotH - bh;
        const c = ordinal ? rampColor(i, data.length) : (d.color || color);
        return html`
          <rect class="bar-mark" x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${raw(c)}"
                data-tip="${d.label}: ${valueFormat(d.value)}"></rect>
          ${barLabel ? html`<text class="value-text" x="${x + bw / 2}" y="${y - 5}" text-anchor="middle">${valueFormat(d.value)}</text>` : ''}
          ${i % labelEvery === 0 ? html`<text class="axis-text" x="${x + bw / 2}" y="${height - 6}" text-anchor="middle">${d.label}</text>` : ''}`;
      })}
    </svg>`;
}

/**
 * Multi-series line chart with a crosshair hover layer.
 * @param {Array<{name, color, points:Array<{x,y}>}>} series
 */
export function lineChart(series, opts = {}) {
  const { height = 210, labels = [], valueFormat = (v) => v, yMax = null, yMin = 0, id = 'lc' } = opts;
  const n = series[0]?.points.length || 0;
  if (!n) return html`<div class="empty"><div class="empty-title">No data</div></div>`;

  const w = 620;
  const padL = 34;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const plotW = w - padL - padR;
  const plotH = height - padT - padB;

  const max = yMax ?? Math.max(...series.flatMap((s) => s.points.map((p) => p.y)), 1);
  const min = yMin;
  const xAt = (i) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const yAt = (v) => padT + plotH - (plotH * (v - min)) / (max - min || 1);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);

  return html`
    <svg class="chart" viewBox="0 0 ${w} ${height}" style="height:${height}px" role="img" data-chart="${id}">
      ${ticks.map((t) => html`
        <line class="grid-line" x1="${padL}" x2="${w - padR}" y1="${yAt(t)}" y2="${yAt(t)}"/>
        <text class="axis-text" x="${padL - 6}" y="${yAt(t)}" text-anchor="end" dominant-baseline="middle">${valueFormat(Math.round(t))}</text>`)}
      <line class="axis-line" x1="${padL}" x2="${w - padR}" y1="${padT + plotH}" y2="${padT + plotH}"/>
      ${series.map((s, si) => {
        const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');
        return html`<path class="series-line" d="${d}" stroke="${raw(s.color || seriesColor(si))}"/>`;
      })}
      ${series.map((s, si) => s.points.map((p, i) =>
        (i === 0 || i === n - 1 || n <= 8)
          ? html`<circle class="dot-mark" cx="${xAt(i)}" cy="${yAt(p.y)}" r="3.5" fill="${raw(s.color || seriesColor(si))}"/>`
          : ''))}
      ${labels.map((l, i) => (i % Math.ceil(n / 12) === 0
        ? html`<text class="axis-text" x="${xAt(i)}" y="${height - 6}" text-anchor="middle">${l}</text>`
        : ''))}
      ${Array.from({ length: n }, (_, i) => html`
        <rect class="hit" x="${xAt(i) - plotW / n / 2}" y="${padT}" width="${plotW / n}" height="${plotH}"
              data-idx="${i}" data-label="${labels[i] || i}"></rect>`)}
    </svg>`;
}

/** Compact sparkline for stat tiles — no axes, no labels. */
export function sparkline(values, opts = {}) {
  const { height = 26, color = 'var(--series-1)', width = 90 } = opts;
  if (values.length < 2) return html``;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${((width * i) / (values.length - 1)).toFixed(1)},${(height - 2 - ((height - 4) * (v - min)) / range).toFixed(1)}`)
    .join(' ');
  return html`
    <svg class="chart" viewBox="0 0 ${width} ${height}" style="height:${height}px;width:${width}px" aria-hidden="true">
      <path d="${d}" fill="none" stroke="${raw(color)}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

/**
 * Donut — only for a genuine part-to-whole with few slices.
 * Always paired with a labeled legend, never color alone.
 */
export function donut(data, opts = {}) {
  const { size = 132, thickness = 20, centerLabel = '', centerSub = '' } = opts;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return html`
    <svg class="chart" viewBox="0 0 ${size} ${size}" style="height:${size}px;width:${size}px" role="img">
      ${data.map((d, i) => {
        const frac = d.value / total;
        // 2px surface gap between segments.
        const len = Math.max(0, circ * frac - 2);
        const el = html`<circle cx="${c}" cy="${c}" r="${r}" fill="none"
          stroke="${raw(d.color || seriesColor(i))}" stroke-width="${thickness}"
          stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
          stroke-dashoffset="${(-offset).toFixed(2)}"
          transform="rotate(-90 ${c} ${c})"
          data-tip="${d.label}: ${d.value} (${((frac) * 100).toFixed(1)}%)"></circle>`;
        offset += circ * frac;
        return el;
      })}
      ${centerLabel ? html`<text x="${c}" y="${c - 2}" text-anchor="middle" dominant-baseline="middle"
        style="font-size:19px;font-weight:660;fill:var(--ink)">${centerLabel}</text>` : ''}
      ${centerSub ? html`<text x="${c}" y="${c + 15}" text-anchor="middle" style="font-size:10px;fill:var(--ink-3)">${centerSub}</text>` : ''}
    </svg>`;
}

export function legend(items) {
  return html`
    <div class="legend">
      ${items.map((it, i) => html`
        <span class="legend-item">
          <span class="legend-swatch ${it.line ? 'line' : ''}" style="background:${raw(it.color || seriesColor(i))}"></span>
          ${it.label}${it.value !== undefined ? html` <strong class="num">${it.value}</strong>` : ''}
        </span>`)}
    </div>`;
}

/** Stacked horizontal bar — part-to-whole in a single row. */
export function stackBar(segments, opts = {}) {
  const { height = 9 } = opts;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return html`
    <div style="display:flex;gap:2px;height:${height}px;border-radius:99px;overflow:hidden">
      ${segments.filter((s) => s.value > 0).map((s, i) => html`
        <div title="${s.label}: ${s.value}" style="width:${((s.value / total) * 100).toFixed(2)}%;background:${raw(s.color || seriesColor(i))}"></div>`)}
    </div>`;
}

/**
 * Wire chart hover for a container. Marks carrying `data-tip` get a tooltip;
 * this is attached once per rendered screen.
 */
export function bindChartTips(root) {
  const host = root || document;
  host.querySelectorAll('[data-tip]').forEach((el) => {
    el.addEventListener('mousemove', (e) => showTip(e, html`<div class="chart-tip-title">${el.dataset.tip}</div>`));
    el.addEventListener('mouseleave', hideTip);
  });
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Trigger a file download from a string — used for CSV and backup exports. */
export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows, columns) {
  const escape = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(c.value(r))).join(',')).join('\n');
  return `${head}\n${body}`;
}
