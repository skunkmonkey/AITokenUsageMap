import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../..");

const userHome = process.env.USERPROFILE || process.env.HOME || "";
const codexHome = process.env.CODEX_HOME || (userHome ? path.join(userHome, ".codex") : "");

export const appConfig = {
  port: Number(process.env.CODEX_USAGE_PORT || 5174),
  timezone: process.env.CODEX_USAGE_TZ || "America/Denver",
  codexRoots: [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions")
  ],
  cachePath: path.join(repoRoot, ".cache", "codex-token-usage", "index.json")
};
