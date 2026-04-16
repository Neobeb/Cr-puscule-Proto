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

const CARD_RULES = [
  { name: "Face cachee", effect: "Une carte de la rangee peut etre jouee face cachee dans n'importe quelle colonne. Elle n'a aucune valeur, compte comme une lune, et avance de 1." },
  { name: "Statue", effect: "Chaque joueur commence avec une Statue 2 avec lune dans sa deuxieme colonne." },
  { name: "Sorciere", effect: "Avance de 3 si votre pion est dans la zone de la colonne jouee." },
  { name: "Vampire", effect: "Copie la valeur de la carte du dessus dans la colonne adverse correspondante." },
  { name: "Squelette", effect: "Avance de 1 puis rejoue s'il est pose sur une lune ou sur une carte lune." },
  { name: "Loup", effect: "Avance de 2 par lune presente dans la colonne adverse correspondante." },
  { name: "Zombie", effect: "Avance selon votre nombre total de zombies. Tous les zombies sont des chefs. A 5 ou plus, gagne une etoile." },
  { name: "Reflet", effect: "Copie la valeur de la carte au meme niveau a gauche ou a droite. Si les deux existent, choisissez." },
  { name: "Banshee", effect: "Defausse une de vos colonnes, puis avance du nombre de lunes dans cette colonne." },
];

const BOARD_RULES = [
  { name: "Case 3", effect: "Refill de la rangee. Si elle est pleine, elle est defaussee puis remplacee." },
  { name: "Case 5", effect: "Vous pouvez retourner la derniere carte visible d'une colonne, chez vous ou chez l'adversaire." },
  { name: "Case 8", effect: "Vous pouvez retourner la derniere carte visible d'une colonne, chez vous ou chez l'adversaire." },
  { name: "Case 10", effect: "Refill de la rangee. Si elle est pleine, elle est defaussee puis remplacee." },
  { name: "Chefs", effect: "Apres une etoile, les deux pions reviennent a 0 puis avancent du nombre de chefs poses de chaque cote." },
];

export default function App() {
  const initialSession = useMemo(getStoredSession, []);
  const [session, setSession] = useState(initialSession);
  const [game, setGame] = useState(null);
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState("online");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState(initialSession.gameId || "");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [hiddenPlacementMode, setHiddenPlacementMode] = useState(false);
  const [animationState, setAnimationState] = useState({
    movedPlayers: [],
    starBurst: false,
    victory: false,
  });
  const [connectionState, setConnectionState] = useState(
    initialSession.gameId && initialSession.playerId ? "connecting" : "idle"
  );
  const eventSourceRef = useRef(null);
  const previousGameRef = useRef(null);

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
        }),
      });

      const nextSession = { gameId: payload.gameId, playerId: payload.playerId };
      setSession(nextSession);
      setGame(payload.game);
      setJoinCode(payload.gameId);
      writeSessionToUrl(nextSession.gameId, nextSession.playerId);
      setInfo(
        createMode === "bot"
          ? "Partie creee contre IA."
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
      return true;
    } catch (apiError) {
      setError(apiError.message);
      return false;
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

  useEffect(() => {
    if (!viewerCanAct || pendingChoice || activePlayerBlocked || !selectedCard) {
      setHiddenPlacementMode(false);
    }
  }, [viewerCanAct, pendingChoice, activePlayerBlocked, selectedCard]);

  useEffect(() => {
    if (!game || !previousGameRef.current) {
      previousGameRef.current = game;
      return;
    }

    const previousGame = previousGameRef.current;
    const movedPlayers = game.players
      .map((player, index) =>
        player.position !== previousGame.players?.[index]?.position ? index : null
      )
      .filter((value) => value !== null);

    const starBurst = game.players.some(
      (player, index) => player.stars > (previousGame.players?.[index]?.stars || 0)
    );
    const victory = Boolean(game.winner && game.winner !== previousGame.winner);

    if (movedPlayers.length || starBurst || victory) {
      setAnimationState({
        movedPlayers,
        starBurst,
        victory,
      });

      const timeout = window.setTimeout(() => {
        setAnimationState({
          movedPlayers: [],
          starBurst: false,
          victory: false,
        });
      }, victory ? 1800 : 900);

      previousGameRef.current = game;
      return () => window.clearTimeout(timeout);
    }

    previousGameRef.current = game;
    return undefined;
  }, [game]);

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
      <style>{`
        @keyframes tokenHop {
          0% { transform: translateY(8px) scale(0.94); opacity: 0.5; }
          55% { transform: translateY(-6px) scale(1.06); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes starBurst {
          0% { transform: scale(0.96); box-shadow: 0 0 0 rgba(245,158,11,0); }
          45% { transform: scale(1.06); box-shadow: 0 0 34px rgba(245,158,11,0.38); }
          100% { transform: scale(1); box-shadow: 0 16px 28px rgba(245,158,11,0.18); }
        }
        @keyframes victoryGlow {
          0% { text-shadow: 0 0 0 rgba(245,158,11,0); transform: scale(1); }
          50% { text-shadow: 0 0 18px rgba(245,158,11,0.7); transform: scale(1.03); }
          100% { text-shadow: 0 0 0 rgba(245,158,11,0); transform: scale(1); }
        }
      `}</style>
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
                    {game.deckCount}
                  </div>
                </div>
                <div style={summaryCardStyle}>
                  <strong>Etat de la partie</strong>
                  <div style={{ marginTop: 8 }}>
                    {game.phase === "lobby" ? (
                      <StatusPill label="Salle en attente" tone="warn" />
                    ) : game.winner ? (
                      <div style={{ animation: animationState.victory ? "victoryGlow 1400ms ease-in-out infinite" : "none" }}>
                        <StatusPill label={`Victoire : ${game.winner}`} tone="good" />
                      </div>
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
                      : pendingChoice.type === "banshee_discard"
                      ? "Banshee : choisissez une colonne a defausser."
                      : `Case ${pendingChoice.sourceCase} : choisissez une carte a retourner, ou passez.`
                    : activePlayerBlocked
                    ? "Aucun coup possible : choisissez une colonne a defausser."
                    : hiddenPlacementMode
                    ? "Pose face cachee selectionnee : choisissez une colonne."
                    : selectedCard
                    ? `Carte selectionnee : ${selectedCardLabel} ${selectedCard.value}. Jouez-la normalement ou face cachee.`
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
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          sendAction({
                            type: "choose_reflet_direction",
                            direction: option.direction,
                          });
                        }}
                        style={choiceButtonStyle}
                      >
                        {option.direction === "left" ? "Gauche" : "Droite"} :{" "}
                        {option.cardLabel} {option.cardValue}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {pendingChoice?.type === "banshee_discard" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    Banshee : defausser une colonne
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {pendingChoice.options.map((option) => (
                      <button
                        key={`${option.targetPlayerIndex}-${option.columnIndex}`}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          sendAction({
                            type: "resolve_banshee_discard",
                            targetPlayerIndex: option.targetPlayerIndex,
                            columnIndex: option.columnIndex,
                          });
                        }}
                        style={choiceButtonStyle}
                      >
                        {option.targetPlayerName} col {option.columnIndex + 1} :{" "}
                        {option.moonCount} lune(s)
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {pendingChoice?.type === "board_flip" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    {pendingChoice.label || `Case ${pendingChoice.sourceCase}`} : retourner une carte
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    {pendingChoice.options.map((option) => (
                      <button
                        key={`${option.targetPlayerIndex}-${option.columnIndex}-${option.rowIndex}`}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          sendAction({
                            type: "resolve_board_flip",
                            targetPlayerIndex: option.targetPlayerIndex,
                            columnIndex: option.columnIndex,
                            rowIndex: option.rowIndex,
                          });
                        }}
                        style={choiceButtonStyle}
                      >
                        {option.targetPlayerName} col {option.columnIndex + 1} rang{" "}
                        {option.rowIndex + 1} : {option.cardLabel} {option.cardValue}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      sendAction({
                        type: "resolve_board_flip",
                        skip: true,
                      });
                    }}
                    style={secondaryChoiceButtonStyle}
                  >
                    Ne rien retourner
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <button
                  onClick={() => setHiddenPlacementMode((current) => !current)}
                  disabled={
                    !viewerCanAct ||
                    activePlayerBlocked ||
                    game.phase !== "playing" ||
                    Boolean(pendingChoice) ||
                    !selectedCard
                  }
                  style={hiddenPlacementMode ? primaryButtonStyle : secondaryButtonStyle}
                >
                  {hiddenPlacementMode ? "Pose face cachee selectionnee" : "Poser la carte selectionnee face cachee"}
                </button>
                {hiddenPlacementMode ? (
                  <button onClick={() => setHiddenPlacementMode(false)} style={smallButtonStyle}>
                    Annuler
                  </button>
                ) : null}
              </div>
              <CommonRow
                row={game.row}
                selectedCardIndex={game.selectedCardIndex}
                onSelectCard={(cardIndex) => {
                  setHiddenPlacementMode(false);
                  sendAction({ type: "select_card", cardIndex });
                }}
                disabled={
                  !viewerCanAct ||
                  activePlayerBlocked ||
                  game.phase !== "playing" ||
                  Boolean(pendingChoice) ||
                  hiddenPlacementMode
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
                animationState={animationState}
                onColumnClick={(columnIndex) =>
                  hiddenPlacementMode
                    ? sendAction({
                        type: "play_selected_face_down",
                        columnIndex,
                      }).then((success) => {
                        if (success) {
                          setHiddenPlacementMode(false);
                        }
                      })
                    : sendAction({
                        type: activePlayerBlocked ? "discard_column" : "play_column",
                        columnIndex,
                      })
                }
              />
            </Panel>

            <Panel title="Journal de partie">
              <GameLog log={game.log} players={game.players} />
            </Panel>

            <Panel title="Rappel des pouvoirs">
              <div style={rulesGridStyle}>
                <div style={rulesCardStyle}>
                  <div style={rulesTitleStyle}>Cartes</div>
                  {CARD_RULES.map((rule) => (
                    <div key={rule.name} style={ruleRowStyle}>
                      <strong>{rule.name}</strong> : {rule.effect}
                    </div>
                  ))}
                </div>

                <div style={rulesCardStyle}>
                  <div style={rulesTitleStyle}>Plateau</div>
                  {BOARD_RULES.map((rule) => (
                    <div key={rule.name} style={ruleRowStyle}>
                      <strong>{rule.name}</strong> : {rule.effect}
                    </div>
                  ))}
                </div>
              </div>
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

const rulesGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 12,
};

const rulesCardStyle = {
  background: "#f8fafc",
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  padding: 14,
};

const rulesTitleStyle = {
  fontWeight: 800,
  marginBottom: 10,
};

const ruleRowStyle = {
  fontSize: 14,
  lineHeight: 1.45,
  marginBottom: 10,
};
