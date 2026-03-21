import { describe, expect, it } from "vitest";
import { buildDerivedAssistantView } from "./analysis.js";
import type { AdsManagerPluginConfig, AdsSnapshot, AssistantState } from "./types.js";

const config: AdsManagerPluginConfig = {
  locale: "vi",
  safeMode: true,
  refreshIntervalMinutes: 15,
  syncMode: "snapshot",
  sourceRegistryPath: "registry.yaml",
  business: {
    name: "Boss Store",
    industry: "Health & Wellness",
    ownerName: "Boss",
    primaryObjective: "Scale profitable campaigns safely",
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
    description: "Senior ads assistant",
    shortDescription: "Ads assistant",
    syncBotProfile: true,
    showDashboardButtons: true,
    maxProposalButtons: 3,
  },
  meta: {
    enabled: false,
    graphVersion: "v24.0",
    insightsDatePreset: "today",
    campaignLimit: 250,
    webhookPath: "/webhook",
    syncOnWebhook: true,
  },
  execution: {
    enableMetaWrites: false,
    scaleUpMultiplier: 1.15,
    scaleDownMultiplier: 0.85,
    minimumBudget: 100000,
  },
};

const state: AssistantState = {
  version: 1,
  proposals: [],
  instructions: [],
};

describe("ads campaign analysis", () => {
  it("classifies winners, risks, proposals, and budget without double counting", () => {
    const snapshot: AdsSnapshot = {
      generatedAt: "2026-03-16T08:30:00.000Z",
      account: {
        name: "Boss Store",
        spendToday: 2900000,
        budgetToday: 6000000,
      },
      campaigns: [
        {
          id: "winner_1",
          name: "Winner Campaign",
          status: "active",
          spendToday: 1500000,
          budget: 1800000,
          roas: 3.1,
          ctr: 0.021,
          cpa: 140000,
          learningPhase: false,
        },
        {
          id: "risk_1",
          name: "Risk Campaign",
          status: "active",
          spendToday: 1200000,
          budget: 1000000,
          roas: 1.1,
          ctr: 0.01,
          cpa: 320000,
          learningPhase: false,
        },
        {
          id: "watch_1",
          name: "Watch Campaign",
          status: "active",
          spendToday: 200000,
          budget: 700000,
          roas: 2.0,
          ctr: 0.016,
          cpa: 180000,
          learningPhase: true,
        },
      ],
      competitors: [
        {
          name: "Alpha Beauty",
          angle: "UGC bundle offer",
        },
      ],
    };

    const derived = buildDerivedAssistantView({
      snapshot,
      state,
      config,
    });

    expect(derived.budget.spendToday).toBe(2900000);
    expect(derived.budget.overspending).toBe(false);
    expect(derived.winners).toHaveLength(1);
    expect(derived.winners[0]?.campaign.id).toBe("winner_1");
    expect(derived.atRisk).toHaveLength(1);
    expect(derived.atRisk[0]?.campaign.id).toBe("risk_1");
    expect(derived.watchlist).toHaveLength(1);
    expect(derived.watchlist[0]?.campaign.id).toBe("watch_1");
    expect(derived.generatedProposals.map((proposal) => proposal.id)).toEqual(
      expect.arrayContaining(["tangngansach_winner-1", "giamngansach_risk-1", "lammoiads_risk-1"]),
    );
    expect(derived.alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining(["cpa_risk_1", "pacing_risk_1"]),
    );
    expect(derived.alerts.map((alert) => alert.id)).not.toContain("account_budget_pacing");
    expect(derived.dailyTasks.length).toBeGreaterThan(0);
  });

  it("creates a setup proposal when no snapshot is available", () => {
    const derived = buildDerivedAssistantView({
      snapshot: null,
      state,
      config,
    });

    expect(derived.health).toBe("watch");
    expect(derived.alerts[0]?.id).toBe("no_snapshot");
    expect(derived.generatedProposals[0]?.id).toBe("setup_snapshot_general");
  });
});
