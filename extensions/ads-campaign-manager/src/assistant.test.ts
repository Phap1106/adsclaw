import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { describe, expect, it } from "vitest";
import {
  acknowledgeInstruction,
  appendBossInstruction,
  loadAssistantContext,
  runAssistantSync,
  setProposalStatus,
} from "./assistant.js";
import type { AdsManagerPluginConfig } from "./types.js";

function createRuntime(stateDir: string): PluginRuntime {
  return {
    state: {
      resolveStateDir: () => stateDir,
    },
  } as PluginRuntime;
}

const logger = {
  info() {},
  warn() {},
  error() {},
};

async function createPluginConfig(): Promise<AdsManagerPluginConfig> {
  return {
    locale: "vi",
    safeMode: true,
    syncMode: "snapshot",
    refreshIntervalMinutes: 15,
    snapshotPath: path.resolve("extensions/ads-campaign-manager/references/snapshot.example.json"),
    sourceRegistryPath: path.resolve(
      "extensions/ads-campaign-manager/references/source-registry.yaml",
    ),
    business: {
      name: "Boss Store Vietnam",
      industry: "Retail",
      ownerName: "Sếp",
      primaryObjective: "Scale profitable purchase campaigns safely",
      currency: "VND",
      timezone: "Asia/Ho_Chi_Minh",
    },
    thresholds: {
      minCtr: 0.012,
      maxCpa: 250000,
      minRoas: 1.5,
      scaleRoas: 2.6,
      minSpendForDecision: 300000,
      budgetPacingTolerance: 1.15,
    },
    telegram: {
      showDashboardButtons: true,
      maxProposalButtons: 3,
      syncBotProfile: true,
      description: "Test bot",
      shortDescription: "Test bot",
    },
    meta: {
      enabled: false,
      syncOnWebhook: false,
      graphVersion: "v22.0",
      insightsDatePreset: "today",
      campaignLimit: 250,
      webhookPath: "/webhooks/meta-ads",
    },
    execution: {
      enableMetaWrites: false,
      scaleUpMultiplier: 1.15,
      scaleDownMultiplier: 0.85,
      minimumBudget: 100000,
    },
    intelligence: {
      search: { enabled: false, provider: "serper" },
      scrape: { enabled: false, provider: "fetch" },
      apify: { enabled: false },
    },
  };
}

describe("assistant state flow", () => {
  it("syncs snapshot data and persists proposal approval state", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ads-manager-state-"));
    const runtime = createRuntime(stateDir);
    const pluginConfig = await createPluginConfig();

    const syncContext = await runAssistantSync({
      runtime,
      logger,
      pluginConfig,
    });

    expect(syncContext.snapshot?.campaigns.length).toBe(3);
    expect(syncContext.state.proposals.length).toBeGreaterThan(0);

    const proposalId = syncContext.state.proposals[0]?.id;
    expect(proposalId).toBeTruthy();

    await setProposalStatus({
      runtime,
      logger,
      pluginConfig,
      proposalId: proposalId ?? "",
      status: "approved",
    });

    const reloaded = await loadAssistantContext({
      runtime,
      logger,
      pluginConfig,
    });
    expect(reloaded.state.proposals.find((proposal) => proposal.id === proposalId)?.status).toBe(
      "approved",
    );
  });

  it("tracks and acknowledges boss instructions", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ads-manager-state-"));
    const runtime = createRuntime(stateDir);
    const pluginConfig = await createPluginConfig();

    const appended = await appendBossInstruction({
      runtime,
      logger,
      pluginConfig,
      text: "Tăng tập trung vào nhóm retargeting hôm nay",
    });

    expect(appended.instruction.status).toBe("queued");

    const beforeAck = await loadAssistantContext({
      runtime,
      logger,
      pluginConfig,
    });
    expect(beforeAck.state.instructions[0]?.status).toBe("queued");
    expect(beforeAck.derived.alerts.map((alert) => alert.id)).toContain("pending_boss_instruction");

    const afterAck = await acknowledgeInstruction({
      runtime,
      logger,
      pluginConfig,
      instructionId: appended.instruction.id,
    });

    expect(
      afterAck.state.instructions.find((instruction) => instruction.id === appended.instruction.id)
        ?.status,
    ).toBe("acknowledged");
    expect(afterAck.derived.alerts.map((alert) => alert.id)).not.toContain(
      "pending_boss_instruction",
    );

    const finalContext = await loadAssistantContext({
      runtime,
      logger,
      pluginConfig,
    });
    expect(finalContext.derived.alerts.map((alert) => alert.id)).not.toContain(
      "pending_boss_instruction",
    );
  });
});
