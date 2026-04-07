import { CREATURES } from "../data/creatures";

export default function CardView({
  card,
  isLeftmost = false,
  isSelected = false,
}) {
  const creature = CREATURES[card.type];

  return (
    <div
      style={{
        background: creature?.color || "white",
        border: isSelected ? "3px solid blue" : "1px solid black",
        borderRadius: 8,
        padding: 8,
        minWidth: 96,
        textAlign: "center",
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 4 }}>
        {card.moon ? (
          <span title="Lune" style={badgeStyle}>
            🌙
          </span>
        ) : null}
        {card.chief ? (
          <span title="Chef" style={badgeStyle}>
            👑
          </span>
        ) : null}
      </div>

      <div style={{ fontSize: 28, marginBottom: 6 }}>{creature?.icon || "?"}</div>

      <div style={{ fontSize: 12, fontWeight: "bold" }}>
        {creature?.label || card.type}
      </div>

      <div style={{ fontSize: 24, fontWeight: "bold", marginTop: 4 }}>
        {card.value}
      </div>

      {isLeftmost ? <div style={{ marginTop: 6, fontSize: 11 }}>gauche</div> : null}
    </div>
  );
}

const badgeStyle = {
  fontSize: 13,
  lineHeight: 1,
  background: "rgba(255,255,255,0.85)",
  borderRadius: 999,
  padding: "2px 4px",
};
