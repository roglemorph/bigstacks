import { appendLog, fmt } from "./shared.js";

export const CORPORATE_BOND_OFFERS = [
  { id: "acme-5y", issuer: "Acme Manufacturing", term: 5, faceValue: 1000, yield: 0.058, rating: "BBB" },
  { id: "northstar-7y", issuer: "Northstar Energy", term: 7, faceValue: 1000, yield: 0.066, rating: "BB+" },
  { id: "bluefin-10y", issuer: "Bluefin Logistics", term: 10, faceValue: 1000, yield: 0.072, rating: "BB" },
];

export function buyCorporateBond(state, offerId) {
  const offer = (state.corporateBondOffers || []).find(b => b.id === offerId);
  if (!offer) return appendLog(state, "Corporate bond offer not found.", "bad");
  if (offer.faceValue > state.cash) return appendLog(state, `Need ${fmt(offer.faceValue)} — only have ${fmt(state.cash)}.`, "bad");
  const bond = {
    id: state.day + "_" + Math.random().toString(36).slice(2, 6),
    type: "corporate",
    issuer: offer.issuer,
    rating: offer.rating,
    faceValue: offer.faceValue,
    term: offer.term,
    yield: offer.yield,
    purchaseDay: state.day,
    maturityDay: state.day + offer.term * 365,
    couponAccrued: 0,
  };
  const next = {
    ...state,
    cash: state.cash - offer.faceValue,
    bondHoldings: [...(state.bondHoldings || []), bond],
  };
  return appendLog(
    next,
    `Bought ${offer.issuer} ${offer.term}yr bond (${offer.rating}) — face ${fmt(offer.faceValue)}, yield ${(offer.yield * 100).toFixed(2)}%.`,
    "good"
  );
}
