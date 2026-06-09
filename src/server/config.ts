import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../..");

const userHome = process.env.USERPROFILE || process.env.HOME || "";
const codexHome = process.env.CODEX_HOME || (userHome ? path.join(userHome, ".codex") : "");
const appData = process.env.APPDATA || (userHome ? path.join(userHome, "AppData", "Roaming") : "");

const pathList = (value: string | undefined): string[] => (
  value?.split(path.delimiter).map((item) => item.trim()).filter(Boolean) ?? []
);

const defaultCopilotRoots = appData ? [
  path.join(appData, "Code", "User", "workspaceStorage"),
  path.join(appData, "Code - Insiders", "User", "workspaceStorage"),
  path.join(appData, "VSCodium", "User", "workspaceStorage")
] : [];

export const appConfig = {
  port: Number(process.env.CODEX_USAGE_PORT || 5174),
  timezone: process.env.CODEX_USAGE_TZ || "America/Denver",
  codexRoots: [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions")
  ],
  copilotRoots: pathList(process.env.COPILOT_USAGE_ROOTS).length > 0 ? pathList(process.env.COPILOT_USAGE_ROOTS) : defaultCopilotRoots,
  cachePath: path.join(repoRoot, ".cache", "ai-token-usage", "index.json")
};
