// ============================================================
// MULTIPLAYER — day advance (shared market + per-player tick)
// ============================================================

import { fmt, addCumulativeRealizedPL, fmtSignedMoney2, costBasisForHifoSale } from "../investments/shared.js";
import { processBondHoldingsForDay } from "../investments/treasuryBonds.js";
import { processCorporateBondsForDay } from "../investments/corporateBonds.js";
import { processPerpsForDay } from "../investments/perps.js";
import { settleExpiredOptionLots } from "../investments/options.js";
import { processIndexFundAutobuy } from "../investments/indexFunds.js";
import { processTreasuryBondAutobuy } from "../investments/treasuryBonds.js";
import { processMarketCardAutobuys } from "../investments/marketAutobuy.js";
import { mergeForRender, mergeAssetHoldings, syncPlayerMarketFields } from "./state.js";
import { indexFundsPortfolioValue } from "../investments/indexFunds.js";
import { bondPortfolioValue } from "../investments/treasuryBonds.js";
import { cryptosPortfolioValue } from "../investments/cryptos.js";
import { stocksPortfolioValue } from "../investments/stocks.js";
import { optionHoldingsMarkValue } from "../investments/options.js";
import { perpHoldingsMarkValue } from "../investments/perps.js";

const MONTHLY_INCOME_AMOUNT = 1000;

function portfolioValue(state) {
  return (
    indexFundsPortfolioValue(state) +
    bondPortfolioValue(state) +
    cryptosPortfolioValue(state) +
    stocksPortfolioValue(state) +
    optionHoldingsMarkValue(state) +
    perpHoldingsMarkValue(state)
  );
}

function netWorth(state) {
  return state.cash + portfolioValue(state);
}

function snapshotNetWorthStack(state) {
  return {
    cash: Math.round(Math.max(0, state.cash || 0)),
    indexFunds: Math.round(Math.max(0, indexFundsPortfolioValue(state))),
    bonds: Math.round(Math.max(0, bondPortfolioValue(state))),
    stocks: Math.round(Math.max(0, stocksPortfolioValue(state))),
    cryptos: Math.round(Math.max(0, cryptosPortfolioValue(state))),
    options: Math.round(Math.max(0, optionHoldingsMarkValue(state) + perpHoldingsMarkValue(state))),
  };
}

/**
 * Advance canonical empty-portfolio market one day (server authority).
 */
export function advanceSharedMarket(shared, params, nextDayFn) {
  const merged = {
    ...shared,
    cash: 0,
    bondHoldings: [],
    optionHoldings: [],
    perpHoldings: [],
    log: [],
    lifeIncomeTotal: 0,
    netWorthHistory: [0],
    netWorthStackHistory: [],
    startCash: 0,
    startNetWorth: 0,
    unlockedBonds: true,
    unlockedStocks: true,
    unlockedCrypto: true,
    unlockedOptions: true,
    indexFundAutobuy: { enabled: false, qty: 1, everyDays: 1, assetId: "spy", lastRunDay: null },
    treasuryBondAutobuy: { enabled: false, everyDays: 30, faceValue: 1000, term: 5, lastRunDay: null },
    marketCardAutobuy: {},
    casino: { hiLoAnchor: 50 },
    cumulativeRealizedPL: { indexFunds: 0, cryptos: 0, stocks: 0, bonds: 0, options: 0, casino: 0 },
  };
  const next = nextDayFn(merged, params);
  return stripToShared(next, shared.seed);
}

function stripToShared(next, seed) {
  const { seed: _s, ...rest } = next;
  return {
    seed: seed ?? next.seed,
    day: rest.day,
    maxDays: rest.maxDays,
    yieldCurve: rest.yieldCurve,
    indexFunds: zeroListed(rest.indexFunds, "shares"),
    stocks: zeroListed(rest.stocks, "shares"),
    cryptos: zeroListed(rest.cryptos, "coins"),
    options: rest.options,
    optionMarketDte: rest.optionMarketDte,
    corporateBondOffers: rest.corporateBondOffers,
    corporateListingSeq: rest.corporateListingSeq,
    cryptoListingSeq: rest.cryptoListingSeq,
    bankruptStockDisplay: rest.bankruptStockDisplay,
    perpFundingRateDaily: rest.perpFundingRateDaily,
    perpBasisBps: rest.perpBasisBps,
  };
}

function zeroListed(assets, key) {
  return (assets || []).map(a => ({ ...a, [key]: 0, costBasis: 0, lots: [] }));
}

/**
 * After shared market advances, update each player's portfolio.
 */
export function advancePlayerAfterShared(player, prevShared, shared, params) {
  let p = { ...player };
  const newDay = shared.day;
  const isMonthEnd = newDay % 30 === 0;

  p = settleDelistedAssets(p, prevShared, shared, newDay);
  p = syncPlayerMarketFields(p, shared);

  let merged = mergeForRender(shared, p);
  let cash = merged.cash;
  let newLog = [...(p.log || [])];

  const bondResult = processBondHoldingsForDay(merged, cash);
  cash = bondResult.cash;
  let updatedBonds = bondResult.bondHoldings;
  newLog.push(...bondResult.logLines);

  const corpBondResult = processCorporateBondsForDay(
    { ...merged, day: newDay, bondHoldings: updatedBonds },
    updatedBonds,
    cash,
    newDay,
    params
  );
  cash = corpBondResult.cash;
  updatedBonds = corpBondResult.bondHoldings;
  newLog.push(...corpBondResult.logLines);

  const stipendRaw = Number.isFinite(params.monthlyIncomeAmount) ? params.monthlyIncomeAmount : MONTHLY_INCOME_AMOUNT;
  const stipend = Math.max(0, stipendRaw);
  if (isMonthEnd) {
    cash += stipend;
    newLog.push({ msg: `30-day income: +${fmt(stipend)}`, type: "good", day: newDay });
  }

  merged = {
    ...mergeForRender(shared, p),
    cash,
    bondHoldings: updatedBonds,
    corporateBondOffers: shared.corporateBondOffers,
    day: newDay,
  };

  const perpResult = processPerpsForDay(merged, cash, params);
  cash = perpResult.cash;
  newLog.push(...perpResult.logLines);

  const spyNext = (shared.indexFunds || []).find(f => f.id === "spy")?.price ?? 0;
  const settle = settleExpiredOptionLots(merged, { newDay, spyNext, cash });
  cash = settle.cash;
  newLog.push(...settle.logLines);

  let updated = {
    ...p,
    cash,
    lifeIncomeTotal: (p.lifeIncomeTotal || 0) + (isMonthEnd ? stipend : 0),
    bondHoldings: updatedBonds,
    optionHoldings: settle.optionHoldings,
    perpHoldings: perpResult.perpHoldings,
    log: newLog,
    indexFunds: mergeAssetHoldings(shared.indexFunds, p.indexFunds, "shares"),
    stocks: mergeAssetHoldings(shared.stocks, p.stocks, "shares"),
    cryptos: mergeAssetHoldings(shared.cryptos, p.cryptos, "coins"),
  };

  merged = mergeForRender(shared, updated);
  updated = processIndexFundAutobuy(merged);
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

  const split = {
    playerId: updated.playerId,
    displayName: updated.displayName,
    cash: updated.cash,
    startCash: updated.startCash,
    startNetWorth: updated.startNetWorth,
    bondHoldings: updated.bondHoldings,
    optionHoldings: updated.optionHoldings,
    perpHoldings: updated.perpHoldings,
    unlockedBonds: updated.unlockedBonds,
    unlockedStocks: updated.unlockedStocks,
    unlockedCrypto: updated.unlockedCrypto,
    unlockedOptions: updated.unlockedOptions,
    assetUnlockDays: updated.assetUnlockDays,
    lifeIncomeTotal: updated.lifeIncomeTotal,
    cumulativeRealizedPL: updated.cumulativeRealizedPL,
    indexFundAutobuy: updated.indexFundAutobuy,
    treasuryBondAutobuy: updated.treasuryBondAutobuy,
    marketCardAutobuy: updated.marketCardAutobuy,
    casino: updated.casino,
    log: updated.log,
    lastOptionRealized: updated.lastOptionRealized,
    indexFunds: mergeAssetHoldings(shared.indexFunds, updated.indexFunds, "shares"),
    stocks: mergeAssetHoldings(shared.stocks, updated.stocks, "shares"),
    cryptos: mergeAssetHoldings(shared.cryptos, updated.cryptos, "coins"),
  };

  const nwMerged = mergeForRender(shared, split);
  const nw = netWorth(nwMerged);
  split.netWorthHistory = [...(player.netWorthHistory || []), Math.round(nw)];
  split.netWorthStackHistory = [...(player.netWorthStackHistory || []), snapshotNetWorthStack(nwMerged)];

  if (newDay >= shared.maxDays) {
    split.log = [...split.log, {
      msg: `── RUN OVER ── Net worth: $${fmt(nw)}`,
      type: "event",
      day: newDay,
    }];
  }

  return split;
}

function settleDelistedAssets(player, prevShared, shared, newDay) {
  let cash = player.cash;
  let stockRealizedPLDelta = 0;
  let cryptoRealizedPLDelta = 0;
  const log = [...(player.log || [])];

  const sharedStockIds = new Set((shared.stocks || []).map(s => s.id));
  const prevStockById = new Map((prevShared.stocks || []).map(s => [s.id, s]));
  const stocks = [];

  for (const st of player.stocks || []) {
    if (sharedStockIds.has(st.id)) {
      stocks.push(st);
      continue;
    }
    const shares = st.shares || 0;
    const prev = prevStockById.get(st.id);
    const price = prev?.price ?? st.price ?? 0;
    if (shares > 0) {
      const proceeds = shares * price;
      const costRemoved = costBasisForHifoSale(st, "shares", shares);
      const realizedPl = proceeds - costRemoved;
      stockRealizedPLDelta += realizedPl;
      cash += proceeds;
      log.push({
        msg: `${st.name} delisted — ${shares} share(s) liquidated at $${price.toFixed(2)} (P/L ${fmtSignedMoney2(realizedPl)}).`,
        type: "bad",
        day: newDay,
      });
    }
  }

  const sharedCryptoIds = new Set((shared.cryptos || []).map(c => c.id));
  const prevCryptoById = new Map((prevShared.cryptos || []).map(c => [c.id, c]));
  const cryptos = [];

  for (const c of player.cryptos || []) {
    if (sharedCryptoIds.has(c.id)) {
      cryptos.push(c);
      continue;
    }
    const coins = c.coins || 0;
    const prev = prevCryptoById.get(c.id);
    const price = prev?.price ?? c.price ?? 0;
    if (coins > 0) {
      const proceeds = coins * price;
      const costRemoved = costBasisForHifoSale(c, "coins", coins);
      const realizedPl = proceeds - costRemoved;
      cryptoRealizedPLDelta += realizedPl;
      cash += proceeds;
      log.push({
        msg: `${c.name} left the exchange — ${coins} coin(s) liquidated for $${proceeds.toFixed(2)} (P/L ${fmtSignedMoney2(realizedPl)}).`,
        type: "bad",
        day: newDay,
      });
    }
  }

  let next = { ...player, cash, stocks, cryptos, log };
  if (stockRealizedPLDelta !== 0) {
    next = addCumulativeRealizedPL(next, "stocks", stockRealizedPLDelta);
  }
  if (cryptoRealizedPLDelta !== 0) {
    next = addCumulativeRealizedPL(next, "cryptos", cryptoRealizedPLDelta);
  }
  return next;
}
