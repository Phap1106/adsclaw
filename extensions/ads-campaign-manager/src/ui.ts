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
    return "🟢 ỔN ĐỊNH";
  }
  if (level === "watch") {
    return "🟡 CẦN THEO DÕI";
  }
  return "🔴 RỦI RO";
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

export function buildWelcomeButtons(_context: AssistantContext): TelegramButtons {
  return [
    [
      { text: "📊 Xem Ads", callback_data: "/baocao" },
      { text: "🕵️ Soi Đối thủ", callback_data: "/doithu" },
    ],
    [
      { text: "📖 Hướng dẫn", callback_data: "/huong_dan" },
      { text: "⚙️ Cài đặt", callback_data: "/cau_hinh" },
    ],
    [{ text: "🔥 Khám phá tính năng nâng cao →", callback_data: "/kham_pha" }],
  ];
}

export function buildDiscoveryButtons(_context: AssistantContext): TelegramButtons {
  return [
    [
      { text: "🚀 Kiểm soát", callback_data: "/menu_kiemsoan" },
      { text: "🕵️ Chiến thuật", callback_data: "/menu_chienthuat" },
    ],
    [
      { text: "🫡 Ra lệnh AI", callback_data: "/menu_ralenh" },
      { text: "📘 Quản lý Page", callback_data: "/menu_page" },
    ],
    [{ text: "✅ Kiểm tra hệ thống", callback_data: "/kiem_tra" }],
  ];
}

export function buildSubMenuKiemSoanButtons(): TelegramButtons {
  return [
    [
      { text: "📊 Báo cáo hôm nay", callback_data: "/baocao" },
      { text: "🩺 Sức khỏe ADS", callback_data: "/tongquan" },
    ],
    [
      { text: "🚨 Cảnh báo", callback_data: "/canhbao" },
      { text: "🩺 Sức khỏe", callback_data: "/accounts" },
    ],
    [{ text: "⬅️ Quay lại Menu", callback_data: "/huong_dan" }],
  ];
}

export function buildSubMenuChienThuatButtons(): TelegramButtons {
  return [
    [
      { text: "🕵️ Soi đối thủ", callback_data: "/doithu" },
      { text: "🗓️ Kế hoạch", callback_data: "/kehoach" },
    ],
    [
      { text: "🧠 Đề xuất AI", callback_data: "/de_xuat" },
      { text: "🔄 Đồng bộ", callback_data: "/dongbo" },
    ],
    [{ text: "⬅️ Quay lại Menu", callback_data: "/huong_dan" }],
  ];
}

export function buildSubMenuRaLenhButtons(): TelegramButtons {
  return [
    [
      { text: "🫡 Ra lệnh", callback_data: "/lenh status" },
      { text: "✅ Phê duyệt", callback_data: "/de_xuat" },
    ],
    [{ text: "⬅️ Quay lại Menu", callback_data: "/huong_dan" }],
  ];
}

export function buildSubMenuPageButtons(): TelegramButtons {
  return [
    [
      { text: "📝 Đăng bài", callback_data: "/dang_bai" },
      { text: "🖼️ Đăng ảnh", callback_data: "/up_anh" },
    ],
    [
      { text: "📥 Inbox", callback_data: "/inbox" },
      { text: "💬 Comments", callback_data: "/comments" },
    ],
    [
      { text: "🗓️ Đặt lịch", callback_data: "/dat_lich" },
      { text: "📝 Bài viết", callback_data: "/bai_viet" },
    ],
    [
      { text: "📊 Thống kê bài", callback_data: "/thongke" },
      { text: "🚀 Forward", callback_data: "/inbox_forward status" },
    ],
    [{ text: "⬅️ Quay lại", callback_data: "/huong_dan" }],
  ];
}

export function buildMainMenuButtons(context: AssistantContext): TelegramButtons | undefined {
  const candidates: TelegramButtons = [
    [
      { text: "📖 Hướng dẫn", callback_data: "/huong_dan" },
      { text: "⚙️ Cấu hình", callback_data: "/cau_hinh" },
    ],
    [
      { text: "✅ Kiểm tra", callback_data: "/kiem_tra" },
      { text: "📜 Nội quy", callback_data: "/noi_quy" },
    ],
    [{ text: "🏠 Trang chủ (Báo cáo)", callback_data: "/baocao" }],
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
    `🏢 **${context.config.business.name.toUpperCase()}**`,
    `👤 Sếp: ${context.config.business.ownerName}`,
    `--------------------------------`,
    `📊 TRẠNG THÁI: ${healthLabel(context.derived.health)}`,
    `⏰ Cập nhật: ${formatDate(context.derived.generatedAt, context)}`,
    "",
    `💰 **NGÂN SÁCH HÔM NAY:**`,
    `• Đã chi: ${formatMoney(context.derived.budget.spendToday, context)}`,
    `• Hạn mức: ${formatMoney(context.derived.budget.budgetToday, context)}`,
    `• Hiệu suất sử dụng: **${(context.derived.budget.utilization * 100).toFixed(1)}%**`,
    "",
    `🔔 **THÔNG BÁO QUAN TRỌNG:**`,
    `• Cảnh báo mới: ${context.derived.alerts.length}`,
    `• Đề xuất chờ duyệt: ${context.state.proposals.filter((p) => p.status === "pending").length}`,
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
  lines.push("", "💡 Gợi ý bước tiếp theo: Sếp nên kiểm tra `/de_xuat` để tối ưu ngân sách hoặc `/doithu` để thám báo đối thủ.");
  return withButtons(lines.join("\n"), mergedButtons);
}

export function renderOverview(context: AssistantContext): CommandReply {
  const lines = [
    `🩺 **TỔNG QUAN TÀI KHOẢN**`,
    `Account: ${context.snapshot?.account?.name ?? context.config.business.name}`,
    `--------------------------------`,
    `Health: ${healthLabel(context.derived.health)}`,
    `🏆 Chiến dịch thắng: ${context.derived.winners.length}`,
    `🧐 Đang theo dõi: ${context.derived.watchlist.length}`,
    `🚨 Đang rủi ro: ${context.derived.atRisk.length}`,
    "",
    "📚 **NGUỒN HỌC CHIẾN THUẬT:**",
    `- Đã kích hoạt: ${context.registrySummary.enabledSources} nguồn`,
    `- Tier 1 (Hàng đầu): ${context.registrySummary.byTier.tier1_official}`,
    `- Tier 2 (Thực chiến): ${context.registrySummary.byTier.tier2_practitioner}`,
    "",
    `🔄 Sync lần cuối: ${formatDate(context.state.lastSyncAt, context)}`,
  ];
  lines.push(...operationsBlock(context));
  lines.push(...warningBlock(context));
  lines.push(...safeModeBlock(context));
  lines.push("", "💡 Gợi ý: Sếp hãy dùng `/dongbo` để cập nhật số liệu mới nhất.");
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
    `Lệnh: ${params.instruction.text}`,
    "",
    "Bạn có thể dùng /lenh status để kiểm tra queue còn lại.",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

// ─── Phase 15: New Section Renders ───────────────────────────────────────────

export function renderWelcome(context: AssistantContext): CommandReply {
  const ownerName = context.config.business.ownerName ?? "Sếp";
  const health = context.derived.health;
  const pending = context.state.proposals.filter((p) => p.status === "pending").length;
  const lines = [
    `🤖 Chào **${ownerName}**! Tôi là Trợ lý Ads AI của Sếp.`,
    "",
    `📊 Tình trạng tài khoản: ${healthLabel(health)}`,
    pending > 0
      ? `⏳ Đề xuất chờ duyệt: **${pending}** (dùng /de_xuat để xem)`
      : "✅ Không có việc tồn đọng.",
    "",
    "Chọn việc Sếp muốn làm ngay bây giờ:",
  ];
  return withButtons(lines.join("\n"), buildWelcomeButtons(context));
}

export function renderGuide(context: AssistantContext): CommandReply {
  const lines = [
    "📖 TRUNG TÂM ĐIỀU KHIỂN",
    "Chọn nhóm tính năng Sếp cần:",
    "",
    "🚀 Kiểm soát → Báo cáo, KPI, Cảnh báo",
    "🕵️ Chiến thuật → Đối thủ, Đề xuất AI",
    "🫡 Ra lệnh AI → Duyệt phương án, Điều phối",
    "📘 Quản lý Page → Đăng bài, Inbox, Thống kê",
    "",
    "💡 Mẹo: Bấm vào nhóm bên dưới để xem lệnh chi tiết!",
  ];
  return withButtons(lines.join("\n"), buildDiscoveryButtons(context));
}

export function renderSubMenuKiemSoan(_context: AssistantContext): CommandReply {
  const lines = [
    "🚀 NHÓM: KIỂM SOÁT & BIẾN ĐỘNG",
    "Công cụ theo dõi hiệu suất Ads:",
    "",
    "📊 /baocao — Toàn cảnh chiến dịch & ROI hôm nay",
    "🩺 /tongquan — Sức khỏe tổng thể tài khoản",
    "🚨 /canhbao — Các cảnh báo bất thường cần xử lý",
    "💸 /ngansach — Nhịp chi tiêu và pacing ngân sách",
  ];
  return withButtons(lines.join("\n"), buildSubMenuKiemSoanButtons());
}

export function renderSubMenuChienThuat(_context: AssistantContext): CommandReply {
  const lines = [
    "🕵️ NHÓM: CHIẾN THUẬT & THÁM PHÂN",
    "Công cụ nghiên cứu và lập kế hoạch:",
    "",
    "🕵️ /doithu — Soi mẫu quảng cáo đối thủ đang chạy",
    "🗓️ /kehoach — Lập kế hoạch phân tích tuần",
    "🧠 /de_xuat — Xem các phương án AI đề xuất",
    "🔄 /dongbo — Cập nhật số liệu Realtime từ Meta",
  ];
  return withButtons(lines.join("\n"), buildSubMenuChienThuatButtons());
}

export function renderSubMenuRaLenh(context: AssistantContext): CommandReply {
  const pending = context.state.proposals.filter((p) => p.status === "pending").length;
  const lines = [
    "🫡 NHÓM: RA LỆNH & PHÊ DUYỆT",
    `Đề xuất đang chờ: **${pending}**`,
    "",
    "🫡 /lenh <nội dung> — Ra lệnh cho AI",
    "   Ví dụ: /lenh giảm budget camp X xuống 20%",
    "",
    "✅ /pheduyet <ID> — Phê duyệt đề xuất AI",
    "❌ /tuchoi <ID> — Từ chối đề xuất",
    "",
    "💻 /lenh status — Xem hàng đợi lệnh",
  ];
  return withButtons(lines.join("\n"), buildSubMenuRaLenhButtons());
}

export function renderSubMenuPage(context: AssistantContext): CommandReply {
  const pageCfg = context.config.facebookPage;
  const connected = pageCfg?.enabled && (pageCfg?.pageId ?? pageCfg?.pageIdEnvVar);
  const lines = [
    "📘 NHÓM: QUẢN LÝ FANPAGE",
    connected ? "🟢 Đã kết nối Facebook Page" : "🔴 Chưa kết nối — Thêm FB_PAGE_ACCESS_TOKEN vào .env",
    "",
    "📝 /dang_bai <nội dung> — Đăng bài văn bản",
    "🖼️ /up_anh <url> <caption> — Đăng kèm ảnh ảnh",
    "📥 /inbox — 5 tin nhắn inbox mới nhất",
    "🗓️ /dat_lich <time> <text> — Lên lịch bài",
    "📝 /bai_viet — 10 bài đăng gần nhất",
    "❌ /xoa_bai <id> — Xóa bài trên Page",
    "🚀 /inbox_forward start — Bật chuyển tiếp tin",
  ];
  return withButtons(lines.join("\n"), buildSubMenuPageButtons());
}

export function renderKhamPha(context: AssistantContext): CommandReply {
  const lines = [
    "🔥 TÍNH NĂNG NÂNG CAO — PREMIUM",
    "",
    "🤖 AI TỰ ĐỘNG:",
    "  • Phân tích xu hướng 7 ngày (/tongquan)",
    "  • Đề xuất tăng/giảm ngân sách tự động",
    "  • Soi quảng cáo đối thủ real-time",
    "",
    "📊 BÁO CÁO THÔNG MINH:",
    "  • Bảng đèn giao thông 🔴🟡🟢",
    "  • Toàn cảnh Account → Campaign → Ad",
    "  • So sánh hiệu suất ngày/tuần",
    "",
    "📘 QUẢN LÝ FANPAGE (Phase 17):",
    "  • Đăng bài, sửa bài, xem inbox",
    "  • Đọc comment & trả lời từ Telegram",
    "  • Thống kê Like/Share/Comment",
    "",
    "💰 Sếp đang dùng đúng công cụ cạnh tranh hơn cả team đối thủ! 🚀",
  ];
  return withButtons(lines.join("\n"), buildWelcomeButtons(context));
}

export function renderPageSelectionMenu(context: AssistantContext): CommandReply {
  const pages = context.operations.pages ?? [];
  const lines = [
    "📘 **CHỌN PAGE LÀM VIỆC**",
    `Tài khoản: ${context.operations.accounts?.[0]?.fb_email ?? "N/A"}`,
    `Tìm thấy: ${pages.length} Page có quyền đăng bài`,
    "--------------------------------",
  ];

  if (pages.length === 0) {
    lines.push("Hiện chưa tìm thấy Page nào. Sếp vui lòng thử /dangnhapfb lại hoặc kiểm tra quyền ứng dụng.");
    return withButtons(lines.join("\n"), buildDiscoveryButtons(context));
  }

  const rows: TelegramButtons = [];
  for (const page of pages) {
    const isSelected = page.is_selected || page.id === context.operations.selectedPageId;
    const emoji = isSelected ? "🟢" : "⚪";
    lines.push(`${emoji} **${page.page_name}** (${page.category || "General"})`);
    
    rows.push([{ 
      text: `${isSelected ? "📍 Đang chọn: " : "✅ Chọn: "} ${page.page_name}`, 
      callback_data: `/chon_page ${page.id}` 
    }]);
  }

  lines.push("", "💡 Mẹo: Sau khi chọn Page, các lệnh /dangbai sẽ được thực hiện dưới danh nghĩa Page đó.");
  
  const buttons = [...rows, [{ text: "⬅️ Quay lại", callback_data: "/huong_dan" }]];
  return withButtons(lines.join("\n"), buttons);
}

export function renderConfig(context: AssistantContext): CommandReply {
  const currentAccount = context.operations.accounts?.[0];
  const selectedPage = context.operations.pages?.find(p => p.is_selected || p.id === context.operations.selectedPageId);
  
  const metaStatus = (context.config.meta.accessToken || currentAccount?.access_token) ? "Đã nhập ✅" : "Chưa có ❌";
  const scrapeStatus = process.env.SCRAPECREATORS_API_KEY ? "Đã có ✅" : "Chưa có ❌";
  const apifyStatus = process.env.APIFY_TOKEN ? "Đã có ✅" : "Chưa có ❌";

  const lines = [
    "⚙️ CẤU HÌNH MÔI TRƯỜNG",
    "",
    `- Tên Brand: ${context.config.business.name}`,
    `- Tiền tệ: ${context.config.business.currency}`,
    `- Timezone: ${context.config.business.timezone}`,
    "",
    "🔑 TRẠNG THÁI KEY/TOKEN:",
    `- Meta API: ${metaStatus}`,
    currentAccount ? `- Facebook: ${currentAccount.fb_email} 👤` : "",
    selectedPage ? `- Đang chọn Page: ${selectedPage.page_name} 📘` : "- Chưa chọn Page (Sử dụng cá nhân)",
    `- ScrapeCreators: ${scrapeStatus}`,
    `- Apify Core: ${apifyStatus}`,
    "",
    "💡 Mẹo: Để cập nhật Token, Sếp vui lòng sửa file .env hoặc liên hệ IT admin.",
  ].filter(l => l !== "");
  
  const buttons = buildMainMenuButtons(context) || [];
  buttons.push([{ text: "📘 Chọn Page khác", callback_data: "/page_list" }]);

  return withButtons(lines.join("\n"), buttons);
}

export function renderConfigCheck(context: AssistantContext): CommandReply {
  const lines = [
    "✅ KIỂM TRA HỆ THỐNG (DOCTOR)",
    "",
    "🚀 Trạng thái kết nối:",
    context.config.meta.enabled ? "• Meta API: Sẵn sàng 🟢" : "• Meta API: Đang tắt ⚪",
    context.operations.webhookPath ? "• Webhook: Đã active 🟢" : "• Webhook: Chưa nhận event 🔴",
    context.registrySummary.enabledSources > 0 ? "• Database AI: Sẵn sàng 🟢" : "• Database AI: Trống 🔴",
    "",
    `🤖 Mode hiện tại: ${context.config.syncMode.toUpperCase()}`,
    `🛡️ Safe Mode: ${context.config.safeMode ? "BẬT (Chỉ mô phỏng)" : "TẮT (Ghi dữ liệu thật)"}`,
    "",
    "Everything look good, Sếp!",
  ];
  return withButtons(lines.join("\n"), buildMainMenuButtons(context));
}

export function renderRules(context: AssistantContext): CommandReply {
  const lines = [
    "📜 NỘI QUY & ĐIỀU KHOẢN SỬ DỤNG",
    "",
    "1. Bảo mật: Không chia sẻ link báo cáo hoặc Token Bot cho bên thứ 3.",
    "2. Trách nhiệm: AI đưa ra đề xuất, Sếp là người ra quyết định cuối cùng (/pheduyet).",
    "3. Giới hạn: Tránh ra lệnh dồn dập trong 1 giây để tránh bị Meta khóa API.",
    "4. Dữ liệu: Bot cập nhật dữ liệu định kỳ, hãy dùng /dongbo nếu cần số liệu realtime.",
    "",
    "Chúc Sếp có những chiến dịch triệu đô! 💸",
  ];
  return withButtons(lines.join("\n"), buildMainMenuButtons(context));
}

// ─── Phase 19: Top Competitor Ads Report ─────────────────────────────────

import type { ScoredCompetitorAd } from "./types.js";

function scoreLabelEmoji(label: ScoredCompetitorAd["scoreLabel"]): string {
  if (label === "excellent") return "🔥 XUẤT SẮC";
  if (label === "good") return "✅ TỐT";
  if (label === "average") return "🟡 TB";
  return "⚪ BỎ QUA";
}

function engagementSourceTag(source: ScoredCompetitorAd["engagement"]["source"]): string {
  return source === "apify" ? "📊 Dữ liệu thật" : "📐 Ước tính";
}

export function renderTopCompetitorAds(params: {
  keyword: string;
  totalScanned: number;
  qualifiedCount: number;
  topAds: ScoredCompetitorAd[];
  context: AssistantContext;
}): CommandReply {
  const { keyword, totalScanned, qualifiedCount, topAds } = params;

  const lines: string[] = [
    `🔍 TOP BÀI QUẢNG CÁO ĐÁNG HỌC — "${keyword}"`,
    `Phân tích: ${totalScanned} bài | Đạt chuẩn (≥60đ): ${qualifiedCount} bài`,
  ];

  if (topAds.length === 0) {
    lines.push("", "⚪ Không tìm thấy bài nào đạt tiêu chí chất lượng.");
    lines.push("Thử tìm với từ khóa khác hoặc mở rộng ngành hàng.");
    return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
  }

  topAds.slice(0, 5).forEach((ad, idx) => {
    const flags = ad.analysisFlags;
    const breakdown = ad.scoreBreakdown;
    const hookIcon = flags.hookType === "number" ? "🔢" :
                     flags.hookType === "question" ? "❓" :
                     flags.hookType === "painpoint" ? "😟" : "📝";
    const preview = ad.adText.slice(0, 60).replace(/\n/g, " ").trim();

    lines.push("");
    lines.push(`${"━".repeat(22)}`);
    lines.push(`${scoreLabelEmoji(ad.scoreLabel)} #${idx + 1} (${ad.trustScore}/100)`);
    lines.push(`Page: ${ad.pageName}`);
    lines.push(`"${preview}${ad.adText.length > 60 ? "…" : ""}"`);
    lines.push(
      `${ad.engagement.likes}❤️  ${ad.engagement.comments}💬  ${ad.engagement.shares}🔁  |  ` +
      `${ad.daysLive}ngày  |  ${ad.platforms.join("+")}`,
    );
    lines.push(
      `${hookIcon} Hook: ${flags.hookType} ` +
      `${flags.hasCTA ? "✅CTA" : "❌CTA"} ` +
      `${flags.hasSocialProof ? "✅Proof" : "❌Proof"} ` +
      `${flags.hasPrice ? "✅Giá" : "❌Giá"}`,
    );
    if (flags.suspectedFakeEngagement) {
      lines.push("⚠️ Cảnh báo: Tỷ lệ comment thấp, nghi ngờ boost like.");
    }
    lines.push(`📈 Điểm: Xã hội ${breakdown.socialSignals} | Bền vững ${breakdown.longevitySignals} | Creative ${breakdown.creativeQuality}`);
    lines.push(`${engagementSourceTag(ad.engagement.source)}`);
    lines.push(`👉 ${ad.adLibraryUrl}`);
  });

  // Best hook suggestion
  const bestAd = topAds[0];
  if (bestAd) {
    lines.push("");
    lines.push(`💡 Gợi ý: Học hook #1 — dùng "${bestAd.analysisFlags.hookType}" + ${bestAd.daysLive} ngày chứng minh hiệu quả.`);
  }

  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

/**
 * renderKnowledgeList - Phase 21
 */
export function renderKnowledgeList(params: {
  docs: any[];
  context: AssistantContext;
}): CommandReply {
  const lines = [
    "📚 **TÀI LIỆU CHIẾN THUẬT RIÊNG CỦA SẾP**",
    "",
    params.docs.length === 0 
      ? "Dạ Sếp ơi, hiện em chưa có bộ nhớ tài liệu nào của Sếp ạ. Sếp hãy gửi file kèm lệnh /themngucanhfile để em học nhé!"
      : `Em đang lưu trí tuệ từ **${params.docs.length}** tài liệu chuyên biệt:`,
  ];

  params.docs.forEach((doc, idx) => {
    const statusIcon = doc.processingStatus === "done" ? "✅" : doc.processingStatus === "failed" ? "❌" : "⏳";
    const sizeKb = Math.ceil((doc.rawSizeBytes || 0) / 1024);
    const modelIcon = doc.processingModel === "mistral" ? "🌪️ Mistral AI" : "💻 Local AI";
    
    lines.push("");
    lines.push(`${statusIcon} **#${idx + 1}: ${doc.filename}**`);
    lines.push(`   • ID: \`${doc.id}\` | Type: \`${String(doc.fileType).toUpperCase()}\` | Size: \`${sizeKb} KB\``);
    lines.push(`   • Engine: ${modelIcon}`);
    if (doc.summary) {
      lines.push(`   📌 **Tóm tắt ngắn:** ${doc.summary.slice(0, 150)}${doc.summary.length > 150 ? "..." : ""}`);
    } else if (doc.extractedText) {
      lines.push(`   📌 **Nội dung trích:** ${doc.extractedText.slice(0, 150).replace(/\n/g, " ")}...`);
    }
  });

  if (params.docs.length > 0) {
    lines.push("", "──────────────────");
    lines.push("💡 **Mẹo:** Sếp muốn xóa tài liệu nào thì dùng `/xoangucanh id` ạ.");
  }

  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

/**
 * renderKnowledgeAdded - Phase 21
 */
export function renderKnowledgeAdded(params: {
  doc: any;
  context: AssistantContext;
}): CommandReply {
  const sizeKb = Math.ceil((params.doc.rawSizeBytes || 0) / 1024);
  const modelStr = params.doc.processingModel === "mistral" ? "Mistral Large (Cloud)" : "Local Processor";
  
  const lines = [
    "🚀 **ĐÃ KẾT NẠP KIẾN THỨC MỚI**",
    "",
    `Em đã nạp xong file: *${params.doc.filename}*`,
    `• Dung lượng: \`${sizeKb} KB\``,
    `• Công nghệ: \`${modelStr}\``,
    `• ID: \`${params.doc.id}\``,
    "",
    "📌 **Bản tóm lược dành cho Sếp:**",
    params.doc.summary || "Em đã bóc tách dữ liệu và sẵn sàng trả lời mọi câu hỏi về file này của Sếp! 🧐",
    "",
    "Sếp hãy đặt câu hỏi liên quan đến tài liệu này bất cứ lúc nào, em luôn sẵn sàng hỗ trợ! 🫡",
  ];
  return withButtons(lines.join("\n"), buildDashboardButtons(params.context));
}

/**
 * renderEnterpriseHealth - Phase 28 Enterprise Upgrade
 */
export function renderEnterpriseHealth(context: AssistantContext): CommandReply {
  const accounts = context.operations.accounts || [];
  const lines = [
    "🩺 **GIÁM SÁT TÀI KHOẢN CÔNG NGHIỆP**",
    `Tổng tài khoản: **${accounts.length}**`,
    "──────────────────",
  ];

  if (accounts.length === 0) {
    lines.push("Hiện chưa có quy trình đăng ký tài khoản nào.");
  } else {
    accounts.forEach((acc, idx) => {
      const total = acc.success_count + acc.fail_count;
      const successRate = total > 0 
        ? (acc.success_count / total * 100).toFixed(1) 
        : "N/A";
      const statusIcon = acc.fail_count > 5 ? "🔴" : acc.fail_count > 0 ? "🟡" : "🟢";
      const proxyMask = acc.proxy_url ? (acc.proxy_url.length > 20 ? acc.proxy_url.slice(0, 20) + "..." : acc.proxy_url) : "N/A";
      
      lines.push(`${statusIcon} **#${idx + 1}: ${acc.fb_email}**`);
      lines.push(`   • Thành công: ${acc.success_count} | Thất bại: ${acc.fail_count} | SR: ${successRate}%`);
      lines.push(`   • Proxy: \`${proxyMask}\``);
      if (acc.last_error) {
        lines.push(`   • Lỗi: ${acc.last_error.slice(0, 60)}${acc.last_error.length > 60 ? "..." : ""}`);
      }
      lines.push("");
    });
  }

  lines.push("💡 **Enterprise Mode:** Tự động điều phối qua Worker Pool & Proxy Rotation.");
  return withButtons(lines.join("\n"), buildDashboardButtons(context));
}

