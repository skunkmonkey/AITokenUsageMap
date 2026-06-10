import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, "../..");

const userHome = os.homedir() || process.env.USERPROFILE || process.env.HOME || "";
const codexHome = process.env.CODEX_HOME || (userHome ? path.join(userHome, ".codex") : "");

const pathList = (value: string | undefined): string[] => (
  value?.split(path.delimiter).map((item) => item.trim()).filter(Boolean) ?? []
);

export const defaultCopilotRootsFor = (
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home = userHome
): string[] => {
  const productDirs = ["Code", "Code - Insiders", "VSCodium"];
  let configRoot = "";

  if (platform === "win32") {
    configRoot = env.APPDATA || (home ? path.join(home, "AppData", "Roaming") : "");
  } else if (platform === "darwin") {
    configRoot = home ? path.join(home, "Library", "Application Support") : "";
  } else {
    configRoot = env.XDG_CONFIG_HOME || (home ? path.join(home, ".config") : "");
  }

  return configRoot ? productDirs.map((productDir) => path.join(configRoot, productDir, "User", "workspaceStorage")) : [];
};

const copilotRootsOverride = pathList(process.env.COPILOT_USAGE_ROOTS);

export const appConfig = {
  port: Number(process.env.CODEX_USAGE_PORT || 5174),
  timezone: process.env.CODEX_USAGE_TZ || "America/Denver",
  codexRoots: [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions")
  ],
  copilotRoots: copilotRootsOverride.length > 0 ? copilotRootsOverride : defaultCopilotRootsFor(),
  cachePath: path.join(repoRoot, ".cache", "ai-token-usage", "index.json")
};
