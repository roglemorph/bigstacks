// ============================================================
// GAME LOGIC — no DOM, no rendering, pure state + functions
// ============================================================

// Yield curve baseline: term (years) → annual yield (curve in state mean-reverts here over time)
export const YIELD_CURVE = [
  { term: 1,  yield: 0.030 },
  { term: 2,  yield: 0.035 },
  { term: 5,  yield: 0.042 },
  { term: 10, yield: 0.048 },
  { term: 30, yield: 0.052 },
];

export const CORPORATE_BOND_OFFERS = [
  { id: "acme-5y", issuer: "Acme Manufacturing", term: 5, faceValue: 1000, yield: 0.058, rating: "BBB" },
  { id: "northstar-7y", issuer: "Northstar Energy", term: 7, faceValue: 1000, yield: 0.066, rating: "BB+" },
  { id: "bluefin-10y", issuer: "Bluefin Logistics", term: 10, faceValue: 1000, yield: 0.072, rating: "BB" },
];

export const INDEX_FUNDS = [
  { id: "spy",  name: "Index Fund A (Broad Market)", startPrice: 100.0, dailyVol: 0.0126 },
];

export const CRYPTOS = [
  { id: "btc", name: "Bitcoin (BTC)", startPrice: 50.0, dailyVol: 0.0400 },
  { id: "eth", name: "Ethereum (ETH)", startPrice: 38.0, dailyVol: 0.0480 },
  { id: "sol", name: "Solana (SOL)", startPrice: 24.0, dailyVol: 0.0600 },
];

export const STOCKS = [
  { id: "aapl", name: "Stock A", startPrice: 45.0, dailyVol: 0.0180 },
  { id: "msft", name: "Stock B", startPrice: 48.0, dailyVol: 0.0170 },
  { id: "nvda", name: "Stock C", startPrice: 42.0, dailyVol: 0.0300 },
  { id: "tsla", name: "Stock D", startPrice: 32.0, dailyVol: 0.0360 },
];

export const OPTIONS = [
  { id: "spy-lower-put",  name: "Put OTM",  optionType: "put",  strikeRef: "lower", startPrice: 6.0, dailyVol: 0.0800, underlyingId: "spy", leverage: 3.2, theta: 0.0035, direction: -1 },
  { id: "spy-upper-put",  name: "Put ITM",  optionType: "put",  strikeRef: "upper", startPrice: 9.0, dailyVol: 0.0820, underlyingId: "spy", leverage: 3.3, theta: 0.0038, direction: -1 },
  { id: "spy-lower-call", name: "Call ITM", optionType: "call", strikeRef: "lower", startPrice: 9.0, dailyVol: 0.0820, underlyingId: "spy", leverage: 3.3, theta: 0.0038, direction: 1 },
  { id: "spy-upper-call", name: "Call OTM", optionType: "call", strikeRef: "upper", startPrice: 6.0, dailyVol: 0.0800, underlyingId: "spy", leverage: 3.2, theta: 0.0035, direction: 1 },
];

function roundToNearestFive(n) {
  return Math.max(1, Math.round(n / 5) * 5);
}

function optionStrikesForUnderlying(underlyingPrice, offsetPct = 0.08) {
  const center = Math.max(1, underlyingPrice);
  const lower = roundToNearestFive(center * (1 - offsetPct));
  const upper = roundToNearestFive(center * (1 + offsetPct));
  return {
    lower: Math.min(lower, upper - 1),
    upper: Math.max(upper, lower + 1),
  };
}

/** Interpolate annual yield for a term (years) from a pillar curve. */
export function interpolateYield(curve, term) {
  const exact = curve.find(p => p.term === term);
  if (exact) return exact.yield;
  const below = [...curve].reverse().find(p => p.term <= term);
  const above = curve.find(p => p.term >= term);
  if (!below) return above.yield;
  if (!above) return below.yield;
  const t = (term - below.term) / (above.term - below.term);
  return below.yield + t * (above.yield - below.yield);
}

/** Current market yield for `term` using the state's evolving curve (falls back to baseline). */
export function yieldForTerm(state, term) {
  const curve = state && state.yieldCurve && state.yieldCurve.length ? state.yieldCurve : YIELD_CURVE;
  return interpolateYield(curve, term);
}

function cloneYieldCurve(curve) {
  return curve.map(p => ({ term: p.term, yield: p.yield }));
}

/** One-day random walk + mean reversion toward YIELD_CURVE pillars. */
function evolveYieldCurve(state, params = {}) {
  const vol = params.yieldCurveVol ?? 0.0007;
  const kappa = params.yieldCurveKappa ?? 0.018;
  const yMin = params.yieldCurveMin ?? 0.002;
  const yMax = params.yieldCurveMax ?? 0.20;
  const curve = state.yieldCurve && state.yieldCurve.length ? state.yieldCurve : YIELD_CURVE;
  return YIELD_CURVE.map((base, i) => {
    const current = curve[i]?.yield ?? base.yield;
    const shock = randn() * vol;
    let y = current + shock + kappa * (base.yield - current);
    y = Math.max(yMin, Math.min(yMax, y));
    return { term: base.term, yield: y };
  });
}

export function newState(params = {}) {
  const cash = params.startCash ?? 10_000;
  const baseUnderlying = INDEX_FUNDS.find(f => f.id === "spy")?.startPrice ?? 100;
  const strikes = optionStrikesForUnderlying(baseUnderlying, params.optionStrikeOffsetPct ?? 0.08);
  const corporateSpreadMult = params.corporateSpreadMult ?? 1.0;
  return {
    day: 1,
    maxDays: params.maxDays ?? 2000,
    startCash: cash,
    cash,
    indexFunds: INDEX_FUNDS.map(f => ({ ...f, shares: 0, costBasis: 0, price: f.startPrice, history: [f.startPrice], monthlyHistory: [f.startPrice] })),
    bondHoldings: [],   // list of individual bond purchases
    corporateBondOffers: CORPORATE_BOND_OFFERS.map(b => ({
      ...b,
      yield: Math.max(0.001, b.yield * corporateSpreadMult),
    })),
    yieldCurve: cloneYieldCurve(YIELD_CURVE),
    cryptos: CRYPTOS.map(c => ({ ...c, coins: 0, costBasis: 0, price: c.startPrice, history: [c.startPrice] })),
    stocks: STOCKS.map(stk => ({ ...stk, shares: 0, costBasis: 0, price: stk.startPrice, history: [stk.startPrice] })),
    options: OPTIONS.map(opt => ({
      ...opt,
      strike: strikes[opt.strikeRef] ?? baseUnderlying,
      contracts: 0,
      costBasis: 0,
      price: opt.startPrice,
      history: [opt.startPrice],
    })),
    netWorthHistory: [cash],
    log: [],
  };
}

export function portfolioValue(state) {
  const bondsValue = (state.bondHoldings || []).reduce((sum, b) => sum + b.faceValue, 0);
  const indexValue = (state.indexFunds || []).reduce((sum, f) => sum + (f.shares * f.price), 0);
  const cryptoValue = (state.cryptos || []).reduce((sum, c) => sum + (c.coins * c.price), 0);
  const stockValue = (state.stocks || []).reduce((sum, st) => sum + (st.shares * st.price), 0);
  const optionsValue = (state.options || []).reduce((sum, op) => sum + (op.contracts * op.price), 0);
  return indexValue + bondsValue + cryptoValue + stockValue + optionsValue;
}

export function netWorth(state) {
  return state.cash + portfolioValue(state);
}

// ── helpers ──
function appendLog(state, msg, type) {
  return { ...state, log: [...state.log, { msg, type, day: state.day }] };
}

function tradeAsset(state, listKey, assetId, qty, mode, unitLabel) {
  const list = state[listKey] || [];
  const idx = list.findIndex(a => a.id === assetId);
  if (idx < 0) return appendLog(state, `Asset not found.`, "bad");
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
  const next = { ...state, cash: state.cash + proceeds, [listKey]: nextList };
  return appendLog(next, `Sold ${qty} ${asset.name} ${unitLabel}(s) @ $${price.toFixed(2)}.`, "info");
}

// ── index funds ──
export function buyIndexFund(state, assetId, qty) {
  return tradeAsset(state, "indexFunds", assetId, qty, "buy", "share");
}

export function sellIndexFund(state, assetId, qty) {
  return tradeAsset(state, "indexFunds", assetId, qty, "sell", "share");
}

// Backwards-compatible wrappers (default to first index fund)
export function buy(state, qty) {
  const first = (state.indexFunds || [])[0];
  return first ? buyIndexFund(state, first.id, qty) : appendLog(state, "No index funds configured.", "bad");
}

export function sell(state, qty) {
  const first = (state.indexFunds || [])[0];
  return first ? sellIndexFund(state, first.id, qty) : appendLog(state, "No index funds configured.", "bad");
}

// ── bonds ──
// Each bond holding: { id, faceValue, term, yield, purchaseDay, maturityDay, couponAccrued }
export function buyBond(state, faceValue, term) {
  if (faceValue > state.cash) return appendLog(state, `Need ${fmt(faceValue)} — only have ${fmt(state.cash)}.`, "bad");
  const y = yieldForTerm(state, term);
  const bond = {
    id: state.day + "_" + Math.random().toString(36).slice(2, 6),
    type: "treasury",
    issuer: "U.S. Treasury",
    faceValue,
    term,
    yield: y,
    purchaseDay: state.day,
    maturityDay: state.day + term * 365,
    couponAccrued: 0,
  };
  const next = {
    ...state,
    cash: state.cash - faceValue,
    bondHoldings: [...(state.bondHoldings || []), bond],
  };
  return appendLog(next, `Bought ${term}yr bond — face ${fmt(faceValue)}, yield ${(y * 100).toFixed(2)}%.`, "good");
}

export function buyCorporateBond(state, offerId) {
  const offer = (state.corporateBondOffers || []).find(b => b.id === offerId);
  if (!offer) return appendLog(state, `Corporate bond offer not found.`, "bad");
  if (offer.faceValue > state.cash) return appendLog(state, `Need ${fmt(offer.faceValue)} — only have ${fmt(state.cash)}.`, "bad");
  const bond = {
    id: state.day + "_" + Math.random().toString(36).slice(2, 6),
    type: "corporate",
    issuer: offer.issuer,
    rating: offer.rating,
    faceValue: offer.faceValue,
    term: offer.term,
    yield: offer.yield,
    purchaseDay: state.day,
    maturityDay: state.day + offer.term * 365,
    couponAccrued: 0,
  };
  const next = {
    ...state,
    cash: state.cash - offer.faceValue,
    bondHoldings: [...(state.bondHoldings || []), bond],
  };
  return appendLog(
    next,
    `Bought ${offer.issuer} ${offer.term}yr bond (${offer.rating}) — face ${fmt(offer.faceValue)}, yield ${(offer.yield * 100).toFixed(2)}%.`,
    "good"
  );
}

export function sellBondEarly(state, bondId) {
  const bond = (state.bondHoldings || []).find(b => b.id === bondId);
  if (!bond) return appendLog(state, `Bond not found.`, "bad");
  const penalty = 0.15;
  const proceeds = Math.round(bond.faceValue * (1 - penalty));
  const next = {
    ...state,
    cash: state.cash + proceeds,
    bondHoldings: state.bondHoldings.filter(b => b.id !== bondId),
  };
  return appendLog(next, `Sold bond early — received ${fmt(proceeds)} (15% penalty applied).`, "info");
}

// ── crypto ──
export function buyCrypto(state, assetId, qty) {
  return tradeAsset(state, "cryptos", assetId, qty, "buy", "coin");
}

export function sellCrypto(state, assetId, qty) {
  return tradeAsset(state, "cryptos", assetId, qty, "sell", "coin");
}

// ── stocks ──
export function buyStock(state, assetId, qty) {
  return tradeAsset(state, "stocks", assetId, qty, "buy", "share");
}

export function sellStock(state, assetId, qty) {
  return tradeAsset(state, "stocks", assetId, qty, "sell", "share");
}

// ── options ──
export function buyOption(state, assetId, qty) {
  return tradeAsset(state, "options", assetId, qty, "buy", "contract");
}

export function sellOption(state, assetId, qty) {
  return tradeAsset(state, "options", assetId, qty, "sell", "contract");
}

// ── advance one day ──
export function nextDay(state, params = {}) {
  if (state.day >= state.maxDays) return state;

  let s = state;
  let cash = s.cash;
  let newLog = [...s.log];

  const dailyVol  = params.volIndex  ?? 0.0126;
  const indexDrift = params.driftIndex ?? 0.00025;
  const cryptoVol = params.volCrypto ?? 0.04;
  const stockVol  = params.volStock  ?? 0.02;
  const optionsVol = params.volOptions ?? 0.075;

  // Process bond holdings: accrue daily coupon, mature if due
  let updatedBonds = [];
  for (const bond of (s.bondHoldings || [])) {
    const dailyCoupon = bond.faceValue * (bond.yield / 365);
    cash += dailyCoupon;
    if (s.day >= bond.maturityDay) {
      // Bond matures: return face value (already accruing coupon daily, so just remove)
      cash += bond.faceValue;
      newLog.push({ msg: `Bond matured — received face value ${fmt(bond.faceValue)}.`, type: "good", day: s.day });
    } else {
      updatedBonds.push({ ...bond, couponAccrued: bond.couponAccrued + dailyCoupon });
    }
  }

  // Life events are temporarily disabled.

  const newDay = s.day + 1;
  const isMonthEnd = newDay % 30 === 0;
  const yieldCurve = evolveYieldCurve(s, params);
  const evolveAssets = (assets, overrideVol, includeMonthlyHistory = false, drift = 0) => (
    (assets || []).map(asset => {
      const vol = overrideVol ?? asset.dailyVol;
      const shock = randn() * vol;
      const price = Math.max(0.01, asset.price * (1 + drift + shock));
      const next = {
        ...asset,
        price,
        history: [...asset.history, price].slice(-500),
      };
      if (includeMonthlyHistory) {
        next.monthlyHistory = isMonthEnd
          ? [...(asset.monthlyHistory || []), price]
          : (asset.monthlyHistory || []);
      }
      return next;
    })
  );

  const updatedIndexFunds = evolveAssets(s.indexFunds, dailyVol, true, indexDrift);
  const updatedCryptos = evolveAssets(s.cryptos, cryptoVol, false);
  const updatedStocks = evolveAssets(s.stocks, stockVol, false);
  const existingOptionsById = Object.fromEntries((s.options || []).map(o => [o.id, o]));
  const updatedOptions = OPTIONS.map(template => {
    const prevState = existingOptionsById[template.id];
    const option = prevState ? { ...template, ...prevState } : { ...template, contracts: 0, costBasis: 0, price: template.startPrice, history: [template.startPrice] };
    const underlyingPrev = ((s.indexFunds || []).find(f => f.id === option.underlyingId)?.price) ?? 100;
    const underlyingNext = ((updatedIndexFunds || []).find(f => f.id === option.underlyingId)?.price) ?? underlyingPrev;
    const strikes = optionStrikesForUnderlying(underlyingNext, params.optionStrikeOffsetPct ?? 0.08);
    const strike = strikes[option.strikeRef] ?? option.strike ?? underlyingNext;
    const underlyingRet = underlyingPrev > 0 ? ((underlyingNext - underlyingPrev) / underlyingPrev) : 0;
    const shock = randn() * (optionsVol ?? option.dailyVol);
    const direction = option.direction ?? (option.optionType === "put" ? -1 : 1);
    const intrinsic = option.optionType === "put"
      ? Math.max(strike - underlyingNext, 0)
      : Math.max(underlyingNext - strike, 0);
    const moneyness = Math.abs(underlyingNext - strike) / Math.max(strike, 1);
    const baseTimeValue = Math.max(0.15, underlyingNext * 0.015 * (1 - Math.min(moneyness, 1)));
    const timeValue = Math.max(0, baseTimeValue * (1 + randn() * 0.2));
    const target = intrinsic + timeValue;

    const drift = (underlyingRet * option.leverage * direction) + (shock * 0.6) - ((option.theta || 0.003) * 0.35);
    const momentumPrice = option.price * (1 + drift);
    const price = Math.max(0.05, (momentumPrice * 0.55) + (target * 0.45));
    return {
      ...option,
      strike,
      price,
      history: [...option.history, price].slice(-500),
    };
  });

  const updated = {
    ...s,
    day: newDay,
    cash,
    yieldCurve,
    indexFunds: updatedIndexFunds,
    cryptos: updatedCryptos,
    stocks: updatedStocks,
    options: updatedOptions,
    bondHoldings: updatedBonds,
    log: newLog,
  };

  const prevNetWorth = netWorth(s);
  const nw = netWorth(updated);
  const withNW = {
    ...updated,
    netWorthHistory: [...s.netWorthHistory, Math.round(nw)].slice(-500),
  };

  if (newDay >= s.maxDays) {
    return { ...withNW, log: [...withNW.log, { msg: `── RUN OVER ── Net worth: $${fmt(nw)}`, type: "event", day: newDay }] };
  }

  return withNW;
}

// Box-Muller normal distribution
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function fmt(n) {
  return '$' + Math.round(n).toLocaleString();
}