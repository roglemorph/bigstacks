import { tradeAsset, evolveTrackedAssets, appendLog, fmt, DEFAULT_MARKET_DRIFT } from "./shared.js";
import { resolveRng } from "./rng.js";

export const INDEX_FUNDS = [
  { id: "spy",  name: "Index Fund A (Broad Market)", startPrice: 100.0, dailyVol: 0.0126 },
];

export const DEFAULT_INDEX_FUND_AUTOBUY = {
  enabled: false,
  qty: 1,
  everyDays: 1,
  assetId: INDEX_FUNDS[0]?.id ?? "spy",
  lastRunDay: null,
};

export function normalizeIndexFundAutobuy(cfg) {
  const base = { ...DEFAULT_INDEX_FUND_AUTOBUY, ...(cfg || {}) };
  const qty = Math.max(1, parseInt(base.qty, 10) || 1);
  const everyDays = Math.max(1, parseInt(base.everyDays, 10) || 1);
  const validIds = INDEX_FUNDS.map(f => f.id);
  const assetId = validIds.includes(base.assetId) ? base.assetId : DEFAULT_INDEX_FUND_AUTOBUY.assetId;
  const lastRunDay =
    base.lastRunDay == null || !Number.isFinite(base.lastRunDay)
      ? null
      : Math.max(0, parseInt(base.lastRunDay, 10));
  return { enabled: !!base.enabled, qty, everyDays, assetId, lastRunDay };
}

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
  const rng = resolveRng(params);
  const dailyVol = params.volIndex ?? 0.0126;
  const drift = params.driftIndex ?? DEFAULT_MARKET_DRIFT;
  return evolveTrackedAssets(s.indexFunds, {
    overrideVol: dailyVol,
    includeMonthlyHistory: true,
    drift,
    isMonthEnd,
    randn: () => rng.randn(),
  });
}

/** Buy configured index-fund shares after each day advance when the interval has elapsed. */
export function processIndexFundAutobuy(state) {
  const cfg = normalizeIndexFundAutobuy(state.indexFundAutobuy);
  if (!cfg.enabled) return state;
  const day = state.day;
  if (cfg.lastRunDay != null && day - cfg.lastRunDay < cfg.everyDays) {
    return state;
  }
  const fund = (state.indexFunds || []).find(f => f.id === cfg.assetId);
  if (!fund) return state;
  const cost = cfg.qty * fund.price;
  if (cost > state.cash) {
    const intervalNote =
      cfg.everyDays === 1 ? "" : ` (scheduled every ${cfg.everyDays} days)`;
    return appendLog(
      state,
      `Index autobuy skipped — need ${fmt(cost)} for ${cfg.qty} share(s)${intervalNote}, have ${fmt(state.cash)}.`,
      "info"
    );
  }
  const bought = buyIndexFund(state, cfg.assetId, cfg.qty);
  return {
    ...bought,
    indexFundAutobuy: normalizeIndexFundAutobuy({ ...cfg, lastRunDay: day }),
  };
}
