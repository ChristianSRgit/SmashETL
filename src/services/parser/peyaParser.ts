import ExcelJS from "exceljs";
import { formatPedidosYaDate } from "../../utils/dateFormatter";
import { normalizeOrderNumber } from "../../utils/orderNumber";
import { parseAmount } from "../../utils/amountParser";
import { normalizeProducts } from "../normalizer/productNormalizer";
import { ParseResult, ParsedOrderData, RawOrderRow } from "../../types";

export interface ChannelParser {
  parse(buffer: Buffer): Promise<ParseResult>;
}

const headerAliases: Record<string, keyof RawOrderRow> = {
  "nro de pedido": "Nro de pedido",
  "nº de pedido": "Nro de pedido",
  "numero de pedido": "Nro de pedido",
  "fecha del pedido": "Fecha del pedido",
  "forma de pago": "Forma de pago",
  "total del pedido": "Total del pedido",
  "ingreso estimado": "Ingreso estimado",
  "articulos": "Artículos",
  "artículos": "Artículos"
};

const requiredHeaders: Array<keyof RawOrderRow> = [
  "Nro de pedido",
  "Fecha del pedido",
  "Forma de pago",
  "Total del pedido",
  "Ingreso estimado",
  "Artículos"
];

const cleanCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
};

const normalizeHeader = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
};

interface MinimalWorksheetRow {
  values: unknown[];
  getCell(index: number): { value: unknown };
}

interface HeaderRowInfo {
  rowNumber: number;
  headerIndexMap: Map<keyof RawOrderRow, number>;
}

const findHeaderRow = (worksheet: { getRow(index: number): MinimalWorksheetRow }): HeaderRowInfo => {
  for (let rowNumber = 1; rowNumber <= 20; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = (row.values as unknown[]).slice(1).map((value) => cleanCellValue(value));
    const map = new Map<keyof RawOrderRow, number>();

    values.forEach((rawHeader, index) => {
      const canonical = headerAliases[normalizeHeader(rawHeader)];
      if (canonical && !map.has(canonical)) {
        map.set(canonical, index + 1);
      }
    });

    if (requiredHeaders.every((header) => map.has(header))) {
      return { rowNumber, headerIndexMap: map };
    }
  }

  throw new Error("Missing required columns in XLSX header row");
};

class PedidosYaParser implements ChannelParser {
  async parse(buffer: Buffer): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error("XLSX file has no sheets");
    }

    const { rowNumber: headerRowNumber, headerIndexMap } = findHeaderRow(worksheet as unknown as { getRow(index: number): MinimalWorksheetRow });

    const rows: RawOrderRow[] = [];

    worksheet.eachRow((row: MinimalWorksheetRow, rowNumber: number) => {
      if (rowNumber <= headerRowNumber) {
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
