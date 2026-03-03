import { google, sheets_v4 } from "googleapis";
import { Order } from "../../types";

interface ScriptGetOrdersResponse {
  orderNumbers?: Array<number | string>;
}

export class SheetsService {
  private readonly spreadsheetId: string;
  private readonly tabName: string;
  private readonly scriptUrl?: string;
  private readonly sheets?: sheets_v4.Sheets;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
    this.tabName = process.env.GOOGLE_SHEETS_TAB_NAME || "VentasPeYa";
    this.scriptUrl = process.env.GOOGLE_SCRIPT_URL;

    if (this.scriptUrl) {
      return;
    }

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey || !this.spreadsheetId) {
      throw new Error(
        "Missing Sheets configuration. Set GOOGLE_SCRIPT_URL or service account vars (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_SPREADSHEET_ID)."
      );
    }

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    this.sheets = google.sheets({ version: "v4", auth });
  }

  private parseOrderNumbers(payload: ScriptGetOrdersResponse): number[] {
    const values = payload.orderNumbers || [];
    return values.map((row) => Number(row)).filter((value) => Number.isFinite(value));
  }

  private async getOrderNumbersViaScript(): Promise<number[]> {
    if (!this.scriptUrl) {
      return [];
    }

    // Try GET first (for doGet-based scripts).
    const getUrl = new URL(this.scriptUrl);
    getUrl.searchParams.set("action", "getExistingOrderNumbers");
    getUrl.searchParams.set("tabName", this.tabName);

    const getResponse = await fetch(getUrl.toString());

    if (getResponse.ok) {
      const data = (await getResponse.json()) as ScriptGetOrdersResponse;
      return this.parseOrderNumbers(data);
    }

    // Fallback to POST (for doPost-only scripts that may return 404 on GET).
    const postResponse = await fetch(this.scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "getExistingOrderNumbers",
        tabName: this.tabName
      })
    });

    if (postResponse.ok) {
      const data = (await postResponse.json()) as ScriptGetOrdersResponse;
      return this.parseOrderNumbers(data);
    }

    throw new Error(
      `Apps Script error fetching order numbers: GET ${getResponse.status}, POST ${postResponse.status}. Verify GOOGLE_SCRIPT_URL deployment and doGet/doPost handlers.`
    );
  }

  async getExistingOrderNumbers(): Promise<number[]> {
    if (this.scriptUrl) {
      return this.getOrderNumbersViaScript();
    }

    if (!this.sheets) {
      throw new Error("Sheets client not initialized");
    }

    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${this.tabName}!A:A`
    });

    const values = response.data.values || [];

    return values.map((row) => Number(row[0])).filter((value) => Number.isFinite(value));
  }

  async appendOrders(orders: Order[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    if (this.scriptUrl) {
      const response = await fetch(this.scriptUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "appendOrders",
          tabName: this.tabName,
          orders
        })
      });

      if (!response.ok) {
        throw new Error(`Apps Script error appending orders: ${response.status}`);
      }

      return;
    }

    if (!this.sheets) {
      throw new Error("Sheets client not initialized");
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
