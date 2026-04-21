import { CREATURES } from "../data/creatures";

const CARD_WIDTH = 112;
const CARD_HEIGHT = 172;
const EFFECT_HINTS = {
  sorciere: "zone +3",
  vampire: "copie face",
  squelette: "lune +1",
  loup: "lunes x2",
  zombie: "+1/+2/+4/+6/⭐",
  reflet: "meme niveau",
  banshee: "defausse lune",
  blob: "pose libre",
  momie: "cachee +4",
  statue: "lune fixe",
};
const EFFECT_TEXTS = {
  sorciere: "Avancez de 3 si votre pion est dans cette zone.",
  vampire: "Avancez de la valeur de la carte en face.",
  squelette: "Avancez de 1. Rejouez si pose sur une lune.",
  loup: "Avancez de 2 par lune dans la colonne adverse.",
  zombie: "+1/+2/+4/+6/⭐",
  reflet: "Copiez la valeur a gauche ou a droite au meme niveau.",
  banshee: "Defaussez une de vos colonnes, puis avancez par lune.",
  blob: "Pose libre. +1. Refixe la valeur.",
  momie: "Avancez de 2, ou de 4 sur une carte cachee.",
  statue: "Carte de depart avec une lune.",
};

export default function CardView({
  card,
  isLeftmost = false,
  isSelected = false,
}) {
  const creature = CREATURES[card.type];
  const isFaceUp = card.faceUp !== false;
  const background = isFaceUp
    ? creature?.color || "white"
    : "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)";
  const textColor = isFaceUp ? "#0f172a" : "#f8fafc";
  const displayedValue = isFaceUp ? card.value : "-";
  const effectHint = isFaceUp ? EFFECT_HINTS[card.type] || "" : "cachee +1";
  const effectText = isFaceUp
    ? EFFECT_TEXTS[card.type] || effectHint
    : "Aucune valeur. Compte comme une lune. Avance de 1.";

  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        background,
        border: isSelected ? "3px solid #2563eb" : "1px solid rgba(15,23,42,0.28)",
        borderRadius: 14,
        padding: 10,
        boxSizing: "border-box",
        textAlign: "center",
        position: "relative",
        color: textColor,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        boxShadow: isSelected
          ? "0 0 0 3px rgba(37,99,235,0.15), 0 12px 24px rgba(15,23,42,0.18)"
          : "0 10px 22px rgba(15,23,42,0.12)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          display: "flex",
          gap: 4,
          maxWidth: "calc(100% - 16px)",
          flexWrap: "wrap",
          justifyContent: "flex-start",
        }}
      >
        {isFaceUp ? (
          <span title="Valeur" style={valueBadgeStyle}>
            {card.value}
          </span>
        ) : null}
        {card.moon ? (
          <span title="Lune" style={badgeStyle}>
            🌙
          </span>
        ) : null}
        {isFaceUp && card.chief ? (
          <span title="Chef" style={badgeStyle}>
            👑
          </span>
        ) : null}
      </div>

      <div style={{ minHeight: 16, display: "flex", justifyContent: "flex-end" }}>
        {isLeftmost ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: isFaceUp ? "#475569" : "#cbd5e1",
            }}
          >
            gauche
          </span>
        ) : null}
      </div>

      <div style={{ paddingTop: 10 }}>
        <div style={{ fontSize: 26, lineHeight: 1, marginBottom: 4 }}>
          {isFaceUp ? creature?.icon || "?" : "?"}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            lineHeight: 1.1,
            minHeight: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          {isFaceUp ? creature?.label || card.type : "Carte cachee"}
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 900,
            lineHeight: 1,
            marginBottom: 5,
          }}
        >
          {displayedValue}
        </div>

        <div
          style={{
            minHeight: 44,
            fontSize: 8.5,
            lineHeight: 1.18,
            opacity: isFaceUp ? 0.82 : 0.95,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontWeight: 700,
            width: "100%",
            padding: "4px 6px",
            letterSpacing: 0.1,
            borderRadius: 8,
            background: isFaceUp ? "rgba(255,255,255,0.46)" : "rgba(255,255,255,0.1)",
            boxSizing: "border-box",
          }}
        >
          {effectText}
        </div>
      </div>
    </div>
  );
}

const badgeStyle = {
  fontSize: 12,
  lineHeight: 1,
  background: "rgba(255,255,255,0.88)",
  color: "#0f172a",
  borderRadius: 999,
  padding: "3px 6px",
  boxShadow: "0 2px 4px rgba(15,23,42,0.12)",
};

const valueBadgeStyle = {
  ...badgeStyle,
  minWidth: 18,
  fontWeight: 900,
  background: "rgba(15,23,42,0.9)",
  color: "#f8fafc",
};
