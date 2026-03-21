import fs from "node:fs/promises";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";

export const ADS_MANAGER_PLUGIN_STATE_DIR = path.join("plugins", "ads-campaign-manager");

export function resolveAdsManagerStateDir(runtime: PluginRuntime): string {
  return path.join(runtime.state.resolveStateDir(), ADS_MANAGER_PLUGIN_STATE_DIR);
}

export async function ensureAdsManagerStateDir(runtime: PluginRuntime): Promise<string> {
  const dirPath = resolveAdsManagerStateDir(runtime);
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function readJsonFile(filePath: string): Promise<unknown | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}
