/**
 * Parses numeric amounts that can come as:
 * - number
 * - "1234.56"
 * - "1.234,56" (es-AR)
 */
export const parseAmount = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? "").trim();

  if (!raw) {
    return 0;
  }

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
};
