/**
 * Extract chart helpers and canvas drawing from ui/app.js into ui/charts.js.
 */
const fs = require("fs");
const path = require("path");

const appPath = path.join(__dirname, "..", "ui", "app.js");
const chartsPath = path.join(__dirname, "..", "ui", "charts.js");
let lines = fs.readFileSync(appPath, "utf8").split("\n");

const startMarker = "/** In-game days shown on daily charts";
const endMarker = "function drawYieldCurve(s) {";
const drawYieldEndMarker = "function updateBondPreview(s) {";

let startIdx = lines.findIndex(l => l.includes(startMarker));
let drawStartIdx = lines.findIndex(l => l.trim() === endMarker);
let drawEndIdx = lines.findIndex(l => l.trim() === drawYieldEndMarker);

if (startIdx < 0 || drawStartIdx < 0 || drawEndIdx < 0) {
  console.error("markers not found", { startIdx, drawStartIdx, drawEndIdx });
  process.exit(1);
}

const helperBlock = lines.slice(startIdx, drawStartIdx).join("\n");
const drawBlock = lines.slice(drawStartIdx, drawEndIdx).join("\n");

const chartsSrc = `import { fmt } from "./format.js";
import { snapshotNetWorthStack } from "../game.js";
import { YIELD_CURVE } from "../game.js";

${helperBlock}

${drawBlock}
`;

fs.writeFileSync(chartsPath, chartsSrc, "utf8");

// Remove extracted blocks from app.js and add import
const before = lines.slice(0, startIdx);
const after = lines.slice(drawEndIdx);

// Fix netWorthStackSeriesForChart to accept recentDays param in charts - it uses netWorthRecentDays from closure
// Keep netWorthStackSeriesForChart in app.js - it's in helper block. Need to adjust.

console.log("Wrote charts.js; manual wiring may be needed for netWorthRecentDays");
