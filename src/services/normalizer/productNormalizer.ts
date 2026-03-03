import productMap from "../../config/productMap.json";

const nonBurgerKeywords = ["gaseosa", "coca", "papas", "chicken", "pops", "salsa"];

export interface NormalizedProductResult {
  normalizedNames: string[];
  burgersQty: number;
  unknownProducts: string[];
}

const canonicalText = (value: string): string => {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

interface ProductAliasEntry {
  source: string;
  target: string;
  canonicalSource: string;
}

const baseEntries = Object.entries(productMap as Record<string, string>);

const productEntries: ProductAliasEntry[] = baseEntries.flatMap(([source, target]) => {
  const aliases = new Set<string>();
  aliases.add(source);
  aliases.add(target);

  // Common PedidosYa prefix variations.
  if (source.toLowerCase().startsWith("hamburguesa ")) {
    aliases.add(source.slice("hamburguesa ".length));
  }

  return Array.from(aliases).map((alias) => ({
    source: alias,
    target,
    canonicalSource: canonicalText(alias)
  }));
});

const normalizeProductName = (rawName: string): string | undefined => {
  const canonicalRaw = canonicalText(rawName);

  for (const entry of productEntries) {
    if (canonicalRaw.includes(entry.canonicalSource)) {
      return entry.target;
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

    const promoMatch = itemName.match(/promo\s*-?\s*(\d+)/i);
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
