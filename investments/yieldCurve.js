import { randn } from "./shared.js";

// Yield curve baseline: term (years) → annual yield (curve in state mean-reverts here over time)
export const YIELD_CURVE = [
  { term: 1,  yield: 0.030 },
  { term: 2,  yield: 0.035 },
  { term: 5,  yield: 0.042 },
  { term: 10, yield: 0.048 },
  { term: 30, yield: 0.052 },
];

/** Interpolate annual yield for a term (years) from a pillar curve. */
export function interpolateYield(curve, term) {
  const exact = curve.find(p => p.term === term);
  if (exact) return exact.yield;
  const below = [...curve].reverse().find(p => p.term <= term);
  const above = curve.find(p => p.term >= term);
  if (!below) return above.yield;
  if (!above) return below.yield;
  const t = (term - below.term) / (above.term - below.term);
  return below.yield + t * (above.yield - below.yield);
}

/** Current market yield for `term` using the state's evolving curve (falls back to baseline). */
export function yieldForTerm(state, term) {
  const curve = state && state.yieldCurve && state.yieldCurve.length ? state.yieldCurve : YIELD_CURVE;
  return interpolateYield(curve, term);
}

export function cloneYieldCurve(curve) {
  return curve.map(p => ({ term: p.term, yield: p.yield }));
}

/** One-day random walk + mean reversion toward YIELD_CURVE pillars. */
export function evolveYieldCurve(state, params = {}) {
  const vol = params.yieldCurveVol ?? 0.0007;
  const kappa = params.yieldCurveKappa ?? 0.018;
  const yMin = params.yieldCurveMin ?? 0.002;
  const yMax = params.yieldCurveMax ?? 0.20;
  const curve = state.yieldCurve && state.yieldCurve.length ? state.yieldCurve : YIELD_CURVE;
  return YIELD_CURVE.map((base, i) => {
    const current = curve[i]?.yield ?? base.yield;
    const shock = randn() * vol;
    let y = current + shock + kappa * (base.yield - current);
    y = Math.max(yMin, Math.min(yMax, y));
    return { term: base.term, yield: y };
  });
}
