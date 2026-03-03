# SmashETL

Production-ready Node.js + TypeScript ETL service for PedidosYa sales reports, with upload to Google Sheets.

## Features

- Simple web upload UI on `GET /upload` with drag & drop area (Upload here / Cargar archivo).
- XLSX upload endpoint (`POST /upload`) with in-memory processing.
- PedidosYa parser via scalable `getParser(channel)` design.
- Hardened upload layer (header auth, file type guard, file size limit).
- Business rules included:
  - Order number normalization
  - Date formatting (`DD/MM/YYYY`)
  - Product parsing + promo multiplier
  - Product mapping validation (hard stop on unknown products)
  - Duplicate detection against Google Sheets with confirmation flow
- Supports two output integrations:
  - **Google Apps Script URL** (`GOOGLE_SCRIPT_URL`) – recommended for compatibility with existing projects.
  - **Google Sheets API (service account)** as fallback.

## Security note (dependency hardening)

The previous implementation used `xlsx` (SheetJS), but `npm audit` reports a high severity vulnerability with no fixed version available. The parser now uses `exceljs` for XLSX ingestion.

## Project Structure

```txt
/src
 ├── server.ts
 ├── routes/upload.ts
 ├── services/
 │     ├── parser/peyaParser.ts
 │     ├── normalizer/productNormalizer.ts
 │     ├── order/orderFormatter.ts
 │     ├── validator/duplicateChecker.ts
 │     └── sheets/sheetsService.ts
 ├── config/productMap.json
 ├── utils/orderNumber.ts
 ├── utils/dateFormatter.ts
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Recommended (compatible with your POS project style):

- `GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/.../exec`
- `GOOGLE_SHEETS_TAB_NAME=VentasPeYa`

Alternative:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_TAB_NAME`

3. Run in development:

```bash
npm run dev
```

4. Build + start production:

```bash
npm run build
npm start
```

## Apps Script contract expected by this app

When `GOOGLE_SCRIPT_URL` is set, this app calls:

- `GET <GOOGLE_SCRIPT_URL>?action=getExistingOrderNumbers&tabName=VentasPeYa`
  - expected JSON response:
    ```json
    { "orderNumbers": [1234, 5678] }
    ```
- `POST <GOOGLE_SCRIPT_URL>` with body:
  ```json
  {
    "action": "appendOrders",
    "tabName": "VentasPeYa",
    "orders": [
      {
        "orderNumber": 1234,
        "date": "12/01/2026",
        "channel": "PedidosYa",
        "burgersQty": 2,
        "products": "Big smash doble",
        "grossAmount": 15990,
        "netAmount": 12000,
        "paymentMethod": "Efectivo"
      }
    ]
  }
  ```

## Endpoint

### `GET /upload`

- Renderiza una interfaz web simple para cargar archivo y seleccionar canal (checkbox único: PedidosYa/Rappi/MercadoLibre).

### `POST /upload`

- Auth header: `Authorization: <APP_SECRET>`
- Content type: `multipart/form-data`
- File field name: `file`
- Accepts only `.xlsx` files
- Size limit: 5MB
- Optional query: `?confirm=true` to proceed when duplicates exist
- Optional body field: `channel` (default `PedidosYa`)

### Response

```json
{
  "inserted": 10,
  "duplicates": [500678],
  "unknownProducts": [],
  "timeMs": 180
}
```

## Notes

- If unknown products are detected (not in `src/config/productMap.json`), process stops and returns the unknown list.
- Future channels can be added by extending `getParser(channel)`.
