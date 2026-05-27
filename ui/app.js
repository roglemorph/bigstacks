import { newState, nextDay, buyIndexFund, sellIndexFund, normalizeIndexFundAutobuy, normalizeTreasuryBondAutobuy, buyBond, buyCorporateBond, sellBondEarly, buyCrypto, sellCrypto, buyStock, sellStock, buyOption, sellOption, sellOptionLot, exerciseOptionLot, openPerp, closePerp, closePerpLot, playCasinoHiLo, portfolioValue, netWorth, snapshotNetWorthStack, totalReturn, YIELD_CURVE, yieldForTerm, setOptionMarketDte, normalizeOptionMarketDte, openOptionHoldings, markOptionHolding, optionLotUnrealizedPLAtMark, optionLotUnrealizedPLIfExercised, optionsHoldingsUnrealizedPL, openPerpPositions, perpMarkPrice, perpFundingRateAnnual, perpOpenPremiumTotal, perpHoldingsMarkValue, perpHoldingsUnrealizedPL, perpPositionUnrealizedPL, perpPositionTotalPL, unlockBonds, unlockStocks, unlockCrypto, unlockOptions, UNLOCK_COST_BONDS, UNLOCK_COST_STOCKS, UNLOCK_COST_CRYPTOS, UNLOCK_COST_OPTIONS, MONTHLY_INCOME_AMOUNT, normalizeMarketCardAutobuy, marketCardAutobuyKey } from "../game.js?v=jobs";
import {
	fmt, fmtSigned, fmtIncomeAmount, formatPlPct, plTintIntensity, plTintDir,
	applyPlTintToElement, plTintHtml, setPlDisplay, formatMarketCardOrderTotal,
	formatCorpBondUnits, formatPerpFundingAnnText, formatTrailingPctChipText, trailingPctChipClass,
	DISPLAY_RETURN_DAYS,
} from "./format.js";
import { readParams, applyParamsToForm, stipendPer30d } from "./params.js";
import {
	hasSavedGame, saveGameToStorage, loadGameFromStorage, formatSaveTimestamp,
	downloadSaveFile, readSaveFromFile, writeParsedSaveToStorage,
} from "./storage.js";
import { loadAssetPartials } from "./partials.js";
import { enhanceQuantityInputs } from "./numberSpinners.js";
import { MultiplayerClient } from "./multiplayer.js";
import { mergeForRender } from "../multiplayer/state.js";
import {
	DAILY_CHART_TRIM_DAYS,
	CHART_TRAILING_BLANK_SLOTS,
	NET_WORTH_MONTH_BUCKET_OPTIONS,
	NET_WORTH_RECENT_DAY_OPTIONS,
	DAYS_PER_GAME_YEAR,
	DAYS_PER_GAME_DECADE,
	NET_WORTH_STACK_LAYERS,
	MARKET_CARD_RETURN_DAYS,
	CHART_CANVAS_FONT,
} from "./chartConstants.js";
import {
	netWorthHistoryView,
	netWorthHistoryPeak,
	bucketStackSnapshotsAtFixedDays,
	bucketScalarsAtFixedDays,
	expandStackHistoryToDaySpan as expandStackHistoryToDaySpanFromState,
	expandNetWorthHistoryToDaySpan as expandNetWorthHistoryToDaySpanFromState,
} from "../investments/netWorthHistory.js";

await loadAssetPartials();
enhanceQuantityInputs();

let gameMode = "solo";
let mpClient = null;
let mpRoomState = null;
let lastMpActionType = null;

const MP_FULL_RENDER_ACTIONS = new Set([
	"unlockBonds",
	"unlockStocks",
	"unlockCrypto",
	"unlockOptions",
]);

const MP_NW_OVERLAY_COLORS = ["#ff6644", "#44aaff", "#ff44aa", "#aaaa44", "#66ffcc", "#cc88ff"];

function isMultiplayer() {
	return gameMode === "multiplayer" && mpClient;
}

function isMpHost() {
	return isMultiplayer() && mpClient.isHost();
}

function syncStateFromMultiplayer() {
	if (!mpClient?.sharedMarket || !mpClient?.playerState) return;
	state = mergeForRender(mpClient.sharedMarket, mpClient.playerState);
}

function commitState(next) {
	state = next;
	render(state);
}

function syncAllAutobuysFromUi() {
	applyIndexFundAutobuyFromUi();
	applyTreasuryBondAutobuyFromUi();
	syncMarketCardAutobuysFromUi();
}

function autobuyConfigFromState() {
	return {
		indexFundAutobuy: state.indexFundAutobuy,
		treasuryBondAutobuy: state.treasuryBondAutobuy,
		marketCardAutobuy: state.marketCardAutobuy,
	};
}

function pushAutobuyConfigToServer() {
	if (!isMultiplayer()) return;
	try {
		mpClient.syncAutobuy(autobuyConfigFromState());
	} catch (err) {
		console.warn("Failed to sync autobuy config:", err);
	}
}

function dispatchGameAction(actionType, args, localApply) {
	if (!isMultiplayer()) {
		commitState(localApply(state));
		return;
	}
	try {
		lastMpActionType = actionType;
		mpClient.action(actionType, args);
	} catch (err) {
		lastMpActionType = null;
		alert(err.message || "Multiplayer action failed");
	}
}

function renderMultiplayerUpdate() {
	const fullRender = lastMpActionType && MP_FULL_RENDER_ACTIONS.has(lastMpActionType);
	render(state, fullRender ? {} : { liveOnly: true });
	lastMpActionType = null;
}

function syncMpSidebarTimeControls() {
	const dayRow = document.querySelector(".side-action-row--day-advance");
	const autoPanel = document.querySelector(".auto-advance-panel");
	const note = document.getElementById("mp-advance-note");
	const mpNonHost = isMultiplayer() && !isMpHost();
	if (dayRow) dayRow.hidden = mpNonHost;
	if (autoPanel) autoPanel.hidden = mpNonHost;
	if (note) note.hidden = !mpNonHost;
}

function renderMultiplayerPanel() {
	const panel = document.getElementById("mp-panel");
	if (!panel) return;
	if (!isMultiplayer()) {
		panel.hidden = true;
		syncMpSidebarTimeControls();
		const overlayLegend = document.getElementById("mp-nw-overlay-legend");
		if (overlayLegend) overlayLegend.hidden = true;
		return;
	}
	panel.hidden = false;
	document.getElementById("mp-room-code").textContent = mpClient.session.roomCode || "—";
	document.getElementById("mp-connection").textContent = mpClient.status === "connected" ? "Connected" : "Disconnected";
	const hostNote = document.getElementById("mp-host-note");
	if (hostNote) {
		hostNote.textContent = isMpHost() ? "You are the host (advance days)" : "Host advances days for everyone";
	}
	const dayBtn = document.getElementById("day-btn");
	if (dayBtn && isMultiplayer()) {
		dayBtn.disabled = dayBtn.disabled || !isMpHost();
	}
	const list = document.getElementById("mp-leaderboard");
	if (list) {
		const selfId = mpClient.session?.playerId;
		const board = mpClient.leaderboard?.length
			? mpClient.leaderboard
			: [{
				rank: 1,
				playerId: selfId,
				displayName: mpClient.playerState?.displayName || "You",
				netWorth: netWorth(state),
				totalReturn: totalReturn(state),
			}];
		list.innerHTML = board.map(row => {
			const pl = row.totalReturn ?? 0;
			const plCls = pl >= 0 ? "pos" : "neg";
			return `
			<div class="mp-leaderboard-row${row.playerId === selfId ? " mp-leaderboard-row--self" : ""}">
				<span>#${row.rank}</span>
				<span>${row.displayName}</span>
				<span>$${Math.round(row.netWorth).toLocaleString()}</span>
				<span class="${plCls}">${fmtSigned(pl)}</span>
			</div>
		`;
		}).join("");
	}
	syncMpSidebarTimeControls();
}

function setupMultiplayerUi() {
	const mpClientInstance = new MultiplayerClient();
	mpClient = mpClientInstance;

	mpClient.on("connection", ({ connected }) => {
		const el = document.getElementById("mp-lobby-status");
		if (el) el.textContent = connected ? "Connected to server" : "Disconnected";
	});

	mpClient.on("roomState", roomState => {
		mpRoomState = roomState;
		renderMpLobby(roomState);
	});

	mpClient.on("gameStarted", payload => {
		gameMode = "multiplayer";
		mpClient.leaderboard = payload.leaderboard || [];
		syncStateFromMultiplayer();
		hideStartScreen();
		hideMpLobby();
		startTicker();
		render(state);
	});

	mpClient.on("dayAdvanced", payload => {
		mpAdvanceInFlight = false;
		syncStateFromMultiplayer();
		mpClient.leaderboard = payload.leaderboard || [];
		render(state, { liveOnly: true });
		if (payload.finished) setAutoAdvance(false);
	});

	mpClient.on("actionResult", payload => {
		if (!payload.ok) {
			lastMpActionType = null;
			alert(payload.error || "Action rejected");
			return;
		}
		syncStateFromMultiplayer();
		if (payload.leaderboard) mpClient.leaderboard = payload.leaderboard;
		renderMultiplayerUpdate();
	});

	mpClient.on("autobuySynced", () => {
		syncStateFromMultiplayer();
	});

	mpClient.on("leaderboard", payload => {
		mpClient.leaderboard = payload.leaderboard || [];
		renderMultiplayerPanel();
		renderGraphs(state);
	});

	mpClient.on("error", payload => {
		mpAdvanceInFlight = false;
		alert(payload.message || "Server error");
	});

	document.getElementById("mp-create-btn")?.addEventListener("click", async () => {
		const name = document.getElementById("mp-player-name")?.value?.trim() || "Player";
		try {
			await mpClient.connect();
			mpClient.createRoom(name);
		} catch (err) {
			alert(err.message || "Could not connect to multiplayer server");
		}
	});

	document.getElementById("mp-join-btn")?.addEventListener("click", async () => {
		const name = document.getElementById("mp-player-name")?.value?.trim() || "Player";
		const code = document.getElementById("mp-room-code-input")?.value?.trim();
		if (!code) return alert("Enter a room code");
		try {
			await mpClient.connect();
			mpClient.joinRoom(code, name);
		} catch (err) {
			alert(err.message || "Could not connect to multiplayer server");
		}
	});

	document.getElementById("mp-start-btn")?.addEventListener("click", () => {
		if (!mpClient.isHost()) return alert("Only the host can start");
		mpClient.startGame();
	});

	document.getElementById("mp-leave-btn")?.addEventListener("click", () => {
		mpClient.leaveRoom();
		gameMode = "solo";
		mpRoomState = null;
		showMpLobby(false);
	});

	document.getElementById("start-multiplayer-btn")?.addEventListener("click", () => {
		showMpLobby(true);
		mpClient.clearSession();
		mpClient.connect().catch(() => {});
	});

	document.getElementById("mp-back-btn")?.addEventListener("click", () => {
		showMpLobby(false);
	});
}

function showMpLobby(show) {
	document.getElementById("mp-lobby")?.classList.toggle("mp-lobby--hidden", !show);
}

function hideMpLobby() {
	showMpLobby(false);
}

function renderMpLobby(roomState) {
	if (!roomState) return;
	document.getElementById("mp-lobby-code").textContent = roomState.roomCode || "—";
	const list = document.getElementById("mp-lobby-players");
	if (list) {
		const selfId = mpClient?.session?.playerId;
		list.innerHTML = (roomState.players || []).map(p =>
			`<li>${p.displayName}${p.playerId === roomState.hostId ? " (host)" : ""}${p.playerId === selfId ? " (you)" : ""}${p.connected === false ? " (away)" : ""}</li>`
		).join("");
	}
	const startBtn = document.getElementById("mp-start-btn");
	const joinBtn = document.getElementById("mp-join-btn");
	const createBtn = document.getElementById("mp-create-btn");
	const inRoom = !!mpClient?.session?.roomCode;
	if (joinBtn) joinBtn.disabled = inRoom;
	if (createBtn) createBtn.disabled = inRoom;
	if (startBtn) {
		const isHost = mpClient?.isHost();
		startBtn.hidden = !isHost;
		startBtn.disabled = roomState.status !== "lobby";
	}
}


function bondHoldingsDailyCoupon(state) {
	return (state.bondHoldings || []).reduce((sum, b) => {
		const fv = b.faceValue || 0;
		const y = b.yield || 0;
		return sum + fv * (y / 365);
	}, 0);
}
function projectedIncomeBreakdown(state, params) {
	const stipendDaily = stipendPer30d(params) / 30;
	const bondDaily = bondHoldingsDailyCoupon(state);
	const totalDaily = stipendDaily + bondDaily;
	return {
		totalDaily,
		total30d: totalDaily * 30,
		total300d: totalDaily * 300,
		bondDaily,
		bond30d: bondDaily * 30,
		bond300d: bondDaily * 300,
	};
}
function patchIncomeIndicators(s, p) {
	const inc = projectedIncomeBreakdown(s, p);
	const overviewDaily = document.getElementById("overview-income-daily");
	const overview30d = document.getElementById("overview-income-30d");
	const overview300d = document.getElementById("overview-income-300d");
	if (overviewDaily) overviewDaily.textContent = fmtIncomeAmount(inc.totalDaily);
	if (overview30d) overview30d.textContent = fmt(inc.total30d);
	if (overview300d) overview300d.textContent = fmt(inc.total300d);
	const bondsDaily = document.getElementById("bonds-income-daily");
	const bonds30d = document.getElementById("bonds-income-30d");
	const bonds300d = document.getElementById("bonds-income-300d");
	if (bondsDaily) bondsDaily.textContent = fmtIncomeAmount(inc.bondDaily);
	if (bonds30d) bonds30d.textContent = fmt(inc.bond30d);
	if (bonds300d) bonds300d.textContent = fmt(inc.bond300d);
}
function computeAssetHoldingsPl(asset, qtyKey) {
	const qty = asset[qtyKey] || 0;
	if (qty <= 0) return null;
	const mkt = qty * (asset.price || 0);
	const basis = asset.costBasis || 0;
	const effectiveBasis = basis > 0 ? basis : qty * (asset.startPrice ?? asset.price ?? 0);
	const pl = basis > 0 ? mkt - basis : qty * ((asset.price || 0) - (asset.startPrice ?? asset.price ?? 0));
	const plPct = effectiveBasis > 0 ? (pl / effectiveBasis) * 100 : null;
	const avg = qty > 0 ? effectiveBasis / qty : 0;
	return { qty, mkt, pl, plPct, avg, plCls: pl >= 0 ? "pos" : "neg" };
}
function computeOptionsLotsPl(s, lots) {
	const held = (lots || []).reduce((sum, h) => sum + (h.contracts || 0), 0);
	if (held <= 0) return null;
	const mkt = lots.reduce((sum, h) => sum + (h.contracts || 0) * markOptionHolding(s, h), 0);
	const cost = lots.reduce((sum, h) => sum + (h.contracts || 0) * (h.premiumAtPurchase || 0), 0);
	const pl = mkt - cost;
	const plPct = cost > 0 ? (pl / cost) * 100 : null;
	const avg = held > 0 ? cost / held : 0;
	return { held, mkt, pl, plPct, avg, plCls: pl >= 0 ? "pos" : "neg" };
}
function patchMarketCardHeldBorder(card, plPct) {
	if (!card) return;
	if (!Number.isFinite(plPct)) {
		card.classList.remove("market-card--held-border");
		card.removeAttribute("data-pl-dir");
		card.style.removeProperty("--pl-tint");
		return;
	}
	card.classList.add("market-card--held-border");
	card.setAttribute("data-pl-dir", plTintDir(plPct));
	card.style.setProperty("--pl-tint", plTintIntensity(plPct).toFixed(3));
}
function marketCardHoldingsPlForAsset(prefix, asset) {
	if (prefix === "crypto") return computeAssetHoldingsPl(asset, "coins");
	if (prefix === "stock" || prefix === "if") return computeAssetHoldingsPl(asset, "shares");
	return null;
}
function patchMarketCardOrderTotal(card) {
	const amountId = card.getAttribute("data-mkt-amount-id");
	const price = parseFloat(card.getAttribute("data-mkt-unit-price") || "0");
	const el = card.querySelector("[data-mkt-order-total]");
	if (!el || !amountId || !Number.isFinite(price)) return;
	const qtyEl = document.getElementById(amountId);
	const qty = qtyEl
		? Math.max(1, parseInt(qtyEl.value, 10) || 1)
		: Math.max(1, tradeQtyByInputId[amountId] || 1);
	el.textContent = formatMarketCardOrderTotal(qty, price);
}
function patchMarketCardOrderTotalsForInput(amountId) {
	if (amountId === STOCK_BULK_AMOUNT_ID) {
		patchStockBulkBarPricing(state.stocks || []);
		return;
	}
	document.querySelectorAll(`[data-mkt-amount-id="${amountId}"]`).forEach(patchMarketCardOrderTotal);
}
function trimDailyChart(history) {
	const arr = history || [];
	return arr.length > DAILY_CHART_TRIM_DAYS ? arr.slice(-DAILY_CHART_TRIM_DAYS) : arr;
}
function padChartSeriesTrailing(series) {
	if (!Array.isArray(series) || !series.length) return series || [];
	return [...series, ...Array(CHART_TRAILING_BLANK_SLOTS).fill(null)];
}
function ensureNetWorthStackHistory(s) {
	const totals = s.netWorthHistory || [];
	let stacks = s.netWorthStackHistory;
	if (!Array.isArray(stacks) || !stacks.length) {
		stacks = totals.map((nw, i) => {
			if (i === totals.length - 1) return snapshotNetWorthStack(s);
			return { cash: nw, indexFunds: 0, bonds: 0, stocks: 0, cryptos: 0, options: 0 };
		});
	} else if (stacks.length < totals.length) {
		const padded = [...stacks];
		for (let i = stacks.length; i < totals.length; i++) {
			padded.push({ cash: totals[i], indexFunds: 0, bonds: 0, stocks: 0, cryptos: 0, options: 0 });
		}
		stacks = padded;
	} else if (stacks.length > totals.length) {
		stacks = stacks.slice(0, totals.length);
	}
	return stacks;
}
function trimDailyStackHistory(stacks, maxDays = DAILY_CHART_TRIM_DAYS) {
	const arr = stacks || [];
	const limit = Math.max(1, Math.floor(Number(maxDays)) || DAILY_CHART_TRIM_DAYS);
	return arr.length > limit ? arr.slice(-limit) : arr;
}
function padStackHistoryTrailing(stacks) {
	if (!Array.isArray(stacks) || !stacks.length) return stacks || [];
	return [...stacks, ...Array(CHART_TRAILING_BLANK_SLOTS).fill(null)];
}
/** Bucket end days at fixed calendar boundaries (10, 20, … or 1000, 2000, …). */
function fixedBucketEndDaysInRange(oldestDay, newestDay, bucketDays, currentDay) {
	const cap = Math.min(newestDay, currentDay);
	const start = Math.max(1, oldestDay);
	if (bucketDays < 1 || cap < start) return [];
	let d = Math.ceil(start / bucketDays) * bucketDays;
	const out = [];
	for (; d <= cap; d += bucketDays) out.push(d);
	return out;
}
/** Extend fixed bucket axis with blank slots through chart end (next boundaries). */
function padFixedBucketsToNewestDay(plotData, bucketEndDays, newestDay, bucketDays) {
	const data = [...(plotData || [])];
	const days = [...(bucketEndDays || [])];
	let d = days.length ? days[days.length - 1] + bucketDays : bucketDays;
	while (d <= newestDay) {
		days.push(d);
		data.push(null);
		d += bucketDays;
	}
	return { plotData: data, bucketEndDays: days };
}
function clampNetWorthChartStartDay(s, startDay) {
	const day = Math.floor(Number(startDay));
	if (!Number.isFinite(day) || day < 1) return 1;
	return Math.min(s.day, day);
}
function sliceNetWorthStackFromDay(s, startDay) {
	const start = clampNetWorthChartStartDay(s, startDay);
	return expandStackHistoryToDaySpanFromState(s, { oldestDay: start, newestDay: s.day });
}
function netWorthStackSeriesForChart(s, mode, startDay) {
	if (mode === "monthly") {
		return sliceNetWorthStackFromDay(s, startDay);
	}
	const view = netWorthHistoryView(s);
	return trimDailyStackHistory(view.stackDaily, netWorthRecentDays);
}
function stackSnapshotTotal(snap) {
	if (!snap) return null;
	return NET_WORTH_STACK_LAYERS.reduce((sum, l) => sum + (snap[l.key] || 0), 0);
}
function netWorthHistoryPlotSeries(source, chartDaySpan, bucketEndDays) {
	if (!chartDaySpan) return [];
	if (chartDaySpan.bucketDays > 1) {
		const ends = bucketEndDays?.length
			? bucketEndDays
			: fixedBucketEndDaysInRange(
				chartDaySpan.oldestDay,
				chartDaySpan.newestDay,
				chartDaySpan.bucketDays,
				chartDaySpan.currentDay ?? chartDaySpan.newestDay
			);
		return padFixedBucketsToNewestDay(
			bucketScalarsAtFixedDays(source, ends),
			ends,
			chartDaySpan.newestDay,
			chartDaySpan.bucketDays
		).plotData;
	}
	return expandNetWorthHistoryToDaySpanFromState(source, chartDaySpan);
}
function mpLeaderboardOverlayRows() {
	if (!isMultiplayer()) return [];
	const selfId = mpClient.session?.playerId;
	return (mpClient.leaderboard || []).filter(row => row.playerId !== selfId);
}
function mpOverlayColorForIndex(index) {
	return MP_NW_OVERLAY_COLORS[index % MP_NW_OVERLAY_COLORS.length];
}
function chartAxisEndDay(currentDay) {
	return currentDay + CHART_TRAILING_BLANK_SLOTS;
}
/** Trading-day lookback for % chip next to prices (matches daily `history` steps). */
function trailingReturnMeta(history, price, maxDays = DISPLAY_RETURN_DAYS) {
	const h = Array.isArray(history) ? history : [];
	const effectiveSpan = h.length >= 2 ? Math.min(maxDays, h.length - 1) : maxDays;
	if (h.length < 2 || !Number.isFinite(price)) return { pct: null, labelDays: effectiveSpan };
	const pastPx = h[h.length - 1 - effectiveSpan];
	if (!Number.isFinite(pastPx) || pastPx === 0) return { pct: null, labelDays: effectiveSpan };
	return { pct: ((price - pastPx) / pastPx) * 100, labelDays: effectiveSpan };
}
function marketCardReturnDaysVisible(currentDay, daysList = MARKET_CARD_RETURN_DAYS) {
	const day = Math.max(1, currentDay || 1);
	return daysList.filter(d => day >= d);
}
function marketCardReturnChipsHtml(history, price, currentDay, daysList = MARKET_CARD_RETURN_DAYS) {
	const visible = marketCardReturnDaysVisible(currentDay, daysList);
	return visible.map((days, i) => {
		const meta = trailingReturnMeta(history, price, days);
		const cls = trailingPctChipClass(meta.pct);
		const chip = `<span class="market-card__chg-chip ${cls}" data-mkt-chg-days="${days}">${formatTrailingPctChipText(meta.pct, days)}</span>`;
		const sep = i < visible.length - 1 ? `<span class="market-card__chg-sep" aria-hidden="true">|</span>` : "";
		return chip + sep;
	}).join("");
}
function patchMarketCardReturnChips(container, history, price, currentDay, daysList = MARKET_CARD_RETURN_DAYS) {
	if (!container) return;
	container.innerHTML = marketCardReturnChipsHtml(history, price, currentDay, daysList);
}
function stockBulkAvgReturnMeta(stocks, maxDays) {
	const list = stocks || [];
	let pctSum = 0;
	let pctCount = 0;
	for (const a of list) {
		const m = trailingReturnMeta(a.history, a.price, maxDays);
		if (Number.isFinite(m.pct)) {
			pctSum += m.pct;
			pctCount += 1;
		}
	}
	return { pct: pctCount ? pctSum / pctCount : null, labelDays: maxDays };
}
function stockBulkReturnChipsHtml(stocks, currentDay) {
	const visible = marketCardReturnDaysVisible(currentDay);
	return visible.map((days, i) => {
		const meta = stockBulkAvgReturnMeta(stocks, days);
		const cls = trailingPctChipClass(meta.pct);
		const chip = `<span class="market-card__chg-chip ${cls}" data-mkt-chg-days="${days}">${formatTrailingPctChipText(meta.pct, days)}</span>`;
		const sep = i < visible.length - 1 ? `<span class="market-card__chg-sep" aria-hidden="true">|</span>` : "";
		return chip + sep;
	}).join("");
}
function patchStockBulkReturnChips(stocks, currentDay) {
	const bar = document.querySelector("[data-stock-bulk-bar]");
	if (!bar) return;
	const row = bar.querySelector(".market-card__chg-row");
	if (row) row.innerHTML = stockBulkReturnChipsHtml(stocks, currentDay ?? state.day);
}
function cumRealized(s, bucket) {
	const v = s.cumulativeRealizedPL && s.cumulativeRealizedPL[bucket];
	return Number.isFinite(v) ? v : 0;
}

function unrealizedTrackedPL(s, listKey, qtyKey) {
	return (s[listKey] || []).reduce((sum, a) => {
		const qty = a[qtyKey] || 0;
		if (qty <= 0) return sum;
		return sum + (qty * (a.price || 0) - (a.costBasis || 0));
	}, 0);
}

let params = readParams();
let state = newState(params);
let renderedLogCount = 0;
      const tradeQtyByInputId = {};
      const tradeStepByInputId = {};
      const AMOUNT_QTY_PRESETS = [1, 10, 100, 1000];
      const STOCK_BULK_AMOUNT_ID = "stock-amount-bulk";
      const IF_AUTOBUY_SHARES_PRESETS = [1, 10, 100, 1000];
      const IF_AUTOBUY_DAYS_PRESETS = [1, 7, 30, 90];
      const IF_AUTOBUY_SHARES_INPUT = "if-autobuy-shares";
      const IF_AUTOBUY_DAYS_INPUT = "if-autobuy-days";
      const BOND_AUTOBUY_FACE_INPUT = "bond-autobuy-face-value";
      const BOND_AUTOBUY_TERM_INPUT = "bond-autobuy-term";
      const BOND_AUTOBUY_DAYS_INPUT = "bond-autobuy-days";
      const TREASURY_BOND_TERM_OPTIONS = [1, 2, 5, 10, 30];
      let indexChartMode = "daily";
      let netWorthChartMode = "daily";
      let netWorthChartBucketDays = 10;
      let netWorthRecentDays = 1000;
      let netWorthMonthStartDay = 1;
      let stockChartMode = "daily";
      let cryptoChartMode = "daily";
      let selectedOptionId = null;
      const PERP_QTY_INPUT = "perp-amount";
      let selectedStockId = null;
      let selectedCryptoId = null;
      let tickerItems = [];
      let tickerIndex = 0;
let autoAdvanceTimerId = null;
let autoAdvanceIntervalMs = 500;
let mpAdvanceInFlight = false;
const AUTO_ADVANCE_MS_MIN = 5;
const AUTO_ADVANCE_MS_MAX = 1000;
const OVERVIEW_CHANGE_LOOKBACK_DAYS = 30;

let saveDebounceTimerId = null;

function collectUiMeta() {
	return {
		indexChartMode,
		netWorthChartMode,
		netWorthChartBucketDays,
		netWorthRecentDays,
		netWorthMonthStartDay,
		stockChartMode,
		cryptoChartMode,
		autoAdvanceIntervalMs,
	};
}

function applyUiMeta(meta) {
	if (!meta || typeof meta !== "object") return;
	if (meta.indexChartMode === "daily" || meta.indexChartMode === "monthly") indexChartMode = meta.indexChartMode;
	if (meta.netWorthChartMode === "daily" || meta.netWorthChartMode === "monthly") netWorthChartMode = meta.netWorthChartMode;
	if (Number.isFinite(meta.netWorthChartBucketDays)) netWorthChartBucketDays = meta.netWorthChartBucketDays;
	if (Number.isFinite(meta.netWorthRecentDays)) netWorthRecentDays = meta.netWorthRecentDays;
	if (Number.isFinite(meta.netWorthMonthStartDay)) netWorthMonthStartDay = meta.netWorthMonthStartDay;
	if (meta.stockChartMode === "daily" || meta.stockChartMode === "monthly") stockChartMode = meta.stockChartMode;
	if (meta.cryptoChartMode === "daily" || meta.cryptoChartMode === "monthly") cryptoChartMode = meta.cryptoChartMode;
	if (Number.isFinite(meta.autoAdvanceIntervalMs)) setAutoAdvanceIntervalMs(meta.autoAdvanceIntervalMs, { restartIfRunning: false });
}

function updateSaveStatus(message, isError = false) {
	const el = document.getElementById("save-status");
	if (!el) return;
	el.textContent = message;
	el.className = isError ? "save-status save-status--error" : "save-status";
}

function persistCurrentGame() {
	return saveGameToStorage(state, params, collectUiMeta());
}

function flushPendingSave() {
	if (saveDebounceTimerId) {
		clearTimeout(saveDebounceTimerId);
		saveDebounceTimerId = null;
	}
	persistCurrentGame();
}

function scheduleSave() {
	if (saveDebounceTimerId) clearTimeout(saveDebounceTimerId);
	saveDebounceTimerId = setTimeout(() => {
		saveDebounceTimerId = null;
		persistCurrentGame();
	}, 400);
}

window.addEventListener("beforeunload", flushPendingSave);
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "hidden") flushPendingSave();
});

function applySavedRun(saved) {
	if (!saved) return false;
	applyParamsToForm(saved.params);
	params = { ...readParams(), ...saved.params };
	state = saved.state;
	applyUiMeta(saved.meta);
	renderedLogCount = 0;
	const logEl = document.getElementById("log");
	if (logEl) logEl.innerHTML = "";
	return true;
}

function loadSavedRunIntoSession() {
	return applySavedRun(loadGameFromStorage());
}

function importSavedRun(saved, { writeStorage = true } = {}) {
	if (!applySavedRun(saved)) return false;
	if (writeStorage) writeParsedSaveToStorage(saved);
	return true;
}

function hideStartScreen() {
	const overlay = document.getElementById("start-screen");
	if (!overlay?.classList.contains("start-screen--hidden")) {
		overlay?.classList.add("start-screen--hidden");
		overlay?.setAttribute("aria-hidden", "true");
	}
}

function beginImportedRun(saved) {
	setAutoAdvance(false);
	if (!importSavedRun(saved)) return false;
	hideStartScreen();
	startTicker();
	render(state);
	setupStartScreen();
	updateSaveStatus(`Imported — Day ${saved.state.day.toLocaleString()}`);
	return true;
}

async function handleSaveImportFile(file) {
	const saved = await readSaveFromFile(file);
	if (!saved) {
		updateSaveStatus("Invalid save file", true);
		return false;
	}
	return beginImportedRun(saved);
}

function setupStartScreen() {
	const continueBtn = document.getElementById("continue-game-btn");
	const hint = document.getElementById("start-screen-save-hint");
	if (!hasSavedGame()) {
		if (continueBtn) continueBtn.hidden = true;
		if (hint) hint.textContent = "";
		return;
	}
	const saved = loadGameFromStorage();
	if (continueBtn) continueBtn.hidden = false;
	if (hint && saved) {
		hint.textContent = `Saved run — Day ${saved.state.day.toLocaleString()} · ${formatSaveTimestamp(saved.savedAt)}`;
	}
}

function clampAutoAdvanceMs(raw) {
	if (!Number.isFinite(raw)) return 500;
	return Math.max(AUTO_ADVANCE_MS_MIN, Math.min(AUTO_ADVANCE_MS_MAX, Math.floor(raw)));
}

function getAutoAdvanceIntervalMs() {
	return clampAutoAdvanceMs(autoAdvanceIntervalMs);
}

function setAutoAdvanceIntervalMs(ms, { restartIfRunning = true } = {}) {
	autoAdvanceIntervalMs = clampAutoAdvanceMs(ms);
	const slider = document.getElementById("auto-advance-speed-slider");
	if (slider && document.activeElement !== slider) {
		slider.value = String(autoAdvanceIntervalMs);
	}
	syncAutoAdvanceUi();
	if (restartIfRunning && autoAdvanceTimerId !== null) {
		clearInterval(autoAdvanceTimerId);
		autoAdvanceTimerId = null;
		setAutoAdvance(true);
	}
}

function syncAutoAdvanceUi() {
	const ms = getAutoAdvanceIntervalMs();
	const msStr = ms.toLocaleString();
	const running = autoAdvanceTimerId !== null;
	const startBtn = document.getElementById("auto-advance-start-btn");
	const mpHostOnly = isMultiplayer() && !isMpHost();
	if (startBtn) {
		startBtn.textContent = running
			? `⏹ Stop · ${msStr} ms/day`
			: mpHostOnly
				? `▶ Host only · ${msStr} ms/day`
				: `▶ Start · ${msStr} ms/day`;
		startBtn.classList.toggle("primary", !running);
		startBtn.classList.toggle("danger", running);
		startBtn.disabled = mpHostOnly;
		startBtn.title = mpHostOnly ? "Only the host can auto-advance days" : "";
	}
	const speedDisplay = document.getElementById("auto-advance-speed-display");
	if (speedDisplay) speedDisplay.textContent = `${msStr} ms`;
}

function getQtyPresetsForInput(amountId) {
	if (amountId === IF_AUTOBUY_SHARES_INPUT) return IF_AUTOBUY_SHARES_PRESETS;
	if (amountId === IF_AUTOBUY_DAYS_INPUT || amountId === BOND_AUTOBUY_DAYS_INPUT) return IF_AUTOBUY_DAYS_PRESETS;
	return AMOUNT_QTY_PRESETS;
}

function getTradeQtyStep(amountId) {
	const presets = getQtyPresetsForInput(amountId);
	const s = tradeStepByInputId[amountId];
	return presets.includes(s) ? s : 1;
}

function amountQtyPresetButtonsHtml(amountId) {
	const presets = getQtyPresetsForInput(amountId);
	const step = getTradeQtyStep(amountId);
	const presetBtns = presets.map(
		n =>
			`<button type="button" class="btn amount-step-size-btn${n === step ? " active" : ""}" onclick="window._setTradeQtyPreset('${amountId}',${n})">${n}</button>`
	).join("");
	return `<div class="amount-step-size-row amount-step-size-row--spread" onclick="event.stopPropagation()">${presetBtns}</div>`;
}

function autobuyQtyStepperHtml(inputId, label) {
	const qty = Math.max(1, tradeQtyByInputId[inputId] || 1);
	return `
		<div class="if-autobuy-field">
			<span class="if-autobuy-field-label">${label}</span>
			<div class="amount-stepper-wrap">
				<div class="amount-stepper">
					<input id="${inputId}" class="amount-input" type="number" min="1" step="1" value="${qty}" oninput="window._setAmount('${inputId}', this.value)">
				</div>
				${amountQtyPresetButtonsHtml(inputId)}
			</div>
		</div>`;
}

function treasuryBondAutobuyFaceFieldHtml(faceValue) {
	const fv = Math.max(100, parseFloat(faceValue) || 1000);
	return `
		<div class="if-autobuy-field">
			<span class="if-autobuy-field-label">Face ($)</span>
			<input id="${BOND_AUTOBUY_FACE_INPUT}" class="amount-input" type="number" min="100" step="100" value="${fv}" oninput="window._onBondAutobuyConfigChange()">
		</div>`;
}

function treasuryBondAutobuyTermFieldHtml(term) {
	const opts = TREASURY_BOND_TERM_OPTIONS.map(t => {
		const sel = t === term ? " selected" : "";
		return `<option value="${t}"${sel}>${t} yr</option>`;
	}).join("");
	return `
		<div class="if-autobuy-field">
			<span class="if-autobuy-field-label">Term</span>
			<select id="${BOND_AUTOBUY_TERM_INPUT}" class="amount-input" onchange="window._onBondAutobuyConfigChange()">${opts}</select>
		</div>`;
}

// Tab switching
document.querySelectorAll(".nav-tab").forEach(tab => {
tab.addEventListener("click", () => {
      if (tab.dataset.locked === "true") return;
document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
tab.classList.add("active");
document.getElementById("page-" + tab.dataset.page).classList.add("active");
renderGraphs(state);
});
});

function setChange(elId, history, lookbackDays = 1) {
	const el = document.getElementById(elId);
	if (!el) return;
	if (!history || history.length < 2) {
		el.textContent = "—";
		el.className = "inv-change";
		return;
	}
	const i = history.length - 1;
	const j = Math.max(0, i - lookbackDays);
	const oldPx = history[j];
	if (j >= i || !Number.isFinite(oldPx) || oldPx === 0) {
		el.textContent = "—";
		el.className = "inv-change";
		return;
	}
	const pct = ((history[i] - oldPx) / oldPx * 100).toFixed(2);
	el.textContent = (pct >= 0 ? "▲" : "▼") + Math.abs(pct) + "%";
	el.className = "inv-change " + (pct >= 0 ? "pos" : "neg");
}

  function averageHistory(assets, historyKey = "history") {
    const list = assets || [];
    if (!list.length) return [];
    const lengths = list.map(a => (a[historyKey] || []).length);
    if (!lengths.some(n => n > 0)) return [];
    const len = Math.max(...lengths);
    const out = [];
    for (let i = 0; i < len; i++) {
      let sum = 0;
      let count = 0;
      for (const a of list) {
        const arr = a[historyKey] || [];
        if (!arr.length) continue;
        sum += arr[Math.min(i, arr.length - 1)];
        count++;
      }
      if (count) out.push(sum / count);
    }
    return out;
  }

  function buildTickerItems(s) {
    const index = (s.indexFunds || [])[0];
    const stockLead = (s.stocks || [])[0];
    const cryptoLead = (s.cryptos || [])[0];
    const bondPillar = (s.yieldCurve || YIELD_CURVE)[2];
    const optionsHeld = openOptionHoldings(s).reduce((sum, h) => sum + h.contracts, 0);
    const indexPct = (index && index.history?.length > 1)
      ? ((index.price - index.history[index.history.length - 2]) / index.history[index.history.length - 2] * 100)
      : 0;
    const bondPct = bondPillar ? (bondPillar.yield * 100) : 0;
    const bondLine = s.unlockedBonds
      ? `Treasury 5yr yield around ${bondPct.toFixed(2)}%`
      : `Bond market locked — unlock on the Bonds tab for ${fmt(UNLOCK_COST_BONDS)}.`;
    const stockLine = s.unlockedStocks
      ? `${stockLead?.name || "Lead stock"} trading near $${(stockLead?.price || 0).toFixed(2)}`
      : `Stock market locked — unlock on the Stocks tab for ${fmt(UNLOCK_COST_STOCKS)}.`;
    const cryptoLine = s.unlockedCrypto
      ? `${cryptoLead?.name || "Lead token"} at $${(cryptoLead?.price || 0).toFixed(2)}`
      : `Crypto market locked — unlock on the Crypto tab for ${fmt(UNLOCK_COST_CRYPTOS)}.`;
    const optionsLine = s.unlockedOptions
      ? (optionsHeld > 0 ? `Options desk active: ${optionsHeld} contracts open` : "Options desk quiet with no open contracts")
      : `Options market locked — unlock on the Options tab for ${fmt(UNLOCK_COST_OPTIONS)}.`;
    return [
      `Day ${s.day}: ${index?.name || "Index"} ${indexPct >= 0 ? "up" : "down"} ${Math.abs(indexPct).toFixed(2)}%`,
      bondLine,
      stockLine,
      cryptoLine,
      optionsLine,
      `Net worth snapshot: ${fmt(netWorth(s))}`,
    ];
  }

  function renderTicker(s) {
    const el = document.getElementById("news-ticker-track");
    if (!el) return;
    const items = buildTickerItems(s);
    tickerItems = items;
    if (!items.length) return;
    tickerIndex = (tickerIndex + 1) % items.length;
    const current = items[tickerIndex];
    const next = items[(tickerIndex + 1) % items.length];
    const after = items[(tickerIndex + 2) % items.length];
    el.textContent = `${current}   •   ${next}   •   ${after}`;
  }

  function startTicker() {
    const el = document.getElementById("news-ticker-track");
    if (!el) return;
    renderTicker(state);
    el.addEventListener("animationiteration", () => renderTicker(state));
  }

  /** Update market cards in place (prices + spark charts) without rebuilding Buy/Sell DOM. */
  function patchMarketCardsInPlace(listElId, assets, prefix, chartColor, embedCardChart, chartHorizontalLevels, marketSelection) {
    const root = document.getElementById(listElId);
    if (!root) return;
    for (const a of assets || []) {
      const card = root.querySelector(`[data-mkt-card="${prefix}:${a.id}"]`);
      if (!card) continue;
      const priceEl = card.querySelector(".market-card__price");
      if (priceEl) priceEl.textContent = `$${a.price.toFixed(2)}`;
      card.setAttribute("data-mkt-unit-price", String(a.price));
      patchMarketCardOrderTotal(card);
      patchMarketCardReturnChips(card.querySelector(".market-card__chg-row"), a.history, a.price, state.day);
      patchMarketCardHoldings(card, prefix, a, state);
      if (marketCardShowsAutobuy(prefix)) patchMarketCardAutobuyStatus(card, prefix, a, state);
      if (embedCardChart) {
        const sparkId = `${prefix}-spark-${a.id}`;
        const canvas = document.getElementById(sparkId);
        if (canvas) {
          const strikeLevels = prefix === "ifu" && Array.isArray(chartHorizontalLevels) ? chartHorizontalLevels : null;
          const { series, xLabs } = sparkSeriesAndXLabels(prefix, a, state.day);
          drawChart(canvas, series, chartColor, null, null, xLabs, true, null, null, strikeLevels);
        }
      }
    }
    if (marketSelection && marketSelection.selectedId) {
      const list = assets || [];
      const sel = list.find(x => x.id === marketSelection.selectedId) || list[0];
      if (sel && marketSelection.canvasId) {
        const c = document.getElementById(marketSelection.canvasId);
        if (c) {
          const mPrefix = marketSelection.canvasId === "stock-market-main-chart" ? "stock" : "crypto";
          const yEl = mPrefix === "stock" ? document.getElementById("stock-main-yaxis") : document.getElementById("crypto-main-yaxis");
          const xEl = mPrefix === "stock" ? document.getElementById("stock-main-xaxis") : document.getElementById("crypto-main-xaxis");
          const { series, xLabs } = sparkSeriesAndXLabels(mPrefix, sel, state.day);
          drawChart(c, series, chartColor, yEl, xEl, xLabs, !yEl, null, null, null);
        }
      }
      if (marketSelection.titleElId && sel) {
        const titleNode = document.getElementById(marketSelection.titleElId);
        if (titleNode) titleNode.textContent = sel.name || "";
      }
    }
  }

  function patchOptionsChainPremiums(s) {
    const root = document.getElementById("options-market-list");
    if (!root) return;
    for (const opt of s.options || []) {
      const side = root.querySelector(`.options-side[data-option-id="${opt.id}"]`);
      if (!side) continue;
      const pv = side.querySelector(".prem-val");
      if (pv) pv.textContent = `$${opt.price.toFixed(2)}`;
    }
  }

  function patchOptionsTicketLive(s) {
    const el = document.getElementById("options-ticket");
    if (!el || !s.unlockedOptions) return;
    const options = s.options || [];
    if (!options.length) return;
    const selected = options.find(o => o.id === selectedOptionId) || options[0];
    const qtyInputId = `options-amount-${selected.id}`;
    const qtyEl = document.getElementById(qtyInputId);
    const qty = qtyEl ? Math.max(1, parseInt(qtyEl.value, 10) || 1) : Math.max(1, tradeQtyByInputId[qtyInputId] || 1);
    const underlying = (s.indexFunds || []).find(f => f.id === selected.underlyingId);
    const openLots = openOptionHoldings(s).filter(h => h.optionId === selected.id);
    const held = openLots.reduce((sum, h) => sum + h.contracts, 0);
    const setField = (field, text) => {
      const n = el.querySelector(`[data-ticket-field="${field}"]`);
      if (n) n.textContent = text;
    };
    setField("underlying", `${underlying?.name || selected.underlyingId} @ $${(underlying?.price || 0).toFixed(2)}`);
    setField("premium-ticker", `$${selected.price.toFixed(2)}`);
    setField("order-total", formatMarketCardOrderTotal(qty, selected.price));
    patchMarketCardReturnChips(el.querySelector(".options-ticket-chg-row"), selected.history, selected.price, s.day);
    const holdingsBlock = el.querySelector("[data-mkt-holdings]");
    if (holdingsBlock) {
      const lots = openLots;
      const mkt = lots.reduce((sum, h) => sum + (h.contracts || 0) * markOptionHolding(s, h), 0);
      const cost = lots.reduce((sum, h) => sum + (h.contracts || 0) * (h.premiumAtPurchase || 0), 0);
      const pl = mkt - cost;
      const plCls = pl >= 0 ? "pos" : "neg";
      const avg = held > 0 ? cost / held : 0;
      const qtyNode = holdingsBlock.querySelector("[data-mkt-held-qty]");
      const avgNode = holdingsBlock.querySelector("[data-mkt-held-avg]");
      const mktNode = holdingsBlock.querySelector("[data-mkt-held-mkt]");
      const plNode = holdingsBlock.querySelector("[data-mkt-held-pl]");
      if (held <= 0) {
        if (qtyNode) qtyNode.textContent = "—";
        if (avgNode) avgNode.textContent = "";
        if (mktNode) mktNode.textContent = "";
        if (plNode) { plNode.textContent = ""; plNode.className = ""; }
      } else {
        const optMeta = computeOptionsLotsPl(s, lots);
        if (qtyNode) qtyNode.textContent = `${held} ctr`;
        if (avgNode) avgNode.textContent = `Avg $${avg.toFixed(2)}`;
        if (mktNode) mktNode.textContent = fmt(mkt);
        if (plNode) {
          plNode.textContent = `${fmtSigned(pl)} (${formatPlPct(optMeta?.plPct)})`;
          plNode.className = plCls;
        }
      }
    }
    const ticketPanel = document.querySelector(".options-ticket-panel");
    const optMeta = held > 0 ? computeOptionsLotsPl(s, openLots) : null;
    patchMarketCardHeldBorder(ticketPanel, optMeta?.plPct ?? null);
    applyPlTintToElement(holdingsBlock, optMeta?.plPct ?? null);
  }

  function patchOptionsPositionsLive(s) {
    const el = document.getElementById("options-holdings-list");
    if (!el || !s.unlockedOptions) return;
    const holdings = openOptionHoldings(s);
    for (const h of holdings) {
      const row = el.querySelector(`[data-opt-lot="${h.id}"]`);
      if (!row) continue;
      const mark = markOptionHolding(s, h);
      const plSell = optionLotUnrealizedPLAtMark(s, h);
      const plEx = optionLotUnrealizedPLIfExercised(s, h);
      const dte = Math.max(0, h.expiryDay - s.day);
      const sellClass = plSell >= 0 ? "pos" : "neg";
      const exClass = plEx >= 0 ? "pos" : "neg";
      const spans = row.querySelectorAll(":scope > span");
      if (spans[4]) spans[4].textContent = String(dte);
      if (spans[7]) spans[7].textContent = `$${mark.toFixed(2)}`;
      if (spans[8]) {
        spans[8].textContent = fmtSigned(plSell);
        spans[8].className = sellClass;
      }
      if (spans[9]) {
        spans[9].textContent = fmtSigned(plEx);
        spans[9].className = exClass;
      }
    }
  }

  function patchPerpsPanelLive(s) {
    const el = document.getElementById("perps-market-panel");
    if (!el || !s.unlockedOptions) return;
    const mark = perpMarkPrice(s);
    const u = (s.indexFunds || []).find(f => f.id === "spy")?.price ?? 0;
    const basisBps = s.perpBasisBps ?? 0;
    const setField = (field, text) => {
      const n = el.querySelector(`[data-perp-field="${field}"]`);
      if (n) n.textContent = text;
    };
    setField("mark", `$${mark.toFixed(2)}`);
    setField("index", `$${u.toFixed(2)}`);
    setField("funding", formatPerpFundingAnnText(s, perpFundingRateAnnual));
    const qty = Math.max(1, tradeQtyByInputId[PERP_QTY_INPUT] || 1);
    setField("open-prem", `${fmt(perpOpenPremiumTotal(qty, mark))} / ${qty} ctr`);
    setField("basis", `${basisBps >= 0 ? "+" : ""}${basisBps} bps`);
  }

  function patchPerpsHoldingsLive(s) {
    const el = document.getElementById("perps-holdings-list");
    if (!el || !s.unlockedOptions) return;
    const positions = openPerpPositions(s);
    const mark = perpMarkPrice(s);
    for (const p of positions) {
      const row = el.querySelector(`[data-perp-lot="${p.id}"]`);
      if (!row) continue;
      const pl = perpPositionUnrealizedPL(p, mark);
      const plCls = pl >= 0 ? "pos" : "neg";
      const funding = p.fundingPaid || 0;
      const spans = row.querySelectorAll(":scope > span");
      if (spans[3]) spans[3].textContent = `$${mark.toFixed(2)}`;
      const totalPl = perpPositionTotalPL(p, mark);
      const totalCls = totalPl >= 0 ? "pos" : "neg";
      if (spans[5]) {
        spans[5].textContent = fmtSigned(pl);
        spans[5].className = plCls;
      }
      if (spans[6]) spans[6].textContent = fmt(funding);
      if (spans[7]) {
        spans[7].textContent = fmtSigned(totalPl);
        spans[7].className = totalCls;
      }
    }
  }


  function corporateBondActionsHtml(o) {
    const soldOut = (o.unitsRemaining || 0) <= 0;
    const dis = soldOut ? " disabled" : "";
    return `<button type="button" class="btn btn-trade-buy btn-trade-compact" data-corp-buy data-offer-id="${o.id}" data-qty="1"${dis}>Buy</button>
        <button type="button" class="btn btn-trade-buy btn-trade-compact" data-corp-buy data-offer-id="${o.id}" data-qty="10"${dis}>×10</button>
        <button type="button" class="btn btn-trade-buy btn-trade-compact" data-corp-buy data-offer-id="${o.id}" data-qty="100"${dis}>×100</button>`;
  }

  function corporateBondRowInnerHtml(o, s) {
    return `
      <span class="white" data-corp-issuer>${o.issuer}</span>
      <span data-corp-rating>${o.rating}</span>
      <span data-corp-term>${o.term}yr</span>
      <span class="pos" data-corp-yield>${(o.yield * 100).toFixed(2)}%</span>
      <span data-corp-face>${fmt(o.faceValue)}</span>
      <span data-corp-units>${formatCorpBondUnits(o.unitsRemaining)}/${formatCorpBondUnits(o.initialUnits)}</span>
      <span data-corp-default>${((o.annualDefaultProb || 0) * 100).toFixed(1)}%/yr</span>
      <span class="corp-bond-actions" data-corp-status>${corporateBondActionsHtml(o)}</span>`;
  }

  function patchCorporateBondRow(s, o, row) {
    if (!row) return;
    row.querySelector("[data-corp-window]")?.remove();
    const issuerEl = row.querySelector("[data-corp-issuer]");
    if (issuerEl) issuerEl.textContent = o.issuer;
    const ratingEl = row.querySelector("[data-corp-rating]");
    if (ratingEl) ratingEl.textContent = o.rating;
    const termEl = row.querySelector("[data-corp-term]");
    if (termEl) termEl.textContent = `${o.term}yr`;
    const yEl = row.querySelector("[data-corp-yield]");
    if (yEl) yEl.textContent = `${(o.yield * 100).toFixed(2)}%`;
    const faceEl = row.querySelector("[data-corp-face]");
    if (faceEl) faceEl.textContent = fmt(o.faceValue);
    const uEl = row.querySelector("[data-corp-units]");
    if (uEl) {
      uEl.textContent = `${formatCorpBondUnits(o.unitsRemaining)}/${formatCorpBondUnits(o.initialUnits)}`;
    }
    const dEl = row.querySelector("[data-corp-default]");
    if (dEl) dEl.textContent = `${((o.annualDefaultProb || 0) * 100).toFixed(1)}%/yr`;
    patchCorporateBondActions(o, row.querySelector("[data-corp-status]"));
  }

  function patchCorporateBondActions(o, statusEl) {
    if (!statusEl) return;
    const soldOut = (o.unitsRemaining || 0) <= 0;
    let buttons = statusEl.querySelectorAll("[data-corp-buy]");
    if (!buttons.length) {
      statusEl.innerHTML = corporateBondActionsHtml(o);
      return;
    }
    for (const btn of buttons) {
      btn.disabled = soldOut;
    }
  }

  function patchCorporateBondMarketLive(s) {
    const el = document.getElementById("corp-bond-market-list");
    if (!el) return;
    for (const o of s.corporateBondOffers || []) {
      const row = el.querySelector(`[data-corp-offer="${o.id}"]`);
      if (row) patchCorporateBondRow(s, o, row);
    }
  }

  function syncCorporateBondMarketDom(s) {
    const el = document.getElementById("corp-bond-market-list");
    if (!el) return;
    const offers = s.corporateBondOffers || [];
    if (!offers.length) {
      el.innerHTML = `<div style="color:#444;font-size:0.8em;">No corporate bonds available.</div>`;
      return;
    }
    let header = el.querySelector(".corp-bond-header");
    if (!header) {
      el.innerHTML = `
        <div class="corp-bond-header">
          <span>Issuer</span><span>Rating</span><span>Term</span><span>Yield</span><span>Face</span><span>Bills</span><span>Default</span><span></span>
        </div>`;
    }
    const activeIds = new Set(offers.map(o => o.id));
    for (const o of offers) {
      let row = el.querySelector(`[data-corp-offer="${o.id}"]`);
      if (!row) {
        row = document.createElement("div");
        row.className = "corp-bond-row";
        row.dataset.corpOffer = o.id;
        row.innerHTML = corporateBondRowInnerHtml(o, s);
        el.appendChild(row);
      } else {
        patchCorporateBondRow(s, o, row);
      }
    }
    el.querySelectorAll(".corp-bond-row[data-corp-offer]").forEach(row => {
      if (!activeIds.has(row.dataset.corpOffer)) row.remove();
    });
  }

  function patchBondHoldingsLive(s) {
    const el = document.getElementById("bond-holdings-list");
    if (!el) return;
    for (const b of s.bondHoldings || []) {
      const row = el.querySelector(`[data-bond-id="${b.id}"]`);
      if (!row) continue;
      const daysLeft = b.maturityDay - s.day;
      const yearsLeft = (daysLeft / 365).toFixed(1);
      const maturesYr = Math.ceil(b.maturityDay / 365);
      const bondPl = b.couponAccrued || 0;
      const bondPlClass = bondPl > 0 ? "pos" : bondPl < 0 ? "neg" : "";
      const spans = row.querySelectorAll(":scope > span");
      if (spans[2]) spans[2].textContent = `${(b.yield * 100).toFixed(2)}%`;
      if (spans[3]) spans[3].textContent = `Yr ${maturesYr}`;
      if (spans[4]) {
        spans[4].textContent = fmtSigned(bondPl);
        spans[4].className = bondPlClass;
      }
      if (spans[5]) {
        spans[5].textContent = `${yearsLeft}yr left · ${(b.type || "treasury") === "corporate" ? (b.issuer || "Corporate") : "U.S. Treasury"}`;
      }
    }
  }

  function patchTradingPanelsLive(s) {
    patchMarketCardsInPlace("if-market-list", s.indexFunds, "if", "#00ff88", false, null, null);
    if (s.unlockedStocks) {
      const stocks = s.stocks || [];
      if (stocks.length) {
        patchMarketCardsInPlace("stock-market-list", stocks, "stock", "#66aaff", false, null, {
          selectedId: selectedStockId,
          canvasId: "stock-market-main-chart",
          titleElId: "stock-market-chart-title",
        });
        patchStockBulkBarLive(s);
      }
      renderBankruptStockMemorials(s);
    }
    if (s.unlockedCrypto) {
      const cryptos = s.cryptos || [];
      if (cryptos.length) {
        patchMarketCardsInPlace("crypto-market-list", cryptos, "crypto", "#ff66cc", false, null, {
          selectedId: selectedCryptoId,
          canvasId: "crypto-market-main-chart",
          titleElId: "crypto-market-chart-title",
        });
      }
    }
    if (s.unlockedOptions) {
      const spyOnly = (s.indexFunds || []).filter(f => f.id === "spy");
      const optionStrikeLevels = [...new Set((s.options || []).map(o => o.strike).filter(v => Number.isFinite(v)))].sort((a, b) => a - b);
      patchMarketCardsInPlace("options-underlying-list", spyOnly, "ifu", "#00ff88", true, optionStrikeLevels, null);
      patchOptionsChainPremiums(s);
      patchOptionsTicketLive(s);
      patchOptionsPositionsLive(s);
      patchPerpsPanelLive(s);
      patchPerpsHoldingsLive(s);
    }
    if (s.unlockedBonds) {
      syncCorporateBondMarketDom(s);
      patchCorporateBondMarketLive(s);
      patchBondHoldingsLive(s);
      syncTreasuryBondAutobuyUi(s);
    }
  }

  function render(s, renderOpts = {}) {
    const liveOnly = renderOpts.liveOnly === true;
    const year = Math.floor((s.day - 1) / 365) + 1;
    const tradingLocked = false;

    // Sidebar
    document.getElementById("s-day").textContent       = s.day.toLocaleString();
    document.getElementById("s-maxdays").textContent   = s.maxDays.toLocaleString();
    document.getElementById("s-year").textContent      = year;
    document.getElementById("s-day-fill").style.width  = (s.day / s.maxDays * 100) + "%";
    document.getElementById("s-cash").textContent      = fmt(s.cash);
    document.getElementById("s-portfolio").textContent = fmt(portfolioValue(s));
    const sidebarIndexValue = (s.indexFunds || []).reduce((sum, a) => sum + ((a.shares || 0) * (a.price || 0)), 0);
    const sidebarBondsValue = (s.bondHoldings || []).reduce((sum, b) => sum + (b.faceValue || 0), 0);
    const sidebarCryptoValue = (s.cryptos || []).reduce((sum, a) => sum + ((a.coins || 0) * (a.price || 0)), 0);
    const sidebarStockValue = (s.stocks || []).reduce((sum, a) => sum + ((a.shares || 0) * (a.price || 0)), 0);
    const sidebarOptionsValue =
      openOptionHoldings(s).reduce((sum, lot) => sum + lot.contracts * markOptionHolding(s, lot), 0) +
      perpHoldingsMarkValue(s);
    const sidebarIndexPL = cumRealized(s, "indexFunds") + unrealizedTrackedPL(s, "indexFunds", "shares");
    const sidebarBondsPL = cumRealized(s, "bonds") + (s.bondHoldings || []).reduce((sum, b) => sum + (b.couponAccrued || 0), 0);
    const sidebarCryptoPL = cumRealized(s, "cryptos") + unrealizedTrackedPL(s, "cryptos", "coins");
    const sidebarStockPL = cumRealized(s, "stocks") + unrealizedTrackedPL(s, "stocks", "shares");
    const sidebarOptionsPL =
      cumRealized(s, "options") + optionsHoldingsUnrealizedPL(s) + perpHoldingsUnrealizedPL(s);
    document.getElementById("s-portfolio-index").textContent = fmt(sidebarIndexValue);
    if (s.unlockedBonds) {
      document.getElementById("s-portfolio-bonds").textContent = fmt(sidebarBondsValue);
      setPlDisplay(document.getElementById("s-pl-bonds"), sidebarBondsPL, "side-pl");
    } else {
      document.getElementById("s-portfolio-bonds").textContent = "Locked";
      const bpl = document.getElementById("s-pl-bonds");
      if (bpl) {
        bpl.textContent = fmt(UNLOCK_COST_BONDS);
        bpl.className = "side-pl";
      }
    }
    if (s.unlockedStocks) {
      document.getElementById("s-portfolio-stocks").textContent = fmt(sidebarStockValue);
      setPlDisplay(document.getElementById("s-pl-stocks"), sidebarStockPL, "side-pl");
    } else {
      document.getElementById("s-portfolio-stocks").textContent = "Locked";
      const sp = document.getElementById("s-pl-stocks");
      if (sp) {
        sp.textContent = fmt(UNLOCK_COST_STOCKS);
        sp.className = "side-pl";
      }
    }
    if (s.unlockedCrypto) {
      document.getElementById("s-portfolio-crypto").textContent = fmt(sidebarCryptoValue);
      setPlDisplay(document.getElementById("s-pl-crypto"), sidebarCryptoPL, "side-pl");
    } else {
      document.getElementById("s-portfolio-crypto").textContent = "Locked";
      const cp = document.getElementById("s-pl-crypto");
      if (cp) {
        cp.textContent = fmt(UNLOCK_COST_CRYPTOS);
        cp.className = "side-pl";
      }
    }
    if (s.unlockedOptions) {
      document.getElementById("s-portfolio-options").textContent = fmt(sidebarOptionsValue);
      setPlDisplay(document.getElementById("s-pl-options"), sidebarOptionsPL, "side-pl");
    } else {
      document.getElementById("s-portfolio-options").textContent = "Locked";
      const op = document.getElementById("s-pl-options");
      if (op) {
        op.textContent = fmt(UNLOCK_COST_OPTIONS);
        op.className = "side-pl";
      }
    }
    document.getElementById("s-portfolio-casino").textContent = fmt(0);
    setPlDisplay(document.getElementById("s-pl-index"), sidebarIndexPL, "side-pl");
    setPlDisplay(document.getElementById("s-pl-casino"), cumRealized(s, "casino"), "side-pl");
    const nw = netWorth(s);
    document.getElementById("s-networth").textContent  = fmt(nw);
    document.getElementById("s-return").textContent    = fmt(totalReturn(s));
    const dayBtn = document.getElementById("day-btn");
    dayBtn.disabled = s.day >= s.maxDays;
    dayBtn.textContent = `⏭ Next day`;
    renderMultiplayerPanel();
    syncAutoAdvanceUi();

    patchIncomeIndicators(s, params);

    // Index Fund
    const indexAvgHistory = averageHistory(s.indexFunds, "history");
    const indexShares = (s.indexFunds || []).reduce((sum, a) => sum + (a.shares || 0), 0);
    const indexValue = (s.indexFunds || []).reduce((sum, a) => sum + ((a.shares || 0) * (a.price || 0)), 0);
    const indexPL = cumRealized(s, "indexFunds") + unrealizedTrackedPL(s, "indexFunds", "shares");
    const indexAvgPrice = (s.indexFunds || []).length ? (s.indexFunds.reduce((sum, a) => sum + a.price, 0) / s.indexFunds.length) : 0;
    document.getElementById("if-price").textContent  = indexAvgPrice.toFixed(2);
    document.getElementById("if-shares").textContent = indexShares;
    document.getElementById("if-value").textContent  = fmt(indexValue);
    setPlDisplay(document.getElementById("if-pl"), indexPL, "stat-pl");
    setChange("if-change", indexAvgHistory, OVERVIEW_CHANGE_LOOKBACK_DAYS);
    if (!liveOnly) {
      renderAssetMarket("if-market-list", s.indexFunds, "shares", "if", "share", tradingLocked);
      renderIndexFundAutobuySteppers(s);
    }
    syncIndexFundAutobuyUi(s);
    renderOverviewHoldings(s);
    renderOverviewCardBreakdowns(s);

    // Bonds — yield curve preview (uses live curve from state; sim runs even when locked — UI hidden until unlock)
    const bondBanner = document.getElementById("bond-unlock-banner");
    const bondBody = document.getElementById("bond-trading-body");
    if (bondBanner && bondBody) {
      if (!liveOnly) {
        if (!s.unlockedBonds) {
          bondBanner.innerHTML = `<div class="asset-unlock-panel">The bond market is closed until you buy access.<br><br>One-time fee: <strong>${fmt(UNLOCK_COST_BONDS)}</strong><br><button type="button" class="btn primary asset-unlock-panel__btn" onclick="window._unlockBonds()">Unlock bond market</button></div>`;
          bondBody.style.display = "none";
        } else {
          bondBanner.innerHTML = "";
          bondBody.style.display = "";
        }
      } else if (!s.unlockedBonds) {
        bondBody.style.display = "none";
      } else {
        bondBody.style.display = "";
      }
    }
    const bondsValue = (s.bondHoldings || []).reduce((sum, b) => sum + (b.faceValue || 0), 0);
    const bondsPL = cumRealized(s, "bonds") + (s.bondHoldings || []).reduce((sum, b) => sum + (b.couponAccrued || 0), 0);
    if (s.unlockedBonds) {
      document.getElementById("bonds-value").textContent = fmt(bondsValue);
      setPlDisplay(document.getElementById("bonds-pl"), bondsPL, "stat-pl");
      updateBondPreview(s);
      if (!liveOnly) {
        renderCorporateBondMarket(s);
        renderBondHoldings(s);
        renderTreasuryBondAutobuySteppers(s);
      }
      syncTreasuryBondAutobuyUi(s);
    } else {
      document.getElementById("bonds-value").textContent = "—";
      const bplEl = document.getElementById("bonds-pl");
      if (bplEl) {
        bplEl.textContent = "—";
        bplEl.className = "stat-pl";
      }
      const yld = document.getElementById("bond-preview-yield");
      const inc = document.getElementById("bond-preview-income");
      if (yld) yld.textContent = "—";
      if (inc) inc.textContent = "—";
      const bh = document.getElementById("bond-holdings-list");
      if (bh) bh.innerHTML = `<div style="color:#444;font-size:0.8em;">Unlock the bond market to trade.</div>`;
    }
    const buyBondsBtn = document.getElementById("buy-bonds-btn");
    if (buyBondsBtn) buyBondsBtn.disabled = !s.unlockedBonds;
    renderAssetHoldings("if-holdings-list", s.indexFunds, "shares", "No index fund shares held.");

    // Stocks
    const stockValue = (s.stocks || []).reduce((sum, a) => sum + ((a.shares || 0) * (a.price || 0)), 0);
    const stockPL = cumRealized(s, "stocks") + unrealizedTrackedPL(s, "stocks", "shares");
    if (s.unlockedStocks) {
      document.getElementById("stock-value").textContent = fmt(stockValue);
      setPlDisplay(document.getElementById("stock-pl"), stockPL, "stat-pl");
    } else {
      document.getElementById("stock-value").textContent = "—";
      const spl = document.getElementById("stock-pl");
      if (spl) {
        spl.textContent = "—";
        spl.className = "stat-pl";
      }
    }
    if (!liveOnly) {
      renderStockCards(s, tradingLocked);
    }
    if (s.unlockedStocks) {
      renderAssetHoldings("stock-holdings-list", s.stocks, "shares", "No stock holdings.");
    }

    // Crypto
    const cryptoValue = (s.cryptos || []).reduce((sum, a) => sum + ((a.coins || 0) * (a.price || 0)), 0);
    const cryptoPL = cumRealized(s, "cryptos") + unrealizedTrackedPL(s, "cryptos", "coins");
    if (s.unlockedCrypto) {
      document.getElementById("crypto-value").textContent = fmt(cryptoValue);
      setPlDisplay(document.getElementById("crypto-pl"), cryptoPL, "stat-pl");
    } else {
      document.getElementById("crypto-value").textContent = "—";
      const cpl = document.getElementById("crypto-pl");
      if (cpl) {
        cpl.textContent = "—";
        cpl.className = "stat-pl";
      }
    }
    if (!liveOnly) {
      renderCryptoCards(s, tradingLocked);
    }
    if (s.unlockedCrypto) {
      renderAssetHoldings("crypto-holdings-list", s.cryptos, "coins", "No crypto holdings.");
    }

    // Options
    const optBanner = document.getElementById("options-unlock-banner");
    const optBody = document.getElementById("options-trading-body");
    if (optBanner && optBody) {
      if (!liveOnly) {
        if (!s.unlockedOptions) {
          optBanner.innerHTML = `<div class="asset-unlock-panel">The options desk is closed until you buy access.<br><br>One-time fee: <strong>${fmt(UNLOCK_COST_OPTIONS)}</strong><br><button type="button" class="btn primary asset-unlock-panel__btn" onclick="window._unlockOptions()">Unlock options market</button></div>`;
          optBody.style.display = "none";
        } else {
          optBanner.innerHTML = "";
          optBody.style.display = "";
        }
      } else if (!s.unlockedOptions) {
        optBody.style.display = "none";
      } else {
        optBody.style.display = "";
      }
    }
    const optionsContracts =
      openOptionHoldings(s).reduce((sum, h) => sum + h.contracts, 0) +
      openPerpPositions(s).reduce((sum, p) => sum + p.contracts, 0);
    const optionsValue =
      openOptionHoldings(s).reduce((sum, lot) => sum + lot.contracts * markOptionHolding(s, lot), 0) +
      perpHoldingsMarkValue(s);
    const optionsPL =
      cumRealized(s, "options") + optionsHoldingsUnrealizedPL(s) + perpHoldingsUnrealizedPL(s);
    const underlyingIndexA = (s.indexFunds || []).find(a => a.id === "spy");
    if (s.unlockedOptions) {
      document.getElementById("options-contracts").textContent = optionsContracts;
      document.getElementById("options-underlying-price").textContent = (underlyingIndexA?.price || 0).toFixed(2);
      document.getElementById("options-value").textContent = fmt(optionsValue);
      setPlDisplay(document.getElementById("options-pl"), optionsPL, "stat-pl");
    } else {
      document.getElementById("options-contracts").textContent = "—";
      document.getElementById("options-underlying-price").textContent = "—";
      document.getElementById("options-value").textContent = "—";
      const opl = document.getElementById("options-pl");
      if (opl) {
        opl.textContent = "—";
        opl.className = "stat-pl";
      }
    }
    renderOverviewOptionsChainPreview(s);
    document.getElementById("casino-value").textContent = fmt(0);
    setPlDisplay(document.getElementById("casino-pl"), cumRealized(s, "casino"), "stat-pl");
    const spyOnly = (s.indexFunds || []).filter(f => f.id === "spy");
    const optionStrikeLevels = [...new Set((s.options || []).map(o => o.strike).filter(v => Number.isFinite(v)))].sort((a, b) => a - b);
    if (s.unlockedOptions) {
      if (!liveOnly) {
        renderOptionsPositions(s);
        renderMarketCards("options-underlying-list", spyOnly, "ifu", "#00ff88", tradingLocked, true, optionStrikeLevels);
        renderOptionsChain(s, tradingLocked);
        renderOptionsTicket(s, tradingLocked);
        renderPerpsPanel(s, tradingLocked);
        renderPerpsHoldings(s);
      }
      syncOptionDteButtons(s);
    }

    const casinoAnchorEl = document.getElementById("casino-hilo-anchor");
    if (casinoAnchorEl) casinoAnchorEl.textContent = String(s.casino?.hiLoAnchor ?? "—");
    const casinoTabPlEl = document.getElementById("casino-tab-pl");
    if (casinoTabPlEl) setPlDisplay(casinoTabPlEl, cumRealized(s, "casino"), "stat-pl");

    // Log — append new entries; rebuild if ring buffer dropped older rows
    const logEl = document.getElementById("log");
    if (s.log.length < renderedLogCount) {
      logEl.innerHTML = "";
      renderedLogCount = 0;
    }
    s.log.slice(renderedLogCount).forEach(({ msg, type, day }) => {
      const div = document.createElement("div");
      div.className = "log-entry " + (type || "");
      div.textContent = `[Day ${day}] ${msg}`;
      logEl.appendChild(div);
    });
    renderedLogCount = s.log.length;
    logEl.scrollTop = logEl.scrollHeight;

    if (liveOnly) {
      patchTradingPanelsLive(s);
    }

    syncAutoAdvanceUi();
    renderGraphs(s);
    scheduleSave();
    if (!liveOnly) enhanceQuantityInputs();
  }

  function renderOverviewOptionsChainPreview(s) {
    const el = document.getElementById("overview-options-chain-preview");
    if (!el) return;
    if (!s.unlockedOptions) {
      el.innerHTML = `<div class="overview-card-breakdown-empty">Locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab.</div>`;
      return;
    }
    const list = s.options || [];
    const dte = normalizeOptionMarketDte(s.optionMarketDte);
    if (!list.length) {
      el.innerHTML = `<div class="overview-card-breakdown-empty">No listed options.</div>`;
      return;
    }
    const underlying = (s.indexFunds || []).find(f => f.id === "spy");
    const uPx = underlying?.price ?? 0;
    const grouped = {};
    list.forEach(opt => {
      const key = `${opt.underlyingId}-${opt.strike}`;
      if (!grouped[key]) grouped[key] = { strike: opt.strike, put: null, call: null };
      if (opt.optionType === "put") grouped[key].put = opt;
      if (opt.optionType === "call") grouped[key].call = opt;
    });
    const rows = Object.values(grouped).sort((a, b) => a.strike - b.strike);
    let nearestStrike = rows[0]?.strike ?? 0;
    let bestD = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.strike - uPx);
      if (d < bestD) {
        bestD = d;
        nearestStrike = r.strike;
      }
    }
    const rowHtml = rows
      .map(r => {
        const rowAtm = r.strike === nearestStrike ? " och-row-atm" : "";
        const p = r.put ? `$${r.put.price.toFixed(2)}` : "—";
        const c = r.call ? `$${r.call.price.toFixed(2)}` : "—";
        return `<div class="overview-opt-chain-grid${rowAtm}"><span class="och-p">${p}</span><span class="och-k">${r.strike}</span><span class="och-c">${c}</span></div>`;
      })
      .join("");
    el.innerHTML = `
      <div class="overview-opt-chain-head">Listed chain · DTE ${dte}</div>
      <div class="overview-opt-chain-grid">
        <span class="och-h">Put</span><span class="och-h">Strike</span><span class="och-h">Call</span>
      </div>
      ${rowHtml}
    `;
  }

  function renderOverviewCardBreakdowns(s) {
    function fill(elId, lines, emptyMsg = "No positions.") {
      const el = document.getElementById(elId);
      if (!el) return;
      if (!lines.length) {
        el.innerHTML = `<div class="overview-card-breakdown-empty">${emptyMsg}</div>`;
        return;
      }
      el.innerHTML = lines
        .map(
          ({ label, qty }) =>
            `<div class="overview-card-breakdown-line"><span class="overview-card-breakdown-name">${label}</span><span class="overview-card-breakdown-qty">${qty}</span></div>`
        )
        .join("");
    }

    fill(
      "overview-card-if-breakdown",
      (s.indexFunds || [])
        .filter(a => (a.shares || 0) > 0)
        .map(a => ({ label: a.name, qty: `${a.shares} shares` }))
    );

    const treasuryByTerm = new Map();
    const corpBuckets = new Map();
    for (const b of s.bondHoldings || []) {
      const fv = b.faceValue || 0;
      const y = b.yield || 0;
      if ((b.type || "treasury") === "treasury") {
        const term = b.term || 0;
        const prev = treasuryByTerm.get(term) || { n: 0, face: 0, yieldFaceSum: 0 };
        prev.n += 1;
        prev.face += fv;
        prev.yieldFaceSum += y * fv;
        treasuryByTerm.set(term, prev);
      } else {
        const issuer = b.issuer || "Corporate";
        const key = JSON.stringify([issuer, b.term || 0]);
        const prev = corpBuckets.get(key) || { n: 0, face: 0, yieldFaceSum: 0 };
        prev.n += 1;
        prev.face += fv;
        prev.yieldFaceSum += y * fv;
        corpBuckets.set(key, prev);
      }
    }
    const bondLines = [];
    [...treasuryByTerm.entries()]
      .sort((a, b) => a[0] - b[0])
      .forEach(([term, v]) => {
        const avgPct = v.face > 0 ? (v.yieldFaceSum / v.face) * 100 : 0;
        const faceNote = v.n === 1 ? `${fmt(v.face)} face` : `${v.n} bonds · ${fmt(v.face)} face`;
        bondLines.push({
          label: `U.S. Treasury · ${term}yr`,
          qty: `avg ${avgPct.toFixed(2)}% · ${faceNote}`,
        });
      });
    const corpLines = [...corpBuckets.entries()].map(([key, v]) => {
      const [issuer, term] = JSON.parse(key);
      const avgPct = v.face > 0 ? (v.yieldFaceSum / v.face) * 100 : 0;
      const faceNote = v.n === 1 ? `${fmt(v.face)} face` : `${v.n} bonds · ${fmt(v.face)} face`;
      return {
        label: `${issuer} · ${term}yr`,
        qty: `avg ${avgPct.toFixed(2)}% · ${faceNote}`,
      };
    });
    corpLines.sort((a, b) => a.label.localeCompare(b.label));
    bondLines.push(...corpLines);
    const elBondBr = document.getElementById("overview-card-bonds-breakdown");
    if (elBondBr) {
      if (!s.unlockedBonds) {
        elBondBr.innerHTML = `<div class="overview-card-breakdown-empty">Locked — pay ${fmt(UNLOCK_COST_BONDS)} on the Bonds tab to trade.</div>`;
      } else {
        fill("overview-card-bonds-breakdown", bondLines);
      }
    }

    const elStockBr = document.getElementById("overview-card-stocks-breakdown");
    if (elStockBr) {
      if (!s.unlockedStocks) {
        elStockBr.innerHTML = `<div class="overview-card-breakdown-empty">Locked — pay ${fmt(UNLOCK_COST_STOCKS)} on the Stocks tab to trade.</div>`;
      } else {
        elStockBr.innerHTML = overviewHoldingsStyleGridHtml(s.stocks, "shares", "No stocks configured.");
      }
    }
    const elCryptoBr = document.getElementById("overview-card-crypto-breakdown");
    if (elCryptoBr) {
      if (!s.unlockedCrypto) {
        elCryptoBr.innerHTML = `<div class="overview-card-breakdown-empty">Locked — pay ${fmt(UNLOCK_COST_CRYPTOS)} on the Crypto tab to trade.</div>`;
      } else {
        elCryptoBr.innerHTML = overviewHoldingsStyleGridHtml(s.cryptos, "coins", "No crypto configured.");
      }
    }
    const elOptBr = document.getElementById("overview-card-options-breakdown");
    if (elOptBr) {
      if (!s.unlockedOptions) {
        elOptBr.innerHTML = `<div class="overview-card-breakdown-empty">Locked — pay ${fmt(UNLOCK_COST_OPTIONS)} on the Options tab to trade.</div>`;
      } else {
        elOptBr.innerHTML = overviewOptionLotsHoldingsStyleHtml(s, "No options holdings.");
      }
    }
  }

  function overviewHoldingsStyleGridHtml(assets, qtyKey, emptyMsg) {
    const list = assets || [];
    if (!list.length) {
      return `<div class="overview-card-breakdown-empty">${emptyMsg}</div>`;
    }
    const rows = list
      .map(a => {
        const meta = computeAssetHoldingsPl(a, qtyKey);
        if (!meta) return "";
        const mktPxCell = `<span class="yellow">$${(a.price || 0).toFixed(2)}</span>`;
        return `
<div class="asset-holdings-row held-pl-tint" data-pl-dir="${plTintDir(meta.plPct)}" style="--pl-tint:${plTintIntensity(meta.plPct).toFixed(3)}">
	<span class="white">${a.name}</span>
	<span>${meta.qty}</span>
	<span>$${meta.avg.toFixed(2)}</span>
	${mktPxCell}
	<span class="${meta.plCls}">${fmtSigned(meta.pl)}</span>
	<span class="${meta.plCls}">${formatPlPct(meta.plPct)}</span>
</div>`;
      })
      .join("");
    return `
<div class="asset-holdings-header">
	<span>Asset</span>
	<span>Qty</span>
	<span>Avg cost</span>
	<span>Mkt px</span>
	<span>P/L</span>
	<span>P/L %</span>
</div>
${rows}`;
  }

  function overviewOptionLotsHoldingsStyleHtml(s, emptyMsg) {
    const lots = [...openOptionHoldings(s)].sort(
      (a, b) => (a.purchaseDay - b.purchaseDay) || (a.expiryDay - b.expiryDay) || String(a.id).localeCompare(String(b.id))
    );
    if (!lots.length) {
      return `<div class="overview-card-breakdown-empty">${emptyMsg}</div>`;
    }
    const rows = lots
      .map(lot => {
        const ctr = lot.contracts || 0;
        const mark = markOptionHolding(s, lot);
        const pl = optionLotUnrealizedPLAtMark(s, lot);
        const plClass = pl > 0 ? "pos" : pl < 0 ? "neg" : "";
        const label = `${lot.name} · $${lot.strike} · exp ${lot.expiryDay}`;
        return `
<div class="asset-holdings-row">
	<span class="white">${label}</span>
	<span>${ctr}</span>
	<span>$${(lot.premiumAtPurchase || 0).toFixed(2)}</span>
	<span class="yellow">$${mark.toFixed(2)}</span>
	<span class="${plClass}">${fmtSigned(pl)}</span>
</div>`;
      })
      .join("");
    return `
<div class="asset-holdings-header">
	<span>Contract</span>
	<span>Qty</span>
	<span>Avg cost</span>
	<span>Mkt px</span>
	<span>P/L</span>
</div>
${rows}`;
  }

  function renderOverviewHoldings(s) {
    const el = document.getElementById("overview-holdings-list");
    if (!el) return;
    const rows = [];

    (s.indexFunds || []).forEach(a => {
      const qty = a.shares || 0;
      if (qty <= 0) return;
      const value = qty * (a.price || 0);
      const pl = value - (a.costBasis || 0);
      rows.push({
        type: "Index",
        name: a.name,
        qty: `${qty} sh`,
        metric: `$${(a.price || 0).toFixed(2)}`,
        value,
        pl,
      });
    });
    (s.stocks || []).forEach(a => {
      if (!s.unlockedStocks) return;
      const qty = a.shares || 0;
      if (qty <= 0) return;
      const value = qty * (a.price || 0);
      const pl = value - (a.costBasis || 0);
      rows.push({
        type: "Stock",
        name: a.name,
        qty: `${qty} sh`,
        metric: `$${(a.price || 0).toFixed(2)}`,
        value,
        pl,
      });
    });
    (s.cryptos || []).forEach(a => {
      if (!s.unlockedCrypto) return;
      const qty = a.coins || 0;
      if (qty <= 0) return;
      const value = qty * (a.price || 0);
      const pl = value - (a.costBasis || 0);
      rows.push({
        type: "Crypto",
        name: a.name,
        qty: `${qty} c`,
        metric: `$${(a.price || 0).toFixed(2)}`,
        value,
        pl,
      });
    });
    openPerpPositions(s).forEach(p => {
      if (!s.unlockedOptions) return;
      const mark = perpMarkPrice(s);
      const pl = perpPositionUnrealizedPL(p, mark);
      rows.push({
        type: "Perp",
        name: p.name,
        qty: `${p.contracts} ctr`,
        metric: `Entry $${(p.entryMark || 0).toFixed(2)} · funding ${fmt(p.fundingPaid || 0)}`,
        value: pl,
        pl,
      });
    });
    openOptionHoldings(s).forEach(lot => {
      if (!s.unlockedOptions) return;
      const mark = markOptionHolding(s, lot);
      const value = lot.contracts * mark;
      const plMark = optionLotUnrealizedPLAtMark(s, lot);
      const plEx = optionLotUnrealizedPLIfExercised(s, lot);
      rows.push({
        type: "Option",
        name: lot.name,
        qty: `${lot.contracts} ctr`,
        metric: `K $${lot.strike} · ${Math.max(0, lot.expiryDay - s.day)} DTE · exp day ${lot.expiryDay} · paid $${lot.premiumAtPurchase.toFixed(2)}`,
        value,
        pl: plMark,
        plExercise: plEx,
      });
    });
    (s.bondHoldings || []).forEach(b => {
      if (!s.unlockedBonds) return;
      rows.push({
        type: "Bond",
        name: (b.type === "corporate" ? `${b.issuer} Bond` : "U.S. Treasury Bond"),
        qty: `${b.term} yr`,
        metric: `${((b.yield || 0) * 100).toFixed(2)}%`,
        value: b.faceValue || 0,
        pl: b.couponAccrued || 0,
      });
    });

    if (!rows.length) {
      el.innerHTML = `<div style="color:#444;font-size:0.8em;">No holdings yet.</div>`;
      return;
    }

    el.innerHTML = `
      <div class="overview-holdings-header">
        <span>Type</span><span>Asset</span><span>Qty / Term</span><span>Price / Yield</span><span>Value</span><span>P/L</span>
      </div>
      ${rows.map(r => {
        const plSell = r.pl;
        const plEx = r.plExercise;
        const plCell = r.type === "Option" && typeof plEx === "number"
          ? `<span class="overview-opt-pl"><span class="${plSell >= 0 ? "pos" : "neg"}">Sell ${fmtSigned(plSell)}</span><span class="options-pos-pl-hint"><span class="${plEx >= 0 ? "pos" : "neg"}">Exercise ${fmtSigned(plEx)}</span></span></span>`
          : `<span class="${plSell >= 0 ? "pos" : "neg"}">${fmtSigned(plSell)}</span>`;
        return `
        <div class="overview-holdings-row">
          <span>${r.type}</span>
          <span class="white">${r.name}</span>
          <span>${r.qty}</span>
          <span>${r.metric}</span>
          <span class="yellow">${fmt(r.value)}</span>
          ${plCell}
        </div>
      `;
      }).join("")}
    `;
  }

  function chartXForDay(day, oldestDay, newestDay, width) {
    if (newestDay <= oldestDay) return 0;
    const t = (day - oldestDay) / (newestDay - oldestDay);
    return Math.max(0, Math.min(width, t * width));
  }

  function drawChartVerticalLines(ctx, verticalLines, oldestDay, newestDay, w, pad, plotH) {
    if (!verticalLines?.length || newestDay <= oldestDay) return;
    verticalLines.forEach(line => {
      const day = line.day;
      if (!Number.isFinite(day) || day < oldestDay || day > newestDay) return;
      const x = chartXForDay(day, oldestDay, newestDay, w);
      ctx.save();
      ctx.strokeStyle = line.color || "rgba(120, 120, 120, 0.45)";
      ctx.lineWidth = line.width ?? 1;
      ctx.setLineDash(Array.isArray(line.dash) ? line.dash : []);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
      ctx.restore();
    });
    ctx.setLineDash([]);
  }

  function netWorthChartDaySpan(s, mode, bucketDays = 10, chartStartDay = 1, recentDays = DAILY_CHART_TRIM_DAYS) {
    const currentDay = s.day;
    const trail = CHART_TRAILING_BLANK_SLOTS;
    const bucket = NET_WORTH_MONTH_BUCKET_OPTIONS.includes(bucketDays) ? bucketDays : 10;
    let oldestDay;
    if (mode === "monthly") {
      oldestDay = clampNetWorthChartStartDay(s, chartStartDay);
    } else {
      const window = Math.max(1, Math.floor(Number(recentDays)) || DAILY_CHART_TRIM_DAYS);
      oldestDay = Math.max(1, currentDay - window + 1);
    }
    const newestDay = currentDay + trail;
    const span = { oldestDay, newestDay, bucketDays: bucket, currentDay };
    if (bucket > 1) {
      span.bucketEndDays = fixedBucketEndDaysInRange(oldestDay, newestDay, bucket, currentDay);
    }
    return span;
  }

  function netWorthChartVerticalLines(s, oldestDay, newestDay) {
    const lines = [];
    const decadeStart = Math.floor((oldestDay - 1) / DAYS_PER_GAME_DECADE);
    const decadeEnd = Math.floor((newestDay - 1) / DAYS_PER_GAME_DECADE);
    for (let d = decadeStart; d <= decadeEnd; d++) {
      const startDay = d * DAYS_PER_GAME_DECADE + 1;
      const endDay = (d + 1) * DAYS_PER_GAME_DECADE;
      if (startDay >= oldestDay && startDay <= newestDay) {
        lines.push({ day: startDay, color: "rgba(140, 140, 140, 0.55)", dash: [5, 5] });
      }
      if (endDay >= oldestDay && endDay <= newestDay) {
        lines.push({ day: endDay, color: "rgba(140, 140, 140, 0.55)", dash: [2, 4] });
      }
    }
    const unlockColors = {
      bonds: "rgba(102, 170, 255, 0.7)",
      stocks: "rgba(102, 170, 255, 0.7)",
      cryptos: "rgba(255, 102, 204, 0.75)",
      options: "rgba(186, 140, 255, 0.75)",
    };
    const unlockDays = { bonds: null, stocks: null, cryptos: null, options: null, ...(s.assetUnlockDays || {}) };
    for (const [key, day] of Object.entries(unlockDays)) {
      if (!Number.isFinite(day) || day < oldestDay || day > newestDay) continue;
      lines.push({ day, color: unlockColors[key] || "rgba(200, 200, 200, 0.65)", dash: [] });
    }
    return lines;
  }

  function drawChart(canvas, data, color, yAxisEl, xAxisEl, xLabels, showInlineYLabels = false, fixedYMin = null, fixedYMax = null, horizontalLevels = null, verticalLines = null, chartDaySpan = null) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    if (!data || !data.length) return;
    const base = data.length === 1 ? [data[0], data[0]] : data;
    const plotData = padChartSeriesTrailing(base);
    if (plotData.length < 2) return;

    const numericValues = plotData.filter(v => v != null && Number.isFinite(v));
    if (!numericValues.length) return;

    const useFixedY = Number.isFinite(fixedYMin) && Number.isFinite(fixedYMax);
    let min = useFixedY ? fixedYMin : Math.min(...numericValues);
    let max = useFixedY ? fixedYMax : Math.max(...numericValues);
    const levelArr = Array.isArray(horizontalLevels) ? horizontalLevels.filter(v => Number.isFinite(v)) : [];
    if (!useFixedY && levelArr.length) {
      min = Math.min(min, ...levelArr);
      max = Math.max(max, ...levelArr);
    }
    if (max - min < 1e-9) max = min + 1e-6;
    const range = max - min;
    const hasX = xLabels && xLabels.length > 0;
    const useDomXAxis = !!(xAxisEl && hasX);
    const canvasXAxisH = hasX && !useDomXAxis ? 16 : 0;
    const pad = { t: 4, b: 4 + canvasXAxisH };
    const plotH = h - pad.t - pad.b;

    // Gridlines (3)
    const gridLevels = [0, 0.5, 1];
    ctx.strokeStyle = "#1e1e1e";
    ctx.lineWidth = 1;
    gridLevels.forEach(level => {
      const y = pad.t + (1 - level) * plotH;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    });

    if (verticalLines?.length && chartDaySpan) {
      drawChartVerticalLines(
        ctx,
        verticalLines,
        chartDaySpan.oldestDay,
        chartDaySpan.newestDay,
        w,
        pad,
        plotH
      );
    }

    // Optional horizontal reference levels (e.g. option strikes on underlying chart)
    if (!useFixedY && levelArr.length) {
      const uniq = [...new Set(levelArr)].sort((a, b) => a - b);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      uniq.forEach(strike => {
        const y = pad.t + (1 - (strike - min) / range) * plotH;
        if (y < pad.t - 1 || y > pad.t + plotH + 1) return;
        ctx.strokeStyle = "rgba(255, 170, 51, 0.55)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    // Line (trailing null slots leave blank days at the right edge)
    let endIdx = plotData.length - 1;
    while (endIdx >= 0 && (plotData[endIdx] == null || !Number.isFinite(plotData[endIdx]))) {
      endIdx -= 1;
    }
    if (endIdx >= 0) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= endIdx; i++) {
        const v = plotData[i];
        if (v == null || !Number.isFinite(v)) continue;
        const x = (plotData.length <= 1 ? 0 : (i / (plotData.length - 1)) * w);
        const y = pad.t + (1 - (v - min) / range) * plotH;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      if (started) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // X-axis baseline along bottom of plot area
    if (hasX) {
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, pad.t + plotH);
      ctx.lineTo(w, pad.t + plotH);
      ctx.stroke();
    }

    // Inline y labels for sparkline-like charts
    if (showInlineYLabels || !yAxisEl) {
      const fmtCompact = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);
      const labelMax = max;
      const labelMin = min;
      const minLabelY = canvasXAxisH ? pad.t + plotH - 4 : h - 4;
      ctx.fillStyle = "#666";
      ctx.font = CHART_CANVAS_FONT;
      ctx.textAlign = "right";
      ctx.fillText(fmtCompact(labelMax), Math.max(22, w - 4), 14);
      ctx.fillText(fmtCompact(labelMin), Math.max(22, w - 4), minLabelY);
      ctx.textAlign = "left";
    }

    // Y axis labels
    if (yAxisEl) {
      const fmtPrice = v => v >= 1000 ? "$" + (v/1000).toFixed(1) + "k" : "$" + v.toFixed(0);
      const labelMax = max;
      const labelMin = min;
      yAxisEl.innerHTML = `
        <span>${fmtPrice(labelMax)}</span>
<span>${fmtPrice((labelMin + labelMax) / 2)}</span>
<span>${fmtPrice(labelMin)}</span>`;
    }

    // X axis labels: dedicated DOM row under chart, or inside canvas for sparks
    if (hasX) {
      if (useDomXAxis) {
        xAxisEl.innerHTML = xLabels.map(l => `<span>${l}</span>`).join("");
      } else {
        ctx.fillStyle = "#888";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const n = xLabels.length;
        xLabels.forEach((lab, i) => {
          const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
          const labelY = pad.t + plotH + canvasXAxisH / 2;
          ctx.fillText(lab, x, labelY);
        });
      }
    }
  }

  function renderNetWorthStackLegend(currentStack) {
    const el = document.getElementById("nw-stack-legend");
    if (!el) return;
    el.innerHTML = NET_WORTH_STACK_LAYERS.map(layer => {
      const val = currentStack?.[layer.key] ?? 0;
      return `<span class="nw-stack-legend-item"><span class="nw-stack-legend-swatch" style="background:${layer.color}"></span>${layer.label} ${fmt(val)}</span>`;
    }).join("");
  }

  function holdingsPieSlices(stack) {
    return NET_WORTH_STACK_LAYERS
      .map(layer => ({ ...layer, value: Math.max(0, stack?.[layer.key] ?? 0) }))
      .filter(slice => slice.value > 0);
  }

  function renderHoldingsPieLegend(stack) {
    const el = document.getElementById("overview-holdings-pie-legend");
    if (!el) return;
    const slices = holdingsPieSlices(stack);
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (!total || !slices.length) {
      el.innerHTML = `<span class="holdings-pie-legend-empty">No holdings to display.</span>`;
      return;
    }
    el.innerHTML = slices.map(slice => {
      const pct = (slice.value / total) * 100;
      const pctText = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
      return `<span class="nw-stack-legend-item"><span class="nw-stack-legend-swatch" style="background:${slice.color}"></span>${slice.label} ${pctText}% · ${fmt(slice.value)}</span>`;
    }).join("");
  }

  function drawHoldingsPieChart(canvas, stack) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const slices = holdingsPieSlices(stack);
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 6;

    if (total <= 0 || !slices.length) {
      ctx.fillStyle = "#222";
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#555";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No holdings", cx, cy);
      return;
    }

    let startAngle = -Math.PI / 2;
    for (const slice of slices) {
      const sweep = (slice.value / total) * Math.PI * 2;
      const endAngle = startAngle + sweep;
      ctx.fillStyle = slice.color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fill();
      startAngle = endAngle;
    }

    startAngle = -Math.PI / 2;
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 2;
    for (const slice of slices) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(startAngle) * radius, cy + Math.sin(startAngle) * radius);
      ctx.stroke();
      startAngle += (slice.value / total) * Math.PI * 2;
    }
  }

  function drawStackedNetWorthChart(canvas, source, yMax, xAxisEl, xLabels, verticalLines, chartDaySpan) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const view = netWorthHistoryView(source);
    if (!view.stackDaily.length && !view.stackBuckets.length) return;

    let plotData;
    let bucketEndDays = chartDaySpan?.bucketEndDays;
    if (chartDaySpan?.bucketDays > 1) {
      const ends = bucketEndDays?.length
        ? bucketEndDays
        : fixedBucketEndDaysInRange(
            chartDaySpan.oldestDay,
            chartDaySpan.newestDay,
            chartDaySpan.bucketDays,
            chartDaySpan.currentDay ?? chartDaySpan.newestDay
          );
      const padded = padFixedBucketsToNewestDay(
        bucketStackSnapshotsAtFixedDays(source, ends),
        ends,
        chartDaySpan.newestDay,
        chartDaySpan.bucketDays
      );
      plotData = padded.plotData;
      bucketEndDays = padded.bucketEndDays;
    } else if (chartDaySpan) {
      plotData = expandStackHistoryToDaySpanFromState(source, chartDaySpan);
    } else {
      const raw = view.stackDaily;
      plotData = padStackHistoryTrailing(raw.length === 1 ? [raw[0], raw[0]] : raw);
    }
    if (!plotData?.length || plotData.length < 2) return;

    let endIdx = plotData.length - 1;
    while (endIdx >= 0) {
      const t = stackSnapshotTotal(plotData[endIdx]);
      if (plotData[endIdx] != null && Number.isFinite(t)) break;
      endIdx -= 1;
    }
    if (endIdx < 0) return;

    const min = 0;
    const max = Number.isFinite(yMax) ? yMax : 1;
    const range = Math.max(1e-6, max - min);
    const hasX = xLabels && xLabels.length > 0;
    const useDomXAxis = !!(xAxisEl && hasX);
    const canvasXAxisH = hasX && !useDomXAxis ? 16 : 0;
    const pad = { t: 4, b: 4 + canvasXAxisH };
    const plotH = h - pad.t - pad.b;

    const yForValue = v => pad.t + (1 - (v - min) / range) * plotH;
    const xForPoint = i => {
      if (chartDaySpan) {
        const bucketDays = chartDaySpan.bucketDays || 1;
        let day;
        if (bucketDays > 1 && bucketEndDays?.length) {
          day = bucketEndDays[Math.min(i, bucketEndDays.length - 1)];
        } else {
          day = chartDaySpan.oldestDay + i;
        }
        return chartXForDay(day, chartDaySpan.oldestDay, chartDaySpan.newestDay, w);
      }
      return plotData.length <= 1 ? 0 : (i / (plotData.length - 1)) * w;
    };

    ctx.strokeStyle = "#1e1e1e";
    ctx.lineWidth = 1;
    [0, 0.5, 1].forEach(level => {
      const y = pad.t + (1 - level) * plotH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    });

    if (verticalLines?.length && chartDaySpan) {
      drawChartVerticalLines(ctx, verticalLines, chartDaySpan.oldestDay, chartDaySpan.newestDay, w, pad, plotH);
    }

    const cumulativeBottom = (snap, throughLayerIdx) => {
      let sum = 0;
      for (let li = 0; li < throughLayerIdx; li++) {
        sum += snap[NET_WORTH_STACK_LAYERS[li].key] || 0;
      }
      return sum;
    };

    NET_WORTH_STACK_LAYERS.forEach((layer, layerIdx) => {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= endIdx; i++) {
        const snap = plotData[i];
        if (!snap) continue;
        const bottom = cumulativeBottom(snap, layerIdx);
        const top = bottom + (snap[layer.key] || 0);
        const x = xForPoint(i);
        const yTop = yForValue(top);
        if (!started) {
          ctx.moveTo(x, yTop);
          started = true;
        } else {
          ctx.lineTo(x, yTop);
        }
      }
      for (let i = endIdx; i >= 0; i--) {
        const snap = plotData[i];
        if (!snap) continue;
        const bottom = cumulativeBottom(snap, layerIdx);
        const x = xForPoint(i);
        ctx.lineTo(x, yForValue(bottom));
      }
      if (!started) return;
      ctx.closePath();
      ctx.fillStyle = layer.color + "b3";
      ctx.fill();
    });

    // Total net worth outline
    ctx.beginPath();
    let outlineStarted = false;
    for (let i = 0; i <= endIdx; i++) {
      const snap = plotData[i];
      if (!snap) continue;
      const total = stackSnapshotTotal(snap);
      if (!Number.isFinite(total)) continue;
      const x = xForPoint(i);
      const y = yForValue(total);
      if (!outlineStarted) {
        ctx.moveTo(x, y);
        outlineStarted = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (outlineStarted) {
      ctx.strokeStyle = "#ffcc00";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    if (hasX) {
      ctx.strokeStyle = "#3a3a3a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, pad.t + plotH);
      ctx.lineTo(w, pad.t + plotH);
      ctx.stroke();
    }

    const fmtCompact = v => v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toFixed(0);
    const minLabelY = canvasXAxisH ? pad.t + plotH - 4 : h - 4;
    ctx.fillStyle = "#666";
    ctx.font = CHART_CANVAS_FONT;
    ctx.textAlign = "right";
    ctx.fillText(fmtCompact(max), Math.max(22, w - 4), 14);
    ctx.fillText(fmtCompact(min), Math.max(22, w - 4), minLabelY);
    ctx.textAlign = "left";

    if (hasX) {
      if (useDomXAxis) {
        xAxisEl.innerHTML = xLabels.map(l => `<span>${l}</span>`).join("");
      } else {
        ctx.fillStyle = "#888";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const n = xLabels.length;
        xLabels.forEach((lab, i) => {
          const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
          const labelY = pad.t + plotH + canvasXAxisH / 2;
          ctx.fillText(lab, x, labelY);
        });
      }
    }
  }

function drawMultiplayerNetWorthOverlays(canvas, chartDaySpan, yMax, bucketEndDays) {
	if (!canvas || !chartDaySpan || !isMultiplayer()) return;
	const rows = mpLeaderboardOverlayRows();
	if (!rows.length) return;

	const ctx = canvas.getContext("2d");
	const w = canvas.clientWidth;
	const h = canvas.clientHeight;
	if (!w || !h) return;

	const min = 0;
	const max = Number.isFinite(yMax) ? yMax : 1;
	const pad = { t: 4, b: 4 };
	const plotH = h - pad.t - pad.b;
	const yForValue = v => pad.t + (1 - (v - min) / Math.max(1e-6, max - min)) * plotH;
	const xForPoint = (i, plotData) => {
		const bucketDays = chartDaySpan.bucketDays || 1;
		let day;
		if (bucketDays > 1 && bucketEndDays?.length) {
			day = bucketEndDays[Math.min(i, bucketEndDays.length - 1)];
		} else {
			day = chartDaySpan.oldestDay + i;
		}
		return chartXForDay(day, chartDaySpan.oldestDay, chartDaySpan.newestDay, w);
	};

	rows.forEach((row, rowIdx) => {
		const plotData = netWorthHistoryPlotSeries(row, chartDaySpan, bucketEndDays);
		if (!plotData?.length || plotData.length < 2) return;

		let endIdx = plotData.length - 1;
		while (endIdx >= 0 && (plotData[endIdx] == null || !Number.isFinite(plotData[endIdx]))) {
			endIdx -= 1;
		}
		if (endIdx < 0) return;

		ctx.beginPath();
		let started = false;
		for (let i = 0; i <= endIdx; i++) {
			const v = plotData[i];
			if (v == null || !Number.isFinite(v)) continue;
			const x = xForPoint(i, plotData);
			const y = yForValue(v);
			if (!started) {
				ctx.moveTo(x, y);
				started = true;
			} else {
				ctx.lineTo(x, y);
			}
		}
		if (started) {
			ctx.strokeStyle = mpOverlayColorForIndex(rowIdx);
			ctx.lineWidth = 1.5;
			ctx.setLineDash([4, 3]);
			ctx.stroke();
			ctx.setLineDash([]);
		}
	});
}

function renderMpNetWorthOverlayLegend() {
	const el = document.getElementById("mp-nw-overlay-legend");
	if (!el) return;
	const rows = mpLeaderboardOverlayRows();
	if (!isMultiplayer() || rows.length === 0) {
		el.hidden = true;
		el.innerHTML = "";
		return;
	}
	el.hidden = false;
	el.innerHTML = rows.map((row, i) => `
		<span class="mp-nw-overlay-legend-item">
			<span class="mp-nw-overlay-swatch" style="background:${mpOverlayColorForIndex(i)}"></span>
			${row.displayName}
		</span>
	`).join("");
}

function drawYieldCurve(s) {
const canvas = document.getElementById("bonds-yield-curve");
if (!canvas) return;
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;
const w = canvas.clientWidth;
const h = canvas.clientHeight;
if (!w || !h) return;
canvas.width = Math.floor(w * dpr);
canvas.height = Math.floor(h * dpr);
ctx.scale(dpr, dpr);
ctx.clearRect(0, 0, w, h);

const curve = (s && s.yieldCurve && s.yieldCurve.length) ? s.yieldCurve : YIELD_CURVE;
const yields = curve.map(p => p.yield);
const minY = Math.min(...yields) * 0.8;
const maxY = Math.max(...yields) * 1.1;
const range = Math.max(1e-6, maxY - minY);
const pad = { t: 8, b: 8, l: 4, r: 4 };
const pw = w - pad.l - pad.r;
const ph = h - pad.t - pad.b;
const maxTerm = curve[curve.length - 1].term;

// Gridlines
ctx.strokeStyle = "#1e1e1e";
ctx.lineWidth = 1;
[0, 0.5, 1].forEach(level => {
const y = pad.t + ph - level * ph;
ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
});

ctx.strokeStyle = "#3a3a3a";
ctx.beginPath();
ctx.moveTo(pad.l, pad.t + ph);
ctx.lineTo(w - pad.r, pad.t + ph);
ctx.stroke();

// Curve
ctx.beginPath();
curve.forEach((p, i) => {
const x = pad.l + (p.term / maxTerm) * pw;
const y = pad.t + ph - ((p.yield - minY) / range) * ph;
i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
});
ctx.strokeStyle = "#66aaff";
ctx.lineWidth = 2;
ctx.stroke();

// Dots + yield labels on canvas
curve.forEach(p => {
const x = pad.l + (p.term / maxTerm) * pw;
const y = pad.t + ph - ((p.yield - minY) / range) * ph;
ctx.beginPath();
ctx.arc(x, y, 3, 0, Math.PI * 2);
ctx.fillStyle = "#66aaff";
ctx.fill();
ctx.fillStyle = "#66aaff";
ctx.font = CHART_CANVAS_FONT;
ctx.fillText((p.yield * 100).toFixed(1) + "%", x - 12, y - 10);
});

// X axis labels via DOM
const labelsEl = document.getElementById("yield-labels");
if (labelsEl) {
labelsEl.innerHTML = curve.map(p => `<span>${p.term}yr</span>`).join("");
}
}

function updateBondPreview(s) {
const termEl = document.getElementById("bond-term");
const faceEl = document.getElementById("bond-face-value");
if (!termEl || !faceEl) return;
const term = parseInt(termEl.value);
const face = parseFloat(faceEl.value) || 0;
const y = yieldForTerm(s, term);
const yieldEl = document.getElementById("bond-preview-yield");
const incomeEl = document.getElementById("bond-preview-income");
if (yieldEl) yieldEl.textContent = (y * 100).toFixed(2) + "%";
if (incomeEl) incomeEl.textContent = fmt(face * y) + " / yr";
}

function renderBondHoldings(s) {
const el = document.getElementById("bond-holdings-list");
if (!el) return;
const holdings = s.bondHoldings || [];
if (!holdings.length) {
el.innerHTML = `<div style="color:#444;font-size:0.8em;">No bonds held.</div>`;
return;
}
el.innerHTML = `
<div class="bond-holdings-header">
	<span>Face Val</span>
	<span>Term</span>
	<span>Yield</span>
	<span>Matures</span>
	<span>P/L</span>
	<span></span>
	<span></span>
</div>
${holdings.map(b => {
const daysLeft = b.maturityDay - s.day;
const yearsLeft = (daysLeft / 365).toFixed(1);
const maturesYr = Math.ceil(b.maturityDay / 365);
const bondPl = b.couponAccrued || 0;
const bondPlClass = bondPl > 0 ? "pos" : bondPl < 0 ? "neg" : "";
return `
<div class="bond-holdings-row" data-bond-id="${b.id}">
	<span class="pos">${fmt(b.faceValue)}</span>
	<span>${b.term}yr</span>
	<span>${(b.yield * 100).toFixed(2)}%</span>
	<span>Yr ${maturesYr}</span>
	<span class="${bondPlClass}">${fmtSigned(bondPl)}</span>
	<span style="color:#444">${yearsLeft}yr left · ${(b.type || "treasury") === "corporate" ? (b.issuer || "Corporate") : "U.S. Treasury"}</span>
	<button class="btn btn-trade-sell btn-trade-compact"
	  onclick="window._sellBond('${b.id}')">Sell</button>
</div>`;
}).join("")}
`;
}

      function renderCorporateBondMarket(s) {
        syncCorporateBondMarketDom(s);
      }


function renderAssetHoldings(listElId, assets, qtyKey, emptyText) {
const el = document.getElementById(listElId);
if (!el) return;
const holdings = (assets || []).filter(a => (a[qtyKey] || 0) > 0);
if (!holdings.length) {
el.innerHTML = `<div style="color:#444;font-size:0.8em;">${emptyText}</div>`;
return;
}
el.innerHTML = `
<div class="asset-holdings-header">
	<span>Asset</span>
	<span>Qty</span>
	<span>Avg cost</span>
	<span>Mkt px</span>
	<span>P/L</span>
	<span>P/L %</span>
</div>
${holdings.map(a => {
const meta = computeAssetHoldingsPl(a, qtyKey);
if (!meta) return "";
return `
<div class="asset-holdings-row held-pl-tint" data-pl-dir="${plTintDir(meta.plPct)}" style="--pl-tint:${plTintIntensity(meta.plPct).toFixed(3)}">
	<span class="white">${a.name}</span>
	<span>${meta.qty}</span>
	<span>$${meta.avg.toFixed(2)}</span>
	<span class="yellow">$${(a.price || 0).toFixed(2)}</span>
	<span class="${meta.plCls}">${fmtSigned(meta.pl)}</span>
	<span class="${meta.plCls}">${formatPlPct(meta.plPct)}</span>
</div>`;
}).join("")}
`;
}

function marketCardPriceColHtml(unitPrice, qty, history, price, chipsHtml = null, currentDay = state.day) {
	const chips = chipsHtml ?? marketCardReturnChipsHtml(history, price, currentDay);
	return `<div class="market-card__price-col">
				<div class="market-card__price-row">
					<span class="market-card__price">$${unitPrice.toFixed(2)}</span>
					<span class="market-card__order-total" data-mkt-order-total>${formatMarketCardOrderTotal(qty, unitPrice)}</span>
				</div>
				<div class="market-card__chg-row">${chips}</div>
			</div>`;
}

function marketCardHoldingsHtml(prefix, asset) {
	if (prefix === "ifu") return "";
	const qtyKey = prefix === "crypto" ? "coins" : prefix === "stock" || prefix === "if" ? "shares" : null;
	const unit = prefix === "crypto" ? "coins" : prefix === "stock" || prefix === "if" ? "sh" : "";
	if (!qtyKey) return "";
	const meta = computeAssetHoldingsPl(asset, qtyKey);
	if (!meta) {
		return `<div class="market-card__holdings" data-mkt-holdings><span class="market-card__holdings-label">Held</span><span>—</span></div>`;
	}
	const tint = plTintHtml(meta.plPct);
	return `<div class="market-card__holdings${tint.extraClass}" data-mkt-holdings${tint.extraAttrs}>
		<span class="market-card__holdings-label">Held</span>
		<span data-mkt-held-qty>${meta.qty} ${unit}</span>
		<span data-mkt-held-avg>Avg $${meta.avg.toFixed(2)}</span>
		<span data-mkt-held-mkt>${fmt(meta.mkt)}</span>
		<span class="${meta.plCls}" data-mkt-held-pl>${fmtSigned(meta.pl)} (${formatPlPct(meta.plPct)})</span>
	</div>`;
}

function optionsTicketHoldingsHtml(s, optionId) {
	const lots = openOptionHoldings(s).filter(h => h.optionId === optionId);
	const meta = computeOptionsLotsPl(s, lots);
	if (!meta) {
		return `<div class="market-card__holdings" data-mkt-holdings><span class="market-card__holdings-label">Held</span><span>—</span></div>`;
	}
	const tint = plTintHtml(meta.plPct);
	return `<div class="market-card__holdings${tint.extraClass}" data-mkt-holdings${tint.extraAttrs}>
		<span class="market-card__holdings-label">Held</span>
		<span data-mkt-held-qty>${meta.held} ctr</span>
		<span data-mkt-held-avg>Avg $${meta.avg.toFixed(2)}</span>
		<span data-mkt-held-mkt>${fmt(meta.mkt)}</span>
		<span class="${meta.plCls}" data-mkt-held-pl>${fmtSigned(meta.pl)} (${formatPlPct(meta.plPct)})</span>
	</div>`;
}

function patchMarketCardHoldings(card, prefix, asset, s) {
	const block = card.querySelector("[data-mkt-holdings]");
	if (!block) return;
	if (prefix === "options") return;
	const html = marketCardHoldingsHtml(prefix, asset);
	if (!html) return;
	const wrap = document.createElement("div");
	wrap.innerHTML = html;
	const next = wrap.firstElementChild;
	if (next) block.replaceWith(next);
	const meta = marketCardHoldingsPlForAsset(prefix, asset);
	patchMarketCardHeldBorder(card, meta?.plPct ?? null);
}

function tradeBarSupportsBuyMax(prefix) {
	return prefix === "stock" || prefix === "crypto" || prefix === "if" || prefix === "options";
}

function marketCardAutobuyStatusText(s, prefix, asset, cfg) {
	if (!cfg.enabled) return { text: "Off", cls: "muted", title: "Autobuy disabled" };
	const price = asset?.price || 0;
	const cost = cfg.qty * price;
	const unit =
		prefix === "crypto" ? "coin(s)" : prefix === "stock" || prefix === "if" ? "share(s)" : "unit(s)";
	const interval = cfg.everyDays === 1 ? "every day" : `every ${cfg.everyDays} days`;
	let nextNote = "runs on next day advance";
	if (cfg.lastRunDay != null) {
		const until = cfg.everyDays - (s.day - cfg.lastRunDay);
		nextNote = until <= 0 ? "due on next day advance" : `next buy in ${until} day(s)`;
	}
	return {
		text: "On",
		cls: cost > s.cash ? "neg" : "pos",
		title: `${cfg.qty} ${unit} ${interval} · ~${fmt(cost)} · ${nextNote}`,
	};
}

function getMarketCardAutobuyCfg(s, prefix, assetId) {
	const key = marketCardAutobuyKey(prefix, assetId);
	return normalizeMarketCardAutobuy(s.marketCardAutobuy?.[key]);
}

function marketCardShowsAutobuy(prefix) {
	return prefix !== "if" && prefix !== "ifu";
}

function marketCardAutobuyMetaHtml(prefix, assetId, s) {
	if (!marketCardShowsAutobuy(prefix)) return "";
	const cfg = getMarketCardAutobuyCfg(s, prefix, assetId);
	return `
		<div class="market-card__autobuy-meta" onclick="event.stopPropagation()">
			<span class="market-card__autobuy-label">Autobuy</span>
			<label class="if-autobuy-toggle market-card__autobuy-toggle">
				<input type="checkbox" class="if-autobuy-checkbox-input" data-mkt-autobuy-enabled
					aria-label="Autobuy"
					${cfg.enabled ? "checked" : ""}
					onchange="window._onMarketCardAutobuyChange('${prefix}','${assetId}')">
				<span class="if-autobuy-checkbox" aria-hidden="true"></span>
			</label>
			<span class="market-card__autobuy-status muted" data-mkt-autobuy-status></span>
			<div class="market-card__autobuy-days">
				<span class="market-card__autobuy-days-label">Every</span>
				<input type="number" class="amount-input market-card__autobuy-days-input" data-mkt-autobuy-days
					min="1" step="1" value="${cfg.everyDays}"
					oninput="window._onMarketCardAutobuyChange('${prefix}','${assetId}')">
				<span class="market-card__autobuy-days-label">days</span>
			</div>
		</div>`;
}

function patchMarketCardAutobuyStatus(card, prefix, asset, s) {
	if (!marketCardShowsAutobuy(prefix)) return;
	if (!card) return;
	const statusEl = card.querySelector("[data-mkt-autobuy-status]");
	if (!statusEl) return;
	const cfg = getMarketCardAutobuyCfg(s, prefix, asset.id);
	const enabledEl = card.querySelector("[data-mkt-autobuy-enabled]");
	const daysEl = card.querySelector("[data-mkt-autobuy-days]");
	if (enabledEl && document.activeElement !== enabledEl) enabledEl.checked = cfg.enabled;
	if (daysEl && document.activeElement !== daysEl) daysEl.value = String(cfg.everyDays);
	const { text, cls, title } = marketCardAutobuyStatusText(s, prefix, asset, cfg);
	statusEl.textContent = text;
	statusEl.className = `market-card__autobuy-status ${cls}`;
	if (title) statusEl.title = title;
	else statusEl.removeAttribute("title");
}

function applyMarketCardAutobuyFromCard(prefix, assetId) {
	const card = document.querySelector(`[data-mkt-card="${prefix}:${assetId}"]`);
	if (!card) return;
	const enabledEl = card.querySelector("[data-mkt-autobuy-enabled]");
	const daysEl = card.querySelector("[data-mkt-autobuy-days]");
	const amountId = `${prefix}-amount-${assetId}`;
	const prev = getMarketCardAutobuyCfg(state, prefix, assetId);
	const enabled = !!enabledEl?.checked;
	const everyDays = Math.max(1, parseInt(daysEl?.value, 10) || 1);
	const qty = getTradeQtyFromInput(amountId);
	let lastRunDay = prev.lastRunDay;
	if ((!prev.enabled && enabled) || prev.everyDays !== everyDays) {
		lastRunDay = null;
	}
	const key = marketCardAutobuyKey(prefix, assetId);
	state = {
		...state,
		marketCardAutobuy: {
			...(state.marketCardAutobuy || {}),
			[key]: normalizeMarketCardAutobuy({
				enabled,
				everyDays,
				qty,
				lastRunDay,
			}),
		},
	};
	const asset = findMarketCardAsset(prefix, assetId);
	if (asset) patchMarketCardAutobuyStatus(card, prefix, asset, state);
	pushAutobuyConfigToServer();
}

function findMarketCardAsset(prefix, assetId) {
	if (prefix === "if" || prefix === "ifu") {
		return (state.indexFunds || []).find(f => f.id === assetId);
	}
	if (prefix === "stock") return (state.stocks || []).find(st => st.id === assetId);
	if (prefix === "crypto") return (state.cryptos || []).find(c => c.id === assetId);
	return null;
}

function syncMarketCardAutobuyQty(prefix, assetId) {
	const key = marketCardAutobuyKey(prefix, assetId);
	const prev = state.marketCardAutobuy?.[key];
	if (!prev) return;
	const amountId = `${prefix}-amount-${assetId}`;
	const qty = getTradeQtyFromInput(amountId);
	state = {
		...state,
		marketCardAutobuy: {
			...(state.marketCardAutobuy || {}),
			[key]: normalizeMarketCardAutobuy({ ...prev, qty }),
		},
	};
	const asset = findMarketCardAsset(prefix, assetId);
	const card = document.querySelector(`[data-mkt-card="${prefix}:${assetId}"]`);
	if (asset && card) patchMarketCardAutobuyStatus(card, prefix, asset, state);
	if (prev.enabled) pushAutobuyConfigToServer();
}

function syncMarketCardAutobuysFromUi() {
	document.querySelectorAll("[data-mkt-card][data-mkt-amount-id]").forEach(card => {
		const key = card.getAttribute("data-mkt-card");
		if (!key) return;
		const colon = key.indexOf(":");
		if (colon < 0) return;
		const prefix = key.slice(0, colon);
		const assetId = key.slice(colon + 1);
		if (prefix === "ifu" || prefix === "if") return;
		applyMarketCardAutobuyFromCard(prefix, assetId);
	});
}

function isMarketCardAmountInput(amountId) {
	return /^(if|stock|crypto)-amount-/.test(amountId);
}

function marketCardKeyFromAmountId(amountId) {
	const m = amountId.match(/^(if|stock|crypto)-amount-(.+)$/);
	if (!m) return null;
	return { prefix: m[1], assetId: m[2] };
}

function marketCardTradeButtonsHtml(prefix, assetId, isTradeLocked) {
	const lockTitle = isTradeLocked ? ' title="Auto will stop on buy."' : "";
	const buyMax = tradeBarSupportsBuyMax(prefix)
		? `<button type="button" class="btn btn-trade-buy btn-trade-buy-max" onclick="window._buyMaxAsset('${prefix}','${assetId}')"${lockTitle}>Buy max</button>`
		: "";
	return `${buyMax}
			<button type="button" class="btn btn-trade-buy" onclick="window._tradeAsset('${prefix}','buy','${assetId}')"${lockTitle}>Buy</button>
			<button type="button" class="btn btn-trade-sell" onclick="window._tradeAsset('${prefix}','sell','${assetId}')">Sell</button>
			<button type="button" class="btn btn-trade-sell btn-trade-sell-all" onclick="window._sellAllAsset('${prefix}','${assetId}')">Sell all</button>`;
}

function renderMarketCards(listElId, assets, prefix, chartColor, isTradeLocked = false, embedCardChart = true, chartHorizontalLevels = null, marketSelection = null) {
const el = document.getElementById(listElId);
if (!el) return;
const list = assets || [];
if (!list.length) {
el.innerHTML = `<div style="color:#444;font-size:0.8em;">No assets available.</div>`;
return;
}
el.innerHTML = `
<div class="market-grid">
${list.map(a => {
	const amountId = `${prefix}-amount-${a.id}`;
	const qty = Math.max(1, tradeQtyByInputId[amountId] || 1);
	const sparkId = `${prefix}-spark-${a.id}`;
	const chartEl = embedCardChart
		? `<canvas id="${sparkId}" class="spark market-card__chart"></canvas>`
		: "";
	const isSel = marketSelection && a.id === marketSelection.selectedId;
	const cardClasses = `market-card${marketSelection ? " market-card--selectable" : ""}${isSel ? " market-card--selected" : ""}`;
	const cardClick = marketSelection ? ` onclick="window._selectMarketAsset('${prefix}','${a.id}')"` : "";
	const tradeRowStop = marketSelection ? ` onclick="event.stopPropagation()"` : "";
	if (prefix === "ifu") {
		return `
	<div class="${cardClasses}" data-mkt-card="${prefix}:${a.id}"${cardClick}>
		<div class="market-card__title-row">
			<div class="market-card__title-block">
				<div class="market-card__title">${a.name}</div>
				${a.sector ? `<div class="market-card__sector">${a.sector}</div>` : ""}
			</div>
			${marketCardPriceColHtml(a.price, qty, a.history, a.price, null, state.day)}
		</div>
		${chartEl}
	</div>`;
	}
	const holdingsHtml = marketCardHoldingsHtml(prefix, a);
	const hMeta = marketCardHoldingsPlForAsset(prefix, a);
	const borderClass = hMeta ? " market-card--held-border" : "";
	const borderAttrs = hMeta
		? ` data-pl-dir="${plTintDir(hMeta.plPct)}" style="--pl-tint:${plTintIntensity(hMeta.plPct).toFixed(3)}"`
		: "";
	return `
	<div class="${cardClasses}${borderClass}" data-mkt-card="${prefix}:${a.id}" data-mkt-amount-id="${amountId}" data-mkt-unit-price="${a.price}"${borderAttrs}${cardClick}>
		<div class="market-card__title-row">
			<div class="market-card__title-block">
				<div class="market-card__title">${a.name}</div>
				${a.sector ? `<div class="market-card__sector">${a.sector}</div>` : ""}
			</div>
			${marketCardPriceColHtml(a.price, qty, a.history, a.price, null, state.day)}
		</div>
		<div class="market-card__trade-row"${tradeRowStop}>
			<div class="market-card__trade-mid">
			<div class="market-card__trade-actions">
			${marketCardTradeButtonsHtml(prefix, a.id, isTradeLocked)}
			</div>
			<div class="market-card__trade-qty" onclick="event.stopPropagation()">
			<div class="amount-stepper-wrap">
			<div class="amount-stepper">
			<input id="${amountId}" class="amount-input" type="number" min="1" value="${qty}" oninput="window._setAmount('${amountId}', this.value)">
			</div>
			${amountQtyPresetButtonsHtml(amountId)}
			</div>
			${marketCardAutobuyMetaHtml(prefix, a.id, state)}
			${holdingsHtml}
			</div>
			</div>
		</div>
		${chartEl}
	</div>`;
}).join("")}
</div>
`;
if (marketCardShowsAutobuy(prefix)) {
	list.forEach(a => {
		const card = el.querySelector(`[data-mkt-card="${prefix}:${a.id}"]`);
		patchMarketCardAutobuyStatus(card, prefix, a, state);
	});
}
if (embedCardChart) {
const strikeLevels = prefix === "ifu" && Array.isArray(chartHorizontalLevels) ? chartHorizontalLevels : null;
list.forEach(a => {
	const sparkId = `${prefix}-spark-${a.id}`;
	const { series, xLabs } = sparkSeriesAndXLabels(prefix, a, state.day);
	drawChart(
		document.getElementById(sparkId),
		series,
		chartColor,
		null,
		null,
		xLabs,
		true,
		null,
		null,
		strikeLevels
	);
});
} else if (marketSelection) {
	const sel = list.find(x => x.id === marketSelection.selectedId) || list[0];
	if (marketSelection.titleElId) {
		const titleNode = document.getElementById(marketSelection.titleElId);
		if (titleNode) titleNode.textContent = sel.name || "";
	}
	const mPrefix = marketSelection.canvasId === "stock-market-main-chart" ? "stock" : "crypto";
	const yEl = mPrefix === "stock" ? document.getElementById("stock-main-yaxis") : document.getElementById("crypto-main-yaxis");
	const xEl = mPrefix === "stock" ? document.getElementById("stock-main-xaxis") : document.getElementById("crypto-main-xaxis");
	const { series, xLabs } = sparkSeriesAndXLabels(mPrefix, sel, state.day);
	drawChart(
		document.getElementById(marketSelection.canvasId),
		series,
		chartColor,
		yEl,
		xEl,
		xLabs,
		!yEl,
		null,
		null,
		null
	);
}
}

function renderAssetMarket(listElId, assets, qtyKey, prefix, unitLabel, isTradeLocked = false) {
renderMarketCards(listElId, assets, prefix, "#00ff88", isTradeLocked, false);
}

function isAutobuyAmountInput(amountId) {
	return (
		amountId === IF_AUTOBUY_SHARES_INPUT ||
		amountId === IF_AUTOBUY_DAYS_INPUT ||
		amountId === BOND_AUTOBUY_DAYS_INPUT
	);
}

function applyIndexFundAutobuyFromUi() {
	const en = document.getElementById("if-autobuy-enabled");
	const prev = normalizeIndexFundAutobuy(state.indexFundAutobuy);
	const enabled = !!en?.checked;
	const qty = getTradeQtyFromInput(IF_AUTOBUY_SHARES_INPUT);
	const everyDays = getTradeQtyFromInput(IF_AUTOBUY_DAYS_INPUT);
	const assetId = (state.indexFunds || [])[0]?.id || "spy";
	let lastRunDay = prev.lastRunDay;
	if ((!prev.enabled && enabled) || prev.everyDays !== everyDays) {
		lastRunDay = null;
	}
	state = {
		...state,
		indexFundAutobuy: normalizeIndexFundAutobuy({
			enabled,
			qty,
			everyDays,
			assetId,
			lastRunDay,
		}),
	};
	tradeQtyByInputId[IF_AUTOBUY_SHARES_INPUT] = qty;
	tradeQtyByInputId[IF_AUTOBUY_DAYS_INPUT] = everyDays;
	pushAutobuyConfigToServer();
}

function renderIndexFundAutobuySteppers(s) {
	const el = document.getElementById("if-autobuy-steppers");
	if (!el) return;
	const cfg = normalizeIndexFundAutobuy(s.indexFundAutobuy);
	tradeQtyByInputId[IF_AUTOBUY_SHARES_INPUT] = cfg.qty;
	tradeQtyByInputId[IF_AUTOBUY_DAYS_INPUT] = cfg.everyDays;
	el.innerHTML =
		autobuyQtyStepperHtml(IF_AUTOBUY_SHARES_INPUT, "Shares") +
		autobuyQtyStepperHtml(IF_AUTOBUY_DAYS_INPUT, "Days per");
}

function syncIndexFundAutobuyUi(s) {
	const cfg = normalizeIndexFundAutobuy(s.indexFundAutobuy);
	const en = document.getElementById("if-autobuy-enabled");
	const status = document.getElementById("if-autobuy-status");
	if (en && document.activeElement !== en) en.checked = cfg.enabled;
	const sharesEl = document.getElementById(IF_AUTOBUY_SHARES_INPUT);
	const daysEl = document.getElementById(IF_AUTOBUY_DAYS_INPUT);
	if (sharesEl && document.activeElement !== sharesEl) sharesEl.value = String(cfg.qty);
	if (daysEl && document.activeElement !== daysEl) daysEl.value = String(cfg.everyDays);
	if (!status) return;
	const fund = (s.indexFunds || []).find(f => f.id === cfg.assetId);
	if (!cfg.enabled) {
		status.textContent = "Off";
		status.className = "if-autobuy-status muted";
		return;
	}
	const cost = cfg.qty * (fund?.price || 0);
	const interval =
		cfg.everyDays === 1 ? "every day" : `every ${cfg.everyDays} days`;
	let nextNote = "runs on next day advance";
	if (cfg.lastRunDay != null) {
		const until = cfg.everyDays - (s.day - cfg.lastRunDay);
		nextNote = until <= 0 ? "due on next day advance" : `next buy in ${until} day(s)`;
	}
	status.textContent = `${cfg.qty} share(s) ${interval} · ~${fmt(cost)} per buy · ${nextNote}`;
	status.className = cost > s.cash ? "if-autobuy-status neg" : "if-autobuy-status pos";
}

function applyTreasuryBondAutobuyFromUi() {
	const en = document.getElementById("bond-autobuy-enabled");
	const prev = normalizeTreasuryBondAutobuy(state.treasuryBondAutobuy);
	const enabled = !!en?.checked;
	const everyDays = getTradeQtyFromInput(BOND_AUTOBUY_DAYS_INPUT);
	const faceValue = parseFloat(document.getElementById(BOND_AUTOBUY_FACE_INPUT)?.value) || prev.faceValue;
	const term = parseInt(document.getElementById(BOND_AUTOBUY_TERM_INPUT)?.value, 10) || prev.term;
	let lastRunDay = prev.lastRunDay;
	if (
		(!prev.enabled && enabled) ||
		prev.everyDays !== everyDays ||
		prev.faceValue !== faceValue ||
		prev.term !== term
	) {
		lastRunDay = null;
	}
	state = {
		...state,
		treasuryBondAutobuy: normalizeTreasuryBondAutobuy({
			enabled,
			everyDays,
			faceValue,
			term,
			lastRunDay,
		}),
	};
	tradeQtyByInputId[BOND_AUTOBUY_DAYS_INPUT] = everyDays;
	pushAutobuyConfigToServer();
}

function renderTreasuryBondAutobuySteppers(s) {
	const el = document.getElementById("bond-autobuy-steppers");
	if (!el) return;
	const cfg = normalizeTreasuryBondAutobuy(s.treasuryBondAutobuy);
	tradeQtyByInputId[BOND_AUTOBUY_DAYS_INPUT] = cfg.everyDays;
	el.innerHTML =
		treasuryBondAutobuyFaceFieldHtml(cfg.faceValue) +
		treasuryBondAutobuyTermFieldHtml(cfg.term) +
		autobuyQtyStepperHtml(BOND_AUTOBUY_DAYS_INPUT, "Days per");
}

function syncTreasuryBondAutobuyUi(s) {
	const cfg = normalizeTreasuryBondAutobuy(s.treasuryBondAutobuy);
	const en = document.getElementById("bond-autobuy-enabled");
	const status = document.getElementById("bond-autobuy-status");
	if (en && document.activeElement !== en) en.checked = cfg.enabled;
	const faceEl = document.getElementById(BOND_AUTOBUY_FACE_INPUT);
	const termEl = document.getElementById(BOND_AUTOBUY_TERM_INPUT);
	const daysEl = document.getElementById(BOND_AUTOBUY_DAYS_INPUT);
	if (faceEl && document.activeElement !== faceEl) faceEl.value = String(cfg.faceValue);
	if (termEl && document.activeElement !== termEl) termEl.value = String(cfg.term);
	if (daysEl && document.activeElement !== daysEl) daysEl.value = String(cfg.everyDays);
	if (!status) return;
	if (!cfg.enabled) {
		status.textContent = "Off";
		status.className = "if-autobuy-status muted";
		return;
	}
	const cost = cfg.faceValue;
	const y = yieldForTerm(s, cfg.term);
	const interval =
		cfg.everyDays === 1 ? "every day" : `every ${cfg.everyDays} days`;
	let nextNote = "runs on next day advance";
	if (cfg.lastRunDay != null) {
		const until = cfg.everyDays - (s.day - cfg.lastRunDay);
		nextNote = until <= 0 ? "due on next day advance" : `next buy in ${until} day(s)`;
	}
	status.textContent = `${fmt(cfg.faceValue)} ${cfg.term}yr ${interval} · yield ${(y * 100).toFixed(2)}% · ${fmt(cost)} per buy · ${nextNote}`;
	status.className = cost > s.cash ? "if-autobuy-status neg" : "if-autobuy-status pos";
}

function stockBulkOrderTotal(stocks, qty) {
	return (stocks || []).reduce((sum, st) => sum + qty * (st.price || 0), 0);
}

function stockBulkUnitPrice(stocks) {
	return stockBulkOrderTotal(stocks, 1);
}

function patchStockBulkBarPricing(stocks) {
	const bar = document.querySelector("[data-stock-bulk-bar]");
	if (!bar) return;
	const unitPrice = stockBulkUnitPrice(stocks);
	bar.setAttribute("data-mkt-unit-price", String(unitPrice));
	const priceEl = bar.querySelector(".market-card__price");
	if (priceEl) priceEl.textContent = `$${unitPrice.toFixed(2)}`;
	patchMarketCardOrderTotal(bar);
	const sectorEl = bar.querySelector(".market-card__sector");
	if (sectorEl) {
		const qtyEl = document.getElementById(STOCK_BULK_AMOUNT_ID);
		const qty = qtyEl
			? Math.max(1, parseInt(qtyEl.value, 10) || 1)
			: Math.max(1, tradeQtyByInputId[STOCK_BULK_AMOUNT_ID] || 1);
		sectorEl.textContent = `${qty} share(s) each of ${(stocks || []).length} stocks`;
	}
}

function patchStockBulkBarLive(s) {
	const bar = document.querySelector("[data-stock-bulk-bar]");
	if (!bar) return;
	const stocks = s.stocks || [];
	patchStockBulkBarPricing(stocks);
	patchStockBulkReturnChips(stocks, s.day);
}

function renderBankruptStockMemorials(s) {
	const el = document.getElementById("stock-bankrupt-list");
	if (!el) return;
	if (!s.unlockedStocks) {
		el.innerHTML = "";
		return;
	}
	const rows = s.bankruptStockDisplay || [];
	if (!rows.length) {
		el.innerHTML = "";
		return;
	}
	el.innerHTML = `
		<div class="stock-bankrupt-subtitle">Bankrupt / delisted</div>
		<div class="market-grid stock-bankrupt-grid">
		${rows.map(m => `
			<div class="market-card market-card--bankrupt" data-bankrupt-memorial="${m.memorialId}">
				<div class="market-card__title-row">
					<div class="market-card__title-block">
						<div class="market-card__title">${m.name}</div>
						<div class="market-card__sector">${m.sector}</div>
					</div>
					<div class="market-card__price-col">
						<span class="market-card__price market-card__price--dead">—</span>
						<span class="market-card__chg30 muted">—</span>
					</div>
				</div>
				<div class="market-card__trade-row market-card__trade-row--bankrupt">
					<div class="bankrupt-x-overlay" aria-hidden="true"></div>
					<div class="bankrupt-stamp">bankrupt</div>
					<div class="market-card__trade-mid">
						<div class="market-card__trade-actions">
							<button type="button" class="btn btn-trade-buy btn-bankrupt-fake" disabled tabindex="-1">Buy</button>
							<button type="button" class="btn btn-trade-sell btn-bankrupt-fake" disabled tabindex="-1">Sell</button>
						</div>
						<div class="amount-stepper-wrap">
							<div class="amount-stepper">
								<button type="button" class="btn amount-step-btn btn-bankrupt-step" disabled tabindex="-1">-5</button>
								<button type="button" class="btn amount-step-btn btn-bankrupt-step" disabled tabindex="-1">-1</button>
								<input class="amount-input bankrupt-qty-input" type="number" disabled tabindex="-1" value="0">
								<button type="button" class="btn amount-step-btn btn-bankrupt-step" disabled tabindex="-1">+1</button>
								<button type="button" class="btn amount-step-btn btn-bankrupt-step" disabled tabindex="-1">+5</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`).join("")}
		</div>`;
}

function stockBulkTradeBarHtml(stocks, isTradeLocked) {
	const qty = Math.max(1, tradeQtyByInputId[STOCK_BULK_AMOUNT_ID] || 1);
	const lockTitle = isTradeLocked ? ' title="Auto will stop on buy."' : "";
	const stockCount = (stocks || []).length;
	const unitPrice = stockBulkUnitPrice(stocks);
	return `
	<div class="market-card market-card--bulk" data-stock-bulk-bar data-mkt-amount-id="${STOCK_BULK_AMOUNT_ID}" data-mkt-unit-price="${unitPrice}">
		<div class="market-card__title-row">
			<div class="market-card__title-block">
				<div class="market-card__title">All listings</div>
				<div class="market-card__sector">${qty} share(s) each of ${stockCount} stocks</div>
			</div>
			${marketCardPriceColHtml(unitPrice, qty, null, null, stockBulkReturnChipsHtml(stocks, state.day))}
		</div>
		<div class="market-card__trade-row">
			<div class="market-card__trade-mid">
				<div class="market-card__trade-actions">
					<button type="button" class="btn btn-trade-buy"${lockTitle} onclick="window._buyEveryStock()">Buy all</button>
				</div>
				<div class="market-card__trade-qty">
					<div class="amount-stepper-wrap">
						<div class="amount-stepper">
							<input id="${STOCK_BULK_AMOUNT_ID}" class="amount-input" type="number" min="1" step="1" value="${qty}" oninput="window._setAmount('${STOCK_BULK_AMOUNT_ID}', this.value)">
						</div>
						${amountQtyPresetButtonsHtml(STOCK_BULK_AMOUNT_ID)}
					</div>
				</div>
			</div>
		</div>
	</div>`;
}

function renderStockBulkBar(s, isTradeLocked = false) {
	const el = document.getElementById("stock-market-bulk-bar");
	if (!el) return;
	const stocks = s.stocks || [];
	if (!s.unlockedStocks || !stocks.length) {
		el.innerHTML = "";
		return;
	}
	el.innerHTML = stockBulkTradeBarHtml(stocks, isTradeLocked);
}

function renderStockCards(s, isTradeLocked = false) {
const stocks = s.stocks || [];
const panel = document.getElementById("stock-market-chart-panel");
const listEl = document.getElementById("stock-market-list");
const bulkEl = document.getElementById("stock-market-bulk-bar");
const holdEl = document.getElementById("stock-holdings-list");
	if (!s.unlockedStocks) {
	if (panel) panel.style.display = "none";
	if (bulkEl) bulkEl.innerHTML = "";
	if (listEl) {
		listEl.innerHTML = `<div class="asset-unlock-panel">The stock market is closed until you buy access.<br><br>One-time fee: <strong>${fmt(UNLOCK_COST_STOCKS)}</strong><br><button type="button" class="btn primary asset-unlock-panel__btn" onclick="window._unlockStocks()">Unlock stock market</button></div>`;
	}
	const brEl = document.getElementById("stock-bankrupt-list");
	if (brEl) brEl.innerHTML = "";
	if (holdEl) holdEl.innerHTML = `<div style="color:#444;font-size:0.8em;">Unlock the stock market to trade.</div>`;
	selectedStockId = null;
	return;
}
const list = stocks;
if (selectedStockId && !list.some(a => a.id === selectedStockId)) selectedStockId = null;
if (!selectedStockId && list.length) selectedStockId = list[0].id;
if (!list.length) {
	selectedStockId = null;
	if (panel) panel.style.display = "none";
	if (bulkEl) bulkEl.innerHTML = "";
	const ti = document.getElementById("stock-market-chart-title");
	if (ti) ti.textContent = "";
	renderMarketCards("stock-market-list", stocks, "stock", "#66aaff", isTradeLocked, false);
	renderBankruptStockMemorials(s);
	return;
}
if (panel) panel.style.display = "";
renderStockBulkBar(s, isTradeLocked);
renderMarketCards("stock-market-list", stocks, "stock", "#66aaff", isTradeLocked, false, null, {
	selectedId: selectedStockId,
	canvasId: "stock-market-main-chart",
	titleElId: "stock-market-chart-title",
});
renderBankruptStockMemorials(s);
}

function renderCryptoCards(s, isTradeLocked = false) {
const cryptos = s.cryptos || [];
const panel = document.getElementById("crypto-market-chart-panel");
const listEl = document.getElementById("crypto-market-list");
const holdEl = document.getElementById("crypto-holdings-list");
if (!s.unlockedCrypto) {
	if (panel) panel.style.display = "none";
	if (listEl) {
		listEl.innerHTML = `<div class="asset-unlock-panel">The crypto market is closed until you buy access.<br><br>One-time fee: <strong>${fmt(UNLOCK_COST_CRYPTOS)}</strong><br><button type="button" class="btn primary asset-unlock-panel__btn" onclick="window._unlockCrypto()">Unlock crypto market</button></div>`;
	}
	if (holdEl) holdEl.innerHTML = `<div style="color:#444;font-size:0.8em;">Unlock the crypto market to trade.</div>`;
	selectedCryptoId = null;
	return;
}
const list = cryptos;
if (selectedCryptoId && !list.some(a => a.id === selectedCryptoId)) selectedCryptoId = null;
if (!selectedCryptoId && list.length) selectedCryptoId = list[0].id;
if (!list.length) {
	selectedCryptoId = null;
	if (panel) panel.style.display = "none";
	const ti = document.getElementById("crypto-market-chart-title");
	if (ti) ti.textContent = "";
	renderMarketCards("crypto-market-list", cryptos, "crypto", "#ff66cc", isTradeLocked, false);
	return;
}
if (panel) panel.style.display = "";
renderMarketCards("crypto-market-list", cryptos, "crypto", "#ff66cc", isTradeLocked, false, null, {
	selectedId: selectedCryptoId,
	canvasId: "crypto-market-main-chart",
	titleElId: "crypto-market-chart-title",
});
}

      function syncOptionDteButtons(s) {
        const wrap = document.getElementById("options-dte-toggle");
        if (!wrap) return;
        const cur = normalizeOptionMarketDte(s.optionMarketDte);
        wrap.querySelectorAll(".options-dte-btn").forEach(btn => {
          const d = parseInt(btn.getAttribute("data-option-dte"), 10);
          btn.classList.toggle("active", d === cur);
        });
      }

function renderOptionsChain(s, isTradeLocked = false) {
	const el = document.getElementById("options-market-list");
	if (!el) return;
	const list = s.options || [];
	const underlying = (s.indexFunds || []).find(f => f.id === "spy");
	const uPx = underlying?.price ?? 0;
	if (!list.length) {
		el.innerHTML = `<div style="color:#444;font-size:0.8em;">No options available.</div>`;
		return;
	}
	if (selectedOptionId && !list.some(o => o.id === selectedOptionId)) selectedOptionId = null;
	if (!selectedOptionId && list.length) selectedOptionId = list[0].id;

	const grouped = {};
	list.forEach(opt => {
		const key = `${opt.underlyingId}-${opt.strike}`;
		if (!grouped[key]) grouped[key] = { strike: opt.strike, put: null, call: null };
		if (opt.optionType === "put") grouped[key].put = opt;
		if (opt.optionType === "call") grouped[key].call = opt;
	});
	const rows = Object.values(grouped).sort((a, b) => a.strike - b.strike);
	let nearestStrike = rows[0]?.strike ?? 0;
	let bestD = Infinity;
	for (const r of rows) {
		const d = Math.abs(r.strike - uPx);
		if (d < bestD) {
			bestD = d;
			nearestStrike = r.strike;
		}
	}

	const sideCell = opt => {
		if (!opt) {
			return `<div class="options-side options-side-empty" aria-hidden="true"><span class="options-side-muted">—</span></div>`;
		}
		const name = opt.name;
		const selectedClass = opt.id === selectedOptionId ? " selected" : "";
		const dte = normalizeOptionMarketDte(s.optionMarketDte);
		return `
          <div class="options-side${selectedClass}" data-option-id="${opt.id}">
            <div class="options-side-head">
              <div class="options-side-name-block">
                <div class="options-leg-title-row">
                  <span class="white">${name}</span>
                  <span class="options-side-dte">DTE ${dte}</span>
                </div>
              </div>
              <div class="options-side-price-col">
                <span class="prem-val">$${opt.price.toFixed(2)}</span>
              </div>
            </div>
          </div>`;
	};

	el.innerHTML = `
      <div class="options-chain-wrap">
        <div class="options-chain-header">
          <span style="text-align:center;">Puts</span>
          <span class="options-strike">Strike</span>
          <span style="text-align:center;">Calls</span>
        </div>
        ${rows
		.map(r => {
			const rowAtm = r.strike === nearestStrike ? " options-chain-row-atm" : "";
			return `
          <div class="options-chain-row${rowAtm}">
            ${sideCell(r.put)}
            <span class="options-strike">${r.strike}</span>
            ${sideCell(r.call)}
          </div>`;
		})
		.join("")}
      </div>`;

	const selectOptionById = id => {
		selectedOptionId = id;
		render(state);
	};
	el.querySelectorAll(".options-side[data-option-id]").forEach(side => {
		side.addEventListener("click", () => {
			const optionId = side.getAttribute("data-option-id");
			if (optionId) selectOptionById(optionId);
		});
	});
}

      function formatLastOptionRealizedHtml(s) {
        const lr = s.lastOptionRealized;
        if (!lr || typeof lr.pl !== "number") return "";
        const verb = lr.kind === "exercise" ? "Exercise (intrinsic)" : "Sell (mark)";
        const cls = lr.pl >= 0 ? "pos" : "neg";
        const plStr = (lr.pl >= 0 ? "+" : "−") + "$" + Math.abs(lr.pl).toFixed(2);
        const lab = String(lr.label || "").replace(/</g, "");
        return `<div class="options-last-realized"><span class="k">Last realized</span><span class="v ${cls}">${verb} · ${lr.contracts} ctr · ${lab} — P/L ${plStr}</span></div>`;
      }

      function renderOptionsTicket(s, isTradeLocked = false) {
        const el = document.getElementById("options-ticket");
        if (!el) return;
        const lrHtml = formatLastOptionRealizedHtml(s);
        const options = s.options || [];
        if (!options.length) {
          el.innerHTML = lrHtml + `<div style="color:#444;font-size:0.8em;">No options available.</div>`;
          return;
        }
        const selected = options.find(o => o.id === selectedOptionId) || options[0];
        selectedOptionId = selected.id;
        const qtyInputId = `options-amount-${selected.id}`;
        const qty = Math.max(1, tradeQtyByInputId[qtyInputId] || 1);
        const underlying = (s.indexFunds || []).find(f => f.id === selected.underlyingId);

        el.innerHTML = `
          <div class="options-ticket-contract-head">
            <span class="options-ticket-contract-title">${selected.name} (${selected.optionType.toUpperCase()})</span>
            <div class="options-ticket-price-col">
              <div class="options-ticket-price-row">
                <span class="options-ticket-premium-ticker" data-ticket-field="premium-ticker">$${selected.price.toFixed(2)}</span>
                <span class="options-ticket-order-total" data-ticket-field="order-total">${formatMarketCardOrderTotal(qty, selected.price)}</span>
              </div>
              <div class="options-ticket-chg-row">${marketCardReturnChipsHtml(selected.history, selected.price, s.day)}</div>
            </div>
          </div>
          <div class="options-ticket-grid">
            <div class="options-ticket-item"><span class="k">Underlying</span><span class="v" data-ticket-field="underlying">${underlying?.name || selected.underlyingId} @ $${(underlying?.price || 0).toFixed(2)}</span></div>
            <div class="options-ticket-item"><span class="k">Strike</span><span class="v">$${selected.strike}</span></div>
            <div class="options-ticket-item"><span class="k">Listed tenor</span><span class="v">${normalizeOptionMarketDte(s.optionMarketDte)} days (new buys)</span></div>
          </div>
          <div class="options-ticket-trade">
            <span class="k">Quantity</span>
            <div class="options-ticket-qty-mid">
            <div class="options-ticket-actions options-ticket-actions--stack">
              ${marketCardTradeButtonsHtml("options", selected.id, isTradeLocked)}
            </div>
            <div class="options-ticket-qty-block">
            <div class="amount-stepper-wrap">
            <div class="amount-stepper options-ticket-stepper">
              <input id="${qtyInputId}" class="amount-input" type="number" min="1" value="${qty}" oninput="window._setAmount('${qtyInputId}', this.value)">
            </div>
            ${amountQtyPresetButtonsHtml(qtyInputId)}
            </div>
            ${optionsTicketHoldingsHtml(s, selected.id)}
            </div>
            </div>
          </div>
          ${lrHtml}
        `;

        const selectOptionById = id => {
          selectedOptionId = id;
          render(state);
        };
        const selectedId = selected.id;
        const qtyInput = document.getElementById(qtyInputId);
        if (qtyInput) {
          qtyInput.addEventListener("focus", () => selectOptionById(selectedId));
          qtyInput.addEventListener("click", () => selectOptionById(selectedId));
        }
        const ticketPanel = document.querySelector(".options-ticket-panel");
        const openLots = openOptionHoldings(s).filter(h => h.optionId === selected.id);
        patchMarketCardHeldBorder(ticketPanel, computeOptionsLotsPl(s, openLots)?.plPct ?? null);
      }

      function renderPerpsPanel(s, isTradeLocked = false) {
        const el = document.getElementById("perps-market-panel");
        if (!el) return;
        const mark = perpMarkPrice(s);
        const u = (s.indexFunds || []).find(f => f.id === "spy")?.price ?? 0;
        const fundingAnn = perpFundingRateAnnual(s) * 100;
        const basisBps = s.perpBasisBps ?? 0;
        const qty = Math.max(1, tradeQtyByInputId[PERP_QTY_INPUT] || 1);
        const openPrem = perpOpenPremiumTotal(qty, mark);
        const lockTitle = isTradeLocked ? ' title="Auto will stop on buy."' : "";
        el.innerHTML = `
          <div class="perps-stats-grid">
            <div><div class="k">Perp mark</div><div class="v" data-perp-field="mark">$${mark.toFixed(2)}</div></div>
            <div><div class="k">Index</div><div class="v" data-perp-field="index">$${u.toFixed(2)}</div></div>
            <div><div class="k">Funding (ann.)</div><div class="v funding" data-perp-field="funding">${fundingAnn >= 0 ? "+" : ""}${fundingAnn.toFixed(2)}% · longs pay</div></div>
            <div><div class="k">Open premium</div><div class="v" data-perp-field="open-prem">${fmt(openPrem)} / ${qty} ctr</div></div>
            <div><div class="k">Basis</div><div class="v" data-perp-field="basis">${basisBps >= 0 ? "+" : ""}${basisBps} bps</div></div>
          </div>
          <div class="perps-trade-row">
            <div class="amount-stepper-wrap">
              <div class="amount-stepper">
                <input id="${PERP_QTY_INPUT}" class="amount-input" type="number" min="1" value="${qty}" oninput="window._setAmount('${PERP_QTY_INPUT}', this.value)">
              </div>
              ${amountQtyPresetButtonsHtml(PERP_QTY_INPUT)}
            </div>
            <div class="perps-side-actions">
              <button type="button" class="btn btn-long"${lockTitle} onclick="window._openPerp('long')">Open long</button>
              <button type="button" class="btn btn-short"${lockTitle} onclick="window._openPerp('short')">Open short</button>
              <button type="button" class="btn" onclick="window._closePerp('long')">Close long</button>
              <button type="button" class="btn" onclick="window._closePerp('short')">Close short</button>
            </div>
          </div>
          <div style="font-size:0.72em;color:#555;">Open costs a premium (10 bps of notional, $25/contract min). Funding settles daily; unpaid funding liquidates the lot at mark. P/L @ mark is price only; P/L incl. funding adds settled funding cash flow.</div>
        `;
      }

      function renderPerpsHoldings(s) {
        const el = document.getElementById("perps-holdings-list");
        if (!el) return;
        const positions = openPerpPositions(s);
        if (!positions.length) {
          el.innerHTML = `<div class="perps-holdings-empty">No perp positions.</div>`;
          return;
        }
        const mark = perpMarkPrice(s);
        el.innerHTML = `
          <div class="options-pos-header">
            <span>Contract</span><span>Side</span><span>Entry</span><span>Mark</span><span>Qty</span><span>P/L @ mark</span><span>Funding paid</span><span>P/L incl. funding</span><span>Actions</span>
          </div>
          ${positions.map(p => {
            const pl = perpPositionUnrealizedPL(p, mark);
            const plCls = pl >= 0 ? "pos" : "neg";
            const funding = p.fundingPaid || 0;
            const totalPl = perpPositionTotalPL(p, mark);
            const totalCls = totalPl >= 0 ? "pos" : "neg";
            return `
              <div class="options-pos-row" data-perp-lot="${p.id}">
                <span class="white">${p.name}</span>
                <span>${p.side.toUpperCase()}</span>
                <span>$${(p.entryMark || 0).toFixed(2)}</span>
                <span>$${mark.toFixed(2)}</span>
                <span>${p.contracts}</span>
                <span class="${plCls}">${fmtSigned(pl)}</span>
                <span>${fmt(funding)}</span>
                <span class="${totalCls}">${fmtSigned(totalPl)}</span>
                <div class="options-pos-actions">
                  <button type="button" class="btn btn-trade-sell btn-trade-compact" onclick="window._closePerpLot('${p.id}')">Close</button>
                  <button type="button" class="btn btn-trade-sell btn-trade-compact btn-trade-sell-all" onclick="window._closeAllPerpLot('${p.id}')">Close all</button>
                </div>
              </div>
            `;
          }).join("")}
        `;
      }


      function renderOptionsPositions(s) {
        const el = document.getElementById("options-holdings-list");
        if (!el) return;
        const holdings = openOptionHoldings(s);
        if (!holdings.length) {
          el.innerHTML = `<div style="color:#444;font-size:0.8em;">No options holdings.</div>`;
          return;
        }
        el.innerHTML = `
          <div class="options-pos-header">
            <span>Contract</span><span>Type</span><span>Strike</span><span>Exp</span><span>DTE</span><span>Paid</span><span>Qty</span><span>Mark</span><span>P/L @ mark</span><span>P/L exercise</span><span>Actions</span>
          </div>
          ${holdings.map(h => {
            const mark = markOptionHolding(s, h);
            const plSell = optionLotUnrealizedPLAtMark(s, h);
            const plEx = optionLotUnrealizedPLIfExercised(s, h);
            const sellClass = plSell >= 0 ? "pos" : "neg";
            const exClass = plEx >= 0 ? "pos" : "neg";
            const dte = Math.max(0, h.expiryDay - s.day);
            return `
              <div class="options-pos-row" data-opt-lot="${h.id}">
                <span class="white">${h.name}</span>
                <span>${h.optionType.toUpperCase()}</span>
                <span>$${h.strike}</span>
                <span>${h.expiryDay}</span>
                <span>${dte}</span>
                <span>$${h.premiumAtPurchase.toFixed(2)}</span>
                <span>${h.contracts}</span>
                <span>$${mark.toFixed(2)}</span>
                <span class="${sellClass}" title="If you sell the full lot at the mark">${fmtSigned(plSell)}</span>
                <span class="${exClass}" title="If you exercised the full lot at intrinsic (cash settle)">${fmtSigned(plEx)}</span>
                <div class="options-pos-actions">
                  <button type="button" class="btn btn-trade-buy btn-trade-compact" title="Settle 1 contract at intrinsic (cash)" onclick="window._exerciseOptionLot('${h.id}')">Exercise</button>
                  <button type="button" class="btn btn-trade-sell btn-trade-compact" title="Sell at mark (uses ticket qty)" onclick="window._sellOptionLot('${h.id}')">Sell</button>
                  <button type="button" class="btn btn-trade-sell btn-trade-compact btn-trade-sell-all" title="Sell entire lot at mark" onclick="window._sellAllOptionLot('${h.id}')">Sell all</button>
                </div>
              </div>
            `;
          }).join("")}
        `;
      }

window._playCasinoHiLo = (guessHi) => {
	const betEl = document.getElementById("casino-hilo-bet");
	const bet = betEl ? parseFloat(betEl.value) : 50;
	dispatchGameAction("playCasinoHiLo", { bet, guessHi }, s => playCasinoHiLo(s, bet, guessHi, params));
};

window._unlockBonds = () => {
	dispatchGameAction("unlockBonds", {}, unlockBonds);
};
window._unlockStocks = () => {
	dispatchGameAction("unlockStocks", {}, unlockStocks);
};
window._unlockCrypto = () => {
	dispatchGameAction("unlockCrypto", {}, unlockCrypto);
};
window._unlockOptions = () => {
	dispatchGameAction("unlockOptions", {}, unlockOptions);
};
window._sellBond = (id) => {
	dispatchGameAction("sellBondEarly", { id }, s => sellBondEarly(s, id));
};
      window._buyCorporateBond = (offerId, qty = 1) => {
        dispatchGameAction("buyCorporateBond", { offerId, qty }, s => buyCorporateBond(s, offerId, qty));
      };

document.getElementById("corp-bond-market-list")?.addEventListener("click", (e) => {
	const btn = e.target.closest("[data-corp-buy]");
	if (!btn || btn.disabled) return;
	const offerId = btn.dataset.offerId;
	if (!offerId) return;
	const qty = parseInt(btn.dataset.qty, 10) || 1;
	dispatchGameAction("buyCorporateBond", { offerId, qty }, s => buyCorporateBond(s, offerId, qty));
});

function getTradeQtyFromInput(amountId) {
	const qtyEl = document.getElementById(amountId);
	return Math.max(1, parseInt(qtyEl?.value, 10) || tradeQtyByInputId[amountId] || 1);
}

function assetPriceForTrade(prefix, assetId) {
	if (prefix === "crypto") {
		return (state.cryptos || []).find(c => c.id === assetId)?.price || 0;
	}
	if (prefix === "stock") {
		return (state.stocks || []).find(st => st.id === assetId)?.price || 0;
	}
	if (prefix === "if" || prefix === "ifu") {
		return (state.indexFunds || []).find(f => f.id === assetId)?.price || 0;
	}
	if (prefix === "options") {
		return (state.options || []).find(o => o.id === assetId)?.price || 0;
	}
	return 0;
}

function maxBuyQtyForAsset(prefix, assetId) {
	const price = assetPriceForTrade(prefix, assetId);
	if (!(price > 0)) return 0;
	return Math.floor((state.cash || 0) / price);
}

function ownedQtyForAsset(prefix, assetId) {
	if (prefix === "crypto") {
		return (state.cryptos || []).find(c => c.id === assetId)?.coins || 0;
	}
	if (prefix === "stock") {
		return (state.stocks || []).find(st => st.id === assetId)?.shares || 0;
	}
	if (prefix === "if" || prefix === "ifu") {
		return (state.indexFunds || []).find(f => f.id === assetId)?.shares || 0;
	}
	if (prefix === "options") {
		return openOptionHoldings(state)
			.filter(h => h.optionId === assetId)
			.reduce((sum, h) => sum + (h.contracts || 0), 0);
	}
	return 0;
}

function executeTradeAsset(prefix, mode, id, qty) {
	if (prefix === "if" || prefix === "ifu") {
		const action = mode === "buy" ? "buyIndexFund" : "sellIndexFund";
		dispatchGameAction(action, { assetId: id, qty }, s =>
			mode === "buy" ? buyIndexFund(s, id, qty) : sellIndexFund(s, id, qty));
	} else if (prefix === "crypto") {
		const action = mode === "buy" ? "buyCrypto" : "sellCrypto";
		dispatchGameAction(action, { assetId: id, qty }, s =>
			mode === "buy" ? buyCrypto(s, id, qty) : sellCrypto(s, id, qty));
	} else if (prefix === "stock") {
		const action = mode === "buy" ? "buyStock" : "sellStock";
		dispatchGameAction(action, { assetId: id, qty }, s =>
			mode === "buy" ? buyStock(s, id, qty) : sellStock(s, id, qty));
	} else if (prefix === "options") {
		const action = mode === "buy" ? "buyOption" : "sellOption";
		dispatchGameAction(action, { assetId: id, qty }, s =>
			mode === "buy" ? buyOption(s, id, qty) : sellOption(s, id, qty));
	}
}

window._sellOptionLot = (holdingId) => {
	const lot = (state.optionHoldings || []).find(h => h.id === holdingId);
	if (!lot) return;
	const amountId = `options-amount-${lot.optionId}`;
	const qty = getTradeQtyFromInput(amountId);
	dispatchGameAction("sellOptionLot", { holdingId, qty }, s => sellOptionLot(s, holdingId, qty));
};

window._sellAllOptionLot = (holdingId) => {
	const lot = (state.optionHoldings || []).find(h => h.id === holdingId);
	if (!lot || (lot.contracts || 0) <= 0) return;
	dispatchGameAction("sellOptionLot", { holdingId, qty: lot.contracts }, s => sellOptionLot(s, holdingId, lot.contracts));
};

window._setOptionMarketDte = (dte) => {
	dispatchGameAction("setOptionMarketDte", { dte }, s => setOptionMarketDte(s, params, dte));
};

window._exerciseOptionLot = (holdingId) => {
	dispatchGameAction("exerciseOptionLot", { holdingId, qty: 1 }, s => exerciseOptionLot(s, holdingId, 1));
};

window._openPerp = (side) => {
	const qty = getTradeQtyFromInput(PERP_QTY_INPUT);
	tradeQtyByInputId[PERP_QTY_INPUT] = qty;
	dispatchGameAction("openPerp", { side, qty }, s => openPerp(s, side, qty, params));
};

window._closePerp = (side) => {
	const qty = getTradeQtyFromInput(PERP_QTY_INPUT);
	tradeQtyByInputId[PERP_QTY_INPUT] = qty;
	dispatchGameAction("closePerp", { side, qty }, s => closePerp(s, side, qty));
};

window._closePerpLot = (holdingId) => {
	const qty = getTradeQtyFromInput(PERP_QTY_INPUT);
	dispatchGameAction("closePerpLot", { lotId: holdingId, qty }, s => closePerpLot(s, holdingId, qty));
};

window._closeAllPerpLot = (holdingId) => {
	const lot = (state.perpHoldings || []).find(h => h.id === holdingId);
	if (!lot || (lot.contracts || 0) <= 0) return;
	dispatchGameAction("closePerpLot", { lotId: holdingId, qty: lot.contracts }, s => closePerpLot(s, holdingId, lot.contracts));
};

window._selectMarketAsset = (prefix, id) => {
	if (prefix === "stock") selectedStockId = id;
	else if (prefix === "crypto") selectedCryptoId = id;
	render(state);
};

window._onMarketCardAutobuyChange = (prefix, assetId) => {
	applyMarketCardAutobuyFromCard(prefix, assetId);
};

window._tradeAsset = (prefix, mode, id) => {
	const amountId = `${prefix}-amount-${id}`;
	const qty = getTradeQtyFromInput(amountId);
	tradeQtyByInputId[amountId] = qty;
	if (prefix === "options") selectedOptionId = id;
	if (prefix === "stock") selectedStockId = id;
	if (prefix === "crypto") selectedCryptoId = id;
	executeTradeAsset(prefix, mode, id, qty);
	if (!isMultiplayer()) render(state);
};

window._buyMaxAsset = (prefix, id) => {
	const maxQty = maxBuyQtyForAsset(prefix, id);
	if (maxQty <= 0) return;
	const amountId = `${prefix}-amount-${id}`;
	tradeQtyByInputId[amountId] = maxQty;
	const el = document.getElementById(amountId);
	if (el) el.value = String(maxQty);
	if (prefix === "stock") selectedStockId = id;
	if (prefix === "crypto") selectedCryptoId = id;
	if (prefix === "options") selectedOptionId = id;
	executeTradeAsset(prefix, "buy", id, maxQty);
	if (!isMultiplayer()) render(state);
};

window._buyEveryStock = () => {
	const qty = getTradeQtyFromInput(STOCK_BULK_AMOUNT_ID);
	tradeQtyByInputId[STOCK_BULK_AMOUNT_ID] = qty;
	const stocks = state.stocks || [];
	if (isMultiplayer()) {
		for (const st of stocks) {
			dispatchGameAction("buyStock", { assetId: st.id, qty }, s => buyStock(s, st.id, qty));
		}
		return;
	}
	let s = state;
	for (const st of stocks) {
		s = buyStock(s, st.id, qty);
	}
	state = s;
	render(state);
};

window._sellAllAsset = (prefix, id) => {
	const owned = ownedQtyForAsset(prefix, id);
	if (owned <= 0) return;
	const amountId = `${prefix}-amount-${id}`;
	tradeQtyByInputId[amountId] = owned;
	const el = document.getElementById(amountId);
	if (el) el.value = String(owned);
	if (prefix === "options") selectedOptionId = id;
	if (prefix === "stock") selectedStockId = id;
	if (prefix === "crypto") selectedCryptoId = id;
	executeTradeAsset(prefix, "sell", id, owned);
	if (!isMultiplayer()) render(state);
};

window._setAmount = (id, rawValue) => {
	const qty = Math.max(1, parseInt(rawValue, 10) || 1);
	tradeQtyByInputId[id] = qty;
	if (isMarketCardAmountInput(id)) {
		const parsed = marketCardKeyFromAmountId(id);
		if (parsed) syncMarketCardAutobuyQty(parsed.prefix, parsed.assetId);
	}
	if (isAutobuyAmountInput(id)) {
		if (id === BOND_AUTOBUY_DAYS_INPUT) {
			applyTreasuryBondAutobuyFromUi();
			syncTreasuryBondAutobuyUi(state);
		} else {
			applyIndexFundAutobuyFromUi();
			syncIndexFundAutobuyUi(state);
		}
	} else {
		patchMarketCardOrderTotalsForInput(id);
		if (id.startsWith("options-amount-")) patchOptionsTicketLive(state);
	}
};

window._onBondAutobuyConfigChange = () => {
	applyTreasuryBondAutobuyFromUi();
	syncTreasuryBondAutobuyUi(state);
};

window._bumpAmount = (id, dir) => {
	const el = document.getElementById(id);
	if (!el) return;
	const step = getTradeQtyStep(id);
	const current = parseInt(el.value, 10) || 1;
	const next = Math.max(1, current + dir * step);
	el.value = next;
	tradeQtyByInputId[id] = next;
	if (isMarketCardAmountInput(id)) {
		const parsed = marketCardKeyFromAmountId(id);
		if (parsed) syncMarketCardAutobuyQty(parsed.prefix, parsed.assetId);
	}
	if (isAutobuyAmountInput(id)) {
		if (id === BOND_AUTOBUY_DAYS_INPUT) {
			applyTreasuryBondAutobuyFromUi();
			syncTreasuryBondAutobuyUi(state);
		} else {
			applyIndexFundAutobuyFromUi();
			syncIndexFundAutobuyUi(state);
		}
	} else {
		patchMarketCardOrderTotalsForInput(id);
		if (id.startsWith("options-amount-")) patchOptionsTicketLive(state);
	}
};

window._setTradeQtyPreset = (amountId, qty) => {
	const presets = getQtyPresetsForInput(amountId);
	if (!presets.includes(qty)) return;
	tradeStepByInputId[amountId] = qty;
	tradeQtyByInputId[amountId] = qty;
	const el = document.getElementById(amountId);
	if (el) el.value = String(qty);
	if (isMarketCardAmountInput(amountId)) {
		const parsed = marketCardKeyFromAmountId(amountId);
		if (parsed) syncMarketCardAutobuyQty(parsed.prefix, parsed.assetId);
	}
	if (isAutobuyAmountInput(amountId)) {
		if (amountId === BOND_AUTOBUY_DAYS_INPUT) {
			applyTreasuryBondAutobuyFromUi();
			syncTreasuryBondAutobuyUi(state);
		} else {
			applyIndexFundAutobuyFromUi();
			syncIndexFundAutobuyUi(state);
		}
	}
	render(state);
};

function dailyXLabels(history, currentDay) {
// Oldest visible day, midpoint, chart end (+ trailing blank slots)
const totalVisible = history.length;
const oldestDay = Math.max(1, currentDay - totalVisible + 1);
const endDay = chartAxisEndDay(currentDay);
const midDay = Math.round((oldestDay + endDay) / 2);
return [`Day ${oldestDay}`, `Day ${midDay}`, `Day ${endDay}`];
}

function monthlyXLabels(monthlyHistory, currentDay) {
const totalMonths = monthlyHistory.length;
const endDay = chartAxisEndDay(currentDay);
if (!totalMonths) return [];
const midMonth = Math.round(totalMonths / 2);
const toYr = m => "Yr " + Math.max(1, Math.ceil(m * 30 / 365));
return [toYr(1), toYr(midMonth), `Day ${endDay}`];
}

function priceChartModeForPrefix(prefix) {
	if (prefix === "stock") return stockChartMode;
	if (prefix === "crypto") return cryptoChartMode;
	if (prefix === "ifu" || prefix === "if") return indexChartMode;
	return "daily";
}

function sparkSeriesAndXLabels(prefix, asset, day) {
	const mode = priceChartModeForPrefix(prefix);
	const monthly = mode === "monthly";
	let series;
	if (monthly) {
		series = asset.monthlyHistory && asset.monthlyHistory.length
			? asset.monthlyHistory
			: [asset.price];
	} else {
		series = trimDailyChart(asset.history || []);
	}
	let xLabs;
	if (monthly) {
		const mh = asset.monthlyHistory && asset.monthlyHistory.length ? asset.monthlyHistory : [asset.price];
		xLabs = monthlyXLabels(mh, day);
	} else {
		xLabs = dailyXLabels(series, day);
	}
	if (!xLabs || xLabs.length === 0) {
		const endDay = chartAxisEndDay(day);
		xLabs = [`Day 1`, `Day ${Math.max(1, Math.floor(endDay / 2))}`, `Day ${endDay}`];
	}
	return { series, xLabs };
}

function netWorthXLabelsForMode(s, mode, chartDaySpan) {
	const d = s.day;
	if (!chartDaySpan) {
		const hist = trimDailyStackHistory(ensureNetWorthStackHistory(s), netWorthRecentDays);
		return dailyXLabels(hist, d);
	}
	const { oldestDay, newestDay, bucketDays, bucketEndDays } = chartDaySpan;
	if (bucketDays > 1 || mode === "monthly") {
		const ends = bucketEndDays?.length
			? bucketEndDays
			: fixedBucketEndDaysInRange(oldestDay, newestDay, bucketDays, d);
		const midDay = ends.length
			? ends[Math.floor((ends.length - 1) / 2)]
			: oldestDay;
		return [`Day ${oldestDay}`, `Day ${midDay}`, `Day ${newestDay}`];
	}
	const pseudoLen = newestDay - oldestDay + 1;
	return dailyXLabels(Array(Math.max(1, pseudoLen)).fill(0), d);
}

function syncNetWorthChartControls(s) {
	const recent = netWorthChartMode === "daily";
	const startRow = document.getElementById("nw-chart-start-row");
	const recentRow = document.getElementById("nw-chart-recent-row");
	if (startRow) startRow.hidden = netWorthChartMode !== "monthly";
	if (recentRow) recentRow.hidden = !recent;
	const startInput = document.getElementById("nw-chart-start-day");
	if (startInput && document.activeElement !== startInput) {
		startInput.max = String(Math.max(1, s.day));
		startInput.value = String(clampNetWorthChartStartDay(s, netWorthMonthStartDay));
	}
	NET_WORTH_MONTH_BUCKET_OPTIONS.forEach(days => {
		const b = document.getElementById(`nw-chart-bucket-${days}-btn`);
		if (b) b.classList.toggle("active", netWorthChartBucketDays === days);
	});
	NET_WORTH_RECENT_DAY_OPTIONS.forEach(days => {
		const b = document.getElementById(`nw-chart-recent-${days}-btn`);
		if (b) b.classList.toggle("active", recent && netWorthRecentDays === days);
	});
}

function syncLinkedChartToggleButtons() {
	const dailyIdx = indexChartMode === "daily";
	const idxPairs = [
		["if-chart-daily-btn", dailyIdx],
		["if-chart-monthly-btn", !dailyIdx],
		["opt-spy-chart-daily-btn", dailyIdx],
		["opt-spy-chart-monthly-btn", !dailyIdx],
	];
	idxPairs.forEach(([id, on]) => {
		const b = document.getElementById(id);
		if (b) b.classList.toggle("active", on);
	});
	const dSt = stockChartMode === "daily";
	[["stock-chart-daily-btn", dSt], ["stock-chart-monthly-btn", !dSt]].forEach(([id, on]) => {
		const b = document.getElementById(id);
		if (b) b.classList.toggle("active", on);
	});
	const dCr = cryptoChartMode === "daily";
	[["crypto-chart-daily-btn", dCr], ["crypto-chart-monthly-btn", !dCr]].forEach(([id, on]) => {
		const b = document.getElementById(id);
		if (b) b.classList.toggle("active", on);
	});
	const dNw = netWorthChartMode === "daily";
	[["nw-chart-daily-btn", dNw], ["nw-chart-monthly-btn", !dNw]].forEach(([id, on]) => {
		const b = document.getElementById(id);
		if (b) b.classList.toggle("active", on);
	});
}

function renderGraphs(s) {
const indexHistoryFull = averageHistory(s.indexFunds, "history");
const monthly = averageHistory(s.indexFunds, "monthlyHistory");
const useMonthly = indexChartMode === "monthly";
const indexHistoryDaily = trimDailyChart(indexHistoryFull);
const series = useMonthly ? monthly : indexHistoryDaily;
const xLabels = useMonthly ? monthlyXLabels(monthly, s.day) : dailyXLabels(indexHistoryDaily, s.day);
drawChart(
document.getElementById("price-graph"), series, "#00ff88",
document.getElementById("if-yaxis"), document.getElementById("if-xaxis"), xLabels
);
const nw = netWorth(s);
const nwHistoryPeak = netWorthHistoryPeak(s, nw);
let mpHistoryPeak = 0;
if (isMultiplayer()) {
	for (const row of mpClient.leaderboard || []) {
		mpHistoryPeak = Math.max(mpHistoryPeak, netWorthHistoryPeak(row, row.netWorth));
	}
}
const nwPeak = Math.max(nw, nwHistoryPeak, mpHistoryPeak);
const nwYMax = nwPeak <= 50000 ? 50000 : nwPeak * 1.5;
const nwDaySpan = netWorthChartDaySpan(
	s,
	netWorthChartMode,
	netWorthChartBucketDays,
	netWorthMonthStartDay,
	netWorthRecentDays
);
let nwBucketEndDays;
if (nwDaySpan.bucketDays > 1) {
	nwBucketEndDays = fixedBucketEndDaysInRange(
		nwDaySpan.oldestDay,
		nwDaySpan.newestDay,
		nwDaySpan.bucketDays,
		nwDaySpan.currentDay ?? nwDaySpan.newestDay
	);
}
const nwXLabs = netWorthXLabelsForMode(s, netWorthChartMode, nwDaySpan);
const nwVerticalLines = netWorthChartVerticalLines(s, nwDaySpan.oldestDay, nwDaySpan.newestDay);
const nwCanvas = document.getElementById("networth-graph");
drawStackedNetWorthChart(
	nwCanvas,
	s,
	nwYMax,
	document.getElementById("nw-xaxis"),
	nwXLabs,
	nwVerticalLines,
	nwDaySpan
);
if (isMultiplayer()) {
	drawMultiplayerNetWorthOverlays(nwCanvas, nwDaySpan, nwYMax, nwBucketEndDays);
	renderMpNetWorthOverlayLegend();
} else {
	const overlayLegend = document.getElementById("mp-nw-overlay-legend");
	if (overlayLegend) overlayLegend.hidden = true;
}
renderNetWorthStackLegend(snapshotNetWorthStack(s));
const holdingsStack = snapshotNetWorthStack(s);
drawHoldingsPieChart(document.getElementById("overview-holdings-pie"), holdingsStack);
renderHoldingsPieLegend(holdingsStack);
drawYieldCurve(s);
syncLinkedChartToggleButtons();
syncNetWorthChartControls(s);
}

function advanceDays(count) {
syncAllAutobuysFromUi();
const steps = Math.max(1, parseInt(count) || 1);
if (isMultiplayer()) {
	if (!isMpHost()) return;
	try {
		mpClient.advanceDay(steps, autobuyConfigFromState());
	} catch (err) {
		alert(err.message || "Could not advance day");
	}
	return;
}
for (let i = 0; i < steps; i++) {
	const prevDay = state.day;
	state = nextDay(state, params);
	if (state.day === prevDay) break;
}
render(state);
}

function setAutoAdvance(on) {
	if (isMultiplayer() && on && !isMpHost()) return;
	if (autoAdvanceTimerId !== null) {
		clearInterval(autoAdvanceTimerId);
		autoAdvanceTimerId = null;
	}
	if (!on) {
		mpAdvanceInFlight = false;
		syncAutoAdvanceUi();
		render(state);
		return;
	}
	if (state.day >= state.maxDays) {
		syncAutoAdvanceUi();
		return;
	}
	const ms = getAutoAdvanceIntervalMs();
	autoAdvanceTimerId = setInterval(() => {
		if (state.day >= state.maxDays) {
			setAutoAdvance(false);
			return;
		}
		syncMarketCardAutobuysFromUi();
		if (isMultiplayer()) {
			if (!isMpHost()) {
				setAutoAdvance(false);
				return;
			}
			if (mpAdvanceInFlight) return;
			mpAdvanceInFlight = true;
			try {
				syncAllAutobuysFromUi();
				mpClient.advanceDay(1, autobuyConfigFromState());
			} catch (err) {
				mpAdvanceInFlight = false;
				setAutoAdvance(false);
				alert(err.message || "Could not advance day");
			}
			return;
		}
		const prevDay = state.day;
		state = nextDay(state, params);
		render(state, { liveOnly: true });
		if (state.day === prevDay || state.day >= state.maxDays) {
			setAutoAdvance(false);
		}
	}, ms);
	syncAutoAdvanceUi();
}

document.getElementById("day-btn").onclick         = () => { if (isMultiplayer()) { advanceDays(1); return; } syncAllAutobuysFromUi(); state = nextDay(state, params); render(state); };
document.getElementById("advance-btn").onclick     = () => {
	const days = parseInt(document.getElementById("advance-days").value) || 1;
	advanceDays(days);
};
document.getElementById("buy-bonds-btn").onclick = () => {
	const face = parseFloat(document.getElementById("bond-face-value").value) || 1000;
	const term = parseInt(document.getElementById("bond-term").value, 10) || 5;
	dispatchGameAction("buyBond", { face, term }, s => buyBond(s, face, term));
};
document.getElementById("if-autobuy-enabled")?.addEventListener("change", () => {
	applyIndexFundAutobuyFromUi();
	render(state);
});
document.getElementById("bond-autobuy-enabled")?.addEventListener("change", () => {
	applyTreasuryBondAutobuyFromUi();
	render(state);
});

document.getElementById("if-chart-daily-btn").onclick = () => {
	indexChartMode = "daily";
	render(state);
};
document.getElementById("if-chart-monthly-btn").onclick = () => {
	indexChartMode = "monthly";
	render(state);
};
document.getElementById("nw-chart-daily-btn").onclick = () => {
	netWorthChartMode = "daily";
	render(state);
};
document.getElementById("nw-chart-monthly-btn").onclick = () => {
	netWorthChartMode = "monthly";
	render(state);
};
NET_WORTH_MONTH_BUCKET_OPTIONS.forEach(days => {
	document.getElementById(`nw-chart-bucket-${days}-btn`)?.addEventListener("click", () => {
		netWorthChartBucketDays = days;
		render(state);
	});
});
NET_WORTH_RECENT_DAY_OPTIONS.forEach(days => {
	document.getElementById(`nw-chart-recent-${days}-btn`)?.addEventListener("click", () => {
		netWorthRecentDays = days;
		netWorthChartMode = "daily";
		render(state);
	});
});
document.getElementById("nw-chart-start-day")?.addEventListener("change", () => {
	const el = document.getElementById("nw-chart-start-day");
	netWorthMonthStartDay = clampNetWorthChartStartDay(state, parseInt(el?.value, 10));
	if (el) el.value = String(netWorthMonthStartDay);
	render(state);
});
document.getElementById("stock-chart-daily-btn")?.addEventListener("click", () => {
	stockChartMode = "daily";
	render(state);
});
document.getElementById("stock-chart-monthly-btn")?.addEventListener("click", () => {
	stockChartMode = "monthly";
	render(state);
});
document.getElementById("crypto-chart-daily-btn")?.addEventListener("click", () => {
	cryptoChartMode = "daily";
	render(state);
});
document.getElementById("crypto-chart-monthly-btn")?.addEventListener("click", () => {
	cryptoChartMode = "monthly";
	render(state);
});
document.getElementById("opt-spy-chart-daily-btn")?.addEventListener("click", () => {
	indexChartMode = "daily";
	render(state);
});
document.getElementById("opt-spy-chart-monthly-btn")?.addEventListener("click", () => {
	indexChartMode = "monthly";
	render(state);
});

// Bond preview updates live
document.getElementById("bond-term").addEventListener("change", () => {
	updateBondPreview(state);
});
document.getElementById("bond-face-value").addEventListener("input", () => {
	updateBondPreview(state);
});
document.getElementById("auto-advance-start-btn").addEventListener("click", () => {
	setAutoAdvance(autoAdvanceTimerId === null);
});
document.getElementById("auto-advance-speed-slider").addEventListener("input", e => {
	setAutoAdvanceIntervalMs(parseInt(e.target.value, 10));
});
document.querySelector(".auto-advance-speed-slider-row")?.addEventListener("wheel", e => {
	if (!e.deltaY) return;
	e.preventDefault();
	const step = 5;
	setAutoAdvanceIntervalMs(getAutoAdvanceIntervalMs() + (e.deltaY > 0 ? -step : step));
}, { passive: false });
document.getElementById("reset-btn").onclick       = () => {
setAutoAdvance(false);
state = { ...newState(params), log: [{ msg: "New run started.", type: "info", day: 1 }] };
document.getElementById("log").innerHTML = "";
renderedLogCount = 0;
render(state);
};
document.getElementById("export-btn")?.addEventListener("click", () => {
	const ok = downloadSaveFile(state, params, collectUiMeta());
	updateSaveStatus(ok ? "Exported" : "Export failed", !ok);
});
document.getElementById("import-btn")?.addEventListener("click", () => {
	document.getElementById("save-import-input")?.click();
});
document.getElementById("save-import-input")?.addEventListener("change", async e => {
	const file = e.target.files?.[0];
	e.target.value = "";
	if (!file) return;
	await handleSaveImportFile(file);
});
document.getElementById("dbg-apply-btn").onclick   = () => {
setAutoAdvance(false);
params = readParams();
state = { ...newState(params), log: [{ msg: `New run started with custom params.`, type: "info", day: 1 }] };
document.getElementById("log").innerHTML = "";
renderedLogCount = 0;
render(state);
};

function bootGameFromStartScreen() {
	const overlay = document.getElementById("start-screen");
	if (overlay?.classList.contains("start-screen--hidden")) return;
	if (overlay) {
		overlay.classList.add("start-screen--hidden");
		overlay.setAttribute("aria-hidden", "true");
	}
	params = readParams();
	state = { ...newState(params), log: [{ msg: "New run started.", type: "info", day: 1 }] };
	renderedLogCount = 0;
	const logEl = document.getElementById("log");
	if (logEl) logEl.innerHTML = "";
	startTicker();
	render(state);
}

function bootGameFromSavedRun() {
	const overlay = document.getElementById("start-screen");
	if (overlay?.classList.contains("start-screen--hidden")) return;
	if (!loadSavedRunIntoSession()) return;
	hideStartScreen();
	startTicker();
	render(state);
	updateSaveStatus("Loaded saved run");
}

document.getElementById("start-game-btn").addEventListener("click", () => bootGameFromStartScreen());
document.getElementById("continue-game-btn")?.addEventListener("click", () => bootGameFromSavedRun());
document.getElementById("start-import-btn")?.addEventListener("click", () => {
	document.getElementById("start-import-input")?.click();
});
document.getElementById("start-import-input")?.addEventListener("change", async e => {
	const file = e.target.files?.[0];
	e.target.value = "";
	if (!file) return;
	await handleSaveImportFile(file);
});
setupStartScreen();
setupMultiplayerUi();
document.getElementById("start-game-btn")?.focus();