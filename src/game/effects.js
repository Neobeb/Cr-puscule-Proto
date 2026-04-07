import { applyLoupEffect } from "./moon";

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
  game.log.unshift(
    `${player.name} gagne une etoile (${player.stars}/3) : ${reason}`
  );

  if (player.stars >= 3) {
    game.winner = player.name;
    game.log.unshift(`${player.name} gagne la partie !`);
    return;
  }

  game.players[0].position = 0;
  game.players[1].position = 0;
}

function getOppositePlayerIndex(playerIndex) {
  return playerIndex === 0 ? 1 : 0;
}

function getTopCard(column) {
  if (!column || column.length === 0) return null;
  return column[column.length - 1];
}

function getZoneIndexFromPosition(position) {
  if (position < 0) return 0;
  if (position <= 2) return 0;
  if (position <= 5) return 1;
  if (position <= 8) return 2;
  if (position <= 11) return 3;
  return 3;
}

export const effects = {
  squelette: (game, playerIndex, card, columnIndex) => {
    movePlayer(game, playerIndex, 1);
    const playerColumn = game.players[playerIndex].columns[columnIndex];
    const cardBelow = playerColumn[playerColumn.length - 2] || null;
    const shouldReplay = Boolean(cardBelow && cardBelow.moon);

    game.extraTurn = shouldReplay;
    game.log.unshift(
      shouldReplay
        ? `${game.players[playerIndex].name} active Squelette ${card.value} : +1 et rejoue grace a une lune sous la carte`
        : `${game.players[playerIndex].name} active Squelette ${card.value} : +1`
    );
  },

  sorciere: (game, playerIndex, card, columnIndex) => {
    const playerPosition = game.players[playerIndex].position;
    const handZoneIndex = getZoneIndexFromPosition(playerPosition);

    if (columnIndex === handZoneIndex) {
      movePlayer(game, playerIndex, 3);
      game.log.unshift(
        `${game.players[playerIndex].name} active Sorciere ${card.value} : jouee dans la zone de sa main -> +3`
      );
    } else {
      game.log.unshift(
        `${game.players[playerIndex].name} active Sorciere ${card.value} : pas dans la zone de sa main -> pas d'effet`
      );
    }
  },

  loup: (game, playerIndex, card, columnIndex) => {
    const result = applyLoupEffect(game, playerIndex, columnIndex);

    game.log.unshift(
      `${game.players[playerIndex].name} active Loup ${card.value} : ${result.moonCount} lune(s) dans la colonne adverse -> +${result.move}`
    );
  },

  slime: (game, playerIndex, card) => {
    game.log.unshift(
      `${game.players[playerIndex].name} active Slime ${card.value} : placement libre, pas de deplacement`
    );
  },

  vampire: (game, playerIndex, card, columnIndex) => {
    const oppositePlayerIndex = getOppositePlayerIndex(playerIndex);
    const oppositeColumn =
      game.players[oppositePlayerIndex].columns[columnIndex];
    const oppositeTopCard = getTopCard(oppositeColumn);
    const copiedValue = oppositeTopCard ? oppositeTopCard.value : 0;

    movePlayer(game, playerIndex, copiedValue);

    game.log.unshift(
      `${game.players[playerIndex].name} active Vampire ${card.value} : copie ${copiedValue} depuis la colonne ${columnIndex + 1} adverse`
    );
  },

  zombie: (game, playerIndex, card) => {
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
        `${game.players[playerIndex].name} active Zombie ${card.value} : ${zombieCount} zombies -> etoile directe`
      );
      return;
    }

    const move = moveByZombieCount[zombieCount] || 0;
    movePlayer(game, playerIndex, move);
    game.log.unshift(
      `${game.players[playerIndex].name} active Zombie ${card.value} : ${zombieCount} zombie(s) -> +${move}`
    );
  },

  siamoise: (game, playerIndex, card, columnIndex) => {
    game.log.unshift(
      `${game.players[playerIndex].name} active Siamoise ${card.value} : choix gauche/droite gere par le serveur multijoueur`
    );
  },
};

export function applyCardEffect(game, playerIndex, card, columnIndex) {
  const effect = effects[card.type];

  if (!effect) {
    game.log.unshift(
      `${game.players[playerIndex].name} joue ${card.type} ${card.value} : effet introuvable`
    );
    return;
  }

  effect(game, playerIndex, card, columnIndex);
}
