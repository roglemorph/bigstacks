import { appendLog, fmt, fmtSignedMoney2, randn, addCumulativeRealizedPL } from "./shared.js";

/** Default / legacy listed-tenor when `optionMarketDte` is missing (older saves). */
export const MARKET_OPTION_DTE = 30;
/** Allowed tenors for new trades and listed chain (toggle in UI). */
export const OPTION_MARKET_DTE_CHOICES = [7, 30, 90];
/** Longest tenor — used to scale time value in listed-option repricing across 7/30/90. */
export const OPTION_REFERENCE_DTE = 90;
/** Each option contract controls this many underlying index "shares" for premium and settlement. */
export const OPTION_SHARES_PER_CONTRACT = 100;

export function normalizeOptionMarketDte(dte) {
  const n = parseInt(dte, 10);
  return OPTION_MARKET_DTE_CHOICES.includes(n) ? n : MARKET_OPTION_DTE;
}

export const OPTIONS = [
  { id: "spy-upper-call", name: "Call OTM", optionType: "call", strikeRef: "upper", startPrice: 580, dailyVol: 0.0780, underlyingId: "spy", leverage: 3.0, theta: 0.0032, direction: 1 },
  { id: "spy-mid-call", name: "Call ATM", optionType: "call", strikeRef: "mid", startPrice: 820, dailyVol: 0.0850, underlyingId: "spy", leverage: 4.2, theta: 0.0045, direction: 1 },
  { id: "spy-lower-call", name: "Call ITM", optionType: "call", strikeRef: "lower", startPrice: 1050, dailyVol: 0.0820, underlyingId: "spy", leverage: 3.5, theta: 0.0039, direction: 1 },
  { id: "spy-lower-put", name: "Put OTM", optionType: "put", strikeRef: "lower", startPrice: 560, dailyVol: 0.0780, underlyingId: "spy", leverage: 3.0, theta: 0.0032, direction: -1 },
  { id: "spy-mid-put", name: "Put ATM", optionType: "put", strikeRef: "mid", startPrice: 800, dailyVol: 0.0850, underlyingId: "spy", leverage: 4.2, theta: 0.0045, direction: -1 },
  { id: "spy-upper-put", name: "Put ITM", optionType: "put", strikeRef: "upper", startPrice: 1020, dailyVol: 0.0820, underlyingId: "spy", leverage: 3.5, theta: 0.0039, direction: -1 },
];

function roundToNearestFive(n) {
  return Math.max(1, Math.round(n / 5) * 5);
}

export function optionStrikesForUnderlying(underlyingPrice, offsetPct = 0.08) {
  const center = Math.max(1, underlyingPrice);
  let lower = roundToNearestFive(center * (1 - offsetPct));
  let upper = roundToNearestFive(center * (1 + offsetPct));
  if (lower >= upper) upper = lower + 5;
  let mid = roundToNearestFive(center);
  if (mid <= lower) mid = lower + 5;
  if (mid >= upper) mid = upper - 5;
  if (mid <= lower || mid >= upper) {
    mid = Math.round(((lower + upper) / 2) / 5) * 5;
    if (mid <= lower) mid = lower + 5;
    if (mid >= upper) mid = upper - 5;
  }
  return { lower, mid, upper };
}

export function buildInitialListedOptions(strikes, baseUnderlying, marketDte = MARKET_OPTION_DTE) {
  const dte = normalizeOptionMarketDte(marketDte);
  return OPTIONS.map(opt => ({
    ...opt,
    strike: strikes[opt.strikeRef] ?? baseUnderlying,
    price: opt.startPrice,
    history: [opt.startPrice],
    daysToExpiry: dte,
  }));
}

/** Open lots only (not yet expired this session). */
export function openOptionHoldings(state) {
  const day = state.day;
  return (state.optionHoldings || []).filter(h => day < h.expiryDay);
}

function optionLotMarkPrice(lot, underlyingPrice, asOfDay) {
  if (asOfDay >= lot.expiryDay) return 0;
  const strike = lot.strike;
  const remainingDte = Math.max(1, lot.expiryDay - asOfDay);
  const intrinsicPerShare =
    lot.optionType === "put"
      ? Math.max(strike - underlyingPrice, 0)
      : Math.max(underlyingPrice - strike, 0);
  const intrinsicTotal = intrinsicPerShare * OPTION_SHARES_PER_CONTRACT;
  const moneyness = Math.abs(underlyingPrice - strike) / Math.max(strike, 1);
  const term0 = Math.max(1, lot.initialDte ?? MARKET_OPTION_DTE);
  const dteNorm = Math.min(1, remainingDte / term0);
  const baseTimeValuePerShare = Math.max(0.08, underlyingPrice * 0.014 * dteNorm * (1 - Math.min(moneyness, 1)));
  const timeTotal = baseTimeValuePerShare * 0.95 * OPTION_SHARES_PER_CONTRACT;
  return Math.max(OPTION_SHARES_PER_CONTRACT * 0.05, intrinsicTotal + timeTotal);
}

export function optionHoldingsMarkValue(state) {
  const u = (state.indexFunds || []).find(f => f.id === "spy")?.price ?? 0;
  const day = state.day;
  return openOptionHoldings(state).reduce(
    (sum, lot) => sum + lot.contracts * optionLotMarkPrice(lot, u, day),
    0
  );
}

/** Mark-to-market for one open lot (uses current index price and game day). */
export function markOptionHolding(state, lot) {
  if (!lot || state.day >= lot.expiryDay) return 0;
  const u = (state.indexFunds || []).find(f => f.id === "spy")?.price ?? 0;
  return optionLotMarkPrice(lot, u, state.day);
}

function underlyingPriceForLot(state, lot) {
  return (state.indexFunds || []).find(f => f.id === lot.underlyingId)?.price ?? 0;
}

/** Total cash intrinsic for `contracts` if exercised now (same basis as `exerciseOptionLot`). */
export function optionLotIntrinsicPayout(lot, underlyingPrice, contracts) {
  const c = contracts ?? lot.contracts;
  const intrinsicPerShare =
    lot.optionType === "put" ? Math.max(0, lot.strike - underlyingPrice) : Math.max(0, underlyingPrice - lot.strike);
  return c * intrinsicPerShare * OPTION_SHARES_PER_CONTRACT;
}

/** Unrealized P/L vs cost if all contracts in the lot were sold at current mark (time value + intrinsic). */
export function optionLotUnrealizedPLAtMark(state, lot) {
  if (!lot || state.day >= lot.expiryDay) return 0;
  const m = markOptionHolding(state, lot);
  return lot.contracts * (m - lot.premiumAtPurchase);
}

/** Unrealized P/L vs cost if all contracts were cash-settled at intrinsic only (no time value). */
export function optionLotUnrealizedPLIfExercised(state, lot) {
  if (!lot || state.day >= lot.expiryDay) return 0;
  const u = underlyingPriceForLot(state, lot);
  const payout = optionLotIntrinsicPayout(lot, u, lot.contracts);
  const cost = lot.contracts * lot.premiumAtPurchase;
  return payout - cost;
}

export function optionsHoldingsUnrealizedPL(state) {
  return openOptionHoldings(state).reduce((sum, lot) => sum + optionLotUnrealizedPLAtMark(state, lot), 0);
}

export function buyOption(state, assetId, qty) {
  const list = state.options || [];
  const asset = list.find(a => a.id === assetId);
  if (!asset) return appendLog(state, "Option not found.", "bad");
  const price = asset.price;
  const cost = qty * price;
  if (cost > state.cash) return appendLog(state, `Need ${fmt(cost)} — only have ${fmt(state.cash)}.`, "bad");
  const dte = normalizeOptionMarketDte(state.optionMarketDte);
  const expiryDay = state.day + dte;
  const holding = {
    id: `${state.day}_${Math.random().toString(36).slice(2, 9)}`,
    optionId: asset.id,
    name: asset.name,
    optionType: asset.optionType,
    strike: asset.strike,
    underlyingId: asset.underlyingId,
    contracts: qty,
    premiumAtPurchase: price,
    purchaseDay: state.day,
    expiryDay,
    initialDte: dte,
  };
  const next = {
    ...state,
    cash: state.cash - cost,
    optionHoldings: [...(state.optionHoldings || []), holding],
  };
  return appendLog(
    next,
    `Bought ${qty} ${asset.name} @ $${price.toFixed(2)} — expires day ${expiryDay} (${dte} DTE).`,
    "good"
  );
}

/** Sell contracts FIFO across open lots for this listed option id. */
export function sellOption(state, assetId, qty) {
  const sellCount = Math.max(1, parseInt(qty, 10) || 1);
  let remaining = sellCount;
  const day = state.day;
  let cash = state.cash;
  const holdings = [...(state.optionHoldings || [])];
  const openIdx = holdings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.optionId === assetId && day < h.expiryDay)
    .sort((a, b) => a.h.purchaseDay - b.h.purchaseDay || a.i - b.i);

  const totalContracts = openIdx.reduce((s, { h }) => s + h.contracts, 0);
  if (totalContracts < remaining) {
    return appendLog(state, `Only have ${totalContracts} open contract(s) for that series.`, "bad");
  }

  const list = state.options || [];
  const quote = list.find(a => a.id === assetId);
  let proceeds = 0;
  let totalPl = 0;

  for (const { h, i } of openIdx) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, h.contracts);
    const markPx = markOptionHolding(state, h);
    proceeds += take * markPx;
    totalPl += take * (markPx - h.premiumAtPurchase);
    remaining -= take;
    const nextC = h.contracts - take;
    if (nextC <= 0) holdings[i] = null;
    else holdings[i] = { ...h, contracts: nextC };
  }

  const nextHoldings = holdings.filter(Boolean);
  cash += proceeds;
  const next = addCumulativeRealizedPL({ ...state, cash, optionHoldings: nextHoldings }, "options", totalPl);
  const avgMark = sellCount > 0 ? proceeds / sellCount : 0;
  const logged = appendLog(
    next,
    `Sold ${sellCount} ${quote?.name || assetId} contract(s) at mark (avg $${avgMark.toFixed(2)} / contract), P/L ${fmtSignedMoney2(totalPl)}.`,
    "info"
  );
  return {
    ...logged,
    lastOptionRealized: {
      kind: "sell",
      pl: totalPl,
      contracts: sellCount,
      label: quote?.name || assetId,
    },
  };
}

/** Sell from a specific lot by holding id (partial or full). */
export function sellOptionLot(state, holdingId, qty) {
  const remaining = Math.max(1, parseInt(qty, 10) || 1);
  const day = state.day;
  const idx = (state.optionHoldings || []).findIndex(h => h.id === holdingId);
  if (idx < 0) return appendLog(state, "Option holding not found.", "bad");
  const lot = state.optionHoldings[idx];
  if (day >= lot.expiryDay) return appendLog(state, "That contract has expired.", "bad");
  if (remaining > lot.contracts) {
    return appendLog(state, `Only have ${lot.contracts} contract(s) in that lot.`, "bad");
  }
  const sellPrice = markOptionHolding(state, lot);
  const proceeds = remaining * sellPrice;
  const cost = remaining * lot.premiumAtPurchase;
  const pl = proceeds - cost;
  const nextC = lot.contracts - remaining;
  const nextHoldings = [...(state.optionHoldings || [])];
  if (nextC <= 0) nextHoldings.splice(idx, 1);
  else nextHoldings[idx] = { ...lot, contracts: nextC };
  const next = addCumulativeRealizedPL(
    { ...state, cash: state.cash + proceeds, optionHoldings: nextHoldings },
    "options",
    pl
  );
  const logged = appendLog(
    next,
    `Sold ${remaining} ${lot.name} @ $${sellPrice.toFixed(2)} (P/L ${fmtSignedMoney2(pl)}).`,
    "info"
  );
  return {
    ...logged,
    lastOptionRealized: { kind: "sell", pl, contracts: remaining, label: lot.name },
  };
}

/** Exercise 1+ contracts: cash settle intrinsic (per share × multiplier), remove from holdings. */
export function exerciseOptionLot(state, holdingId, qty) {
  const remaining = Math.max(1, parseInt(qty, 10) || 1);
  const day = state.day;
  const idx = (state.optionHoldings || []).findIndex(h => h.id === holdingId);
  if (idx < 0) return appendLog(state, "Option holding not found.", "bad");
  const lot = state.optionHoldings[idx];
  if (day >= lot.expiryDay) return appendLog(state, "That contract has expired.", "bad");
  if (remaining > lot.contracts) {
    return appendLog(state, `Only have ${lot.contracts} contract(s) in that lot.`, "bad");
  }
  const u = (state.indexFunds || []).find(f => f.id === lot.underlyingId)?.price ?? 0;
  const intrinsicPerShare =
    lot.optionType === "put" ? Math.max(0, lot.strike - u) : Math.max(0, u - lot.strike);
  if (intrinsicPerShare <= 0) {
    return appendLog(state, `Exercise pays nothing — ${lot.name} is out of the money. Sell instead.`, "bad");
  }
  const payout = remaining * intrinsicPerShare * OPTION_SHARES_PER_CONTRACT;
  const cost = remaining * lot.premiumAtPurchase;
  const pl = payout - cost;
  const nextC = lot.contracts - remaining;
  const nextHoldings = [...(state.optionHoldings || [])];
  if (nextC <= 0) nextHoldings.splice(idx, 1);
  else nextHoldings[idx] = { ...lot, contracts: nextC };
  const next = addCumulativeRealizedPL(
    { ...state, cash: state.cash + payout, optionHoldings: nextHoldings },
    "options",
    pl
  );
  const logged = appendLog(
    next,
    `Exercised ${remaining} ${lot.name} (strike $${lot.strike}) — payout ${fmt(payout)}, P/L ${fmtSignedMoney2(pl)}.`,
    "good"
  );
  return {
    ...logged,
    lastOptionRealized: { kind: "exercise", pl, contracts: remaining, label: lot.name },
  };
}

/**
 * Settle lots that expire before `newDay`; mutates cash and returns surviving holdings + log lines.
 */
export function settleExpiredOptionLots(s, { newDay, spyNext, cash }) {
  const newLog = [];
  const nextOptionHoldings = [];
  let nextCash = cash;
  let optionsRealizedPLDelta = 0;
  for (const lot of s.optionHoldings || []) {
    if (newDay < lot.expiryDay) {
      nextOptionHoldings.push(lot);
      continue;
    }
    const intrinsicPerShare =
      lot.optionType === "put" ? Math.max(0, lot.strike - spyNext) : Math.max(0, spyNext - lot.strike);
    const payout = lot.contracts * intrinsicPerShare * OPTION_SHARES_PER_CONTRACT;
    const costBasis = lot.contracts * lot.premiumAtPurchase;
    const settlePl = payout - costBasis;
    optionsRealizedPLDelta += settlePl;
    nextCash += payout;
    newLog.push({
      msg: `${lot.name} (strike $${lot.strike}) expired day ${lot.expiryDay} — auto cash-settlement (intrinsic) ${fmt(payout)} (P/L ${fmtSignedMoney2(settlePl)}).`,
      type: payout > 0 ? "good" : "info",
      day: newDay,
    });
  }
  return { cash: nextCash, optionHoldings: nextOptionHoldings, logLines: newLog, optionsRealizedPLDelta };
}

/**
 * Intrinsic + time-value "target" for a listed contract (same structure as daily repricing).
 * @param {boolean} withTimeNoise - when false (tenor snap), time value is deterministic for an immediate MTO jump.
 */
export function listedOptionFairValue(optionBase, underlyingPrice, marketDte, params, withTimeNoise = true) {
  const strikes = optionStrikesForUnderlying(underlyingPrice, params?.optionStrikeOffsetPct ?? 0.08);
  const strike = strikes[optionBase.strikeRef] ?? optionBase.strike ?? underlyingPrice;
  const dte = normalizeOptionMarketDte(marketDte);
  const dteNorm = Math.min(1, dte / OPTION_REFERENCE_DTE);
  const intrinsicPerShare = optionBase.optionType === "put"
    ? Math.max(strike - underlyingPrice, 0)
    : Math.max(underlyingPrice - strike, 0);
  const intrinsicTotal = intrinsicPerShare * OPTION_SHARES_PER_CONTRACT;
  const moneyness = Math.abs(underlyingPrice - strike) / Math.max(strike, 1);
  const baseTimeValuePerShare = Math.max(0.12, underlyingPrice * 0.014 * dteNorm * (1 - Math.min(moneyness, 1)));
  const timeValuePerShare = Math.max(
    0,
    baseTimeValuePerShare * (withTimeNoise ? (1 + randn() * 0.18) : 1)
  );
  const timeTotal = timeValuePerShare * OPTION_SHARES_PER_CONTRACT;
  const target = intrinsicTotal + timeTotal;
  return { strike, target, dte };
}

/** Recompute listed quotes immediately when tenor changes (no extra day advance). Replaces last chart point. */
export function snapRepriceListedOptionsForTenor(s, params = {}) {
  const existingOptionsById = Object.fromEntries((s.options || []).map(o => [o.id, o]));
  return OPTIONS.map(template => {
    const prevState = existingOptionsById[template.id];
    const merged = prevState
      ? { ...template, ...prevState }
      : { ...template, price: template.startPrice, history: [template.startPrice] };
    const { contracts, costBasis, ...optionBase } = merged;
    const u = ((s.indexFunds || []).find(f => f.id === optionBase.underlyingId)?.price) ?? 100;
    const { strike, target, dte } = listedOptionFairValue(optionBase, u, s.optionMarketDte, params, false);
    const price = Math.max(OPTION_SHARES_PER_CONTRACT * 0.05, target);
    const hist = [...(optionBase.history || [])];
    if (hist.length) hist[hist.length - 1] = price;
    else hist.push(price);
    return {
      ...optionBase,
      strike,
      price,
      daysToExpiry: dte,
      history: hist.slice(-500),
    };
  });
}

/** Switch listed tenor (7 / 30 / 90) and refresh listed MTO immediately. */
export function setOptionMarketDte(state, params, dte) {
  const optionMarketDte = normalizeOptionMarketDte(dte);
  const prev = normalizeOptionMarketDte(state.optionMarketDte);
  if (optionMarketDte === prev) return state;
  const withTenor = { ...state, optionMarketDte };
  return { ...withTenor, options: snapRepriceListedOptionsForTenor(withTenor, params || {}) };
}

export function repriceListedOptionsForDay(s, updatedIndexFunds, params) {
  const optionsVol = params.volOptions ?? 0.075;
  const existingOptionsById = Object.fromEntries((s.options || []).map(o => [o.id, o]));
  return OPTIONS.map(template => {
    const prevState = existingOptionsById[template.id];
    const merged = prevState
      ? { ...template, ...prevState }
      : { ...template, price: template.startPrice, history: [template.startPrice] };
    const { contracts, costBasis, ...optionBase } = merged;
    const underlyingPrev = ((s.indexFunds || []).find(f => f.id === optionBase.underlyingId)?.price) ?? 100;
    const underlyingNext = ((updatedIndexFunds || []).find(f => f.id === optionBase.underlyingId)?.price) ?? underlyingPrev;
    const { strike, target, dte } = listedOptionFairValue(
      optionBase,
      underlyingNext,
      s.optionMarketDte,
      params,
      true
    );
    const underlyingRet = underlyingPrev > 0 ? ((underlyingNext - underlyingPrev) / underlyingPrev) : 0;
    const shock = randn() * (optionsVol ?? optionBase.dailyVol);
    const direction = optionBase.direction ?? (optionBase.optionType === "put" ? -1 : 1);

    const thetaScale = Math.min(2.2, 42 / Math.max(dte, 4));
    const drift =
      (underlyingRet * optionBase.leverage * direction) +
      (shock * 0.58) -
      (optionBase.theta || 0.003) * 0.32 * thetaScale;
    const momentumPrice = optionBase.price * (1 + drift);
    const price = Math.max(OPTION_SHARES_PER_CONTRACT * 0.05, (momentumPrice * 0.52) + (target * 0.48));
    return {
      ...optionBase,
      strike,
      price,
      daysToExpiry: dte,
      history: [...(optionBase.history || []), price].slice(-500),
    };
  });
}
