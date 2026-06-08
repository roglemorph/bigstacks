export const fmt = n => "$" + Math.round(n).toLocaleString();

export function fmtInsight(n) {
	const v = Math.max(0, Math.floor(n ?? 0));
	return `${v.toLocaleString()} Insight`;
}
export const fmtSigned = n => `${n >= 0 ? "+" : "-"}${fmt(Math.abs(n))}`;

export function fmtEnergy(n) {
	if (!Number.isFinite(n)) return "—";
	return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtIncomeAmount(n) {
	if (!Number.isFinite(n)) return "—";
	const abs = Math.abs(n);
	if (abs > 0 && abs < 10) {
		return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
	return fmt(n);
}

export function formatPlPct(pct) {
	if (!Number.isFinite(pct)) return "—";
	return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`;
}

const PL_TINT_MAX_PCT = 1_000_000;

export function plTintIntensity(plPct) {
	if (!Number.isFinite(plPct)) return 0;
	return Math.min(1, Math.abs(plPct) / PL_TINT_MAX_PCT);
}

export function plTintDir(plPct) {
	if (!Number.isFinite(plPct) || plPct === 0) return "flat";
	return plPct > 0 ? "pos" : "neg";
}

export function applyPlTintToElement(el, plPct) {
	if (!el) return;
	if (!Number.isFinite(plPct)) {
		el.classList.remove("held-pl-tint");
		el.removeAttribute("data-pl-dir");
		el.style.removeProperty("--pl-tint");
		return;
	}
	el.classList.add("held-pl-tint");
	el.setAttribute("data-pl-dir", plTintDir(plPct));
	el.style.setProperty("--pl-tint", plTintIntensity(plPct).toFixed(3));
}

export function plTintHtml(plPct) {
	if (!Number.isFinite(plPct)) return { extraClass: "", extraAttrs: "" };
	return {
		extraClass: " held-pl-tint",
		extraAttrs: ` data-pl-dir="${plTintDir(plPct)}" style="--pl-tint:${plTintIntensity(plPct).toFixed(3)}"`,
	};
}

export function setPlDisplay(el, pl, baseClass) {
	if (!el) return;
	el.textContent = fmtSigned(pl);
	el.className = `${baseClass} ${pl >= 0 ? "pos" : "neg"}`;
}

export function formatMarketCardOrderTotal(qty, unitPrice) {
	return `× ${qty} = ${fmt(qty * unitPrice)}`;
}

export function formatCorpBondUnits(n) {
	if (!Number.isFinite(n)) return "—";
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
}

export function formatPerpFundingAnnText(s, perpFundingRateAnnual) {
	const fundingAnn = perpFundingRateAnnual(s) * 100;
	return `${fundingAnn >= 0 ? "+" : ""}${fundingAnn.toFixed(2)}% · longs pay`;
}

/** Trading-day lookback for % chip next to prices (matches daily `history` steps). */
export const DISPLAY_RETURN_DAYS = 90;

export function formatTrailingPctChipText(pct, labelDays = DISPLAY_RETURN_DAYS) {
	const lab = `${labelDays}d`;
	if (!Number.isFinite(pct)) return `${lab} —`;
	const sign = pct >= 0 ? "+" : "−";
	return `${lab} ${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function trailingPctChipClass(pct) {
	if (!Number.isFinite(pct)) return "muted";
	return pct >= 0 ? "pos" : "neg";
}
