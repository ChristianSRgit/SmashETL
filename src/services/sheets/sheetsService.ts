import { google, sheets_v4 } from "googleapis";
import { Order } from "../../types";

interface ScriptGetOrdersResponse {
  orderNumbers?: Array<number | string>;
  ok?: boolean;
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

    // Fallback to POST JSON (for doPost-based scripts with action routing).
    const postJsonResponse = await fetch(this.scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "getExistingOrderNumbers",
        tabName: this.tabName
      })
    });

    if (postJsonResponse.ok) {
      const data = (await postJsonResponse.json()) as ScriptGetOrdersResponse;
      return this.parseOrderNumbers(data);
    }

    // Fallback to POST form-encoded parameters for scripts using only e.parameter.
    const formBody = new URLSearchParams({
      action: "getExistingOrderNumbers",
      tabName: this.tabName
    });

    const postFormResponse = await fetch(this.scriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: formBody.toString()
    });

    if (postFormResponse.ok) {
      const data = (await postFormResponse.json()) as ScriptGetOrdersResponse;
      return this.parseOrderNumbers(data);
    }

    // Do not hard fail upload when duplicates endpoint isn't implemented in Apps Script.
    return [];
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

  private toLegacyScriptPayload(order: Order) {
    return {
      nroPedido: order.orderNumber,
      fecha: order.date,
      canal: order.channel,
      cantidadHamburguesas: order.burgersQty,
      productos: order.products,
      montoBruto: order.grossAmount,
      montoNeto: order.netAmount,
      metodoDePago: order.paymentMethod,
      tabName: this.tabName
    };
  }

  async appendOrders(orders: Order[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    if (this.scriptUrl) {
      // Attempt modern batch payload first.
      const batchResponse = await fetch(this.scriptUrl, {
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

      if (batchResponse.ok) {
        return;
      }

      // Fallback: compatible with current doPost script that appends one row from e.parameter/JSON fields.
      for (const order of orders) {
        const legacyResponse = await fetch(this.scriptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(this.toLegacyScriptPayload(order))
        });

        if (!legacyResponse.ok) {
          throw new Error(`Apps Script error appending orders: ${legacyResponse.status}`);
        }
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
