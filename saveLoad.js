// ============================================================
// SAVE / LOAD — serialize game state + params (no DOM)
// ============================================================

import { YIELD_CURVE, cloneYieldCurve } from "./investments/yieldCurve.js";
import { normalizeIndexFundAutobuy } from "./investments/indexFunds.js";
import { normalizeTreasuryBondAutobuy } from "./investments/treasuryBonds.js";
import { normalizeOptionMarketDte } from "./investments/options.js";
import { normalizeMarketCardAutobuy } from "./investments/marketAutobuy.js";
import { ensureAssetLots, EMPTY_CUMULATIVE_REALIZED_PL, trimLog } from "./investments/shared.js";

const EMPTY_ASSET_UNLOCK_DAYS = {
  bonds: null,
  stocks: null,
  cryptos: null,
  options: null,
};

export const SAVE_VERSION = 1;
export const SAVE_STORAGE_KEY = "bigstacks-save-v1";

/**
 * Normalize persisted state so older or partial saves remain playable.
 * @param {object|null|undefined} raw
 * @returns {object|null}
 */
export function normalizeLoadedState(raw) {
  if (!raw || typeof raw !== "object") return null;

  const state = { ...raw };

  if (!Number.isFinite(state.day) || !Number.isFinite(state.cash)) return null;

  state.maxDays = Number.isFinite(state.maxDays) ? state.maxDays : 30000;
  state.startCash = Number.isFinite(state.startCash) ? state.startCash : state.cash;
  state.startNetWorth = Number.isFinite(state.startNetWorth) ? state.startNetWorth : state.startCash;
  state.lifeIncomeTotal = Number.isFinite(state.lifeIncomeTotal) ? state.lifeIncomeTotal : 0;

  state.indexFunds = (state.indexFunds || []).map(f => ensureAssetLots(f, "shares"));
  state.cryptos = (state.cryptos || []).map(c => ensureAssetLots(c, "coins"));
  state.stocks = (state.stocks || []).map(s => ensureAssetLots(s, "shares"));

  state.bondHoldings = state.bondHoldings || [];
  state.corporateBondOffers = state.corporateBondOffers || [];
  state.options = state.options || [];
  state.optionHoldings = state.optionHoldings || [];
  state.perpHoldings = state.perpHoldings || [];
  state.bankruptStockDisplay = state.bankruptStockDisplay || [];
  state.log = trimLog(Array.isArray(state.log) ? state.log : []);

  state.unlockedBonds = !!state.unlockedBonds;
  state.unlockedStocks = !!state.unlockedStocks;
  state.unlockedCrypto = !!state.unlockedCrypto;
  state.unlockedOptions = !!state.unlockedOptions;

  state.assetUnlockDays = { ...EMPTY_ASSET_UNLOCK_DAYS, ...(state.assetUnlockDays || {}) };
  state.cumulativeRealizedPL = { ...EMPTY_CUMULATIVE_REALIZED_PL, ...(state.cumulativeRealizedPL || {}) };

  state.indexFundAutobuy = normalizeIndexFundAutobuy(state.indexFundAutobuy);
  state.treasuryBondAutobuy = normalizeTreasuryBondAutobuy(state.treasuryBondAutobuy);
  state.optionMarketDte = normalizeOptionMarketDte(state.optionMarketDte);

  const cardMap = state.marketCardAutobuy && typeof state.marketCardAutobuy === "object"
    ? state.marketCardAutobuy
    : {};
  state.marketCardAutobuy = Object.fromEntries(
    Object.entries(cardMap).map(([key, cfg]) => [key, normalizeMarketCardAutobuy(cfg)])
  );

  state.yieldCurve = state.yieldCurve?.length ? state.yieldCurve : cloneYieldCurve(YIELD_CURVE);
  state.netWorthHistory = Array.isArray(state.netWorthHistory) ? state.netWorthHistory : [];
  state.netWorthStackHistory = Array.isArray(state.netWorthStackHistory) ? state.netWorthStackHistory : [];
  state.netWorthDailyStartDay = Number.isFinite(state.netWorthDailyStartDay)
    ? state.netWorthDailyStartDay
    : 1;
  state.netWorthHistoryBuckets = Array.isArray(state.netWorthHistoryBuckets) ? state.netWorthHistoryBuckets : [];
  state.netWorthStackBuckets = Array.isArray(state.netWorthStackBuckets) ? state.netWorthStackBuckets : [];

  if (state.casino == null || typeof state.casino !== "object") {
    state.casino = { hiLoAnchor: 50 };
  }

  return state;
}

/** @param {object} params */
export function normalizeLoadedParams(params) {
  if (!params || typeof params !== "object") return {};
  const out = { ...params };
  if (Number.isFinite(out.optionMarketDte)) {
    out.optionMarketDte = normalizeOptionMarketDte(out.optionMarketDte);
  }
  return out;
}

/**
 * @param {object} state
 * @param {object} params
 * @param {object} [meta]
 */
export function buildSavePayload(state, params, meta = {}) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state,
    params: params || {},
    meta: meta || {},
  };
}

/** Rebuild a storable payload from parsed save data (preserves original savedAt). */
export function payloadFromParsed(parsed) {
  if (!parsed?.state) return null;
  return {
    version: SAVE_VERSION,
    savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : Date.now(),
    state: parsed.state,
    params: parsed.params || {},
    meta: parsed.meta || {},
  };
}

export function buildExportFilename(state, savedAt = Date.now()) {
  const day = Math.max(1, Math.floor(Number(state?.day)) || 1);
  const d = new Date(savedAt);
  const stamp = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "unknown-date";
  return `bigstacks-day${day}-${stamp}.json`;
}

export function savePayloadToJson(payload, { pretty = true } = {}) {
  return pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);
}

/**
 * @param {string} raw
 * @returns {{ state: object, params: object, meta: object, savedAt: number }|null}
 */
export function parseSavePayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  try {
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    const state = normalizeLoadedState(data.state);
    if (!state) return null;
    return {
      state,
      params: normalizeLoadedParams(data.params),
      meta: data.meta && typeof data.meta === "object" ? data.meta : {},
      savedAt: Number.isFinite(data.savedAt) ? data.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}
