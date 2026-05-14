import { appendLog, fmt, addCumulativeRealizedPL } from "./shared.js";
import { yieldForTerm } from "./yieldCurve.js";

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

export function sellBondEarly(state, bondId) {
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
