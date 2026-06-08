import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

fs.writeFileSync(
	path.join(root, "version.js"),
	`export const APP_VERSION = "${version}";\n`
);

const serverPkgPath = path.join(root, "server", "package.json");
const serverPkg = JSON.parse(fs.readFileSync(serverPkgPath, "utf8"));
serverPkg.version = version;
fs.writeFileSync(serverPkgPath, JSON.stringify(serverPkg, null, 2) + "\n");

const cacheBustTargets = [
	"index.html",
	"scripts/trim-index-html.js",
	"scripts/patch-app.js",
	"ui/app.js",
];

for (const rel of cacheBustTargets) {
	const filePath = path.join(root, rel);
	let content = fs.readFileSync(filePath, "utf8");
	content = content.replace(/\?v=[^"'\s`]+/g, `?v=${version}`);
	fs.writeFileSync(filePath, content);
}

console.log(`Synced version ${version}`);
