/**
 * The Time Machine.
 *
 * Every screen reads "now" from here rather than calling `new Date()` directly,
 * so the whole system can be moved to any point in the academic year. That
 * turns a demo problem into a feature: a reviewer can stand on results-publish
 * day, on a fee due date, or mid-term and see exactly what the staff would see.
 *
 * In production this is simply `DateTime.Now` — the override exists only in the
 * twin, and the seam is one function wide.
 */

import * as store from './store.js';
import { ACADEMIC_YEAR } from './spec.js';

/** The real wall clock. */
export function realNow() {
  return new Date();
}

/** The effective "now" — an override if the Time Machine is engaged. */
export function now() {
  const override = store.getSettings().today;
  if (override) {
    const d = new Date(`${override}T09:30:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const real = realNow();
  // The demo ships a full academic year of data. If the real date sits outside
  // it, anchor to a rich mid-year point so nothing looks empty on first open.
  const start = new Date(ACADEMIC_YEAR.start);
  const end = new Date(ACADEMIC_YEAR.end);
  if (real < start || real > end) return new Date(`${ACADEMIC_YEAR.year}-08-12T09:30:00`);
  return real;
}

export function today() {
  const d = now();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function todayIso() {
  const d = today();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isOverridden() {
  return Boolean(store.getSettings().today);
}

export function setDate(iso) {
  store.setSetting('today', iso || null);
}

export function clearDate() {
  store.setSetting('today', null);
}

/** Academic month index (0-based) of the effective date, clamped to the year. */
export function academicMonth() {
  return today().getMonth();
}

/** Days elapsed in the academic year — drives "progress through the year" UI. */
export function yearProgress() {
  const start = new Date(ACADEMIC_YEAR.start);
  const end = new Date(ACADEMIC_YEAR.end);
  const t = today();
  const pct = ((t - start) / (end - start)) * 100;
  return Math.max(0, Math.min(100, pct));
}
