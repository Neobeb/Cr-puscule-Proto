export function countMoonsInOpponentColumn(game, playerIndex, columnIndex) {
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

export function applyWerewolfEffect(game, playerIndex, columnIndex) {
  const moonCount = countMoonsInOpponentColumn(game, playerIndex, columnIndex);
  const move = moonCount * 2;

  game.players[playerIndex].position += move;

  return {
    moonCount,
    move,
  };
}
