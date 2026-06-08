// ============================================================
// PROGRESSION — XP and leveling (pure logic, no DOM)
// ============================================================

import { trimLog } from "./shared.js";
import { applyMarketUnlocksWithLog } from "./assetUnlockLevels.js";

export const DEFAULT_XP_PER_DAY = 1;
export const DEFAULT_XP_LEVEL_BASE = 25;
export const DEFAULT_XP_LEVEL_EXPONENT = 1.2;

export function resolveProgressionParams(params = {}) {
  return {
    xpPerDay: Number.isFinite(params.xpPerDay) ? params.xpPerDay : DEFAULT_XP_PER_DAY,
    xpLevelBase: Number.isFinite(params.xpLevelBase) ? params.xpLevelBase : DEFAULT_XP_LEVEL_BASE,
    xpLevelExponent: Number.isFinite(params.xpLevelExponent)
      ? params.xpLevelExponent
      : DEFAULT_XP_LEVEL_EXPONENT,
  };
}

export function xpToNextLevel(level, params = {}) {
  const pp = resolveProgressionParams(params);
  const lv = Math.max(1, Math.floor(level));
  return Math.floor(pp.xpLevelBase * Math.pow(lv, pp.xpLevelExponent));
}

export function totalXpForLevel(level, params = {}) {
  const target = Math.max(1, Math.floor(level));
  let total = 0;
  for (let lv = 1; lv < target; lv++) {
    total += xpToNextLevel(lv, params);
  }
  return total;
}

export function levelFromXp(totalXp, params = {}) {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let cumulative = 0;
  while (true) {
    const nextCost = xpToNextLevel(level, params);
    if (cumulative + nextCost > xp) break;
    cumulative += nextCost;
    level++;
    if (level > 9999) break;
  }
  return level;
}

export function xpProgressInLevel(totalXp, params = {}) {
  const xp = Math.max(0, Math.floor(totalXp));
  const level = levelFromXp(xp, params);
  const xpAtLevelStart = totalXpForLevel(level, params);
  const xpIntoLevel = xp - xpAtLevelStart;
  const xpForNext = xpToNextLevel(level, params);
  const pct = xpForNext > 0 ? Math.min(100, (xpIntoLevel / xpForNext) * 100) : 100;
  return { level, xpIntoLevel, xpForNext, pct };
}

export function initialProgressionFields() {
  return { xp: 0, level: 1 };
}

export function grantXpForDays(state, days, params = {}) {
  const pp = resolveProgressionParams(params);
  const grant = Math.max(0, Math.floor(days)) * pp.xpPerDay;
  if (grant <= 0) return state;

  const prevLevel = levelFromXp(state.xp ?? 0, params);
  const nextXp = Math.max(0, Math.floor(state.xp ?? 0)) + grant;
  const nextLevel = levelFromXp(nextXp, params);

  let next = {
    ...state,
    xp: nextXp,
    level: nextLevel,
  };

  if (nextLevel > prevLevel) {
    const logDay = state.day ?? 1;
    let log = [...(next.log || [])];
    for (let lv = prevLevel + 1; lv <= nextLevel; lv++) {
      log.push({ msg: `Level up! Now level ${lv}`, type: "good", day: logDay });
    }
    next = { ...next, log: trimLog(log) };
  }

  return applyMarketUnlocksWithLog(next, params);
}
