import dotenv from "dotenv";
import express from "express";
import { uploadRouter } from "./routes/upload";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(uploadRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`SmashETL running on port ${port}`);
});
