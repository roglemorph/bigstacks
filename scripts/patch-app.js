const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "ui", "app.js");
let src = fs.readFileSync(appPath, "utf8");

const newImports = `import { newState, nextDay, buyIndexFund, sellIndexFund, normalizeIndexFundAutobuy, normalizeTreasuryBondAutobuy, buyBond, buyCorporateBond, sellBondEarly, buyCrypto, sellCrypto, buyStock, sellStock, buyOption, sellOption, sellOptionLot, exerciseOptionLot, openPerp, closePerp, closePerpLot, playCasinoHiLo, portfolioValue, netWorth, snapshotNetWorthStack, totalReturn, YIELD_CURVE, yieldForTerm, setOptionMarketDte, normalizeOptionMarketDte, openOptionHoldings, markOptionHolding, optionLotUnrealizedPLAtMark, optionLotUnrealizedPLIfExercised, optionsHoldingsUnrealizedPL, openPerpPositions, perpMarkPrice, perpFundingRateAnnual, perpOpenPremiumTotal, perpHoldingsMarkValue, perpHoldingsUnrealizedPL, perpPositionUnrealizedPL, perpPositionTotalPL, unlockBonds, unlockStocks, unlockCrypto, unlockOptions, UNLOCK_COST_BONDS, UNLOCK_COST_STOCKS, UNLOCK_COST_CRYPTOS, UNLOCK_COST_OPTIONS, MONTHLY_INCOME_AMOUNT, normalizeMarketCardAutobuy, marketCardAutobuyKey } from "../game.js?v=0.1.0";
import {
	fmt, fmtSigned, fmtIncomeAmount, formatPlPct, plTintIntensity, plTintDir,
	applyPlTintToElement, plTintHtml, setPlDisplay, formatMarketCardOrderTotal,
	formatCorpBondUnits, formatPerpFundingAnnText, formatTrailingPctChipText, trailingPctChipClass,
} from "./format.js";
import { readParams, applyParamsToForm, stipendPer30d } from "./params.js";
import {
	hasSavedGame, saveGameToStorage, loadGameFromStorage, clearSavedGame, formatSaveTimestamp,
} from "./storage.js";
`;

src = src.replace(/^import \{ newState[\s\S]*?from "\.\/game\.js\?v=0.1.0";\n\n/, `${newImports}\n`);

src = src.replace(
	/\nconst fmt = n => "\$" \+ Math\.round\(n\)\.toLocaleString\(\);\nconst fmtSigned = n => `\$\{n >= 0 \? "\+" : "-"\}\$\{fmt\(Math\.abs\(n\)\)\}`;\nfunction fmtIncomeAmount\(n\) \{[\s\S]*?\n\}\nfunction stipendPer30d\(params\) \{[\s\S]*?\n\}\n/,
	"\n"
);

src = src.replace(
	/\nfunction formatPlPct\(pct\) \{[\s\S]*?\n\}\nfunction plTintIntensity[\s\S]*?\n\}\nfunction formatMarketCardOrderTotal[\s\S]*?\n\}\n/,
	"\n"
);

src = src.replace(
	/\nfunction setPlDisplay\(el, pl, baseClass\) \{\n\tif \(!el\) return;\n\tel\.textContent = fmtSigned\(pl\);\n\tel\.className = baseClass \+ " " \+ \(pl >= 0 \? "pos" : "neg"\);\n\}\n\nfunction cumRealized/,
	"\nfunction cumRealized"
);

src = src.replace(/\nfunction readParams\(\) \{\nreturn \{[\s\S]*?\n\};\n\}\n\n/, "\n");

src = src.replace(
	/\nfunction formatTrailingPctChipText\(pct, labelDays = DISPLAY_RETURN_DAYS\) \{[\s\S]*?\n\}\nfunction trailingPctChipClass\(pct\) \{[\s\S]*?\n\}\n/,
	"\n"
);

src = src.replace(/\n  function formatCorpBondUnits\(n\) \{[\s\S]*?\n  \}\n/, "\n");
src = src.replace(
	/\n  function formatPerpFundingAnnText\(s\) \{\n    const ann = perpFundingRateAnnual\(s\);\n    return `\$\{\(ann \* 100\)\.toFixed\(2\)\}% ann\.`;\n  \}\n/,
	"\n"
);

fs.writeFileSync(appPath, src, "utf8");
console.log("patched app.js");
