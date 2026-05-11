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
  blob: "Blob",
  diable: "Diable",
  momie: "Momie",
  idole: "Idole",
  statue: "Statue",
};

const STANDARD_VALUES = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
const PREMIUM_VALUES = [3, 3, 3, 3, 3, 4, 4, 4, 4, 4];
const STAR_CASE = 16;
const BASE_FAMILY_TYPES = [
  "vampire",
  "sorciere",
  "squelette",
  "reflet",
  "loup",
  "zombie",
  "momie",
];
const OPTIONAL_FAMILY_TYPES = ["banshee", "idole", "blob", "diable"];
const ALL_FAMILY_TYPES = [
  ...BASE_FAMILY_TYPES,
  ...OPTIONAL_FAMILY_TYPES,
];
const BOARD_TYPES = {
  blank: {
    label: "Plateau vierge",
    refillCases: [],
    stopCases: [],
    removeCases: [],
    opponentDestroyCases: [],
  },
  base: {
    label: "Plateau base",
    refillCases: [5],
    stopCases: [8],
    removeCases: [10],
    opponentDestroyCases: [],
  },
  test: {
    label: "Plateau test",
    refillCases: [],
    stopCases: [8],
    removeCases: [10],
    opponentDestroyCases: [5],
  },
};
const DEFAULT_BOARD_TYPE = "base";

function createCardSet(type, values, options = {}) {
  const clampIndex = (index) =>
    Math.max(0, Math.min(Number(index), values.length - 1));
  const moonIndexes = new Set((options.moonIndexes || []).map(clampIndex));
  const chiefIndexes = new Set((options.chiefIndexes || []).map(clampIndex));
  const allChiefs = Boolean(options.allChiefs);

  return values.map((value, index) => ({
    id: `${type}-${index}`,
    type,
    value,
    moon: moonIndexes.has(index),
    chief: allChiefs || chiefIndexes.has(index),
  }));
}

const DEFAULT_FAMILY_CONFIGS = {
  sorciere: {
    values: STANDARD_VALUES,
    moonIndexes: [2],
    chiefIndexes: [9],
  },
  vampire: {
    values: PREMIUM_VALUES,
    moonIndexes: [5],
    chiefIndexes: [],
  },
  squelette: {
    values: STANDARD_VALUES,
    moonIndexes: [9],
    chiefIndexes: [0],
  },
  loup: {
    values: STANDARD_VALUES,
    moonIndexes: [8],
    chiefIndexes: [2],
  },
  zombie: {
    values: STANDARD_VALUES,
    moonIndexes: [],
    chiefIndexes: [0, 2, 4, 6, 8],
  },
  reflet: {
    values: PREMIUM_VALUES,
    moonIndexes: [5],
    chiefIndexes: [7],
  },
  banshee: {
    values: STANDARD_VALUES,
    moonIndexes: [],
    chiefIndexes: [6],
  },
  blob: {
    values: STANDARD_VALUES,
    moonIndexes: [6],
    chiefIndexes: [9],
  },
  diable: {
    values: PREMIUM_VALUES,
    moonIndexes: [],
    chiefIndexes: [],
  },
  momie: {
    values: STANDARD_VALUES,
    moonIndexes: [7],
    chiefIndexes: [9],
  },
  idole: {
    values: PREMIUM_VALUES,
    moonIndexes: [],
    chiefIndexes: [1, 3, 5, 7, 9],
  },
};

const CARD_SETS = Object.fromEntries(
  Object.entries(DEFAULT_FAMILY_CONFIGS).map(([type, config]) => [
    type,
    createCardSet(type, config.values, config),
  ])
);

function normalizeFamilyTypes(familyTypes) {
  const requested = Array.isArray(familyTypes) ? familyTypes : BASE_FAMILY_TYPES;
  const valid = requested.filter((type, index) =>
    ALL_FAMILY_TYPES.includes(type) && requested.indexOf(type) === index
  );

  return valid.length ? valid : BASE_FAMILY_TYPES;
}

function normalizeBoardType(boardType) {
  return BOARD_TYPES[boardType] ? boardType : DEFAULT_BOARD_TYPE;
}

function normalizeCardValues(values, fallbackValues) {
  const fallback = Array.isArray(fallbackValues) && fallbackValues.length
    ? fallbackValues
    : STANDARD_VALUES;
  const source = Array.isArray(values) ? values : [];

  return fallback.map((fallbackValue, index) => {
    const value = Number(source[index]);

    if (!Number.isFinite(value)) {
      return fallbackValue;
    }

    return Math.max(0, Math.min(9, Math.trunc(value)));
  });
}

function normalizeCardIndexes(indexes, fallbackIndexes, cardCount) {
  const source = Array.isArray(indexes) ? indexes : fallbackIndexes;

  if (!Array.isArray(source)) {
    return [];
  }

  const normalized = source
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < cardCount);

  return [...new Set(normalized)];
}

function normalizeFamilyConfig(type, familyConfig) {
  const fallback = DEFAULT_FAMILY_CONFIGS[type];

  if (!fallback) {
    return null;
  }

  const incoming =
    familyConfig && typeof familyConfig === "object" ? familyConfig : {};
  const values = normalizeCardValues(incoming.values, fallback.values);
  const moonIndexes = normalizeCardIndexes(
    incoming.moonIndexes,
    fallback.moonIndexes,
    values.length
  );
  const chiefIndexes = normalizeCardIndexes(
    incoming.chiefIndexes,
    fallback.chiefIndexes,
    values.length
  );

  return {
    values,
    moonIndexes,
    chiefIndexes,
  };
}

function normalizeFamilyConfigs(familyConfigs) {
  const incoming =
    familyConfigs && typeof familyConfigs === "object" ? familyConfigs : {};

  return Object.fromEntries(
    ALL_FAMILY_TYPES.map((type) => [
      type,
      normalizeFamilyConfig(type, incoming[type]),
    ])
  );
}

function createConfiguredCardSet(type, familyConfigs) {
  const config = familyConfigs?.[type] || normalizeFamilyConfig(type);

  return createCardSet(type, config.values, config);
}

function getBoardConfig(gameOrBoardType) {
  const boardType =
    typeof gameOrBoardType === "string"
      ? gameOrBoardType
      : gameOrBoardType?.boardType;
  return BOARD_TYPES[normalizeBoardType(boardType)];
}

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
    initialDeckSize: 0,
    turnsCompleted: 0,
    blockedTurns: 0,
    forcedDiscards: 0,
    starsBySource: {
      case16: 0,
      zombie: 0,
    },
    caseEntries: {
      5: 0,
      8: 0,
      10: 0,
    },
    boardFlip: {
      prompts: 0,
      used: 0,
      skipped: 0,
    },
    discards: {
      columns: 0,
      cards: 0,
      bySource: {
        remove: {
          columns: 0,
          cards: 0,
        },
        sabotage: {
          columns: 0,
          cards: 0,
        },
      },
    },
    rowRefills: 0,
    rowReplacements: 0,
    rowAppearances: {},
    visibleCardsPlayed: {},
    hiddenSourceCardsPlayed: {},
    chiefsPlayed: {
      total: 0,
      byPlayer: {
        0: 0,
        1: 0,
      },
      byType: {},
    },
    hiddenCardsPlayedByPlayer: {
      0: 0,
      1: 0,
    },
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

  const defaults = createEmptyStats();
  game.stats.caseEntries = {
    ...defaults.caseEntries,
    ...(game.stats.caseEntries || {}),
  };
  game.stats.boardFlip = {
    ...defaults.boardFlip,
    ...(game.stats.boardFlip || game.stats.case5 || {}),
  };
  game.stats.discards = {
    ...defaults.discards,
    ...(game.stats.discards || {}),
    bySource: {
      ...defaults.discards.bySource,
      ...((game.stats.discards && game.stats.discards.bySource) || {}),
    },
  };
  game.stats.starsBySource = {
    ...defaults.starsBySource,
    ...(game.stats.starsBySource || {}),
  };
  game.stats.chiefsPlayed = {
    ...defaults.chiefsPlayed,
    ...(game.stats.chiefsPlayed || {}),
    byPlayer: {
      ...defaults.chiefsPlayed.byPlayer,
      ...((game.stats.chiefsPlayed && game.stats.chiefsPlayed.byPlayer) || {}),
    },
    byType: {
      ...defaults.chiefsPlayed.byType,
      ...((game.stats.chiefsPlayed && game.stats.chiefsPlayed.byType) || {}),
    },
  };
  game.stats.rowAppearances = game.stats.rowAppearances || {};
  game.stats.visibleCardsPlayed = game.stats.visibleCardsPlayed || {};
  game.stats.hiddenSourceCardsPlayed = game.stats.hiddenSourceCardsPlayed || {};
  game.stats.cardActivations = game.stats.cardActivations || {};
  game.stats.cardMovementTotal = game.stats.cardMovementTotal || {};
  game.stats.firstActivationTurn = game.stats.firstActivationTurn || {};
  game.stats.replaysGranted = game.stats.replaysGranted || {};
  game.stats.hiddenCardsPlayedByPlayer = {
    ...defaults.hiddenCardsPlayedByPlayer,
    ...(game.stats.hiddenCardsPlayedByPlayer || {}),
  };
  game.stats.winners = game.stats.winners || [];
  game.stats.initialDeckSize = game.stats.initialDeckSize || 0;

  return game.stats;
}

function recordCardActivation(game, type) {
  const stats = ensureStats(game);
  stats.cardActivations[type] = (stats.cardActivations[type] || 0) + 1;
  if (stats.firstActivationTurn[type] === undefined) {
    stats.firstActivationTurn[type] = (stats.turnsCompleted || 0) + 1;
  }
}

function recordCardMovement(game, type, amount) {
  const stats = ensureStats(game);
  stats.cardMovementTotal[type] = (stats.cardMovementTotal[type] || 0) + amount;
}

function recordReplayGranted(game, type, amount = 1) {
  const stats = ensureStats(game);
  stats.replaysGranted[type] = (stats.replaysGranted[type] || 0) + amount;
}

function recordHiddenCardPlayed(game, playerIndex, amount = 1) {
  const stats = ensureStats(game);
  stats.hiddenCardsPlayedByPlayer[playerIndex] =
    (stats.hiddenCardsPlayedByPlayer[playerIndex] || 0) + amount;
}

function recordChiefPlayed(game, playerIndex, cardType) {
  const stats = ensureStats(game);
  stats.chiefsPlayed.total += 1;
  stats.chiefsPlayed.byPlayer[playerIndex] =
    (stats.chiefsPlayed.byPlayer[playerIndex] || 0) + 1;
  stats.chiefsPlayed.byType[cardType] =
    (stats.chiefsPlayed.byType[cardType] || 0) + 1;
}

function recordRowAppearances(game, cards) {
  const stats = ensureStats(game);
  cards.filter(Boolean).forEach((card) => {
    stats.rowAppearances[card.type] = (stats.rowAppearances[card.type] || 0) + 1;
  });
}

function recordVisibleCardPlayed(game, cardType) {
  const stats = ensureStats(game);
  stats.visibleCardsPlayed[cardType] = (stats.visibleCardsPlayed[cardType] || 0) + 1;
}

function recordHiddenSourceCardPlayed(game, cardType) {
  const stats = ensureStats(game);
  stats.hiddenSourceCardsPlayed[cardType] =
    (stats.hiddenSourceCardsPlayed[cardType] || 0) + 1;
}

function recordColumnDiscard(game, source, cardCount) {
  const stats = ensureStats(game);
  const sourceStats = stats.discards.bySource[source] || { columns: 0, cards: 0 };

  stats.discards.columns += 1;
  stats.discards.cards += cardCount;
  sourceStats.columns += 1;
  sourceStats.cards += cardCount;
  stats.discards.bySource[source] = sourceStats;
}

function recordCardDiscard(game, source, cardCount = 1) {
  const stats = ensureStats(game);
  const sourceStats = stats.discards.bySource[source] || { columns: 0, cards: 0 };

  stats.discards.cards += cardCount;
  sourceStats.cards += cardCount;
  stats.discards.bySource[source] = sourceStats;
}

function createDeck(
  familyTypes = BASE_FAMILY_TYPES,
  familyConfigs = null
) {
  const selectedFamilies = normalizeFamilyTypes(familyTypes);
  const normalizedFamilyConfigs = normalizeFamilyConfigs(familyConfigs);
  const families = [...new Set(selectedFamilies)];
  const deck = clone(
    families.flatMap((type) => createConfiguredCardSet(type, normalizedFamilyConfigs) || [])
  );

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

function getRowCardCount(row) {
  return row.filter(Boolean).length;
}

function hasAnyRowCard(row) {
  return row.some(Boolean);
}

function shouldRefillFromFirstSlotRule(row) {
  return !row[0] && row.slice(1).some(Boolean);
}

function normalizeRowSlots(row) {
  const normalized = row.slice(0, 4);

  while (normalized.length < 4) {
    normalized.push(null);
  }

  return normalized;
}

function fillRowSlots(row, drawn) {
  const normalized = normalizeRowSlots(row);
  let drawnIndex = 0;

  for (let slotIndex = 0; slotIndex < normalized.length && drawnIndex < drawn.length; slotIndex += 1) {
    if (!normalized[slotIndex]) {
      normalized[slotIndex] = drawn[drawnIndex];
      drawnIndex += 1;
    }
  }

  return normalized;
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
  return row.some((card) => card &&
    columns.some((column) => canPlaceCardInColumn(card, column))
  );
}

function canPlaySelectedCardFaceDown(game) {
  return hasAnyRowCard(game.row);
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
  const requestedMove = moonCount * 2;
  const move = movePlayer(game, playerIndex, requestedMove);

  return { moonCount, move, requestedMove };
}

function movePlayer(game, playerIndex, amount, options = {}) {
  const player = game.players[playerIndex];
  const previousPosition = player.position;
  const targetPosition = previousPosition + amount;
  const stopCases = getBoardConfig(game).stopCases;
  const stopCase = options.ignoreStops
    ? null
    : stopCases.find(
        (value) => value > previousPosition && value <= targetPosition
      );

  player.position = stopCase ?? targetPosition;

  return player.position - previousPosition;
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

function countColumnsWithMoons(game, playerIndex) {
  const player = game.players[playerIndex];
  return player.columns.reduce(
    (total, column, columnIndex) =>
      total +
      (countMoonsInColumn(column, player.columnMoons?.[columnIndex] || 0) > 0 ? 1 : 0),
    0
  );
}

function getMoonCountsByColumn(game, playerIndex) {
  const player = game.players[playerIndex];
  return player.columns.map((column, columnIndex) =>
    countMoonsInColumn(column, player.columnMoons?.[columnIndex] || 0)
  );
}

function getWolfExposureScore(game, playerIndex) {
  return getMoonCountsByColumn(game, playerIndex).reduce(
    (total, moonCount) => total + moonCount * moonCount,
    0
  );
}

function getColumnPressureScore(game, playerIndex) {
  const player = game.players[playerIndex];

  return player.columns.reduce((total, column) => {
    const topValue = getTopValue(column);
    const hiddenCount = column.filter((card) => card.faceUp === false).length;
    const chiefCount = column.filter(
      (card) => card.faceUp !== false && card.chief
    ).length;
    const zombieCount = column.filter(
      (card) => card.faceUp !== false && card.type === "zombie"
    ).length;

    return (
      total +
      topValue * topValue * 85 +
      Math.max(0, column.length - 3) * 20 +
      hiddenCount * 25 -
      chiefCount * 45 -
      zombieCount * 30
    );
  }, 0);
}

function getOwnColumnDiscardUtility(game, playerIndex, columnIndex) {
  const column = game.players[playerIndex].columns[columnIndex] || [];
  const topValue = getTopValue(column);
  const hiddenCount = column.filter((card) => card.faceUp === false).length;
  const overflowCount = Math.max(0, column.length - 4);
  const chiefCount = column.filter(
    (card) => card.faceUp !== false && card.chief
  ).length;
  const zombieCount = column.filter(
    (card) => card.faceUp !== false && card.type === "zombie"
  ).length;
  const moonCount = countMoonsInColumn(
    column,
    game.players[playerIndex].columnMoons?.[columnIndex] || 0
  );

  return Math.max(
    0,
    topValue * topValue * 120 +
      overflowCount * 1_800 +
      Math.max(0, column.length - 2) * 45 +
      hiddenCount * 65 +
      moonCount * 20 -
      chiefCount * 170 -
      zombieCount * 130
  );
}

function hasOvergrownColumn(game, playerIndex) {
  return game.players[playerIndex].columns.some((column) => column.length > 4);
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
  if (position <= 3) return 0;
  if (position <= 7) return 1;
  if (position <= 11) return 2;
  return 3;
}

function resolveStarGain(game, playerIndex, reason, source = "case16") {
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

  refillCommonRow(game, `Etoile gagnee par ${player.name}`);

  game.players[0].position = 0;
  game.players[1].position = 0;

  const chiefsPlayer0 = countChiefsOnPlayerBoard(game, 0);
  const chiefsPlayer1 = countChiefsOnPlayerBoard(game, 1);

  const movePlayer0 = movePlayer(game, 0, chiefsPlayer0);
  const movePlayer1 = movePlayer(game, 1, chiefsPlayer1);
  game.log.unshift(
    `Reprise apres etoile : ${game.players[0].name} avance de ${movePlayer0}/${chiefsPlayer0} grace a ses chefs, ${game.players[1].name} avance de ${movePlayer1}/${chiefsPlayer1}.`
  );

  maybeTriggerBoardEffect(game, playerIndex, 0);
}

function resolveDeckExhaustedEndgame(game) {
  if (game.winner || game.deck.length > 0 || hasAnyRowCard(game.row)) {
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

  const move = movePlayer(game, pendingChoice.playerIndex, option.cardValue);
  recordCardMovement(game, "reflet", move);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} choisit ${direction === "left" ? "gauche" : "droite"} pour son reflet : +${move}/${option.cardValue} grace a ${option.cardFaceUp ? `${getTypeLabel(option.cardType)} ${option.cardValue}` : "une carte retournee sans valeur"}.`
  );
  game.pendingChoice = null;
}

function createFlipOptions(game) {
  const options = [];

  game.players.forEach((player, targetPlayerIndex) => {
    player.columns.forEach((column, columnIndex) => {
      const visibleEntry = getLastVisibleCardEntry(column);

      if (!visibleEntry) {
        return;
      }

      options.push({
        targetPlayerIndex,
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

function countHiddenCardsForPlayer(game, playerIndex) {
  return game.players[playerIndex].columns.reduce(
    (total, column) => total + column.filter((card) => card.faceUp === false).length,
    0
  );
}

function createFaucheurDiscardOptions(game, ownerPlayerIndex) {
  const options = [];
  const player = game.players[ownerPlayerIndex];

  player.columns.forEach((column, columnIndex) => {
    const visibleEntry = getLastVisibleCardEntry(column);

    if (!visibleEntry) {
      return;
    }

    options.push({
      targetPlayerIndex: ownerPlayerIndex,
      columnIndex,
      rowIndex: visibleEntry.rowIndex,
      cardType: visibleEntry.card.type,
      cardValue: getCardEffectiveValue(visibleEntry.card),
      cardLabel: getTypeLabel(visibleEntry.card.type),
    });
  });

  return options;
}

function createBoardDestroyOptions(game, targetPlayerIndex) {
  return createFaucheurDiscardOptions(game, targetPlayerIndex);
}

function refillCommonRow(game, sourceLabel, options = {}) {
  const stats = ensureStats(game);
  const rowCardCount = getRowCardCount(game.row);
  const rowWasFull = rowCardCount >= 4;
  const replaceIfFull = Boolean(options.replaceIfFull);

  if (rowWasFull && !replaceIfFull) {
    return;
  }

  const cardsToDraw = rowWasFull ? 4 : 4 - rowCardCount;

  if (cardsToDraw <= 0 || game.deck.length === 0) {
    return;
  }

  if (rowWasFull) {
    game.row = [null, null, null, null];
    stats.rowReplacements += 1;
  }

  const { drawn, remaining } = drawCards(game.deck, Math.min(cardsToDraw, game.deck.length));

  if (!drawn.length) {
    return;
  }

  game.row = fillRowSlots(game.row, drawn);
  game.deck = remaining;
  recordRowAppearances(game, drawn);
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
  const boardConfig = getBoardConfig(game);

  const refillCase = boardConfig.refillCases.find(
    (value) => player.position === value && previousPosition !== value && skippedCase !== value
  );
  if (refillCase !== undefined) {
    const stats = ensureStats(game);
    stats.caseEntries[refillCase] =
      (stats.caseEntries[refillCase] || 0) + 1;
    refillCommonRow(game, `Case ${refillCase} Refill`);
    game.log.unshift(`${player.name} active la case ${refillCase} : refill de la rangee commune.`);
  }

  const removeCase = boardConfig.removeCases.find(
    (value) => player.position === value && previousPosition !== value && skippedCase !== value
  );
  if (removeCase !== undefined) {
    const stats = ensureStats(game);
    stats.caseEntries[removeCase] =
      (stats.caseEntries[removeCase] || 0) + 1;
    const discardOptions = createDiscardColumnOptions(game, playerIndex);

    if (!discardOptions.length) {
      game.log.unshift(
        `${player.name} atteint la case ${removeCase}, mais aucune colonne n'est disponible pour l'action Remove.`
      );
      return;
    }

    game.pendingChoice = {
      type: "banshee_discard",
      playerIndex,
      optional: true,
      sourceCase: removeCase,
      label: "Remove",
      cardValue: null,
      boardOnly: true,
      options: discardOptions,
    };
    game.log.unshift(
      `${player.name} atteint la case ${removeCase} et doit choisir une colonne a defausser.`
    );
    return;
  }

  const destroyCase = boardConfig.opponentDestroyCases.find(
    (value) => player.position === value && previousPosition !== value && skippedCase !== value
  );
  if (destroyCase !== undefined) {
    const stats = ensureStats(game);
    stats.caseEntries[destroyCase] =
      (stats.caseEntries[destroyCase] || 0) + 1;
    const opponentIndex = getOppositePlayerIndex(playerIndex);
    const destroyOptions = createBoardDestroyOptions(game, playerIndex);

    if (!destroyOptions.length) {
      game.log.unshift(
        `${player.name} atteint la case ${destroyCase}, mais aucune carte visible ne peut etre detruite.`
      );
      return;
    }

    game.pendingChoice = {
      type: "board_destroy",
      playerIndex: opponentIndex,
      resolveForPlayerIndex: playerIndex,
      optional: true,
      sourceCase: destroyCase,
      label: "Sabotage",
      options: destroyOptions,
    };
    game.log.unshift(
      `${player.name} atteint la case ${destroyCase} : ${game.players[opponentIndex].name} peut detruire une carte visible chez ${player.name}.`
    );
    return;
  }

  const stopCase = boardConfig.stopCases.find(
    (value) => player.position === value && previousPosition !== value && skippedCase !== value
  );
  if (stopCase !== undefined) {
    const stats = ensureStats(game);
    stats.caseEntries[stopCase] =
      (stats.caseEntries[stopCase] || 0) + 1;
    game.log.unshift(`${player.name} s'arrete sur la case stop ${stopCase}.`);
  }
}

function resolveBoardFlipChoice(game, action) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "board_flip") {
    throw new Error("Aucun retournement de plateau en attente.");
  }

  if (action.skip) {
    ensureStats(game).boardFlip.skipped += 1;
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

  ensureStats(game).boardFlip.used += 1;

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

  if (action.skip) {
    if (!pendingChoice.optional) {
      throw new Error("Cette defausse est obligatoire.");
    }

    game.log.unshift(
      pendingChoice.boardOnly
        ? `${game.players[pendingChoice.playerIndex].name} choisit de ne rien defausser sur la case ${pendingChoice.sourceCase}.`
        : `${game.players[pendingChoice.playerIndex].name} choisit de ne pas utiliser sa Banshee.`
    );
    game.pendingChoice = null;
    return;
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

  const discardedCardCount = targetColumn.length;
  targetPlayer.columns[action.columnIndex] = [];
  if (pendingChoice.boardOnly) {
    recordColumnDiscard(game, "remove", discardedCardCount);
    game.log.unshift(
      `${game.players[pendingChoice.playerIndex].name} active la case ${pendingChoice.sourceCase} : defausse la colonne ${action.columnIndex + 1} de ${targetPlayer.name}.`
    );
    game.pendingChoice = null;
    return;
  }

  const move = movePlayer(game, pendingChoice.playerIndex, option.moonCount);
  recordCardActivation(game, "banshee");
  recordCardMovement(game, "banshee", move);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} active Banshee ${pendingChoice.cardValue} : defausse la colonne ${action.columnIndex + 1} de ${targetPlayer.name} puis +${move}/${option.moonCount}`
  );
  game.pendingChoice = null;
}

function resolveDiableDiscardChoice(game, action) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "diable_discard") {
    throw new Error("Aucun choix Diable en attente.");
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

  const discardedCardCount = targetColumn.length;
  targetPlayer.columns[action.columnIndex] = [];
  recordColumnDiscard(game, "diable", discardedCardCount);
  recordCardActivation(game, "diable");
  recordCardMovement(game, "diable", 0);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} active Diable ${pendingChoice.cardValue} : defausse la colonne ${action.columnIndex + 1} de ${targetPlayer.name}.`
  );
  game.pendingChoice = null;
}

function resolveFaucheurDiscardChoice(game, action) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "faucheur_discard") {
    throw new Error("Aucun choix Faucheur en attente.");
  }

  const option = pendingChoice.options.find(
    (entry) =>
      entry.targetPlayerIndex === action.targetPlayerIndex &&
      entry.columnIndex === action.columnIndex &&
      entry.rowIndex === action.rowIndex
  );

  if (!option) {
    throw new Error("Cible de defausse invalide.");
  }

  const targetColumn =
    game.players[action.targetPlayerIndex].columns[action.columnIndex];
  const targetCard = targetColumn?.[action.rowIndex];

  if (!targetCard || targetCard.faceUp === false) {
    throw new Error("Carte introuvable.");
  }

  targetColumn.splice(action.rowIndex, 1);
  const move = movePlayer(game, pendingChoice.playerIndex, 2);
  recordCardActivation(game, "faucheur");
  recordCardMovement(game, "faucheur", move);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} active Faucheur ${pendingChoice.cardValue} : defausse ${getTypeLabel(targetCard.type)} ${getCardEffectiveValue(targetCard)} en colonne ${action.columnIndex + 1}, puis +${move}/2`
  );
  game.pendingChoice = null;
}

function resolveBoardDestroyChoice(game, action) {
  const pendingChoice = game.pendingChoice;

  if (!pendingChoice || pendingChoice.type !== "board_destroy") {
    throw new Error("Aucun choix de destruction en attente.");
  }

  if (action.skip) {
    if (!pendingChoice.optional) {
      throw new Error("Cette destruction est obligatoire.");
    }

    game.log.unshift(
      `${game.players[pendingChoice.playerIndex].name} choisit de ne rien detruire sur la case ${pendingChoice.sourceCase}.`
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
    throw new Error("Cible de destruction invalide.");
  }

  const targetPlayer = game.players[action.targetPlayerIndex];
  const targetColumn = targetPlayer.columns[action.columnIndex];
  const targetCard = targetColumn?.[action.rowIndex];

  if (!targetCard || targetCard.faceUp === false) {
    throw new Error("Carte introuvable.");
  }

  targetColumn.splice(action.rowIndex, 1);
  recordCardDiscard(game, "sabotage", 1);
  game.log.unshift(
    `${game.players[pendingChoice.playerIndex].name} active ${pendingChoice.label} : detruit ${getTypeLabel(targetCard.type)} ${getCardEffectiveValue(targetCard)} dans la colonne ${action.columnIndex + 1} de ${targetPlayer.name}.`
  );
  game.pendingChoice = null;
}

function applyCardEffect(game, playerIndex, card, columnIndex) {
  if (card.faceUp === false) {
    recordCardActivation(game, "carte_cachee");
    recordHiddenCardPlayed(game, playerIndex);
    const move = movePlayer(game, playerIndex, 1);
    recordCardMovement(game, "carte_cachee", move);
    game.log.unshift(
      `${game.players[playerIndex].name} joue une carte cachee sans valeur ni effet : +${move}/1`
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
      const move = movePlayer(game, playerIndex, 1);
      recordCardMovement(game, "squelette", move);
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
          ? `${game.players[playerIndex].name} active Squelette ${card.value} : +${move}/1 et rejoue grace a une lune sous la carte ou sur la case`
          : `${game.players[playerIndex].name} active Squelette ${card.value} : +${move}/1`
      );
      return;
    }
    case "sorciere": {
      recordCardActivation(game, "sorciere");
      const playerPosition = game.players[playerIndex].position;
      const handZoneIndex = getZoneIndexFromPosition(playerPosition);
      const requestedMove = columnIndex === handZoneIndex ? 3 : 1;
      const move = movePlayer(game, playerIndex, requestedMove, { ignoreStops: true });
      recordCardMovement(game, "sorciere", move);

      if (columnIndex === handZoneIndex) {
        game.log.unshift(
          `${game.players[playerIndex].name} active Sorciere ${card.value} : jouee dans sa zone, ignore les stops -> +${move}/3`
        );
      } else {
        game.log.unshift(
          `${game.players[playerIndex].name} active Sorciere ${card.value} : hors zone, ignore les stops -> +${move}/1`
        );
      }
      return;
    }
    case "loup": {
      recordCardActivation(game, "loup");
      const result = applyWerewolfEffect(game, playerIndex, columnIndex);
      recordCardMovement(game, "loup", result.move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Loup ${card.value} : ${result.moonCount} lune(s) dans la colonne adverse -> +${result.move}/${result.requestedMove}`
      );
      return;
    }
    case "vampire": {
      recordCardActivation(game, "vampire");
      const oppositePlayerIndex = getOppositePlayerIndex(playerIndex);
      const oppositeColumn = game.players[oppositePlayerIndex].columns[columnIndex];
      const oppositeTopCard = getTopCard(oppositeColumn);
      const copiedValue = getCardEffectiveValue(oppositeTopCard);

      const move = movePlayer(game, playerIndex, copiedValue);
      recordCardMovement(game, "vampire", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Vampire ${card.value} : copie ${copiedValue} depuis la colonne ${columnIndex + 1} adverse -> +${move}/${copiedValue}`
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
      const actualMove = movePlayer(game, playerIndex, move);
      recordCardMovement(game, "zombie", actualMove);
      game.log.unshift(
        `${game.players[playerIndex].name} active Zombie ${card.value} : ${zombieCount} zombie(s) -> +${actualMove}/${move}`
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
        const move = movePlayer(game, playerIndex, options[0].cardValue);
        recordCardMovement(game, "reflet", move);
        game.log.unshift(
          `${game.players[playerIndex].name} active Reflet ${card.value} : +${move}/${options[0].cardValue} grace a ${options[0].cardFaceUp ? `${getTypeLabel(options[0].cardType)} ${options[0].cardValue}` : "une carte retournee sans valeur"}`
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
      recordCardActivation(game, "banshee");
      const hiddenCardCount = countHiddenCardsForPlayer(game, playerIndex);
      const move = movePlayer(game, playerIndex, hiddenCardCount);
      recordCardMovement(game, "banshee", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Banshee ${card.value} : ${hiddenCardCount} carte(s) retournee(s) de son cote -> +${move}/${hiddenCardCount}`
      );
      return;
    }
    case "harpie": {
      recordCardActivation(game, "harpie");
      const moonColumnCount = countColumnsWithMoons(game, playerIndex);
      const move = movePlayer(game, playerIndex, moonColumnCount);
      recordCardMovement(game, "harpie", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Harpie ${card.value} : ${moonColumnCount} colonne(s) avec lune -> +${move}/${moonColumnCount}`
      );
      return;
    }
    case "faucheur": {
      const discardOptions = createFaucheurDiscardOptions(game, playerIndex);

      game.pendingChoice = {
        type: "faucheur_discard",
        playerIndex,
        optional: false,
        label: "Faucheur",
        cardValue: card.value,
        options: discardOptions,
      };
      game.log.unshift(
        `${game.players[playerIndex].name} doit choisir une carte visible du dessus a defausser pour son Faucheur ${card.value}.`
      );
      return;
    }
    case "blob": {
      recordCardActivation(game, "blob");
      const move = movePlayer(game, playerIndex, 2);
      recordCardMovement(game, "blob", move);
      const flipOptions = createFlipOptions(game);

      if (!flipOptions.length) {
        game.log.unshift(
          `${game.players[playerIndex].name} active Blob ${card.value} : +${move}/2, aucune carte visible a retourner`
        );
        return;
      }

      game.pendingChoice = {
        type: "board_flip",
        playerIndex,
        optional: true,
        sourceCase: null,
        label: "Blob",
        options: flipOptions,
      };
      ensureStats(game).boardFlip.prompts += 1;
      game.log.unshift(
        `${game.players[playerIndex].name} active Blob ${card.value} : +${move}/2 puis peut retourner une carte visible`
      );
      return;
    }
    case "diable": {
      const discardOptions = createDiscardColumnOptions(game, playerIndex);

      if (!discardOptions.length) {
        recordCardActivation(game, "diable");
        recordCardMovement(game, "diable", 0);
        game.log.unshift(
          `${game.players[playerIndex].name} active Diable ${card.value} : aucune colonne a defausser`
        );
        return;
      }

      game.pendingChoice = {
        type: "diable_discard",
        playerIndex,
        optional: false,
        label: "Diable",
        cardValue: card.value,
        options: discardOptions,
      };
      game.log.unshift(
        `${game.players[playerIndex].name} doit choisir une de ses colonnes a defausser pour son Diable ${card.value}.`
      );
      return;
    }
    case "momie": {
      recordCardActivation(game, "momie");
      const playerColumn = game.players[playerIndex].columns[columnIndex];
      const cardBelow = playerColumn[playerColumn.length - 2] || null;
      const requestedMove = cardBelow?.faceUp === false ? 4 : 1;
      const move = movePlayer(game, playerIndex, requestedMove);
      recordCardMovement(game, "momie", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Momie ${card.value} : ${cardBelow?.faceUp === false ? "sur carte cachee" : "sans carte cachee dessous"} -> +${move}/${requestedMove}`
      );
      return;
    }
    case "idole": {
      recordCardActivation(game, "idole");
      const chiefCount = countChiefsOnPlayerBoard(game, playerIndex);
      const move = movePlayer(game, playerIndex, chiefCount);
      recordCardMovement(game, "idole", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Idole ${card.value} : ${chiefCount} chef(s) visible(s) de son cote -> +${move}/${chiefCount}`
      );
      return;
    }
    case "fee_noire": {
      recordCardActivation(game, "fee_noire");
      refillCommonRow(game, `${game.players[playerIndex].name} active Fee noire ${card.value}`, {
        replaceIfFull: true,
      });
      const weakCards = game.row.filter(
        (rowCard) => rowCard && rowCard.faceUp !== false && rowCard.value <= 1
      ).length;
      const requestedMove = 1 + weakCards;
      const move = movePlayer(game, playerIndex, requestedMove);
      recordCardMovement(game, "fee_noire", move);
      game.log.unshift(
        `${game.players[playerIndex].name} active Fee noire ${card.value} : +1 puis ${weakCards} carte(s) de valeur 0 ou 1 dans la rangee -> +${move}/${requestedMove}`
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
  const familyTypes = normalizeFamilyTypes(options.familyTypes || BASE_FAMILY_TYPES);
  const familyConfigs = normalizeFamilyConfigs(options.familyConfigs);
  const boardType = normalizeBoardType(options.boardType);
  const deck = createDeck(familyTypes, familyConfigs);
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
  playerTwo.position = hasBot ? 1 : 0;

  const game = {
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
    familyTypes,
    familyConfigs,
    boardType,
    deck: remaining,
    row: fillRowSlots([null, null, null, null], drawn),
    players: [playerOne, playerTwo],
    log: [
      hasBot
        ? `Partie creee contre ${playerTwo.name}.`
        : "Partie creee. En attente du deuxieme joueur.",
    ],
  };
  game.stats = createEmptyStats();
  game.stats.initialDeckSize = deck.length;
  recordRowAppearances(game, drawn);

  return game;
}

function resetGameState(existingGame) {
  const familyTypes = normalizeFamilyTypes(existingGame.familyTypes);
  const familyConfigs = normalizeFamilyConfigs(existingGame.familyConfigs);
  const boardType = normalizeBoardType(existingGame.boardType);
  const deck = createDeck(familyTypes, familyConfigs);
  const { drawn, remaining } = drawCards(deck, 4);

  existingGame.phase = "playing";
  existingGame.mode = existingGame.players[1].isBot ? "bot" : "online";
  existingGame.winner = null;
  existingGame.currentPlayer = 0;
  existingGame.selectedCardIndex = null;
  existingGame.extraTurn = false;
  existingGame.pendingChoice = null;
  existingGame.pendingPlay = null;
  existingGame.familyTypes = familyTypes;
  existingGame.familyConfigs = familyConfigs;
  existingGame.boardType = boardType;
  existingGame.deck = remaining;
  existingGame.row = fillRowSlots([null, null, null, null], drawn);
  existingGame.updatedAt = Date.now();
  existingGame.log = ["Nouvelle partie."];
  existingGame.stats = createEmptyStats();
  existingGame.stats.initialDeckSize = deck.length;
  recordRowAppearances(existingGame, drawn);

  existingGame.players.forEach((player, index) => {
    player.position = index === 1 ? 1 : 0;
    player.stars = 0;
    player.columns = createStartingColumns();
    player.columnMoons = [0, 0, 0, 0];
  });
}

function createBotVsBotState(difficultyA = 0, difficultyB = 0, options = {}) {
  const game = createInitialState("IA A", {
    mode: "bot",
    botDifficulty: difficultyB,
    familyTypes: options.familyTypes,
    familyConfigs: options.familyConfigs,
    boardType: options.boardType,
  });

  game.players[0] = createPlayer("IA A", {
    isBot: true,
    botDifficulty: difficultyA,
  });
  game.players[0].position = 0;
  game.players[1].name = "IA B";
  game.players[1].isBot = true;
  game.players[1].botDifficulty = difficultyB;
  game.players[1].position = 1;
  game.phase = "playing";
  game.mode = "bot";
  game.stats = createEmptyStats();
  game.stats.initialDeckSize =
    game.deck.length + getRowCardCount(game.row);
  recordRowAppearances(game, game.row);
  game.log = ["Partie creee IA vs IA."];

  return game;
}

function sanitizeGame(game, playerId) {
  const viewerPlayerIndex = game.players.findIndex((player) => player.id === playerId);
  const currentPlayer = game.players[game.currentPlayer];
  const pendingChoiceForViewer =
    viewerPlayerIndex !== -1 &&
    game.pendingChoice?.playerIndex === viewerPlayerIndex;
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
        optional: Boolean(game.pendingChoice.optional),
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
      const isRemoveCaseChoice = Boolean(game.pendingChoice.boardOnly);
      pendingChoice = {
        type: game.pendingChoice.type,
        optional: isRemoveCaseChoice ? true : Boolean(game.pendingChoice.optional),
        sourceCase: game.pendingChoice.sourceCase,
        label: isRemoveCaseChoice ? "Remove" : game.pendingChoice.label || "Banshee",
        boardOnly: isRemoveCaseChoice ? true : Boolean(game.pendingChoice.boardOnly),
        options: game.pendingChoice.options.map((option) => ({
          targetPlayerIndex: option.targetPlayerIndex,
          targetPlayerName: game.players[option.targetPlayerIndex].name,
          columnIndex: option.columnIndex,
          moonCount: option.moonCount,
          columnSize: option.columnSize,
        })),
      };
    }

    if (game.pendingChoice.type === "diable_discard") {
      pendingChoice = {
        type: game.pendingChoice.type,
        optional: false,
        label: "Diable",
        options: game.pendingChoice.options.map((option) => ({
          targetPlayerIndex: option.targetPlayerIndex,
          targetPlayerName: game.players[option.targetPlayerIndex].name,
          columnIndex: option.columnIndex,
          moonCount: option.moonCount,
          columnSize: option.columnSize,
        })),
      };
    }

    if (game.pendingChoice.type === "board_destroy") {
      pendingChoice = {
        type: game.pendingChoice.type,
        optional: Boolean(game.pendingChoice.optional),
        sourceCase: game.pendingChoice.sourceCase,
        label: game.pendingChoice.label || "Sabotage",
        options: game.pendingChoice.options.map((option) => ({
          targetPlayerIndex: option.targetPlayerIndex,
          targetPlayerName: game.players[option.targetPlayerIndex].name,
          columnIndex: option.columnIndex,
          rowIndex: option.rowIndex,
          cardValue: option.cardValue,
          cardType: option.cardType,
          cardLabel: option.cardLabel || getTypeLabel(option.cardType),
        })),
      };
    }

    if (game.pendingChoice.type === "faucheur_discard") {
      pendingChoice = {
        type: game.pendingChoice.type,
        optional: false,
        label: "Faucheur",
        options: game.pendingChoice.options.map((option) => ({
          targetPlayerIndex: option.targetPlayerIndex,
          targetPlayerName: game.players[option.targetPlayerIndex].name,
          columnIndex: option.columnIndex,
          rowIndex: option.rowIndex,
          cardValue: option.cardValue,
          cardType: option.cardType,
          cardLabel: option.cardLabel,
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
    familyTypes: normalizeFamilyTypes(game.familyTypes),
    familyConfigs: normalizeFamilyConfigs(game.familyConfigs),
    boardType: normalizeBoardType(game.boardType),
    selectedCardIndex: game.selectedCardIndex,
    pendingChoice,
    hasPendingChoice: Boolean(game.pendingChoice),
    pendingChoicePlayerName:
      game.pendingChoice && game.players[game.pendingChoice.playerIndex]
        ? game.players[game.pendingChoice.playerIndex].name
        : null,
    deckCount: game.deck.length,
    row: game.row,
    players: visiblePlayers,
    log: game.log,
    viewerPlayerIndex,
    viewerCanAct:
      viewerPlayerIndex !== -1 &&
      game.phase === "playing" &&
      (pendingChoiceForViewer ||
        (!game.pendingChoice && game.players[game.currentPlayer].id === playerId)) &&
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
  const botMoonCounts = getMoonCountsByColumn(game, botIndex);
  const opponentMoonCounts = getMoonCountsByColumn(game, opponentIndex);
  const botMoons = botMoonCounts.reduce((total, moonCount) => total + moonCount, 0);
  const opponentMoons = opponentMoonCounts.reduce(
    (total, moonCount) => total + moonCount,
    0
  );
  const botMoonColumns = botMoonCounts.filter((moonCount) => moonCount > 0).length;
  const opponentMoonColumns = opponentMoonCounts.filter((moonCount) => moonCount > 0).length;
  const botWolfExposure = getWolfExposureScore(game, botIndex);
  const opponentWolfExposure = getWolfExposureScore(game, opponentIndex);
  const botColumnPressure = getColumnPressureScore(game, botIndex);
  const opponentColumnPressure = getColumnPressureScore(game, opponentIndex);

  return (
    (bot.stars - opponent.stars) * 100_000 +
    (bot.position - opponent.position) * 1_000 +
    (botChiefs - opponentChiefs) * 90 +
    (botZombies - opponentZombies) * 70 +
    (botMoons - opponentMoons) * 8 +
    (botMoonColumns - opponentMoonColumns) * 35 +
    (opponentWolfExposure - botWolfExposure) * 55 +
    (opponentColumnPressure - botColumnPressure) +
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

  const playerIndex = state.players.findIndex((player) => player.id === playerId);

  if (state.pendingChoice.playerIndex !== playerIndex) {
    return [{ actions, resultingState: state }];
  }

  if (
    playerIndex !== -1 &&
    ["board_flip", "banshee_discard", "diable_discard", "faucheur_discard", "board_destroy"].includes(
      state.pendingChoice.type
    )
  ) {
    const heuristicChoice = chooseBotPendingChoice(state, playerIndex);

    if (heuristicChoice?.actions?.length) {
      const nextState = clone(state);

      for (const action of heuristicChoice.actions) {
        performAction(nextState, playerId, action);
      }

      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        ...heuristicChoice.actions,
      ]);
    }
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
    const skipOutcomes =
      state.pendingChoice.optional
        ? (() => {
            const nextState = clone(state);
            performAction(nextState, playerId, {
              type: "resolve_banshee_discard",
              skip: true,
            });
            return expandPendingChoicesForOutcome(nextState, playerId, [
              ...actions,
              { type: "resolve_banshee_discard", skip: true },
            ]);
          })()
        : [];

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
    }).concat(skipOutcomes);
  }

  if (state.pendingChoice.type === "diable_discard") {
    return state.pendingChoice.options.flatMap((option) => {
      const nextState = clone(state);
      const discardUtility = getOwnColumnDiscardUtility(
        state,
        state.pendingChoice.playerIndex,
        option.columnIndex
      );
      performAction(nextState, playerId, {
        type: "resolve_diable_discard",
        targetPlayerIndex: option.targetPlayerIndex,
        columnIndex: option.columnIndex,
        discardUtility,
      });
      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        {
          type: "resolve_diable_discard",
          targetPlayerIndex: option.targetPlayerIndex,
          columnIndex: option.columnIndex,
          discardUtility,
        },
      ]);
    });
  }

  if (state.pendingChoice.type === "faucheur_discard") {
    return state.pendingChoice.options.flatMap((option) => {
      const nextState = clone(state);
      performAction(nextState, playerId, {
        type: "resolve_faucheur_discard",
        targetPlayerIndex: option.targetPlayerIndex,
        columnIndex: option.columnIndex,
        rowIndex: option.rowIndex,
      });
      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        {
          type: "resolve_faucheur_discard",
          targetPlayerIndex: option.targetPlayerIndex,
          columnIndex: option.columnIndex,
          rowIndex: option.rowIndex,
        },
      ]);
    });
  }

  if (state.pendingChoice.type === "board_destroy") {
    const skipOutcomes =
      state.pendingChoice.optional
        ? (() => {
            const nextState = clone(state);
            performAction(nextState, playerId, {
              type: "resolve_board_destroy",
              skip: true,
            });
            return expandPendingChoicesForOutcome(nextState, playerId, [
              ...actions,
              { type: "resolve_board_destroy", skip: true },
            ]);
          })()
        : [];

    return state.pendingChoice.options.flatMap((option) => {
      const nextState = clone(state);
      performAction(nextState, playerId, {
        type: "resolve_board_destroy",
        targetPlayerIndex: option.targetPlayerIndex,
        columnIndex: option.columnIndex,
        rowIndex: option.rowIndex,
      });
      return expandPendingChoicesForOutcome(nextState, playerId, [
        ...actions,
        {
          type: "resolve_board_destroy",
          targetPlayerIndex: option.targetPlayerIndex,
          columnIndex: option.columnIndex,
          rowIndex: option.rowIndex,
        },
      ]);
    }).concat(skipOutcomes);
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
    if (!card) {
      return;
    }

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
  const strategicActionBonus = outcome.actions.reduce(
    (total, action) => total + (action.discardUtility || 0),
    0
  );

  if (difficulty <= 0) {
    const immediateScore = evaluateGameForBot(outcome.resultingState, botIndex);
    const opponentResponseScore = evaluateImmediateOpponentResponse(
      outcome.resultingState,
      botIndex
    );

    return immediateScore * 0.65 + opponentResponseScore * 0.35 + strategicActionBonus;
  }

  return searchBestScore(outcome.resultingState, difficulty - 1, botIndex) + strategicActionBonus;
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

  if (pendingChoice.type === "diable_discard") {
    const scoreOption = (option) => {
      return getOwnColumnDiscardUtility(game, botIndex, option.columnIndex);
    };

    const target = [...pendingChoice.options].sort(
      (a, b) => scoreOption(b) - scoreOption(a)
    )[0];
    const discardUtility = scoreOption(target);

    return {
      actions: [
        {
          type: "resolve_diable_discard",
          targetPlayerIndex: target.targetPlayerIndex,
          columnIndex: target.columnIndex,
          discardUtility,
        },
      ],
      score: discardUtility,
    };
  }

  if (pendingChoice.type === "faucheur_discard") {
    const target = [...pendingChoice.options].sort((a, b) => {
      const selfPenaltyA = a.cardType === "faucheur" ? -10 : 0;
      const selfPenaltyB = b.cardType === "faucheur" ? -10 : 0;
      const scoreA = a.cardValue * 10 + selfPenaltyA;
      const scoreB = b.cardValue * 10 + selfPenaltyB;
      return scoreB - scoreA;
    })[0];

    return {
      actions: [
        {
          type: "resolve_faucheur_discard",
          targetPlayerIndex: target.targetPlayerIndex,
          columnIndex: target.columnIndex,
          rowIndex: target.rowIndex,
        },
      ],
      score: target.cardValue * 10,
    };
  }

  if (pendingChoice.type === "board_destroy") {
    if (!pendingChoice.options.length) {
      return {
        actions: [{ type: "resolve_board_destroy", skip: true }],
        score: 0,
      };
    }

    const target = [...pendingChoice.options].sort((a, b) => {
      const scoreA =
        a.cardValue * 10 +
        (a.cardType === "zombie" ? 8 : 0) +
        (a.cardType === "idole" ? 6 : 0);
      const scoreB =
        b.cardValue * 10 +
        (b.cardType === "zombie" ? 8 : 0) +
        (b.cardType === "idole" ? 6 : 0);
      return scoreB - scoreA;
    })[0];

    return {
      actions: [
        {
          type: "resolve_board_destroy",
          targetPlayerIndex: target.targetPlayerIndex,
          columnIndex: target.columnIndex,
          rowIndex: target.rowIndex,
        },
      ],
      score: target.cardValue * 10,
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
  const strategicDiableOutcomes = visibleOutcomes.filter(
    (outcome) =>
      hasOvergrownColumn(game, botIndex) &&
      outcome.actions.some(
        (action) =>
          action.type === "resolve_diable_discard" &&
          (action.discardUtility || 0) > 0
      )
  );

  if (strategicDiableOutcomes.length) {
    return chooseBestOutcomeFromList(strategicDiableOutcomes, botIndex, difficulty);
  }

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
  const activePlayerIndex = game.pendingChoice?.playerIndex ?? game.currentPlayer;
  return (
    game.phase === "playing" &&
    !game.winner &&
    Boolean(game.players[activePlayerIndex]?.isBot)
  );
}

function processBotTurns(game) {
  let safety = 0;

  while (isBotTurn(game) && safety < 20) {
    const botIndex = game.pendingChoice?.playerIndex ?? game.currentPlayer;
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
    skipBoardCase: pendingPlay?.resolvedBoardCase ?? null,
  });

  if (game.pendingChoice) {
    game.pendingPlay = {
      ...(pendingPlay || {}),
      wasLeftmostCard:
        pendingPlay?.wasLeftmostCard ?? Boolean(wasLeftmostCard),
      previousPosition:
        pendingPlay?.previousPosition ?? previousPosition,
      shouldRefillRow:
        pendingPlay?.shouldRefillRow ?? Boolean(shouldRefillRow),
      resolvedBoardCase:
        pendingPlay?.resolvedBoardCase ?? null,
    };
    game.selectedCardIndex = null;
    game.updatedAt = Date.now();
    return;
  }

  if (player.position >= STAR_CASE) {
    resolveStarGain(game, playerIndex, "atteint la case etoile");

    if (game.winner) {
      game.selectedCardIndex = null;
      game.updatedAt = Date.now();
      return;
    }

    if (game.pendingChoice) {
      game.pendingPlay = {
        ...(pendingPlay || {}),
        wasLeftmostCard:
          pendingPlay?.wasLeftmostCard ?? Boolean(wasLeftmostCard),
        previousPosition:
          pendingPlay?.previousPosition ?? previousPosition,
        shouldRefillRow:
          pendingPlay?.shouldRefillRow ?? Boolean(shouldRefillRow),
        resolvedBoardCase:
          pendingPlay?.resolvedBoardCase ?? null,
      };
      game.selectedCardIndex = null;
      game.updatedAt = Date.now();
      return;
    }
  }

  if (wasLeftmostCard || shouldRefillRow || shouldRefillFromFirstSlotRule(game.row)) {
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

  if (shouldRefillFromFirstSlotRule(game.row)) {
    refillCommonRow(game, "Refill");
    return;
  }

  if (hasAnyRowCard(game.row) || game.deck.length === 0) {
    return;
  }

  const { drawn, remaining } = drawCards(game.deck, Math.min(4, game.deck.length));
  game.row = fillRowSlots([null, null, null, null], drawn);
  game.deck = remaining;
  recordRowAppearances(game, drawn);
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

  const isPendingChoicePlayer = game.pendingChoice?.playerIndex === playerIndex;

  if (game.currentPlayer !== playerIndex && !isPendingChoicePlayer) {
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
      resolvedBoardCase: sourceCase,
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
    const sourceCase = game.pendingChoice.sourceCase;
    resolveBansheeDiscardChoice(game, action);
    game.pendingPlay = {
      ...(pendingPlay || {}),
      resolvedBoardCase: sourceCase,
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

  if (action.type === "resolve_diable_discard") {
    if (!game.pendingChoice || game.pendingChoice.playerIndex !== playerIndex) {
      throw new Error("Aucun choix Diable en attente.");
    }

    const pendingPlay = game.pendingPlay;
    resolveDiableDiscardChoice(game, action);
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

  if (action.type === "resolve_faucheur_discard") {
    if (!game.pendingChoice || game.pendingChoice.playerIndex !== playerIndex) {
      throw new Error("Aucun choix Faucheur en attente.");
    }

    const pendingPlay = game.pendingPlay;
    resolveFaucheurDiscardChoice(game, action);
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

  if (action.type === "resolve_board_destroy") {
    if (!game.pendingChoice || game.pendingChoice.playerIndex !== playerIndex) {
      throw new Error("Aucun choix de destruction en attente.");
    }

    const pendingPlay = game.pendingPlay;
    const sourceCase = game.pendingChoice.sourceCase;
    const resolveForPlayerIndex =
      game.pendingChoice.resolveForPlayerIndex ?? playerIndex;
    resolveBoardDestroyChoice(game, action);
    game.pendingPlay = {
      ...(pendingPlay || {}),
      resolvedBoardCase: sourceCase,
    };
    finalizeTurnAfterResolvedPlay(
      game,
      resolveForPlayerIndex,
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
    recordVisibleCardPlayed(game, card.type);
    if (card.chief) {
      recordChiefPlayed(game, playerIndex, card.type);
    }
    game.row[cardIndex] = null;
    game.log.unshift(
      `${player.name} joue ${getTypeLabel(card.type)} ${card.value} dans sa colonne ${columnIndex + 1}`
    );

    applyCardEffect(game, playerIndex, card, columnIndex);

    if (game.pendingChoice) {
      game.pendingPlay = {
        wasLeftmostCard,
        resolvedBoardCase: null,
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
    recordHiddenSourceCardPlayed(game, selectedCard.type);
    game.row[cardIndex] = null;
    game.selectedCardIndex = null;
    game.log.unshift(
      `${player.name} joue ${getTypeLabel(selectedCard.type)} ${selectedCard.value} face cachee dans sa colonne ${columnIndex + 1}`
    );

    applyCardEffect(game, playerIndex, hiddenCard, columnIndex);

    if (game.pendingChoice) {
      game.pendingPlay = {
        wasLeftmostCard: false,
        resolvedBoardCase: null,
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
          familyTypes: body.familyTypes,
          familyConfigs: body.familyConfigs,
          boardType: body.boardType,
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
        secondPlayer.position = 1;
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
