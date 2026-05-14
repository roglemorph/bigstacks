// Box-Muller normal distribution
export function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function fmt(n) {
  return "$" + Math.round(n).toLocaleString();
}

/** Signed dollars for option trade P/L in logs (two decimals). */
export function fmtSignedMoney2(n) {
  const sign = n >= 0 ? "+" : "−";
  return sign + "$" + Math.abs(n).toFixed(2);
}

export function appendLog(state, msg, type) {
  return { ...state, log: [...state.log, { msg, type, day: state.day }] };
}

/** Running totals of realized P/L by asset bucket (closed trades, bond exits, option settlements). */
export const EMPTY_CUMULATIVE_REALIZED_PL = {
  indexFunds: 0,
  cryptos: 0,
  stocks: 0,
  bonds: 0,
  options: 0,
};

export function addCumulativeRealizedPL(state, bucket, delta) {
  if (!Number.isFinite(delta) || delta === 0) return state;
  const cur = { ...EMPTY_CUMULATIVE_REALIZED_PL, ...(state.cumulativeRealizedPL || {}) };
  return { ...state, cumulativeRealizedPL: { ...cur, [bucket]: cur[bucket] + delta } };
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
    const updated = { ...asset, [holdingKey]: owned + qty, costBasis: (asset.costBasis || 0) + cost };
    const nextList = [...list];
    nextList[idx] = updated;
    const next = { ...state, cash: state.cash - cost, [listKey]: nextList };
    return appendLog(next, `Bought ${qty} ${asset.name} ${unitLabel}(s) @ $${price.toFixed(2)}.`, "good");
  }

  if (qty > owned) return appendLog(state, `Only have ${owned} ${unitLabel}(s).`, "bad");
  const proceeds = qty * price;
  const avgCost = owned > 0 ? (asset.costBasis || 0) / owned : 0;
  const nextOwned = owned - qty;
  const nextCostBasis = nextOwned <= 0 ? 0 : Math.max(0, (asset.costBasis || 0) - (avgCost * qty));
  const updated = { ...asset, [holdingKey]: nextOwned, costBasis: nextCostBasis };
  const nextList = [...list];
  nextList[idx] = updated;
  const realizedPl = proceeds - avgCost * qty;
  let next = { ...state, cash: state.cash + proceeds, [listKey]: nextList };
  if (listKey === "indexFunds" || listKey === "cryptos" || listKey === "stocks") {
    next = addCumulativeRealizedPL(next, listKey, realizedPl);
  }
  return appendLog(next, `Sold ${qty} ${asset.name} ${unitLabel}(s) @ $${price.toFixed(2)}.`, "info");
}

/**
 * One-day price evolution for listed assets (index funds, crypto, stocks).
 * @param {boolean} includeMonthlyHistory - when true, keeps full history and updates monthlyHistory on month-end
 */
export function evolveTrackedAssets(assets, {
  overrideVol,
  includeMonthlyHistory = false,
  drift = 0,
  isMonthEnd,
  randn: randnFn,
}) {
  return (assets || []).map(asset => {
    const vol = overrideVol ?? asset.dailyVol;
    const shock = randnFn() * vol;
    const price = Math.max(0.01, asset.price * (1 + drift + shock));
    const next = {
      ...asset,
      price,
      history: includeMonthlyHistory
        ? [...asset.history, price]
        : [...asset.history, price].slice(-500),
    };
    if (includeMonthlyHistory) {
      next.monthlyHistory = isMonthEnd
        ? [...(asset.monthlyHistory || []), price]
        : (asset.monthlyHistory || []);
    }
    return next;
  });
}
