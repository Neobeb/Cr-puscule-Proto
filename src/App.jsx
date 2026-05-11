import { useEffect, useMemo, useRef, useState } from "react";
import CommonRow from "./components/CommonRow";
import GameBoard from "./components/GameBoard";
import GameLog from "./components/GameLog";
import { CREATURES } from "./data/creatures";

const API_BASE = process.env.REACT_APP_API_URL || "";
const STANDARD_VALUES = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
const PREMIUM_VALUES = [3, 3, 3, 3, 3, 4, 4, 4, 4, 4];

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
  { name: "Depart", effect: "Le joueur 2 commence avec 1 case d'avance, seulement au debut de la partie." },
  { name: "Sorciere", effect: "Avance de 1, ou de 3 si votre pion est dans la zone de la colonne jouee. Ignore les stops." },
  { name: "Vampire", effect: "Copie la valeur de la carte du dessus dans la colonne adverse correspondante." },
  { name: "Squelette", effect: "Avance de 1 puis rejoue s'il est pose sur une lune ou sur une carte lune." },
  { name: "Loup", effect: "Avance de 2 par lune presente dans la colonne adverse correspondante." },
  { name: "Zombie", effect: "Avance selon votre nombre total de zombies. Tous les zombies sont des chefs. +1/+2/+4/+6/⭐" },
  { name: "Reflet", effect: "Copie la valeur de la carte au meme niveau a gauche ou a droite. Si les deux existent, choisissez." },
  { name: "Banshee", effect: "Toutes les Banshee ont une lune. Avance de 1 par carte retournee de votre cote." },
  { name: "Blob", effect: "Avance de 2 puis vous pouvez retourner une carte visible, chez vous ou chez l'adversaire." },
  { name: "Diable", effect: "Defaussez une colonne au choix chez vous." },
  { name: "Momie", effect: "Avance de 1, ou de 4 si elle est jouee sur une carte face cachee." },
  { name: "Idole", effect: "Avance de 1 par chef visible de votre cote." },
];

const BOARD_RULES_BY_TYPE = {
  blank: [
    { name: "Plateau vierge", effect: "Aucun pouvoir sur les cases." },
  ],
  base: [
    { name: "Case 5", effect: "Refill : comble les emplacements vides de la rangee." },
    { name: "Case 8", effect: "Stop : si un deplacement atteint ou depasse cette case, le pion s'y arrete. La Sorciere l'ignore." },
    { name: "Case 10", effect: "Remove : vous pouvez defausser une de vos colonnes, ou passer." },
  ],
  test: [
    { name: "Case 5", effect: "Sabotage : l'adversaire peut detruire une carte visible du dessus chez le joueur arrive sur la case, ou passer." },
    { name: "Case 8", effect: "Stop : si un deplacement atteint ou depasse cette case, le pion s'y arrete. La Sorciere l'ignore." },
    { name: "Case 10", effect: "Remove : vous pouvez defausser une de vos colonnes, ou passer." },
  ],
};

const SHARED_BOARD_RULES = [
  { name: "Chefs", effect: "Apres une etoile, les deux pions reviennent a 0 puis avancent du nombre de chefs poses de chaque cote." },
  { name: "Etoile", effect: "La case etoile est en 16. Quand une etoile est gagnee, la rangee commune est automatiquement refaite." },
];

const BASE_FAMILY_OPTIONS = [
  {
    type: "sorciere",
    label: "Sorciere",
    effect: "Avance de 1, ou de 3 si votre pion est dans la zone de la colonne jouee. Ignore les stops.",
  },
  {
    type: "vampire",
    label: "Vampire",
    effect: "Copie la valeur de la carte du dessus dans la colonne adverse.",
  },
  {
    type: "squelette",
    label: "Squelette",
    effect: "Avance de 1 puis rejoue s'il est pose sur une lune.",
  },
  {
    type: "loup",
    label: "Loup",
    effect: "Avance de 2 par lune dans la colonne adverse.",
  },
  {
    type: "zombie",
    label: "Zombie",
    effect: "Avance selon vos zombies. Tous les zombies sont chefs. +1/+2/+4/+6/etoile.",
  },
  {
    type: "reflet",
    label: "Reflet",
    effect: "Copie la valeur au meme niveau a gauche ou a droite.",
  },
  {
    type: "momie",
    label: "Momie",
    effect: "Avance de 1, ou de 4 si elle est jouee sur une carte face cachee.",
  },
];

const OPTIONAL_FAMILY_OPTIONS = [
  {
    type: "banshee",
    label: "Banshee",
    effect: "Avance de 1 par carte retournee de votre cote.",
  },
  {
    type: "idole",
    label: "Idole",
    effect: "Avance de 1 par chef visible de votre cote.",
  },
  {
    type: "blob",
    label: "Blob",
    effect: "Avance de 2 puis peut retourner une carte visible chez vous ou chez l'adversaire.",
  },
  {
    type: "diable",
    label: "Diable",
    effect: "Defausse une colonne au choix chez vous.",
  },
];

const ALL_FAMILY_OPTIONS = [...BASE_FAMILY_OPTIONS, ...OPTIONAL_FAMILY_OPTIONS];
const DEFAULT_FAMILY_TYPES = BASE_FAMILY_OPTIONS.map((family) => family.type);
const ALL_FAMILY_TYPES = ALL_FAMILY_OPTIONS.map((family) => family.type);

const BOARD_OPTIONS = [
  {
    type: "blank",
    label: "Plateau vierge",
    effect: "Aucun pouvoir sur les cases.",
  },
  {
    type: "base",
    label: "Plateau base",
    effect: "Case 5 Refill, case 8 Stop, case 10 Remove.",
  },
  {
    type: "test",
    label: "Plateau test",
    effect: "Case 5 Sabotage adverse, case 8 Stop, case 10 Remove.",
  },
];

function createFamilyCardConfig(values, moonIndexes = [], chiefIndexes = []) {
  const moonSet = new Set(moonIndexes);
  const chiefSet = new Set(chiefIndexes);

  return {
    values: [...values],
    moons: values.map((_, index) => moonSet.has(index)),
    chiefs: values.map((_, index) => chiefSet.has(index)),
  };
}

const DEFAULT_FAMILY_CARD_CONFIGS = {
  sorciere: createFamilyCardConfig(STANDARD_VALUES, [2], [9]),
  vampire: createFamilyCardConfig(PREMIUM_VALUES, [5], []),
  squelette: createFamilyCardConfig(STANDARD_VALUES, [9], [0]),
  loup: createFamilyCardConfig(STANDARD_VALUES, [8], [2]),
  zombie: createFamilyCardConfig(STANDARD_VALUES, [], [0, 2, 4, 6, 8]),
  reflet: createFamilyCardConfig(PREMIUM_VALUES, [5], [7]),
  banshee: createFamilyCardConfig(STANDARD_VALUES, [], [6]),
  blob: createFamilyCardConfig(STANDARD_VALUES, [6], [9]),
  diable: createFamilyCardConfig(PREMIUM_VALUES, [], []),
  momie: createFamilyCardConfig(STANDARD_VALUES, [7], [9]),
  idole: createFamilyCardConfig(PREMIUM_VALUES, [], [1, 3, 5, 7, 9]),
};

function cloneFamilyCardConfigs() {
  return JSON.parse(JSON.stringify(DEFAULT_FAMILY_CARD_CONFIGS));
}

function getEnabledIndexes(flags) {
  return flags
    .map((enabled, index) => (enabled ? index : null))
    .filter((index) => index !== null);
}

function buildFamilyConfigsPayload(familyCardConfigs) {
  return Object.fromEntries(
    Object.entries(familyCardConfigs).map(([type, config]) => [
      type,
      {
        values: config.values.map((value) => Number(value) || 0),
        moonIndexes: getEnabledIndexes(config.moons),
        chiefIndexes: getEnabledIndexes(config.chiefs),
      },
    ])
  );
}

function FamilyCardConfigEditor({
  family,
  config,
  onValueChange,
  onToggleFlag,
  onReset,
  onApplyPreset,
}) {
  const creature = CREATURES[family.type];

  return (
    <div style={cardTuningPanelStyle}>
      <div style={cardTuningHeaderStyle}>
        <div>
          <div style={{ fontWeight: 900 }}>
            <span style={{ marginRight: 6 }}>{creature?.icon}</span>
            {family.label}
          </div>
          <div style={familyEffectStyle}>{family.effect}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onApplyPreset(family.type, STANDARD_VALUES)}
            style={miniButtonStyle}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => onApplyPreset(family.type, PREMIUM_VALUES)}
            style={miniButtonStyle}
          >
            Premium
          </button>
          <button
            type="button"
            onClick={() => onReset(family.type)}
            style={miniButtonStyle}
          >
            Reset
          </button>
        </div>
      </div>
      <div style={cardTuningGridStyle}>
        {config.values.map((value, index) => (
          <div key={`${family.type}-${index}`} style={cardTuningCellStyle}>
            <div style={cardNumberStyle}>Carte {index + 1}</div>
            <input
              type="number"
              min="0"
              max="9"
              value={value}
              onChange={(event) =>
                onValueChange(family.type, index, event.target.value)
              }
              style={cardValueInputStyle}
            />
            <button
              type="button"
              onClick={() => onToggleFlag(family.type, index, "moons")}
              style={config.moons[index] ? activeMoonButtonStyle : cardFlagButtonStyle}
            >
              Lune
            </button>
            <button
              type="button"
              onClick={() => onToggleFlag(family.type, index, "chiefs")}
              style={config.chiefs[index] ? activeChiefButtonStyle : cardFlagButtonStyle}
            >
              Chef
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const initialSession = useMemo(getStoredSession, []);
  const [session, setSession] = useState(initialSession);
  const [game, setGame] = useState(null);
  const [createName, setCreateName] = useState("");
  const [createMode, setCreateMode] = useState("online");
  const [selectedFamilyTypes, setSelectedFamilyTypes] = useState(DEFAULT_FAMILY_TYPES);
  const [selectedBoardType, setSelectedBoardType] = useState("base");
  const [advancedCardsOpen, setAdvancedCardsOpen] = useState(false);
  const [familyCardConfigs, setFamilyCardConfigs] = useState(
    cloneFamilyCardConfigs
  );
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
  const activeFamilyTypes = useMemo(
    () => ALL_FAMILY_TYPES.filter((type) => selectedFamilyTypes.includes(type)),
    [selectedFamilyTypes]
  );

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
          familyTypes: selectedFamilyTypes,
          familyConfigs: buildFamilyConfigsPayload(familyCardConfigs),
          boardType: selectedBoardType,
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

  function toggleFamilyType(familyType) {
    setSelectedFamilyTypes((current) =>
      current.includes(familyType)
        ? current.filter((entry) => entry !== familyType)
        : [...current, familyType]
    );
  }

  function updateFamilyCardValue(familyType, cardIndex, rawValue) {
    const numericValue = Number(rawValue);
    const nextValue = Number.isFinite(numericValue)
      ? Math.max(0, Math.min(9, Math.trunc(numericValue)))
      : 0;

    setFamilyCardConfigs((current) => ({
      ...current,
      [familyType]: {
        ...current[familyType],
        values: current[familyType].values.map((value, index) =>
          index === cardIndex ? nextValue : value
        ),
      },
    }));
  }

  function toggleFamilyCardFlag(familyType, cardIndex, flagName) {
    setFamilyCardConfigs((current) => ({
      ...current,
      [familyType]: {
        ...current[familyType],
        [flagName]: current[familyType][flagName].map((enabled, index) =>
          index === cardIndex ? !enabled : enabled
        ),
      },
    }));
  }

  function resetFamilyCardConfig(familyType) {
    setFamilyCardConfigs((current) => ({
      ...current,
      [familyType]: cloneFamilyCardConfigs()[familyType],
    }));
  }

  function resetAllFamilyCardConfigs() {
    setFamilyCardConfigs(cloneFamilyCardConfigs());
  }

  function applyFamilyValuePreset(familyType, values) {
    setFamilyCardConfigs((current) => ({
      ...current,
      [familyType]: {
        ...current[familyType],
        values: [...values],
      },
    }));
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
  const hasPendingChoice = Boolean(game?.hasPendingChoice);
  const isRemoveDiscardChoice =
    pendingChoice?.type === "banshee_discard" &&
    (pendingChoice?.label === "Remove" || pendingChoice?.boardOnly);
  const isOptionalBansheeChoice =
    pendingChoice?.type === "banshee_discard" &&
    (pendingChoice?.optional || isRemoveDiscardChoice);
  const selectedCard =
    game && game.selectedCardIndex !== null ? game.row[game.selectedCardIndex] : null;
  const selectedCardLabel = selectedCard
    ? CREATURES[selectedCard.type]?.label || selectedCard.type
    : "";
  const boardRules = [
    ...(BOARD_RULES_BY_TYPE[game?.boardType || "base"] || BOARD_RULES_BY_TYPE.base),
    ...SHARED_BOARD_RULES,
  ];

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
              <div style={familySelectorStyle}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Familles de la partie
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedFamilyTypes(DEFAULT_FAMILY_TYPES)}
                    style={secondaryChoiceButtonStyle}
                  >
                    Jeu de base
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFamilyTypes(ALL_FAMILY_TYPES)}
                    style={secondaryChoiceButtonStyle}
                  >
                    Toutes les familles
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFamilyTypes([])}
                    style={secondaryChoiceButtonStyle}
                  >
                    Vider
                  </button>
                </div>
                <div style={familyGridStyle}>
                  {ALL_FAMILY_OPTIONS.map((family) => (
                    <label key={family.type} style={familyOptionStyle}>
                      <input
                        type="checkbox"
                        checked={selectedFamilyTypes.includes(family.type)}
                        onChange={() => toggleFamilyType(family.type)}
                      />
                      <span>
                        <span style={familyLabelStyle}>{family.label}</span>
                        <span style={familyEffectStyle}>{family.effect}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {!selectedFamilyTypes.length ? (
                  <div style={{ marginTop: 8, color: "#991b1b", fontWeight: 700 }}>
                    Selectionnez au moins une famille pour creer la partie.
                  </div>
                ) : null}
              </div>

              <div style={familySelectorStyle}>
                <div style={advancedHeaderStyle}>
                  <div>
                    <div style={{ fontWeight: 800 }}>
                      Reglages avances des cartes
                    </div>
                    <div style={{ color: "#475569", fontSize: 13, marginTop: 3 }}>
                      Modifiez les valeurs, les lunes et les chefs avant de creer la partie.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAdvancedCardsOpen((open) => !open)}
                    style={secondaryChoiceButtonStyle}
                  >
                    {advancedCardsOpen ? "Masquer" : "Modifier"}
                  </button>
                </div>
                {advancedCardsOpen ? (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                      <button
                        type="button"
                        onClick={resetAllFamilyCardConfigs}
                        style={secondaryChoiceButtonStyle}
                      >
                        Reset toutes les cartes
                      </button>
                    </div>
                    {activeFamilyTypes.length ? (
                      <div style={cardTuningListStyle}>
                        {activeFamilyTypes.map((familyType) => {
                          const family = ALL_FAMILY_OPTIONS.find(
                            (entry) => entry.type === familyType
                          );

                          return (
                            <FamilyCardConfigEditor
                              key={familyType}
                              family={family}
                              config={familyCardConfigs[familyType]}
                              onValueChange={updateFamilyCardValue}
                              onToggleFlag={toggleFamilyCardFlag}
                              onReset={resetFamilyCardConfig}
                              onApplyPreset={applyFamilyValuePreset}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ color: "#92400e", fontWeight: 700 }}>
                        Selectionnez au moins une famille pour afficher ses cartes.
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              <div style={familySelectorStyle}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  Plateau
                </div>
                <div style={familyGridStyle}>
                  {BOARD_OPTIONS.map((board) => (
                    <label key={board.type} style={familyOptionStyle}>
                      <input
                        type="radio"
                        name="boardType"
                        checked={selectedBoardType === board.type}
                        onChange={() => setSelectedBoardType(board.type)}
                      />
                      <span>
                        <span style={familyLabelStyle}>{board.label}</span>
                        <span style={familyEffectStyle}>{board.effect}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <button
                onClick={createGame}
                disabled={busy || !selectedFamilyTypes.length}
                style={primaryButtonStyle}
              >
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
                    ) : hasPendingChoice ? (
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
                      ? isRemoveDiscardChoice
                        ? `Case ${pendingChoice.sourceCase} : choisissez une colonne a defausser, ou passez.`
                        : "Banshee : carte lune, avancez de 1 par carte retournee de votre cote."
                      : pendingChoice.type === "board_destroy"
                      ? `${pendingChoice.label || "Sabotage"} : choisissez une carte visible a detruire, ou passez.`
                      : pendingChoice.type === "diable_discard"
                      ? "Diable : choisissez une de vos colonnes a defausser."
                      : pendingChoice.type === "faucheur_discard"
                      ? "Faucheur : choisissez une carte visible du dessus a defausser."
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
                    {(isRemoveDiscardChoice ? "Remove" : pendingChoice.label) || "Banshee"} : defausser une colonne
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: isOptionalBansheeChoice ? 10 : 0 }}>
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
                  {isOptionalBansheeChoice ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        sendAction({
                          type: "resolve_banshee_discard",
                          skip: true,
                        });
                      }}
                      style={secondaryChoiceButtonStyle}
                    >
                      Ne rien defausser
                    </button>
                  ) : null}
                </div>
              ) : null}

              {pendingChoice?.type === "diable_discard" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    Diable : defausser une de vos colonnes
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
                            type: "resolve_diable_discard",
                            targetPlayerIndex: option.targetPlayerIndex,
                            columnIndex: option.columnIndex,
                          });
                        }}
                        style={choiceButtonStyle}
                      >
                        {option.targetPlayerName} col {option.columnIndex + 1} :{" "}
                        {option.columnSize} carte(s), {option.moonCount} lune(s)
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {pendingChoice?.type === "faucheur_discard" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    Faucheur : defausser une carte visible
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {pendingChoice.options.map((option) => (
                      <button
                        key={`${option.targetPlayerIndex}-${option.columnIndex}-${option.rowIndex}`}
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          sendAction({
                            type: "resolve_faucheur_discard",
                            targetPlayerIndex: option.targetPlayerIndex,
                            columnIndex: option.columnIndex,
                            rowIndex: option.rowIndex,
                          });
                        }}
                        style={choiceButtonStyle}
                      >
                        {option.targetPlayerName} col {option.columnIndex + 1} :{" "}
                        {option.cardLabel} {option.cardValue}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {pendingChoice?.type === "board_destroy" ? (
                <div style={choicePanelStyle}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>
                    {pendingChoice.label || "Sabotage"} : detruire une carte visible
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
                            type: "resolve_board_destroy",
                            targetPlayerIndex: option.targetPlayerIndex,
                            columnIndex: option.columnIndex,
                            rowIndex: option.rowIndex,
                          });
                        }}
                        style={choiceButtonStyle}
                      >
                        {option.targetPlayerName} col {option.columnIndex + 1} :{" "}
                        {option.cardLabel} {option.cardValue}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      sendAction({
                        type: "resolve_board_destroy",
                        skip: true,
                      });
                    }}
                    style={secondaryChoiceButtonStyle}
                  >
                    Ne rien detruire
                  </button>
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
                  {hasPendingChoice
                    ? `Choix en attente : ${game.pendingChoicePlayerName || "un joueur"} doit agir.`
                    : game.players[game.currentPlayer]?.isBot
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
                boardType={game.boardType}
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
                  {boardRules.map((rule) => (
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

const familySelectorStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  background: "#f8fafc",
  padding: 12,
  marginBottom: 12,
};

const familyGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 8,
};

const familyOptionStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 10,
  background: "white",
  border: "1px solid #e2e8f0",
  cursor: "pointer",
};

const fixedFamilyOptionStyle = {
  ...familyOptionStyle,
  cursor: "default",
  background: "#eef2ff",
};

const familyLabelStyle = {
  display: "block",
  fontWeight: 800,
};

const familyEffectStyle = {
  display: "block",
  marginTop: 3,
  color: "#475569",
  fontSize: 12,
  lineHeight: 1.25,
};

const advancedHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const cardTuningListStyle = {
  display: "grid",
  gap: 12,
};

const cardTuningPanelStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  background: "white",
  padding: 12,
};

const cardTuningHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 10,
};

const cardTuningGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(92px, 1fr))",
  gap: 8,
};

const cardTuningCellStyle = {
  padding: 8,
  borderRadius: 12,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const cardNumberStyle = {
  fontSize: 11,
  fontWeight: 800,
  color: "#475569",
  marginBottom: 6,
};

const cardValueInputStyle = {
  width: "100%",
  padding: "7px 8px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  boxSizing: "border-box",
  fontWeight: 900,
  marginBottom: 6,
};

const miniButtonStyle = {
  padding: "7px 9px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 12,
};

const cardFlagButtonStyle = {
  ...miniButtonStyle,
  width: "100%",
  marginTop: 4,
  background: "white",
  color: "#475569",
};

const activeMoonButtonStyle = {
  ...cardFlagButtonStyle,
  background: "#fef3c7",
  border: "1px solid #f59e0b",
  color: "#92400e",
};

const activeChiefButtonStyle = {
  ...cardFlagButtonStyle,
  background: "#ede9fe",
  border: "1px solid #8b5cf6",
  color: "#5b21b6",
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
