export default function Stars({ count, max = 3 }) {
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{
            fontSize: 20,
            opacity: i < count ? 1 : 0.3,
          }}
        >
          ⭐
        </span>
      ))}
    </div>
  );
}
