export default function TrackBoard({ players }) {
  return (
    <>
      <h3>Piste commune des mains</h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(13, 50px)",
          gap: 4,
          marginBottom: 30,
        }}
      >
        {Array.from({ length: 13 }, (_, i) => {
          const p1Here = players[0].position === i;
          const p2Here = players[1].position === i;

          return (
            <div
              key={i}
              style={{
                border: "1px solid black",
                minHeight: 70,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 4,
                backgroundColor: i === 12 ? "#ffe7a3" : "white",
              }}
            >
              <div style={{ fontSize: 12 }}>Case {i}</div>
              <div style={{ fontSize: 12 }}>
                {p1Here && <div>✋ J1</div>}
                {p2Here && <div>✋ J2</div>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
