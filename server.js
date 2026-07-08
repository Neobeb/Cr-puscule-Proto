const fs = require("fs");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const gameEngine = require("./web_play/game.js");

const port = Number(process.env.PORT || 10000);
const webDir = path.resolve(__dirname, "web_play");
const simulatorDir = path.resolve(__dirname, "simulateur_v5");

const rooms = new Map();
const streams = new Map();
const scoringFile = path.join(webDir, "scoring_overrides.json");

const BOT_DELAY_MS = 450;
const BOT_PROFILES = {
  best: { name: "IA" },
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return rooms.has(code) ? roomCode() : code;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function loadScoringOverrides() {
  try {
    if (!fs.existsSync(scoringFile)) return;
    const overrides = JSON.parse(fs.readFileSync(scoringFile, "utf8"));
    gameEngine.applyCardOverrides(overrides);
  } catch (error) {
    console.error("Impossible de charger les reglages de scoring:", error.message);
  }
}

function saveScoringOverrides(overrides) {
  fs.writeFileSync(scoringFile, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Payload trop lourd."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("JSON invalide."));
      }
    });
    req.on("error", reject);
  });
}

function cleanName(value) {
  const name = String(value || "").trim().slice(0, 24);
  return name || "Auteur";
}

function cleanBotProfile(value) {
  return "best";
}

function getRoom(code) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) throw new Error("Salon introuvable.");
  return room;
}

function ensurePlayer(room, playerId) {
  if (!room.players.some(player => player.id === playerId)) throw new Error("Joueur introuvable dans ce salon.");
}

function ensureHost(room, playerId) {
  ensurePlayer(room, playerId);
  if (room.hostId !== playerId) throw new Error("Seul l'hote peut faire ca.");
}

function createRoom(name) {
  const code = roomCode();
  const player = { id: randomUUID(), name: cleanName(name) };
  const room = {
    code,
    hostId: player.id,
    players: [player],
    game: null,
    botTimer: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, player };
}

function joinRoom(code, name) {
  const room = getRoom(code);
  if (room.game) throw new Error("La partie est deja lancee.");
  if (room.players.length >= 4) throw new Error("Le salon est complet.");
  const player = { id: randomUUID(), name: cleanName(name) };
  room.players.push(player);
  touch(room);
  return { room, player };
}

function botName(room, profile) {
  const base = BOT_PROFILES[profile].name;
  let name = base;
  let index = 2;
  while (room.players.some(player => player.name === name)) {
    name = `${base} ${index}`;
    index++;
  }
  return name;
}

function addBot(room, profileValue) {
  if (room.game) throw new Error("La partie est deja lancee.");
  if (room.players.length >= 4) throw new Error("Le salon est complet.");
  const profile = cleanBotProfile(profileValue);
  const player = {
    id: `bot-${randomUUID()}`,
    name: botName(room, profile),
    isBot: true,
    botProfile: profile,
  };
  room.players.push(player);
  touch(room);
  return player;
}

function markPlayerAsBot(player) {
  player.isBot = true;
  player.botProfile = cleanBotProfile(player.botProfile);
  if (!/\(IA\)$/.test(player.name)) player.name = `${player.name} (IA)`.slice(0, 28);
}

function leaveRoom(room, playerId) {
  const index = room.players.findIndex(player => player.id === playerId);
  if (index < 0) throw new Error("Joueur introuvable dans ce salon.");

  if (room.game) {
    const roomPlayer = room.players[index];
    const gamePlayer = room.game.players.find(player => player.id === playerId);
    markPlayerAsBot(roomPlayer);
    if (gamePlayer) markPlayerAsBot(gamePlayer);
    if (room.game.log) {
      room.game.log.unshift(`${roomPlayer.name} prend la suite en IA.`);
      room.game.log = room.game.log.slice(0, 80);
    }
    touch(room);
    scheduleBots(room);
    return { room, convertedToBot: true, deleted: false };
  }

  room.players.splice(index, 1);
  if (!room.players.length) {
    rooms.delete(room.code);
    streams.delete(room.code);
    return { room: null, convertedToBot: false, deleted: true };
  }
  if (room.hostId === playerId) room.hostId = room.players[0].id;
  touch(room);
  return { room, convertedToBot: false, deleted: false };
}

function touch(room) {
  room.updatedAt = Date.now();
  broadcast(room);
}

function streamSet(code) {
  if (!streams.has(code)) streams.set(code, new Set());
  return streams.get(code);
}

function writeEvent(client) {
  const room = rooms.get(client.code);
  if (!room || client.res.destroyed) return;
  const payload = gameEngine.publicState(room, client.playerId);
  client.res.write(`event: state\n`);
  client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(room) {
  const clients = streamSet(room.code);
  for (const client of clients) writeEvent(client);
}

function scheduleBots(room) {
  if (!room.game || room.game.over || room.botTimer) return;
  if (!gameEngine.currentTurnPlayer(room.game)?.isBot) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    try {
      const steps = playBots(room);
      if (steps) touch(room);
    } catch (error) {
      console.error(`Bot error in room ${room.code}:`, error);
    }
  }, BOT_DELAY_MS);
}

function playBots(room) {
  let steps = 0;
  while (room.game && !room.game.over && steps < 80) {
    const player = gameEngine.currentTurnPlayer(room.game);
    if (!player?.isBot) break;
    if (room.game.phase === "hide") {
      gameEngine.hideCard(room.game, player.id, chooseHideIndex(room.game, player));
    } else if (room.game.phase === "pick") {
      gameEngine.takeCard(room.game, player.id, chooseTakeIndex(room.game, player));
    } else if (room.game.phase === "place") {
      const card = room.game.pendingPlacement?.card;
      const placement = choosePlacement(room.game, player, card);
      gameEngine.placeCard(room.game, player.id, placement.x, placement.y);
    } else {
      break;
    }
    steps++;
  }
  if (steps >= 80) throw new Error("Boucle IA interrompue.");
  return steps;
}

function chooseHideIndex(game, player) {
  const pickOrder = pickOrderAfterHide(game).filter(index => game.players[index]?.id !== player.id);
  return bestIndex(game.offer.map((card, index) => ({
    index,
    score: hideCardValue(game, player, card, index, pickOrder),
  })));
}

function pickOrderAfterHide(game) {
  if (game.players.length === 2) return [1 - game.active, game.active];
  const order = [];
  for (let i = 1; i < game.players.length; i++) order.push((game.active + i) % game.players.length);
  order.push(game.active);
  return order;
}

function hideCardValue(game, player, card, cardIndex, pickOrder) {
  const myValues = game.offer.map(item => cardValue(game, player, item));
  const myValue = myValues[cardIndex] ?? 0;
  const myBest = Math.max(...myValues);
  const keeperBonus = myValue >= myBest - 2 ? 5 : 0;
  const threats = pickOrder
    .map((playerIndex, orderIndex) => {
      const opponent = game.players[playerIndex];
      if (!opponent) return 0;
      return opponentCardThreat(game, opponent, card, cardIndex, orderIndex);
    })
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  const biggestThreat = threats[0] || 0;
  const sharedThreat = threats.slice(1).reduce((sum, value) => sum + value, 0) * 0.22;
  return myValue * 0.2 + keeperBonus + biggestThreat * 1.45 + sharedThreat;
}

function opponentCardThreat(game, opponent, card, cardIndex, orderIndex) {
  const values = game.offer.map(item => cardValue(game, opponent, item));
  const value = values[cardIndex] ?? 0;
  const sorted = [...values].sort((a, b) => b - a);
  const best = sorted[0] ?? value;
  const second = sorted.find((_, index) => index > 0) ?? value;
  const average = values.reduce((sum, item) => sum + item, 0) / Math.max(1, values.length);
  const nextPlayerWeight = Math.max(0.9, 1.35 - orderIndex * 0.15);
  let threat = value;
  threat += Math.max(0, value - average) * 0.8;
  if (value >= best - 1) threat += 18;
  if (value - second >= 5) threat += 8;
  if (makesImmediateWin(opponent, card)) threat += 900;
  return threat * nextPlayerWeight;
}

function chooseTakeIndex(game, player) {
  const visibleScores = game.offer
    .map((card, index) => {
      const known = index !== game.hiddenIndex || game.hiddenBy === player.id;
      return known ? cardValue(game, player, card) : null;
    })
    .filter(Number.isFinite);
  const bestVisibleScore = visibleScores.length ? Math.max(...visibleScores) : -Infinity;

  return bestIndex(game.offer.map((card, index) => {
    const known = index !== game.hiddenIndex || game.hiddenBy === player.id;
    return {
      index,
      score: known ? cardValue(game, player, card) : hiddenCardValue(game, player, bestVisibleScore),
    };
  }));
}

function choosePlacement(game, player, card) {
  return bestPlacement(game, player, card).pos || gameEngine.legalPlacements(player)[0] || { x: 0, y: 0 };
}

function bestIndex(items) {
  return items
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.index ?? 0;
}

function bestPlacement(game, player, card) {
  const placements = gameEngine.legalPlacements(player);
  return placements
    .map(pos => ({ pos, score: placementValue(game, player, card, pos) }))
    .sort((a, b) => b.score - a.score || a.pos.y - b.pos.y || a.pos.x - b.pos.x)[0] || { pos: placements[0], score: 0 };
}

function placementValue(game, player, card, pos) {
  let value = gameEngine.placementDelta(player, card, pos);
  if (makesImmediateWin(player, card)) value += 1000;
  if (card.id === "tresor") value += treasureBonus(game, player);
  value += strategicBonus(player, card);
  value += birdBonus(player, card);
  value += prudentAdjustment(player, card);
  return value;
}

function cardValue(game, player, card) {
  return bestPlacement(game, player, card).score;
}

function hiddenCardValue(game, player, bestVisibleScore) {
  const unknown = [...game.deck];
  if (game.hiddenIndex >= 0 && game.offer[game.hiddenIndex]) unknown.push(game.offer[game.hiddenIndex]);
  const values = unknown
    .map(card => cardValue(game, player, card))
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  if (!values.length) return 0;
  const bestSlice = values.slice(0, Math.max(1, Math.ceil(values.length * 0.12)));
  const bestAverage = bestSlice.reduce((sum, value) => sum + value, 0) / bestSlice.length;
  const globalAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
  const hasVisibleOption = Number.isFinite(bestVisibleScore);
  const visibleIsWeak = hasVisibleOption && bestVisibleScore <= globalAverage + 1;
  const upsideWeight = visibleIsWeak ? 0.32 : 0.18;
  let riskPenalty = 4.5 + Math.min(3.5, visibleCards(player).length * 0.35);
  if (!hasVisibleOption) riskPenalty -= 2.5;
  else if (bestVisibleScore >= bestAverage - 1) riskPenalty += 3;
  else if (bestVisibleScore >= globalAverage + 5) riskPenalty += 1.5;
  else if (visibleIsWeak) riskPenalty -= 1;
  return bestAverage * upsideWeight + globalAverage * (1 - upsideWeight) - riskPenalty;
}

function visibleCards(player) {
  return player.board.filter(cell => !cell.destroyed).map(cell => cell.card);
}

function cardMatches(card, token) {
  if (token === "Carte au tresor") return card.id === "tresor";
  return card.type === token || card.name === token || card.id === token;
}

function countMatching(player, token) {
  return visibleCards(player).filter(card => cardMatches(card, token)).length;
}

function countAfterCard(player, token, card) {
  return countMatching(player, token) + (cardMatches(card, token) ? 1 : 0);
}

function countType(player, type) {
  return visibleCards(player).filter(card => card.type === type).length;
}

function makesImmediateWin(player, card) {
  return countType(player, "Oiseau") + (card.type === "Oiseau" ? 1 : 0) >= 4;
}

function treasureBonus(game, player) {
  const mine = countMatching(player, "Carte au tresor") + 1;
  const otherMax = Math.max(0, ...game.players.filter(item => item.id !== player.id).map(item => countMatching(item, "Carte au tresor")));
  return mine > otherMax ? 10 : 2;
}

function synergyBonus(player, card) {
  let bonus = 0;
  for (const existing of visibleCards(player)) {
    for (const token of existing.pos || []) {
      if (cardMatches(card, token)) bonus += 1.5;
    }
  }
  if (card.mode === "threshold" && card.pos?.length && countAfterCard(player, card.pos[0], card) >= card.threshold) bonus += 6;
  if (card.mode === "minCount" && card.pos?.length && countMatching(player, card.pos[0]) >= card.threshold) bonus += 6;
  return bonus;
}

function strategicBonus(player, card) {
  let bonus = synergyBonus(player, card) * 0.8;
  if (card.mode === "kingdom") {
    for (const token of card.pos || []) bonus += Math.min(6, countAfterCard(player, token, card) * 1.4);
  }
  if (card.mode === "adjacent") {
    for (const token of card.pos || []) bonus += Math.min(4, countAfterCard(player, token, card));
  }
  if (card.mode === "threshold" && card.pos?.length) {
    const missing = card.threshold - countAfterCard(player, card.pos[0], card);
    if (missing <= 0) bonus += 8;
    else if (missing === 1) bonus += 5;
    else if (missing === 2) bonus += 2;
  }
  if (card.id === "bouffon") bonus += countMatching(player, "Barde") >= 2 ? 8 : countMatching(player, "Barde") * 2;
  if (card.id === "barde" && countMatching(player, "Bouffon")) bonus += 8;
  if (card.type === "Batiment" && countMatching(player, "Temple")) bonus += 3;
  if (card.type === "Oiseau" && countMatching(player, "magicien")) bonus += 3;
  return bonus;
}

function birdBonus(player, card) {
  if (card.type !== "Oiseau") return card.antiHeron ? 4 : 0;
  const birds = countType(player, "Oiseau") + 1;
  return birds >= 4 ? 500 : 28 + birds * 4;
}

function prudentAdjustment(player, card) {
  let penalty = 0;
  for (const token of card.neg || []) penalty += 3 + countMatching(player, token) * 2;
  if (card.type === "Oiseau" && !makesImmediateWin(player, card)) penalty += 4;
  return -penalty;
}

function sendFile(req, res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function staticFile(req, res, baseDir, requestPath, stripPrefix = "") {
  let localPath = requestPath;
  if (stripPrefix && localPath.startsWith(stripPrefix)) localPath = localPath.slice(stripPrefix.length);
  const normalizedPath = path.normalize(decodeURIComponent(localPath)).replace(/^[/\\]+/, "");
  const relativePath = normalizedPath === "." || normalizedPath === "" ? "index.html" : normalizedPath;
  const filePath = path.resolve(baseDir, relativePath);
  if (filePath !== baseDir && !filePath.startsWith(`${baseDir}${path.sep}`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      sendFile(req, res, path.join(filePath, "index.html"));
      return;
    }
    if (error || !stats.isFile()) {
      sendFile(req, res, path.join(baseDir, "index.html"));
      return;
    }
    sendFile(req, res, filePath);
  });
}

async function handleApi(req, res, url) {
  try {
    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(req);
      const { room, player } = createRoom(body.name);
      sendJson(res, 200, { playerId: player.id, state: gameEngine.publicState(room, player.id) });
      return;
    }

    const joinMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/i);
    if (req.method === "POST" && joinMatch) {
      const body = await readBody(req);
      const { room, player } = joinRoom(joinMatch[1], body.name);
      sendJson(res, 200, { playerId: player.id, state: gameEngine.publicState(room, player.id) });
      return;
    }

    const botMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/bots$/i);
    if (req.method === "POST" && botMatch) {
      const room = getRoom(botMatch[1]);
      const body = await readBody(req);
      ensureHost(room, body.playerId);
      addBot(room, body.profile);
      sendJson(res, 200, { state: gameEngine.publicState(room, body.playerId) });
      return;
    }

    const leaveMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/leave$/i);
    if (req.method === "POST" && leaveMatch) {
      const room = getRoom(leaveMatch[1]);
      const body = await readBody(req);
      const result = leaveRoom(room, body.playerId);
      sendJson(res, 200, {
        left: true,
        convertedToBot: result.convertedToBot,
        deleted: result.deleted,
        state: result.room ? gameEngine.publicState(result.room, body.playerId) : null,
      });
      return;
    }

    const scoringMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/scoring$/i);
    if (req.method === "POST" && scoringMatch) {
      const room = getRoom(scoringMatch[1]);
      const body = await readBody(req);
      ensureHost(room, body.playerId);
      if (room.game) throw new Error("Les reglages se changent avant la partie.");
      const scoring = gameEngine.applyCardOverrides(body.overrides || {});
      saveScoringOverrides(scoring);
      touch(room);
      sendJson(res, 200, { scoring, state: gameEngine.publicState(room, body.playerId) });
      return;
    }

    const stateMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)$/i);
    if (req.method === "GET" && stateMatch) {
      const room = getRoom(stateMatch[1]);
      const playerId = url.searchParams.get("playerId") || "";
      if (playerId) ensurePlayer(room, playerId);
      sendJson(res, 200, { state: gameEngine.publicState(room, playerId) });
      return;
    }

    const eventMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/events$/i);
    if (req.method === "GET" && eventMatch) {
      const room = getRoom(eventMatch[1]);
      const playerId = url.searchParams.get("playerId") || "";
      ensurePlayer(room, playerId);
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      const client = { code: room.code, playerId, res };
      streamSet(room.code).add(client);
      writeEvent(client);
      const keepAlive = setInterval(() => res.write(`event: ping\ndata: {}\n\n`), 25000);
      req.on("close", () => {
        clearInterval(keepAlive);
        streamSet(room.code).delete(client);
      });
      return;
    }

    const startMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/start$/i);
    if (req.method === "POST" && startMatch) {
      const room = getRoom(startMatch[1]);
      const body = await readBody(req);
      ensurePlayer(room, body.playerId);
      if (room.hostId !== body.playerId) throw new Error("Seul l'hote peut lancer.");
      if (room.players.length < 2) throw new Error("Il faut au moins 2 joueurs.");
      if (room.players.length > 4) throw new Error("Maximum 4 joueurs.");
      room.game = gameEngine.makeGame(room.players);
      touch(room);
      scheduleBots(room);
      sendJson(res, 200, { state: gameEngine.publicState(room, body.playerId) });
      return;
    }

    const actionMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)\/action$/i);
    if (req.method === "POST" && actionMatch) {
      const room = getRoom(actionMatch[1]);
      const body = await readBody(req);
      ensurePlayer(room, body.playerId);
      if (!room.game) throw new Error("La partie n'est pas lancee.");
      if (body.type === "hide") gameEngine.hideCard(room.game, body.playerId, Number(body.index));
      else if (body.type === "take") gameEngine.takeCard(room.game, body.playerId, Number(body.index));
      else if (body.type === "place") gameEngine.placeCard(room.game, body.playerId, Number(body.x), Number(body.y));
      else throw new Error("Action inconnue.");
      touch(room);
      scheduleBots(room);
      sendJson(res, 200, { state: gameEngine.publicState(room, body.playerId) });
      return;
    }

    sendJson(res, 404, { error: "API introuvable." });
  } catch (error) {
    sendJson(res, 400, { error: error.message || "Erreur." });
  }
}

setInterval(() => {
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  for (const [code, room] of rooms) {
    if (room.updatedAt < cutoff && !streamSet(code).size) rooms.delete(code);
  }
}, 30 * 60 * 1000).unref();

loadScoringOverrides();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith("/simulateur")) {
    staticFile(req, res, simulatorDir, url.pathname, "/simulateur");
    return;
  }
  staticFile(req, res, webDir, url.pathname);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Etang du Roi web playtest on http://127.0.0.1:${port}`);
  console.log(`Web app: ${webDir}`);
  console.log(`Legacy simulator: ${simulatorDir}`);
});
