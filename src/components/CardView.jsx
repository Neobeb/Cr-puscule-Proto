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
        minWidth: 90,
        textAlign: "center",
      }}
    >
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
