// import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
// import { runAssistantSync } from "./src/assistant.js";
// import { registerAdsManagerCli } from "./src/cli.js";
// import { registerAdsManagerCommands } from "./src/commands.js";
// import { resolveAdsManagerPluginConfig } from "./src/config.js";
// import { createMetaWebhookHandler } from "./src/meta-webhook.js";
// import { syncTelegramBotProfile } from "./src/telegram-profile.js";
// import { createAdsManagerTool } from "./src/tool.js";

// const plugin = {
//   id: "ads-campaign-manager",
//   name: "Ads Campaign Manager",
//   description:
//     "Telegram-first ads assistant with governed learning sources, Meta live sync, webhooks, and approval-safe proposals.",
//   register(api: OpenClawPluginApi) {
//     const pluginConfig = resolveAdsManagerPluginConfig({
//       pluginConfig: api.pluginConfig,
//       workspaceDir: undefined,
//     });

//     const tools = createAdsManagerTool({ api, pluginConfig });
//     for (const tool of tools) {
//       api.registerTool(tool);
//     }
//     registerAdsManagerCommands({ api, pluginConfig });
//     api.registerCli(
//       ({ program }) =>
//         registerAdsManagerCli({
//           api,
//           program,
//           pluginConfig,
//         }),
//       { commands: ["ads-manager"] },
//     );

//     const runSync = async () => {
//       await runAssistantSync({
//         runtime: api.runtime,
//         logger: api.logger,
//         pluginConfig,
//       });
//     };

//     if (pluginConfig.meta.enabled) {
//       api.registerHttpRoute({
//         path: pluginConfig.meta.webhookPath,
//         auth: "plugin",
//         match: "exact",
//         handler: createMetaWebhookHandler({
//           runtime: api.runtime,
//           logger: api.logger,
//           pluginConfig,
//           onWebhookSync: runSync,
//         }),
//       });
//     }

//     let intervalHandle: ReturnType<typeof setInterval> | undefined;
//     api.registerService({
//       id: "ads-campaign-manager-sync",
//       start: async () => {
//         if (intervalHandle) {
//           clearInterval(intervalHandle);
//           intervalHandle = undefined;
//         }

//         // Run background initialization (sync + telegram profile)
//         void (async () => {
//           try {
//             await runSync();
//             await syncTelegramBotProfile({
//               config: api.config,
//               runtime: api.runtime,
//               logger: api.logger,
//               pluginConfig,
//             });
//           } catch (error) {
//             api.logger.warn(
//               `[ads-campaign-manager] Background initialization failed: ${error instanceof Error ? error.message : String(error)}`,
//             );
//           }

//           const intervalMs = pluginConfig.refreshIntervalMinutes * 60 * 1000;
//           intervalHandle = setInterval(() => {
//             void runSync().catch((error) => {
//               api.logger.warn(
//                 `[ads-campaign-manager] scheduled sync failed: ${error instanceof Error ? error.message : String(error)}`,
//               );
//             });
//           }, intervalMs);
//           intervalHandle.unref?.();
//         })();
//       },
//       stop: async () => {
//         if (intervalHandle) {
//           clearInterval(intervalHandle);
//           intervalHandle = undefined;
//         }
//       },
//     });
//   },
// };

// export default plugin;
















import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { runAssistantSync } from "./src/assistant.js";
import { registerAdsManagerCli } from "./src/cli.js";
import { registerAdsManagerCommands } from "./src/commands.js";
import { resolveAdsManagerPluginConfig } from "./src/config.js";
import { createMetaWebhookHandler } from "./src/meta-webhook.js";
import { syncTelegramBotProfile } from "./src/telegram-profile.js";
import { createAdsManagerTool } from "./src/tool.js";

// ─── Startup Diagnostics ─────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function logStartup(msg: string) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] [ads-campaign-manager] ${msg}`);
}

function diagnoseSkillsFolder(): void {
  const skillsDir = path.resolve(__dirname, "skills");
  logStartup(`=== STARTUP DIAGNOSIS ===`);
  logStartup(`Plugin dir: ${__dirname}`);
  logStartup(`Skills dir: ${skillsDir}`);

  if (!fs.existsSync(skillsDir)) {
    logStartup(`❌ SKILLS FOLDER NOT FOUND at ${skillsDir}`);
    return;
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skillFolders = entries.filter(e => e.isDirectory());
  logStartup(`✅ Skills folder found — ${skillFolders.length} skill(s) detected:`);

  for (const folder of skillFolders) {
    const skillMdPath = path.join(skillsDir, folder.name, "SKILL.md");
    const exists = fs.existsSync(skillMdPath);
    logStartup(`  ${exists ? "✅" : "❌"} ${folder.name} ${exists ? "(SKILL.md OK)" : "(SKILL.md MISSING!)"}`);
  }
}

function diagnoseEnvVars(): void {
  logStartup(`=== ENV VAR DIAGNOSIS ===`);

  const checks = [
    { key: "APIFY_TOKEN", tool: "apify_facebook_ads" },
    { key: "SERPER_API_KEY", tool: "serper_search" },
    { key: "META_ACCESS_TOKEN", tool: "meta_ad_library (enhanced)" },
  ];

  for (const { key, tool } of checks) {
    const val = process.env[key];
    if (val && val.trim()) {
      logStartup(`  ✅ ${key} found (${val.slice(0, 8)}...) → ${tool} will work`);
    } else {
      logStartup(`  ❌ ${key} NOT SET → ${tool} will fail`);
    }
  }
}

function diagnosePluginConfig(pluginConfig: ReturnType<typeof resolveAdsManagerPluginConfig>): void {
  logStartup(`=== PLUGIN CONFIG DIAGNOSIS ===`);
  logStartup(`  safeMode: ${pluginConfig.safeMode}`);
  logStartup(`  syncMode: ${pluginConfig.syncMode}`);
  logStartup(`  meta.enabled: ${pluginConfig.meta.enabled}`);
  logStartup(`  intelligence.apify.enabled: ${pluginConfig.intelligence?.apify?.enabled ?? false}`);
  logStartup(`  intelligence.search.enabled: ${pluginConfig.intelligence?.search?.enabled ?? false}`);
  logStartup(`  intelligence.scrape.enabled: ${pluginConfig.intelligence?.scrape?.enabled ?? false}`);

  // Check Apify token resolution
  const apifyToken =
    pluginConfig.intelligence?.apify?.apiToken ||
    (pluginConfig.intelligence?.apify?.apiTokenEnvVar &&
      process.env[pluginConfig.intelligence.apify.apiTokenEnvVar ?? ""]);
  logStartup(`  Apify token (from config): ${apifyToken ? "✅ found" : "❌ not found"}`);

  // Check Serper key resolution
  const serperKey =
    pluginConfig.intelligence?.search?.apiKey ||
    (pluginConfig.intelligence?.search?.apiKeyEnvVar &&
      process.env[pluginConfig.intelligence.search.apiKeyEnvVar ?? ""]);
  logStartup(`  Serper key (from config): ${serperKey ? "✅ found" : "❌ not found"}`);

  if (pluginConfig.intelligence?.apify?.enabled === false) {
    logStartup(`  ⚠️  intelligence.apify.enabled=false → ads_manager_analyze_ads will throw error`);
    logStartup(`  ℹ️  apify_facebook_ads (direct env) still works if APIFY_TOKEN is set`);
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

const plugin = {
  id: "ads-campaign-manager",
  name: "Ads Campaign Manager",
  description:
    "Telegram-first ads assistant with governed learning sources, Meta live sync, webhooks, and approval-safe proposals.",
  register(api: OpenClawPluginApi) {
    const pluginConfig = resolveAdsManagerPluginConfig({
      pluginConfig: api.pluginConfig,
      workspaceDir: undefined,
    });

    // ── Run all diagnostics at startup ──
    diagnoseSkillsFolder();
    diagnoseEnvVars();
    diagnosePluginConfig(pluginConfig);
    logStartup(`=== PLUGIN REGISTERED — tools loading... ===`);

    const tools = createAdsManagerTool({ api, pluginConfig });
    logStartup(`✅ ${tools.length} tools registered:`);
    for (const tool of tools) {
      logStartup(`  - ${tool.name}`);
      api.registerTool(tool);
    }

    registerAdsManagerCommands({ api, pluginConfig });
    logStartup(`✅ Commands registered`);

    api.registerCli(
      ({ program }) =>
        registerAdsManagerCli({
          api,
          program,
          pluginConfig,
        }),
      { commands: ["ads-manager"] },
    );

    const runSync = async () => {
      await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
    };

    if (pluginConfig.meta.enabled) {
      api.registerHttpRoute({
        path: pluginConfig.meta.webhookPath,
        auth: "plugin",
        match: "exact",
        handler: createMetaWebhookHandler({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
          onWebhookSync: runSync,
        }),
      });
      logStartup(`✅ Meta webhook registered at ${pluginConfig.meta.webhookPath}`);
    }

    let intervalHandle: ReturnType<typeof setInterval> | undefined;
    api.registerService({
      id: "ads-campaign-manager-sync",
      start: async () => {
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = undefined;
        }

        void (async () => {
          try {
            await runSync();
            await syncTelegramBotProfile({
              config: api.config,
              runtime: api.runtime,
              logger: api.logger,
              pluginConfig,
            });
          } catch (error) {
            api.logger.warn(
              `[ads-campaign-manager] Background initialization failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }

          const intervalMs = pluginConfig.refreshIntervalMinutes * 60 * 1000;
          intervalHandle = setInterval(() => {
            void runSync().catch((error) => {
              api.logger.warn(
                `[ads-campaign-manager] scheduled sync failed: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
          }, intervalMs);
          intervalHandle.unref?.();
        })();
      },
      stop: async () => {
        if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = undefined;
        }
      },
    });

    logStartup(`=== STARTUP COMPLETE ===`);
  },
};

export default plugin;
