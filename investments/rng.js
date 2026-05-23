/** @typedef {{ random(): number, randn(): number, int(min: number, max: number): number, id(prefix?: string): string }} GameRng */

let _fallbackRng = null;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function boxMullerRandn(random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Create a deterministic PRNG from a numeric seed (shared markets / replays).
 * @param {number} seed
 * @returns {GameRng}
 */
export function createRng(seed) {
  const random = mulberry32(Number.isFinite(seed) ? seed : Date.now());
  return {
    random,
    randn: () => boxMullerRandn(random),
    int(min, max) {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return lo + Math.floor(random() * (hi - lo + 1));
    },
    id(prefix = "") {
      const hex = Math.floor(random() * 0xffffff).toString(36);
      return prefix ? `${prefix}${hex}` : hex;
    },
  };
}

/** Non-deterministic RNG for solo play when no seed is provided. */
function fallbackRng() {
  if (!_fallbackRng) {
    _fallbackRng = {
      random: () => Math.random(),
      randn: () => boxMullerRandn(Math.random),
      int(min, max) {
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        return lo + Math.floor(Math.random() * (hi - lo + 1));
      },
      id(prefix = "") {
        const hex = Math.random().toString(36).slice(2, 10);
        return prefix ? `${prefix}${hex}` : hex;
      },
    };
  }
  return _fallbackRng;
}

/**
 * Resolve RNG from params.rng or fall back to Math.random (solo).
 * @param {object} [params]
 * @returns {GameRng}
 */
export function resolveRng(params = {}) {
  return params.rng || fallbackRng();
}

/** Attach rng to params (mutates copy). */
export function withRng(params = {}, rng) {
  return { ...params, rng: rng || resolveRng(params) };
}
