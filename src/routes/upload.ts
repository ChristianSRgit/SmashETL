import { Router, Request, Response } from "express";
import multer from "multer";
import { getParser } from "../services/parser/peyaParser";
import { formatOrders } from "../services/order/orderFormatter";
import { SheetsService } from "../services/sheets/sheetsService";
import { findDuplicates } from "../services/validator/duplicateChecker";

const upload = multer({ storage: multer.memoryStorage() });

export const uploadRouter = Router();

uploadRouter.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  const startedAt = Date.now();

  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || authHeader !== process.env.APP_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "XLSX file is required in form-data key 'file'" });
    }

    const channel = String(req.body.channel || "PedidosYa");
    const parser = getParser(channel);
    const parseResult = parser.parse(req.file.buffer);

    if (parseResult.unknownProducts.length > 0) {
      return res.status(400).json({
        inserted: 0,
        duplicates: [],
        unknownProducts: parseResult.unknownProducts,
        timeMs: Date.now() - startedAt
      });
    }

    const orders = formatOrders(parseResult.parsedOrders, channel);
    const sheetsService = new SheetsService();
    const existingOrderNumbers = await sheetsService.getExistingOrderNumbers();
    const duplicates = findDuplicates(orders, existingOrderNumbers);

    const confirm = String(req.query.confirm || "false").toLowerCase() === "true";

    if (duplicates.length > 0 && !confirm) {
      return res.status(409).json({
        inserted: 0,
        duplicates,
        unknownProducts: [],
        timeMs: Date.now() - startedAt,
        message: "Duplicates detected. Re-run with ?confirm=true to continue insertion."
      });
    }

    const ordersToInsert = confirm ? orders : orders.filter((order) => !duplicates.includes(order.orderNumber));
    await sheetsService.appendOrders(ordersToInsert);

    return res.json({
      inserted: ordersToInsert.length,
      duplicates,
      unknownProducts: [],
      timeMs: Date.now() - startedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";

    return res.status(500).json({
      message,
      inserted: 0,
      duplicates: [],
      unknownProducts: [],
      timeMs: Date.now() - startedAt
    });
  }
});
