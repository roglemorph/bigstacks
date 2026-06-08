// ============================================================
// ENERGY — auto-advance fuel (pure logic, no DOM)
// ============================================================

import { autoAdvanceCostMultiplier, effectiveEnergyMax, energyPerDayBonus } from "./blackMarket.js";

/** Multiplayer runs without energy drain, regen, or advance gating when false. */
export const ENERGY_ENABLED_IN_MULTIPLAYER = false;

export function energyEnabledForMode(mode) {
  if (mode === "multiplayer") return ENERGY_ENABLED_IN_MULTIPLAYER;
  return true;
}

export const DEFAULT_ENERGY_MAX = 1000;
export const DEFAULT_ENERGY_START = 1000;
export const DEFAULT_ENERGY_IDLE_REGEN_PER_SEC = 6;
export const DEFAULT_ENERGY_MANUAL_ADVANCE_BONUS = 10;
export const DEFAULT_ENERGY_STIPEND_BONUS = 50;
export const DEFAULT_ENERGY_COST_REF_MS = 500;
/** Base energy granted each game day advanced (before black market bonuses). */
export const DEFAULT_ENERGY_PER_GAME_DAY = 1;
/** Minimum auto-advance energy cost per game day (allows sub-1 costs at slow speeds). */
export const ENERGY_COST_MIN = 0.01;
export const ENERGY_COST_MAX = 25;

function roundEnergyValue(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function clampEnergyCost(n) {
  return roundEnergyValue(Math.max(ENERGY_COST_MIN, Math.min(ENERGY_COST_MAX, n)));
}

export function resolveEnergyParams(params = {}) {
  return {
    energyMax: Number.isFinite(params.energyMax) ? params.energyMax : DEFAULT_ENERGY_MAX,
    energyStart: Number.isFinite(params.energyStart) ? params.energyStart : DEFAULT_ENERGY_START,
    energyIdleRegenPerSec: Number.isFinite(params.energyIdleRegenPerSec)
      ? params.energyIdleRegenPerSec
      : DEFAULT_ENERGY_IDLE_REGEN_PER_SEC,
    energyManualAdvanceBonus: Number.isFinite(params.energyManualAdvanceBonus)
      ? params.energyManualAdvanceBonus
      : DEFAULT_ENERGY_MANUAL_ADVANCE_BONUS,
    energyStipendBonus: Number.isFinite(params.energyStipendBonus)
      ? params.energyStipendBonus
      : DEFAULT_ENERGY_STIPEND_BONUS,
    energyCostRefMs: Number.isFinite(params.energyCostRefMs)
      ? params.energyCostRefMs
      : DEFAULT_ENERGY_COST_REF_MS,
    energyPerGameDay: Number.isFinite(params.energyPerGameDay)
      ? params.energyPerGameDay
      : DEFAULT_ENERGY_PER_GAME_DAY,
  };
}

export function initialEnergyFields(params = {}, nowMs = Date.now()) {
  const ep = resolveEnergyParams(params);
  const max = Math.max(1, ep.energyMax);
  const start = Math.min(max, Math.max(0, ep.energyStart));
  return {
    energy: start,
    energyMax: max,
    energyUpdatedAt: nowMs,
  };
}

export function energyCostForIntervalMs(intervalMs, params = {}, state = null) {
  const ep = resolveEnergyParams(params);
  const ms = Number.isFinite(intervalMs) ? intervalMs : ep.energyCostRefMs;
  const safeMs = Math.max(1, ms);
  let cost = ep.energyCostRefMs / safeMs;
  cost = clampEnergyCost(cost);
  if (state) {
    cost = clampEnergyCost(cost * autoAdvanceCostMultiplier(state));
  }
  return cost;
}

export function countStipendDays(fromDay, toDay) {
  const start = Math.floor(fromDay);
  const end = Math.floor(toDay);
  if (end <= start) return 0;
  let count = 0;
  for (let d = start + 1; d <= end; d++) {
    if (d % 30 === 0) count++;
  }
  return count;
}

function clampEnergy(value, max) {
  return roundEnergyValue(Math.min(max, Math.max(0, value)));
}

export function applyIdleRegen(state, nowMs, params = {}) {
  const ep = resolveEnergyParams(params);
  const max = effectiveEnergyMax(state, params);
  const updatedAt = Number.isFinite(state.energyUpdatedAt) ? state.energyUpdatedAt : nowMs;
  const elapsedSec = Math.max(0, (nowMs - updatedAt) / 1000);
  const regen = elapsedSec * ep.energyIdleRegenPerSec;
  const base = Number.isFinite(state.energy) ? state.energy : max;
  return {
    ...state,
    energyMax: max,
    energy: clampEnergy(base + regen, max),
    energyUpdatedAt: nowMs,
  };
}

export function effectiveEnergy(state, nowMs, params = {}) {
  return applyIdleRegen(state, nowMs, params).energy;
}

export function canAffordAutoAdvance(state, costPerDay, params = {}, nowMs = Date.now()) {
  const cost = Math.max(0, costPerDay);
  if (cost <= 0) return true;
  const s = applyIdleRegen(state, nowMs, params);
  return s.energy >= cost;
}

export function drainEnergyForAutoAdvance(state, { days = 1, intervalMs, nowMs = Date.now() }, params = {}) {
  const max = effectiveEnergyMax(state, params);
  const s = applyIdleRegen(state, nowMs, params);
  const costPerDay = energyCostForIntervalMs(intervalMs, params, state);
  const totalCost = costPerDay * Math.max(0, days);
  return {
    ...s,
    energyMax: max,
    energy: clampEnergy(s.energy - totalCost, max),
    energyUpdatedAt: nowMs,
  };
}

export function grantEnergyBonus(state, { manualDays = 0, stipendDays = 0 }, params = {}) {
  const ep = resolveEnergyParams(params);
  const max = effectiveEnergyMax(state, params);
  const nowMs = Date.now();
  const s = applyIdleRegen(state, nowMs, params);
  const manual = Math.max(0, manualDays) * ep.energyManualAdvanceBonus;
  const stipend = Math.max(0, stipendDays) * ep.energyStipendBonus;
  return {
    ...s,
    energyMax: max,
    energy: clampEnergy(s.energy + manual + stipend, max),
    energyUpdatedAt: nowMs,
  };
}

export function maxAutoAdvanceDaysForEnergy(state, intervalMs, params = {}, nowMs = Date.now()) {
  if (canSustainAutoAdvanceAtInterval(state, intervalMs, params)) return Infinity;
  const costPerDay = energyCostForIntervalMs(intervalMs, params, state);
  if (costPerDay <= 0) return Infinity;
  const s = applyIdleRegen(state, nowMs, params);
  return Math.floor(s.energy / costPerDay);
}

/** Black market + other per-game-day energy grants (excludes manual/stipend bonuses). */
export function energyGainPerGameDay(state, params = {}) {
  const ep = resolveEnergyParams(params);
  return roundEnergyValue(ep.energyPerGameDay + energyPerDayBonus(state));
}

export function grantEnergyPerGameDay(state, days, params = {}) {
  const grant = energyGainPerGameDay(state, params) * Math.max(0, days);
  if (grant <= 0) return state;

  const nowMs = Date.now();
  const max = effectiveEnergyMax(state, params);
  const energy = clampEnergy((state.energy ?? max) + grant, max);
  return {
    ...state,
    energy,
    energyMax: max,
    energyUpdatedAt: nowMs,
  };
}

/** Auto-advance energy cost per game day at the given tick interval. */
export function energyDrainPerGameDay(state, intervalMs, params = {}) {
  return energyCostForIntervalMs(intervalMs, params, state);
}

export function energyNetPerGameDay(state, intervalMs, params = {}) {
  return energyGainPerGameDay(state, params) - energyDrainPerGameDay(state, intervalMs, params);
}

/** True when per-day gain covers auto-advance drain at this speed. */
export function canSustainAutoAdvanceAtInterval(state, intervalMs, params = {}) {
  return energyDrainPerGameDay(state, intervalMs, params) <= energyGainPerGameDay(state, params);
}

/** Can run at least one auto-advance day (sustainable net, or enough stored energy). */
export function canRunAutoAdvanceAtInterval(state, intervalMs, params = {}, nowMs = Date.now()) {
  if (canSustainAutoAdvanceAtInterval(state, intervalMs, params)) return true;
  const cost = energyDrainPerGameDay(state, intervalMs, params);
  if (cost <= 0) return true;
  const s = applyIdleRegen(state, nowMs, params);
  return s.energy >= cost;
}

/**
 * Fastest auto-advance interval (lowest ms) whose daily drain is covered by daily gain.
 * @returns {number|null}
 */
export function fastestSustainableAutoAdvanceMs(
  state,
  params = {},
  minMs = 5,
  maxMs = 1000,
) {
  if (energyGainPerGameDay(state, params) <= 0) return null;
  const lo = Math.max(1, Math.floor(minMs));
  const hi = Math.max(lo, Math.floor(maxMs));
  for (let ms = lo; ms <= hi; ms++) {
    if (energyCostForIntervalMs(ms, params, state) <= energyGainPerGameDay(state, params)) {
      return ms;
    }
  }
  return null;
}
