import cors from "cors";
import express from "express";
import type { HarnessId } from "../shared/types";
import { appConfig } from "./config";
import { getPricingForModels, setManualPricing } from "./pricing";
import { getConfig, getDay, getModelUsageRange, getSummary, scanAllLogs } from "./scanner";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>AI Token Usage API</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 32px; color: #1f2933; }
      code { background: #f0f3f6; padding: 2px 5px; border-radius: 4px; }
      a { color: #0969da; }
    </style>
  </head>
  <body>
    <h1>AI Token Usage API</h1>
    <p>This is the API server for the dashboard. It is not the page you normally open in your browser.</p>
    <p>Open the dashboard URL printed by the <code>[WEB]</code> Vite process in your terminal. In the default setup that is usually <a href="http://127.0.0.1:5173/">http://127.0.0.1:5173/</a>, but Vite may move to another port if that one is busy.</p>
    <p>Useful API endpoint: <a href="/api/summary"><code>/api/summary</code></a></p>
  </body>
</html>`);
});

app.get("/api/config", async (_req, res, next) => {
  try {
    res.json(await getConfig());
  } catch (error) {
    next(error);
  }
});

app.get("/api/summary", async (req, res, next) => {
  try {
    res.json(await getSummary(req.query.from as string | undefined, req.query.to as string | undefined));
  } catch (error) {
    next(error);
  }
});

app.get("/api/day/:harness/:date", async (req, res, next) => {
  try {
    res.json(await getDay(req.params.harness as HarnessId, req.params.date));
  } catch (error) {
    next(error);
  }
});

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isValidIsoDate = (value: string): boolean => {
  if (!isoDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

app.get("/api/model-usage", async (req, res, next) => {
  try {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      res.status(400).json({ error: "from and to must be YYYY-MM-DD dates." });
      return;
    }
    if (to < from) {
      res.status(400).json({ error: "to must be on or after from." });
      return;
    }
    res.json(await getModelUsageRange(from, to));
  } catch (error) {
    next(error);
  }
});

app.get("/api/pricing", async (req, res, next) => {
  try {
    const modelQuery = req.query.model;
    const models = Array.isArray(modelQuery)
      ? modelQuery.flatMap((model) => String(model).split(","))
      : String(modelQuery ?? "").split(",");
    res.json(getPricingForModels(models));
  } catch (error) {
    next(error);
  }
});

app.put("/api/pricing", async (req, res, next) => {
  try {
    res.json(setManualPricing(req.body));
  } catch (error) {
    next(error);
  }
});

app.post("/api/rescan", async (_req, res, next) => {
  try {
    res.json(await scanAllLogs(true));
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
});

app.listen(appConfig.port, "127.0.0.1", () => {
  console.log(`AI token usage API ready at http://127.0.0.1:${appConfig.port} (backend only; open the [WEB] Vite dashboard URL, usually http://127.0.0.1:5173/)`);
});
