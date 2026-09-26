// The standard French-suited deck, shared by the classic card games.
// Definition ids are rank + suit, e.g. "7H", "TD" (ten of diamonds), "AS".

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];

/** The 52 definition ids of a standard deck, in a fixed order. */
export function standardDeck(): string[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => `${rank}${suit}`));
}

export function rankOf(def: string): Rank {
  const rank = def[0] as Rank;
  if (!RANKS.includes(rank)) throw new Error(`not a standard card: ${def}`);
  return rank;
}

export function suitOf(def: string): Suit {
  const suit = def[1] as Suit;
  if (!SUITS.includes(suit)) throw new Error(`not a standard card: ${def}`);
  return suit;
}
