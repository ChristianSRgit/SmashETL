import ExcelJS from "exceljs";
import { formatPedidosYaDate } from "../../utils/dateFormatter";
import { normalizeOrderNumber } from "../../utils/orderNumber";
import { parseAmount } from "../../utils/amountParser";
import { normalizeProducts } from "../normalizer/productNormalizer";
import { ParseResult, ParsedOrderData, RawOrderRow } from "../../types";

export interface ChannelParser {
  parse(buffer: Buffer): Promise<ParseResult>;
}

const requiredHeaders = [
  "Nro de pedido",
  "Fecha del pedido",
  "Forma de pago",
  "Total del pedido",
  "Ingreso estimado",
  "Artículos"
 ] as const;

const cleanCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

interface MinimalWorksheetRow {
  getCell(index: number): { value: unknown };
}

class PedidosYaParser implements ChannelParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("XLSX file has no sheets");
    }

    const headerRow = worksheet.getRow(1);
    const headers = (headerRow.values as unknown[]).slice(1).map((header: unknown) => cleanCellValue(header));

    for (const requiredHeader of requiredHeaders) {
      if (!headers.includes(requiredHeader)) {
        throw new Error(`Missing required column: ${requiredHeader}`);
      }
    }

    const headerIndexMap = new Map<string, number>();
    headers.forEach((name: string, index: number) => {
      headerIndexMap.set(name, index + 1);
    });

    const rows: RawOrderRow[] = [];

    worksheet.eachRow((row: MinimalWorksheetRow, rowNumber: number) => {
      if (rowNumber === 1) {
        return;
      }

      const rowData: RawOrderRow = {
        "Nro de pedido": cleanCellValue(row.getCell(headerIndexMap.get("Nro de pedido") || 1).value),
        "Fecha del pedido": cleanCellValue(row.getCell(headerIndexMap.get("Fecha del pedido") || 1).value),
        "Forma de pago": cleanCellValue(row.getCell(headerIndexMap.get("Forma de pago") || 1).value),
        "Total del pedido": cleanCellValue(row.getCell(headerIndexMap.get("Total del pedido") || 1).value),
        "Ingreso estimado": cleanCellValue(row.getCell(headerIndexMap.get("Ingreso estimado") || 1).value),
        "Artículos": cleanCellValue(row.getCell(headerIndexMap.get("Artículos") || 1).value)
      };

      const isEmptyRow = Object.values(rowData).every((value) => String(value).trim() === "");
      if (!isEmptyRow) {
        rows.push(rowData);
      }
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
        grossAmount: parseAmount(row["Total del pedido"]),
        netAmount: parseAmount(row["Ingreso estimado"]),
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
