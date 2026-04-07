import { canPlaceCardInColumn, getTopValue } from "../game/rules";
import CardView from "./CardView";

export default function PlayerBoard({
  player,
  playerIndex,
  currentPlayer,
  selectedCard,
  activePlayerBlocked,
  winner,
  onColumnClick,
}) {
  const isActivePlayer = playerIndex === currentPlayer;

  return (
    <div
      style={{
        border: isActivePlayer ? "3px solid blue" : "1px solid #ccc",
        padding: 16,
        minWidth: 320,
        background: isActivePlayer ? "#f7fbff" : "white",
      }}
    >
      <h4 style={{ marginTop: 0 }}>{player.name}</h4>
      <div>Position : {player.position}</div>
      <div>Étoiles : {player.stars}</div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {player.columns.map((column, columnIndex) => {
          const isCurrentPlayersBoard = playerIndex === currentPlayer;
          const isPlayable =
            selectedCard &&
            isCurrentPlayersBoard &&
            canPlaceCardInColumn(selectedCard, column);

          return (
            <div
              key={columnIndex}
              onClick={() => {
                if (!isCurrentPlayersBoard || winner) return;
                onColumnClick(columnIndex);
              }}
              style={{
                border: "2px solid black",
                padding: 10,
                width: 110,
                minHeight: 260,
                cursor:
                  isCurrentPlayersBoard && !winner ? "pointer" : "default",
                backgroundColor: activePlayerBlocked
                  ? isCurrentPlayersBoard
                    ? "#fff4d6"
                    : "white"
                  : !selectedCard || !isCurrentPlayersBoard
                  ? "white"
                  : isPlayable
                  ? "#eefbea"
                  : "#fdeaea",
              }}
            >
              <div
                style={{
                  marginBottom: 10,
                  fontWeight: "bold",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                Col {columnIndex + 1}
              </div>

              <div
                style={{
                  marginBottom: 10,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                Max : {getTopValue(column)}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {column.map((card) => (
                  <CardView key={card.id} card={card} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
