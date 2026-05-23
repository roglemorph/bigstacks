import { createRng } from "../investments/rng.js";
import { newState, nextDay } from "../game.js";
import { buildRoomMarket } from "../multiplayer/state.js";
import { advanceSharedMarket } from "../multiplayer/advance.js";

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
