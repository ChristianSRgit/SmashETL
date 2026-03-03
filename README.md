# SmashETL

Production-ready Node.js + TypeScript ETL service for PedidosYa sales reports, with upload to Google Sheets.

## Features

- XLSX upload endpoint (`POST /upload`) with in-memory processing.
- PedidosYa parser via scalable `getParser(channel)` design.
- Business rules included:
  - Order number normalization
  - Date formatting (`DD/MM/YYYY`)
  - Product parsing + promo multiplier
  - Product mapping validation (hard stop on unknown products)
  - Duplicate detection against Google Sheets with confirmation flow
- Header-based protection using `Authorization: APP_SECRET`.

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

Fill in:

- `APP_SECRET`
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

## Endpoint

### `POST /upload`

- Auth header: `Authorization: <APP_SECRET>`
- Content type: `multipart/form-data`
- File field name: `file`
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
