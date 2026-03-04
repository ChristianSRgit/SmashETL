import { google, sheets_v4 } from "googleapis";
import { Order } from "../../types";

interface ScriptGetOrdersResponse {
  orderNumbers?: Array<number | string>;
}

export interface ExistingOrderNumbersLookup {
  orderNumbers: number[];
  source: "script" | "sheetsApi" | "none";
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


const safeJson = async <T>(response: Response): Promise<T | undefined> => {
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
};

const isHtmlResponse = (response: Response, body: string): boolean => {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    return true;
  }

  const trimmed = body.trim().toLowerCase();
  return trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html");
};

const isAuthRedirectResponse = (response: Response, body: string): boolean => {
  const finalUrl = response.url.toLowerCase();
  if (finalUrl.includes("accounts.google.com")) {
    return true;
  }

  const normalized = body.toLowerCase();
  return normalized.includes("accounts.google.com") && normalized.includes("signin");
};

const isScriptWriteSuccess = async (response: Response): Promise<boolean> => {
  if (!response.ok) {
    return false;
  }

  const body = await response.text();

  if (isHtmlResponse(response, body) || isAuthRedirectResponse(response, body)) {
    return false;
  }

  return true;
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
        const data = await safeJson<ScriptGetOrdersResponse>(getResponse);
        if (data) {
          return this.parseOrderNumbers(data);
        }
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
        const data = await safeJson<ScriptGetOrdersResponse>(postJsonResponse);
        if (data) {
          return this.parseOrderNumbers(data);
        }
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
        const data = await safeJson<ScriptGetOrdersResponse>(postFormResponse);
        if (data) {
          return this.parseOrderNumbers(data);
        }
      }
    }

    return undefined;
  }

  async getExistingOrderNumbersLookup(): Promise<ExistingOrderNumbersLookup> {
    const fromScript = await this.getOrderNumbersViaScript();
    if (fromScript !== undefined) {
      return { orderNumbers: fromScript, source: "script" };
    }

    if (this.sheets) {
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${this.tabName}!A:A`
        });

        const values = response.data.values || [];
        return {
          orderNumbers: values.map((row) => Number(row[0])).filter((value) => Number.isFinite(value)),
          source: "sheetsApi"
        };
      } catch (error) {
        if (!isDecoderKeyError(error)) {
          throw error;
        }
      }
    }

    return { orderNumbers: [], source: "none" };
  }

  async getExistingOrderNumbers(): Promise<number[]> {
    const lookup = await this.getExistingOrderNumbersLookup();
    return lookup.orderNumbers;
  }

  private toRegistrarVentaPayload(order: Order) {
    return {
      nroPedido: String(order.orderNumber),
      fecha: order.date,
      canal: order.channel,
      cantidadHamburguesas: order.burgersQty,
      productos: order.products,
      montoBruto: order.grossAmount,
      montoNeto: order.netAmount,
      metodoDePago: order.paymentMethod
    };
  }

  private toLegacyScriptPayload(order: Order) {
    return {
      ...this.toRegistrarVentaPayload(order),
      tabName: this.tabName
    };
  }

  private buildSalesBatchPayloads(orders: Order[]) {
    const sales = orders.map((order) => this.toRegistrarVentaPayload(order));

    return [
      {
        action: "appendSales",
        tabName: this.tabName,
        sales
      },
      {
        action: "appendSales",
        tabName: this.tabName,
        ventas: sales
      },
      {
        tabName: this.tabName,
        sales
      },
      {
        tabName: this.tabName,
        ventas: sales
      },
      sales
    ];
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
      let lastRegistrarStatus = 0;
      let lastLegacyStatus = 0;
      let lastFormStatus = 0;

      for (const url of variants) {
        let batchSucceeded = false;

        for (const payload of this.buildSalesBatchPayloads(orders)) {
          const batchResponse = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          lastBatchStatus = batchResponse.status;
          if (await isScriptWriteSuccess(batchResponse)) {
            batchSucceeded = true;
            break;
          }
        }

        if (batchSucceeded) {
          return;
        }

        let registrarFailedStatus: number | undefined;
        for (const order of orders) {
          const registrarResponse = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(this.toRegistrarVentaPayload(order))
          });

          if (!(await isScriptWriteSuccess(registrarResponse))) {
            registrarFailedStatus = registrarResponse.status;
            break;
          }
        }

        if (!registrarFailedStatus) {
          return;
        }

        lastRegistrarStatus = registrarFailedStatus;

        let legacyFailedStatus: number | undefined;
        for (const order of orders) {
          const legacyResponse = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(this.toLegacyScriptPayload(order))
          });

          if (!(await isScriptWriteSuccess(legacyResponse))) {
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
        if (await isScriptWriteSuccess(formResponse)) {
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

            if (!(await isScriptWriteSuccess(nextResponse))) {
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
        `Apps Script error appending orders: batch ${lastBatchStatus}, registrarVenta ${lastRegistrarStatus}, legacy ${lastLegacyStatus}, form ${lastFormStatus}. Tried URL variants for /exec and /dev. Verify GOOGLE_SCRIPT_URL deployment URL and permissions, or fix GOOGLE_PRIVATE_KEY for API fallback.`
      );
    }

    await this.appendViaSheetsApi(orders);
  }
}
