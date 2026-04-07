export function countMoonsInOpponentColumn(game, playerIndex, columnIndex) {
  const opponentIndex = playerIndex === 0 ? 1 : 0;
  const opponent = game.players[opponentIndex];
  const opponentColumn = opponent.columns[columnIndex] || [];

  let moonCount = opponent.columnMoons?.[columnIndex] || 0;

  for (const card of opponentColumn) {
    moonCount += card.moon ? 1 : 0;
  }

  return moonCount;
}

export function applyLoupEffect(game, playerIndex, columnIndex) {
  const moonCount = countMoonsInOpponentColumn(game, playerIndex, columnIndex);
  const move = moonCount * 2;

  game.players[playerIndex].position += move;

  return {
    moonCount,
    move,
  };
}
