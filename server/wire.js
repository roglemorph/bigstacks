/** Trim payloads before WebSocket JSON.stringify. */

import { netWorthHistoryForLeaderboardWire } from "../investments/netWorthHistory.js";

const WIRE_HISTORY_TAIL = 30;
const WIRE_MONTHLY_TAIL = 24;
const WIRE_LOG_TAIL = 50;
const WIRE_NW_DAILY = 500;
const WIRE_NW_BUCKETS = 200;

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

export function stripPlayerStateForWire(player) {
  if (!player) return player;
  const log = Array.isArray(player.log)
    ? player.log.slice(-WIRE_LOG_TAIL)
    : [];
  const nw = netWorthHistoryForLeaderboardWire(player, {
    dailyTail: WIRE_NW_DAILY,
    bucketTail: WIRE_NW_BUCKETS,
  });
  return {
    ...player,
    log,
    netWorthHistory: nw.netWorthHistory,
    netWorthDailyStartDay: nw.netWorthDailyStartDay,
    netWorthHistoryBuckets: nw.netWorthHistoryBuckets,
    netWorthStackHistory: undefined,
    netWorthStackBuckets: undefined,
  };
}

export function stripLeaderboardForWire(leaderboard) {
  return (leaderboard || []).map(row => {
    const nw = netWorthHistoryForLeaderboardWire(row, {
      dailyTail: WIRE_NW_DAILY,
      bucketTail: WIRE_NW_BUCKETS,
    });
    return {
      ...row,
      netWorthHistory: nw.netWorthHistory,
      netWorthDailyStartDay: nw.netWorthDailyStartDay,
      netWorthHistoryBuckets: nw.netWorthHistoryBuckets,
    };
  });
}

export function stripGameStartedForWire(payload) {
  if (!payload) return payload;
  return {
    ...payload,
    sharedMarket: stripSharedMarketForWire(payload.sharedMarket),
    playerState: stripPlayerStateForWire(payload.playerState),
    leaderboard: stripLeaderboardForWire(payload.leaderboard),
  };
}

export function stripDayAdvancedForWire(payload, playerState) {
  return {
    ...payload,
    sharedMarket: stripSharedMarketForWire(payload.sharedMarket),
    playerState: stripPlayerStateForWire(playerState),
    leaderboard: stripLeaderboardForWire(payload.leaderboard),
  };
}

export function stripActionResultForWire(payload) {
  if (!payload) return payload;
  return {
    ...payload,
    sharedMarket: stripSharedMarketForWire(payload.sharedMarket),
    playerState: stripPlayerStateForWire(payload.playerState),
  };
}
