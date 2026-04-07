const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3001);
const BUILD_DIR = path.join(__dirname, "build");

const CREATURE_TYPES = [
  "skeleton",
  "witch",
  "werewolf",
  "slime",
  "vampire",
  "zombie",
  "ghost",
  "demon",
];

const VALUES = [0, 1, 2, 3, 4, 5, 6];

const cards = CREATURE_TYPES.flatMap((type) =>
  VALUES.map((value) => ({
    id: `${type}-${value}`,
    type,
    value,
  }))
);

const games = new Map();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function generateId(length = 6) {
  return crypto.randomBytes(length).toString("hex").slice(0, length).toUpperCase();
}

function normalizeName(name, fallback) {
  const trimmed = String(name || "").trim();
  return trimmed ? trimmed.slice(0, 24) : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDeck() {
  const deck = clone(cards);

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function drawCards(deck, count) {
  return {
    drawn: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

function getTopValue(column) {
  if (!column.length) {
    return 0;
  }

  return Math.max(...column.map((card) => card.value));
}

function canPlaceCardInColumn(card, column) {
  return card.value >= getTopValue(column);
}

function canPlayAnyCard(row, columns) {
  return row.some((card) =>
    columns.some((column) => canPlaceCardInColumn(card, column))
  );
}

function countMoonsInOpponentColumn(game, playerIndex, columnIndex) {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponent = game.players[opponentIndex];
  const opponentColumn = opponent.columns[columnIndex] || [];

  let moonCount = 0;

  for (const card of opponentColumn) {
    moonCount += card.moons || 0;
  }

  moonCount += opponent.columnMoons?.[columnIndex] || 0;

  return moonCount;
}

function applyWerewolfEffect(game, playerIndex, columnIndex) {
  const moonCount = countMoonsInOpponentColumn(game, playerIndex, columnIndex);
  const move = moonCount * 2;

  game.players[playerIndex].position += move;

  return { moonCount, move };
}

function movePlayer(game, playerIndex, amount) {
  game.players[playerIndex].position += amount;
}

function countCardsOfTypeOnPlayerBoard(game, playerIndex, type) {
  return game.players[playerIndex].columns.reduce(
    (total, column) =>
      total + column.filter((card) => card.type === type).length,
    0
  );
}

function awardStar(game, playerIndex, reason) {
  const player = game.players[playerIndex];
  player.stars += 1;
  game.log.unshift(`${player.name} gagne une etoile (${player.stars}/3) : ${reason}`);

  if (player.stars >= 3) {
    game.winner = player.name;
    game.log.unshift(`${player.name} gagne la partie !`);
  }
}

function getOppositePlayerIndex(playerIndex) {
  return playerIndex === 0 ? 1 : 0;
}

function getTopCard(column) {
  if (!column || !column.length) {
    return null;
  }

  return column[column.length - 1];
}

function getZoneIndexFromPosition(position) {
  if (position <= 2) return 0;
  if (position <= 5) return 1;
  if (position <= 8) return 2;
  return 3;
}

function applyCardEffect(game, playerIndex, card, columnIndex) {
  switch (card.type) {
    case "slime":
    case "ghost":
    case "demon":
      movePlayer(game, playerIndex, card.value);
      game.log.unshift(
        `${game.players[playerIndex].name} active ${card.type} ${card.value} : +${card.value}`
      );
      return;
    case "skeleton": {
      movePlayer(game, playerIndex, 1);
      const playerColumn = game.players[playerIndex].columns[columnIndex];
      const cardBelow = playerColumn[playerColumn.length - 2] || null;
      const shouldReplay = Boolean(cardBelow && cardBelow.moons > 0);

      game.extraTurn = shouldReplay;
      game.log.unshift(
        shouldReplay
          ? `${game.players[playerIndex].name} active squelette ${card.value} : +1 et rejoue grace a une lune sous la carte`
          : `${game.players[playerIndex].name} active squelette ${card.value} : +1`
      );
      return;
    }
    case "witch": {
      const playerPosition = game.players[playerIndex].position;
      const handZoneIndex = getZoneIndexFromPosition(playerPosition);

      if (columnIndex === handZoneIndex) {
        movePlayer(game, playerIndex, 3);
        game.log.unshift(
          `${game.players[playerIndex].name} active sorciere ${card.value} : jouee dans sa zone -> +3`
        );
      } else {
        game.log.unshift(
          `${game.players[playerIndex].name} active sorciere ${card.value} : hors zone -> pas d'effet`
        );
      }
      return;
    }
    case "werewolf": {
      const result = applyWerewolfEffect(game, playerIndex, columnIndex);
      game.log.unshift(
        `${game.players[playerIndex].name} active loup-garou ${card.value} : ${result.moonCount} lune(s) -> +${result.move}`
      );
      return;
    }
    case "vampire": {
      const oppositePlayerIndex = getOppositePlayerIndex(playerIndex);
      const oppositeColumn = game.players[oppositePlayerIndex].columns[columnIndex];
      const oppositeTopCard = getTopCard(oppositeColumn);
      const copiedValue = oppositeTopCard ? oppositeTopCard.value : 0;

      movePlayer(game, playerIndex, copiedValue);
      game.log.unshift(
        `${game.players[playerIndex].name} active vampire ${card.value} : copie ${copiedValue}`
      );
      return;
    }
    case "zombie": {
      const zombieCount = countCardsOfTypeOnPlayerBoard(game, playerIndex, "zombie");
      const moveByZombieCount = {
        1: 1,
        2: 2,
        3: 4,
        4: 6,
      };

      if (zombieCount >= 5) {
        awardStar(game, playerIndex, "5 zombies ou plus sur son plateau");
        game.log.unshift(
          `${game.players[playerIndex].name} active zombie ${card.value} : ${zombieCount} zombies -> etoile directe`
        );
        return;
      }

      const move = moveByZombieCount[zombieCount] || 0;
      movePlayer(game, playerIndex, move);
      game.log.unshift(
        `${game.players[playerIndex].name} active zombie ${card.value} : ${zombieCount} zombie(s) -> +${move}`
      );
      return;
    }
    default:
      game.log.unshift(
        `${game.players[playerIndex].name} joue ${card.type} ${card.value} : effet introuvable`
      );
  }
}

function createPlayer(name) {
  return {
    id: crypto.randomUUID(),
    name,
    position: 0,
    stars: 0,
    columns: [[], [], [], []],
    columnMoons: [0, 0, 0, 0],
  };
}

function createInitialState(hostName) {
  const deck = createDeck();
  const { drawn, remaining } = drawCards(deck, 4);
  const playerOne = createPlayer(normalizeName(hostName, "Joueur 1"));
  playerOne.columnMoons = [1, 0, 0, 0];

  const playerTwo = createPlayer("En attente");
  playerTwo.columnMoons = [0, 1, 0, 0];

  return {
    id: generateId(6),
    phase: "lobby",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    winner: null,
    currentPlayer: 0,
    selectedCardIndex: null,
    extraTurn: false,
    deck: remaining,
    row: drawn,
    players: [playerOne, playerTwo],
    log: ["Partie creee. En attente du deuxieme joueur."],
  };
}

function resetGameState(existingGame) {
  const deck = createDeck();
  const { drawn, remaining } = drawCards(deck, 4);

  existingGame.phase = "playing";
  existingGame.winner = null;
  existingGame.currentPlayer = 0;
  existingGame.selectedCardIndex = null;
  existingGame.extraTurn = false;
  existingGame.deck = remaining;
  existingGame.row = drawn;
  existingGame.updatedAt = Date.now();
  existingGame.log = ["Nouvelle partie."];

  existingGame.players.forEach((player, index) => {
    player.position = 0;
    player.stars = 0;
    player.columns = [[], [], [], []];
    player.columnMoons = index === 0 ? [1, 0, 0, 0] : [0, 1, 0, 0];
  });
}

function sanitizeGame(game, playerId) {
  const viewerPlayerIndex = game.players.findIndex((player) => player.id === playerId);
  const currentPlayer = game.players[game.currentPlayer];
  const activePlayerBlocked =
    game.phase === "playing" && !canPlayAnyCard(game.row, currentPlayer.columns);

  return {
    id: game.id,
    phase: game.phase,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    winner: game.winner,
    currentPlayer: game.currentPlayer,
    currentPlayerName: currentPlayer.name,
    selectedCardIndex: game.selectedCardIndex,
    deck: game.deck,
    row: game.row,
    players: game.players,
    log: game.log,
    viewerPlayerIndex,
    viewerCanAct:
      viewerPlayerIndex !== -1 &&
      game.phase === "playing" &&
      game.players[game.currentPlayer].id === playerId &&
      !game.winner,
    activePlayerBlocked,
  };
}

function broadcastGame(gameId) {
  const entry = games.get(gameId);

  if (!entry) {
    return;
  }

  for (const client of entry.clients) {
    const payload = sanitizeGame(entry.state, client.playerId);
    client.res.write("event: state\n");
    client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

function getGameEntry(gameId) {
  return games.get(String(gameId || "").toUpperCase()) || null;
}

function performAction(game, playerId, action) {
  if (action.type === "reset_game") {
    const playerExists = game.players.some((player) => player.id === playerId);

    if (!playerExists) {
      throw new Error("Joueur introuvable.");
    }

    if (game.players[1].name === "En attente") {
      game.phase = "lobby";
      game.extraTurn = false;
      game.log.unshift("Le reset attend l'arrivee du deuxieme joueur.");
      game.updatedAt = Date.now();
      return;
    }

    resetGameState(game);
    return;
  }

  if (game.phase !== "playing") {
    throw new Error("La partie n'a pas encore commence.");
  }

  if (game.winner) {
    throw new Error("La partie est terminee.");
  }

  const playerIndex = game.players.findIndex((player) => player.id === playerId);

  if (playerIndex === -1) {
    throw new Error("Joueur introuvable.");
  }

  if (game.currentPlayer !== playerIndex) {
    throw new Error("Ce n'est pas votre tour.");
  }

  const player = game.players[playerIndex];
  const blocked = !canPlayAnyCard(game.row, player.columns);
  game.extraTurn = false;

  if (action.type === "select_card") {
    const card = game.row[action.cardIndex];

    if (!card) {
      throw new Error("Carte introuvable.");
    }

    if (blocked) {
      throw new Error("Aucune carte ne peut etre jouee, il faut defausser une colonne.");
    }

    game.selectedCardIndex = action.cardIndex;
    game.updatedAt = Date.now();
    return;
  }

  if (action.type === "play_column") {
    if (blocked) {
      throw new Error("Impossible de jouer une carte, il faut defausser une colonne.");
    }

    if (game.selectedCardIndex === null) {
      throw new Error("Aucune carte selectionnee.");
    }

    const columnIndex = action.columnIndex;
    const cardIndex = game.selectedCardIndex;
    const card = game.row[cardIndex];
    const targetColumn = player.columns[columnIndex];

    if (!card || !targetColumn) {
      throw new Error("Cible invalide.");
    }

    if (!canPlaceCardInColumn(card, targetColumn)) {
      throw new Error(
        `Pose interdite : ${card.value} doit etre >= a ${getTopValue(targetColumn)}.`
      );
    }

    const wasLeftmostCard = cardIndex === 0;

    targetColumn.push(card);
    game.row.splice(cardIndex, 1);
    game.log.unshift(
      `${player.name} joue ${card.type} ${card.value} dans sa colonne ${columnIndex + 1}`
    );

    applyCardEffect(game, playerIndex, card, columnIndex);

    if (player.position >= 12) {
      player.stars += 1;
      game.log.unshift(
        `${player.name} atteint l'etoile et passe a ${player.stars}/3. Les positions reviennent a 0.`
      );

    if (player.stars >= 3) {
        game.winner = player.name;
        game.selectedCardIndex = null;
        game.updatedAt = Date.now();
        game.log.unshift(`${player.name} gagne la partie !`);
        return;
      }

      game.players[0].position = 0;
      game.players[1].position = 0;
    }

    if (wasLeftmostCard) {
      const missingCards = 4 - game.row.length;
      const { drawn, remaining } = drawCards(game.deck, missingCards);
      game.row.push(...drawn);
      game.deck = remaining;
      game.log.unshift(`Refill : ${drawn.length} carte(s) ajoutee(s) a la rangee.`);
    }

    game.selectedCardIndex = null;
    if (game.extraTurn) {
      game.log.unshift(`${player.name} rejoue immediatement.`);
      game.extraTurn = false;
    } else {
      game.currentPlayer = game.currentPlayer === 0 ? 1 : 0;
    }
    game.updatedAt = Date.now();
    return;
  }

  if (action.type === "discard_column") {
    const columnIndex = action.columnIndex;

    if (!blocked) {
      throw new Error("Une carte est jouable, impossible de defausser.");
    }

    if (!player.columns[columnIndex]) {
      throw new Error("Colonne introuvable.");
    }

    player.columns[columnIndex] = [];
    game.selectedCardIndex = null;
    game.extraTurn = false;
    game.currentPlayer = game.currentPlayer === 0 ? 1 : 0;
    game.updatedAt = Date.now();
    game.log.unshift(
      `${player.name} ne peut rien jouer et defausse sa colonne ${columnIndex + 1}.`
    );
    return;
  }

  throw new Error("Action inconnue.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload trop volumineux."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new Error("JSON invalide."));
      }
    });

    req.on("error", reject);
  });
}

function serveStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };

  res.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/games") {
    readBody(req)
      .then((body) => {
        const state = createInitialState(body.playerName);
        games.set(state.id, { state, clients: new Set() });
        sendJson(res, 201, {
          gameId: state.id,
          playerId: state.players[0].id,
          game: sanitizeGame(state, state.players[0].id),
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  const pathMatch = url.pathname.match(/^\/api\/games\/([A-Z0-9]+)(?:\/(join|actions|events))?$/);

  if (!pathMatch) {
    return false;
  }

  const gameId = pathMatch[1];
  const mode = pathMatch[2] || "detail";
  const entry = getGameEntry(gameId);

  if (!entry) {
    sendJson(res, 404, { error: "Partie introuvable." });
    return true;
  }

  if (req.method === "GET" && mode === "detail") {
    const playerId = url.searchParams.get("playerId") || "";
    sendJson(res, 200, { game: sanitizeGame(entry.state, playerId) });
    return true;
  }

  if (req.method === "POST" && mode === "join") {
    readBody(req)
      .then((body) => {
        const secondPlayer = entry.state.players[1];

        if (secondPlayer.name !== "En attente") {
          sendJson(res, 409, { error: "Cette partie est deja complete." });
          return;
        }

        secondPlayer.name = normalizeName(body.playerName, "Joueur 2");
        secondPlayer.id = crypto.randomUUID();
        entry.state.phase = "playing";
        entry.state.updatedAt = Date.now();
        entry.state.log.unshift(`${secondPlayer.name} a rejoint la partie.`);

        broadcastGame(entry.state.id);

        sendJson(res, 200, {
          gameId: entry.state.id,
          playerId: secondPlayer.id,
          game: sanitizeGame(entry.state, secondPlayer.id),
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && mode === "actions") {
    readBody(req)
      .then((body) => {
        performAction(entry.state, body.playerId, body);
        broadcastGame(entry.state.id);
        sendJson(res, 200, {
          ok: true,
          game: sanitizeGame(entry.state, body.playerId),
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "GET" && mode === "events") {
    const playerId = url.searchParams.get("playerId") || "";

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    res.write("event: state\n");
    res.write(`data: ${JSON.stringify(sanitizeGame(entry.state, playerId))}\n\n`);

    const client = { res, playerId };
    entry.clients.add(client);

    const heartbeat = setInterval(() => {
      res.write("event: ping\ndata: {}\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      entry.clients.delete(client);
    });

    return true;
  }

  sendJson(res, 405, { error: "Methode non autorisee." });
  return true;
}

function handleStatic(req, res, url) {
  const safePath = path
    .normalize(url.pathname)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const candidateBuildFile = path.join(BUILD_DIR, safePath);

  if (fs.existsSync(BUILD_DIR) && fs.statSync(BUILD_DIR).isDirectory()) {
    if (safePath && serveStaticFile(res, candidateBuildFile)) {
      return true;
    }

    return serveStaticFile(res, path.join(BUILD_DIR, "index.html"));
  }

  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    if (!handleApi(req, res, url)) {
      sendJson(res, 404, { error: "Route API introuvable." });
    }
    return;
  }

  if (!handleStatic(req, res, url)) {
    sendText(
      res,
      200,
      "Serveur Crepuscule actif. Lancez le client React en dev ou servez un build pour l'interface."
    );
  }
});

server.listen(PORT, () => {
  console.log(`Crepuscule server listening on http://localhost:${PORT}`);
});
