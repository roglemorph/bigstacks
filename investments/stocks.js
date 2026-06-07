import {
  tradeAsset,
  evolveTrackedAssets,
  appendLog,
  fmt,
  fmtSignedMoney2,
  DEFAULT_MARKET_DRIFT,
  costBasisForHifoSale,
} from "./shared.js";
import { resolveRng } from "./rng.js";
import { UNLOCK_COST_STOCKS } from "./marketUnlock.js";
import { isBondQuarterEnd } from "./bondRepricing.js";

/** Number of listings at a new run (market may shrink as names delist; nothing refills). */
export const STOCK_MARKET_INITIAL_COUNT = 10;

/** Shares are removed from the board when spot falls strictly below this USD price. */
export const STOCK_DELIST_PRICE_USD = 1;

/** Daily vol range for randomly generated listings (applied before `params.volStock` multiplier). */
export const STOCK_DAILY_VOL_MIN = 0.011;
export const STOCK_DAILY_VOL_MAX = 0.042;

/** Inclusive USD range for each stock's day-1 price (crypto caps below this). */
export const STOCK_START_PRICE_MIN = 28;
export const STOCK_START_PRICE_MAX = 95;

export const STOCK_FAIR_PE = 20;
/** Drift bar scale (display only): ±0.25%/day. */
export const STOCK_DRIFT_DISPLAY_MIN = -0.0025;
export const STOCK_DRIFT_DISPLAY_MAX = 0.0025;
/** Vol range for drift-bar tick width (display only; does not affect price sim). */
export const STOCK_VOL_DISPLAY_MIN = 0.008;
export const STOCK_VOL_DISPLAY_MAX = 0.038;
export const DRIFT_TICK_WIDTH_MIN = 4;
export const DRIFT_TICK_WIDTH_MAX = 26;

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

const SECTOR_FUNDAMENTAL_BIAS = {
  Technology: { growth: 0.06, div: -0.01, de: -0.2 },
  Healthcare: { growth: 0.03, div: 0.005, de: 0 },
  Financials: { growth: 0.01, div: 0.02, de: 0.5 },
  Utilities: { growth: -0.02, div: 0.03, de: 0.3 },
  Energy: { growth: 0, div: 0.02, de: 0.4 },
  "Consumer staples": { growth: 0.01, div: 0.025, de: 0.1 },
  "Consumer discretionary": { growth: 0.04, div: 0.005, de: 0.2 },
  Industrials: { growth: 0.02, div: 0.015, de: 0.35 },
  Materials: { growth: 0.01, div: 0.015, de: 0.45 },
  "Real estate": { growth: 0, div: 0.03, de: 0.8 },
  "Communication services": { growth: 0.05, div: 0.01, de: 0.25 },
};

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function hashId(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pseudoRngFromId(id, salt = 0) {
  const h = hashId(`${id}:${salt}`);
  return (h % 10000) / 10000;
}

export function stockPeRatio(stock) {
  const eps = stock?.eps;
  if (!Number.isFinite(eps) || eps <= 0) return null;
  const price = stock?.price ?? 0;
  if (!Number.isFinite(price) || price <= 0) return null;
  return price / eps;
}

export function computeStockDailyDrift(stock, params = {}) {
  const base = Number.isFinite(params.driftIndex) ? params.driftIndex : DEFAULT_MARKET_DRIFT;
  let drift = base;

  const rev = stock?.revenueGrowth;
  if (Number.isFinite(rev)) drift += rev / 365;

  const pe = stockPeRatio(stock);
  if (pe != null) {
    const mispricing = (pe - STOCK_FAIR_PE) / STOCK_FAIR_PE;
    drift += clamp(-0.0003, -mispricing * 0.00004, 0.0003);
  }

  if (Number.isFinite(stock?.eps) && stock.eps <= 0) {
    drift -= 0.00015;
  }

  return drift;
}

export function computeStockEffectiveVol(stock, params = {}) {
  const refVol = 0.02;
  const volMultiplier = (params.volStock ?? refVol) / refVol;
  const baseVol = Number.isFinite(stock?.dailyVol) ? stock.dailyVol : 0.02;
  const de = Number.isFinite(stock?.debtToEquity) ? stock.debtToEquity : 1;
  const leverageMult = Math.min(2.5, 1 + 0.12 * de);
  return baseVol * leverageMult * volMultiplier;
}

function sectorBias(sector) {
  return SECTOR_FUNDAMENTAL_BIAS[sector] || { growth: 0, div: 0, de: 0 };
}

function mintFundamentals(sector, rng) {
  const bias = sectorBias(sector);
  const eps = Math.round((0.5 + rng.random() * 7.5) * 100) / 100;
  const debtToEquity = Math.round(clamp(0.2, 0.2 + rng.random() * 3.3 + bias.de, 3.5) * 100) / 100;
  const revenueGrowth = Math.round(clamp(-0.05, -0.05 + rng.random() * 0.25 + bias.growth, 0.2) * 1000) / 1000;
  const dividendYield = Math.round(clamp(0, rng.random() * 0.06 + bias.div, 0.06) * 1000) / 1000;
  return { eps, debtToEquity, revenueGrowth, dividendYield };
}

export function backfillStockFundamentals(stock) {
  if (
    Number.isFinite(stock.eps) &&
    Number.isFinite(stock.debtToEquity) &&
    Number.isFinite(stock.revenueGrowth) &&
    Number.isFinite(stock.dividendYield)
  ) {
    return stock;
  }
  const r0 = pseudoRngFromId(stock.id, 0);
  const r1 = pseudoRngFromId(stock.id, 1);
  const r2 = pseudoRngFromId(stock.id, 2);
  const r3 = pseudoRngFromId(stock.id, 3);
  const bias = sectorBias(stock.sector);
  return {
    ...stock,
    eps: Number.isFinite(stock.eps) ? stock.eps : Math.round((0.5 + r0 * 7.5) * 100) / 100,
    debtToEquity: Number.isFinite(stock.debtToEquity)
      ? stock.debtToEquity
      : Math.round(clamp(0.2, 0.2 + r1 * 3.3 + bias.de, 3.5) * 100) / 100,
    revenueGrowth: Number.isFinite(stock.revenueGrowth)
      ? stock.revenueGrowth
      : Math.round(clamp(-0.05, -0.05 + r2 * 0.25 + bias.growth, 0.2) * 1000) / 1000,
    dividendYield: Number.isFinite(stock.dividendYield)
      ? stock.dividendYield
      : Math.round(clamp(0, r3 * 0.06 + bias.div, 0.06) * 1000) / 1000,
  };
}

export function randomStockName(params = {}) {
  const rng = resolveRng(params);
  const a = NAME_PREFIXES[rng.int(0, NAME_PREFIXES.length - 1)];
  const b = NAME_SUFFIXES[rng.int(0, NAME_SUFFIXES.length - 1)];
  return `${a} ${b}`;
}

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
  const fundamentals = mintFundamentals(sector, rng);
  return {
    id,
    name,
    sector,
    startPrice: price,
    dailyVol,
    ...fundamentals,
    shares: 0,
    costBasis: 0,
    lots: [],
    price,
    history: [price],
    monthlyHistory: [price],
  };
}

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

function evolveStocksWithFundamentals(stocks, params, isMonthEnd, randnFn) {
  return (stocks || []).map(stock => {
    const drift = computeStockDailyDrift(stock, params);
    const vol = computeStockEffectiveVol(stock, params);
    const shock = randnFn() * vol;
    const price = Math.max(0.01, stock.price * (1 + drift + shock));
    const next = {
      ...stock,
      price,
      history: [...(stock.history || []), price].slice(-500),
    };
    if (isMonthEnd) {
      const monthly = stock.monthlyHistory || [];
      next.monthlyHistory = [...monthly, price].slice(-100);
    }
    return next;
  });
}

export function evolveStocksForDay(s, params, isMonthEnd) {
  const rng = resolveRng(params);
  const hasFundamentals = (s.stocks || []).some(
    st => Number.isFinite(st.eps) && Number.isFinite(st.debtToEquity)
  );
  if (hasFundamentals) {
    return evolveStocksWithFundamentals(s.stocks, params, isMonthEnd, () => rng.randn());
  }
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

function processQuarterlyStockEarnings(stocks, params, newDay) {
  const rng = resolveRng(params);
  let cashDelta = 0;
  const logLines = [];
  const earningsGaps = new Map();

  const updated = (stocks || []).map(st => {
    const oldEps = st.eps ?? 1;
    const epsShock = rng.randn() * 0.08;
    let newEps = oldEps * (1 + (st.revenueGrowth || 0) / 4 + epsShock);
    newEps = Math.round(clamp(-2, newEps, 50) * 100) / 100;

    const epsDelta = newEps - oldEps;
    const deDelta = epsDelta > 0 ? -0.08 : epsDelta < 0 ? 0.12 : 0;
    let newDe = Math.round(clamp(0.1, (st.debtToEquity || 1) + deDelta + rng.randn() * 0.05, 5) * 100) / 100;

    let newRevGrowth = (st.revenueGrowth || 0) + rng.randn() * 0.02;
    newRevGrowth = Math.round(clamp(-0.05, newRevGrowth, 0.2) * 1000) / 1000;

    const shares = st.shares || 0;
    if (shares > 0 && (st.dividendYield || 0) > 0 && newEps > 0) {
      const payout = shares * st.price * (st.dividendYield / 4);
      if (payout > 0) {
        cashDelta += payout;
        logLines.push({
          msg: `${st.name} quarterly dividend: +${fmt(payout)} (${shares} sh × ${(st.dividendYield * 100).toFixed(1)}% ann.).`,
          type: "good",
          day: newDay,
        });
      }
    }

    const epsChange = (newEps - oldEps) / Math.max(Math.abs(oldEps), 0.25);
    const gap = clamp(-0.12, epsChange * 0.06, 0.12);
    if (Math.abs(gap) > 0.001) {
      earningsGaps.set(st.id, gap);
    }

    if (Math.abs(epsDelta) >= 0.05) {
      const pct = oldEps !== 0 ? ((newEps - oldEps) / Math.abs(oldEps)) * 100 : 0;
      const sign = pct >= 0 ? "+" : "";
      logLines.push({
        msg: `${st.name} Q earnings: EPS $${oldEps.toFixed(2)} → $${newEps.toFixed(2)} (${sign}${pct.toFixed(0)}%).`,
        type: Math.abs(pct) >= 15 ? (pct > 0 ? "good" : "bad") : "info",
        day: newDay,
      });
    }

    return {
      ...st,
      eps: newEps,
      debtToEquity: newDe,
      revenueGrowth: newRevGrowth,
    };
  });

  return { stocks: updated, cashDelta, logLines, earningsGaps };
}

function rollDistressBankruptcies(stocks, params, newDay) {
  const rng = resolveRng(params);
  const logLines = [];
  const bankruptIds = new Set();

  for (const st of stocks || []) {
    if ((st.eps ?? 1) > 0 || (st.debtToEquity ?? 0) <= 2.5) continue;
    const de = st.debtToEquity || 0;
    const prob = clamp(0.03, 0.03 + (de - 2.5) * 0.02, 0.08);
    if (rng.random() < prob) {
      bankruptIds.add(st.id);
      logLines.push({
        msg: `${st.name} bankrupt — negative earnings and high leverage (D/E ${de.toFixed(1)}).`,
        type: "bad",
        day: newDay,
      });
    }
  }

  return { bankruptIds, logLines };
}

/**
 * Evolve prices, then remove listings under $1/share (cash-settle holdings). No new listings.
 */
export function evolveStocksAndDelistFailures(s, params, isMonthEnd, newDay) {
  let evolved = evolveStocksForDay(s, params, isMonthEnd);
  let cashDelta = 0;
  let stockRealizedPLDelta = 0;
  const logLines = [];
  let earningsGaps = new Map();

  if (isBondQuarterEnd(newDay)) {
    const q = processQuarterlyStockEarnings(evolved, params, newDay);
    evolved = q.stocks;
    cashDelta += q.cashDelta;
    logLines.push(...q.logLines);
    earningsGaps = q.earningsGaps;

    evolved = evolved.map(st => {
      const gap = earningsGaps.get(st.id);
      if (gap == null) return st;
      const price = Math.max(0.01, st.price * (1 + gap));
      return {
        ...st,
        price,
        history: [...(st.history || []), price].slice(-500),
      };
    });

    const distress = rollDistressBankruptcies(evolved, params, newDay);
    logLines.push(...distress.logLines);
    if (distress.bankruptIds.size) {
      evolved = evolved.map(st =>
        distress.bankruptIds.has(st.id) ? { ...st, price: STOCK_DELIST_PRICE_USD - 0.01 } : st
      );
    }
  }

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
