import { tradeAsset, evolveTrackedAssets, randn } from "./shared.js";

export const STOCKS = [
  { id: "aapl", name: "Stock A", startPrice: 45.0, dailyVol: 0.0180 },
  { id: "msft", name: "Stock B", startPrice: 48.0, dailyVol: 0.0170 },
  { id: "nvda", name: "Stock C", startPrice: 42.0, dailyVol: 0.0300 },
  { id: "tsla", name: "Stock D", startPrice: 32.0, dailyVol: 0.0360 },
];

export function buyStock(state, assetId, qty) {
  return tradeAsset(state, "stocks", assetId, qty, "buy", "share");
}

export function sellStock(state, assetId, qty) {
  return tradeAsset(state, "stocks", assetId, qty, "sell", "share");
}

export function stocksPortfolioValue(state) {
  return (state.stocks || []).reduce((sum, st) => sum + (st.shares * st.price), 0);
}

export function evolveStocksForDay(s, params, isMonthEnd) {
  const stockVol = params.volStock ?? 0.02;
  return evolveTrackedAssets(s.stocks, {
    overrideVol: stockVol,
    includeMonthlyHistory: false,
    drift: 0,
    isMonthEnd,
    randn,
  });
}
