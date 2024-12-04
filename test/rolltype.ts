// Typdefinition für RollType
interface RollType {
  price: number; // Der Preis für den Roll-Typ
  probabilities: [number, number, number, number, number, number]; // Wahrscheinlichkeiten als Array mit 6 Einträgen
}

// Definition der Roll-Typen
export const rollTypes: RollType[] = [
  {
    price: 1000,
    probabilities: [100, 0, 0, 0, 0, 0], // 100% Common
  },
  {
    price: 2000,
    probabilities: [60, 40, 0, 0, 0, 0], // 60% Common, 40% Uncommon
  },
  {
    price: 3000,
    probabilities: [50, 40, 10, 0, 0, 0], // 50% Common, 40% Uncommon, 10% Rare
  },
  {
    price: 4000,
    probabilities: [45, 35, 15, 5, 0, 0], // 45% Common, 35% Uncommon, ...
  },
  {
    price: 5000,
    probabilities: [40, 30, 15, 10, 5, 0], // 40% Common, 30% Uncommon, ...
  },
  {
    price: 6000,
    probabilities: [35, 25, 15, 15, 5, 5], // 35% Common, 25% Uncommon, ...
  },
];
