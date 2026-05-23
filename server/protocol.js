const MAX_PLAYERS = 8;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DISCONNECT_TTL_MS = 5 * 60 * 1000;

export function makeMessage(type, payload = {}) {
  return { type, payload };
}

export function parseMessage(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!data || typeof data.type !== "string") {
    throw new Error("Message must have a type");
  }
  return { type: data.type, payload: data.payload || {} };
}

export function randomRoomCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function randomId(prefix = "") {
  const hex = Math.random().toString(36).slice(2, 10);
  return prefix ? `${prefix}${hex}` : hex;
}

export function randomSessionToken() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export { MAX_PLAYERS, DISCONNECT_TTL_MS };
