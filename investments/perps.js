import { appendLog, fmt, fmtSignedMoney2, randn, addCumulativeRealizedPL } from "./shared.js";
import { resolveRng } from "./rng.js";
import { UNLOCK_COST_OPTIONS } from "./marketUnlock.js";
import { OPTION_SHARES_PER_CONTRACT } from "./options.js";

export const PERP_ID = "spy-perp";
export const PERP_UNDERLYING_ID = "spy";
export const PERP_NAME = "SPY Perp";

/** Notional per contract (index shares × mark). */
export const PERP_SHARES_PER_CONTRACT = OPTION_SHARES_PER_CONTRACT;

/** Default annualized funding (~10% / yr). */
export const DEFAULT_PERP_FUNDING_RATE_ANNUAL = 0.1;

/** Opening fee as bps of notional (per leg). */
export const DEFAULT_PERP_OPEN_PREMIUM_BPS = 10;

/** Minimum opening premium per contract. */
export const DEFAULT_PERP_OPEN_PREMIUM_MIN = 25;

export function perpUnderlyingPrice(state) {
  return (state.indexFunds || []).find(f => f.id === PERP_UNDERLYING_ID)?.price ?? 0;
}

/** Perp mark — tracks index with optional basis (bps). */
export function perpMarkPrice(state) {
  const u = perpUnderlyingPrice(state);
  const basisBps = Number.isFinite(state.perpBasisBps) ? state.perpBasisBps : 0;
  return Math.max(0.01, u * (1 + basisBps / 10000));
}

/** Daily funding rate (decimal). Longs pay shorts when positive. */
export function perpFundingRateDaily(state) {
  const r = state.perpFundingRateDaily;
  if (Number.isFinite(r)) return Math.max(-0.01, Math.min(0.01, r));
  return DEFAULT_PERP_FUNDING_RATE_ANNUAL / 365;
}

export function perpFundingRateAnnual(state) {
  return perpFundingRateDaily(state) * 365;
}

export function openPerpPositions(state) {
  return (state.perpHoldings || []).filter(p => (p.contracts || 0) > 0);
}

export function perpPositionUnrealizedPL(position, mark) {
  const diff = mark - (position.entryMark || mark);
  const perContract = diff * PERP_SHARES_PER_CONTRACT;
  return position.side === "long"
    ? position.contracts * perContract
    : position.contracts * -perContract;
}

/** Mark P/L minus cumulative funding cash flow (fundingPaid: longs pay positive). */
export function perpPositionTotalPL(position, mark) {
  return perpPositionUnrealizedPL(position, mark) - (position.fundingPaid || 0);
}

/** Mark-to-market P/L for all open perps (added to portfolio / net worth). */
export function perpHoldingsMarkValue(state) {
  const mark = perpMarkPrice(state);
  return openPerpPositions(state).reduce((sum, p) => sum + perpPositionUnrealizedPL(p, mark), 0);
}

export function perpHoldingsUnrealizedPL(state) {
  return perpHoldingsMarkValue(state);
}

/** Cash premium to open `contracts` at `mark` (bps of notional, floor per contract). */
export function perpOpenPremiumTotal(contracts, mark, params = {}) {
  const c = Math.max(1, Math.floor(Number(contracts)) || 1);
  const m = Math.max(0.01, Number(mark) || 0.01);
  const bps = Number.isFinite(params.perpOpenPremiumBps)
    ? params.perpOpenPremiumBps
    : DEFAULT_PERP_OPEN_PREMIUM_BPS;
  const minPerContract = Number.isFinite(params.perpOpenPremiumMin)
    ? params.perpOpenPremiumMin
    : DEFAULT_PERP_OPEN_PREMIUM_MIN;
  const notional = c * m * PERP_SHARES_PER_CONTRACT;
  return Math.max(c * minPerContract, notional * (bps / 10000));
}

/** Cash change from funding: negative = pay, positive = receive. */
export function perpFundingCashDelta(side, payment) {
  return side === "long" ? -payment : payment;
}

function ensureUnlocked(state) {
  if (!state.unlockedOptions) {
    return {
      ok: false,
      state: appendLog(
        state,
        `Options market locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to unlock.`,
        "bad"
      ),
    };
  }
  return { ok: true, state };
}

/** Open or add to a perp position (side = long | short). */
export function openPerp(state, side, qty, params = {}) {
  const check = ensureUnlocked(state);
  if (!check.ok) return check.state;
  const contracts = Math.max(1, parseInt(qty, 10) || 1);
  if (side !== "long" && side !== "short") {
    return appendLog(state, "Invalid perp side.", "bad");
  }
  const mark = perpMarkPrice(state);
  const premium = perpOpenPremiumTotal(contracts, mark, params);
  if (premium > state.cash) {
    return appendLog(
      state,
      `Need ${fmt(premium)} open premium for ${contracts} contract(s) — only have ${fmt(state.cash)}.`,
      "bad"
    );
  }
  let next = addCumulativeRealizedPL(
    { ...state, cash: state.cash - premium },
    "options",
    -premium
  );
  const holding = {
    id: `${state.day}_${resolveRng({}).id()}`,
    perpId: PERP_ID,
    name: `${PERP_NAME} ${side === "long" ? "Long" : "Short"}`,
    side,
    contracts,
    entryMark: mark,
    entryDay: state.day,
    fundingPaid: 0,
  };
  next = {
    ...next,
    perpHoldings: [...(next.perpHoldings || []), holding],
  };
  const sideLabel = side === "long" ? "Long" : "Short";
  return appendLog(
    next,
    `Opened ${contracts} ${sideLabel} ${PERP_NAME} @ $${mark.toFixed(2)} — premium ${fmt(premium)}, notional ~${fmt(contracts * mark * PERP_SHARES_PER_CONTRACT)}.`,
    "good"
  );
}

/** Reduce / close perp contracts HIFO within same side. */
export function closePerp(state, side, qty) {
  const check = ensureUnlocked(state);
  if (!check.ok) return check.state;
  if (side !== "long" && side !== "short") {
    return appendLog(state, "Invalid perp side.", "bad");
  }
  let remaining = Math.max(1, parseInt(qty, 10) || 1);
  const mark = perpMarkPrice(state);
  const holdings = [...(state.perpHoldings || [])];
  const openIdx = holdings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.side === side && (h.contracts || 0) > 0)
    .sort((a, b) => {
      const entryDiff = (b.h.entryMark ?? 0) - (a.h.entryMark ?? 0);
      if (entryDiff !== 0) return entryDiff;
      return (b.h.entryDay ?? 0) - (a.h.entryDay ?? 0) || b.i - a.i;
    });

  const total = openIdx.reduce((s, { h }) => s + h.contracts, 0);
  if (total <= 0) {
    return appendLog(state, `No open ${side} perp contracts to close.`, "bad");
  }
  if (remaining > total) remaining = total;
  const closeCount = remaining;

  let cash = state.cash;
  let totalPl = 0;

  for (const { h, i } of openIdx) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, h.contracts);
    const pl = perpPositionUnrealizedPL({ ...h, contracts: take }, mark);
    totalPl += pl;
    cash += pl;
    remaining -= take;
    const nextC = h.contracts - take;
    if (nextC <= 0) holdings[i] = null;
    else holdings[i] = { ...h, contracts: nextC };
  }

  const nextHoldings = holdings.filter(Boolean);
  const next = addCumulativeRealizedPL(
    { ...state, cash, perpHoldings: nextHoldings },
    "options",
    totalPl
  );
  const sideLabel = side === "long" ? "Long" : "Short";
  return appendLog(
    next,
    `Closed ${closeCount} ${sideLabel} ${PERP_NAME} @ $${mark.toFixed(2)} — P/L ${fmtSignedMoney2(totalPl)}.`,
    "info"
  );
}

export function closePerpLot(state, holdingId, qty) {
  const check = ensureUnlocked(state);
  if (!check.ok) return check.state;
  const requested = Math.max(1, parseInt(qty, 10) || 1);
  const idx = (state.perpHoldings || []).findIndex(h => h.id === holdingId);
  if (idx < 0) return appendLog(state, "Perp position not found.", "bad");
  const lot = state.perpHoldings[idx];
  if ((lot.contracts || 0) <= 0) return appendLog(state, "No contracts in that perp lot.", "bad");
  const closeCount = Math.min(requested, lot.contracts);
  const mark = perpMarkPrice(state);
  const pl = perpPositionUnrealizedPL({ ...lot, contracts: closeCount }, mark);
  const nextC = lot.contracts - closeCount;
  const nextHoldings = [...(state.perpHoldings || [])];
  if (nextC <= 0) nextHoldings.splice(idx, 1);
  else nextHoldings[idx] = { ...lot, contracts: nextC };
  const next = addCumulativeRealizedPL(
    { ...state, cash: state.cash + pl, perpHoldings: nextHoldings },
    "options",
    pl
  );
  return appendLog(
    next,
    `Closed ${closeCount} ${lot.name} @ $${mark.toFixed(2)} — P/L ${fmtSignedMoney2(pl)}.`,
    "info"
  );
}

/**
 * Daily funding + mark basis drift. Longs pay when funding rate is positive.
 * Lots are liquidated at mark if cash cannot cover a funding payment.
 */
export function processPerpsForDay(s, cash, params = {}) {
  const mark = perpMarkPrice(s);
  const u = perpUnderlyingPrice(s);
  const dailyRate = perpFundingRateDaily(s);
  const logLines = [];
  let nextCash = cash;
  let perpFundingPLDelta = 0;
  let perpRealizedPLDelta = 0;
  let holdings = [...(s.perpHoldings || [])];

  let totalFunding = 0;
  const openLots = () => openPerpPositions({ ...s, perpHoldings: holdings });

  for (const pos of openLots()) {
    const idx = holdings.findIndex(h => h.id === pos.id);
    if (idx < 0) continue;
    const lot = holdings[idx];
    const notional = lot.contracts * mark * PERP_SHARES_PER_CONTRACT;
    const payment = notional * dailyRate;
    if (payment === 0) continue;

    const cashDelta = perpFundingCashDelta(lot.side, payment);
    const due = cashDelta < 0 ? -cashDelta : 0;

    if (due > 0 && nextCash < due) {
      const pl = perpPositionUnrealizedPL(lot, mark);
      nextCash += pl;
      perpRealizedPLDelta += pl;
      holdings.splice(idx, 1);
      logLines.push({
        msg: `${lot.name} liquidated — could not pay ${fmt(due)} funding (cash ${fmt(nextCash - pl)}). Closed @ $${mark.toFixed(2)}, P/L ${fmtSignedMoney2(pl)}.`,
        type: "bad",
        day: s.day,
      });
      continue;
    }

    nextCash += cashDelta;
    if (lot.side === "long") totalFunding -= payment;
    else totalFunding += payment;

    const fundingPaid = (lot.fundingPaid || 0) + (lot.side === "long" ? payment : -payment);
    holdings[idx] = { ...lot, fundingPaid };
  }
  perpFundingPLDelta = totalFunding;

  if (Math.abs(totalFunding) >= 0.01) {
    const annualPct = (dailyRate * 365 * 100).toFixed(2);
    logLines.push({
      msg: `Perp funding (${annualPct}% ann.): ${totalFunding >= 0 ? "+" : ""}${fmt(totalFunding)} cash.`,
      type: totalFunding >= 0 ? "good" : "info",
      day: s.day,
    });
  }

  const baseAnnual = Number.isFinite(params.perpFundingRateAnnual)
    ? params.perpFundingRateAnnual
    : DEFAULT_PERP_FUNDING_RATE_ANNUAL;
  const baseDaily = baseAnnual / 365;
  const premium = u > 0 ? (mark - u) / u : 0;
  const targetDaily = baseDaily + premium * (params.perpFundingPremiumSensitivity ?? 0.35);
  const prevDaily = dailyRate;
  const kappa = params.perpFundingKappa ?? 0.12;
  const vol = params.perpFundingVol ?? 0.00008;
  let nextDaily = prevDaily + kappa * (targetDaily - prevDaily) + randn(params) * vol;
  nextDaily = Math.max(-0.002, Math.min(0.002, nextDaily));

  const basisBps = Math.round(premium * 10000);

  return {
    cash: nextCash,
    perpHoldings: holdings,
    perpFundingRateDaily: nextDaily,
    perpBasisBps: basisBps,
    logLines,
    perpFundingPLDelta,
    perpRealizedPLDelta,
  };
}

export function initialPerpMarketState() {
  return {
    perpHoldings: [],
    perpFundingRateDaily: DEFAULT_PERP_FUNDING_RATE_ANNUAL / 365,
    perpBasisBps: 0,
  };
}
