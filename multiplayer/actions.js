// ============================================================
// MULTIPLAYER — server-validated player actions
// ============================================================

import { mergeForRender, splitPlayerFromMerged } from "./state.js";

const ACTION_MAP = {
  buyIndexFund: "buyIndexFund",
  sellIndexFund: "sellIndexFund",
  buyBond: "buyBond",
  sellBondEarly: "sellBondEarly",
  buyCorporateBond: "buyCorporateBond",
  buyCrypto: "buyCrypto",
  sellCrypto: "sellCrypto",
  buyStock: "buyStock",
  sellStock: "sellStock",
  buyOption: "buyOption",
  sellOption: "sellOption",
  sellOptionLot: "sellOptionLot",
  exerciseOptionLot: "exerciseOptionLot",
  openPerp: "openPerp",
  closePerp: "closePerp",
  closePerpLot: "closePerpLot",
  unlockBonds: "unlockBonds",
  unlockStocks: "unlockStocks",
  unlockCrypto: "unlockCrypto",
  unlockOptions: "unlockOptions",
  playCasinoHiLo: "playCasinoHiLo",
  setOptionMarketDte: "setOptionMarketDte",
};

/**
 * Apply a trade/action on the server for one player.
 * @param {object} player
 * @param {object} shared
 * @param {string} actionType
 * @param {object} args
 * @param {object} params
 * @param {Record<string, Function>} handlers - game.js action functions
 */
export function applyPlayerAction(player, shared, actionType, args, params, handlers) {
  if (!ACTION_MAP[actionType]) {
    return { ok: false, error: `Unknown action: ${actionType}` };
  }
  const fn = handlers[actionType];
  if (typeof fn !== "function") {
    return { ok: false, error: `Action not supported: ${actionType}` };
  }

  let merged = mergeForRender(shared, player);
  let next;

  try {
    switch (actionType) {
      case "buyIndexFund":
        next = fn(merged, args.assetId, args.qty);
        break;
      case "sellIndexFund":
        next = fn(merged, args.assetId, args.qty);
        break;
      case "buyBond":
        next = fn(merged, args.face, args.term);
        break;
      case "sellBondEarly":
        next = fn(merged, args.id);
        break;
      case "buyCorporateBond":
        next = fn(merged, args.offerId, args.qty);
        break;
      case "buyCrypto":
      case "sellCrypto":
      case "buyStock":
      case "sellStock":
      case "buyOption":
      case "sellOption":
        next = fn(merged, args.assetId, args.qty);
        break;
      case "sellOptionLot":
        next = fn(merged, args.holdingId, args.qty);
        break;
      case "exerciseOptionLot":
        next = fn(merged, args.holdingId, args.qty);
        break;
      case "openPerp":
        next = fn(merged, args.side, args.qty, params);
        break;
      case "closePerp":
        next = fn(merged, args.side, args.qty);
        break;
      case "closePerpLot":
        next = fn(merged, args.lotId, args.qty);
        break;
      case "unlockBonds":
      case "unlockStocks":
      case "unlockCrypto":
      case "unlockOptions":
        next = fn(merged);
        break;
      case "playCasinoHiLo":
        next = fn(merged, args.bet, args.guessHi, params);
        break;
      case "setOptionMarketDte":
        next = fn(merged, params, args.dte);
        break;
      default:
        return { ok: false, error: `Unhandled action: ${actionType}` };
    }
  } catch (err) {
    return { ok: false, error: err.message || "Action failed" };
  }

  const playerNext = splitPlayerFromMerged(next, shared);
  return { ok: true, player: playerNext, shared };
}

export { ACTION_MAP };
