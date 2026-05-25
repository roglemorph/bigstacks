import { normalizeIndexFundAutobuy } from "../investments/indexFunds.js";
import { normalizeTreasuryBondAutobuy } from "../investments/treasuryBonds.js";
import { normalizeMarketCardAutobuy } from "../investments/marketAutobuy.js";

/**
 * Merge client autobuy settings into a player's server-side state.
 * @param {object} player
 * @param {object} config
 */
export function applyAutobuyConfig(player, config = {}) {
  const next = { ...player };

  if (config.indexFundAutobuy != null) {
    next.indexFundAutobuy = normalizeIndexFundAutobuy({
      ...(player.indexFundAutobuy || {}),
      ...config.indexFundAutobuy,
    });
  }

  if (config.treasuryBondAutobuy != null) {
    next.treasuryBondAutobuy = normalizeTreasuryBondAutobuy({
      ...(player.treasuryBondAutobuy || {}),
      ...config.treasuryBondAutobuy,
    });
  }

  if (config.marketCardAutobuy != null && typeof config.marketCardAutobuy === "object") {
    const prevMap = player.marketCardAutobuy || {};
    const nextMap = { ...prevMap };
    for (const [key, cfg] of Object.entries(config.marketCardAutobuy)) {
      nextMap[key] = normalizeMarketCardAutobuy({ ...(prevMap[key] || {}), ...cfg });
    }
    next.marketCardAutobuy = nextMap;
  }

  return next;
}

export function autobuyPayloadFromPlayer(player) {
  return {
    indexFundAutobuy: player.indexFundAutobuy,
    treasuryBondAutobuy: player.treasuryBondAutobuy,
    marketCardAutobuy: player.marketCardAutobuy,
  };
}
