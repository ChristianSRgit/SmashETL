/**
 * Converts PedidosYa format (YYYY-MM-DD HH:mm) into DD/MM/YYYY without timezone transforms.
 */
export const formatPedidosYaDate = (value: string): string => {
  const [datePart] = value.trim().split(" ");
  const parts = datePart.split("-");

  if (parts.length !== 3) {
    throw new Error(`Invalid date format: ${value}`);
  }

  const [year, month, day] = parts;

  if (!year || !month || !day) {
    throw new Error(`Invalid date format: ${value}`);
  }

  return `${day}/${month}/${year}`;
};
