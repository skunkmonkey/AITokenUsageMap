import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultCopilotRootsFor } from "./config";

const rootsFor = (platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string) => (
  defaultCopilotRootsFor(platform, env, home)
);

describe("defaultCopilotRootsFor", () => {
  it("uses APPDATA for Windows VS Code storage roots", () => {
    expect(rootsFor("win32", { APPDATA: path.join("C:", "Users", "dev", "AppData", "Roaming") }, path.join("C:", "Users", "dev"))).toEqual([
      path.join("C:", "Users", "dev", "AppData", "Roaming", "Code", "User", "workspaceStorage"),
      path.join("C:", "Users", "dev", "AppData", "Roaming", "Code - Insiders", "User", "workspaceStorage"),
      path.join("C:", "Users", "dev", "AppData", "Roaming", "VSCodium", "User", "workspaceStorage")
    ]);
  });

  it("uses Library/Application Support for macOS VS Code storage roots", () => {
    expect(rootsFor("darwin", {}, path.join("Users", "dev"))).toEqual([
      path.join("Users", "dev", "Library", "Application Support", "Code", "User", "workspaceStorage"),
      path.join("Users", "dev", "Library", "Application Support", "Code - Insiders", "User", "workspaceStorage"),
      path.join("Users", "dev", "Library", "Application Support", "VSCodium", "User", "workspaceStorage")
    ]);
  });

  it("uses XDG_CONFIG_HOME for Linux VS Code storage roots", () => {
    expect(rootsFor("linux", { XDG_CONFIG_HOME: path.join("home", "dev", ".xdg-config") }, path.join("home", "dev"))).toEqual([
      path.join("home", "dev", ".xdg-config", "Code", "User", "workspaceStorage"),
      path.join("home", "dev", ".xdg-config", "Code - Insiders", "User", "workspaceStorage"),
      path.join("home", "dev", ".xdg-config", "VSCodium", "User", "workspaceStorage")
    ]);
  });

  it("falls back to ~/.config for Linux VS Code storage roots", () => {
    expect(rootsFor("linux", {}, path.join("home", "dev"))).toEqual([
      path.join("home", "dev", ".config", "Code", "User", "workspaceStorage"),
      path.join("home", "dev", ".config", "Code - Insiders", "User", "workspaceStorage"),
      path.join("home", "dev", ".config", "VSCodium", "User", "workspaceStorage")
    ]);
  });
});
