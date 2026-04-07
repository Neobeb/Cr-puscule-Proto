import { applyWerewolfEffect } from "./moon";

function movePlayer(game, playerIndex, amount) {
  game.players[playerIndex].position += amount;
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
  skeleton: (game, playerIndex, card, columnIndex) => {
    movePlayer(game, playerIndex, card.value);
    game.log.unshift(
      `${game.players[playerIndex].name} active Squelette ${card.value} : +${card.value}`
    );
  },

  witch: (game, playerIndex, card, columnIndex) => {
    const playerPosition = game.players[playerIndex].position;
    const handZoneIndex = getZoneIndexFromPosition(playerPosition);

    if (columnIndex === handZoneIndex) {
      movePlayer(game, playerIndex, 3);
      game.log.unshift(
        `${game.players[playerIndex].name} active Sorcière ${card.value} : jouée dans la zone de sa main → +3`
      );
    } else {
      game.log.unshift(
        `${game.players[playerIndex].name} active Sorcière ${card.value} : pas dans la zone de sa main → pas d'effet`
      );
    }
  },

  werewolf: (game, playerIndex, card, columnIndex) => {
    const result = applyWerewolfEffect(game, playerIndex, columnIndex);

    game.log.unshift(
      `${game.players[playerIndex].name} active Loup-garou ${card.value} : ${result.moonCount} lune(s) dans la colonne adverse → +${result.move}`
    );
  },

  slime: (game, playerIndex, card, columnIndex) => {
    movePlayer(game, playerIndex, card.value);
    game.log.unshift(
      `${game.players[playerIndex].name} active Slime ${card.value} : +${card.value}`
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
      `${game.players[playerIndex].name} active Vampire ${
        card.value
      } : copie ${copiedValue} depuis la colonne ${columnIndex + 1} adverse`
    );
  },

  zombie: (game, playerIndex, card, columnIndex) => {
    movePlayer(game, playerIndex, card.value);
    game.log.unshift(
      `${game.players[playerIndex].name} active Zombie ${card.value} : +${card.value}`
    );
  },

  ghost: (game, playerIndex, card, columnIndex) => {
    movePlayer(game, playerIndex, card.value);
    game.log.unshift(
      `${game.players[playerIndex].name} active Fantôme ${card.value} : +${card.value}`
    );
  },

  demon: (game, playerIndex, card, columnIndex) => {
    movePlayer(game, playerIndex, card.value);
    game.log.unshift(
      `${game.players[playerIndex].name} active Démon ${card.value} : +${card.value}`
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
