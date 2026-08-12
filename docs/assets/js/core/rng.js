/**
 * Deterministic pseudo-randomness.
 *
 * Everything derived in the browser twin — a student's name, a day's attendance,
 * a subject mark — is a pure function of a string seed. The same seed always
 * yields the same value, in this browser or any other, today or next year.
 *
 * That is what lets the demo carry 3,000+ students with a full year of
 * attendance and three exam terms without storing a single row: the data is
 * recomputed on demand instead of persisted. Only *writes* are stored, as an
 * overlay (see store.js).
 */

/** FNV-1a 32-bit hash — small, fast, well-distributed for short string keys. */
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 — a compact, high-quality 32-bit PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded generator bound to a string key. */
export function rngFor(key) {
  return mulberry32(hash(key));
}

/** A single deterministic float in [0,1) for a key — no generator to carry. */
export function rand(key) {
  return mulberry32(hash(key))();
}

/** Deterministic integer in [min, max] inclusive. */
export function randInt(key, min, max) {
  return min + Math.floor(rand(key) * (max - min + 1));
}

/** Deterministic pick from an array. */
export function pick(key, arr) {
  return arr[Math.floor(rand(key) * arr.length)];
}

/** Deterministic weighted pick. `weights` parallels `arr`. */
export function pickWeighted(key, arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand(key) * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/**
 * Deterministic normal-ish value via the mean of several uniforms
 * (central limit). Produces the bell curve real marks and attendance follow —
 * uniform randomness would make every class look identical and implausible.
 */
export function gaussian(key, mean = 0, stdDev = 1) {
  const next = rngFor(key);
  const sum = next() + next() + next() + next() + next() + next();
  return mean + (sum - 3) * stdDev;
}

/** Deterministic shuffle (Fisher–Yates driven by a seeded generator). */
export function shuffle(key, arr) {
  const out = arr.slice();
  const next = rngFor(key);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** True with probability `p`, deterministically for the key. */
export function chance(key, p) {
  return rand(key) < p;
}
