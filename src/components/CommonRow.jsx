import CardView from "./CardView";

export default function CommonRow({
  row,
  selectedCardIndex,
  onSelectCard,
  disabled,
}) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
      {row.map((card, index) => {
        const isSelected = selectedCardIndex === index;

        return (
          <button
            key={card.id}
            onClick={() => onSelectCard(index)}
            disabled={disabled}
            style={{
              padding: 0,
              background: "transparent",
              border: "none",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <CardView card={card} isSelected={isSelected} isLeftmost={index === 0} />
          </button>
        );
      })}
    </div>
  );
}
