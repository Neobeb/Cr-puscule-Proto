const CREATURE_TYPES = [
  "skeleton",
  "witch",
  "werewolf",
  "slime",
  "vampire",
  "zombie",
  "ghost",
  "demon",
];

const VALUES = [0, 1, 2, 3, 4, 5, 6];

export const cards = CREATURE_TYPES.flatMap((type) =>
  VALUES.map((value) => ({
    id: `${type}-${value}`,
    type,
    value,
  }))
);
