import { Order, ParsedOrderData } from "../../types";

export const formatOrders = (parsedOrders: ParsedOrderData[], channel = "PedidosYa"): Order[] => {
  return parsedOrders.map((parsed) => ({
    orderNumber: parsed.orderNumber,
    date: parsed.date,
    channel,
    burgersQty: parsed.burgersQty,
    products: parsed.burgerNames.join(", "),
    grossAmount: parsed.grossAmount,
    netAmount: parsed.netAmount,
    paymentMethod: parsed.paymentMethod
  }));
};
