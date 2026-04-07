import { useEffect, useMemo, useRef, useState } from "react";
import CommonRow from "./components/CommonRow";
import GameBoard from "./components/GameBoard";
import GameLog from "./components/GameLog";
import { CREATURES } from "./data/creatures";

const API_BASE = process.env.REACT_APP_API_URL || "";

function getStoredSession() {
  const params = new URLSearchParams(window.location.search);

  return {
    gameId: params.get("game") || "",
    playerId: params.get("player") || "",
  };
}

function writeSessionToUrl(gameId, playerId) {
  const nextUrl = new URL(window.location.href);

  if (gameId) nextUrl.searchParams.set("game", gameId);
  else nextUrl.searchParams.delete("game");

  if (playerId) nextUrl.searchParams.set("player", playerId);
  else nextUrl.searchParams.delete("player");

  window.history.replaceState({}, "", nextUrl.toString());
}

function buildInviteLink(gameId) {
  const inviteUrl = new URL(window.location.href);
  inviteUrl.searchParams.set("game", gameId);
  inviteUrl.searchParams.delete("player");
  return inviteUrl.toString();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "La requete a echoue.");
  }

  return payload;
}

function StatusPill({ label, tone = "neutral" }) {
  const colors = {
    neutral: { background: "#e2e8f0", color: "#0f172a" },
    good: { background: "#dcfce7", color: "#166534" },
    warn: { background: "#fef3c7", color: "#92400e" },
    bad: { background: "#fee2e2", color: "#991b1b" },
  };
  const palette = colors[tone] || colors.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background: palette.background,
        color: palette.color,
      }}
    >
      {label}
    </span>
  );
}

function Panel({ title, children }) {
  return (
    <section
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid #cbd5e1",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
      }}
    >
      {title ? <h2 style={{ marginTop: 0, marginBottom: 14 }}>{title}</h2> : null}
      {children}
    </section>
  );
}

export default function App() {
  const initialSession = useMemo(getStoredSession, []);
  const [session, setSession] = useState(initialSession);
  const [game, setGame] = useState(null);
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState("online");
  const [botDifficulty, setBotDifficulty] = useState("0");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState(initialSession.gameId || "");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [connectionState, setConnectionState] = useState(
    initialSession.gameId && initialSession.playerId ? "connecting" : "idle"
  );
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!session.gameId || !session.playerId) {
      setGame(null);
      setConnectionState("idle");
      return undefined;
    }

    let isMounted = true;
    setConnectionState("connecting");

    apiRequest(
      `/api/games/${session.gameId}?playerId=${encodeURIComponent(session.playerId)}`
    )
      .then((payload) => {
        if (!isMounted) return;
        setGame(payload.game);
        setError("");
      })
      .catch((apiError) => {
        if (!isMounted) return;
        setError(apiError.message);
      });

    const eventsUrl = `${API_BASE}/api/games/${session.gameId}/events?playerId=${encodeURIComponent(
      session.playerId
    )}`;
    const eventSource = new EventSource(eventsUrl);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      if (isMounted) setConnectionState("connected");
    });

    eventSource.addEventListener("state", (event) => {
      if (!isMounted) return;
      setGame(JSON.parse(event.data));
      setError("");
      setConnectionState("connected");
    });

    eventSource.addEventListener("error", () => {
      if (isMounted) setConnectionState("disconnected");
    });

    return () => {
      isMounted = false;
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [session.gameId, session.playerId]);

  async function createGame() {
    setBusy(true);
    setError("");
    setInfo("");

    try {
      const payload = await apiRequest("/api/games", {
        method: "POST",
        body: JSON.stringify({
          playerName: createName,
          mode: createMode,
          botDifficulty: Number(botDifficulty),
        }),
      });

      const nextSession = { gameId: payload.gameId, playerId: payload.playerId };
      setSession(nextSession);
      setGame(payload.game);
      setJoinCode(payload.gameId);
      writeSessionToUrl(nextSession.gameId, nextSession.playerId);
      setInfo(
        createMode === "bot"
          ? `Partie creee contre IA niveau ${botDifficulty}.`
          : "Partie creee. Envoyez le lien d'invitation a votre testeur."
      );
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinGame() {
    setBusy(true);
    setError("");
    setInfo("");

    try {
      const code = joinCode.trim().toUpperCase();
      const payload = await apiRequest(`/api/games/${code}/join`, {
        method: "POST",
        body: JSON.stringify({ playerName: joinName }),
      });

      const nextSession = { gameId: payload.gameId, playerId: payload.playerId };
      setSession(nextSession);
      setGame(payload.game);
      writeSessionToUrl(nextSession.gameId, nextSession.playerId);
      setInfo("Connexion reussie. La partie peut commencer.");
    } catch (apiError) {
      setError(apiError.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendAction(action) {
    if (!session.gameId || !session.playerId) return;
    setError("");

    try {
      await apiRequest(`/api/games/${session.gameId}/actions`, {
        method: "POST",
        body: JSON.stringify({ playerId: session.playerId, ...action }),
      });
    } catch (apiError) {
      setError(apiError.message);
    }
  }

  async function copyInviteLink() {
    if (!session.gameId) return;

    const inviteLink = buildInviteLink(session.gameId);

    try {
      await navigator.clipboard.writeText(inviteLink);
      setInfo("Lien d'invitation copie.");
      setError("");
    } catch (_error) {
      setInfo(`Lien d'invitation : ${inviteLink}`);
    }
  }

  function leaveGame() {
    if (eventSourceRef.current) eventSourceRef.current.close();

    setSession({ gameId: "", playerId: "" });
    setGame(null);
    setJoinCode("");
    setError("");
    setInfo("");
    writeSessionToUrl("", "");
  }

  const inviteLink = session.gameId ? buildInviteLink(session.gameId) : "";
  const viewerIndex = game?.viewerPlayerIndex ?? -1;
  const viewer = viewerIndex >= 0 ? game.players[viewerIndex] : null;
  const viewerCanAct = Boolean(game?.viewerCanAct);
  const activePlayerBlocked = Boolean(game?.activePlayerBlocked);
  const pendingChoice = game?.pendingChoice || null;
  const selectedCard =
    game && game.selectedCardIndex !== null ? game.row[game.selectedCardIndex] : null;
  const selectedCardLabel = selectedCard
    ? CREATURES[selectedCard.type]?.label || selectedCard.type
    : "";

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(251,191,36,0.25), transparent 30%), linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #334155 100%)",
        color: "#0f172a",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 20,
            color: "white",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 14, letterSpacing: 2, textTransform: "uppercase" }}>
              Prototype test
            </div>
            <h1 style={{ margin: "8px 0 0", fontSize: 38 }}>Crepuscule en ligne</h1>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {connectionState === "connected" ? (
              <StatusPill label="Temps reel actif" tone="good" />
            ) : null}
            {connectionState === "connecting" ? (
              <StatusPill label="Connexion..." tone="warn" />
            ) : null}
            {connectionState === "disconnected" ? (
              <StatusPill label="Reconnexion..." tone="bad" />
            ) : null}
            {session.gameId ? <StatusPill label={`Code ${session.gameId}`} /> : null}
          </div>
        </header>

        {error ? (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 14,
              background: "#fee2e2",
              color: "#991b1b",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        {info ? (
          <div
            style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 14,
              background: "#dbeafe",
              color: "#1d4ed8",
              fontWeight: 700,
            }}
          >
            {info}
          </div>
        ) : null}

        {!session.gameId ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 18,
            }}
          >
            <Panel title="Creer une partie">
              <p style={{ marginTop: 0 }}>
                L'hote cree la salle puis partage le lien ou le code de partie.
              </p>
              <input
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="Votre nom"
                style={inputStyle}
              />
              <select
                value={createMode}
                onChange={(event) => setCreateMode(event.target.value)}
                style={inputStyle}
              >
                <option value="online">Partie en ligne a 2 joueurs</option>
                <option value="bot">Partie contre IA</option>
              </select>
              {createMode === "bot" ? (
                <select
                  value={botDifficulty}
                  onChange={(event) => setBotDifficulty(event.target.value)}
                  style={inputStyle}
                >
                  <option value="0">IA niveau 0</option>
                  <option value="1">IA niveau 1</option>
                  <option value="2">IA niveau 2</option>
                  <option value="3">IA niveau 3</option>
                </select>
              ) : null}
              <button onClick={createGame} disabled={busy} style={primaryButtonStyle}>
                {createMode === "bot" ? "Creer une partie contre IA" : "Creer la partie"}
              </button>
            </Panel>

            <Panel title="Rejoindre une partie">
              <p style={{ marginTop: 0 }}>
                Utilisez le lien recu ou saisissez le code de partie.
              </p>
              <input
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder="Votre nom"
                style={inputStyle}
              />
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Code de partie"
                style={{ ...inputStyle, textTransform: "uppercase" }}
              />
              <button
                onClick={joinGame}
                disabled={busy || !joinCode.trim()}
                style={secondaryButtonStyle}
              >
                Rejoindre
              </button>
            </Panel>
          </div>
        ) : null}

        {session.gameId && game ? (
          <div style={{ display: "grid", gap: 18 }}>
            <Panel>
              <div style={topBarStyle}>
                <div>
                  <div style={{ fontSize: 14, color: "#475569", marginBottom: 4 }}>
                    Connecte en tant que
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>
                    {viewer ? viewer.name : "Spectateur"}
                  </div>
                  <div style={{ marginTop: 6, color: "#475569" }}>
                    Tour actuel : <strong>{game.currentPlayerName}</strong>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={copyInviteLink} style={smallButtonStyle}>
                    Copier le lien d'invitation
                  </button>
                  <button onClick={() => sendAction({ type: "reset_game" })} style={smallButtonStyle}>
                    Recommencer
                  </button>
                  <button onClick={leaveGame} style={smallButtonStyle}>
                    Quitter
                  </button>
                </div>
              </div>

              <div style={summaryGridStyle}>
                <div style={summaryCardStyle}>
                  <strong>Deck restant</strong>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>
                    {game.deck.length}
                  </div>
                </div>
                <div style={summaryCardStyle}>
                  <strong>Etat de la partie</strong>
                  <div style={{ marginTop: 8 }}>
                    {game.phase === "lobby" ? (
                      <StatusPill label="Salle en attente" tone="warn" />
                    ) : game.winner ? (
                      <StatusPill label={`Victoire : ${game.winner}`} tone="good" />
                    ) : pendingChoice ? (
                      <StatusPill label="Choix en attente" tone="warn" />
                    ) : viewerCanAct ? (
                      <StatusPill label="A vous de jouer" tone="good" />
                    ) : (
                      <StatusPill label="Tour adverse" tone="neutral" />
                    )}
                  </div>
                </div>
                <div style={summaryCardStyle}>
                  <strong>{game.mode === "bot" ? "Mode" : "Invitation"}</strong>
                  <div style={inviteTextStyle}>
                    {game.mode === "bot"
                      ? `Partie contre ${game.players[1]?.name || "IA"}`
                      : inviteLink}
                  </div>
                </div>
              </div>

              {game.phase === "lobby" ? (
                <div style={warningBannerStyle}>
                  En attente du deuxieme joueur. Partagez le lien ou le code{" "}
                  <strong>{session.gameId}</strong>.
                </div>
              ) : null}

              {game.phase === "playing" && !game.winner && viewerCanAct ? (
                <div style={viewerCanActStyle}>
                  {pendingChoice
                    ? pendingChoice.type === "reflet"
                      ? "Choisissez si le Reflet copie la carte de gauche ou de droite."
                      : "Case 5 : choisissez une carte du dessus a defausser, ou passez."
                    : activePlayerBlocked
                    ? "Aucun coup possible : choisissez une colonne a defausser."
                    : selectedCard
                    ? `Carte selectionnee : ${selectedCardLabel} ${selectedCard.value}. Choisissez une colonne.`
                    : "Selectionnez une carte dans la rangee commune."}
                </div>
              ) : null}

              {pendingChoice?.type === "reflet" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    Reflet : choisissez un cote
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {pendingChoice.options.map((option) => (
                      <button
                        key={option.direction}
                        onClick={() =>
                          sendAction({
                            type: "choose_reflet_direction",
                            direction: option.direction,
                          })
                        }
                        style={choiceButtonStyle}
                      >
                        {option.direction === "left" ? "Gauche" : "Droite"} :{" "}
                        {option.cardLabel} {option.cardValue}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {pendingChoice?.type === "board_discard" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    Case 5 : defausser une carte du dessus
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {pendingChoice.options.map((option) => (
                      <button
                        key={`${option.targetPlayerIndex}-${option.columnIndex}`}
                        onClick={() =>
                          sendAction({
                            type: "resolve_board_discard",
                            targetPlayerIndex: option.targetPlayerIndex,
                            columnIndex: option.columnIndex,
                          })
                        }
                        style={choiceButtonStyle}
                      >
                        {option.targetPlayerName} col {option.columnIndex + 1} :{" "}
                        {option.cardLabel} {option.cardValue}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() =>
                      sendAction({
                        type: "resolve_board_discard",
                        skip: true,
                      })
                    }
                    style={secondaryChoiceButtonStyle}
                  >
                    Ne rien defausser
                  </button>
                </div>
              ) : null}

              {game.phase === "playing" && !game.winner && !viewerCanAct ? (
                <div style={waitingBannerStyle}>
                  {game.players[game.currentPlayer]?.isBot
                    ? `${game.currentPlayerName} reflechit...`
                    : `Attendez l'action de ${game.currentPlayerName}.`}
                </div>
              ) : null}
            </Panel>

            <Panel title="Rangee commune">
              <CommonRow
                row={game.row}
                selectedCardIndex={game.selectedCardIndex}
                onSelectCard={(cardIndex) => sendAction({ type: "select_card", cardIndex })}
                disabled={
                  !viewerCanAct ||
                  activePlayerBlocked ||
                  game.phase !== "playing" ||
                  Boolean(pendingChoice)
                }
              />
            </Panel>

            <Panel title="Plateau">
              <GameBoard
                players={game.players}
                currentPlayer={game.currentPlayer}
                activePlayerBlocked={activePlayerBlocked}
                winner={game.winner}
                canInteract={viewerCanAct && game.phase === "playing" && !pendingChoice}
                onColumnClick={(columnIndex) =>
                  sendAction({
                    type: activePlayerBlocked ? "discard_column" : "play_column",
                    columnIndex,
                  })
                }
              />
            </Panel>

            <Panel title="Journal de partie">
              <GameLog log={game.log} />
            </Panel>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #94a3b8",
  marginBottom: 12,
  boxSizing: "border-box",
};

const primaryButtonStyle = {
  width: "100%",
  padding: 14,
  borderRadius: 12,
  border: "none",
  background: "#f59e0b",
  color: "#111827",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "#38bdf8",
  color: "#082f49",
};

const smallButtonStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "white",
  cursor: "pointer",
};

const topBarStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  alignItems: "center",
};

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const summaryCardStyle = {
  padding: 14,
  borderRadius: 14,
  background: "#f8fafc",
  border: "1px solid #cbd5e1",
};

const inviteTextStyle = {
  marginTop: 8,
  fontSize: 13,
  lineHeight: 1.4,
  color: "#475569",
  wordBreak: "break-all",
};

const warningBannerStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "#fff7ed",
  color: "#9a3412",
  fontWeight: 700,
};

const viewerCanActStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "#ecfccb",
  color: "#3f6212",
  fontWeight: 700,
};

const waitingBannerStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 700,
};

const choicePanelStyle = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  background: "#fff7ed",
  color: "#9a3412",
  border: "1px solid #fdba74",
};

const choiceButtonStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #fdba74",
  background: "white",
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryChoiceButtonStyle = {
  ...choiceButtonStyle,
  border: "1px solid #cbd5e1",
};
