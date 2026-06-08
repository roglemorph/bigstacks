// ============================================================
// ASSET UNLOCKS — level-gated markets (pure logic, no DOM)
// ============================================================

import { levelFromXp } from "./progression.js";
import { appendLog } from "./shared.js";

/** Minimum player level to access each market tab / trading. */
export const MARKET_UNLOCK_LEVELS = {
  bonds: 1,
  stocks: 5,
  crypto: 10,
  options: 15,
  casino: 20,
};

export const MARKET_DISPLAY_NAMES = {
  bonds: "Bonds",
  stocks: "Stocks",
  crypto: "Crypto",
  options: "Options",
  casino: "Casino",
};

export function playerLevel(state, params = {}) {
  if (Number.isFinite(state?.level)) return Math.max(1, Math.floor(state.level));
  return levelFromXp(state?.xp ?? 0, params);
}

export function marketUnlockLevel(market) {
  return MARKET_UNLOCK_LEVELS[market] ?? 1;
}

export function isMarketUnlockedByLevel(state, market, params = {}) {
  return playerLevel(state, params) >= marketUnlockLevel(market);
}

export function marketUnlockRequirementText(market) {
  const lv = marketUnlockLevel(market);
  if (lv <= 1) return "Available from the start";
  return `Reach level ${lv} to unlock`;
}

export function marketLockedMessage(market) {
  const name = MARKET_DISPLAY_NAMES[market] || market;
  const lv = marketUnlockLevel(market);
  return `${name} locked — reach level ${lv} to unlock.`;
}

export function syncMarketUnlocksFromLevel(state, params = {}) {
  return {
    ...state,
    unlockedBonds: isMarketUnlockedByLevel(state, "bonds", params),
    unlockedStocks: isMarketUnlockedByLevel(state, "stocks", params),
    unlockedCrypto: isMarketUnlockedByLevel(state, "crypto", params),
    unlockedOptions: isMarketUnlockedByLevel(state, "options", params),
  };
}

const UNLOCK_LOG_KEYS = ["bonds", "stocks", "crypto", "options", "casino"];

export function applyMarketUnlocksWithLog(state, params = {}) {
  const prevLevel = playerLevel(state, params);
  let next = syncMarketUnlocksFromLevel(state, params);
  const day = state.day ?? 1;

  for (const key of UNLOCK_LOG_KEYS) {
    const wasOpen =
      key === "bonds" ? state.unlockedBonds
      : key === "stocks" ? state.unlockedStocks
      : key === "crypto" ? state.unlockedCrypto
      : key === "options" ? state.unlockedOptions
      : isMarketUnlockedByLevel(state, "casino", params);
    const isOpen =
      key === "casino"
        ? isMarketUnlockedByLevel(next, "casino", params)
        : key === "bonds" ? next.unlockedBonds
        : key === "stocks" ? next.unlockedStocks
        : key === "crypto" ? next.unlockedCrypto
        : next.unlockedOptions;
    if (!wasOpen && isOpen) {
      const name = MARKET_DISPLAY_NAMES[key];
      next = appendLog(next, `${name} market unlocked at level ${marketUnlockLevel(key)}!`, "good");
      if (key !== "casino") {
        const dayKey = key === "crypto" ? "cryptos" : key;
        const prevDays = { bonds: null, stocks: null, cryptos: null, options: null, ...(next.assetUnlockDays || {}) };
        if (prevDays[dayKey] == null) {
          next = { ...next, assetUnlockDays: { ...prevDays, [dayKey]: day } };
        }
      }
    }
  }

  return next;
}

export function isCasinoUnlocked(state, params = {}) {
  return isMarketUnlockedByLevel(state, "casino", params);
}
