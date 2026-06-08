const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "index.html");
const lines = fs.readFileSync(htmlPath, "utf8").split(/\r?\n/);
const kept = lines.slice(0, 2296);
kept.push('\t\t<script type="module" src="./ui/app.js?v=0.1.0"></script>');
kept.push("\t</body>");
kept.push("</html>");
fs.writeFileSync(htmlPath, kept.join("\n"), "utf8");
console.log("index.html trimmed to", kept.length, "lines");
