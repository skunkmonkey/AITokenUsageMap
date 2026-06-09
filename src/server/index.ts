import cors from "cors";
import express from "express";
import type { HarnessId } from "../shared/types";
import { appConfig } from "./config";
import { getConfig, getDay, getSummary, scanAllLogs } from "./scanner";

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
    <p>This is the API server. Open the dashboard URL printed by Vite in your terminal.</p>
    <p>In the default setup that is usually <a href="http://127.0.0.1:5173/">http://127.0.0.1:5173/</a>, but Vite may move to another port if that one is busy.</p>
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
  console.log(`AI token usage API listening on http://127.0.0.1:${appConfig.port}`);
});
