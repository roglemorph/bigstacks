import { tradeAsset, evolveTrackedAssets, randn, appendLog } from "./shared.js";

export const INDEX_FUNDS = [
  { id: "spy",  name: "Index Fund A (Broad Market)", startPrice: 100.0, dailyVol: 0.0126 },
];

export function buyIndexFund(state, assetId, qty) {
  return tradeAsset(state, "indexFunds", assetId, qty, "buy", "share");
}

export function sellIndexFund(state, assetId, qty) {
  return tradeAsset(state, "indexFunds", assetId, qty, "sell", "share");
}

/** Backwards-compatible wrappers (default to first index fund) */
export function buy(state, qty) {
  const first = (state.indexFunds || [])[0];
  return first ? buyIndexFund(state, first.id, qty) : appendLog(state, "No index funds configured.", "bad");
}

export function sell(state, qty) {
  const first = (state.indexFunds || [])[0];
  return first ? sellIndexFund(state, first.id, qty) : appendLog(state, "No index funds configured.", "bad");
}

export function indexFundsPortfolioValue(state) {
  return (state.indexFunds || []).reduce((sum, f) => sum + (f.shares * f.price), 0);
}

export function evolveIndexFundsForDay(s, params, isMonthEnd) {
  const dailyVol = params.volIndex ?? 0.0126;
  const indexDrift = params.driftIndex ?? 0.00025;
  return evolveTrackedAssets(s.indexFunds, {
    overrideVol: dailyVol,
    includeMonthlyHistory: true,
    drift: indexDrift,
    isMonthEnd,
    randn,
  });
}
