// ============================================================
// MULTIPLAYER SERVER — WebSocket room hub
// ============================================================

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { RoomManager } from "./rooms.js";
import { parseMessage, makeMessage } from "./protocol.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const roomManager = new RoomManager();

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: roomManager.roomCount() }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(makeMessage(type, payload)));
  }
}

function broadcast(room, type, payload, exceptPlayerId = null) {
  for (const p of room.players.values()) {
    if (exceptPlayerId && p.playerId === exceptPlayerId) continue;
    send(p.ws, type, payload);
  }
}

wss.on("connection", ws => {
  let ctx = { playerId: null, roomCode: null };

  ws.on("message", raw => {
    let msg;
    try {
      msg = parseMessage(raw.toString());
    } catch (err) {
      send(ws, "error", { message: err.message });
      return;
    }

    const { type, payload } = msg;

    try {
      switch (type) {
        case "createRoom": {
          const result = roomManager.createRoom(payload.playerName, ws);
          ctx = { playerId: result.playerId, roomCode: result.roomCode };
          send(ws, "roomState", result.roomState);
          break;
        }
        case "joinRoom": {
          const result = roomManager.joinRoom(payload.roomCode, payload.playerName, ws);
          ctx = { playerId: result.playerId, roomCode: result.roomCode };
          send(ws, "roomState", result.roomState);
          const room = roomManager.getRoom(result.roomCode);
          if (room) {
            broadcast(room, "roomState", roomManager.roomState(room), result.playerId);
          }
          break;
        }
        case "reconnect": {
          const result = roomManager.reconnect(payload.roomCode, payload.playerId, payload.sessionToken, ws);
          ctx = { playerId: result.playerId, roomCode: result.roomCode };
          if (result.status === "playing") {
            send(ws, "gameStarted", result.gameStarted);
          } else {
            send(ws, "roomState", result.roomState);
          }
          break;
        }
        case "startGame": {
          const room = roomManager.requireRoom(ctx.roomCode);
          const result = roomManager.startGame(room, ctx.playerId);
          for (const p of room.players.values()) {
            send(p.ws, "gameStarted", {
              sharedMarket: result.sharedMarket,
              playerState: p.playerState,
              playerId: p.playerId,
              sessionToken: p.sessionToken,
              hostId: room.hostId,
              roomCode: room.roomCode,
              params: room.params,
            });
          }
          break;
        }
        case "advanceDay": {
          const room = roomManager.requireRoom(ctx.roomCode);
          const n = Math.max(1, Math.min(365, parseInt(payload.n, 10) || 1));
          const result = roomManager.advanceDay(room, ctx.playerId, n);
          for (const p of room.players.values()) {
            send(p.ws, "dayAdvanced", {
              sharedMarket: result.sharedMarket,
              playerState: p.playerState,
              leaderboard: result.leaderboard,
              finished: result.finished,
            });
          }
          break;
        }
        case "action": {
          const room = roomManager.requireRoom(ctx.roomCode);
          const result = roomManager.applyAction(room, ctx.playerId, payload.actionType, payload.args || {});
          send(ws, "actionResult", {
            ok: result.ok,
            error: result.error,
            playerState: result.player,
            sharedMarket: result.shared,
          });
          if (result.ok && result.broadcast) {
            broadcast(room, "leaderboard", { leaderboard: result.leaderboard }, ctx.playerId);
            send(ws, "leaderboard", { leaderboard: result.leaderboard });
          }
          break;
        }
        case "leaveRoom": {
          if (ctx.roomCode) {
            const room = roomManager.leave(ctx.roomCode, ctx.playerId);
            if (room) broadcast(room, "roomState", roomManager.roomState(room));
          }
          ctx = { playerId: null, roomCode: null };
          send(ws, "leftRoom", {});
          break;
        }
        default:
          send(ws, "error", { message: `Unknown message type: ${type}` });
      }
    } catch (err) {
      send(ws, "error", { message: err.message || "Server error" });
    }
  });

  ws.on("close", () => {
    if (ctx.roomCode && ctx.playerId) {
      const room = roomManager.markDisconnected(ctx.roomCode, ctx.playerId);
      if (room) broadcast(room, "roomState", roomManager.roomState(room));
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Bigstacks multiplayer server listening on :${PORT}`);
});
