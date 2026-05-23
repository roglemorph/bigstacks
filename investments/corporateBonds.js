import { appendLog, fmt, fmtSignedMoney2 } from "./shared.js";
import { rollYieldInBand } from "./yieldCurve.js";
import { resolveRng } from "./rng.js";

/** Active corporate listings on the primary market (always refilled to this count). */
export const CORPORATE_OFFER_COUNT = 5;

/** Bills in each offering at start (inclusive). */
export const CORPORATE_UNITS_MIN = 9500;
export const CORPORATE_UNITS_MAX = 10500;

/** Passive drain of unsold bills per day (inclusive). */
export const CORPORATE_UNITS_DRAIN_MIN = 1;
export const CORPORATE_UNITS_DRAIN_MAX = 3;

const ISSUER_PREFIXES = [
  "Acme", "Northstar", "Bluefin", "Ironwood", "Summit", "Harbor", "Granite", "Vector",
  "Copperfield", "Brightline", "Redwood", "Fairway", "Silverton", "Catalyst", "Nimbus",
];

const ISSUER_SUFFIXES = [
  "Manufacturing", "Energy", "Logistics", "Holdings", "Capital", "Industries", "Partners",
  "Therapeutics", "Steel", "Retail", "Networks", "Finance",
];

const RATING_PROFILES = [
  { rating: "BBB", yieldMin: 0.046, yieldMax: 0.058, annualDefault: 0.018, recovery: 0.52 },
  { rating: "BB+", yieldMin: 0.055, yieldMax: 0.068, annualDefault: 0.028, recovery: 0.40 },
  { rating: "BB", yieldMin: 0.062, yieldMax: 0.078, annualDefault: 0.038, recovery: 0.32 },
  { rating: "B+", yieldMin: 0.072, yieldMax: 0.090, annualDefault: 0.055, recovery: 0.22 },
];

const TERM_CHOICES = [3, 5, 7, 10];

function ratingProfile(rating) {
  return RATING_PROFILES.find(p => p.rating === rating) || RATING_PROFILES[0];
}

/** New issue yield or quarterly repricing shock within the rating band. */
export function rollCorporateMarketYield(rating, params = {}, prevYield = null) {
  const profile = ratingProfile(rating);
  const spreadMult = Number.isFinite(params.corporateSpreadMult) ? params.corporateSpreadMult : 1;
  const yMin = profile.yieldMin * spreadMult;
  const yMax = profile.yieldMax * spreadMult;
  return rollYieldInBand(yMin, yMax, prevYield, params);
}

export function randomCorporateIssuerName(params = {}) {
  const rng = resolveRng(params);
  const a = ISSUER_PREFIXES[rng.int(0, ISSUER_PREFIXES.length - 1)];
  const b = ISSUER_SUFFIXES[rng.int(0, ISSUER_SUFFIXES.length - 1)];
  return `${a} ${b}`;
}

function intBetween(rng, min, max) {
  return rng.int(min, max);
}

function slotTarget(params) {
  const n = Number.isFinite(params.corporateOfferCount)
    ? Math.floor(params.corporateOfferCount)
    : CORPORATE_OFFER_COUNT;
  return Math.min(10, Math.max(1, n));
}

/**
 * Mint one primary-market corporate issue.
 */
export function mintCorporateOffer(params, seq, listedDay, usedNames) {
  const rng = resolveRng(params);
  let issuer = randomCorporateIssuerName(params);
  for (let attempt = 0; attempt < 48 && usedNames.has(issuer); attempt++) {
    issuer = randomCorporateIssuerName(params);
  }
  usedNames.add(issuer);

  const profile = RATING_PROFILES[rng.int(0, RATING_PROFILES.length - 1)];
  const yieldRate = rollCorporateMarketYield(profile.rating, params);
  const units =
    CORPORATE_UNITS_MIN +
    rng.int(0, CORPORATE_UNITS_MAX - CORPORATE_UNITS_MIN);
  const term = TERM_CHOICES[rng.int(0, TERM_CHOICES.length - 1)];

  return {
    id: `corp-${listedDay}-${seq}-${rng.id()}`,
    issuer,
    term,
    faceValue: 1000,
    yield: yieldRate,
    rating: profile.rating,
    annualDefaultProb: profile.annualDefault,
    recoveryRate: profile.recovery,
    initialUnits: units,
    unitsRemaining: units,
    listedDay,
    issuerDefaulted: false,
  };
}

/**
 * Three random corporate listings at game start.
 */
export function buildInitialCorporateBondOffers(params = {}) {
  const usedNames = new Set();
  const offers = [];
  let seq = 0;
  const target = slotTarget(params);
  for (let i = 0; i < target; i++) {
    seq += 1;
    offers.push(mintCorporateOffer(params, seq, 1, usedNames));
  }
  return { offers, corporateListingSeq: seq };
}

function isOfferActive(offer) {
  if (!offer || offer.issuerDefaulted) return false;
  if ((offer.unitsRemaining || 0) <= 0) return false;
  return true;
}

export function buyCorporateBond(state, offerId, qty = 1) {
  if (!state.unlockedBonds) {
    return appendLog(state, "Bond market locked — unlock on the Bonds tab (one-time fee).", "bad");
  }

  const want = Math.max(1, Math.floor(Number(qty)) || 1);
  const offers = state.corporateBondOffers || [];
  const idx = offers.findIndex(b => b.id === offerId);
  if (idx < 0) {
    return appendLog(state, "Corporate bond offer not found.", "bad");
  }

  const offer = offers[idx];
  if (!isOfferActive(offer)) {
    if (offer.issuerDefaulted) {
      return appendLog(state, `${offer.issuer} has defaulted — no new bonds available.`, "bad");
    }
    if ((offer.unitsRemaining || 0) <= 0) {
      return appendLog(state, `${offer.issuer} offering is sold out.`, "bad");
    }
    return appendLog(state, "Corporate bond offer is no longer available.", "bad");
  }

  const unitFace = offer.faceValue;
  const maxByCash = unitFace > 0 ? Math.floor(state.cash / unitFace) : 0;
  const maxByUnits = offer.unitsRemaining || 0;
  const bills = Math.min(want, maxByCash, maxByUnits);

  if (bills <= 0) {
    if (maxByCash <= 0) {
      return appendLog(
        state,
        `Need ${fmt(unitFace)} — only have ${fmt(state.cash)}.`,
        "bad"
      );
    }
    if (maxByUnits <= 0) {
      return appendLog(state, `${offer.issuer} offering is sold out.`, "bad");
    }
    return appendLog(state, "Could not buy corporate bonds.", "bad");
  }

  const totalFace = bills * unitFace;
  const rng = resolveRng({});
  const bond = {
    id: `${state.day}_${rng.id()}`,
    type: "corporate",
    issuer: offer.issuer,
    rating: offer.rating,
    faceValue: totalFace,
    billCount: bills,
    term: offer.term,
    yield: offer.yield,
    purchaseDay: state.day,
    maturityDay: state.day + offer.term * 365,
    couponAccrued: 0,
    offerId: offer.id,
  };

  const unitsLeft = offer.unitsRemaining - bills;
  const nextOffers = [...offers];
  nextOffers[idx] = { ...offer, unitsRemaining: unitsLeft };

  const next = {
    ...state,
    cash: state.cash - totalFace,
    bondHoldings: [...(state.bondHoldings || []), bond],
    corporateBondOffers: nextOffers,
  };

  const leftNote = `${unitsLeft.toLocaleString()} bill(s) left in offering`;
  const billsNote = bills > 1 ? ` (${bills.toLocaleString()} bills)` : "";
  let msg = `Bought ${offer.issuer} ${offer.term}yr bond (${offer.rating}) — face ${fmt(totalFace)}${billsNote}, yield ${(offer.yield * 100).toFixed(2)}%. ${leftNote}.`;
  if (bills < want) {
    msg += ` (Requested ${want.toLocaleString()} bills; filled ${bills.toLocaleString()}.)`;
  }
  return appendLog(next, msg, "good");
}

function dailyDefaultChance(annualProb) {
  const p = Number.isFinite(annualProb) ? annualProb : 0;
  return Math.min(1, Math.max(0, p / 365));
}

function retireReason(offer) {
  if (offer.issuerDefaulted) return "default";
  if ((offer.unitsRemaining || 0) <= 0) return "sold out";
  return null;
}

/**
 * Drain inventory, roll issuer defaults, retire ended issues, mint replacements (always {@link CORPORATE_OFFER_COUNT} slots).
 */
export function processCorporateBondsForDay(s, bondHoldings, cash, newDay, params = {}) {
  const rng = resolveRng(params);
  const drainMin = Number.isFinite(params.corporateUnitsDrainMin)
    ? params.corporateUnitsDrainMin
    : CORPORATE_UNITS_DRAIN_MIN;
  const drainMax = Number.isFinite(params.corporateUnitsDrainMax)
    ? params.corporateUnitsDrainMax
    : CORPORATE_UNITS_DRAIN_MAX;
  const defaultMult = Number.isFinite(params.corporateDefaultMult) ? params.corporateDefaultMult : 1;
  const target = slotTarget(params);

  const logLines = [];
  let bondRealizedPLDelta = 0;
  let nextCash = cash;
  const survivingHoldings = [...(bondHoldings || [])];
  let seq = Number.isFinite(s.corporateListingSeq) ? s.corporateListingSeq : target;

  let offers = (s.corporateBondOffers || []).map(offer => {
    if (offer.issuerDefaulted || (offer.unitsRemaining || 0) <= 0) return offer;
    const lo = Math.min(drainMin, drainMax);
    const hi = Math.max(drainMin, drainMax);
    const drain = intBetween(rng, lo, hi);
    const nextUnits = Math.max(0, offer.unitsRemaining - drain);
    if (nextUnits < offer.unitsRemaining) {
      return { ...offer, unitsRemaining: nextUnits };
    }
    return offer;
  });

  const resolveDefaultedHolding = (bond, recoveryRate) => {
    const idx = survivingHoldings.findIndex(b => b.id === bond.id);
    if (idx < 0) return;
    survivingHoldings.splice(idx, 1);
    const recovery = Math.round(bond.faceValue * recoveryRate);
    const couponPart = bond.couponAccrued || 0;
    const total = recovery + couponPart;
    const realizedPl = total - bond.faceValue;
    bondRealizedPLDelta += realizedPl;
    nextCash += total;
    logLines.push({
      msg: `${bond.issuer} bond defaulted — recovered ${fmt(recovery)} on ${fmt(bond.faceValue)} face (P/L ${fmtSignedMoney2(realizedPl)}).`,
      type: "bad",
      day: newDay,
    });
  };

  for (let oi = 0; oi < offers.length; oi++) {
    const offer = offers[oi];
    if (offer.issuerDefaulted) continue;
    const pDefault = dailyDefaultChance(offer.annualDefaultProb) * defaultMult;
    if (rng.random() >= pDefault) continue;

    const unsold = offer.unitsRemaining || 0;
    offers[oi] = { ...offer, issuerDefaulted: true, unitsRemaining: 0 };
    logLines.push({
      msg: `${offer.issuer} (${offer.rating}) defaulted — ${unsold} unsold bill(s) voided.`,
      type: "bad",
      day: newDay,
    });

    const affected = survivingHoldings.filter(
      b => b.type === "corporate" && b.offerId === offer.id
    );
    for (const bond of affected) {
      resolveDefaultedHolding(bond, offer.recoveryRate);
    }
  }

  const active = [];
  const usedNames = new Set();
  for (const offer of offers) {
    const reason = retireReason(offer);
    if (reason) {
      if (reason === "sold out") {
        logLines.push({
          msg: `${offer.issuer} ${offer.term}yr offering sold out.`,
          type: "info",
          day: newDay,
        });
      }
      continue;
    }
    usedNames.add(offer.issuer);
    active.push(offer);
  }

  while (active.length < target) {
    seq += 1;
    const newbie = mintCorporateOffer(params, seq, newDay, usedNames);
    active.push(newbie);
    logLines.push({
      msg: `New issue: ${newbie.issuer} ${newbie.term}yr (${newbie.rating}) — ${(newbie.yield * 100).toFixed(2)}% · ${newbie.unitsRemaining.toLocaleString()} bills available.`,
      type: "good",
      day: newDay,
    });
  }

  return {
    corporateBondOffers: active,
    corporateListingSeq: seq,
    bondHoldings: survivingHoldings,
    cash: nextCash,
    logLines,
    bondRealizedPLDelta,
  };
}
