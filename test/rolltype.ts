// Typdefinition für RollType
interface RollType {
  price: number; // Der Preis für den Roll-Typ
  probabilities: number[]; // Wahrscheinlichkeiten als Array mit 6 Einträgen
}

// Definition der Roll-Typen
export const rollTypes: RollType[] = [
  {
    price: 1000,
    probabilities: [10000, 0, 0, 0, 0, 0], // 100% Common
  },
  {
    price: 2000,
    probabilities: [6000, 4000, 0, 0, 0, 0], // 60% Common, 40% Uncommon
  },
  {
    price: 3000,
    probabilities: [5000, 4000, 1000, 0, 0, 0], // 50% Common, 40% Uncommon, 10% Rare
  },
  {
    price: 4000,
    probabilities: [4500, 3500, 1500, 500, 0, 0], // 45% Common, 35% Uncommon, ...
  },
  {
    price: 5000,
    probabilities: [4000, 3000, 1500, 1000, 500, 0], // 40% Common, 30% Uncommon, ...
  },
  {
    price: 6000,
    probabilities: [3500, 2500, 1500, 1500, 500, 500], // 35% Common, 25% Uncommon, ...
  },
];

export const rollTypesTest: RollType[] = [
  {
    price: 1000,
    probabilities: [8000, 1600, 200, 100, 100], // 80% Common
  },
  {
    price: 2000,
    probabilities: [6000, 3000, 700, 200, 100], // 60% Common, 30% Uncommon, ...
  },
  {
    price: 3000,
    probabilities: [4000, 4100, 1200, 500, 200], // 40% Common, 41% Uncommon, 12% Rare
  },
  {
    price: 4000,
    probabilities: [1400, 4600, 2300, 1200, 500], // 14% Common, 46% Uncommon, ...
  },
  {
    price: 5000,
    probabilities: [1000, 3500, 2500, 2100, 900], // 10% Common, 35% Uncommon, ...
  },
  {
    price: 6000,
    probabilities: [0, 2400, 2900, 3300, 1400], // 0% Common, 24% Uncommon, ...
  },
];
