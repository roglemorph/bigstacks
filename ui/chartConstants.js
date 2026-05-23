/** Shared chart configuration used by the UI layer. */

export const DAILY_CHART_TRIM_DAYS = 365;
export const CHART_TRAILING_BLANK_SLOTS = 5;
export const NET_WORTH_MONTH_BUCKET_OPTIONS = [10, 30, 100, 300, 1000];
export const NET_WORTH_RECENT_DAY_OPTIONS = [300, 1000, 5000, 10000];
export const DAYS_PER_GAME_YEAR = 365;
export const DAYS_PER_GAME_DECADE = 10 * DAYS_PER_GAME_YEAR;
export const CHART_CANVAS_FONT = "13px monospace";

export const NET_WORTH_STACK_LAYERS = [
	{ key: "cash", label: "Cash", color: "#888888" },
	{ key: "indexFunds", label: "Index fund", color: "#00ff88" },
	{ key: "bonds", label: "Bonds", color: "#66aaff" },
	{ key: "stocks", label: "Stocks", color: "#aa66ff" },
	{ key: "cryptos", label: "Crypto", color: "#ff66cc" },
	{ key: "options", label: "Options", color: "#ba8cff" },
];

export const MARKET_CARD_RETURN_DAYS = [30, 300, 1000, 5000];
