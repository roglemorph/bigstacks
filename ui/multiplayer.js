import { mergeForRender } from "../multiplayer/state.js";

const DEFAULT_WS =
  typeof window !== "undefined" && window.__BIGSTACKS_WS__
    ? window.__BIGSTACKS_WS__
    : `ws://${location.hostname || "localhost"}:3001`;

export class MultiplayerClient {
  constructor(url = DEFAULT_WS) {
    this.url = url;
    this.ws = null;
    this.handlers = new Map();
    this.session = {
      playerId: null,
      roomCode: null,
      sessionToken: null,
      hostId: null,
    };
    this.sharedMarket = null;
    this.playerState = null;
    this.leaderboard = [];
    this.status = "disconnected";
  }

  on(type, fn) {
    this.handlers.set(type, fn);
  }

  emit(type, payload) {
    this.handlers.get(type)?.(payload);
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this.status = "connected";
        this.emit("connection", { connected: true });
        resolve();
      };
      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));
      this.ws.onclose = () => {
        this.status = "disconnected";
        this.emit("connection", { connected: false });
      };
      this.ws.onmessage = ev => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        this.handle(msg.type, msg.payload);
      };
    });
  }

  tryReconnect() {
    const saved = readSession();
    if (!saved?.roomCode || !saved?.playerId || !saved?.sessionToken) return;
    this.send("reconnect", saved);
  }

  send(type, payload = {}) {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to server");
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }

  handle(type, payload) {
    switch (type) {
      case "roomState":
        if (payload.playerId) {
          this.session.playerId = payload.playerId;
          this.session.roomCode = payload.roomCode;
          this.session.sessionToken = payload.sessionToken;
          writeSession(this.session);
        }
        if (payload.hostId) {
          this.session.hostId = payload.hostId;
        }
        this.emit("roomState", payload);
        break;
      case "gameStarted":
        this.session.playerId = payload.playerId;
        this.session.roomCode = payload.roomCode;
        this.session.sessionToken = payload.sessionToken;
        this.session.hostId = payload.hostId;
        this.sharedMarket = payload.sharedMarket;
        this.playerState = payload.playerState;
        this.leaderboard = payload.leaderboard || [];
        writeSession(this.session);
        this.emit("gameStarted", payload);
        break;
      case "dayAdvanced":
        this.sharedMarket = payload.sharedMarket;
        this.playerState = payload.playerState;
        this.leaderboard = payload.leaderboard || [];
        this.emit("dayAdvanced", payload);
        break;
      case "actionResult":
        if (payload.ok) {
          this.playerState = payload.playerState;
          if (payload.sharedMarket) this.sharedMarket = payload.sharedMarket;
        }
        this.emit("actionResult", payload);
        break;
      case "autobuySynced":
        if (payload.ok && payload.playerState) {
          this.playerState = payload.playerState;
        }
        this.emit("autobuySynced", payload);
        break;
      case "leaderboard":
        this.leaderboard = payload.leaderboard || [];
        this.emit("leaderboard", payload);
        break;
      case "leftRoom":
        this.clearSession();
        this.emit("leftRoom", payload);
        break;
      case "error":
        this.emit("error", payload);
        break;
      default:
        this.emit(type, payload);
    }
  }

  createRoom(playerName) {
    this.send("createRoom", { playerName });
  }

  joinRoom(roomCode, playerName) {
    this.send("joinRoom", { roomCode: roomCode.trim().toUpperCase(), playerName });
  }

  startGame() {
    this.send("startGame", {});
  }

  advanceDay(n = 1, autobuy = null) {
    this.send("advanceDay", { n, autobuy });
  }

  action(actionType, args = {}) {
    this.send("action", { actionType, args });
  }

  syncAutobuy(config) {
    this.send("syncAutobuy", config);
  }

  leaveRoom() {
    this.send("leaveRoom", {});
  }

  getMergedState() {
    if (!this.sharedMarket || !this.playerState) return null;
    return mergeForRender(this.sharedMarket, this.playerState);
  }

  isHost() {
    return this.session.playerId && this.session.hostId === this.session.playerId;
  }

  clearSession() {
    this.session = { playerId: null, roomCode: null, sessionToken: null, hostId: null };
    this.sharedMarket = null;
    this.playerState = null;
    this.leaderboard = [];
    clearStoredSession();
  }
}

function writeSession(session) {
  try {
    sessionStorage.setItem("bigstacks-mp-session", JSON.stringify(session));
  } catch { /* ignore */ }
}

function readSession() {
  try {
    const raw = sessionStorage.getItem("bigstacks-mp-session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    sessionStorage.removeItem("bigstacks-mp-session");
  } catch { /* ignore */ }
}

export function defaultWsUrl() {
  return DEFAULT_WS;
}
