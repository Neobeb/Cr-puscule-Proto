export default function GameLog({ log }) {
  return (
    <div
      style={{
        border: "1px solid #ccc",
        padding: 10,
        maxWidth: 900,
        maxHeight: 240,
        overflowY: "auto",
        background: "#fafafa",
      }}
    >
      {log.map((entry, index) => (
        <div key={index} style={{ marginBottom: 6 }}>
          {entry}
        </div>
      ))}
    </div>
  );
}
