// Typdefinition für RollType
interface RollType {
  price: number; // Der Preis für den Roll-Typ
  probabilities: [number, number, number, number, number]; // Wahrscheinlichkeiten als Array mit 6 Einträgen
}

// Definition der Roll-Typen
export const rollTypes: RollType[] = [
  {
    price: 3600,
    probabilities: [80, 16, 2, 1, 1], // 80% Common
  },
  {
    price: 7200,
    probabilities: [60, 30, 7, 2, 1], // 60% Common, 30% Uncommon, ...
  },
  {
    price: 10800,
    probabilities: [40, 41, 12, 5, 2], // 40% Common, 41% Uncommon, 12% Rare
  },
  {
    price: 14400,
    probabilities: [14, 46, 23, 12, 5], // 14% Common, 46% Uncommon, ...
  },
  {
    price: 21600,
    probabilities: [10, 35, 25, 21, 9], // 10% Common, 35% Uncommon, ...
  },
  {
    price: 36000,
    probabilities: [0, 24, 29, 33, 14], // 0% Common, 24% Uncommon, ...
  },
];
