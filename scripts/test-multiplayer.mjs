import { newState, nextDay } from "../game.js";
import { buildRoomMarket, newPlayerState } from "../multiplayer/state.js";
import {
  advanceSharedMarket,
  advancePlayerAfterShared,
  snapshotDelistContext,
} from "../multiplayer/advance.js";
import { RoomManager } from "../server/rooms.js";
import { stripSharedMarketForWire, stripPlayerStateForWire, stripLeaderboardForWire } from "../server/wire.js";
import { FINISHED_ROOM_TTL_MS } from "../server/protocol.js";

const seed = 12345;
const a = buildRoomMarket(seed, {}, newState);
const b = buildRoomMarket(seed, {}, newState);

const stocksMatch = JSON.stringify(a.market.stocks.map(s => s.price)) === JSON.stringify(b.market.stocks.map(s => s.price));
console.log("deterministic boot:", stocksMatch ? "OK" : "FAIL");

let m1 = a.market;
let m2 = b.market;
for (let i = 0; i < 5; i++) {
  m1 = advanceSharedMarket(m1, a.params, nextDay);
  m2 = advanceSharedMarket(m2, b.params, nextDay);
}
const advMatch = m1.day === m2.day && m1.indexFunds[0].price === m2.indexFunds[0].price;
console.log("deterministic advance:", advMatch ? "OK" : "FAIL");

const solo = newState({});
const solo2 = nextDay(solo, {});
console.log("solo nextDay:", solo2.day === 2 ? "OK" : "FAIL");

// snapshotDelistContext is small and preserves delist lookup fields
let shared = a.market;
let player = newPlayerState(shared, a.params, { playerId: "p1", displayName: "P1" });
const stockId = shared.stocks[0]?.id;
if (stockId) {
  player.stocks = player.stocks.map(s =>
    s.id === stockId ? { ...s, shares: 10, costBasis: 100, lots: [{ qty: 10, unitCost: 10, purchaseDay: 1 }] } : s
  );
  for (let i = 0; i < 50; i++) {
    const prev = snapshotDelistContext(shared);
    shared = advanceSharedMarket(shared, a.params, nextDay);
    player = advancePlayerAfterShared(player, prev, shared, a.params);
  }
  const snapSize = JSON.stringify(snapshotDelistContext(shared)).length;
  const fullSize = JSON.stringify(shared).length;
  console.log("delist snapshot smaller:", snapSize < fullSize / 10 ? "OK" : "FAIL", `snap=${snapSize} full=${fullSize}`);
  console.log("player stays slim:", !player.stocks.some(s => Array.isArray(s.history)) ? "OK" : "FAIL");
  console.log("player scalar nw only:", !player.netWorthStackHistory?.length ? "OK" : "FAIL");
} else {
  console.log("delist snapshot:", "SKIP (no stocks)");
}

// wire strip shortens histories
let market = a.market;
for (let i = 0; i < 100; i++) {
  market = advanceSharedMarket(market, a.params, nextDay);
}
const wire = stripSharedMarketForWire(market);
const maxHist = Math.max(
  ...(wire.stocks || []).map(s => s.history?.length || 0),
  ...(wire.indexFunds || []).map(f => f.history?.length || 0),
  0
);
console.log("wire history tail:", maxHist <= 30 ? "OK" : "FAIL", `max=${maxHist}`);

const pl = { log: new Array(200).fill({ msg: "x", type: "info", day: 1 }), netWorthHistory: new Array(2000).fill(1000), netWorthHistoryBuckets: new Array(600).fill({ endDay: 1, value: 1000 }) };
const slimPl = stripPlayerStateForWire(pl);
console.log("wire player log tail:", slimPl.log.length <= 50 ? "OK" : "FAIL", slimPl.log.length);
console.log("wire player nw tail:", slimPl.netWorthHistory.length <= 500 ? "OK" : "FAIL", slimPl.netWorthHistory.length);
console.log("wire player bucket tail:", slimPl.netWorthHistoryBuckets.length <= 200 ? "OK" : "FAIL", slimPl.netWorthHistoryBuckets.length);

// RoomManager bulk advance + finishedAt
const rm = new RoomManager();
const host = rm.createRoom("Host", null);
const room = rm.getRoom(host.roomCode);
rm.addPlayer(room, "p2", "P2", null);
rm.startGame(room, host.playerId);
const heapBefore = process.memoryUsage().heapUsed;
rm.advanceDay(room, host.playerId, 100);
const heapAfter = process.memoryUsage().heapUsed;
console.log("bulk 100-day advance:", room.sharedMarket.day > 1 ? "OK" : "FAIL");
console.log("heap delta MB:", ((heapAfter - heapBefore) / 1024 / 1024).toFixed(2));

room.finishedAt = Date.now() - FINISHED_ROOM_TTL_MS - 1;
rm.sweepAllRooms();
console.log("sweep finished room:", rm.roomCount() === 0 ? "OK" : "FAIL");
