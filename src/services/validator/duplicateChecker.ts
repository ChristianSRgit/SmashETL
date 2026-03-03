import { Order } from "../../types";

export const findDuplicates = (orders: Order[], existingOrderNumbers: number[]): number[] => {
  const existing = new Set(existingOrderNumbers);
  const duplicates = new Set<number>();

  for (const order of orders) {
    if (existing.has(order.orderNumber)) {
      duplicates.add(order.orderNumber);
    }
  }

  return Array.from(duplicates);
};
