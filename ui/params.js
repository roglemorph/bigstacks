import { MONTHLY_INCOME_AMOUNT } from "../game.js";

/** Debug form field ids → params keys. */
const PARAM_FIELDS = [
	["dbg-start-cash", "startCash", v => parseFloat(v) || 10000],
	["dbg-max-days", "maxDays", v => parseInt(v, 10) || 30000],
	["dbg-vol-index", "volIndex", v => parseFloat(v) / 100 || 0.0126],
	["dbg-vol-crypto", "volCrypto", v => parseFloat(v) / 100 || 0.04],
	["dbg-vol-stock", "volStock", v => parseFloat(v) / 100 || 0.02],
	["dbg-vol-options", "volOptions", v => parseFloat(v) / 100 || 0.075],
	["dbg-drift-index", "driftIndex", v => parseFloat(v) / 100 || 0.00025],
	["dbg-yield-vol-bps", "yieldCurveVol", v => parseFloat(v) / 10000 || 0.0007],
	["dbg-yield-kappa-pct", "yieldCurveKappa", v => parseFloat(v) / 100 || 0.018],
	["dbg-yield-min-pct", "yieldCurveMin", v => parseFloat(v) / 100 || 0.002],
	["dbg-yield-max-pct", "yieldCurveMax", v => parseFloat(v) / 100 || 0.20],
	["dbg-corp-spread-mult", "corporateSpreadMult", v => parseFloat(v) || 1.0],
	["dbg-crypto-delist-usd", "cryptoDelistPriceUsd", v => parseFloat(v)],
	["dbg-crypto-slots", "cryptoMarketSlotTarget", v => parseInt(v, 10)],
	["dbg-crypto-start-min", "cryptoStartPriceMin", v => parseFloat(v)],
	["dbg-crypto-start-max", "cryptoStartPriceMax", v => parseFloat(v)],
	["dbg-stock-start-min", "stockStartPriceMin", v => parseFloat(v)],
	["dbg-stock-start-max", "stockStartPriceMax", v => parseFloat(v)],
	["dbg-option-strike-offset-pct", "optionStrikeOffsetPct", v => parseFloat(v) / 100 || 0.08],
	["dbg-option-market-dte", "optionMarketDte", v => parseInt(v, 10)],
	["dbg-monthly-income", "monthlyIncomeAmount", v => parseFloat(v)],
	["dbg-energy-max", "energyMax", v => parseFloat(v)],
	["dbg-energy-regen", "energyIdleRegenPerSec", v => parseFloat(v)],
	["dbg-energy-manual-bonus", "energyManualAdvanceBonus", v => parseFloat(v)],
	["dbg-energy-stipend-bonus", "energyStipendBonus", v => parseFloat(v)],
	["dbg-energy-cost-ref", "energyCostRefMs", v => parseFloat(v)],
	["dbg-xp-per-day", "xpPerDay", v => parseFloat(v)],
	["dbg-xp-level-base", "xpLevelBase", v => parseFloat(v)],
	["dbg-xp-level-exp", "xpLevelExponent", v => parseFloat(v)],
];

export function readParams() {
	const params = {};
	for (const [id, key, parse] of PARAM_FIELDS) {
		const el = document.getElementById(id);
		if (!el) continue;
		params[key] = parse(el.value);
	}
	return params;
}

/** Write saved params back into the Debug tab inputs. */
export function applyParamsToForm(params) {
	if (!params || typeof params !== "object") return;

	const setters = {
		startCash: ["dbg-start-cash", v => v],
		maxDays: ["dbg-max-days", v => v],
		volIndex: ["dbg-vol-index", v => (v * 100).toFixed(4)],
		volCrypto: ["dbg-vol-crypto", v => (v * 100).toFixed(2)],
		volStock: ["dbg-vol-stock", v => (v * 100).toFixed(2)],
		volOptions: ["dbg-vol-options", v => (v * 100).toFixed(2)],
		driftIndex: ["dbg-drift-index", v => (v * 100).toFixed(4)],
		yieldCurveVol: ["dbg-yield-vol-bps", v => (v * 10000).toFixed(1)],
		yieldCurveKappa: ["dbg-yield-kappa-pct", v => (v * 100).toFixed(2)],
		yieldCurveMin: ["dbg-yield-min-pct", v => (v * 100).toFixed(2)],
		yieldCurveMax: ["dbg-yield-max-pct", v => (v * 100).toFixed(1)],
		corporateSpreadMult: ["dbg-corp-spread-mult", v => v],
		cryptoDelistPriceUsd: ["dbg-crypto-delist-usd", v => v],
		cryptoMarketSlotTarget: ["dbg-crypto-slots", v => v],
		cryptoStartPriceMin: ["dbg-crypto-start-min", v => v],
		cryptoStartPriceMax: ["dbg-crypto-start-max", v => v],
		stockStartPriceMin: ["dbg-stock-start-min", v => v],
		stockStartPriceMax: ["dbg-stock-start-max", v => v],
		optionStrikeOffsetPct: ["dbg-option-strike-offset-pct", v => (v * 100).toFixed(1)],
		optionMarketDte: ["dbg-option-market-dte", v => v],
		monthlyIncomeAmount: ["dbg-monthly-income", v => v],
		energyMax: ["dbg-energy-max", v => v],
		energyIdleRegenPerSec: ["dbg-energy-regen", v => v],
		energyManualAdvanceBonus: ["dbg-energy-manual-bonus", v => v],
		energyStipendBonus: ["dbg-energy-stipend-bonus", v => v],
		energyCostRefMs: ["dbg-energy-cost-ref", v => v],
		xpPerDay: ["dbg-xp-per-day", v => v],
		xpLevelBase: ["dbg-xp-level-base", v => v],
		xpLevelExponent: ["dbg-xp-level-exp", v => v],
	};

	for (const [key, [id, format]] of Object.entries(setters)) {
		if (!Number.isFinite(params[key]) && params[key] == null) continue;
		const el = document.getElementById(id);
		if (!el || params[key] == null) continue;
		el.value = String(format(params[key]));
	}
}

export function stipendPer30d(params) {
	const raw = Number.isFinite(params?.monthlyIncomeAmount) ? params.monthlyIncomeAmount : MONTHLY_INCOME_AMOUNT;
	return Math.max(0, raw);
}
