import type {
  AssistantContext,
  CommandReply,
  DerivedAlert,
  DerivedCampaignView,
  DerivedProposal,
  TelegramButtons,
} from "./types.js";

const TELEGRAM_CALLBACK_LIMIT_BYTES = 64;

function fitsCallbackData(value: string): boolean {
  return Buffer.byteLength(value, "utf8") <= TELEGRAM_CALLBACK_LIMIT_BYTES;
}

function localeCode(locale: "vi" | "en"): string {
  return locale === "en" ? "en-US" : "vi-VN";
}

function formatMoney(value: number, context: AssistantContext): string {
  return new Intl.NumberFormat(localeCode(context.config.locale), {
    style: "currency",
    currency: context.config.business.currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(1)}%`;
}

function formatRoas(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "n/a";
  }
  return `${value.toFixed(2)}x`;
}

function formatDate(value: string | undefined, context: AssistantContext): string {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(localeCode(context.config.locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: context.config.business.timezone,
  }).format(date);
}

function healthLabel(level: AssistantContext["derived"]["health"]): string {
  if (level === "good") {
    return "Ổn định";
  }
  if (level === "watch") {
    return "Cần theo dõi";
  }
  return "Rủi ro";
}

function severityEmoji(severity: DerivedAlert["severity"]): string {
  if (severity === "high") {
    return "🔴";
  }
  if (severity === "medium") {
    return "🟠";
  }
  return "🟡";
}

function proposalEmoji(impact: DerivedProposal["impact"]): string {
  if (impact === "high") {
    return "🚀";
  }
  if (impact === "medium") {
    return "🧠";
  }
  return "📝";
}

function statusEmoji(status: DerivedProposal["status"]): string {
  if (status === "approved") {
    return "✅";
  }
  if (status === "rejected") {
    return "⛔";
  }
  return "⏳";
}

function summarizeCampaign(view: DerivedCampaignView, context: AssistantContext): string {
  const spend = formatMoney(view.campaign.spendToday ?? 0, context);
  return [
    `${view.campaign.name}`,
    `ROAS ${formatRoas(view.campaign.roas)} | CTR ${formatPercent(view.campaign.ctr)} | CPA ${formatMoney(view.campaign.cpa ?? 0, context)} | Spend ${spend}`,
    view.reasons[0] ?? "No extra notes.",
  ].join("\n");
}

function warningBlock(context: AssistantContext): string[] {
  if (context.warnings.length === 0) {
    return [];
  }
  return ["", "Cảnh báo hệ thống:", ...context.warnings.map((warning) => `- ${warning}`)];
}


function operationsBlock(context: AssistantContext): string[] {
  const lines = [
    "",
    `Data source: ${context.operations.dataSource}`,
    `Live writes: ${context.operations.liveWritesEnabled ? "on" : "off"}`,
  ];
  if (context.operations.webhookPath) {
    lines.push(`Meta webhook: ${context.operations.webhookPath}`);
  }
  if (context.operations.lastWebhookEventAt) {
    lines.push(
      `Webhook events: ${context.operations.recentWebhookEvents} | Last: ${formatDate(context.operations.lastWebhookEventAt, context)}`,
    );
  }
  return lines;
}
function safeModeBlock(context: AssistantContext): string[] {
  if (!context.config.safeMode) {
    return [];
  }
  return [
    "",
    "Safe mode:",
    "- Phê duyệt hiện chỉ cập nhật state nội bộ của trợ lý.",
    "- Chưa có thay đổi nào được đẩy sang nền tảng ads thật ở plugin này.",
  ];
}

export function buildDashboardButtons(context: AssistantContext): TelegramButtons | undefined {
  if (!context.config.telegram.showDashboardButtons) {
    return undefined;
  }

  const candidates: TelegramButtons = [
    [
      { text: "📊 Báo cáo", callback_data: "/baocao" },
      { text: "🩺 Tổng quan", callback_data: "/tongquan" },
    ],
    [
      { text: "🚨 Cảnh báo", callback_data: "/canhbao" },
      { text: "💸 Ngân sách", callback_data: "/ngansach" },
    ],
    [
      { text: "🗓️ Kế hoạch", callback_data: "/kehoach" },
      { text: "🧠 Đề xuất", callback_data: "/de_xuat" },
    ],
    [
      { text: "🕵️ Đối thủ", callback_data: "/doithu" },
      { text: "🫡 Lệnh", callback_data: "/lenh status" },
    ],
    [{ text: "🔄 Đồng bộ", callback_data: "/dongbo" }],
  ];

  const rows = candidates
    .map((row) => row.filter((button) => fitsCallbackData(button.callback_data)))
    .filter((row) => row.length > 0);
  return rows.length > 0 ? rows : undefined;
}

export function buildProposalButtons(context: AssistantContext): TelegramButtons | undefined {
  const pending = context.state.proposals
    .filter((proposal) => proposal.status === "pending")
    .slice(0, context.config.telegram.maxProposalButtons);

  if (pending.length === 0) {
    return undefined;
  }

  const rows: TelegramButtons = [];
  for (const proposal of pending) {
    const approve = `/pheduyet ${proposal.id}`;
    const reject = `/tuchoi ${proposal.id}`;
    if (!fitsCallbackData(approve) || !fitsCallbackData(reject)) {
      continue;
    }
    rows.push([
      { text: `✅ ${proposal.id}`, callback_data: approve },
      { text: `⛔ ${proposal.id}`, callback_data: reject },
    ]);
  }
  return rows.length > 0 ? rows : undefined;
}

function withButtons(text: string, buttons?: TelegramButtons): CommandReply {
  return buttons
    ? {
        text,
        channelData: {
          telegram: {
            buttons,
          },
        },
      }
    : { text };
}

export function renderReport(context: AssistantContext): CommandReply {
  const topRisk = context.derived.atRisk[0];
  const topWinner = context.derived.winners[0];
  const lines = [
    `🎯 ${context.config.business.name} | Báo cáo ads cho ${context.config.business.ownerName}`,
    `Mục tiêu chính: ${context.config.business.primaryObjective}`,
    `Tình trạng: ${healthLabel(context.derived.health)}`,
    `Cập nhật lúc: ${formatDate(context.derived.generatedAt, context)}`,
    "",
    `Ngân sách hôm nay: ${formatMoney(context.derived.budget.spendToday, context)} / ${formatMoney(context.derived.budget.budgetToday, context)}`,
    `Utilization: ${(context.derived.budget.utilization * 100).toFixed(1)}%`,
    `Cảnh báo: ${context.derived.alerts.length} | Đề xuất chờ duyệt: ${context.state.proposals.filter((proposal) => proposal.status === "pending").length}`,
  ];

  if (topRisk) {
    lines.push("", "Rủi ro nổi bật:", summarizeCampaign(topRisk, context));
  }
  if (topWinner) {
    lines.push("", "Điểm sáng nổi bật:", summarizeCampaign(topWinner, context));
  }
  lines.push("", "Việc hôm nay:", ...context.derived.dailyTasks.map((task) => `- ${task}`));

  const buttons = buildDashboardButtons(context);
  const proposalButtons = buildProposalButtons(context);
  const mergedButtons = proposalButtons ? [...(buttons ?? []), ...proposalButtons] : buttons;
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), mergedButtons);
}

export function renderOverview(context: AssistantContext): CommandReply {
  const lines = [
    `🩺 Tổng quan account ${context.snapshot?.account?.name ?? context.config.business.name}`,
    `Health: ${healthLabel(context.derived.health)}`,
    `Campaign thắng: ${context.derived.winners.length}`,
    `Campaign cần theo dõi: ${context.derived.watchlist.length}`,
    `Campaign rủi ro: ${context.derived.atRisk.length}`,
    `Nguồn học đã bật: ${context.registrySummary.enabledSources}/${context.registrySummary.totalSources}`,
    `Lần sync gần nhất: ${formatDate(context.state.lastSyncAt, context)}`,
    "",
    "Nguồn ưu tiên:",
    `- Tier 1 official: ${context.registrySummary.byTier.tier1_official}`,
    `- Tier 2 practitioner: ${context.registrySummary.byTier.tier2_practitioner}`,
    `- Tier 3 watch-only: ${context.registrySummary.byTier.tier3_watch_only}`,
  ];
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderAlerts(context: AssistantContext): CommandReply {
  const lines = ["🚨 Danh sách cảnh báo hiện tại"];
  if (context.derived.alerts.length === 0) {
    lines.push("Không có cảnh báo nào ở thời điểm này.");
  } else {
    for (const alert of context.derived.alerts) {
      lines.push("", `${severityEmoji(alert.severity)} ${alert.title}`, alert.summary);
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderBudget(context: AssistantContext): CommandReply {
  const budget = context.derived.budget;
  const pendingScale = context.state.proposals.filter((proposal) =>
    proposal.id.startsWith("tangngansach_"),
  );
  const lines = [
    "💸 Bảng điều phối ngân sách",
    `Đã chi hôm nay: ${formatMoney(budget.spendToday, context)}`,
    `Budget ngày: ${formatMoney(budget.budgetToday, context)}`,
    `Tỷ lệ sử dụng: ${(budget.utilization * 100).toFixed(1)}%`,
    `Overspend: ${budget.overspending ? "Có" : "Không"}`,
    "",
    `Đề xuất scale đang chờ: ${pendingScale.length}`,
  ];
  if (context.derived.winners.length > 0) {
    lines.push("", "Nhóm có thể scale:");
    for (const winner of context.derived.winners.slice(0, 3)) {
      lines.push(
        `- ${winner.campaign.name}: ROAS ${formatRoas(winner.campaign.roas)} | CTR ${formatPercent(winner.campaign.ctr)}`,
      );
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderPlan(context: AssistantContext): CommandReply {
  const queuedInstructions = context.state.instructions.filter(
    (instruction) => instruction.status === "queued",
  );
  const lines = [
    "🗓️ Kế hoạch hành động hôm nay",
    ...context.derived.dailyTasks.map((task, index) => `${index + 1}. ${task}`),
  ];
  if (queuedInstructions.length > 0) {
    lines.push("", "Lệnh đang chờ xử lý:");
    for (const instruction of queuedInstructions.slice(0, 3)) {
      lines.push(`- ${instruction.id}: ${instruction.text}`);
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderProposals(context: AssistantContext): CommandReply {
  const lines = ["🧠 Danh sách đề xuất tối ưu"];
  if (context.state.proposals.length === 0) {
    lines.push("Hiện chưa có đề xuất nào.");
  } else {
    for (const proposal of context.state.proposals.slice(0, 8)) {
      lines.push(
        "",
        `${proposalEmoji(proposal.impact)} ${statusEmoji(proposal.status)} ${proposal.title}`,
        `ID: ${proposal.id}`,
        proposal.summary,
        `Lý do: ${proposal.reason}`,
      );
    }
  }
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(
    lines.join("\n"),
    buildProposalButtons(context) ?? buildDashboardButtons(context),
  );
}

export function renderCompetitors(context: AssistantContext): CommandReply {
  const competitors = context.snapshot?.competitors ?? [];
  const lines = ["🕵️ Góc nhìn đối thủ"];
  if (competitors.length === 0) {
    lines.push("Chưa có dữ liệu đối thủ trong snapshot.");
  } else {
    for (const competitor of competitors.slice(0, 5)) {
      lines.push(
        "",
        `${competitor.name}${competitor.region ? ` | ${competitor.region}` : ""}`,
        competitor.angle ? `Angle: ${competitor.angle}` : "Angle: n/a",
        competitor.note ? `Note: ${competitor.note}` : "Note: n/a",
      );
    }
  }
  lines.push(
    "",
    "Lưu ý:",
    "- Dữ liệu đối thủ chỉ dùng để gợi ý creative/offer, không suy ra hiệu quả thật.",
  );
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderSyncResult(context: AssistantContext): CommandReply {
  const lines = [
    "🔄 Đồng bộ hoàn tất",
    `Thời gian: ${formatDate(context.state.lastSyncAt, context)}`,
    `Campaign đọc được: ${context.snapshot?.campaigns.length ?? 0}`,
    `Cảnh báo: ${context.derived.alerts.length}`,
    `Đề xuất: ${context.state.proposals.length}`,
  ];
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderApprovalResult(params: {
  context: AssistantContext;
  proposal: DerivedProposal;
  action: "approved" | "rejected";
}): CommandReply {
  const verb = params.action === "approved" ? "đã duyệt" : "đã từ chối";
  const lines = [
    `${params.action === "approved" ? "✅" : "⛔"} Đề xuất ${verb}`,
    `${params.proposal.title}`,
    `ID: ${params.proposal.id}`,
    params.proposal.summary,
  ];
  lines.push(...operationsBlock(params.context));
  lines.push(...warningBlock(params.context));
  lines.push(...safeModeBlock(params.context));
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderInstructionAck(params: {
  context: AssistantContext;
  instruction: { id: string; text: string };
}): CommandReply {
  const lines = [
    "🫡 Đã nhận lệnh từ sếp",
    `ID: ${params.instruction.id}`,
    params.instruction.text,
    "",
    "Gợi ý bước tiếp theo:",
    "- /kehoach để xem việc hôm nay",
    "- /de_xuat để xem các action chờ duyệt",
    "- /lenh status để xem hàng đợi lệnh",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

export function renderInstructionStatus(context: AssistantContext): CommandReply {
  const queued = context.state.instructions.filter(
    (instruction) => instruction.status === "queued",
  );
  const acknowledged = context.state.instructions.filter(
    (instruction) => instruction.status === "acknowledged",
  );
  const lines = [
    "📥 Hàng đợi lệnh từ sếp",
    `Queued: ${queued.length}`,
    `Acknowledged: ${acknowledged.length}`,
  ];
  if (queued.length === 0) {
    lines.push("", "Không có lệnh nào đang chờ xử lý.");
  } else {
    lines.push("", "Lệnh đang chờ:");
    for (const instruction of queued.slice(0, 5)) {
      lines.push(`- ${instruction.id}: ${instruction.text}`);
    }
  }
  lines.push("", "Mẹo:", "- /lenh ack latest", "- /lenh ack <instruction_id>");
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

export function renderInstructionCompletion(params: {
  context: AssistantContext;
  instruction: { id: string; text: string };
}): CommandReply {
  const lines = [
    "✅ Đã đánh dấu hoàn tất lệnh",
    `ID: ${params.instruction.id}`,
    params.instruction.text,
    "",
    "Bạn có thể dùng /lenh status để kiểm tra queue còn lại.",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}
