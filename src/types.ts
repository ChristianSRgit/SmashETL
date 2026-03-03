export interface Order {
  orderNumber: number;
  date: string; // DD/MM/YYYY
  channel: string;
  burgersQty: number;
  products: string;
  grossAmount: number;
  netAmount: number;
  paymentMethod: string;
}

export interface RawOrderRow {
  [key: string]: unknown;
  "Nro de pedido": string | number;
  "Fecha del pedido": string;
  "Forma de pago": string;
  "Total del pedido": string | number;
  "Ingreso estimado": string | number;
  "Artículos": string;
}

export interface ParsedOrderData {
  orderNumber: number;
  date: string;
  paymentMethod: string;
  grossAmount: number;
  netAmount: number;
  burgerNames: string[];
  burgersQty: number;
}

export interface ParseResult {
  parsedOrders: ParsedOrderData[];
  unknownProducts: string[];
}
