import { runAssistantSync } from "./extensions/ads-campaign-manager/src/assistant.js";
import { resolveAdsManagerPluginConfig } from "./extensions/ads-campaign-manager/src/config.js";
import { loadConfig } from "./src/config/config.js";
import { createPluginRuntime } from "./src/plugins/runtime/index.js";
import { createSubsystemLogger } from "./src/logging/subsystem.js";

async function main() {
  const config = loadConfig();
  const pluginConfigRaw = config.plugins?.entries?.["ads-campaign-manager"]?.config;
  
  const pluginConfig = resolveAdsManagerPluginConfig({
    pluginConfig: pluginConfigRaw,
  });

  const runtime = createPluginRuntime();
  const logger = createSubsystemLogger("ads-manager-test");

  console.log("Starting manual sync test...");
  const context = await runAssistantSync({
    runtime,
    logger,
    pluginConfig,
  });

  console.log("Manual sync completed.");
  console.log("Last sync at:", context.state.lastSyncAt);
  console.log("Last AI analysis at:", context.state.lastAiAnalysisAt);
  console.log("Proposals count:", context.state.proposals.length);
  if (context.warnings.length > 0) {
    console.warn("Warnings:", context.warnings);
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
