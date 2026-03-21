import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSourceRegistry, summarizeSourceRegistry } from "./source-registry.js";

describe("source registry", () => {
  it("loads the bundled curated registry", async () => {
    const registryPath = fileURLToPath(
      new URL("../references/source-registry.yaml", import.meta.url),
    );
    const registry = await loadSourceRegistry(registryPath);
    const summary = summarizeSourceRegistry(registry);

    expect(registry.sources.length).toBeGreaterThan(0);
    expect(summary.totalSources).toBe(registry.sources.length);
    expect(summary.enabledSources).toBeGreaterThan(0);
    expect(summary.byTier.tier1_official).toBeGreaterThan(0);
  });

  it("rejects registries without valid sources", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ads-registry-"));
    const filePath = path.join(dir, "empty.yaml");
    await fs.writeFile(
      filePath,
      ["version: 1", "id: invalid-registry", "name: Invalid Registry", "sources: []"].join("\n"),
      "utf8",
    );

    await expect(loadSourceRegistry(filePath)).rejects.toThrow(/no valid sources/i);
  });
});
