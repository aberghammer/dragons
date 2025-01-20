// Typdefinition für RollType
interface RollType {
  price: number; // Der Preis für den Roll-Typ
  probabilities: [number, number, number, number, number]; // Wahrscheinlichkeiten als Array mit 6 Einträgen
}

// Definition der Roll-Typen
export const rollTypes: RollType[] = [
  {
    price: 3600,
    probabilities: [8000, 1600, 340, 46, 14], // 8000 + 1600 + 320 + 48 + 32 = 10000
  },
  {
    price: 7200,
    probabilities: [6000, 3000, 760, 200, 40], // 60% Common, 30% Uncommon, ...
  },
  {
    price: 10800,
    probabilities: [4250, 3920, 1176, 458, 196], // 40% Common, 41% Uncommon, 12% Rare
  },
  {
    price: 14400,
    probabilities: [1340, 4625, 2273, 1225, 537], // 14% Common, 46% Uncommon, ...
  },
  {
    price: 21600,
    probabilities: [900, 3550, 2450, 2190, 910], // 10% Common, 35% Uncommon, ...
  },
  {
    price: 36000,
    probabilities: [0, 2390, 2856, 3334, 1420], // 0% Common, 24% Uncommon, ...
  },
];
