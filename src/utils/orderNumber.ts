/**
 * Normalize order number according to business rules:
 * - Start with last 4 digits
 * - If starts with 0, prepend one digit from the left repeatedly
 */
export const normalizeOrderNumber = (value: string | number): number => {
  const digitsOnly = String(value).replace(/\D/g, "");

  if (digitsOnly.length < 4) {
    throw new Error(`Invalid order number: ${value}`);
  }

  let start = digitsOnly.length - 4;
  let result = digitsOnly.slice(start);

  while (result.startsWith("0") && start > 0) {
    start -= 1;
    result = digitsOnly.slice(start);
  }

  if (result.startsWith("0") || result.length < 4 || !/^\d+$/.test(result)) {
    throw new Error(`Could not normalize order number: ${value}`);
  }

  return Number(result);
};
