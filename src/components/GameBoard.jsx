import CardView from "./CardView";
import Stars from "./Stars";

function renderColumn(player, columnIndex) {
  const column = player.columns[columnIndex];
  const moonCount =
    (player.columnMoons?.[columnIndex] || 0) +
    column.reduce((total, card) => total + (card.moon ? 1 : 0), 0);

  return (
    <div
      style={{
        width: 180,
        minHeight: 170,
        border: "2px solid black",
        background: "white",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "center",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: "bold", textAlign: "center" }}>
        <div>Col {columnIndex + 1}</div>
        <div style={{ minHeight: 22, fontSize: 18 }}>
          {moonCount > 0 ? "🌙".repeat(moonCount) : ""}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {column.map((card) => (
          <CardView key={card.id} card={card} />
        ))}
      </div>
    </div>
  );
}

function getZoneIndexFromPosition(position) {
  if (position < 0) return 0;
  if (position <= 2) return 0;
  if (position <= 5) return 1;
  if (position <= 8) return 2;
  if (position <= 11) return 3;
  return 3;
}

function Zone({
  start,
  end,
  player1Position,
  player2Position,
  label,
  effectText,
}) {
  const player1ZoneIndex = getZoneIndexFromPosition(player1Position);
  const player2ZoneIndex = getZoneIndexFromPosition(player2Position);
  const zoneIndex = Math.floor(start / 3);

  const p1HandHere = player1ZoneIndex === zoneIndex;
  const p2HandHere = player2ZoneIndex === zoneIndex;

  return (
    <div
      style={{
        width: 180,
        minHeight: 120,
        border: "3px solid black",
        background: "#f8fafc",
        padding: 8,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: 12, textAlign: "center" }}>
        <div>
          Cases {start}-{end}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 4,
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        {Array.from({ length: 3 }, (_, index) => {
          const value = start + index;
          const p1Here = player1Position === value;
          const p2Here = player2Position === value;

          return (
            <div
              key={value}
              style={{
                border: "1px solid black",
                minHeight: 52,
                background: "white",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 4,
              }}
            >
              <div style={{ fontSize: 11 }}>{value}</div>
              <div style={{ fontSize: 11 }}>
                {p1Here ? <div>✋ J1</div> : null}
                {p2Here ? <div>✋ J2</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 11, textAlign: "center", color: "#444" }}>
        <div>{label}</div>
        <div>{effectText}</div>
        <div style={{ marginTop: 4 }}>
          {p1HandHere ? "Zone de J1" : ""}
          {p1HandHere && p2HandHere ? " / " : ""}
          {p2HandHere ? "Zone de J2" : ""}
        </div>
      </div>
    </div>
  );
}

function StarZone({ player1Position, player2Position }) {
  const p1Here = player1Position === 12;
  const p2Here = player2Position === 12;

  return (
    <div
      style={{
        width: 90,
        minHeight: 120,
        border: "3px solid #ca8a04",
        background: "#fef3c7",
        padding: 8,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: 12 }}>Case 12</div>
      <div style={{ fontSize: 28 }}>⭐</div>
      <div style={{ fontSize: 11 }}>Etoile</div>
      <div style={{ fontSize: 11 }}>
        {p1Here ? <div>✋ J1</div> : null}
        {p2Here ? <div>✋ J2</div> : null}
      </div>
    </div>
  );
}

export default function GameBoard({
  players,
  currentPlayer,
  winner,
  activePlayerBlocked,
  canInteract,
  onColumnClick,
}) {
  const zones = [
    { start: 0, end: 2, label: "Zone 1", effectText: "Effet a definir" },
    { start: 3, end: 5, label: "Zone 2", effectText: "Effet a definir" },
    { start: 6, end: 8, label: "Zone 3", effectText: "Effet a definir" },
    { start: 9, end: 11, label: "Zone 4", effectText: "Effet a definir" },
  ];

  return (
    <div style={{ marginTop: 6, overflowX: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          minWidth: 890,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 180px)",
            gap: 8,
            alignItems: "start",
          }}
        >
          {players[0].columns.map((_, columnIndex) => (
            <div
              key={`p1-head-${columnIndex}`}
              style={{ textAlign: "center", marginBottom: 4 }}
            >
              {columnIndex === 0 ? (
                <>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: 16,
                      color: currentPlayer === 0 ? "blue" : "black",
                    }}
                  >
                    {players[0].name}
                  </div>
                  <Stars count={players[0].stars} />
                </>
              ) : (
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: 14,
                    color: currentPlayer === 0 ? "blue" : "black",
                  }}
                >
                  J1
                </div>
              )}
            </div>
          ))}

          {players[0].columns.map((_, columnIndex) => (
            <div
              key={`p1-col-${columnIndex}`}
              onClick={() => {
                if (!winner && currentPlayer === 0 && canInteract) {
                  onColumnClick(columnIndex);
                }
              }}
              style={{
                cursor: !winner && currentPlayer === 0 && canInteract ? "pointer" : "default",
              }}
            >
              {renderColumn(players[0], columnIndex)}
            </div>
          ))}

          {zones.map((zone) => (
            <Zone
              key={`zone-${zone.start}`}
              start={zone.start}
              end={zone.end}
              label={zone.label}
              effectText={zone.effectText}
              player1Position={players[0].position}
              player2Position={players[1].position}
            />
          ))}

          {players[1].columns.map((_, columnIndex) => (
            <div
              key={`p2-col-${columnIndex}`}
              onClick={() => {
                if (!winner && currentPlayer === 1 && canInteract) {
                  onColumnClick(columnIndex);
                }
              }}
              style={{
                cursor: !winner && currentPlayer === 1 && canInteract ? "pointer" : "default",
              }}
            >
              {renderColumn(players[1], columnIndex)}
            </div>
          ))}

          {players[1].columns.map((_, columnIndex) => (
            <div
              key={`p2-foot-${columnIndex}`}
              style={{ textAlign: "center", marginTop: 4 }}
            >
              {columnIndex === 0 ? (
                <>
                  <Stars count={players[1].stars} />
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: 16,
                      color: currentPlayer === 1 ? "blue" : "black",
                    }}
                  >
                    {players[1].name}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontWeight: "bold",
                    fontSize: 14,
                    color: currentPlayer === 1 ? "blue" : "black",
                  }}
                >
                  J2
                </div>
              )}
            </div>
          ))}
        </div>

        <div>
          <StarZone
            player1Position={players[0].position}
            player2Position={players[1].position}
          />
        </div>
      </div>

      {activePlayerBlocked && !winner ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "2px solid #d97706",
            background: "#fff7ed",
            fontWeight: "bold",
          }}
        >
          Aucun coup possible : choisissez une de vos colonnes a defausser.
        </div>
      ) : null}
    </div>
  );
}
