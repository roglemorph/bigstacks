import { resolveRng } from "./rng.js";

/** Box-Muller normal draw using params.rng when present. */
export function randn(paramsOrRng = {}) {
  const rng = paramsOrRng?.randn ? paramsOrRng : resolveRng(paramsOrRng);
  return rng.randn();
}

export function fmt(n) {
  return "$" + Math.round(n).toLocaleString();
}

/** Signed dollars for option trade P/L in logs (two decimals). */
export function fmtSignedMoney2(n) {
  const sign = n >= 0 ? "+" : "−";
  return sign + "$" + Math.abs(n).toFixed(2);
}

export const LOG_MAX_ENTRIES = 1000;

export function trimLog(log) {
  const arr = log || [];
  return arr.length > LOG_MAX_ENTRIES ? arr.slice(-LOG_MAX_ENTRIES) : arr;
}

export function appendLog(state, msg, type) {
  return { ...state, log: trimLog([...(state.log || []), { msg, type, day: state.day }]) };
}

/** Running totals of realized P/L by asset bucket (closed trades, bond exits, option settlements). */
export const EMPTY_CUMULATIVE_REALIZED_PL = {
  indexFunds: 0,
  cryptos: 0,
  stocks: 0,
  bonds: 0,
  options: 0,
  casino: 0,
};

export function addCumulativeRealizedPL(state, bucket, delta) {
  if (!Number.isFinite(delta) || delta === 0) return state;
  const cur = { ...EMPTY_CUMULATIVE_REALIZED_PL, ...(state.cumulativeRealizedPL || {}) };
  const prev = cur[bucket];
  const base = Number.isFinite(prev) ? prev : 0;
  return { ...state, cumulativeRealizedPL: { ...cur, [bucket]: base + delta } };
}

/** @typedef {{ qty: number, unitCost: number, purchaseDay: number }} AssetTaxLot */

/**
 * Backfill `lots` from legacy aggregate `costBasis` / holding qty (older saves).
 * @param {object} asset
 * @param {string} holdingKey - e.g. shares, coins
 */
export function ensureAssetLots(asset, holdingKey) {
  if (Array.isArray(asset.lots)) return asset;
  const owned = asset[holdingKey] || 0;
  if (owned <= 0) return { ...asset, lots: [] };
  const basis = asset.costBasis || 0;
  const unitCost =
    basis > 0 ? basis / owned : (asset.price ?? asset.startPrice ?? 0);
  return {
    ...asset,
    lots: [{ qty: owned, unitCost, purchaseDay: 0 }],
  };
}

function sumLotCostBasis(lots, qtyKey, costKey) {
  return (lots || []).reduce((s, l) => s + (l[qtyKey] ?? 0) * (l[costKey] ?? 0), 0);
}

/**
 * Remove `sellQty` using HIFO (highest unit cost first; newer lot wins ties).
 * @param {object[]} lots
 * @param {number} sellQty
 * @param {{ qty?: string, cost?: string, day?: string }} [keys]
 * @returns {{ nextLots: object[], costRemoved: number }}
 */
export function drainLotsHifo(lots, sellQty, keys = {}) {
  const qtyKey = keys.qty ?? "qty";
  const costKey = keys.cost ?? "unitCost";
  const dayKey = keys.day ?? "purchaseDay";
  const working = (lots || []).map(l => ({ ...l }));
  const order = working
    .map((lot, i) => ({ lot, i }))
    .filter(({ lot }) => (lot[qtyKey] ?? 0) > 0)
    .sort((a, b) => {
      const costDiff = (b.lot[costKey] ?? 0) - (a.lot[costKey] ?? 0);
      if (costDiff !== 0) return costDiff;
      return (b.lot[dayKey] ?? 0) - (a.lot[dayKey] ?? 0);
    });

  let remaining = sellQty;
  let costRemoved = 0;
  for (const { lot, i } of order) {
    if (remaining <= 0) break;
    const available = lot[qtyKey] ?? 0;
    if (available <= 0) continue;
    const take = Math.min(remaining, available);
    costRemoved += take * (lot[costKey] ?? 0);
    remaining -= take;
    working[i] = { ...lot, [qtyKey]: available - take };
  }
  const nextLots = working.filter(l => (l[qtyKey] ?? 0) > 0);
  return { nextLots, costRemoved };
}

/** Cost basis consumed when selling `sellQty` HIFO without mutating `asset`. */
export function costBasisForHifoSale(asset, holdingKey, sellQty) {
  const withLots = ensureAssetLots(asset, holdingKey);
  return drainLotsHifo(withLots.lots, sellQty).costRemoved;
}

export function tradeAsset(state, listKey, assetId, qty, mode, unitLabel) {
  const list = state[listKey] || [];
  const idx = list.findIndex(a => a.id === assetId);
  if (idx < 0) return appendLog(state, "Asset not found.", "bad");
  const asset = list[idx];
  const price = asset.price;
  const holdingKey = unitLabel === "coin" ? "coins" : (unitLabel === "contract" ? "contracts" : "shares");
  const owned = asset[holdingKey];

  if (mode === "buy") {
    const cost = qty * price;
    if (cost > state.cash) return appendLog(state, `Need ${fmt(cost)} — only have ${fmt(state.cash)}.`, "bad");
    const base = ensureAssetLots(asset, holdingKey);
    const lots = [
      ...(base.lots || []),
      { qty, unitCost: price, purchaseDay: state.day },
    ];
    const nextOwned = owned + qty;
    const updated = {
      ...base,
      [holdingKey]: nextOwned,
      lots,
      costBasis: sumLotCostBasis(lots, "qty", "unitCost"),
    };
    const nextList = [...list];
    nextList[idx] = updated;
    const next = { ...state, cash: state.cash - cost, [listKey]: nextList };
    return appendLog(next, `Bought ${qty} ${asset.name} ${unitLabel}(s) @ $${price.toFixed(2)}.`, "good");
  }

  const sellQty = Math.min(Math.max(1, qty), owned);
  if (sellQty <= 0 || owned <= 0) {
    return appendLog(state, `No ${unitLabel}(s) to sell.`, "bad");
  }
  const proceeds = sellQty * price;
  const base = ensureAssetLots(asset, holdingKey);
  const { nextLots, costRemoved } = drainLotsHifo(base.lots, sellQty);
  const nextOwned = owned - sellQty;
  const nextCostBasis =
    nextOwned <= 0 ? 0 : Math.max(0, (base.costBasis || 0) - costRemoved);
  const updated = {
    ...base,
    [holdingKey]: nextOwned,
    lots: nextLots,
    costBasis: nextCostBasis,
  };
  const nextList = [...list];
  nextList[idx] = updated;
  const realizedPl = proceeds - costRemoved;
  let next = { ...state, cash: state.cash + proceeds, [listKey]: nextList };
  if (listKey === "indexFunds" || listKey === "cryptos" || listKey === "stocks") {
    next = addCumulativeRealizedPL(next, listKey, realizedPl);
  }
  const partialNote = sellQty < qty ? ` (capped at ${sellQty} held)` : "";
  return appendLog(next, `Sold ${sellQty} ${asset.name} ${unitLabel}(s) @ $${price.toFixed(2)}.${partialNote}`, "info");
}

/** Default expected daily return when `params.driftIndex` is unset (0.025% / day). */
export const DEFAULT_MARKET_DRIFT = 0.00025;

/**
 * One-day price evolution for listed assets (index funds, crypto, stocks).
 * @param {boolean} includeMonthlyHistory - when true, keeps full history and updates monthlyHistory on month-end
 * @param {(asset: object) => number} [driftPerAsset] - additive daily drift per asset (on top of `drift`), e.g. crypto OG bonus
 */
export function evolveTrackedAssets(assets, {
  overrideVol,
  volMultiplier = 1,
  includeMonthlyHistory = false,
  drift = 0,
  isMonthEnd,
  randn: randnFn,
  driftPerAsset,
}) {
  return (assets || []).map(asset => {
    const baseVol = overrideVol ?? asset.dailyVol;
    const vol = (Number.isFinite(baseVol) ? baseVol : 0.02) * (Number.isFinite(volMultiplier) ? volMultiplier : 1);
    const shock = randnFn() * vol;
    let assetDrift = drift;
    if (typeof driftPerAsset === "function") {
      const add = driftPerAsset(asset);
      if (Number.isFinite(add)) assetDrift += add;
    }
    const price = Math.max(0.01, asset.price * (1 + assetDrift + shock));
    const next = {
      ...asset,
      price,
      history: [...(asset.history || []), price].slice(-500),
    };
    if (includeMonthlyHistory) {
      const monthly = asset.monthlyHistory || [];
      next.monthlyHistory = isMonthEnd
        ? [...monthly, price].slice(-100)
        : monthly;
    }
    return next;
  });
}
