import { google, sheets_v4 } from "googleapis";
import { Order } from "../../types";

interface ScriptGetOrdersResponse {
  orderNumbers?: Array<number | string>;
}

const isDecoderKeyError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("DECODER routines::unsupported") || error.message.includes("error:1E08010C");
};

const scriptUrlVariants = (rawUrl: string): string[] => {
  const urls = new Set<string>([rawUrl]);

  if (rawUrl.includes("/exec")) {
    urls.add(rawUrl.replace("/exec", "/dev"));
  }

  if (rawUrl.includes("/dev")) {
    urls.add(rawUrl.replace("/dev", "/exec"));
  }

  return Array.from(urls);
};

export class SheetsService {
  private readonly spreadsheetId: string;
  private readonly tabName: string;
  private readonly scriptUrl?: string;
  private readonly sheets?: sheets_v4.Sheets;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "";
    this.tabName = process.env.GOOGLE_SHEETS_TAB_NAME || "VentasPeYa";
    this.scriptUrl = process.env.GOOGLE_SCRIPT_URL;

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (clientEmail && privateKey && this.spreadsheetId) {
      try {
        const auth = new google.auth.JWT({
          email: clientEmail,
          key: privateKey,
          scopes: ["https://www.googleapis.com/auth/spreadsheets"]
        });

        this.sheets = google.sheets({ version: "v4", auth });
      } catch {
        this.sheets = undefined;
      }
    }

    if (!this.scriptUrl && !this.sheets) {
      throw new Error(
        "Missing or invalid Sheets configuration. Set GOOGLE_SCRIPT_URL or valid service account vars (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_SPREADSHEET_ID)."
      );
    }
  }

  private parseOrderNumbers(payload: ScriptGetOrdersResponse): number[] {
    const values = payload.orderNumbers || [];
    return values.map((row) => Number(row)).filter((value) => Number.isFinite(value));
  }

  private async getOrderNumbersViaScript(): Promise<number[] | undefined> {
    if (!this.scriptUrl) {
      return undefined;
    }

    const variants = scriptUrlVariants(this.scriptUrl);

    for (const url of variants) {
      const getUrl = new URL(url);
      getUrl.searchParams.set("action", "getExistingOrderNumbers");
      getUrl.searchParams.set("tabName", this.tabName);

      const getResponse = await fetch(getUrl.toString());
      if (getResponse.ok) {
        const data = (await getResponse.json()) as ScriptGetOrdersResponse;
        return this.parseOrderNumbers(data);
      }

      const postJsonResponse = await fetch(url, {
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

      const formBody = new URLSearchParams({
        action: "getExistingOrderNumbers",
        tabName: this.tabName
      });

      const postFormResponse = await fetch(url, {
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
    }

    return undefined;
  }

  async getExistingOrderNumbers(): Promise<number[]> {
    const fromScript = await this.getOrderNumbersViaScript();
    if (fromScript) {
      return fromScript;
    }

    if (this.sheets) {
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${this.tabName}!A:A`
        });

        const values = response.data.values || [];
        return values.map((row) => Number(row[0])).filter((value) => Number.isFinite(value));
      } catch (error) {
        if (!isDecoderKeyError(error)) {
          throw error;
        }
      }
    }

    return [];
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

  private async appendViaSheetsApi(orders: Order[]): Promise<void> {
    if (!this.sheets) {
      throw new Error("Sheets API fallback unavailable");
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

  async appendOrders(orders: Order[]): Promise<void> {
    if (orders.length === 0) {
      return;
    }

    if (this.scriptUrl) {
      const variants = scriptUrlVariants(this.scriptUrl);
      let lastBatchStatus = 0;
      let lastLegacyStatus = 0;
      let lastFormStatus = 0;

      for (const url of variants) {
        const batchResponse = await fetch(url, {
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

        lastBatchStatus = batchResponse.status;
        if (batchResponse.ok) {
          return;
        }

        let legacyFailedStatus: number | undefined;
        for (const order of orders) {
          const legacyResponse = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(this.toLegacyScriptPayload(order))
          });

          if (!legacyResponse.ok) {
            legacyFailedStatus = legacyResponse.status;
            break;
          }
        }

        if (!legacyFailedStatus) {
          return;
        }

        lastLegacyStatus = legacyFailedStatus;

        const firstOrder = orders[0];
        const formResponse = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: new URLSearchParams(
            Object.entries(this.toLegacyScriptPayload(firstOrder)).reduce<Record<string, string>>((acc, [key, value]) => {
              acc[key] = String(value);
              return acc;
            }, {})
          ).toString()
        });

        lastFormStatus = formResponse.status;
        if (formResponse.ok) {
          for (const order of orders.slice(1)) {
            const nextResponse = await fetch(url, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded"
              },
              body: new URLSearchParams(
                Object.entries(this.toLegacyScriptPayload(order)).reduce<Record<string, string>>((acc, [key, value]) => {
                  acc[key] = String(value);
                  return acc;
                }, {})
              ).toString()
            });

            if (!nextResponse.ok) {
              throw new Error(`Apps Script error appending orders: ${nextResponse.status}`);
            }
          }

          return;
        }
      }

      if (this.sheets) {
        try {
          await this.appendViaSheetsApi(orders);
          return;
        } catch (error) {
          if (!isDecoderKeyError(error)) {
            throw error;
          }
        }
      }

      throw new Error(
        `Apps Script error appending orders: batch ${lastBatchStatus}, legacy ${lastLegacyStatus}, form ${lastFormStatus}. Tried URL variants for /exec and /dev. Verify GOOGLE_SCRIPT_URL deployment URL and permissions, or fix GOOGLE_PRIVATE_KEY for API fallback.`
      );
    }

    await this.appendViaSheetsApi(orders);
  }
}
