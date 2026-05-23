import {
	SAVE_STORAGE_KEY,
	buildSavePayload,
	buildExportFilename,
	parseSavePayload,
	payloadFromParsed,
	savePayloadToJson,
} from "../saveLoad.js";

export { SAVE_STORAGE_KEY };

export function hasSavedGame() {
	try {
		return !!localStorage.getItem(SAVE_STORAGE_KEY);
	} catch {
		return false;
	}
}

export function saveGameToStorage(state, params, meta = {}) {
	try {
		const payload = buildSavePayload(state, params, meta);
		localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
		return true;
	} catch {
		return false;
	}
}

export function writeParsedSaveToStorage(parsed) {
	const payload = payloadFromParsed(parsed);
	if (!payload) return false;
	try {
		localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
		return true;
	} catch {
		return false;
	}
}

export function loadGameFromStorage() {
	try {
		const raw = localStorage.getItem(SAVE_STORAGE_KEY);
		return raw ? parseSavePayload(raw) : null;
	} catch {
		return null;
	}
}

export function clearSavedGame() {
	try {
		localStorage.removeItem(SAVE_STORAGE_KEY);
		return true;
	} catch {
		return false;
	}
}

export function formatSaveTimestamp(savedAt) {
	if (!Number.isFinite(savedAt)) return "";
	try {
		return new Date(savedAt).toLocaleString();
	} catch {
		return "";
	}
}

export function downloadSaveFile(state, params, meta = {}) {
	try {
		const payload = buildSavePayload(state, params, meta);
		const json = savePayloadToJson(payload);
		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = buildExportFilename(state, payload.savedAt);
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		return true;
	} catch {
		return false;
	}
}

export async function readSaveFromFile(file) {
	if (!file) return null;
	try {
		const text = await file.text();
		return parseSavePayload(text);
	} catch {
		return null;
	}
}
