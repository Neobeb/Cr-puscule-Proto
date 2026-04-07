import { cards } from "../data/cards";
import { drawCards } from "./rules";

export function createDeck() {
  const deck = [...cards];

  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

export function getInitialGame() {
  const deck = createDeck();
  const { drawn, remaining } = drawCards(deck, 4);

  return {
    currentPlayer: 0,
    winner: null,
    players: [
      {
        name: "Joueur 1",
        position: 0,
        stars: 0,
        columns: [[], [], [], []],
        columnMoons: [1, 0, 0, 0],
      },
      {
        name: "Joueur 2",
        position: 0,
        stars: 0,
        columns: [[], [], [], []],
        columnMoons: [0, 1, 0, 0],
      },
    ],
    deck: remaining,
    row: drawn,
    selectedCardIndex: null,
    log: ["Début de partie"],
  };
}
