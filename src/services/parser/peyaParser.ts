import xlsx from "xlsx";
import { formatPedidosYaDate } from "../../utils/dateFormatter";
import { normalizeOrderNumber } from "../../utils/orderNumber";
import { normalizeProducts } from "../normalizer/productNormalizer";
import { ParseResult, ParsedOrderData, RawOrderRow } from "../../types";

export interface ChannelParser {
  parse(buffer: Buffer): ParseResult;
}

class PedidosYaParser implements ChannelParser {
  parse(buffer: Buffer): ParseResult {
    const workbook = xlsx.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("XLSX file has no sheets");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = xlsx.utils.sheet_to_json<RawOrderRow>(worksheet, {
      defval: ""
    });

    const unknownProducts = new Set<string>();
    const parsedOrders: ParsedOrderData[] = [];

    for (const row of rows) {
      const normalized = normalizeProducts(String(row["Artículos"] || ""));
      normalized.unknownProducts.forEach((name) => unknownProducts.add(name));

      parsedOrders.push({
        orderNumber: normalizeOrderNumber(row["Nro de pedido"]),
        date: formatPedidosYaDate(String(row["Fecha del pedido"])),
        paymentMethod: String(row["Forma de pago"] || ""),
        grossAmount: Number(row["Total del pedido"] || 0),
        netAmount: Number(row["Ingreso estimado"] || 0),
        burgerNames: normalized.normalizedNames,
        burgersQty: normalized.burgersQty
      });
    }

    return {
      parsedOrders,
      unknownProducts: Array.from(unknownProducts)
    };
  }
}

export const getParser = (channel: string): ChannelParser => {
  if (channel.toLowerCase() === "pedidosya") {
    return new PedidosYaParser();
  }

  throw new Error(`Unsupported channel parser: ${channel}`);
};
