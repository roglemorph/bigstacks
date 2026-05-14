// ============================================================
// GAME LOGIC — no DOM, no rendering, pure state + functions
// ============================================================

import { YIELD_CURVE, cloneYieldCurve, evolveYieldCurve } from "./investments/yieldCurve.js";
import { CORPORATE_BOND_OFFERS } from "./investments/corporateBonds.js";
import { INDEX_FUNDS } from "./investments/indexFunds.js";
import { CRYPTOS } from "./investments/cryptos.js";
import { STOCKS } from "./investments/stocks.js";
import {
  optionStrikesForUnderlying,
  buildInitialListedOptions,
  settleExpiredOptionLots,
  repriceListedOptionsForDay,
  optionHoldingsMarkValue,
  normalizeOptionMarketDte,
} from "./investments/options.js";
import { processBondHoldingsForDay, bondPortfolioValue } from "./investments/treasuryBonds.js";
import { indexFundsPortfolioValue, evolveIndexFundsForDay } from "./investments/indexFunds.js";
import { cryptosPortfolioValue, evolveCryptosForDay } from "./investments/cryptos.js";
import { stocksPortfolioValue, evolveStocksForDay } from "./investments/stocks.js";
import { fmt, addCumulativeRealizedPL, EMPTY_CUMULATIVE_REALIZED_PL } from "./investments/shared.js";

export { YIELD_CURVE, interpolateYield, yieldForTerm } from "./investments/yieldCurve.js";
export { MARKET_OPTION_DTE, OPTION_MARKET_DTE_CHOICES, OPTION_SHARES_PER_CONTRACT } from "./investments/options.js";
export {
  openOptionHoldings,
  markOptionHolding,
  optionLotUnrealizedPLAtMark,
  optionLotUnrealizedPLIfExercised,
  optionsHoldingsUnrealizedPL,
  buyOption,
  sellOption,
  sellOptionLot,
  exerciseOptionLot,
  setOptionMarketDte,
  normalizeOptionMarketDte,
} from "./investments/options.js";
export { buyIndexFund, sellIndexFund, buy, sell } from "./investments/indexFunds.js";
export { buyBond, sellBondEarly } from "./investments/treasuryBonds.js";
export { buyCorporateBond } from "./investments/corporateBonds.js";
export { buyCrypto, sellCrypto } from "./investments/cryptos.js";
export { buyStock, sellStock } from "./investments/stocks.js";

export function newState(params = {}) {
  const cash = params.startCash ?? 10_000;
  const baseUnderlying = INDEX_FUNDS.find(f => f.id === "spy")?.startPrice ?? 100;
  const strikes = optionStrikesForUnderlying(baseUnderlying, params.optionStrikeOffsetPct ?? 0.08);
  const corporateSpreadMult = params.corporateSpreadMult ?? 1.0;
  const optionMarketDte = normalizeOptionMarketDte(params.optionMarketDte);
  const st = {
    day: 1,
    maxDays: params.maxDays ?? 2000,
    startCash: cash,
    cash,
    indexFunds: INDEX_FUNDS.map(f => ({ ...f, shares: 0, costBasis: 0, price: f.startPrice, history: [f.startPrice], monthlyHistory: [f.startPrice] })),
    bondHoldings: [],
    corporateBondOffers: CORPORATE_BOND_OFFERS.map(b => ({
      ...b,
      yield: Math.max(0.001, b.yield * corporateSpreadMult),
    })),
    yieldCurve: cloneYieldCurve(YIELD_CURVE),
    cryptos: CRYPTOS.map(c => ({ ...c, coins: 0, costBasis: 0, price: c.startPrice, history: [c.startPrice] })),
    stocks: STOCKS.map(stk => ({ ...stk, shares: 0, costBasis: 0, price: stk.startPrice, history: [stk.startPrice] })),
    optionMarketDte,
    options: buildInitialListedOptions(strikes, baseUnderlying, optionMarketDte),
    optionHoldings: [],
    lifeIncomeTotal: 0,
    cumulativeRealizedPL: { ...EMPTY_CUMULATIVE_REALIZED_PL },
    log: [],
  };
  const startNetWorth = netWorth(st);
  return {
    ...st,
    startNetWorth,
    lastOptionRealized: null,
    netWorthHistory: [Math.round(startNetWorth)],
  };
}

export function portfolioValue(state) {
  return (
    indexFundsPortfolioValue(state) +
    bondPortfolioValue(state) +
    cryptosPortfolioValue(state) +
    stocksPortfolioValue(state) +
    optionHoldingsMarkValue(state)
  );
}

export function netWorth(state) {
  return state.cash + portfolioValue(state);
}

/** Cash added every 30 in-game days. Flows into `cash` and `lifeIncomeTotal`; excluded from `totalReturn` (treated as added starting capital). */
export const MONTHLY_INCOME_AMOUNT = 1000;

/**
 * Dollar gain vs starting net worth, excluding 30-day stipends (each stipend is added to the baseline
 * so it does not count as investment return).
 */
export function totalReturn(state) {
  const start = state.startNetWorth ?? state.startCash ?? 0;
  const stipends = state.lifeIncomeTotal || 0;
  return netWorth(state) - start - stipends;
}

export function nextDay(state, params = {}) {
  if (state.day >= state.maxDays) return state;

  const s = state;
  let cash = s.cash;
  let newLog = [...s.log];

  const bondResult = processBondHoldingsForDay(s, cash);
  cash = bondResult.cash;
  const updatedBonds = bondResult.bondHoldings;
  newLog.push(...bondResult.logLines);

  const newDay = s.day + 1;
  const isMonthEnd = newDay % 30 === 0;
  if (isMonthEnd) {
    cash += MONTHLY_INCOME_AMOUNT;
    newLog.push({ msg: `30-day income: +${fmt(MONTHLY_INCOME_AMOUNT)}`, type: "good", day: newDay });
  }
  const yieldCurve = evolveYieldCurve(s, params);

  const updatedIndexFunds = evolveIndexFundsForDay(s, params, isMonthEnd);
  const updatedCryptos = evolveCryptosForDay(s, params, isMonthEnd);
  const updatedStocks = evolveStocksForDay(s, params, isMonthEnd);

  const spyNext = (updatedIndexFunds || []).find(f => f.id === "spy")?.price ?? 0;

  const settle = settleExpiredOptionLots(s, { newDay, spyNext, cash });
  cash = settle.cash;
  const nextOptionHoldings = settle.optionHoldings;
  newLog.push(...settle.logLines);

  const updatedOptions = repriceListedOptionsForDay(s, updatedIndexFunds, params);

  let updated = {
    ...s,
    day: newDay,
    cash,
    lifeIncomeTotal: (s.lifeIncomeTotal || 0) + (isMonthEnd ? MONTHLY_INCOME_AMOUNT : 0),
    yieldCurve,
    indexFunds: updatedIndexFunds,
    cryptos: updatedCryptos,
    stocks: updatedStocks,
    options: updatedOptions,
    optionHoldings: nextOptionHoldings,
    bondHoldings: updatedBonds,
    log: newLog,
  };

  const bondPlDelta = bondResult.bondRealizedPLDelta || 0;
  if (bondPlDelta !== 0) {
    updated = addCumulativeRealizedPL(updated, "bonds", bondPlDelta);
  }
  const optPlDelta = settle.optionsRealizedPLDelta || 0;
  if (optPlDelta !== 0) {
    updated = addCumulativeRealizedPL(updated, "options", optPlDelta);
  }

  const nw = netWorth(updated);
  const withNW = {
    ...updated,
    netWorthHistory: [...s.netWorthHistory, Math.round(nw)],
  };

  if (newDay >= s.maxDays) {
    return { ...withNW, log: [...withNW.log, { msg: `── RUN OVER ── Net worth: $${fmt(nw)}`, type: "event", day: newDay }] };
  }

  return withNW;
}
