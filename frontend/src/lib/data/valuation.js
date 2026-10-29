const BHK_RENT_FACTOR = { 1: 0.62, 2: 1, 3: 1.42, 4: 1.85 };
const BHK_AREA = { 1: 550, 2: 900, 3: 1250, 4: 1700 };
const FURNISH_RENT = { unfurnished: 0.9, 'semi-furnished': 1.0, furnished: 1.15 };
const FURNISH_SALE = { unfurnished: 0.98, 'semi-furnished': 1.0, furnished: 1.04 };
const SPREAD = 0.12;

const clampBhk = (bhk) => Math.min(4, Math.max(1, Number(bhk) || 2));
const roundTo = (n, step) => Math.round(n / step) * step;
const band = (mid) => ({ low: Math.round(mid * (1 - SPREAD)), mid, high: Math.round(mid * (1 + SPREAD)) });

export function estimateValuation({ locality, bhk, area, furnishing } = {}) {
  if (locality?.ratePerSqft == null || locality?.avgRent == null) return null;

  const b = clampBhk(bhk);
  const sqft = Math.max(150, Number(area) || BHK_AREA[b]);
  const rentMid = roundTo(locality.avgRent * (BHK_RENT_FACTOR[b] || 1) * (FURNISH_RENT[furnishing] ?? 1), 500);
  const saleMid = roundTo(locality.ratePerSqft * sqft * (FURNISH_SALE[furnishing] ?? 1), 50000);

  return {
    locality: locality.name,
    perSqft: locality.ratePerSqft,
    area: sqft,
    bhk: b,
    rent: band(rentMid),
    sale: band(saleMid),
  };
}
