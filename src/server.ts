import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { uploadRouter } from "./routes/upload";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(uploadRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ message: error.message });
  }

  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: "Unexpected error" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`SmashETL running on port ${port}`);
});
