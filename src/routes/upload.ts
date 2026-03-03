import { Router, Request, Response } from "express";
import multer from "multer";
import { getParser } from "../services/parser/peyaParser";
import { formatOrders } from "../services/order/orderFormatter";
import { SheetsService } from "../services/sheets/sheetsService";
import { findDuplicates } from "../services/validator/duplicateChecker";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isXlsxMime =
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.originalname.toLowerCase().endsWith(".xlsx");

    if (!isXlsxMime) {
      cb(new Error("Only .xlsx files are allowed"));
      return;
    }

    cb(null, true);
  }
});

const renderUploadPage = (): string => `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SmashETL Upload</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f5f7; margin: 0; }
      .container { max-width: 720px; margin: 40px auto; background: white; border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgba(0,0,0,.06); }
      h1 { margin-top: 0; }
      .dropzone {
        border: 2px dashed #7d7d8a;
        border-radius: 12px;
        min-height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 16px;
        color: #333;
        background: #fafafa;
        cursor: pointer;
      }
      .dropzone.active { border-color: #4f46e5; background: #eef2ff; }
      .channels { margin: 18px 0; display: flex; gap: 20px; flex-wrap: wrap; }
      .channel-option { display: flex; align-items: center; gap: 8px; font-weight: 600; }
      .field { margin: 12px 0; }
      .field label { display: block; font-weight: 600; margin-bottom: 6px; }
      .field input { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
      button { border: 0; border-radius: 8px; background: #111827; color: white; padding: 12px 16px; cursor: pointer; }
      .note { color: #555; font-size: 14px; margin-top: 8px; }
      #filename { margin-top: 8px; font-weight: 600; }
      #result { margin-top: 14px; font-size: 14px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Cargar archivo de ventas</h1>
      <form id="uploadForm" method="POST" action="/upload" enctype="multipart/form-data">
        <label class="dropzone" id="dropzone" for="fileInput">
          <div>
            <strong>Upload here / Cargar archivo</strong>
            <div class="note">Arrastrá y soltá un archivo .xlsx o hacé click para seleccionar.</div>
            <div id="filename"></div>
          </div>
        </label>
        <input id="fileInput" type="file" name="file" accept=".xlsx" hidden required />

        <div class="channels">
          <label class="channel-option"><input type="checkbox" name="channelChoice" value="PedidosYa" checked /> PedidosYa</label>
          <label class="channel-option"><input type="checkbox" name="channelChoice" value="Rappi" /> Rappi</label>
          <label class="channel-option"><input type="checkbox" name="channelChoice" value="MercadoLibre" /> MercadoLibre</label>
        </div>

        <div class="field">
          <label for="appSecret">APP Secret (Authorization)</label>
          <input id="appSecret" name="appSecret" type="password" placeholder="Ingresá tu APP_SECRET" required />
        </div>

        <input id="channelInput" type="hidden" name="channel" value="PedidosYa" />

        <button type="submit">Procesar archivo</button>
        <p class="note">La UI envía la petición con header <code>Authorization</code> automáticamente.</p>
        <div id="result"></div>
      </form>
    </div>

    <script>
      const form = document.getElementById('uploadForm');
      const fileInput = document.getElementById('fileInput');
      const filename = document.getElementById('filename');
      const dropzone = document.getElementById('dropzone');
      const channelInput = document.getElementById('channelInput');
      const appSecretInput = document.getElementById('appSecret');
      const resultEl = document.getElementById('result');
      const checkboxes = Array.from(document.querySelectorAll('input[name="channelChoice"]'));

      const updateFilename = () => {
        filename.textContent = fileInput.files && fileInput.files[0] ? 'Archivo: ' + fileInput.files[0].name : '';
      };

      fileInput.addEventListener('change', updateFilename);

      dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.classList.add('active');
      });

      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('active'));

      dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropzone.classList.remove('active');
        if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
          fileInput.files = event.dataTransfer.files;
          updateFilename();
        }
      });

      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            checkboxes.forEach((other) => {
              if (other !== checkbox) other.checked = false;
            });
            channelInput.value = checkbox.value;
            return;
          }

          const checked = checkboxes.find((item) => item.checked);
          if (!checked) {
            checkbox.checked = true;
            channelInput.value = checkbox.value;
          }
        });
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const appSecret = appSecretInput.value.trim();
        if (!appSecret) {
          resultEl.textContent = 'Debes ingresar APP_SECRET.';
          return;
        }

        const formData = new FormData(form);

        try {
          const response = await fetch('/upload', {
            method: 'POST',
            headers: {
              Authorization: appSecret
            },
            body: formData
          });

          const payload = await response.json();
          resultEl.textContent = JSON.stringify(payload, null, 2);
        } catch (error) {
          resultEl.textContent = error instanceof Error ? error.message : 'Error inesperado';
        }
      });
    </script>
  </body>
</html>`;

const getAuthToken = (req: Request): string | undefined => {
  const headerAuth = req.header("Authorization");
  if (headerAuth) {
    return headerAuth;
  }

  if (typeof req.body?.appSecret === "string") {
    return req.body.appSecret;
  }

  return undefined;
};

export const uploadRouter = Router();

uploadRouter.get("/upload", (_req: Request, res: Response) => {
  res.type("html").send(renderUploadPage());
});

uploadRouter.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  const startedAt = Date.now();

  try {
    const authToken = getAuthToken(req);

    if (!authToken || authToken !== process.env.APP_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "XLSX file is required in form-data key 'file'" });
    }

    const channel = String(req.body.channel || "PedidosYa");
    const parser = getParser(channel);
    const parseResult = await parser.parse(req.file.buffer);

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

    await sheetsService.appendOrders(orders);

    return res.json({
      inserted: orders.length,
      duplicates,
      unknownProducts: [],
      timeMs: Date.now() - startedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message.includes("Unsupported channel parser") ? 400 : 500;

    return res.status(status).json({
      message,
      inserted: 0,
      duplicates: [],
      unknownProducts: [],
      timeMs: Date.now() - startedAt
    });
  }
});
