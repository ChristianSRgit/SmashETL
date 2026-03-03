import { google, sheets_v4 } from "googleapis";
import { Order } from "../../types";

export class SheetsService {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;
  private readonly tabName: string;

  constructor() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
    this.tabName = process.env.GOOGLE_SHEETS_TAB_NAME || "PedidosYa";

    if (!clientEmail || !privateKey || !this.spreadsheetId) {
      throw new Error("Missing Google Sheets credentials or spreadsheet configuration");
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    this.sheets = google.sheets({ version: "v4", auth });
  }

  async getExistingOrderNumbers(): Promise<number[]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tabName}!A:A`
    });

    const values = response.data.values || [];

    return values
      .map((row) => Number(row[0]))
      .filter((value) => Number.isFinite(value));
  }

  async appendOrders(orders: Order[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    const values = orders.map((order) => [
      order.orderNumber,
      order.date,
      order.channel,
      order.burgersQty,
      order.products,
      order.grossAmount,
      order.netAmount,
      order.paymentMethod
    ]);

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tabName}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values
      }
    });
  }
}
