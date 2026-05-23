import { tradeAsset, evolveTrackedAssets, appendLog, fmt, fmtSignedMoney2, DEFAULT_MARKET_DRIFT, costBasisForHifoSale } from "./shared.js";
import { resolveRng } from "./rng.js";
import { UNLOCK_COST_STOCKS } from "./marketUnlock.js";

/** Number of listings at a new run (market may shrink as names delist; nothing refills). */
export const STOCK_MARKET_INITIAL_COUNT = 10;

/** Shares are removed from the board when spot falls strictly below this USD price. */
export const STOCK_DELIST_PRICE_USD = 1;

/** Daily vol range for randomly generated listings (applied before `params.volStock` multiplier). */
export const STOCK_DAILY_VOL_MIN = 0.011;
export const STOCK_DAILY_VOL_MAX = 0.042;

/** Sectors assigned at random per listing. */
export const STOCK_SECTORS = [
  "Consumer staples",
  "Consumer discretionary",
  "Technology",
  "Healthcare",
  "Financials",
  "Industrials",
  "Energy",
  "Materials",
  "Utilities",
  "Real estate",
  "Communication services",
];

const NAME_PREFIXES = [
  "Meridian", "Nimbus", "Catalyst", "Ironwood", "Brightline", "Harbor", "Summit", "Vector",
  "Granite", "Silverton", "Northgate", "Bluewater", "Redwood", "Fairway", "Copperfield",
];

const NAME_SUFFIXES = [
  "Labs", "Works", "Holdings", "Systems", "Group", "Bio", "Steel", "Digital", "Capital",
  "Partners", "Industries", "Therapeutics", "Energy", "Networks", "Retail",
];

export function randomStockName(params = {}) {
  const rng = resolveRng(params);
  const a = NAME_PREFIXES[rng.int(0, NAME_PREFIXES.length - 1)];
  const b = NAME_SUFFIXES[rng.int(0, NAME_SUFFIXES.length - 1)];
  return `${a} ${b}`;
}

/** Inclusive USD range for each stock's day-1 price (crypto caps below this). */
export const STOCK_START_PRICE_MIN = 28;
export const STOCK_START_PRICE_MAX = 95;

/** Random day-1 price; honors optional `params.stockStartPriceMin` / `Max`. */
export function randomStockStartPrice(params = {}) {
  let lo = Number.isFinite(params.stockStartPriceMin) ? params.stockStartPriceMin : STOCK_START_PRICE_MIN;
  let hi = Number.isFinite(params.stockStartPriceMax) ? params.stockStartPriceMax : STOCK_START_PRICE_MAX;
  if (lo > hi) [lo, hi] = [hi, lo];
  const span = hi - lo;
  const rng = resolveRng(params);
  return Math.round((lo + rng.random() * span) * 100) / 100;
}

export function mintRandomStockListing(params, seq) {
  const rng = resolveRng(params);
  const sector = STOCK_SECTORS[rng.int(0, STOCK_SECTORS.length - 1)];
  const name = randomStockName(params);
  const price = randomStockStartPrice(params);
  const volSpan = STOCK_DAILY_VOL_MAX - STOCK_DAILY_VOL_MIN;
  const dailyVol = Math.round((STOCK_DAILY_VOL_MIN + rng.random() * volSpan) * 10000) / 10000;
  const id = `stk-${seq}-${rng.id()}`;
  return {
    id,
    name,
    sector,
    startPrice: price,
    dailyVol,
    shares: 0,
    costBasis: 0,
    lots: [],
    price,
    history: [price],
    monthlyHistory: [price],
  };
}

/**
 * Full exchange at game start: {@link STOCK_MARKET_INITIAL_COUNT} randomly named / sectored listings.
 */
export function buildInitialStocks(params = {}) {
  const usedNames = new Set();
  const list = [];
  for (let i = 0; i < STOCK_MARKET_INITIAL_COUNT; i++) {
    let st = mintRandomStockListing(params, i + 1);
    for (let attempt = 0; attempt < 48 && usedNames.has(st.name); attempt++) {
      st = mintRandomStockListing(params, i + 1);
    }
    usedNames.add(st.name);
    list.push(st);
  }
  return list;
}

export function buyStock(state, assetId, qty) {
  if (!state.unlockedStocks) {
    return appendLog(state, `Stock market locked — pay ${fmt(UNLOCK_COST_STOCKS)} on the Stocks tab to unlock.`, "bad");
  }
  return tradeAsset(state, "stocks", assetId, qty, "buy", "share");
}

export function sellStock(state, assetId, qty) {
  if (!state.unlockedStocks) {
    return appendLog(state, `Stock market locked — pay ${fmt(UNLOCK_COST_STOCKS)} on the Stocks tab to unlock.`, "bad");
  }
  return tradeAsset(state, "stocks", assetId, qty, "sell", "share");
}

export function stocksPortfolioValue(state) {
  return (state.stocks || []).reduce((sum, st) => sum + (st.shares * st.price), 0);
}

export function evolveStocksForDay(s, params, isMonthEnd) {
  const rng = resolveRng(params);
  const refVol = 0.02;
  const volMultiplier = (params.volStock ?? refVol) / refVol;
  const drift = params.driftIndex ?? DEFAULT_MARKET_DRIFT;
  return evolveTrackedAssets(s.stocks, {
    volMultiplier,
    includeMonthlyHistory: true,
    drift,
    isMonthEnd,
    randn: () => rng.randn(),
  });
}

/**
 * Evolve prices, then remove listings under $1/share (cash-settle holdings). No new listings.
 */
export function evolveStocksAndDelistFailures(s, params, isMonthEnd, newDay) {
  const evolved = evolveStocksForDay(s, params, isMonthEnd);
  let cashDelta = 0;
  let stockRealizedPLDelta = 0;
  const logLines = [];
  const survivors = [];
  const bankruptEntries = [];

  const threshold = Number.isFinite(params.stockDelistPriceUsd)
    ? params.stockDelistPriceUsd
    : STOCK_DELIST_PRICE_USD;

  for (const st of evolved) {
    if (st.price < threshold) {
      bankruptEntries.push({ id: st.id, name: st.name, sector: st.sector });
      const shares = st.shares || 0;
      if (shares > 0) {
        const proceeds = shares * st.price;
        const costRemoved = costBasisForHifoSale(st, "shares", shares);
        const realizedPl = proceeds - costRemoved;
        stockRealizedPLDelta += realizedPl;
        cashDelta += proceeds;
        logLines.push({
          msg: `${st.name} delisted below ${fmt(threshold)} — ${shares} share(s) liquidated at $${st.price.toFixed(2)} (P/L ${fmtSignedMoney2(realizedPl)}).`,
          type: "bad",
          day: newDay,
        });
      } else {
        logLines.push({
          msg: `${st.name} (${st.sector}) delisted — traded below ${fmt(threshold)} per share.`,
          type: "info",
          day: newDay,
        });
      }
      continue;
    }
    survivors.push(st);
  }

  return {
    stocks: survivors,
    cashDelta,
    stockRealizedPLDelta,
    logLines,
    bankruptEntries,
  };
}
