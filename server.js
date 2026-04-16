const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3001);
const BUILD_DIR = path.join(__dirname, "build");

const TYPE_LABELS = {
  sorciere: "Sorciere",
  vampire: "Vampire",
  squelette: "Squelette",
  loup: "Loup",
  zombie: "Zombie",
  reflet: "Reflet",
  banshee: "Banshee",
  statue: "Statue",
};

const cards = [
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    id: `sorciere-${value}`,
    type: "sorciere",
    value,
    moon: value === 1,
    chief: value === 6,
  })),
  ...[4, 4, 5, 5, 5, 6, 6].map((value, index) => ({
    id: `vampire-${index}`,
    type: "vampire",
    value,
    moon: value === 4,
    chief: false,
  })),
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    id: `squelette-${value}`,
    type: "squelette",
    value,
    moon: value === 6,
    chief: value === 0,
  })),
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    id: `loup-${value}`,
    type: "loup",
    value,
    moon: value === 5,
    chief: value === 1 || value === 2,
  })),
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    id: `zombie-${value}`,
    type: "zombie",
    value,
    moon: false,
    chief: true,
  })),
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    id: `reflet-${value}`,
    type: "reflet",
    value,
    moon: value === 4,
    chief: value === 5 || value === 6,
  })),
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    id: `banshee-${value}`,
    type: "banshee",
    value,
    moon: false,
    chief: false,
  })),
];

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

function getTypeLabel(type) {
  return TYPE_LABELS[type] || type;
}

function createEmptyStats() {
  return {
    turnsCompleted: 0,
    blockedTurns: 0,
    forcedDiscards: 0,
    starsBySource: {
      case12: 0,
      zombie: 0,
    },
    caseEntries: {
      3: 0,
      5: 0,
      8: 0,
      10: 0,
    },
    case5: {
      prompts: 0,
      used: 0,
      skipped: 0,
    },
    case8ZombieBoosts: 0,
    rowRefills: 0,
    rowReplacements: 0,
    cardActivations: {},
    cardMovementTotal: {},
    replaysGranted: {},
    winners: [],
  };
}

function ensureStats(game) {
  if (!game.stats) {
    game.stats = createEmptyStats();
  }

  return game.stats;
}

function recordCardActivation(game, type) {
  const stats = ensureStats(game);
  stats.cardActivations[type] = (stats.cardActivations[type] || 0) + 1;
}

function recordCardMovement(game, type, amount) {
  const stats = ensureStats(game);
  stats.cardMovementTotal[type] = (stats.cardMovementTotal[type] || 0) + amount;
}

function recordReplayGranted(game, type, amount = 1) {
  const stats = ensureStats(game);
  stats.replaysGranted[type] = (stats.replaysGranted[type] || 0) + amount;
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
    drawn: deck.slice(0, count).map((card) => ({
      ...card,
      faceUp: true,
    })),
    remaining: deck.slice(count),
  };
}

function getCardEffectiveValue(card) {
  if (!card) {
    return 0;
  }

  return card.faceUp === false ? 0 : card.value;
}

function getTopValue(column) {
  if (!column.length) {
    return 0;
  }

  for (let index = column.length - 1; index >= 0; index -= 1) {
    const card = column[index];

    if (card.faceUp !== false) {
      return getCardEffectiveValue(card);
    }
  }

  return 0;
}

function canPlaceCardInColumn(card, column) {
  return card.value >= getTopValue(column);
}

function canPlayAnyCard(row, columns) {
  return row.some((card) =>
    columns.some((column) => canPlaceCardInColumn(card, column))
  );
}

function canPlaySelectedCardFaceDown(game) {
  return game.row.length > 0;
}

function countMoonsInColumn(column, baseMoons = 0) {
  return (
    baseMoons +
    column.reduce(
      (total, card) => total + ((card.faceUp === false || card.moon) ? 1 : 0),
      0
    )
  );
}

function countMoonsInOpponentColumn(game, playerIndex, columnIndex) {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponent = game.players[opponentIndex];
  return countMoonsInColumn(
    opponent.columns[columnIndex] || [],
    opponent.columnMoons?.[columnIndex] || 0
  );
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
  let total = game.players[playerIndex].columns.reduce(
    (total, column) =>
      total +
      column.filter((card) => card.faceUp !== false && card.type === type).length,
    0
  );

  return total;
}

function countChiefsOnPlayerBoard(game, playerIndex) {
  return game.players[playerIndex].columns.reduce(
    (total, column) =>
      total + column.filter((card) => card.faceUp !== false && card.chief).length,
    0
  );
}

function countColumnsWithFaceDownCards(game, playerIndex) {
  return game.players[playerIndex].columns.reduce(
    (total, column) =>
      total + (column.some((card) => card.faceUp === false) ? 1 : 0),
    0
  );
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

function getLastVisibleCardEntry(column) {
  if (!column || !column.length) {
    return null;
  }

  const rowIndex = column.length - 1;
  const card = column[rowIndex];

  if (card && card.faceUp !== false) {
    return { card, rowIndex };
  }

  return null;
}

function getZoneIndexFromPosition(position) {
  if (position <= 2) return 0;
  if (position <= 5) return 1;
  if (position <= 8) return 2;
  return 3;
}

function resolveStarGain(game, playerIndex, reason, source = "case12") {
  const player = game.players[playerIndex];
  const stats = ensureStats(game);
  player.stars += 1;
  stats.starsBySource[source] = (stats.starsBySource[source] || 0) + 1;
  game.log.unshift(`${player.name} gagne une etoile (${player.stars}/3) : ${reason}`);

  if (player.stars >= 3) {
    game.winner = player.name;
    stats.winners.push({
      winner: player.name,
      playerIndex,
      chiefs: countChiefsOnPlayerBoard(game, playerIndex),
      zombies: countCardsOfTypeOnPlayerBoard(game, playerIndex, "zombie"),
    });
    game.log.unshift(`${player.name} gagne la partie !`);
    return;
  }

  game.players[0].position = 0;
  game.players[1].position = 0;

  const chiefsPlayer0 = countChiefsOnPlayerBoard(game, 0);
  const chiefsPlayer1 = countChiefsOnPlayerBoard(game, 1);

  game.players[0].position += chiefsPlayer0;
  game.players[1].position += chiefsPlayer1;
  game.log.unshift(
    `Reprise apres etoile : ${game.players[0].name} avance de ${chiefsPlayer0} grace a ses chefs, ${game.players[1].name} avance de ${chiefsPlayer1}.`
  );
}

function resolveDeckExhaustedEndgame(game) {
  if (game.winner || game.deck.length > 0 || game.row.length > 0) {
    return false;
  }

  const [playerA, playerB] = game.players;

  if (playerA.stars > playerB.stars) {
    game.winner = playerA.name;
    game.log.unshift(
      `${playerA.name} gagne la partie : la pioche est vide et il a plus d'etoiles (${playerA.stars} contre ${playerB.stars}).`
    );
    return true;
  }

  if (playerB.stars > playerA.stars) {
    game.winner = playerB.name;
    game.log.unshift(
      `${playerB.name} gagne la partie : la pioche est vide et il a plus d'etoiles (${playerB.stars} contre ${playerA.stars}).`
    );
    return true;
  }

  if (playerA.position > playerB.position) {
    game.winner = playerA.name;
    game.log.unshift(
      `${playerA.name} gagne la partie : egalite aux etoiles, mais il est plus avance (${playerA.position} contre ${playerB.position}).`
    );
    return true;
  }

  if (playerB.position > playerA.position) {
    game.winner = playerB.name;
    game.log.unshift(
      `${playerB.name} gagne la partie : egalite aux etoiles, mais il est plus avance (${playerB.position} contre ${playerA.position}).`
    );
    return true;
  }

  game.winner = "Victoire partagee";
  game.log.unshift(
    `Victoire partagee : la pioche est vide, les etoiles sont egales (${playerA.stars}-${playerB.stars}) et les positions aussi (${playerA.position}-${playerB.position}).`
  );
  return true;
}

function createRefletOptions(game, playerIndex, columnIndex) {
  const player = game.players[playerIndex];
  const column = player.columns[columnIndex];
  const rowIndex = column.length - 1;
  const options = [];

  if (columnIndex > 0) {
    const leftCard = player.columns[columnIndex - 1][rowIndex];
    if (leftCard) {
      options.push({
        direction: "left",
        columnIndex: columnIndex - 1,
        cardValue: getCardEffectiveValue(leftCard),
        cardType: leftCard.faceUp !== false ? leftCard.type : null,
        cardFaceUp: leftCard.faceUp !== false,
      });
    }
  }

  if (columnIndex < player.columns.length - 1) {
    const rightCard = player.columns[columnIndex + 1][rowIndex];
    if (rightCard) {
      options.push({
        direction: "right",
        columnIndex: columnIndex + 1,
        cardValue: getCardEffectiveValue(rightCard),
        cardType: rightCard.faceUp !== false ? rightCard.type : null,
        cardFaceUp: rightCard.faceUp !== false,
      });
    }
  }

  return options;
}

function resolveRefletChoice(game, direction) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "reflet") {
    throw new Error("Aucun choix reflet en attente.");
  }

  const option = pendingChoice.options.find((entry) => entry.direction === direction);

  if (!option) {
    throw new Error("Direction invalide.");
  }

  movePlayer(game, pendingChoice.playerIndex, option.cardValue);
  recordCardMovement(game, "reflet", option.cardValue);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} choisit ${direction === "left" ? "gauche" : "droite"} pour son reflet : +${option.cardValue} grace a ${option.cardFaceUp ? `${getTypeLabel(option.cardType)} ${option.cardValue}` : "une carte retournee sans valeur"}.`
  );
  game.pendingChoice = null;
}

function createFlipOptions(game) {
  const options = [];

  game.players.forEach((player, playerIndex) => {
    player.columns.forEach((column, columnIndex) => {
      const visibleEntry = getLastVisibleCardEntry(column);

      if (!visibleEntry) {
        return;
      }

      options.push({
        targetPlayerIndex: playerIndex,
        columnIndex,
        rowIndex: visibleEntry.rowIndex,
        cardType: visibleEntry.card.type,
        cardValue: getCardEffectiveValue(visibleEntry.card),
        faceUp: true,
      });
    });
  });

  return options;
}

function createDiscardColumnOptions(game, ownerPlayerIndex) {
  const options = [];

  const player = game.players[ownerPlayerIndex];

  player.columns.forEach((column, columnIndex) => {
    if (!column.length) {
      return;
    }

    options.push({
      targetPlayerIndex: ownerPlayerIndex,
      columnIndex,
      moonCount: countMoonsInColumn(column, player.columnMoons?.[columnIndex] || 0),
      columnSize: column.length,
    });
  });

  return options;
}

function refillCommonRow(game, sourceLabel, options = {}) {
  const stats = ensureStats(game);
  const rowWasFull = game.row.length >= 4;
  const replaceIfFull = Boolean(options.replaceIfFull);

  if (rowWasFull && !replaceIfFull) {
    return;
  }

  const cardsToDraw = rowWasFull ? 4 : 4 - game.row.length;

  if (cardsToDraw <= 0 || game.deck.length === 0) {
    game.log.unshift(`${sourceLabel} : aucune carte disponible pour refaire la rangee.`);
    return;
  }

  if (rowWasFull) {
    game.row = [];
    stats.rowReplacements += 1;
  }

  const { drawn, remaining } = drawCards(game.deck, Math.min(cardsToDraw, game.deck.length));

  if (!drawn.length) {
    game.log.unshift(`${sourceLabel} : aucune carte disponible pour refaire la rangee.`);
    return;
  }

  game.row.push(...drawn);
  game.deck = remaining;
  stats.rowRefills += 1;
  game.log.unshift(
    rowWasFull
      ? `${sourceLabel} : la rangee pleine est defaussee puis ${drawn.length} carte(s) sont revelee(s).`
      : `${sourceLabel} : ${drawn.length} carte(s) ajoutee(s) a la rangee.`
  );
}

function maybeTriggerBoardEffect(game, playerIndex, previousPosition, options = {}) {
  const player = game.players[playerIndex];
  const skippedCase = options.skipBoardCase ?? null;

  if (player.position === 3 && previousPosition !== 3) {
    ensureStats(game).caseEntries[3] += 1;
    refillCommonRow(game, `${player.name} atteint la case 3`, { replaceIfFull: true });
  }

  if (
    player.position === 5 &&
    previousPosition !== 5 &&
    skippedCase !== 5
  ) {
    ensureStats(game).caseEntries[5] += 1;
    const flipOptions = createFlipOptions(game);

    if (!flipOptions.length) {
      game.log.unshift(
        `${player.name} atteint la case 5, mais aucune carte n'est disponible a retourner.`
      );
      return;
    }

    game.pendingChoice = {
      type: "board_flip",
      playerIndex,
      optional: true,
      sourceCase: 5,
      options: flipOptions,
    };
    ensureStats(game).case5.prompts += 1;
    game.log.unshift(
      `${player.name} atteint la case 5 et peut retourner une carte, chez lui ou chez l'adversaire.`
    );
    return;
  }

  if (player.position === 8 && previousPosition !== 8 && skippedCase !== 8) {
    ensureStats(game).caseEntries[8] += 1;
    const flipOptions = createFlipOptions(game);

    if (!flipOptions.length) {
      game.log.unshift(
        `${player.name} atteint la case 8, mais aucune carte n'est disponible a retourner.`
      );
      return;
    }

    game.pendingChoice = {
      type: "board_flip",
      playerIndex,
      optional: true,
      sourceCase: 8,
      options: flipOptions,
    };
    game.log.unshift(
      `${player.name} atteint la case 8 et peut retourner une carte, chez lui ou chez l'adversaire.`
    );
    return;
  }

  if (player.position === 10 && previousPosition !== 10) {
    ensureStats(game).caseEntries[10] += 1;
    refillCommonRow(game, `${player.name} atteint la case 10`, { replaceIfFull: true });
  }
}

function resolveBoardFlipChoice(game, action) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "board_flip") {
    throw new Error("Aucun retournement de plateau en attente.");
  }

  if (action.skip) {
    if (pendingChoice.sourceCase === 5) {
      ensureStats(game).case5.skipped += 1;
    }
    game.log.unshift(
      `${game.players[pendingChoice.playerIndex].name} choisit de ne pas retourner de carte sur la case ${pendingChoice.sourceCase}.`
    );
    game.pendingChoice = null;
    return;
  }

  const option = pendingChoice.options.find(
    (entry) =>
      entry.targetPlayerIndex === action.targetPlayerIndex &&
      entry.columnIndex === action.columnIndex &&
      entry.rowIndex === action.rowIndex
  );

  if (!option) {
    throw new Error("Cible de retournement invalide.");
  }

  const targetCard =
    game.players[action.targetPlayerIndex].columns[action.columnIndex]?.[action.rowIndex];

  if (!targetCard) {
    throw new Error("Carte introuvable.");
  }

  if (targetCard.faceUp === false) {
    throw new Error("Une carte retournee ne peut pas etre remise sur son recto.");
  }

  targetCard.faceUp = false;

  if (pendingChoice.sourceCase === 5) {
    ensureStats(game).case5.used += 1;
  }

  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} retourne la carte de rang ${action.rowIndex + 1} dans la colonne ${action.columnIndex + 1} de ${game.players[action.targetPlayerIndex].name}.`
  );
  game.pendingChoice = null;
}

function resolveBansheeDiscardChoice(game, action) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "banshee_discard") {
    throw new Error("Aucun choix Banshee en attente.");
  }

  const option = pendingChoice.options.find(
    (entry) =>
      entry.targetPlayerIndex === action.targetPlayerIndex &&
      entry.columnIndex === action.columnIndex
  );

  if (!option) {
    throw new Error("Cible de defausse invalide.");
  }

  const targetPlayer = game.players[action.targetPlayerIndex];
  const targetColumn = targetPlayer.columns[action.columnIndex];

  if (!targetColumn || !targetColumn.length) {
    throw new Error("Colonne introuvable.");
  }

  targetPlayer.columns[action.columnIndex] = [];
  movePlayer(game, pendingChoice.playerIndex, option.moonCount);
  recordCardActivation(game, "banshee");
  recordCardMovement(game, "banshee", option.moonCount);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} active Banshee ${pendingChoice.cardValue} : defausse la colonne ${action.columnIndex + 1} de ${targetPlayer.name} puis +${option.moonCount}`
  );
  game.pendingChoice = null;
}

function applyCardEffect(game, playerIndex, card, columnIndex) {
  if (card.faceUp === false) {
    recordCardActivation(game, "carte_cachee");
    movePlayer(game, playerIndex, 1);
    recordCardMovement(game, "carte_cachee", 1);
    game.log.unshift(
      `${game.players[playerIndex].name} joue une carte cachee sans valeur ni effet : +1`
    );
    return;
  }

  switch (card.type) {
    case "slime":
      recordCardActivation(game, "slime");
      game.log.unshift(
        `${game.players[playerIndex].name} active Slime ${card.value} : placement libre, pas de deplacement`
      );
      return;
    case "squelette": {
      recordCardActivation(game, "squelette");
      movePlayer(game, playerIndex, 1);
      recordCardMovement(game, "squelette", 1);
      const playerColumn = game.players[playerIndex].columns[columnIndex];
      const cardBelow = playerColumn[playerColumn.length - 2] || null;
      const hasMoonOnBoardCase =
        (game.players[playerIndex].columnMoons?.[columnIndex] || 0) > 0;
      const shouldReplay = Boolean(
        (cardBelow && (cardBelow.faceUp === false || cardBelow.moon)) || hasMoonOnBoardCase
      );

      game.extraTurn = shouldReplay;
      if (shouldReplay) {
        recordReplayGranted(game, "squelette");
      }
      game.log.unshift(
        shouldReplay
          ? `${game.players[playerIndex].name} active Squelette ${card.value} : +1 et rejoue grace a une lune sous la carte ou sur la case`
          : `${game.players[playerIndex].name} active Squelette ${card.value} : +1`
      );
      return;
    }
    case "sorciere": {
      recordCardActivation(game, "sorciere");
      const playerPosition = game.players[playerIndex].position;
      const handZoneIndex = getZoneIndexFromPosition(playerPosition);

      if (columnIndex === handZoneIndex) {
        movePlayer(game, playerIndex, 3);
        recordCardMovement(game, "sorciere", 3);
        game.log.unshift(
          `${game.players[playerIndex].name} active Sorciere ${card.value} : jouee dans sa zone -> +3`
        );
      } else {
        game.log.unshift(
          `${game.players[playerIndex].name} active Sorciere ${card.value} : hors zone -> pas d'effet`
        );
      }
      return;
    }
    case "loup": {
      recordCardActivation(game, "loup");
      const result = applyWerewolfEffect(game, playerIndex, columnIndex);
      recordCardMovement(game, "loup", result.move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Loup ${card.value} : ${result.moonCount} lune(s) dans la colonne adverse -> +${result.move}`
      );
      return;
    }
    case "vampire": {
      recordCardActivation(game, "vampire");
      const oppositePlayerIndex = getOppositePlayerIndex(playerIndex);
      const oppositeColumn = game.players[oppositePlayerIndex].columns[columnIndex];
      const oppositeTopCard = getTopCard(oppositeColumn);
      const copiedValue = getCardEffectiveValue(oppositeTopCard);

      movePlayer(game, playerIndex, copiedValue);
      recordCardMovement(game, "vampire", copiedValue);
      game.log.unshift(
        `${game.players[playerIndex].name} active Vampire ${card.value} : copie ${copiedValue} depuis la colonne ${columnIndex + 1} adverse`
      );
      return;
    }
    case "zombie": {
      recordCardActivation(game, "zombie");
      const zombieCount = countCardsOfTypeOnPlayerBoard(game, playerIndex, "zombie");
      const moveByZombieCount = {
        1: 1,
        2: 2,
        3: 4,
        4: 6,
      };

      if (zombieCount >= 5) {
        resolveStarGain(game, playerIndex, "5 zombies ou plus sur son plateau", "zombie");
        game.log.unshift(
          `${game.players[playerIndex].name} active Zombie ${card.value} : ${zombieCount} zombies -> etoile directe`
        );
        return;
      }

      const move = moveByZombieCount[zombieCount] || 0;
      movePlayer(game, playerIndex, move);
      recordCardMovement(game, "zombie", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Zombie ${card.value} : ${zombieCount} zombie(s) -> +${move}`
      );
      return;
    }
    case "reflet": {
      recordCardActivation(game, "reflet");
      const options = createRefletOptions(game, playerIndex, columnIndex);

      if (!options.length) {
        game.log.unshift(
          `${game.players[playerIndex].name} active Reflet ${card.value} : aucune carte au meme niveau sur les cotes`
        );
        return;
      }

      if (options.length === 1) {
        movePlayer(game, playerIndex, options[0].cardValue);
        recordCardMovement(game, "reflet", options[0].cardValue);
        game.log.unshift(
          `${game.players[playerIndex].name} active Reflet ${card.value} : +${options[0].cardValue} grace a ${options[0].cardFaceUp ? `${getTypeLabel(options[0].cardType)} ${options[0].cardValue}` : "une carte retournee sans valeur"}`
        );
        return;
      }

      game.pendingChoice = {
        type: "reflet",
        playerIndex,
        options,
      };
      game.log.unshift(
        `${game.players[playerIndex].name} doit choisir gauche ou droite pour son Reflet ${card.value}.`
      );
      return;
    }
    case "banshee": {
      const discardOptions = createDiscardColumnOptions(game, playerIndex);

      if (!discardOptions.length) {
        recordCardActivation(game, "banshee");
        game.log.unshift(
          `${game.players[playerIndex].name} active Banshee ${card.value} : aucune colonne a defausser`
        );
        return;
      }

      game.pendingChoice = {
        type: "banshee_discard",
        playerIndex,
        optional: false,
        label: "Banshee",
        cardValue: card.value,
        options: discardOptions,
      };
      game.log.unshift(
        `${game.players[playerIndex].name} doit choisir une colonne a defausser pour sa Banshee ${card.value}.`
      );
      return;
    }
    default:
      game.log.unshift(
        `${game.players[playerIndex].name} joue ${card.type} ${card.value} : effet introuvable`
      );
  }
}

function createPlayer(name, options = {}) {
  const columns = createStartingColumns();

  return {
    id: crypto.randomUUID(),
    name,
    isBot: Boolean(options.isBot),
    botDifficulty: options.botDifficulty ?? null,
    position: 0,
    stars: 0,
    columns,
    columnMoons: [0, 0, 0, 0],
  };
}

function createStartingColumns() {
  const columns = [[], [], [], []];
  columns[1].push({
    id: `statue-${crypto.randomUUID()}`,
    type: "statue",
    value: 2,
    moon: true,
    chief: false,
    faceUp: true,
  });
  columns[3].push({
    id: `hidden-start-${crypto.randomUUID()}`,
    type: "hidden",
    value: null,
    moon: true,
    chief: false,
    faceUp: false,
    hiddenToken: true,
  });

  return columns;
}

function createInitialState(hostName, options = {}) {
  const deck = createDeck();
  const { drawn, remaining } = drawCards(deck, 4);
  const playerOne = createPlayer(normalizeName(hostName, "Joueur 1"));

  const hasBot = options.mode === "bot";
  const difficulty = Number(options.botDifficulty ?? 0);
  const playerTwo = hasBot
    ? createPlayer("IA", {
        isBot: true,
        botDifficulty: difficulty,
      })
    : createPlayer("En attente");

  return {
    id: generateId(6),
    phase: hasBot ? "playing" : "lobby",
    mode: hasBot ? "bot" : "online",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    winner: null,
    currentPlayer: 0,
    selectedCardIndex: null,
    extraTurn: false,
    pendingChoice: null,
    pendingPlay: null,
    deck: remaining,
    row: drawn,
    players: [playerOne, playerTwo],
    log: [
      hasBot
        ? `Partie creee contre ${playerTwo.name}.`
        : "Partie creee. En attente du deuxieme joueur.",
    ],
  };
}

function resetGameState(existingGame) {
  const deck = createDeck();
  const { drawn, remaining } = drawCards(deck, 4);

  existingGame.phase = "playing";
  existingGame.mode = existingGame.players[1].isBot ? "bot" : "online";
  existingGame.winner = null;
  existingGame.currentPlayer = 0;
  existingGame.selectedCardIndex = null;
  existingGame.extraTurn = false;
  existingGame.pendingChoice = null;
  existingGame.pendingPlay = null;
  existingGame.deck = remaining;
  existingGame.row = drawn;
  existingGame.updatedAt = Date.now();
  existingGame.log = ["Nouvelle partie."];
  existingGame.stats = createEmptyStats();

  existingGame.players.forEach((player, index) => {
    player.position = 0;
    player.stars = 0;
    player.columns = createStartingColumns();
    player.columnMoons = [0, 0, 0, 0];
  });
}

function createBotVsBotState(difficultyA = 0, difficultyB = 0) {
  const game = createInitialState("IA A", {
    mode: "bot",
    botDifficulty: difficultyB,
  });

  game.players[0] = createPlayer("IA A", {
    isBot: true,
    botDifficulty: difficultyA,
  });
  game.players[1].name = "IA B";
  game.players[1].isBot = true;
  game.players[1].botDifficulty = difficultyB;
  game.phase = "playing";
  game.mode = "bot";
  game.stats = createEmptyStats();
  game.log = ["Partie creee IA vs IA."];

  return game;
}

function sanitizeGame(game, playerId) {
  const viewerPlayerIndex = game.players.findIndex((player) => player.id === playerId);
  const currentPlayer = game.players[game.currentPlayer];
  const activePlayerBlocked =
    game.phase === "playing" &&
    !game.pendingChoice &&
    !canPlayAnyCard(game.row, currentPlayer.columns) &&
    !canPlaySelectedCardFaceDown(game);

  let pendingChoice = null;

  if (game.pendingChoice && game.pendingChoice.playerIndex === viewerPlayerIndex) {
    if (game.pendingChoice.type === "reflet") {
      pendingChoice = {
        type: game.pendingChoice.type,
        options: game.pendingChoice.options.map((option) => ({
          direction: option.direction,
          columnIndex: option.columnIndex,
          cardValue: option.cardValue,
          cardType: option.cardType,
          cardLabel: getTypeLabel(option.cardType),
        })),
      };
    }

    if (game.pendingChoice.type === "board_flip") {
      pendingChoice = {
        type: game.pendingChoice.type,
        optional: true,
        sourceCase: game.pendingChoice.sourceCase,
        label: game.pendingChoice.label || `Case ${game.pendingChoice.sourceCase}`,
        options: game.pendingChoice.options.map((option) => ({
          targetPlayerIndex: option.targetPlayerIndex,
          targetPlayerName: game.players[option.targetPlayerIndex].name,
          columnIndex: option.columnIndex,
          rowIndex: option.rowIndex,
          cardValue: option.cardValue,
          cardType: option.cardType,
          cardFaceUp: option.faceUp,
          cardLabel: option.faceUp ? getTypeLabel(option.cardType) : "Carte retournee",
        })),
      };
    }

    if (game.pendingChoice.type === "banshee_discard") {
      pendingChoice = {
        type: game.pendingChoice.type,
        optional: false,
        label: "Banshee",
        options: game.pendingChoice.options.map((option) => ({
          targetPlayerIndex: option.targetPlayerIndex,
          targetPlayerName: game.players[option.targetPlayerIndex].name,
          columnIndex: option.columnIndex,
          moonCount: option.moonCount,
          columnSize: option.columnSize,
        })),
      };
    }
  }

  const visiblePlayers = game.players.map((player) => ({
    ...player,
    columns: player.columns.map((column) =>
      column.map((card) =>
        card.faceUp === false
          ? {
              id: card.id,
              value: 0,
              faceUp: false,
              moon: true,
            }
          : card
      )
    ),
  }));

  return {
    id: game.id,
    mode: game.mode || "online",
    phase: game.phase,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    winner: game.winner,
    currentPlayer: game.currentPlayer,
    currentPlayerName: currentPlayer.name,
    selectedCardIndex: game.selectedCardIndex,
    pendingChoice,
    deckCount: game.deck.length,
    row: game.row,
    players: visiblePlayers,
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

function evaluateGameForBot(game, botIndex) {
  const opponentIndex = getOppositePlayerIndex(botIndex);
  const bot = game.players[botIndex];
  const opponent = game.players[opponentIndex];

  if (game.winner === bot.name) {
    return 1_000_000;
  }

  if (game.winner === opponent.name) {
    return -1_000_000;
  }

  const botChiefs = countChiefsOnPlayerBoard(game, botIndex);
  const opponentChiefs = countChiefsOnPlayerBoard(game, opponentIndex);
  const botZombies = countCardsOfTypeOnPlayerBoard(game, botIndex, "zombie");
  const opponentZombies = countCardsOfTypeOnPlayerBoard(game, opponentIndex, "zombie");
  const botMoons = game.players[botIndex].columns.reduce(
    (total, column, columnIndex) =>
      total + countMoonsInColumn(column, game.players[botIndex].columnMoons?.[columnIndex] || 0),
    0
  );
  const opponentMoons = game.players[opponentIndex].columns.reduce(
    (total, column, columnIndex) =>
      total +
      countMoonsInColumn(column, game.players[opponentIndex].columnMoons?.[columnIndex] || 0),
    0
  );

  return (
    (bot.stars - opponent.stars) * 100_000 +
    (bot.position - opponent.position) * 1_000 +
    (botChiefs - opponentChiefs) * 90 +
    (botZombies - opponentZombies) * 70 +
    (botMoons - opponentMoons) * 25 +
    (game.currentPlayer === botIndex ? 10 : -10)
  );
}

function expandPendingChoicesForOutcome(state, playerId, actions) {
  if (state.winner) {
    return [{ actions, resultingState: state }];
  }

  resolveDeckExhaustedEndgame(state);

  if (state.winner) {
    return [{ actions, resultingState: state }];
  }

  if (!state.pendingChoice) {
    return [{ actions, resultingState: state }];
  }

  if (state.pendingChoice.type === "reflet") {
    return state.pendingChoice.options.flatMap((option) => {
      const nextState = clone(state);
      performAction(nextState, playerId, {
        type: "choose_reflet_direction",
        direction: option.direction,
      });
      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        { type: "choose_reflet_direction", direction: option.direction },
      ]);
    });
  }

  if (state.pendingChoice.type === "board_flip") {
    const skipState = clone(state);
    performAction(skipState, playerId, {
      type: "resolve_board_flip",
      skip: true,
    });
    const discardOutcomes = expandPendingChoicesForOutcome(skipState, playerId, [
      ...actions,
      { type: "resolve_board_flip", skip: true },
    ]);

    const targetedOutcomes = state.pendingChoice.options.flatMap((option) => {
      const nextState = clone(state);
      performAction(nextState, playerId, {
        type: "resolve_board_flip",
        targetPlayerIndex: option.targetPlayerIndex,
        columnIndex: option.columnIndex,
        rowIndex: option.rowIndex,
      });
      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        {
          type: "resolve_board_flip",
          targetPlayerIndex: option.targetPlayerIndex,
          columnIndex: option.columnIndex,
          rowIndex: option.rowIndex,
        },
      ]);
    });

    return [...discardOutcomes, ...targetedOutcomes];
  }

  if (state.pendingChoice.type === "banshee_discard") {
    return state.pendingChoice.options.flatMap((option) => {
      const nextState = clone(state);
      performAction(nextState, playerId, {
        type: "resolve_banshee_discard",
        targetPlayerIndex: option.targetPlayerIndex,
        columnIndex: option.columnIndex,
      });
      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        {
          type: "resolve_banshee_discard",
          targetPlayerIndex: option.targetPlayerIndex,
          columnIndex: option.columnIndex,
        },
      ]);
    });
  }

  return [{ actions, resultingState: state }];
}

function getLegalTurnOutcomes(game, playerIndex) {
  const playerId = game.players[playerIndex].id;
  const outcomes = [];

  if (game.pendingChoice) {
    return expandPendingChoicesForOutcome(clone(game), playerId, []);
  }

  ensureRowAvailable(game);

  if (game.winner) {
    return outcomes;
  }

  const player = game.players[playerIndex];
  const blocked =
    !canPlayAnyCard(game.row, player.columns) && !canPlaySelectedCardFaceDown(game);

  if (blocked) {
    for (let columnIndex = 0; columnIndex < player.columns.length; columnIndex += 1) {
      if (!player.columns[columnIndex]?.length) {
        continue;
      }
      const nextState = clone(game);
      performAction(nextState, playerId, {
        type: "discard_column",
        columnIndex,
      });
      outcomes.push({
        actions: [{ type: "discard_column", columnIndex }],
        resultingState: nextState,
      });
    }

    return outcomes;
  }

  game.row.forEach((card, cardIndex) => {
    player.columns.forEach((column, columnIndex) => {
      if (!canPlaceCardInColumn(card, column)) {
        return;
      }

      const nextState = clone(game);
      performAction(nextState, playerId, {
        type: "select_card",
        cardIndex,
      });
      performAction(nextState, playerId, {
        type: "play_column",
        columnIndex,
      });

      const baseActions = [
        { type: "select_card", cardIndex },
        { type: "play_column", columnIndex },
      ];

      const expanded = expandPendingChoicesForOutcome(nextState, playerId, baseActions);
      outcomes.push(...expanded);
    });

    player.columns.forEach((column, columnIndex) => {
      const nextState = clone(game);
      performAction(nextState, playerId, {
        type: "select_card",
        cardIndex,
      });
      performAction(nextState, playerId, {
        type: "play_selected_face_down",
        columnIndex,
      });
      outcomes.push({
        actions: [
          { type: "select_card", cardIndex },
          { type: "play_selected_face_down", columnIndex },
        ],
        resultingState: nextState,
      });
    });
  });

  return outcomes;
}

function getBotProgressScore(game, botIndex) {
  const bot = game.players[botIndex];
  return bot.stars * 100 + bot.position;
}

function evaluateImmediateOpponentResponse(game, botIndex) {
  if (game.winner || game.currentPlayer === botIndex) {
    return evaluateGameForBot(game, botIndex);
  }

  const opponentOutcomes = getLegalTurnOutcomes(game, game.currentPlayer);

  if (!opponentOutcomes.length) {
    return evaluateGameForBot(game, botIndex);
  }

  let worstScoreForBot = Infinity;

  for (const outcome of opponentOutcomes) {
    const score = evaluateGameForBot(outcome.resultingState, botIndex);
    worstScoreForBot = Math.min(worstScoreForBot, score);
  }

  return worstScoreForBot;
}

function scoreOutcomeForBot(outcome, botIndex, difficulty) {
  if (difficulty <= 0) {
    const immediateScore = evaluateGameForBot(outcome.resultingState, botIndex);
    const opponentResponseScore = evaluateImmediateOpponentResponse(
      outcome.resultingState,
      botIndex
    );

    return immediateScore * 0.65 + opponentResponseScore * 0.35;
  }

  return searchBestScore(outcome.resultingState, difficulty - 1, botIndex);
}

function chooseBestOutcomeFromList(outcomes, botIndex, difficulty) {
  if (!outcomes.length) {
    return null;
  }

  let bestOutcome = outcomes[0];
  let bestScore = -Infinity;

  for (const outcome of outcomes) {
    const score = scoreOutcomeForBot(outcome, botIndex, difficulty);

    if (score > bestScore) {
      bestScore = score;
      bestOutcome = outcome;
    }
  }

  return { ...bestOutcome, score: bestScore };
}

function chooseBotPendingChoice(game, botIndex) {
  const bot = game.players[botIndex];
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.playerIndex !== botIndex) {
    return null;
  }

  if (pendingChoice.type === "reflet") {
    const bestOption = [...pendingChoice.options].sort(
      (a, b) => b.cardValue - a.cardValue
    )[0];

    return {
      actions: [
        { type: "choose_reflet_direction", direction: bestOption.direction },
      ],
      score: bestOption.cardValue,
    };
  }

  if (pendingChoice.type === "board_flip") {
    const visibleOpponentOptions = pendingChoice.options
      .filter(
        (option) =>
          option.targetPlayerIndex !== botIndex &&
          option.faceUp &&
          option.cardValue > 0
      )
      .sort((a, b) => b.cardValue - a.cardValue);

    if (visibleOpponentOptions.length) {
      const target = visibleOpponentOptions[0];
      return {
        actions: [
          {
            type: "resolve_board_flip",
            targetPlayerIndex: target.targetPlayerIndex,
            columnIndex: target.columnIndex,
            rowIndex: target.rowIndex,
          },
        ],
        score: target.cardValue,
      };
    }

    return {
      actions: [{ type: "resolve_board_flip", skip: true }],
      score: 0,
    };
  }

  if (pendingChoice.type === "banshee_discard") {
    const target = [...pendingChoice.options].sort((a, b) => {
      const scoreA =
        a.moonCount * 10 +
        a.columnSize * 2 +
        (a.targetPlayerIndex !== botIndex ? 5 : 0);
      const scoreB =
        b.moonCount * 10 +
        b.columnSize * 2 +
        (b.targetPlayerIndex !== botIndex ? 5 : 0);
      return scoreB - scoreA;
    })[0];

    return {
      actions: [
        {
          type: "resolve_banshee_discard",
          targetPlayerIndex: target.targetPlayerIndex,
          columnIndex: target.columnIndex,
        },
      ],
      score: target.moonCount * 10 + target.columnSize,
    };
  }

  return null;
}

function searchBestScore(game, depth, botIndex) {
  if (depth < 0 || game.winner) {
    return evaluateGameForBot(game, botIndex);
  }

  const outcomes = getLegalTurnOutcomes(game, game.currentPlayer);

  if (!outcomes.length) {
    return evaluateGameForBot(game, botIndex);
  }

  if (game.currentPlayer === botIndex) {
    let best = -Infinity;

    for (const outcome of outcomes) {
      const score =
        depth === 0
          ? evaluateGameForBot(outcome.resultingState, botIndex)
          : searchBestScore(outcome.resultingState, depth - 1, botIndex);
      best = Math.max(best, score);
    }

    return best;
  }

  let worst = Infinity;

  for (const outcome of outcomes) {
    const score =
      depth === 0
        ? evaluateGameForBot(outcome.resultingState, botIndex)
        : searchBestScore(outcome.resultingState, depth - 1, botIndex);
    worst = Math.min(worst, score);
  }

  return worst;
}

function chooseBotOutcome(game, botIndex, difficulty) {
  const pendingChoiceResolution = chooseBotPendingChoice(game, botIndex);

  if (pendingChoiceResolution) {
    return pendingChoiceResolution;
  }

  const outcomes = getLegalTurnOutcomes(game, botIndex);

  if (!outcomes.length) {
    return null;
  }
  const currentProgress = getBotProgressScore(game, botIndex);
  const visibleOutcomes = outcomes.filter(
    (outcome) => outcome.actions[0]?.type === "select_card"
  );
  const visibleAdvancingOutcomes = visibleOutcomes.filter(
    (outcome) => getBotProgressScore(outcome.resultingState, botIndex) > currentProgress
  );

  if (visibleAdvancingOutcomes.length) {
    return chooseBestOutcomeFromList(visibleAdvancingOutcomes, botIndex, difficulty);
  }

  const hiddenOutcomes = outcomes.filter(
    (outcome) => outcome.actions[1]?.type === "play_selected_face_down"
  );

  if (hiddenOutcomes.length) {
    return chooseBestOutcomeFromList(hiddenOutcomes, botIndex, difficulty);
  }

  if (visibleOutcomes.length) {
    return chooseBestOutcomeFromList(visibleOutcomes, botIndex, difficulty);
  }

  return chooseBestOutcomeFromList(outcomes, botIndex, difficulty);
}

function isBotTurn(game) {
  return (
    game.phase === "playing" &&
    !game.winner &&
    Boolean(game.players[game.currentPlayer]?.isBot)
  );
}

function processBotTurns(game) {
  let safety = 0;

  while (isBotTurn(game) && safety < 20) {
    const botIndex = game.currentPlayer;
    const bot = game.players[botIndex];
    const difficulty = Number(bot.botDifficulty ?? 0);
    const chosen = chooseBotOutcome(clone(game), botIndex, difficulty);

    if (!chosen) {
      break;
    }

    game.log.unshift(`${bot.name} analyse le plateau.`);

    for (const action of chosen.actions) {
      if (game.winner) {
        break;
      }
      try {
        performAction(game, bot.id, action);
      } catch (error) {
        if (error.message === "La partie est terminee.") {
          break;
        }
        throw error;
      }
    }

    safety += 1;
  }
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

function finalizeTurnAfterResolvedPlay(
  game,
  playerIndex,
  wasLeftmostCard,
  previousPosition,
  shouldRefillRow = false
) {
  const player = game.players[playerIndex];
  const pendingPlay = game.pendingPlay || null;

  maybeTriggerBoardEffect(game, playerIndex, previousPosition, {
    skipBoardCase: pendingPlay?.boardFlipResolvedCase ?? null,
  });

  if (game.pendingChoice) {
    game.selectedCardIndex = null;
    game.updatedAt = Date.now();
    return;
  }

  if (player.position >= 12) {
    resolveStarGain(game, playerIndex, "atteint la case etoile");

    if (game.winner) {
      game.selectedCardIndex = null;
      game.updatedAt = Date.now();
      return;
    }
  }

  if (wasLeftmostCard || shouldRefillRow) {
    refillCommonRow(game, "Refill");
  }

  if (resolveDeckExhaustedEndgame(game)) {
    game.selectedCardIndex = null;
    game.updatedAt = Date.now();
    return;
  }

  game.selectedCardIndex = null;

  if (game.extraTurn) {
    game.log.unshift(`${player.name} rejoue immediatement.`);
    game.extraTurn = false;
  } else {
    game.currentPlayer = game.currentPlayer === 0 ? 1 : 0;
  }

  ensureStats(game).turnsCompleted += 1;
  game.updatedAt = Date.now();
}

function ensureRowAvailable(game) {
  if (resolveDeckExhaustedEndgame(game)) {
    return;
  }

  if (game.row.length > 0 || game.deck.length === 0) {
    return;
  }

  const { drawn, remaining } = drawCards(game.deck, Math.min(4, game.deck.length));
  game.row = drawn;
  game.deck = remaining;
  game.log.unshift(`Securite : la rangee etait vide, ${drawn.length} carte(s) ont ete ajoutee(s).`);
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
      game.pendingChoice = null;
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

  resolveDeckExhaustedEndgame(game);

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

  if (action.type === "choose_reflet_direction") {
    if (!game.pendingChoice || game.pendingChoice.playerIndex !== playerIndex) {
      throw new Error("Aucun choix en attente.");
    }

    const pendingPlay = game.pendingPlay;
    resolveRefletChoice(game, action.direction);
    finalizeTurnAfterResolvedPlay(
      game,
      playerIndex,
      pendingPlay?.wasLeftmostCard,
      pendingPlay?.previousPosition,
      pendingPlay?.shouldRefillRow
    );
    game.pendingPlay = null;
    return;
  }

  if (action.type === "resolve_board_flip") {
    if (!game.pendingChoice || game.pendingChoice.playerIndex !== playerIndex) {
      throw new Error("Aucun choix de plateau en attente.");
    }

    const pendingPlay = game.pendingPlay;
    const sourceCase = game.pendingChoice.sourceCase;
    resolveBoardFlipChoice(game, action);
    game.pendingPlay = {
      ...(pendingPlay || {}),
      boardFlipResolvedCase: sourceCase,
    };
    finalizeTurnAfterResolvedPlay(
      game,
      playerIndex,
      pendingPlay?.wasLeftmostCard,
      pendingPlay?.previousPosition,
      pendingPlay?.shouldRefillRow
    );
    game.pendingPlay = null;
    return;
  }

  if (action.type === "resolve_banshee_discard") {
    if (!game.pendingChoice || game.pendingChoice.playerIndex !== playerIndex) {
      throw new Error("Aucun choix Banshee en attente.");
    }

    const pendingPlay = game.pendingPlay;
    resolveBansheeDiscardChoice(game, action);
    finalizeTurnAfterResolvedPlay(
      game,
      playerIndex,
      pendingPlay?.wasLeftmostCard,
      pendingPlay?.previousPosition,
      pendingPlay?.shouldRefillRow
    );
    game.pendingPlay = null;
    return;
  }

  if (game.pendingChoice) {
    throw new Error("Un choix est en attente avant de poursuivre.");
  }

  ensureRowAvailable(game);

  if (game.winner) {
    throw new Error("La partie est terminee.");
  }

  const blocked =
    !canPlayAnyCard(game.row, player.columns) && !canPlaySelectedCardFaceDown(game);
  game.extraTurn = false;

  if (action.type === "select_card") {
    const card = game.row[action.cardIndex];

    if (!card) {
      throw new Error("Carte introuvable.");
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
    const previousPosition = player.position;

    targetColumn.push(card);
    game.row.splice(cardIndex, 1);
    game.log.unshift(
      `${player.name} joue ${getTypeLabel(card.type)} ${card.value} dans sa colonne ${columnIndex + 1}`
    );

    applyCardEffect(game, playerIndex, card, columnIndex);

    if (game.pendingChoice) {
      game.pendingPlay = {
        wasLeftmostCard,
        boardFlipResolvedCase: null,
        previousPosition,
        shouldRefillRow: false,
      };
      game.selectedCardIndex = null;
      game.updatedAt = Date.now();
      return;
    }

    finalizeTurnAfterResolvedPlay(
      game,
      playerIndex,
      wasLeftmostCard,
      previousPosition
    );
    return;
  }

  if (action.type === "play_selected_face_down") {
    if (blocked) {
      throw new Error("Impossible de jouer une carte cachee, il faut defausser une colonne.");
    }

    const columnIndex = action.columnIndex;
    const cardIndex = game.selectedCardIndex;
    const targetColumn = player.columns[columnIndex];
    const selectedCard = game.row[cardIndex];

    if (!targetColumn || !selectedCard) {
      throw new Error("Cible invalide.");
    }

    const previousPosition = player.position;
    const wasLeftmostCard = cardIndex === 0;
    const hiddenCard = {
      id: `hidden-${crypto.randomUUID()}`,
      type: "hidden",
      value: null,
      moon: true,
      chief: false,
      faceUp: false,
      hiddenToken: true,
    };

    targetColumn.push(hiddenCard);
    game.row.splice(cardIndex, 1);
    game.selectedCardIndex = null;
    game.log.unshift(
      `${player.name} joue ${getTypeLabel(selectedCard.type)} ${selectedCard.value} face cachee dans sa colonne ${columnIndex + 1}`
    );

    applyCardEffect(game, playerIndex, hiddenCard, columnIndex);

    if (game.pendingChoice) {
      game.pendingPlay = {
        wasLeftmostCard: false,
        boardFlipResolvedCase: null,
        previousPosition,
        shouldRefillRow: wasLeftmostCard,
      };
      game.updatedAt = Date.now();
      return;
    }

    finalizeTurnAfterResolvedPlay(game, playerIndex, wasLeftmostCard, previousPosition, false);
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

    if (player.columns[columnIndex].length === 0) {
      throw new Error("Impossible de defausser une colonne vide.");
    }

    player.columns[columnIndex] = [];
    ensureStats(game).blockedTurns += 1;
    ensureStats(game).forcedDiscards += 1;
    game.selectedCardIndex = null;
    game.extraTurn = false;
    game.pendingChoice = null;
    game.pendingPlay = null;
    game.currentPlayer = game.currentPlayer === 0 ? 1 : 0;
    ensureStats(game).turnsCompleted += 1;
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
        const state = createInitialState(body.playerName, {
          mode: body.mode,
          botDifficulty: body.botDifficulty,
        });
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
        if (entry.state.mode === "bot") {
          sendJson(res, 409, { error: "Cette partie est reservee a une partie contre IA." });
          return;
        }

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
        ensureRowAvailable(entry.state);
        processBotTurns(entry.state);
        ensureRowAvailable(entry.state);
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

function createHttpServer() {
  return http.createServer((req, res) => {
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
}

module.exports = {
  createBotVsBotState,
  createInitialState,
  createHttpServer,
  createEmptyStats,
  ensureRowAvailable,
  getLegalTurnOutcomes,
  performAction,
  processBotTurns,
};

if (require.main === module) {
  const server = createHttpServer();
  server.listen(PORT, () => {
    console.log(`Crepuscule server listening on http://localhost:${PORT}`);
  });
}
