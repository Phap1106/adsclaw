import type { Command } from "commander";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { loadAssistantContext, runAssistantSync } from "./assistant.js";
import type { AdsManagerPluginConfig } from "./types.js";
import {
  renderAlerts,
  renderBudget,
  renderCompetitors,
  renderOverview,
  renderPlan,
  renderProposals,
  renderReport,
  renderSyncResult,
} from "./ui.js";

function printReply(text: string): void {
  // eslint-disable-next-line no-console
  console.log(text);
}

async function loadContext(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig) {
  return await loadAssistantContext({
    runtime: api.runtime,
    logger: api.logger,
    pluginConfig,
  });
}

export function registerAdsManagerCli(params: {
  api: OpenClawPluginApi;
  program: Command;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, program, pluginConfig } = params;
  const root = program
    .command("ads-manager")
    .description("Local utilities for the ads campaign manager plugin")
    .addHelpText(
      "after",
      () =>
        "\nTelegram commands: /baocao /tongquan /canhbao /ngansach /kehoach /de_xuat /doithu /dongbo\n",
    );

  root
    .command("report")
    .description("Print the current ads report")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderReport(context).text);
    });

  root
    .command("overview")
    .description("Print account overview")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderOverview(context).text);
    });

  root
    .command("alerts")
    .description("Print current alerts")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderAlerts(context).text);
    });

  root
    .command("budget")
    .description("Print budget pacing")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderBudget(context).text);
    });

  root
    .command("plan")
    .description("Print daily plan")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderPlan(context).text);
    });

  root
    .command("proposals")
    .description("Print proposal list")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderProposals(context).text);
    });

  root
    .command("competitors")
    .description("Print competitor notes")
    .action(async () => {
      const context = await loadContext(api, pluginConfig);
      printReply(renderCompetitors(context).text);
    });

  root
    .command("sync")
    .description("Force a local assistant sync")
    .action(async () => {
      const context = await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      printReply(renderSyncResult(context).text);
    });
}
