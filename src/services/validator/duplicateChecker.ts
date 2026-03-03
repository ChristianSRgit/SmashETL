import { Order } from "../../types";

export const findDuplicates = (orders: Order[], existingOrderNumbers: number[]): number[] => {
  const existing = new Set(existingOrderNumbers);

  return orders
    .map((order) => order.orderNumber)
    .filter((orderNumber) => existing.has(orderNumber));
};
