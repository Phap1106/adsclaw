import type {
  AdsManagerPluginConfig,
  AdsSnapshot,
  AssistantState,
  BudgetSummary,
  CampaignSnapshot,
  DailyPoint,
  DerivedAlert,
  DerivedAssistantView,
  DerivedCampaignView,
  DerivedProposal,
  HealthLevel,
  ProposalImpact,
} from "./types.js";

function normalizeMetric(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeText(value: string | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function slugify(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 18);
  return normalized || fallback;
}

function proposalId(action: string, campaignId?: string): string {
  const suffix = slugify(campaignId ?? "general", "general");
  return `${action}_${suffix}`;
}

function rankHealth(level: HealthLevel): number {
  if (level === "risk") {
    return 3;
  }
  if (level === "watch") {
    return 2;
  }
  return 1;
}

function maxHealth(current: HealthLevel, next: HealthLevel): HealthLevel {
  return rankHealth(next) > rankHealth(current) ? next : current;
}

function sumCampaignSpend(snapshot: AdsSnapshot): number {
  return snapshot.campaigns.reduce(
    (sum, campaign) => sum + normalizeMetric(campaign.spendToday),
    0,
  );
}

function sumCampaignBudget(snapshot: AdsSnapshot): number {
  return snapshot.campaigns.reduce((sum, campaign) => sum + normalizeMetric(campaign.budget), 0);
}

function buildBudgetSummary(
  snapshot: AdsSnapshot | null,
  config: AdsManagerPluginConfig,
): BudgetSummary {
  if (!snapshot) {
    return {
      spendToday: 0,
      budgetToday: 0,
      utilization: 0,
      overspending: false,
    };
  }

  const accountSpend = normalizeMetric(snapshot.account?.spendToday);
  const campaignSpend = sumCampaignSpend(snapshot);
  const accountBudget = normalizeMetric(snapshot.account?.budgetToday);
  const campaignBudget = sumCampaignBudget(snapshot);

  const spendToday = accountSpend > 0 ? accountSpend : campaignSpend;
  const budgetToday = accountBudget > 0 ? accountBudget : campaignBudget;
  const utilization = budgetToday > 0 ? spendToday / budgetToday : 0;

  return {
    spendToday,
    budgetToday,
    utilization,
    overspending: budgetToday > 0 && utilization > config.thresholds.budgetPacingTolerance,
  };
}

function buildProposal(params: {
  action: string;
  impact: ProposalImpact;
  title: string;
  summary: string;
  reason: string;
  campaignId?: string;
}): DerivedProposal {
  const now = new Date().toISOString();
  const id = proposalId(params.action, params.campaignId);
  return {
    id,
    status: "pending",
    impact: params.impact,
    title: params.title,
    summary: params.summary,
    reason: params.reason,
    campaignId: params.campaignId,
    commandHint: `/pheduyet ${id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function pushUniqueProposal(target: DerivedProposal[], proposal: DerivedProposal): void {
  if (target.some((entry) => entry.id === proposal.id)) {
    return;
  }
  target.push(proposal);
}

function pushUniqueAlert(target: DerivedAlert[], alert: DerivedAlert): void {
  if (target.some((entry) => entry.id === alert.id)) {
    return;
  }
  target.push(alert);
}

function evaluateCampaign(params: {
  campaign: CampaignSnapshot;
  config: AdsManagerPluginConfig;
  alerts: DerivedAlert[];
  proposals: DerivedProposal[];
}): DerivedCampaignView {
  const { campaign, config, alerts, proposals } = params;
  const reasons: string[] = [];
  let health: HealthLevel = "good";

  const status = normalizeText(campaign.status, "unknown").toLowerCase();
  const spend = normalizeMetric(campaign.spendToday);
  const budget = normalizeMetric(campaign.budget);
  const roas = normalizeMetric(campaign.roas);
  const ctr = normalizeMetric(campaign.ctr);
  const cpa = normalizeMetric(campaign.cpa);

  if (status && status !== "active") {
    if (status.includes("disapproved") || status.includes("error")) {
      health = maxHealth(health, "risk");
      reasons.push(`Status ${status} needs urgent review.`);
      pushUniqueAlert(alerts, {
        id: `status_${campaign.id}`,
        severity: "high",
        title: `${campaign.name} gặp lỗi phân phối`,
        summary: `Trạng thái hiện tại là ${status}. Cần kiểm tra policy, billing hoặc creative.`,
        campaignId: campaign.id,
      });
    } else {
      health = maxHealth(health, "watch");
      reasons.push(`Status ${status} means the campaign is not fully scaling.`);
    }
  }

  if (campaign.learningPhase) {
    health = maxHealth(health, "watch");
    reasons.push("Campaign is in learning phase; avoid heavy edits.");
  }

  if (budget > 0 && spend > budget * config.thresholds.budgetPacingTolerance) {
    health = maxHealth(health, "risk");
    reasons.push("Spend pacing is above the allowed threshold.");
    pushUniqueAlert(alerts, {
      id: `pacing_${campaign.id}`,
      severity: "high",
      title: `${campaign.name} đang overspend`,
      summary: `Chi tiêu ${Math.round(spend)} vượt pacing cho budget ${Math.round(budget)}.`,
      campaignId: campaign.id,
    });
  }

  if (spend < config.thresholds.minSpendForDecision) {
    health = maxHealth(health, "watch");
    reasons.push("Spend is still below the minimum decision threshold.");
  } else {
    if (roas > 0 && roas < config.thresholds.minRoas) {
      health = maxHealth(health, "risk");
      reasons.push("ROAS is below the minimum acceptable level.");
      pushUniqueProposal(
        proposals,
        buildProposal({
          action: "giamngansach",
          impact: "high",
          title: `Giảm hoặc giữ budget cho ${campaign.name}`,
          summary: `ROAS hiện tại ${roas.toFixed(2)} thấp hơn ngưỡng ${config.thresholds.minRoas.toFixed(2)}.`,
          reason: "Need to stop waste before scaling.",
          campaignId: campaign.id,
        }),
      );
    }

    if (cpa > config.thresholds.maxCpa) {
      health = maxHealth(health, "risk");
      reasons.push("CPA is above the maximum acceptable threshold.");
      pushUniqueAlert(alerts, {
        id: `cpa_${campaign.id}`,
        severity: "medium",
        title: `${campaign.name} có CPA quá cao`,
        summary: `CPA ${Math.round(cpa)} đang vượt ngưỡng ${Math.round(config.thresholds.maxCpa)}.`,
        campaignId: campaign.id,
      });
    }

    if (ctr > 0 && ctr < config.thresholds.minCtr) {
      health = maxHealth(health, "watch");
      reasons.push("CTR is low and may indicate creative fatigue or weak hooks.");
      pushUniqueProposal(
        proposals,
        buildProposal({
          action: "lammoiads",
          impact: "medium",
          title: `Làm mới creative cho ${campaign.name}`,
          summary: `CTR ${ctr.toFixed(3)} đang thấp hơn ngưỡng ${config.thresholds.minCtr.toFixed(3)}.`,
          reason: "Creative refresh is safer than budget expansion.",
          campaignId: campaign.id,
        }),
      );
    }

    if (
      roas >= config.thresholds.scaleRoas &&
      ctr >= config.thresholds.minCtr &&
      !campaign.learningPhase &&
      status === "active"
    ) {
      reasons.push("Campaign is meeting scale criteria.");
      
      let scaleSummary = `ROAS ${roas.toFixed(2)} và CTR ${ctr.toFixed(3)} đang vượt ngưỡng scale.`;
      let scaleReason = "Strong efficiency with enough spend to scale safely.";
      
      if (campaign.historicalData && campaign.historicalData.length >= 7) {
        const prediction = calculateDiminishingReturns(campaign.historicalData, config.thresholds.minRoas, config.execution.scaleUpMultiplier || 1.2);
        const elasticity = prediction.elasticityFactor ?? 0;
        if (prediction.canScale) {
          scaleSummary += ` Dự báo ROAS sau khi tăng (theo mô hình Logarithmic) đạt ${prediction.predictedROAS.toFixed(2)} (vẫn trên target ${config.thresholds.minRoas}). `;
          scaleReason = `Căn cứ theo hệ số co giãn đa chiều (elasticity=${elasticity.toFixed(2)}) trên cửa sổ 14 ngày, việc tăng ngân sách vẫn đảm bảo hiệu quả sinh lời.`;
        } else {
          // If prediction says NO, we downgrade to "watch" and don't push a high-impact proposal
          health = maxHealth(health, "watch");
          reasons.push(`Dự báo điểm bão hòa (Scale Ceiling): Tăng ngân sách sẽ kéo ROAS xuống ${prediction.predictedROAS.toFixed(2)}, vi phạm ngưỡng hiệu quả.`);
          return { campaign, health, reasons }; // Skip the scaling proposal
        }
      } else if (campaign.historicalData && campaign.historicalData.length > 0) {
        reasons.push(`Dữ liệu lịch sử (${campaign.historicalData.length} ngày) chưa đủ tin cậy để dự báo Scale Ceiling (cần tối thiểu 7 ngày).`);
      }

      pushUniqueProposal(
        proposals,
        buildProposal({
          action: "tangngansach",
          impact: "high",
          title: `Tăng budget có kiểm soát cho ${campaign.name}`,
          summary: scaleSummary,
          reason: scaleReason,
          campaignId: campaign.id,
        }),
      );
    }
  }

  return {
    campaign,
    health,
    reasons,
  };
}

function compareCampaignViews(a: DerivedCampaignView, b: DerivedCampaignView): number {
  const healthDelta = rankHealth(b.health) - rankHealth(a.health);
  if (healthDelta !== 0) {
    return healthDelta;
  }
  return normalizeMetric(b.campaign.spendToday) - normalizeMetric(a.campaign.spendToday);
}

function buildDailyTasks(params: {
  alerts: DerivedAlert[];
  generatedProposals: DerivedProposal[];
  winners: DerivedCampaignView[];
  atRisk: DerivedCampaignView[];
  snapshot: AdsSnapshot | null;
}): string[] {
  const tasks: string[] = [];

  if (params.alerts.some((alert) => alert.severity === "high")) {
    tasks.push("Ưu tiên xử lý các cảnh báo mức cao trước 10h sáng.");
  }
  if (params.generatedProposals.length > 0) {
    tasks.push("Rà soát các đề xuất đang chờ duyệt và chốt lệnh cho bot.");
  }
  if (params.winners.length > 0) {
    tasks.push("Kiểm tra creative và landing page của nhóm thắng để chuẩn bị scale.");
  }
  if (params.atRisk.length > 0) {
    tasks.push("Đối chiếu pixel, tracking và funnel cho nhóm đang rủi ro.");
  }
  const latestCompetitor = params.snapshot?.competitors?.[0];
  if (latestCompetitor) {
    tasks.push(`Cập nhật note đối thủ từ ${latestCompetitor.name} vào playbook hôm nay.`);
  }
  if (tasks.length === 0) {
    tasks.push("Theo dõi nhịp chi tiêu và duy trì snapshot dữ liệu mới nhất.");
  }

  return tasks.slice(0, 5);
}

function maybeAddSnapshotMismatchAlert(params: {
  snapshot: AdsSnapshot;
  alerts: DerivedAlert[];
}): void {
  const accountSpend = normalizeMetric(params.snapshot.account?.spendToday);
  const campaignSpend = sumCampaignSpend(params.snapshot);
  if (accountSpend <= 0 || campaignSpend <= 0) {
    return;
  }
  const delta = Math.abs(accountSpend - campaignSpend);
  const baseline = Math.max(accountSpend, campaignSpend);
  if (baseline <= 0 || delta / baseline <= 0.05) {
    return;
  }
  pushUniqueAlert(params.alerts, {
    id: "snapshot_spend_mismatch",
    severity: "low",
    title: "Snapshot có chênh lệch spend giữa account và campaign",
    summary: `Account spend ${Math.round(accountSpend)} khác tổng campaign spend ${Math.round(campaignSpend)}. Hãy kiểm tra lại nguồn dữ liệu.`,
  });
}

export function buildDerivedAssistantView(params: {
  snapshot: AdsSnapshot | null;
  state: AssistantState;
  config: AdsManagerPluginConfig;
}): DerivedAssistantView {
  const { snapshot, state, config } = params;
  const alerts: DerivedAlert[] = [];
  const generatedProposals: DerivedProposal[] = [];
  const winners: DerivedCampaignView[] = [];
  const atRisk: DerivedCampaignView[] = [];
  const watchlist: DerivedCampaignView[] = [];
  const generatedAt = snapshot?.generatedAt ?? new Date().toISOString();

  if (!snapshot || snapshot.campaigns.length === 0) {
    const bootProposal = buildProposal({
      action: "setup_snapshot",
      impact: "high",
      title: "Kết nối snapshot dữ liệu ads",
      summary:
        "Chưa có dữ liệu campaign để trợ lý phân tích. Cần gắn snapshotPath hoặc data connector.",
      reason: "Assistant cannot make grounded recommendations without campaign data.",
    });

    return {
      generatedAt,
      health: "watch",
      alerts: [
        {
          id: "no_snapshot",
          severity: "high",
          title: "Chưa có dữ liệu ads đầu vào",
          summary: "Plugin đang chạy nhưng chưa thấy snapshot campaign hợp lệ.",
        },
      ],
      generatedProposals: [bootProposal],
      winners,
      atRisk,
      watchlist,
      dailyTasks: [
        "Khai báo snapshotPath hoặc hoàn thiện data connector Facebook Ads trước khi giao bot tự tư vấn.",
      ],
      budget: buildBudgetSummary(snapshot, config),
    };
  }

  for (const campaign of snapshot.campaigns) {
    const view = evaluateCampaign({
      campaign,
      config,
      alerts,
      proposals: generatedProposals,
    });
    if (view.health === "good") {
      winners.push(view);
    } else if (view.health === "risk") {
      atRisk.push(view);
    } else {
      watchlist.push(view);
    }
  }

  const budget = buildBudgetSummary(snapshot, config);
  if (budget.overspending) {
    pushUniqueAlert(alerts, {
      id: "account_budget_pacing",
      severity: "high",
      title: "Tài khoản đang chạy vượt pacing",
      summary: `Utilization hiện tại là ${(budget.utilization * 100).toFixed(1)}% so với budget ngày.`,
    });
  }

  maybeAddSnapshotMismatchAlert({ snapshot, alerts });

  if (state.instructions.some((instruction) => instruction.status === "queued")) {
    pushUniqueAlert(alerts, {
      id: "pending_boss_instruction",
      severity: "low",
      title: "Có lệnh mới từ sếp cần xử lý",
      summary: "Kiểm tra /lenh status hoặc xác nhận hoàn tất bằng /lenh ack <id>.",
    });
  }

  const health = alerts.some((alert) => alert.severity === "high")
    ? "risk"
    : atRisk.length > 0 || watchlist.length > 0
      ? "watch"
      : "good";

  return {
    generatedAt,
    health,
    alerts: alerts.sort((a, b) => a.id.localeCompare(b.id)),
    generatedProposals,
    winners: winners.toSorted(compareCampaignViews),
    atRisk: atRisk.toSorted(compareCampaignViews),
    watchlist: watchlist.toSorted(compareCampaignViews),
    dailyTasks: buildDailyTasks({
      alerts,
      generatedProposals,
      winners,
      atRisk,
      snapshot,
    }),
    budget,
  };
}

/**
 * Predictive Analytics: Diminishing Returns & Scale Ceiling
 * Calculates the inflection point where spending more budget will result in negative ROAS.
 */

export function calculateDiminishingReturns(
  historicalData: DailyPoint[], 
  targetROAS: number,
  proposedSpendMultiplier: number = 1.2
) {
  // Phase 25: Increased window to 14 days for commercial stability
  const MIN_DAYS = 7; 
  if (historicalData.length < MIN_DAYS) {
    return {
      canScale: false,
      reason: `Not enough historical data (< ${MIN_DAYS} days)`,
      predictedCPA: 0,
      predictedROAS: 0,
      elasticityFactor: 1.1
    };
  }

  // Use the last 14 days for analysis
  const data = [...historicalData]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-14);
  
  let totalSpendChange = 0;
  let totalCpaChange = 0;

  for (let i = 1; i < data.length; i++) {
    const spendDiff = (data[i].spend - data[i-1].spend) / Math.max(data[i-1].spend, 1);
    const cpaDiff = (data[i].cpa - data[i-1].cpa) / Math.max(data[i-1].cpa, 1);
    
    // Weight more recent days more heavily (Phase 25 improvement)
    const weight = 1 + (i / data.length);
    if (Math.abs(spendDiff) > 0.05) {
      totalSpendChange += (spendDiff * weight);
      totalCpaChange += (cpaDiff * weight);
    }
  }

  let elasticity = 1.1; 
  if (totalSpendChange > 0) {
    elasticity = totalCpaChange / totalSpendChange;
    // Elasticity capping to maintain model sanity
    elasticity = Math.max(0.5, Math.min(elasticity, 3.0));
  }

  const latest = data[data.length - 1];
  const predictedSpendDiff = proposedSpendMultiplier - 1.0;

  // --- Phase 25: Logarithmic S-Curve Modeling ---
  // A linear increase budget doesn't result in linear CPA increase; it accelerates.
  // Formula: NewCPA = OldCPA * (1 + ln(1 + spendDiff) * elasticity)
  const predictedCpaIncrease = Math.log(1 + predictedSpendDiff) * elasticity;
  const predictedCPA = latest.cpa * (1 + predictedCpaIncrease);
  
  const predictedROAS = latest.cpa > 0 ? latest.roas * (latest.cpa / predictedCPA) : 0;

  return {
    elasticityFactor: elasticity,
    currentCPA: latest.cpa,
    predictedCPA,
    currentROAS: latest.roas,
    predictedROAS,
    canScale: predictedROAS >= targetROAS,
    windowSize: data.length,
    reason: predictedROAS >= targetROAS 
      ? `Safe to scale. Predicted ROAS ${predictedROAS.toFixed(2)} (Log Model) is above target ${targetROAS}.`
      : `Diminishing returns hit. Logarithmic model predicts ROAS will drop to ${predictedROAS.toFixed(2)} at this scale.`
  };
}
