import { appendLog, fmt, addCumulativeRealizedPL } from "./shared.js";

function roll1to100() {
  return 1 + Math.floor(Math.random() * 100);
}

/** Initial hi-lo anchor shown on the Casino tab. */
export function initialCasinoState() {
  return { hiLoAnchor: roll1to100() };
}

/**
 * Even-money hi-lo vs a stored anchor (1–100). Next roll replaces the anchor.
 * @param {boolean} guessHi true = bet the next roll is strictly greater than the anchor
 */
export function playCasinoHiLo(state, bet, guessHi) {
  const stake = Math.floor(Number(bet));
  if (!Number.isFinite(stake) || stake <= 0) {
    return appendLog(state, "Enter a whole-dollar bet greater than zero.", "bad");
  }
  if (stake > state.cash) {
    return appendLog(state, `Need ${fmt(stake)} — only have ${fmt(state.cash)}.`, "bad");
  }

  const anchor = state.casino?.hiLoAnchor ?? roll1to100();
  const roll = roll1to100();
  let delta = 0;
  let type = "info";
  let msg = "";

  if (roll === anchor) {
    delta = 0;
    msg = `Hi-Lo push: anchor ${anchor}, roll ${roll}. Stake returned. Next anchor ${roll}.`;
  } else if ((roll > anchor && guessHi) || (roll < anchor && !guessHi)) {
    delta = stake;
    msg = `Hi-Lo win: anchor ${anchor} → roll ${roll}. Bet ${guessHi ? "HI" : "LO"} for ${fmt(stake)} · profit ${fmt(stake)}.`;
    type = "good";
  } else {
    delta = -stake;
    msg = `Hi-Lo loss: anchor ${anchor} → roll ${roll}. Bet ${guessHi ? "HI" : "LO"} for ${fmt(stake)}.`;
    type = "bad";
  }

  let next = {
    ...state,
    cash: state.cash + delta,
    casino: { hiLoAnchor: roll },
  };
  if (delta !== 0) {
    next = addCumulativeRealizedPL(next, "casino", delta);
  }
  return appendLog(next, msg, type);
}
