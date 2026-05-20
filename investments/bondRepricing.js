import { rollCorporateMarketYield } from "./corporateBonds.js";

/** In-game quarter length (three 30-day months). */
export const BOND_QUARTER_DAYS = 90;

export function isBondQuarterEnd(day) {
  return day > 0 && day % BOND_QUARTER_DAYS === 0;
}

/**
 * Quarterly repricing: corporate primary listings get a yield refresh.
 * Held treasuries and held corporates keep the coupon locked at purchase.
 */
export function repriceBondsForQuarter(state, params = {}) {
  if (!isBondQuarterEnd(state.day)) {
    return { bondHoldings: state.bondHoldings, corporateBondOffers: state.corporateBondOffers, logLines: [] };
  }

  const day = state.day;
  const logLines = [];
  let listingMoves = 0;

  const corporateBondOffers = (state.corporateBondOffers || []).map(offer => {
    if (offer.issuerDefaulted || (offer.unitsRemaining || 0) <= 0) return offer;
    const newYield = rollCorporateMarketYield(offer.rating, params, offer.yield);
    if (Math.abs(newYield - offer.yield) < 0.00005) return offer;
    listingMoves += 1;
    return { ...offer, yield: newYield };
  });

  if (listingMoves > 0) {
    logLines.push({
      msg: `Quarterly corporate bond repricing (day ${day}): ${listingMoves} listing quote(s) updated.`,
      type: "info",
      day,
    });
  }

  return { bondHoldings: state.bondHoldings, corporateBondOffers, logLines };
}
