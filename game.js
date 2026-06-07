// ============================================================
// GAME LOGIC — no DOM, no rendering, pure state + functions
// ============================================================

import { YIELD_CURVE, cloneYieldCurve, evolveYieldCurve } from "./investments/yieldCurve.js";
import { buildInitialCorporateBondOffers, processCorporateBondsForDay } from "./investments/corporateBonds.js";
import {
  INDEX_FUNDS,
  DEFAULT_INDEX_FUND_AUTOBUY,
  indexFundsPortfolioValue,
  evolveIndexFundsForDay,
  processIndexFundAutobuy,
} from "./investments/indexFunds.js";
import { buildInitialCryptos, cryptosPortfolioValue, evolveAndRotateCryptoMarket } from "./investments/cryptos.js";
import { buildInitialStocks, stocksPortfolioValue, evolveStocksAndDelistFailures } from "./investments/stocks.js";
import {
  optionStrikesForUnderlying,
  buildInitialListedOptions,
  settleExpiredOptionLots,
  repriceListedOptionsForDay,
  optionHoldingsMarkValue,
  normalizeOptionMarketDte,
} from "./investments/options.js";
import {
  perpHoldingsMarkValue,
  processPerpsForDay,
  initialPerpMarketState,
  openPerp,
  closePerp,
  closePerpLot,
  perpMarkPrice,
  perpFundingRateAnnual,
  openPerpPositions,
  perpHoldingsUnrealizedPL,
  perpPositionUnrealizedPL,
  perpPositionTotalPL,
  perpOpenPremiumTotal,
} from "./investments/perps.js";
import {
  processBondHoldingsForDay,
  bondPortfolioValue,
  DEFAULT_TREASURY_BOND_AUTOBUY,
  processTreasuryBondAutobuy,
} from "./investments/treasuryBonds.js";
import { processMarketCardAutobuys } from "./investments/marketAutobuy.js";
import { repriceBondsForQuarter, isBondQuarterEnd } from "./investments/bondRepricing.js";
import { initialCasinoState, playCasinoHiLo } from "./investments/casino.js";
import { fmt, addCumulativeRealizedPL, EMPTY_CUMULATIVE_REALIZED_PL, appendLog, trimLog } from "./investments/shared.js";
import { initialNetWorthHistoryFields, appendNetWorthHistoryDay } from "./investments/netWorthHistory.js";
import {
  UNLOCK_COST_BONDS,
  UNLOCK_COST_STOCKS,
  UNLOCK_COST_CRYPTOS,
  UNLOCK_COST_OPTIONS,
} from "./investments/marketUnlock.js";

export {
  UNLOCK_COST_BONDS,
  UNLOCK_COST_STOCKS,
  UNLOCK_COST_CRYPTOS,
  UNLOCK_COST_OPTIONS,
} from "./investments/marketUnlock.js";

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
export {
  openPerp,
  closePerp,
  closePerpLot,
  perpMarkPrice,
  perpFundingRateAnnual,
  openPerpPositions,
  perpHoldingsMarkValue,
  perpHoldingsUnrealizedPL,
  perpPositionUnrealizedPL,
  perpPositionTotalPL,
  perpOpenPremiumTotal,
} from "./investments/perps.js";
export {
  buyIndexFund,
  sellIndexFund,
  buy,
  sell,
  normalizeIndexFundAutobuy,
  computeIndexFundDailyDrift,
  computeIndexFundEffectiveVol,
} from "./investments/indexFunds.js";
export { buyBond, sellBondEarly, normalizeTreasuryBondAutobuy } from "./investments/treasuryBonds.js";
export { buyCorporateBond } from "./investments/corporateBonds.js";
export { buyCrypto, sellCrypto } from "./investments/cryptos.js";
export {
  buyStock,
  sellStock,
  computeStockDailyDrift,
  computeStockEffectiveVol,
  stockPeRatio,
  STOCK_DRIFT_DISPLAY_MIN,
  STOCK_DRIFT_DISPLAY_MAX,
  STOCK_VOL_DISPLAY_MIN,
  STOCK_VOL_DISPLAY_MAX,
  DRIFT_TICK_WIDTH_MIN,
  DRIFT_TICK_WIDTH_MAX,
} from "./investments/stocks.js";
export {
  normalizeMarketCardAutobuy,
  marketCardAutobuyKey,
} from "./investments/marketAutobuy.js";

export {
  SAVE_VERSION,
  SAVE_STORAGE_KEY,
  buildSavePayload,
  parseSavePayload,
  normalizeLoadedState,
  normalizeLoadedParams,
  buildExportFilename,
  savePayloadToJson,
  payloadFromParsed,
} from "./saveLoad.js";

export const EMPTY_ASSET_UNLOCK_DAYS = {
  bonds: null,
  stocks: null,
  cryptos: null,
  options: null,
};

function withAssetUnlockDay(state, key) {
  const prev = { ...EMPTY_ASSET_UNLOCK_DAYS, ...(state.assetUnlockDays || {}) };
  if (prev[key] != null) return prev;
  return { ...prev, [key]: state.day };
}

export function unlockBonds(state) {
  if (state.unlockedBonds) return appendLog(state, "Bond market already unlocked.", "info");
  if (state.cash < UNLOCK_COST_BONDS) {
    return appendLog(state, `Need ${fmt(UNLOCK_COST_BONDS)} to unlock bonds — only have ${fmt(state.cash)}.`, "bad");
  }
  const next = {
    ...state,
    cash: state.cash - UNLOCK_COST_BONDS,
    unlockedBonds: true,
    assetUnlockDays: withAssetUnlockDay(state, "bonds"),
  };
  return appendLog(next, `Paid ${fmt(UNLOCK_COST_BONDS)} to unlock the bond market.`, "good");
}

export function unlockStocks(state) {
  if (state.unlockedStocks) return appendLog(state, "Stock market already unlocked.", "info");
  if (state.cash < UNLOCK_COST_STOCKS) {
    return appendLog(state, `Need ${fmt(UNLOCK_COST_STOCKS)} to unlock stocks — only have ${fmt(state.cash)}.`, "bad");
  }
  const next = {
    ...state,
    cash: state.cash - UNLOCK_COST_STOCKS,
    unlockedStocks: true,
    assetUnlockDays: withAssetUnlockDay(state, "stocks"),
  };
  return appendLog(next, `Paid ${fmt(UNLOCK_COST_STOCKS)} to unlock the stock market.`, "good");
}

export function unlockCrypto(state) {
  if (state.unlockedCrypto) return appendLog(state, "Crypto market already unlocked.", "info");
  if (state.cash < UNLOCK_COST_CRYPTOS) {
    return appendLog(state, `Need ${fmt(UNLOCK_COST_CRYPTOS)} to unlock crypto — only have ${fmt(state.cash)}.`, "bad");
  }
  const next = {
    ...state,
    cash: state.cash - UNLOCK_COST_CRYPTOS,
    unlockedCrypto: true,
    assetUnlockDays: withAssetUnlockDay(state, "cryptos"),
  };
  return appendLog(next, `Paid ${fmt(UNLOCK_COST_CRYPTOS)} to unlock the crypto market.`, "good");
}

export function unlockOptions(state) {
  if (state.unlockedOptions) return appendLog(state, "Options market already unlocked.", "info");
  if (state.cash < UNLOCK_COST_OPTIONS) {
    return appendLog(state, `Need ${fmt(UNLOCK_COST_OPTIONS)} to unlock options — only have ${fmt(state.cash)}.`, "bad");
  }
  const next = {
    ...state,
    cash: state.cash - UNLOCK_COST_OPTIONS,
    unlockedOptions: true,
    assetUnlockDays: withAssetUnlockDay(state, "options"),
  };
  return appendLog(next, `Paid ${fmt(UNLOCK_COST_OPTIONS)} to unlock the options market.`, "good");
}

export { playCasinoHiLo } from "./investments/casino.js";

export function newState(params = {}) {
  const cash = params.startCash ?? 10_000;
  const baseUnderlying = INDEX_FUNDS.find(f => f.id === "spy")?.startPrice ?? 100;
  const strikes = optionStrikesForUnderlying(baseUnderlying, params.optionStrikeOffsetPct ?? 0.08);
  const optionMarketDte = normalizeOptionMarketDte(params.optionMarketDte);
  const cryptoBoot = buildInitialCryptos(params);
  const corpBoot = buildInitialCorporateBondOffers(params);
  const st = {
    day: 1,
    maxDays: params.maxDays ?? 30000,
    startCash: cash,
    cash,
    indexFunds: INDEX_FUNDS.map(f => ({ ...f, shares: 0, costBasis: 0, lots: [], price: f.startPrice, history: [f.startPrice], monthlyHistory: [f.startPrice] })),
    bondHoldings: [],
    corporateBondOffers: corpBoot.offers,
    corporateListingSeq: corpBoot.corporateListingSeq,
    yieldCurve: cloneYieldCurve(YIELD_CURVE),
    cryptos: cryptoBoot.cryptos,
    cryptoListingSeq: cryptoBoot.cryptoListingSeq,
    stocks: buildInitialStocks(params),
    bankruptStockDisplay: [],
    optionMarketDte,
    options: buildInitialListedOptions(strikes, baseUnderlying, optionMarketDte),
    optionHoldings: [],
    ...initialPerpMarketState(),
    casino: initialCasinoState(),
    unlockedBonds: false,
    unlockedStocks: false,
    unlockedCrypto: false,
    unlockedOptions: false,
    assetUnlockDays: { ...EMPTY_ASSET_UNLOCK_DAYS },
    lifeIncomeTotal: 0,
    cumulativeRealizedPL: { ...EMPTY_CUMULATIVE_REALIZED_PL },
    indexFundAutobuy: { ...DEFAULT_INDEX_FUND_AUTOBUY },
    treasuryBondAutobuy: { ...DEFAULT_TREASURY_BOND_AUTOBUY },
    marketCardAutobuy: {},
    log: [],
  };
  const startNetWorth = netWorth(st);
  const startStack = snapshotNetWorthStack(st);
  return {
    ...st,
    startNetWorth,
    lastOptionRealized: null,
    ...initialNetWorthHistoryFields(startNetWorth, startStack),
  };
}

export function portfolioValue(state) {
  return (
    indexFundsPortfolioValue(state) +
    bondPortfolioValue(state) +
    cryptosPortfolioValue(state) +
    stocksPortfolioValue(state) +
    optionHoldingsMarkValue(state) +
    perpHoldingsMarkValue(state)
  );
}

/** Per-asset net worth components (cash + each portfolio bucket). */
export function netWorthBreakdown(state) {
  return {
    cash: Math.max(0, state.cash || 0),
    indexFunds: Math.max(0, indexFundsPortfolioValue(state)),
    bonds: Math.max(0, bondPortfolioValue(state)),
    stocks: Math.max(0, stocksPortfolioValue(state)),
    cryptos: Math.max(0, cryptosPortfolioValue(state)),
    options: Math.max(0, optionHoldingsMarkValue(state) + perpHoldingsMarkValue(state)),
  };
}

export function snapshotNetWorthStack(state) {
  const b = netWorthBreakdown(state);
  return {
    cash: Math.round(b.cash),
    indexFunds: Math.round(b.indexFunds),
    bonds: Math.round(b.bonds),
    stocks: Math.round(b.stocks),
    cryptos: Math.round(b.cryptos),
    options: Math.round(b.options),
  };
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
  let updatedBonds = bondResult.bondHoldings;
  newLog.push(...bondResult.logLines);

  const newDay = s.day + 1;

  const corpBondResult = processCorporateBondsForDay(s, updatedBonds, cash, newDay, params);
  cash = corpBondResult.cash;
  updatedBonds = corpBondResult.bondHoldings;
  newLog.push(...corpBondResult.logLines);
  const isMonthEnd = newDay % 30 === 0;
  const stipendRaw = Number.isFinite(params.monthlyIncomeAmount) ? params.monthlyIncomeAmount : MONTHLY_INCOME_AMOUNT;
  const stipend = Math.max(0, stipendRaw);
  if (isMonthEnd) {
    cash += stipend;
    newLog.push({ msg: `30-day income: +${fmt(stipend)}`, type: "good", day: newDay });
  }
  const yieldCurve = isBondQuarterEnd(newDay)
    ? evolveYieldCurve(s, params)
    : (s.yieldCurve?.length ? s.yieldCurve : cloneYieldCurve(YIELD_CURVE));

  let corporateBondOffers = corpBondResult.corporateBondOffers;
  const quarterReprice = repriceBondsForQuarter(
    { ...s, day: newDay, yieldCurve, bondHoldings: updatedBonds, corporateBondOffers },
    params
  );
  updatedBonds = quarterReprice.bondHoldings;
  corporateBondOffers = quarterReprice.corporateBondOffers;
  newLog.push(...quarterReprice.logLines);

  const updatedIndexFunds = evolveIndexFundsForDay(s, params, isMonthEnd);
  const perpResult = processPerpsForDay(
    { ...s, day: newDay, indexFunds: updatedIndexFunds },
    cash,
    params
  );
  cash = perpResult.cash;
  newLog.push(...perpResult.logLines);
  const cryptoRotation = evolveAndRotateCryptoMarket(s, params, isMonthEnd, newDay);
  cash += cryptoRotation.cashDelta;
  newLog.push(...cryptoRotation.logLines);
  const stockResult = evolveStocksAndDelistFailures(s, params, isMonthEnd, newDay);
  cash += stockResult.cashDelta;
  newLog.push(...stockResult.logLines);

  const spyNext = (updatedIndexFunds || []).find(f => f.id === "spy")?.price ?? 0;

  const settle = settleExpiredOptionLots(s, { newDay, spyNext, cash });
  cash = settle.cash;
  const nextOptionHoldings = settle.optionHoldings;
  newLog.push(...settle.logLines);

  const updatedOptions = repriceListedOptionsForDay(s, updatedIndexFunds, params, { isMonthEnd });

  const STOCK_BANKRUPT_MEMORIAL_CAP = 24;
  const incomingBankruptMemorials = (stockResult.bankruptEntries || []).map(e => ({
    memorialId: `brk-${e.id}-d${newDay}`,
    stockId: e.id,
    name: e.name,
    sector: e.sector,
    day: newDay,
  }));
  const prevBankruptMemorials = s.bankruptStockDisplay || [];
  const mergedBankruptMemorials = [...incomingBankruptMemorials, ...prevBankruptMemorials];
  const bankruptStockDisplay = [];
  const memorialKeys = new Set();
  for (const m of mergedBankruptMemorials) {
    const k = `${m.stockId}:${m.day}`;
    if (memorialKeys.has(k)) continue;
    memorialKeys.add(k);
    bankruptStockDisplay.push(m);
    if (bankruptStockDisplay.length >= STOCK_BANKRUPT_MEMORIAL_CAP) break;
  }

  let updated = {
    ...s,
    day: newDay,
    cash,
    lifeIncomeTotal: (s.lifeIncomeTotal || 0) + (isMonthEnd ? stipend : 0),
    yieldCurve,
    indexFunds: updatedIndexFunds,
    log: trimLog(newLog),
    cryptos: cryptoRotation.cryptos,
    cryptoListingSeq: cryptoRotation.cryptoListingSeq,
    stocks: stockResult.stocks,
    bankruptStockDisplay,
    options: updatedOptions,
    optionHoldings: nextOptionHoldings,
    perpHoldings: perpResult.perpHoldings,
    perpFundingRateDaily: perpResult.perpFundingRateDaily,
    perpBasisBps: perpResult.perpBasisBps,
    bondHoldings: updatedBonds,
    corporateBondOffers,
    corporateListingSeq: corpBondResult.corporateListingSeq,
  };

  updated = processIndexFundAutobuy(updated);
  updated = processTreasuryBondAutobuy(updated);
  updated = processMarketCardAutobuys(updated);

  const bondPlDelta = (bondResult.bondRealizedPLDelta || 0) + (corpBondResult.bondRealizedPLDelta || 0);
  if (bondPlDelta !== 0) {
    updated = addCumulativeRealizedPL(updated, "bonds", bondPlDelta);
  }
  const optPlDelta =
    (settle.optionsRealizedPLDelta || 0) +
    (perpResult.perpFundingPLDelta || 0) +
    (perpResult.perpRealizedPLDelta || 0);
  if (optPlDelta !== 0) {
    updated = addCumulativeRealizedPL(updated, "options", optPlDelta);
  }
  const cryptoPlDelta = cryptoRotation.cryptoRealizedPLDelta || 0;
  if (cryptoPlDelta !== 0) {
    updated = addCumulativeRealizedPL(updated, "cryptos", cryptoPlDelta);
  }
  const stockPlDelta = stockResult.stockRealizedPLDelta || 0;
  if (stockPlDelta !== 0) {
    updated = addCumulativeRealizedPL(updated, "stocks", stockPlDelta);
  }

  const nw = netWorth(updated);
  let withNW = appendNetWorthHistoryDay(updated, nw, snapshotNetWorthStack(updated));

  if (newDay >= s.maxDays) {
    return appendLog(withNW, `── RUN OVER ── Net worth: $${fmt(nw)}`, "event");
  }

  return withNW;
}

export {
  mergeForRender,
  splitPlayerFromMerged,
  newPlayerState,
  buildRoomMarket,
  leaderboardEntry,
  sortLeaderboard,
  stripPlayerFields,
} from "./multiplayer/state.js";

export { advanceSharedMarket, advancePlayerAfterShared } from "./multiplayer/advance.js";
