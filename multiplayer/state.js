// ============================================================
// MULTIPLAYER — shared market vs per-player state
// ============================================================

import { createRng, withRng } from "../investments/rng.js";
import { EMPTY_CUMULATIVE_REALIZED_PL } from "../investments/shared.js";
import { DEFAULT_INDEX_FUND_AUTOBUY } from "../investments/indexFunds.js";
import { DEFAULT_TREASURY_BOND_AUTOBUY } from "../investments/treasuryBonds.js";
import { initialCasinoState } from "../investments/casino.js";

export const EMPTY_ASSET_UNLOCK_DAYS = {
  bonds: null,
  stocks: null,
  cryptos: null,
  options: null,
};

export function stripPlayerFields(state) {
  const shared = { ...state };
  delete shared.cash;
  delete shared.startCash;
  delete shared.startNetWorth;
  delete shared.bondHoldings;
  delete shared.optionHoldings;
  delete shared.perpHoldings;
  delete shared.unlockedBonds;
  delete shared.unlockedStocks;
  delete shared.unlockedCrypto;
  delete shared.unlockedOptions;
  delete shared.assetUnlockDays;
  delete shared.lifeIncomeTotal;
  delete shared.cumulativeRealizedPL;
  delete shared.indexFundAutobuy;
  delete shared.treasuryBondAutobuy;
  delete shared.marketCardAutobuy;
  delete shared.log;
  delete shared.netWorthHistory;
  delete shared.netWorthStackHistory;
  delete shared.lastOptionRealized;
  delete shared.casino;
  delete shared.playerId;
  delete shared.displayName;
  return {
    ...shared,
    indexFunds: zeroHoldings(state.indexFunds, "shares"),
    stocks: zeroHoldings(state.stocks, "shares"),
    cryptos: zeroHoldings(state.cryptos, "coins"),
  };
}

function zeroHoldings(assets, key) {
  return (assets || []).map(a => ({
    ...a,
    [key]: 0,
    costBasis: 0,
    lots: [],
  }));
}

export function newPlayerState(shared, params = {}, meta = {}) {
  const cash = params.startCash ?? 10_000;
  return {
    playerId: meta.playerId || null,
    displayName: meta.displayName || "Player",
    cash,
    startCash: cash,
    startNetWorth: cash,
    bondHoldings: [],
    optionHoldings: [],
    perpHoldings: [],
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
    casino: initialCasinoState(params),
    log: [],
    netWorthHistory: [Math.round(cash)],
    netWorthStackHistory: [{
      cash: Math.round(cash),
      indexFunds: 0,
      bonds: 0,
      stocks: 0,
      cryptos: 0,
      options: 0,
    }],
    lastOptionRealized: null,
    indexFunds: zeroHoldings(shared.indexFunds, "shares"),
    stocks: zeroHoldings(shared.stocks, "shares"),
    cryptos: zeroHoldings(shared.cryptos, "coins"),
  };
}

export function mergeForRender(shared, player) {
  return {
    ...shared,
    ...player,
    day: shared.day,
    maxDays: shared.maxDays,
    yieldCurve: shared.yieldCurve,
    corporateBondOffers: shared.corporateBondOffers,
    corporateListingSeq: shared.corporateListingSeq,
    cryptoListingSeq: shared.cryptoListingSeq,
    bankruptStockDisplay: shared.bankruptStockDisplay,
    options: shared.options,
    optionMarketDte: shared.optionMarketDte,
    perpFundingRateDaily: shared.perpFundingRateDaily,
    perpBasisBps: shared.perpBasisBps,
    indexFunds: mergeAssetHoldings(shared.indexFunds, player.indexFunds, "shares"),
    stocks: mergeAssetHoldings(shared.stocks, player.stocks, "shares"),
    cryptos: mergeAssetHoldings(shared.cryptos, player.cryptos, "coins"),
  };
}

export function mergeAssetHoldings(marketAssets, playerAssets, key) {
  const playerById = new Map((playerAssets || []).map(a => [a.id, a]));
  return (marketAssets || []).map(m => {
    const p = playerById.get(m.id);
    return {
      ...m,
      [key]: p?.[key] ?? 0,
      costBasis: p?.costBasis ?? 0,
      lots: p?.lots ? [...p.lots] : [],
    };
  });
}

export function syncPlayerMarketFields(player, shared) {
  return {
    ...player,
    indexFunds: mergeAssetHoldings(shared.indexFunds, player.indexFunds, "shares"),
    stocks: mergeAssetHoldings(shared.stocks, player.stocks, "shares"),
    cryptos: mergeAssetHoldings(shared.cryptos, player.cryptos, "coins"),
  };
}

export function splitPlayerFromMerged(merged, shared) {
  return {
    playerId: merged.playerId,
    displayName: merged.displayName,
    cash: merged.cash,
    startCash: merged.startCash,
    startNetWorth: merged.startNetWorth,
    bondHoldings: merged.bondHoldings || [],
    optionHoldings: merged.optionHoldings || [],
    perpHoldings: merged.perpHoldings || [],
    unlockedBonds: merged.unlockedBonds,
    unlockedStocks: merged.unlockedStocks,
    unlockedCrypto: merged.unlockedCrypto,
    unlockedOptions: merged.unlockedOptions,
    assetUnlockDays: merged.assetUnlockDays,
    lifeIncomeTotal: merged.lifeIncomeTotal,
    cumulativeRealizedPL: merged.cumulativeRealizedPL,
    indexFundAutobuy: merged.indexFundAutobuy,
    treasuryBondAutobuy: merged.treasuryBondAutobuy,
    marketCardAutobuy: merged.marketCardAutobuy,
    casino: merged.casino,
    log: merged.log || [],
    netWorthHistory: merged.netWorthHistory || [],
    netWorthStackHistory: merged.netWorthStackHistory || [],
    lastOptionRealized: merged.lastOptionRealized,
    indexFunds: mergeAssetHoldings(shared.indexFunds, merged.indexFunds, "shares"),
    stocks: mergeAssetHoldings(shared.stocks, merged.stocks, "shares"),
    cryptos: mergeAssetHoldings(shared.cryptos, merged.cryptos, "coins"),
  };
}

export function buildRoomMarket(seed, params, newStateFn) {
  const rng = createRng(seed);
  const p = withRng({ ...params }, rng);
  const st = newStateFn(p);
  return {
    seed,
    market: stripPlayerFields(st),
    params: p,
  };
}

export function leaderboardEntry(player, shared, netWorthFn) {
  const merged = mergeForRender(shared, player);
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    netWorth: Math.round(netWorthFn(merged)),
    day: shared.day,
  };
}

export function sortLeaderboard(entries) {
  return [...entries]
    .sort((a, b) => b.netWorth - a.netWorth)
    .map((e, i) => ({ ...e, rank: i + 1 }));
}
