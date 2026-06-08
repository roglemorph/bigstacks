// ============================================================
// BLACK MARKET — Insight upgrades (pure logic, no DOM)
// ============================================================

import { appendLog } from "./shared.js";

export const BLACK_MARKET_UPGRADE_IDS = ["energyPerDay", "cheaperAutoAdvance", "energyMaxCap"];

export const ENERGY_MAX_CAP_BONUS_PER_LEVEL = 200;

export const INSIGHT_PER_LEVEL = 3;
export const INSIGHT_PER_PL_DOLLARS = 1000;

/** @typedef {{ id: string, name: string, description: string, effectLabel: string, baseCost: number, costScale: number, maxLevel: number|null }} BlackMarketUpgradeDef */

/** @type {Record<string, BlackMarketUpgradeDef>} */
export const BLACK_MARKET_UPGRADES = {
  energyPerDay: {
    id: "energyPerDay",
    name: "Energy Yield",
    description: "Gain bonus energy each time a game day passes.",
    effectLabel: "+0.5 energy / day per level",
    baseCost: 3,
    costScale: 1.45,
    maxLevel: null,
  },
  cheaperAutoAdvance: {
    id: "cheaperAutoAdvance",
    name: "Efficient Auto-Advance",
    description: "Auto-advance consumes less energy at every speed.",
    effectLabel: "−10% auto-advance energy cost per level",
    baseCost: 5,
    costScale: 1.55,
    maxLevel: 5,
  },
  energyMaxCap: {
    id: "energyMaxCap",
    name: "Expanded Reservoir",
    description: "Raise your maximum energy capacity.",
    effectLabel: "+200 max energy per level",
    baseCost: 8,
    costScale: 1.5,
    maxLevel: null,
  },
};

export function fmtInsight(n) {
  const v = Math.max(0, Math.floor(n ?? 0));
  return `${v.toLocaleString()} Insight`;
}

export function normalizeInsight(raw) {
  return Math.max(0, Math.floor(raw ?? 0));
}

export function initialBlackMarketFields() {
  return {
    insight: 0,
    blackMarketLevels: {
      energyPerDay: 0,
      cheaperAutoAdvance: 0,
      energyMaxCap: 0,
    },
  };
}

export function normalizeBlackMarketLevels(raw) {
  const base = initialBlackMarketFields().blackMarketLevels;
  if (!raw || typeof raw !== "object") return { ...base };
  return {
    energyPerDay: Math.max(0, Math.floor(raw.energyPerDay ?? base.energyPerDay)),
    cheaperAutoAdvance: Math.max(0, Math.floor(raw.cheaperAutoAdvance ?? base.cheaperAutoAdvance)),
    energyMaxCap: Math.max(0, Math.floor(raw.energyMaxCap ?? base.energyMaxCap)),
  };
}

export function grantInsight(state, amount) {
  const grant = Math.max(0, Math.floor(amount ?? 0));
  if (grant <= 0) return state;
  return { ...state, insight: normalizeInsight(state.insight) + grant };
}

export function grantInsightForLevelUps(state, prevLevel, nextLevel) {
  const prev = Math.max(1, Math.floor(prevLevel ?? 1));
  const next = Math.max(prev, Math.floor(nextLevel ?? prev));
  const levelsGained = next - prev;
  if (levelsGained <= 0) return state;
  return grantInsight(state, levelsGained * INSIGHT_PER_LEVEL);
}

export function grantInsightForPositivePL(state, delta) {
  if (!Number.isFinite(delta) || delta <= 0) return state;
  const grant = Math.floor(delta / INSIGHT_PER_PL_DOLLARS);
  if (grant <= 0) return state;
  return grantInsight(state, grant);
}

/** One-time retroactive Insight for saves created before Insight existed. */
export function retroactiveInsightForLevel(level) {
  const lv = Math.max(1, Math.floor(level ?? 1));
  return Math.max(0, lv - 1) * INSIGHT_PER_LEVEL;
}

export function getBlackMarketLevel(state, upgradeId) {
  const levels = normalizeBlackMarketLevels(state?.blackMarketLevels);
  return levels[upgradeId] ?? 0;
}

export function upgradeCost(upgradeId, currentLevel) {
  const def = BLACK_MARKET_UPGRADES[upgradeId];
  if (!def) return Infinity;
  const lv = Math.max(0, Math.floor(currentLevel));
  return Math.ceil(def.baseCost * Math.pow(def.costScale, lv));
}

export function isUpgradeMaxed(state, upgradeId) {
  const def = BLACK_MARKET_UPGRADES[upgradeId];
  if (!def || def.maxLevel == null) return false;
  return getBlackMarketLevel(state, upgradeId) >= def.maxLevel;
}

export function canBuyBlackMarketUpgrade(state, upgradeId) {
  const def = BLACK_MARKET_UPGRADES[upgradeId];
  if (!def) return { ok: false, reason: "Unknown upgrade." };
  if (isUpgradeMaxed(state, upgradeId)) return { ok: false, reason: "Already at max level." };
  const cost = upgradeCost(upgradeId, getBlackMarketLevel(state, upgradeId));
  const balance = normalizeInsight(state.insight);
  if (balance < cost) {
    return {
      ok: false,
      reason: `Need ${fmtInsight(cost)} — only have ${fmtInsight(balance)}.`,
    };
  }
  return { ok: true, cost };
}

/** Total bonus energy per game day advanced (all sources). */
export function energyPerDayBonus(state) {
  const levels = getBlackMarketLevel(state, "energyPerDay");
  return levels * 0.5;
}

/** Multiplier applied to auto-advance energy cost (lower is cheaper). */
export function autoAdvanceCostMultiplier(state) {
  const levels = getBlackMarketLevel(state, "cheaperAutoAdvance");
  const discount = levels * 0.1;
  return Math.max(0.5, 1 - discount);
}

/** Bonus max energy from black market upgrades. */
export function energyMaxCapBonus(state) {
  return getBlackMarketLevel(state, "energyMaxCap") * ENERGY_MAX_CAP_BONUS_PER_LEVEL;
}

/** Base max energy from params (defaults to 1000). */
export function baseEnergyMax(params = {}) {
  const raw = params?.energyMax;
  return Number.isFinite(raw) ? raw : 1000;
}

/** Full effective energy cap = base + black market bonus. */
export function effectiveEnergyMax(state, params = {}) {
  return Math.max(1, baseEnergyMax(params) + energyMaxCapBonus(state));
}

/** Sync stored energyMax/energy after cap changes (e.g. upgrade purchase or load). */
export function syncEnergyMaxFromUpgrades(state, params = {}) {
  const max = effectiveEnergyMax(state, params);
  const prevMax = Math.max(1, state.energyMax ?? max);
  const delta = Math.max(0, max - prevMax);
  const nowMs = Date.now();
  return {
    ...state,
    energyMax: max,
    energy: Math.min(max, Math.max(0, (state.energy ?? prevMax) + delta)),
    energyUpdatedAt: nowMs,
  };
}

export { grantEnergyPerGameDay } from "./energy.js";

export function buyBlackMarketUpgrade(state, upgradeId, params = {}) {
  const def = BLACK_MARKET_UPGRADES[upgradeId];
  if (!def) return appendLog(state, "Unknown black market upgrade.", "bad");

  const check = canBuyBlackMarketUpgrade(state, upgradeId);
  if (!check.ok) return appendLog(state, check.reason, "bad");

  const levels = normalizeBlackMarketLevels(state.blackMarketLevels);
  const nextLevel = levels[upgradeId] + 1;
  let next = {
    ...state,
    insight: normalizeInsight(state.insight) - check.cost,
    blackMarketLevels: { ...levels, [upgradeId]: nextLevel },
  };
  if (upgradeId === "energyMaxCap") {
    next = syncEnergyMaxFromUpgrades(next, params);
  }
  return appendLog(
    next,
    `Black market: purchased ${def.name} (level ${nextLevel}) for ${fmtInsight(check.cost)}.`,
    "good"
  );
}

export function blackMarketUpgradeSummary(state, upgradeId) {
  const def = BLACK_MARKET_UPGRADES[upgradeId];
  if (!def) return null;
  const level = getBlackMarketLevel(state, upgradeId);
  const maxed = isUpgradeMaxed(state, upgradeId);
  const nextCost = maxed ? null : upgradeCost(upgradeId, level);
  const check = maxed ? { ok: false } : canBuyBlackMarketUpgrade(state, upgradeId);
  return { def, level, maxed, nextCost, canBuy: check.ok };
}
