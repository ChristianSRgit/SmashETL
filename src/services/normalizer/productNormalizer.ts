import productMap from "../../config/productMap.json";

const nonBurgerKeywords = ["gaseosa", "coca", "papas", "chicken", "pops", "salsa"];

export interface NormalizedProductResult {
  normalizedNames: string[];
  burgersQty: number;
  unknownProducts: string[];
}

const productEntries = Object.entries(productMap as Record<string, string>);

const normalizeProductName = (rawName: string): string | undefined => {
  const normalizedRaw = rawName.trim().toLowerCase();

  for (const [sourceName, targetName] of productEntries) {
    if (normalizedRaw.includes(sourceName.toLowerCase())) {
      return targetName;
    }
  }

  return undefined;
};

export const normalizeProducts = (itemsField: string): NormalizedProductResult => {
  const normalizedNames: string[] = [];
  const unknownProducts = new Set<string>();
  let burgersQty = 0;

  const itemTokens = itemsField
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const item of itemTokens) {
    const match = item.match(/^(\d+)\s(.+)$/);

    if (!match) {
      continue;
    }

    const qty = Number(match[1]);
    const itemName = match[2].trim();
    const lowerName = itemName.toLowerCase();

    if (nonBurgerKeywords.some((keyword) => lowerName.includes(keyword))) {
      continue;
    }

    const promoMatch = itemName.match(/promo\s*(\d+)/i);
    const multiplier = promoMatch ? Number(promoMatch[1]) : 1;

    const normalizedName = normalizeProductName(itemName);

    if (!normalizedName) {
      unknownProducts.add(itemName);
      continue;
    }

    burgersQty += qty * multiplier;
    normalizedNames.push(normalizedName);
  }

  return {
    normalizedNames,
    burgersQty,
    unknownProducts: Array.from(unknownProducts)
  };
};
