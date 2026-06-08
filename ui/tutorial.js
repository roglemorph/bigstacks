import { fmt } from "./format.js";
import { MARKET_UNLOCK_LEVELS } from "../investments/assetUnlockLevels.js";

export const GOAL_NET_WORTH = 100_000_000;
export const TUTORIAL_STORAGE_KEY = "bigstacks-tutorial-v1";

const INTRO_CARDS = [
	{
		title: "Your goal",
		body: `You start with <strong>$10,000</strong> cash and receive <strong>$1,000 every 30 days</strong> as a stipend. Grow your <strong>net worth</strong> to <strong>${fmt(GOAL_NET_WORTH)}</strong> as fast as you can. Your run ends at day <strong>30,000</strong> — make every day count.`,
	},
	{
		title: "Core loop",
		body: `Use <strong>Next day</strong> or <strong>Advance</strong> in the sidebar to move time forward. Prices change, income arrives, and your portfolio updates. <strong>Auto-advance</strong> spends <strong>energy</strong> (faster speeds cost more per day); manual days and 30-day stipends restore it. Each day also earns <strong>1 XP</strong> toward your level. Track progress on <strong>Overview</strong>: net worth history, asset summaries, and the activity log.`,
	},
	{
		title: "First move",
		body: `The <strong>Index Fund</strong> tab is open from day one. Buy shares to put cash to work instead of leaving it idle. You can sell anytime and optionally set up <strong>autobuy</strong> to purchase on a schedule.`,
	},
	{
		title: "Unlock more markets",
		body: `Bonds and the index fund are open from the start. Other markets unlock as you level up from advancing days (1 XP per day):<br><br>Stocks <strong>level ${MARKET_UNLOCK_LEVELS.stocks}</strong> → Crypto <strong>level ${MARKET_UNLOCK_LEVELS.crypto}</strong> → Options <strong>level ${MARKET_UNLOCK_LEVELS.options}</strong> → Casino <strong>level ${MARKET_UNLOCK_LEVELS.casino}</strong><br><br>Open the <strong>Black Market</strong> from the sidebar (below your portfolio stats) for Insight upgrades (+1 energy/day base, plus Energy Yield and more).`,
	},
];

const TAB_TIPS = {
	overview: {
		title: "Overview dashboard",
		body: "Net worth history shows how your wealth grows over time. Summary cards break down each asset class. The activity log records trades, unlocks, income, and market events — check it when something surprises you.",
	},
	"index-fund": {
		title: "Index fund",
		body: "Buy and sell shares on the market cards below. The price chart tracks the fund over time. Enable autobuy to purchase a set number of shares every N days automatically.",
	},
	bonds: {
		title: "Bonds",
		body: "Available from the start. <strong>Treasuries</strong> pay daily coupon income until maturity. <strong>Corporate bonds</strong> pay higher yields but carry default risk. Early treasury sales cost a 15% penalty.",
	},
	stocks: {
		title: "Stocks",
		body: `Unlocks at <strong>level ${MARKET_UNLOCK_LEVELS.stocks}</strong>. The main chart overlays every stock as a colored line — left-click a chart toggle to pick the featured stock; right-click to show/hide its line. <strong>Double-click a market card</strong> to show that stock in the large panel above; single-click still trades on any card normally. Wider drift tick = higher volatility. Fundamentals update every 90 days; dividends pay quarterly. High debt plus negative earnings raises bankruptcy risk. Delisted stocks never relist.`,
	},
	crypto: {
		title: "Crypto",
		body: `Unlocks at <strong>level ${MARKET_UNLOCK_LEVELS.crypto}</strong>. Prices are volatile. Coins that die are cash-settled and replaced with new listings over time.`,
	},
	options: {
		title: "Options desk",
		body: `Unlocks at <strong>level ${MARKET_UNLOCK_LEVELS.options}</strong>. Trade calls and puts on the index fund. Pick a days-to-expiry (DTE) tenor — premiums update live. <strong>Perpetuals</strong> are advanced leveraged positions with funding costs.`,
	},
	casino: {
		title: "Casino",
		body: `Unlocks at <strong>level ${MARKET_UNLOCK_LEVELS.casino}</strong>. Optional side game on cash only — not part of your portfolio. The anchor is a number 1–100. Bet whether the next roll is strictly higher or lower. Ties are a push. Even money on wins.`,
	},
	"black-market": {
		title: "Black market",
		body: "Open from the sidebar below your portfolio stats. Its own page — not an investment tab. Spend <strong>Insight</strong> on upgrades: <strong>Energy Yield</strong> (+0.5/day per level on top of the base +1/day), <strong>Efficient Auto-Advance</strong>, and <strong>Expanded Reservoir</strong>. Earn Insight from level-ups and profitable closed trades — spending it does not reduce your XP level.",
	},
};

const HELP_SECTIONS = [
	{
		title: "Goal",
		body: `Reach <strong>${fmt(GOAL_NET_WORTH)}</strong> net worth as fast as possible. You start with $10,000 and receive $1,000 every 30 days. Runs end at day 30,000.`,
	},
	{
		title: "Controls",
		body: "<strong>Next day</strong> advances one day. <strong>Advance</strong> jumps multiple days at once. <strong>Auto-advance</strong> runs days automatically at a chosen speed and drains energy (idle regen refills when stopped). Manual advances grant bonus energy. Each day earns 1 XP; levels take slightly more XP as you progress. <strong>New Run</strong> starts fresh. Export/Import saves your progress.",
	},
	{
		title: "Net worth & return",
		body: "Net worth = cash + portfolio value. <strong>Total return</strong> measures investment gains vs your starting net worth. The 30-day stipend counts as added starting capital, not investment return.",
	},
	{
		title: "Index fund",
		body: "Always available. Broad market exposure via a single fund. Buy/sell shares, watch the chart, optional autobuy.",
	},
	{
		title: "Bonds",
		body: "Available from the start. Treasuries pay coupon income until maturity. Corporates offer higher yield with bankruptcy risk. Yield curve reprices every 90 days; coupons on held bonds stay fixed.",
	},
	{
		title: "Stocks",
		body: `Unlocks at level ${MARKET_UNLOCK_LEVELS.stocks}. Chart toggles: left-click = featured stock, right-click = line visibility. Double-click grid cards for featured panel; trade any card with one click. Buy all at the bottom.`,
	},
	{
		title: "Crypto",
		body: `Unlocks at level ${MARKET_UNLOCK_LEVELS.crypto}. High volatility. Dead coins settle to cash; new listings rotate in.`,
	},
	{
		title: "Options",
		body: `Unlocks at level ${MARKET_UNLOCK_LEVELS.options}. Calls and puts on the index. Manage DTE, sell at mark or exercise for intrinsic value. Perps add leverage and funding.`,
	},
	{
		title: "Casino",
		body: `Unlocks at level ${MARKET_UNLOCK_LEVELS.casino}. Hi-Lo game on cash. Anchor 1–100, bet higher or lower, push on tie, even money wins.`,
	},
	{
		title: "Unlock order",
		body: `Bonds from the start → Stocks level ${MARKET_UNLOCK_LEVELS.stocks} → Crypto level ${MARKET_UNLOCK_LEVELS.crypto} → Options level ${MARKET_UNLOCK_LEVELS.options} → Casino level ${MARKET_UNLOCK_LEVELS.casino}. Black Market is in the sidebar below your portfolio stats.`,
	},
];

let introStep = 0;
let tutorialState = loadTutorialState();

function loadTutorialState() {
	try {
		const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
		if (!raw) return { introDone: false, seenTips: [] };
		const parsed = JSON.parse(raw);
		return {
			introDone: !!parsed.introDone,
			seenTips: Array.isArray(parsed.seenTips) ? parsed.seenTips : [],
		};
	} catch {
		return { introDone: false, seenTips: [] };
	}
}

function saveTutorialState() {
	try {
		localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(tutorialState));
	} catch {
		/* ignore */
	}
}

function markIntroDone() {
	tutorialState.introDone = true;
	saveTutorialState();
}

function markTipSeen(pageId) {
	if (!pageId || tutorialState.seenTips.includes(pageId)) return;
	tutorialState.seenTips.push(pageId);
	saveTutorialState();
}

function introOverlay() {
	return document.getElementById("tutorial-intro");
}

function helpOverlay() {
	return document.getElementById("tutorial-help");
}

function renderIntroCard() {
	const card = INTRO_CARDS[introStep];
	const titleEl = document.getElementById("tutorial-intro-title");
	const bodyEl = document.getElementById("tutorial-intro-body");
	const dotsEl = document.getElementById("tutorial-intro-dots");
	const backBtn = document.getElementById("tutorial-intro-back");
	const nextBtn = document.getElementById("tutorial-intro-next");
	if (!card || !titleEl || !bodyEl) return;

	titleEl.textContent = card.title;
	bodyEl.innerHTML = card.body;

	if (dotsEl) {
		dotsEl.innerHTML = INTRO_CARDS.map((_, i) =>
			`<span class="tutorial-dot${i === introStep ? " tutorial-dot--active" : ""}" aria-hidden="true"></span>`
		).join("");
	}

	const isFirst = introStep === 0;
	const isLast = introStep === INTRO_CARDS.length - 1;
	if (backBtn) {
		backBtn.hidden = isFirst;
		backBtn.disabled = isFirst;
	}
	if (nextBtn) nextBtn.textContent = isLast ? "Done" : "Next";
}

function showIntroOverlay() {
	const overlay = introOverlay();
	if (!overlay) return;
	introStep = 0;
	renderIntroCard();
	overlay.classList.remove("tutorial-overlay--hidden");
	overlay.setAttribute("aria-hidden", "false");
	document.getElementById("tutorial-intro-next")?.focus();
}

function hideIntroOverlay() {
	const overlay = introOverlay();
	if (!overlay) return;
	overlay.classList.add("tutorial-overlay--hidden");
	overlay.setAttribute("aria-hidden", "true");
}

function renderHelpContent() {
	const el = document.getElementById("tutorial-help-body");
	if (!el) return;
	el.innerHTML = HELP_SECTIONS.map(
		s => `<section class="tutorial-help-section"><h3 class="tutorial-help-section__title">${s.title}</h3><p class="tutorial-help-section__body">${s.body}</p></section>`
	).join("");
}

function removeTabTip(pageId) {
	const page = document.getElementById(`page-${pageId}`);
	if (!page) return;
	page.querySelector(".tutorial-tip-banner")?.remove();
}

function injectTabTip(pageId) {
	const tip = TAB_TIPS[pageId];
	if (!tip) return;

	const page = document.getElementById(`page-${pageId}`);
	if (!page) return;

	removeTabTip(pageId);

	const banner = document.createElement("div");
	banner.className = "tutorial-tip-banner";
	banner.setAttribute("role", "note");
	banner.innerHTML = `
		<div class="tutorial-tip-banner__content">
			<div class="tutorial-tip-banner__title">${tip.title}</div>
			<p class="tutorial-tip-banner__body">${tip.body}</p>
		</div>
		<button type="button" class="tutorial-tip-banner__dismiss" aria-label="Dismiss tip">×</button>
	`;

	banner.querySelector(".tutorial-tip-banner__dismiss")?.addEventListener("click", () => {
		markTipSeen(pageId);
		banner.remove();
	});

	page.prepend(banner);
}

export function maybeShowIntro({ isNewRun = false } = {}) {
	if (!isNewRun || tutorialState.introDone) return;
	showIntroOverlay();
}

export function maybeShowTabTip(pageId) {
	if (!pageId || pageId === "debug") return;
	if (tutorialState.seenTips.includes(pageId)) return;
	if (introOverlay() && !introOverlay().classList.contains("tutorial-overlay--hidden")) return;
	injectTabTip(pageId);
}

export function openHelpPanel() {
	const overlay = helpOverlay();
	if (!overlay) return;
	renderHelpContent();
	overlay.classList.remove("tutorial-overlay--hidden");
	overlay.setAttribute("aria-hidden", "false");
	document.getElementById("tutorial-help-close")?.focus();
}

export function closeHelpPanel() {
	const overlay = helpOverlay();
	if (!overlay) return;
	overlay.classList.add("tutorial-overlay--hidden");
	overlay.setAttribute("aria-hidden", "true");
}

export function replayIntro() {
	closeHelpPanel();
	introStep = 0;
	showIntroOverlay();
}

export function resetTabTips() {
	tutorialState.seenTips = [];
	saveTutorialState();
	for (const pageId of Object.keys(TAB_TIPS)) removeTabTip(pageId);
	const activeTab = document.querySelector(".nav-tab.active");
	if (activeTab?.dataset.page) maybeShowTabTip(activeTab.dataset.page);
}

function onIntroNext() {
	if (introStep < INTRO_CARDS.length - 1) {
		introStep += 1;
		renderIntroCard();
		return;
	}
	markIntroDone();
	hideIntroOverlay();
	const activeTab = document.querySelector(".nav-tab.active");
	if (activeTab?.dataset.page) maybeShowTabTip(activeTab.dataset.page);
}

function onIntroBack() {
	if (introStep <= 0) return;
	introStep -= 1;
	renderIntroCard();
}

export function setupTutorial() {
	renderHelpContent();

	document.getElementById("help-btn")?.addEventListener("click", () => openHelpPanel());
	document.getElementById("tutorial-help-close")?.addEventListener("click", () => closeHelpPanel());
	document.getElementById("tutorial-help-replay")?.addEventListener("click", () => replayIntro());
	document.getElementById("tutorial-help-reset-tips")?.addEventListener("click", () => resetTabTips());

	document.getElementById("tutorial-intro-next")?.addEventListener("click", () => onIntroNext());
	document.getElementById("tutorial-intro-back")?.addEventListener("click", () => onIntroBack());
	document.getElementById("tutorial-intro-skip")?.addEventListener("click", () => {
		markIntroDone();
		hideIntroOverlay();
		const activeTab = document.querySelector(".nav-tab.active");
		if (activeTab?.dataset.page) maybeShowTabTip(activeTab.dataset.page);
	});

	for (const overlay of [introOverlay(), helpOverlay()]) {
		overlay?.addEventListener("click", e => {
			if (e.target === overlay) {
				if (overlay.id === "tutorial-help") closeHelpPanel();
			}
		});
	}

	document.addEventListener("keydown", e => {
		if (e.key !== "Escape") return;
		if (!helpOverlay()?.classList.contains("tutorial-overlay--hidden")) closeHelpPanel();
	});
}
