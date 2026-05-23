import { tradeAsset, evolveTrackedAssets, appendLog, fmt, fmtSignedMoney2, DEFAULT_MARKET_DRIFT, costBasisForHifoSale } from "./shared.js";
import { resolveRng } from "./rng.js";
import { UNLOCK_COST_CRYPTOS } from "./marketUnlock.js";

/** Canonical OG listings (always three). */
export const OG_CRYPTO_SPECS = [
  { id: "og-alpha", name: "OG alpha", dailyVol: 0.0400 },
  { id: "og-beta", name: "OG beta", dailyVol: 0.0480 },
  { id: "og-gamma", name: "OG gamma", dailyVol: 0.0600 },
];

/** Volatility templates for newly minted (non-OG) listings. */
export const CRYPTO_MINT_PROTOTYPES = [
  { dailyVol: 0.0400 },
  { dailyVol: 0.0480 },
  { dailyVol: 0.0600 },
];

/** Three OG coins plus one launch coin. */
export const CRYPTO_MARKET_SLOT_TARGET = 4;

/** Listed coins at or below this USD price are removed from the board (holdings cash-settled at spot). */
export const CRYPTO_DELIST_PRICE_USD = 0.35;

/** Inclusive USD range for each token's day-1 price (max is below every stock's random start range). */
export const CRYPTO_START_PRICE_MIN = 2;
export const CRYPTO_START_PRICE_MAX = 24;

/** Extra daily drift on top of market drift for exactly one random OG per run. */
export const CRYPTO_OG_WINNER_EXTRA_DRIFT = 0.0008;

/**
 * Greek-letter pairs for launch coin names (no Alpha / Beta / Gamma — reserved for OG names).
 * Title case; joined with a hyphen.
 */
const LAUNCH_NAME_GREEK = [
  "Delta", "Epsilon", "Zeta", "Eta", "Theta", "Iota", "Kappa", "Lambda",
  "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho", "Sigma", "Tau", "Upsilon",
  "Phi", "Chi", "Psi", "Omega",
];

/** Random suffix appended to Greek-dash-Greek launch names (dot-suffixes glue tight). */
const LAUNCH_NAME_SUFFIXES = [
  "coin",
  ".AI",
  ".com",
  "project",
  "token",
  "stake",
  "protocol",
  "labs",
  "dao",
  "chain",
  "finance",
  "network",
  "swap",
];

export function randomLaunchCoinName(params = {}) {
  const rng = resolveRng(params);
  const n = LAUNCH_NAME_GREEK.length;
  let i = rng.int(0, n - 1);
  let j = rng.int(0, n - 2);
  if (j >= i) j += 1;
  const base = `${LAUNCH_NAME_GREEK[i]}-${LAUNCH_NAME_GREEK[j]}`;
  const suffix = LAUNCH_NAME_SUFFIXES[rng.int(0, LAUNCH_NAME_SUFFIXES.length - 1)];
  return suffix.startsWith(".") ? `${base}${suffix}` : `${base} ${suffix}`;
}

/** Random listing/open price; honors optional `params.cryptoStartPriceMin` / `Max` from debug / tests. */
export function randomCryptoStartPrice(params = {}) {
  let lo = Number.isFinite(params.cryptoStartPriceMin) ? params.cryptoStartPriceMin : CRYPTO_START_PRICE_MIN;
  let hi = Number.isFinite(params.cryptoStartPriceMax) ? params.cryptoStartPriceMax : CRYPTO_START_PRICE_MAX;
  if (lo > hi) [lo, hi] = [hi, lo];
  const span = hi - lo;
  const rng = resolveRng(params);
  return Math.round((lo + rng.random() * span) * 100) / 100;
}

/**
 * Three OG coins (one random “winner” with extra drift) + one Greek-named launch coin.
 * Each coin gets its own fresh `history` / `monthlyHistory`.
 */
export function buildInitialCryptos(params = {}) {
  const rng = resolveRng(params);
  const winnerIdx = rng.int(0, OG_CRYPTO_SPECS.length - 1);
  const ogs = OG_CRYPTO_SPECS.map((spec, i) => {
    const price = randomCryptoStartPrice(params);
    return {
      ...spec,
      startPrice: price,
      coins: 0,
      costBasis: 0,
      lots: [],
      price,
      history: [price],
      monthlyHistory: [price],
      cryptoExtraDrift: i === winnerIdx ? CRYPTO_OG_WINNER_EXTRA_DRIFT : 0,
    };
  });

  const proto = CRYPTO_MINT_PROTOTYPES[rng.int(0, CRYPTO_MINT_PROTOTYPES.length - 1)];
  const launchPrice = randomCryptoStartPrice(params);
  const launch = {
    ...proto,
    id: `tok-1-${rng.id()}`,
    name: randomLaunchCoinName(params),
    startPrice: launchPrice,
    coins: 0,
    costBasis: 0,
    lots: [],
    price: launchPrice,
    history: [launchPrice],
    monthlyHistory: [launchPrice],
    cryptoExtraDrift: 0,
  };

  return {
    cryptos: [...ogs, launch],
    cryptoListingSeq: CRYPTO_MARKET_SLOT_TARGET,
  };
}

export function buyCrypto(state, assetId, qty) {
  if (!state.unlockedCrypto) {
    return appendLog(state, `Crypto market locked — pay ${fmt(UNLOCK_COST_CRYPTOS)} on the Crypto tab to unlock.`, "bad");
  }
  return tradeAsset(state, "cryptos", assetId, qty, "buy", "coin");
}

export function sellCrypto(state, assetId, qty) {
  if (!state.unlockedCrypto) {
    return appendLog(state, `Crypto market locked — pay ${fmt(UNLOCK_COST_CRYPTOS)} on the Crypto tab to unlock.`, "bad");
  }
  return tradeAsset(state, "cryptos", assetId, qty, "sell", "coin");
}

export function cryptosPortfolioValue(state) {
  return (state.cryptos || []).reduce((sum, c) => sum + (c.coins * c.price), 0);
}

export function evolveCryptosForDay(s, params, isMonthEnd) {
  const rng = resolveRng(params);
  const cryptoVol = params.volCrypto ?? 0.04;
  const drift = params.driftIndex ?? DEFAULT_MARKET_DRIFT;
  return evolveTrackedAssets(s.cryptos, {
    overrideVol: cryptoVol,
    includeMonthlyHistory: true,
    drift,
    isMonthEnd,
    randn: () => rng.randn(),
    driftPerAsset: a => (Number.isFinite(a.cryptoExtraDrift) ? a.cryptoExtraDrift : 0),
  });
}

function mintListedCrypto(proto, newDay, params) {
  const rng = resolveRng(params);
  const price = randomCryptoStartPrice(params);
  const id = `tok-${newDay}-${rng.id()}`;
  return {
    ...proto,
    id,
    name: randomLaunchCoinName(params),
    startPrice: price,
    coins: 0,
    costBasis: 0,
    lots: [],
    price,
    history: [price],
    monthlyHistory: [price],
    cryptoExtraDrift: 0,
  };
}

/**
 * Evolve prices, remove worthless listings (cash-settle holdings), mint replacements up to slot target.
 */
export function evolveAndRotateCryptoMarket(s, params, isMonthEnd, newDay) {
  const evolved = evolveCryptosForDay(s, params, isMonthEnd);
  let cashDelta = 0;
  let cryptoRealizedPLDelta = 0;
  const logLines = [];
  let seq = Number.isFinite(s.cryptoListingSeq) ? s.cryptoListingSeq : CRYPTO_MARKET_SLOT_TARGET;

  const delistAt = Number.isFinite(params.cryptoDelistPriceUsd)
    ? params.cryptoDelistPriceUsd
    : CRYPTO_DELIST_PRICE_USD;
  let slotTarget = Number.isFinite(params.cryptoMarketSlotTarget)
    ? Math.floor(params.cryptoMarketSlotTarget)
    : CRYPTO_MARKET_SLOT_TARGET;
  slotTarget = Math.min(50, Math.max(1, slotTarget));

  const survivors = [];
  for (const c of evolved) {
    if (c.price <= delistAt) {
      const coins = c.coins || 0;
      if (coins > 0) {
        const proceeds = coins * c.price;
        const costRemoved = costBasisForHifoSale(c, "coins", coins);
        const realizedPl = proceeds - costRemoved;
        cryptoRealizedPLDelta += realizedPl;
        cashDelta += proceeds;
        logLines.push({
          msg: `${c.name} left the exchange worthless — ${coins} coin(s) liquidated for $${proceeds.toFixed(2)} (P/L ${fmtSignedMoney2(realizedPl)}).`,
          type: "bad",
          day: newDay,
        });
      } else {
        logLines.push({
          msg: `${c.name} vanished from the exchange (worthless).`,
          type: "info",
          day: newDay,
        });
      }
      continue;
    }
    survivors.push(c);
  }

  while (survivors.length < slotTarget) {
    seq += 1;
    const rng = resolveRng(params);
    const proto = CRYPTO_MINT_PROTOTYPES[rng.int(0, CRYPTO_MINT_PROTOTYPES.length - 1)];
    const newbie = mintListedCrypto(proto, newDay, params);
    survivors.push(newbie);
    logLines.push({
      msg: `${newbie.name} listed around $${newbie.price.toFixed(2)}.`,
      type: "good",
      day: newDay,
    });
  }

  return {
    cryptos: survivors,
    cashDelta,
    cryptoRealizedPLDelta,
    logLines,
    cryptoListingSeq: seq,
  };
}
