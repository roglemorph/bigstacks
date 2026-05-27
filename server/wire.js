/** Trim shared market arrays before WebSocket JSON.stringify. */

const WIRE_HISTORY_TAIL = 30;
const WIRE_MONTHLY_TAIL = 24;

function trimAssetHistory(asset) {
  if (!asset || typeof asset !== "object") return asset;
  const next = { ...asset };
  if (Array.isArray(next.history)) {
    next.history = next.history.length > WIRE_HISTORY_TAIL
      ? next.history.slice(-WIRE_HISTORY_TAIL)
      : next.history;
  }
  if (Array.isArray(next.monthlyHistory)) {
    next.monthlyHistory = next.monthlyHistory.length > WIRE_MONTHLY_TAIL
      ? next.monthlyHistory.slice(-WIRE_MONTHLY_TAIL)
      : next.monthlyHistory;
  }
  return next;
}

function trimAssetList(list) {
  return (list || []).map(trimAssetHistory);
}

export function stripSharedMarketForWire(market) {
  if (!market) return market;
  return {
    ...market,
    indexFunds: trimAssetList(market.indexFunds),
    stocks: trimAssetList(market.stocks),
    cryptos: trimAssetList(market.cryptos),
    options: trimAssetList(market.options),
  };
}

export function stripGameStartedForWire(payload) {
  if (!payload) return payload;
  return {
    ...payload,
    sharedMarket: stripSharedMarketForWire(payload.sharedMarket),
  };
}

export function stripDayAdvancedForWire(payload, playerState) {
  return {
    ...payload,
    sharedMarket: stripSharedMarketForWire(payload.sharedMarket),
    playerState,
  };
}

export function stripActionResultForWire(payload) {
  if (!payload) return payload;
  return {
    ...payload,
    sharedMarket: stripSharedMarketForWire(payload.sharedMarket),
  };
}
