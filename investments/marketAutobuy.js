import { appendLog, fmt } from "./shared.js";
import { buyIndexFund } from "./indexFunds.js";
import { buyStock } from "./stocks.js";
import { buyCrypto } from "./cryptos.js";

export const DEFAULT_MARKET_CARD_AUTOBUY = {
  enabled: false,
  qty: 1,
  everyDays: 30,
  lastRunDay: null,
};

export function marketCardAutobuyKey(prefix, assetId) {
  return `${prefix}:${assetId}`;
}

export function normalizeMarketCardAutobuy(cfg) {
  const base = { ...DEFAULT_MARKET_CARD_AUTOBUY, ...(cfg || {}) };
  const qty = Math.max(1, parseInt(base.qty, 10) || 1);
  const everyDays = Math.max(1, parseInt(base.everyDays, 10) || 1);
  const lastRunDay =
    base.lastRunDay == null || !Number.isFinite(base.lastRunDay)
      ? null
      : Math.max(0, parseInt(base.lastRunDay, 10));
  return { enabled: !!base.enabled, qty, everyDays, lastRunDay };
}

const AUTOBUY_PREFIX_ORDER = ["stock", "crypto"];

function canAutobuyPrefix(state, prefix) {
  if (prefix === "if") return true;
  if (prefix === "stock") return !!state.unlockedStocks;
  if (prefix === "crypto") return !!state.unlockedCrypto;
  return false;
}

function executeMarketCardAutobuy(state, prefix, assetId, qty) {
  if (prefix === "if") return buyIndexFund(state, assetId, qty);
  if (prefix === "stock") return buyStock(state, assetId, qty);
  if (prefix === "crypto") return buyCrypto(state, assetId, qty);
  return state;
}

function assetLabelForAutobuy(state, prefix, assetId) {
  if (prefix === "if") {
    return (state.indexFunds || []).find(f => f.id === assetId)?.name || assetId;
  }
  if (prefix === "stock") {
    return (state.stocks || []).find(st => st.id === assetId)?.name || assetId;
  }
  if (prefix === "crypto") {
    return (state.cryptos || []).find(c => c.id === assetId)?.name || assetId;
  }
  return assetId;
}

function assetPriceForAutobuy(state, prefix, assetId) {
  if (prefix === "if") {
    return (state.indexFunds || []).find(f => f.id === assetId)?.price || 0;
  }
  if (prefix === "stock") {
    return (state.stocks || []).find(st => st.id === assetId)?.price || 0;
  }
  if (prefix === "crypto") {
    return (state.cryptos || []).find(c => c.id === assetId)?.price || 0;
  }
  return 0;
}

function assetExistsForAutobuy(state, prefix, assetId) {
  if (prefix === "if") return (state.indexFunds || []).some(f => f.id === assetId);
  if (prefix === "stock") return (state.stocks || []).some(st => st.id === assetId);
  if (prefix === "crypto") return (state.cryptos || []).some(c => c.id === assetId);
  return false;
}

/** Buy configured market-card quantities after each day advance when the interval has elapsed. */
export function processMarketCardAutobuys(state) {
  const map = state.marketCardAutobuy || {};
  const keys = Object.keys(map).sort((a, b) => {
    const [pa] = a.split(":");
    const [pb] = b.split(":");
    const ia = AUTOBUY_PREFIX_ORDER.indexOf(pa);
    const ib = AUTOBUY_PREFIX_ORDER.indexOf(pb);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b);
  });

  let s = state;
  const day = s.day;
  let nextMap = { ...map };

  for (const key of keys) {
    const cfg = normalizeMarketCardAutobuy(map[key]);
    if (!cfg.enabled) continue;
    const colon = key.indexOf(":");
    if (colon < 0) continue;
    const prefix = key.slice(0, colon);
    const assetId = key.slice(colon + 1);
    if (!AUTOBUY_PREFIX_ORDER.includes(prefix)) continue;
    if (!canAutobuyPrefix(s, prefix)) continue;
    if (!assetExistsForAutobuy(s, prefix, assetId)) continue;
    if (cfg.lastRunDay != null && day - cfg.lastRunDay < cfg.everyDays) continue;

    const price = assetPriceForAutobuy(s, prefix, assetId);
    if (!(price > 0)) continue;

    const cost = cfg.qty * price;
    if (cost > s.cash) {
      const label = assetLabelForAutobuy(s, prefix, assetId);
      const intervalNote = cfg.everyDays === 1 ? "" : ` (every ${cfg.everyDays} days)`;
      s = appendLog(
        s,
        `Autobuy skipped (${label}) — need ${fmt(cost)} for ${cfg.qty}${intervalNote}, have ${fmt(s.cash)}.`,
        "info"
      );
      continue;
    }

    s = executeMarketCardAutobuy(s, prefix, assetId, cfg.qty);
    nextMap[key] = normalizeMarketCardAutobuy({ ...cfg, lastRunDay: day });
  }

  return { ...s, marketCardAutobuy: nextMap };
}
