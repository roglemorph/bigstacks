import { tradeAsset, evolveTrackedAssets, randn } from "./shared.js";

export const CRYPTOS = [
  { id: "btc", name: "Bitcoin (BTC)", startPrice: 50.0, dailyVol: 0.0400 },
  { id: "eth", name: "Ethereum (ETH)", startPrice: 38.0, dailyVol: 0.0480 },
  { id: "sol", name: "Solana (SOL)", startPrice: 24.0, dailyVol: 0.0600 },
];

export function buyCrypto(state, assetId, qty) {
  return tradeAsset(state, "cryptos", assetId, qty, "buy", "coin");
}

export function sellCrypto(state, assetId, qty) {
  return tradeAsset(state, "cryptos", assetId, qty, "sell", "coin");
}

export function cryptosPortfolioValue(state) {
  return (state.cryptos || []).reduce((sum, c) => sum + (c.coins * c.price), 0);
}

export function evolveCryptosForDay(s, params, isMonthEnd) {
  const cryptoVol = params.volCrypto ?? 0.04;
  return evolveTrackedAssets(s.cryptos, {
    overrideVol: cryptoVol,
    includeMonthlyHistory: false,
    drift: 0,
    isMonthEnd,
    randn,
  });
}
