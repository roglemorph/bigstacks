import { appendLog, fmt, addCumulativeRealizedPL } from "./shared.js";
import { yieldForTerm } from "./yieldCurve.js";
import { resolveRng } from "./rng.js";
import { marketLockedMessage } from "./assetUnlockLevels.js";

export const TREASURY_BOND_TERMS = [1, 2, 5, 10, 30];

export const DEFAULT_TREASURY_BOND_AUTOBUY = {
  enabled: false,
  everyDays: 30,
  faceValue: 1000,
  term: 5,
  lastRunDay: null,
};

export function normalizeTreasuryBondAutobuy(cfg) {
  const base = { ...DEFAULT_TREASURY_BOND_AUTOBUY, ...(cfg || {}) };
  const everyDays = Math.max(1, parseInt(base.everyDays, 10) || 1);
  const faceValue = Math.max(100, parseFloat(base.faceValue) || DEFAULT_TREASURY_BOND_AUTOBUY.faceValue);
  const termRaw = parseInt(base.term, 10);
  const term = TREASURY_BOND_TERMS.includes(termRaw) ? termRaw : DEFAULT_TREASURY_BOND_AUTOBUY.term;
  const lastRunDay =
    base.lastRunDay == null || !Number.isFinite(base.lastRunDay)
      ? null
      : Math.max(0, parseInt(base.lastRunDay, 10));
  return { enabled: !!base.enabled, everyDays, faceValue, term, lastRunDay };
}

function purchaseOneTreasuryBond(state, faceValue, term) {
  if (!state.unlockedBonds) {
    return { ok: false, state, msg: marketLockedMessage("bonds"), type: "bad" };
  }
  if (faceValue > state.cash) {
    return { ok: false, state, msg: `Need ${fmt(faceValue)} — only have ${fmt(state.cash)}.`, type: "bad" };
  }
  const y = yieldForTerm(state, term);
  const rng = resolveRng({});
  const bond = {
    id: `${state.day}_${rng.id()}`,
    type: "treasury",
    issuer: "U.S. Treasury",
    faceValue,
    term,
    yield: y,
    purchaseDay: state.day,
    maturityDay: state.day + term * 365,
    couponAccrued: 0,
  };
  return {
    ok: true,
    state: {
      ...state,
      cash: state.cash - faceValue,
      bondHoldings: [...(state.bondHoldings || []), bond],
    },
    term,
    faceValue,
    yield: y,
  };
}

export function buyBond(state, faceValue, term, qty = 1) {
  const want = Math.max(1, Math.floor(Number(qty)) || 1);
  let s = state;
  let bought = 0;
  let meta = null;

  for (let i = 0; i < want; i++) {
    const res = purchaseOneTreasuryBond(s, faceValue, term);
    if (!res.ok) {
      if (bought === 0) return appendLog(s, res.msg, res.type || "bad");
      break;
    }
    s = res.state;
    bought += 1;
    meta = res;
  }

  if (bought === 0) return s;

  const m = meta;
  if (bought === 1) {
    return appendLog(
      s,
      `Bought ${m.term}yr bond — face ${fmt(m.faceValue)}, yield ${(m.yield * 100).toFixed(2)}%.`,
      "good"
    );
  }
  return appendLog(
    s,
    `Bought ${bought} ${m.term}yr treasury bonds — ${fmt(bought * m.faceValue)} face total, yield ${(m.yield * 100).toFixed(2)}%.`,
    "good"
  );
}

export function sellBondEarly(state, bondId) {
  if (!state.unlockedBonds) {
    return appendLog(state, marketLockedMessage("bonds"), "bad");
  }
  const bond = (state.bondHoldings || []).find(b => b.id === bondId);
  if (!bond) return appendLog(state, "Bond not found.", "bad");
  const penalty = 0.15;
  const proceeds = Math.round(bond.faceValue * (1 - penalty));
  const couponPart = bond.couponAccrued || 0;
  const tradingPart = proceeds - bond.faceValue;
  const next = addCumulativeRealizedPL(
    {
      ...state,
      cash: state.cash + proceeds,
      bondHoldings: state.bondHoldings.filter(b => b.id !== bondId),
    },
    "bonds",
    couponPart + tradingPart
  );
  return appendLog(next, `Sold bond early — received ${fmt(proceeds)} (15% penalty applied).`, "info");
}

/** Sum of face values for portfolio mark. */
export function bondPortfolioValue(state) {
  return (state.bondHoldings || []).reduce((sum, b) => sum + b.faceValue, 0);
}

/** Buy configured treasury bonds after each day advance when the interval has elapsed. */
export function processTreasuryBondAutobuy(state) {
  const cfg = normalizeTreasuryBondAutobuy(state.treasuryBondAutobuy);
  if (!cfg.enabled || !state.unlockedBonds) return state;
  const day = state.day;
  if (cfg.lastRunDay != null && day - cfg.lastRunDay < cfg.everyDays) {
    return state;
  }
  const cost = cfg.faceValue;
  if (cost > state.cash) {
    const intervalNote =
      cfg.everyDays === 1 ? "" : ` (scheduled every ${cfg.everyDays} days)`;
    return appendLog(
      state,
      `Treasury autobuy skipped — need ${fmt(cost)}${intervalNote}, have ${fmt(state.cash)}.`,
      "info"
    );
  }
  const bought = buyBond(state, cfg.faceValue, cfg.term);
  return {
    ...bought,
    treasuryBondAutobuy: normalizeTreasuryBondAutobuy({ ...cfg, lastRunDay: day }),
  };
}

/**
 * Accrue coupons to cash, mature bonds, return surviving holdings and extra log lines.
 * @param {{ day: number, bondHoldings?: unknown[] }} s
 * @param {number} cash
 * @returns {{ cash: number, bondHoldings: unknown[], logLines: { msg: string, type: string, day: number }[], bondRealizedPLDelta: number }}
 */
export function processBondHoldingsForDay(s, cash) {
  const newLog = [];
  const updatedBonds = [];
  let bondRealizedPLDelta = 0;
  for (const bond of (s.bondHoldings || [])) {
    const dailyCoupon = bond.faceValue * (bond.yield / 365);
    cash += dailyCoupon;
    if (s.day >= bond.maturityDay) {
      cash += bond.faceValue;
      bondRealizedPLDelta += (bond.couponAccrued || 0) + dailyCoupon;
      newLog.push({ msg: `Bond matured — received face value ${fmt(bond.faceValue)}.`, type: "good", day: s.day });
    } else {
      updatedBonds.push({ ...bond, couponAccrued: (bond.couponAccrued || 0) + dailyCoupon });
    }
  }
  return { cash, bondHoldings: updatedBonds, logLines: newLog, bondRealizedPLDelta };
}
