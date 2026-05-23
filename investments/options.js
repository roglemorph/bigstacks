import { appendLog, fmt, fmtSignedMoney2, randn, addCumulativeRealizedPL } from "./shared.js";
import { resolveRng } from "./rng.js";
import { UNLOCK_COST_OPTIONS } from "./marketUnlock.js";

/** Default / legacy listed-tenor when `optionMarketDte` is missing (older saves). */
export const MARKET_OPTION_DTE = 30;
/** Allowed tenors for new trades and listed chain (toggle in UI). */
export const OPTION_MARKET_DTE_CHOICES = [7, 30, 90, 300];
/** Longest tenor — used to scale time value in listed-option repricing across listed DTE choices. */
export const OPTION_REFERENCE_DTE = 300;
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
    monthlyHistory: [opt.startPrice],
    daysToExpiry: dte,
  }));
}

/** Open lots only (not yet expired this session). */
export function openOptionHoldings(state) {
  const day = state.day;
  return (state.optionHoldings || []).filter(h => day < h.expiryDay);
}

/** Shared intrinsic + time-value mark (same basis as listed chain fair value). */
function optionContractFairValue(optionType, strike, underlyingPrice, dte, withTimeNoise = false, params = {}) {
  const remainingDte = Math.max(1, dte);
  const dteNorm = Math.min(1, remainingDte / OPTION_REFERENCE_DTE);
  const intrinsicPerShare =
    optionType === "put"
      ? Math.max(strike - underlyingPrice, 0)
      : Math.max(underlyingPrice - strike, 0);
  const intrinsicTotal = intrinsicPerShare * OPTION_SHARES_PER_CONTRACT;
  const moneyness = Math.abs(underlyingPrice - strike) / Math.max(strike, 1);
  const baseTimeValuePerShare = Math.max(0.12, underlyingPrice * 0.014 * dteNorm * (1 - Math.min(moneyness, 1)));
  const timeValuePerShare = Math.max(
    0,
    baseTimeValuePerShare * (withTimeNoise ? (1 + randn(params) * 0.18) : 1)
  );
  const timeTotal = timeValuePerShare * OPTION_SHARES_PER_CONTRACT;
  return Math.max(OPTION_SHARES_PER_CONTRACT * 0.05, intrinsicTotal + timeTotal);
}

function optionLotMarkPrice(lot, underlyingPrice, asOfDay) {
  if (asOfDay >= lot.expiryDay) return 0;
  const remainingDte = Math.max(1, lot.expiryDay - asOfDay);
  return optionContractFairValue(lot.optionType, lot.strike, underlyingPrice, remainingDte, false);
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
  const listed = (state.options || []).find(o => o.id === lot.optionId);
  if (listed && listed.strike === lot.strike) return listed.price;
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
  if (!state.unlockedOptions) {
    return appendLog(state, `Options market locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to unlock.`, "bad");
  }
  const list = state.options || [];
  const asset = list.find(a => a.id === assetId);
  if (!asset) return appendLog(state, "Option not found.", "bad");
  const price = asset.price;
  const cost = qty * price;
  if (cost > state.cash) return appendLog(state, `Need ${fmt(cost)} — only have ${fmt(state.cash)}.`, "bad");
  const dte = normalizeOptionMarketDte(state.optionMarketDte);
  const expiryDay = state.day + dte;
  const rng = resolveRng({});
  const holding = {
    id: `${state.day}_${rng.id()}`,
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

/** Sell contracts HIFO across open lots for this listed option id. */
export function sellOption(state, assetId, qty) {
  if (!state.unlockedOptions) {
    return appendLog(state, `Options market locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to unlock.`, "bad");
  }
  const requested = Math.max(1, parseInt(qty, 10) || 1);
  let remaining = requested;
  const day = state.day;
  let cash = state.cash;
  const holdings = [...(state.optionHoldings || [])];
  const openIdx = holdings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.optionId === assetId && day < h.expiryDay)
    .sort((a, b) => {
      const costDiff = (b.h.premiumAtPurchase ?? 0) - (a.h.premiumAtPurchase ?? 0);
      if (costDiff !== 0) return costDiff;
      return (b.h.purchaseDay ?? 0) - (a.h.purchaseDay ?? 0) || b.i - a.i;
    });

  const totalContracts = openIdx.reduce((s, { h }) => s + h.contracts, 0);
  if (totalContracts <= 0) {
    return appendLog(state, "No open contracts to sell for that series.", "bad");
  }
  if (remaining > totalContracts) remaining = totalContracts;
  const sellCount = remaining;

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
  const partialNote = sellCount < requested ? ` (capped at ${sellCount} held)` : "";
  const logged = appendLog(
    next,
    `Sold ${sellCount} ${quote?.name || assetId} contract(s) at mark (avg $${avgMark.toFixed(2)} / contract), P/L ${fmtSignedMoney2(totalPl)}.${partialNote}`,
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
  if (!state.unlockedOptions) {
    return appendLog(state, `Options market locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to unlock.`, "bad");
  }
  const requested = Math.max(1, parseInt(qty, 10) || 1);
  const day = state.day;
  const idx = (state.optionHoldings || []).findIndex(h => h.id === holdingId);
  if (idx < 0) return appendLog(state, "Option holding not found.", "bad");
  const lot = state.optionHoldings[idx];
  if (day >= lot.expiryDay) return appendLog(state, "That contract has expired.", "bad");
  if (lot.contracts <= 0) return appendLog(state, "No contracts left in that lot.", "bad");
  const sellCount = Math.min(requested, lot.contracts);
  const sellPrice = markOptionHolding(state, lot);
  const proceeds = sellCount * sellPrice;
  const cost = sellCount * lot.premiumAtPurchase;
  const pl = proceeds - cost;
  const nextC = lot.contracts - sellCount;
  const nextHoldings = [...(state.optionHoldings || [])];
  if (nextC <= 0) nextHoldings.splice(idx, 1);
  else nextHoldings[idx] = { ...lot, contracts: nextC };
  const next = addCumulativeRealizedPL(
    { ...state, cash: state.cash + proceeds, optionHoldings: nextHoldings },
    "options",
    pl
  );
  const partialNote = sellCount < requested ? ` (capped at ${sellCount} held)` : "";
  const logged = appendLog(
    next,
    `Sold ${sellCount} ${lot.name} @ $${sellPrice.toFixed(2)} (P/L ${fmtSignedMoney2(pl)}).${partialNote}`,
    "info"
  );
  return {
    ...logged,
    lastOptionRealized: { kind: "sell", pl, contracts: sellCount, label: lot.name },
  };
}

/** Exercise 1+ contracts: cash settle intrinsic (per share × multiplier), remove from holdings. */
export function exerciseOptionLot(state, holdingId, qty) {
  if (!state.unlockedOptions) {
    return appendLog(state, `Options market locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to unlock.`, "bad");
  }
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
  const target = optionContractFairValue(optionBase.optionType, strike, underlyingPrice, dte, withTimeNoise, params);
  return { strike, target, dte };
}

/** Recompute listed quotes immediately when tenor changes (no extra day advance). Replaces last chart point. */
export function snapRepriceListedOptionsForTenor(s, params = {}) {
  const existingOptionsById = Object.fromEntries((s.options || []).map(o => [o.id, o]));
  return OPTIONS.map(template => {
    const prevState = existingOptionsById[template.id];
    const merged = prevState
      ? { ...template, ...prevState }
      : { ...template, price: template.startPrice, history: [template.startPrice], monthlyHistory: [template.startPrice] };
    const { contracts, costBasis, ...optionBase } = merged;
    const u = ((s.indexFunds || []).find(f => f.id === optionBase.underlyingId)?.price) ?? 100;
    const { strike, target, dte } = listedOptionFairValue(optionBase, u, s.optionMarketDte, params, false);
    const price = Math.max(OPTION_SHARES_PER_CONTRACT * 0.05, target);
    const hist = [...(optionBase.history || [])];
    if (hist.length) hist[hist.length - 1] = price;
    else hist.push(price);
    let monthlyHistory = [...(optionBase.monthlyHistory || [])];
    if (!monthlyHistory.length) monthlyHistory = [price];
    return {
      ...optionBase,
      strike,
      price,
      daysToExpiry: dte,
      history: hist.slice(-500),
      monthlyHistory,
    };
  });
}

/** Switch listed tenor and refresh listed MTO immediately. */
export function setOptionMarketDte(state, params, dte) {
  if (!state.unlockedOptions) {
    return appendLog(state, `Options market locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to unlock.`, "bad");
  }
  const optionMarketDte = normalizeOptionMarketDte(dte);
  const prev = normalizeOptionMarketDte(state.optionMarketDte);
  if (optionMarketDte === prev) return state;
  const withTenor = { ...state, optionMarketDte };
  return { ...withTenor, options: snapRepriceListedOptionsForTenor(withTenor, params || {}) };
}

export function repriceListedOptionsForDay(s, updatedIndexFunds, params, meta = {}) {
  const isMonthEnd = meta.isMonthEnd === true;
  const optionsVol = params.volOptions ?? 0.075;
  const existingOptionsById = Object.fromEntries((s.options || []).map(o => [o.id, o]));
  return OPTIONS.map(template => {
    const prevState = existingOptionsById[template.id];
    const merged = prevState
      ? { ...template, ...prevState }
      : {
          ...template,
          price: template.startPrice,
          history: [template.startPrice],
          monthlyHistory: [template.startPrice],
        };
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
    const shock = randn(params) * (optionsVol ?? optionBase.dailyVol);
    const direction = optionBase.direction ?? (optionBase.optionType === "put" ? -1 : 1);

    const thetaScale = Math.min(2.2, 42 / Math.max(dte, 4));
    const drift =
      (underlyingRet * optionBase.leverage * direction) +
      (shock * 0.58) -
      (optionBase.theta || 0.003) * 0.32 * thetaScale;
    const momentumPrice = optionBase.price * (1 + drift);
    const price = Math.max(OPTION_SHARES_PER_CONTRACT * 0.05, (momentumPrice * 0.52) + (target * 0.48));
    let monthlyHistory = [...(optionBase.monthlyHistory || [])];
    if (!monthlyHistory.length) monthlyHistory = [price];
    if (isMonthEnd) monthlyHistory = [...monthlyHistory, price];
    return {
      ...optionBase,
      strike,
      price,
      daysToExpiry: dte,
      history: [...(optionBase.history || []), price].slice(-500),
      monthlyHistory,
    };
  });
}
