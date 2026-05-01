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
  const vol = params.yieldCurveVol ?? 0.00014;
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

// Jobs — daily pay when you click Work (before advancing the day)
// minNetWorth: minimum net worth to apply (or start with, via debug)
const JOBS = [
  { id: "intern", title: "Intern", dailyPay: 10, minNetWorth: 0 },
  { id: "clerk", title: "Clerk", dailyPay: 40, minNetWorth: 100_000 },
  { id: "analyst", title: "Analyst", dailyPay: 95, minNetWorth: 100_000 },
  { id: "director", title: "Director", dailyPay: 220, minNetWorth: 1_000_000 },
];
export { JOBS };

export function jobById(id) {
  return JOBS.find(j => j.id === id) ?? JOBS[0];
}

/** Highest-tier job the player qualifies for at this net worth (JOBS ordered low → high). */
export function highestJobForNetWorth(nw) {
  let pick = JOBS[0];
  for (const j of JOBS) {
    if (nw >= j.minNetWorth) pick = j;
  }
  return pick;
}

export function jobUnlockedAtNetWorth(job, nw) {
  return nw >= job.minNetWorth;
}

export function newState(params = {}) {
  const cash = params.startCash ?? 10_000;
  const startNw = cash;
  const wanted = jobById(params.startJobId ?? "intern");
  const job = jobUnlockedAtNetWorth(wanted, startNw)
    ? { ...wanted }
    : { ...highestJobForNetWorth(startNw) };
  return {
    day: 1,
    maxDays: 365 * 30,
    cash,
    job,
    indexFund: { shares: 0, price: 100.0, history: [100.0], monthlyHistory: [100.0] },
    bondHoldings: [],   // list of individual bond purchases
    yieldCurve: cloneYieldCurve(YIELD_CURVE),
    crypto:    { coins: 0, price: 50.0, history: [50.0] },
    netWorthHistory: [cash],
    log: [],
  };
}

export function portfolioValue(state) {
  const bondsValue = (state.bondHoldings || []).reduce((sum, b) => sum + b.faceValue, 0);
  return (state.indexFund.shares * state.indexFund.price)
       + bondsValue
       + (state.crypto.coins * state.crypto.price);
}

export function netWorth(state) {
  return state.cash + portfolioValue(state);
}

// ── helpers ──
function appendLog(state, msg, type) {
  return { ...state, log: [...state.log, { msg, type, day: state.day }] };
}

// ── index fund ──
export function buy(state, qty) {
  const cost = qty * state.indexFund.price;
  if (cost > state.cash) return appendLog(state, `Need ${fmt(cost)} — only have ${fmt(state.cash)}.`, "bad");
  const next = { ...state, cash: state.cash - cost, indexFund: { ...state.indexFund, shares: state.indexFund.shares + qty } };
  return appendLog(next, `Bought ${qty} Index Fund share(s) @ $${state.indexFund.price.toFixed(2)}.`, "good");
}

export function sell(state, qty) {
  if (qty > state.indexFund.shares) return appendLog(state, `Only have ${state.indexFund.shares} shares.`, "bad");
  const proceeds = qty * state.indexFund.price;
  const next = { ...state, cash: state.cash + proceeds, indexFund: { ...state.indexFund, shares: state.indexFund.shares - qty } };
  return appendLog(next, `Sold ${qty} Index Fund share(s) @ $${state.indexFund.price.toFixed(2)}.`, "info");
}

// ── bonds ──
// Each bond holding: { id, faceValue, term, yield, purchaseDay, maturityDay, couponAccrued }
export function buyBond(state, faceValue, term) {
  if (faceValue > state.cash) return appendLog(state, `Need ${fmt(faceValue)} — only have ${fmt(state.cash)}.`, "bad");
  const y = yieldForTerm(state, term);
  const bond = {
    id: state.day + "_" + Math.random().toString(36).slice(2, 6),
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
export function buyCrypto(state, qty) {
  const cost = qty * state.crypto.price;
  if (cost > state.cash) return appendLog(state, `Need ${fmt(cost)} — only have ${fmt(state.cash)}.`, "bad");
  const next = { ...state, cash: state.cash - cost, crypto: { ...state.crypto, coins: state.crypto.coins + qty } };
  return appendLog(next, `Bought ${qty} coin(s) @ $${state.crypto.price.toFixed(2)}.`, "good");
}

export function sellCrypto(state, qty) {
  if (qty > state.crypto.coins) return appendLog(state, `Only have ${state.crypto.coins} coin(s).`, "bad");
  const proceeds = qty * state.crypto.price;
  const next = { ...state, cash: state.cash + proceeds, crypto: { ...state.crypto, coins: state.crypto.coins - qty } };
  return appendLog(next, `Sold ${qty} coin(s) @ $${state.crypto.price.toFixed(2)}.`, "info");
}

// ── work ──
export function work(state, params = {}) {
  const payout = state.job.dailyPay;
  const withWage = { ...state, cash: state.cash + payout };
  const logged = appendLog(withWage, `Worked (${state.job.title}) — earned $${payout}.`, "info");
  return nextDay(logged, params);
}

export function applyForJob(state, jobId) {
  const job = jobById(jobId);
  if (state.job.id === job.id) {
    return appendLog(state, `Already employed as ${job.title}.`, "info");
  }
  const nw = netWorth(state);
  if (!jobUnlockedAtNetWorth(job, nw)) {
    return appendLog(state, `${job.title} requires net worth ${fmt(job.minNetWorth)}+ (you have ${fmt(nw)}).`, "bad");
  }
  const next = { ...state, job: { ...job } };
  return appendLog(next, `New job: ${job.title} — $${job.dailyPay}/day when you Work.`, "good");
}

// ── advance one day ──
export function nextDay(state, params = {}) {
  if (state.day >= state.maxDays) return state;

  let s = state;
  let cash = s.cash;
  let newLog = [...s.log];

  const dailyVol  = params.volIndex  ?? 0.0126;
  const cryptoVol = params.volCrypto ?? 0.04;
  const eventFreq = params.eventFreq ?? 365;
  const eventMin  = params.eventMin  ?? 800;
  const eventMax  = params.eventMax  ?? 3300;

  // Index fund price
  const ifShock = randn() * dailyVol;
  const ifPrice = Math.max(0.01, s.indexFund.price * (1 + ifShock));

  // Crypto price
  const cryptoShock = randn() * cryptoVol;
  const cryptoPrice = Math.max(0.01, s.crypto.price * (1 + cryptoShock));

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

  // Life event
  if (Math.random() < 1 / eventFreq) {
    const hit = Math.round(eventMin + Math.random() * (eventMax - eventMin));
    cash = Math.max(0, cash - hit);
    newLog.push({ msg: `⚡ Unexpected expense: $${fmt(hit)}.`, type: "event", day: s.day });
  }

  const newDay = s.day + 1;
  const isMonthEnd = newDay % 30 === 0;
  const yieldCurve = evolveYieldCurve(s, params);

  const updated = {
    ...s,
    day: newDay,
    cash,
    yieldCurve,
    indexFund: {
      ...s.indexFund,
      price: ifPrice,
      history: [...s.indexFund.history, ifPrice].slice(-500),
      monthlyHistory: isMonthEnd ? [...(s.indexFund.monthlyHistory || []), ifPrice] : (s.indexFund.monthlyHistory || []),
    },
    crypto: { ...s.crypto, price: cryptoPrice, history: [...s.crypto.history, cryptoPrice].slice(-500) },
    bondHoldings: updatedBonds,
    log: newLog,
  };

  const nw = netWorth(updated);
  const withNW = { ...updated, netWorthHistory: [...s.netWorthHistory, Math.round(nw)].slice(-500) };

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