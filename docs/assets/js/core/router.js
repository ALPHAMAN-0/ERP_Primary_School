/**
 * Hash router.
 *
 * Hash routing rather than the History API because GitHub Pages serves static
 * files with no rewrite rule — a deep link like /students/26010042 would 404 on
 * refresh, while #/students/26010042 always resolves to index.html.
 *
 * Route ids match the ASP.NET controller names one-for-one, so `#/attendance`
 * here is `AttendanceController.Index` there.
 */

const routes = new Map();
let notFound = null;
let beforeEach = null;
let current = null;

export function route(id, handler) {
  routes.set(id, handler);
}

export function setNotFound(handler) {
  notFound = handler;
}

/** Guard hook — return false to block navigation (used for role checks). */
export function onBeforeEach(fn) {
  beforeEach = fn;
}

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = clean.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { id: segments[0] || 'dashboard', params: segments.slice(1), query };
}

export function navigate(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#/${path.replace(/^\//, '')}`;
  if (location.hash === target) {
    resolve();
    return;
  }
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
}

export function currentRoute() {
  return current;
}

export function resolve() {
  const parsed = parseHash();
  current = parsed;
  if (beforeEach && beforeEach(parsed) === false) return;
  const handler = routes.get(parsed.id);
  if (handler) handler(parsed);
  else if (notFound) notFound(parsed);
}

export function start() {
  window.addEventListener('hashchange', resolve);
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  resolve();
}

/** Build a hash link, preserving the leading marker. */
export function link(path) {
  return `#/${String(path).replace(/^\/?#?\/?/, '')}`;
}
