import {
  newState,
  nextDay,
  buyIndexFund,
  sellIndexFund,
  buyBond,
  sellBondEarly,
  buyCorporateBond,
  buyCrypto,
  sellCrypto,
  buyStock,
  sellStock,
  buyOption,
  sellOption,
  sellOptionLot,
  exerciseOptionLot,
  openPerp,
  closePerp,
  closePerpLot,
  unlockBonds,
  unlockStocks,
  unlockCrypto,
  unlockOptions,
  playCasinoHiLo,
  setOptionMarketDte,
  netWorth,
} from "../game.js";
import {
  buildRoomMarket,
  newPlayerState,
  leaderboardEntry,
  sortLeaderboard,
  mergeForRender,
} from "../multiplayer/state.js";
import { advanceSharedMarket, advancePlayerAfterShared } from "../multiplayer/advance.js";
import { applyPlayerAction } from "../multiplayer/actions.js";
import { applyAutobuyConfig } from "../multiplayer/autobuy.js";
import {
  randomRoomCode,
  randomId,
  randomSessionToken,
  MAX_PLAYERS,
  DISCONNECT_TTL_MS,
} from "./protocol.js";

const DEFAULT_PARAMS = {};

const ACTION_HANDLERS = {
  buyIndexFund,
  sellIndexFund,
  buyBond,
  sellBondEarly,
  buyCorporateBond,
  buyCrypto,
  sellCrypto,
  buyStock,
  sellStock,
  buyOption,
  sellOption,
  sellOptionLot,
  exerciseOptionLot,
  openPerp,
  closePerp,
  closePerpLot,
  unlockBonds,
  unlockStocks,
  unlockCrypto,
  unlockOptions,
  playCasinoHiLo,
  setOptionMarketDte,
};

export class RoomManager {
  constructor() {
    /** @type {Map<string, object>} */
    this.rooms = new Map();
  }

  roomCount() {
    return this.rooms.size;
  }

  getRoom(code) {
    return this.rooms.get(code?.toUpperCase()) || null;
  }

  requireRoom(code) {
    const room = this.getRoom(code);
    if (!room) throw new Error("Room not found");
    return room;
  }

  createRoom(playerName, ws) {
    let code = randomRoomCode();
    while (this.rooms.has(code)) code = randomRoomCode();

    const hostId = randomId("p");
    const room = {
      roomCode: code,
      hostId,
      status: "lobby",
      sharedMarket: null,
      prevSharedMarket: null,
      params: { ...DEFAULT_PARAMS },
      seed: null,
      players: new Map(),
      createdAt: Date.now(),
    };

    this.addPlayer(room, hostId, playerName, ws);
    this.rooms.set(code, room);

    return {
      playerId: hostId,
      roomCode: code,
      sessionToken: room.players.get(hostId).sessionToken,
      roomState: this.roomStateForPlayer(room, hostId),
    };
  }

  joinRoom(roomCode, playerName, ws) {
    const code = roomCode?.toUpperCase();
    const room = this.getRoom(code);
    if (!room) throw new Error("Room not found");
    if (room.status !== "lobby") throw new Error("Game already started");

    // Same browser tab reconnecting to a room it is already in — don't add a duplicate player.
    for (const p of room.players.values()) {
      if (p.ws === ws) {
        p.displayName = (playerName || p.displayName || "Player").slice(0, 24);
        p.connected = true;
        p.disconnectedAt = null;
        return {
          playerId: p.playerId,
          roomCode: code,
          sessionToken: p.sessionToken,
          roomState: this.roomStateForPlayer(room, p.playerId),
        };
      }
    }

    if (room.players.size >= MAX_PLAYERS) throw new Error("Room is full");

    const playerId = randomId("p");
    this.addPlayer(room, playerId, playerName, ws);

    return {
      playerId,
      roomCode: code,
      sessionToken: room.players.get(playerId).sessionToken,
      roomState: this.roomStateForPlayer(room, playerId),
    };
  }

  addPlayer(room, playerId, playerName, ws) {
    room.players.set(playerId, {
      playerId,
      displayName: (playerName || "Player").slice(0, 24),
      ws,
      sessionToken: randomSessionToken(),
      playerState: null,
      connected: true,
      disconnectedAt: null,
    });
  }

  roomState(room) {
    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      status: room.status,
      players: [...room.players.values()].map(p => ({
        playerId: p.playerId,
        displayName: p.displayName,
        connected: p.connected,
      })),
    };
  }

  /** Lobby snapshot plus credentials for the receiving client only. */
  roomStateForPlayer(room, playerId) {
    const player = room.players.get(playerId);
    return {
      ...this.roomState(room),
      playerId,
      sessionToken: player?.sessionToken ?? null,
    };
  }

  reconnect(roomCode, playerId, sessionToken, ws) {
    const room = this.requireRoom(roomCode);
    const player = room.players.get(playerId);
    if (!player || player.sessionToken !== sessionToken) {
      throw new Error("Invalid reconnect credentials");
    }
    player.ws = ws;
    player.connected = true;
    player.disconnectedAt = null;

    if (room.status === "playing") {
      return {
        playerId,
        roomCode: room.roomCode,
        status: "playing",
        gameStarted: {
          sharedMarket: room.sharedMarket,
          playerState: player.playerState,
          playerId,
          sessionToken: player.sessionToken,
          hostId: room.hostId,
          roomCode: room.roomCode,
          params: room.params,
          leaderboard: this.buildLeaderboard(room),
        },
      };
    }

    return {
      playerId,
      roomCode: room.roomCode,
      status: "lobby",
      roomState: this.roomStateForPlayer(room, playerId),
    };
  }

  markDisconnected(roomCode, playerId) {
    const room = this.getRoom(roomCode);
    if (!room) return null;
    const player = room.players.get(playerId);
    if (!player) return room;

    player.connected = false;
    player.disconnectedAt = Date.now();
    player.ws = null;

    if (playerId === room.hostId) {
      const nextHost = [...room.players.values()].find(p => p.connected && p.playerId !== playerId)
        || [...room.players.values()].find(p => p.playerId !== playerId);
      if (nextHost) room.hostId = nextHost.playerId;
    }

    this.pruneRoom(room);
    return room;
  }

  leave(roomCode, playerId) {
    const room = this.getRoom(roomCode);
    if (!room) return null;

    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.roomCode);
      return null;
    }

    if (room.hostId === playerId) {
      room.hostId = room.players.keys().next().value;
    }

    return room;
  }

  pruneRoom(room) {
    const now = Date.now();
    for (const [id, p] of room.players) {
      if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > DISCONNECT_TTL_MS) {
        room.players.delete(id);
      }
    }
    if (room.players.size === 0) {
      this.rooms.delete(room.roomCode);
    }
  }

  startGame(room, hostId) {
    if (room.hostId !== hostId) throw new Error("Only the host can start the game");
    if (room.status !== "lobby") throw new Error("Game already started");
    if (room.players.size < 1) throw new Error("Need at least one player");

    const seed = Math.floor(Math.random() * 0x7fffffff);
    const boot = buildRoomMarket(seed, room.params, newState);
    room.seed = seed;
    room.params = boot.params;
    room.sharedMarket = boot.market;
    room.prevSharedMarket = JSON.parse(JSON.stringify(boot.market));
    room.status = "playing";

    for (const p of room.players.values()) {
      p.playerState = newPlayerState(room.sharedMarket, room.params, {
        playerId: p.playerId,
        displayName: p.displayName,
      });
    }

    return { sharedMarket: room.sharedMarket };
  }

  advanceDay(room, hostId, n) {
    if (room.hostId !== hostId) throw new Error("Only the host can advance the day");
    if (room.status !== "playing") throw new Error("Game not started");

    for (let i = 0; i < n; i++) {
      if (room.sharedMarket.day >= room.sharedMarket.maxDays) break;
      const prev = JSON.parse(JSON.stringify(room.sharedMarket));
      room.sharedMarket = advanceSharedMarket(room.sharedMarket, room.params, nextDay);
      for (const p of room.players.values()) {
        p.playerState = advancePlayerAfterShared(
          p.playerState,
          prev,
          room.sharedMarket,
          room.params
        );
      }
      room.prevSharedMarket = prev;
    }

    const leaderboard = this.buildLeaderboard(room);
    const finished = room.sharedMarket.day >= room.sharedMarket.maxDays;

    return {
      sharedMarket: room.sharedMarket,
      leaderboard,
      finished,
    };
  }

  applyAction(room, playerId, actionType, args) {
    if (room.status !== "playing") throw new Error("Game not started");
    const player = room.players.get(playerId);
    if (!player) throw new Error("Player not found");

    const result = applyPlayerAction(
      player.playerState,
      room.sharedMarket,
      actionType,
      args,
      room.params,
      ACTION_HANDLERS
    );

    if (!result.ok) return result;

    player.playerState = result.player;
    const leaderboard = this.buildLeaderboard(room);

    return {
      ok: true,
      player: result.player,
      shared: room.sharedMarket,
      leaderboard,
      broadcast: true,
    };
  }

  syncAutobuy(room, playerId, config) {
    if (room.status !== "playing") throw new Error("Game not started");
    const player = room.players.get(playerId);
    if (!player) throw new Error("Player not found");
    player.playerState = applyAutobuyConfig(player.playerState, config);
    return { ok: true, playerState: player.playerState };
  }

  buildLeaderboard(room) {
    const entries = [...room.players.values()].map(p =>
      leaderboardEntry(p.playerState, room.sharedMarket, netWorth)
    );
    return sortLeaderboard(entries);
  }
}
