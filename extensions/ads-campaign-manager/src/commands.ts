import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import {
  acknowledgeInstruction,
  appendBossInstruction,
  loadAssistantContext,
  runAssistantSync,
  setProposalStatus,
} from "./assistant.js";
import type { AdsManagerPluginConfig } from "./types.js";
import {
  renderAlerts,
  renderApprovalResult,
  renderBudget,
  renderCompetitors,
  renderInstructionAck,
  renderInstructionCompletion,
  renderInstructionStatus,
  renderOverview,
  renderPlan,
  renderProposals,
  renderReport,
  renderSyncResult,
} from "./ui.js";

function suggestFollowUp(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("ngân sách") || normalized.includes("budget")) {
    return "Gợi ý: mở /ngansach để rà soát nhịp chi và lệnh scale.";
  }
  if (normalized.includes("đối thủ") || normalized.includes("competitor")) {
    return "Gợi ý: mở /doithu để xem note đối thủ mới nhất.";
  }
  if (normalized.includes("chiến dịch") || normalized.includes("campaign")) {
    return "Gợi ý: mở /de_xuat để xem action nên duyệt trước.";
  }
  return "Gợi ý: mở /baocao để xem toàn cảnh trước khi ra lệnh tiếp theo.";
}

function buildLenhUsage(): string {
  return [
    "Dùng:",
    "/lenh <nội dung chỉ đạo từ sếp>",
    "/lenh status",
    "/lenh ack <instruction_id|latest>",
  ].join("\n");
}

function findLatestQueuedInstructionId(
  context: Awaited<ReturnType<typeof loadAssistantContext>>,
): string | undefined {
  return context.state.instructions.find((instruction) => instruction.status === "queued")?.id;
}

export function registerAdsManagerCommands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  api.registerCommand({
    name: "baocao",
    description: "Xem báo cáo ads hiện tại.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderReport(context);
    },
  });

  api.registerCommand({
    name: "tongquan",
    description: "Xem tổng quan sức khỏe account ads.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderOverview(context);
    },
  });

  api.registerCommand({
    name: "canhbao",
    description: "Liệt kê cảnh báo hiện tại.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderAlerts(context);
    },
  });

  api.registerCommand({
    name: "ngansach",
    description: "Xem điều phối ngân sách và pacing.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderBudget(context);
    },
  });

  api.registerCommand({
    name: "kehoach",
    description: "Xem kế hoạch hành động hôm nay.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderPlan(context);
    },
  });

  api.registerCommand({
    name: "de_xuat",
    description: "Xem danh sách đề xuất chờ duyệt.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderProposals(context);
    },
  });

  api.registerCommand({
    name: "doithu",
    description: "Xem ghi chú đối thủ trong snapshot.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderCompetitors(context);
    },
  });

  api.registerCommand({
    name: "dongbo",
    description: "Đồng bộ dữ liệu cục bộ cho trợ lý ads.",
    handler: async () => {
      const context = await runAssistantSync({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderSyncResult(context);
    },
  });

  api.registerCommand({
    name: "pheduyet",
    description: "Duyệt một đề xuất theo ID.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const proposalId = ctx.args?.trim();
      if (!proposalId) {
        return { text: "Dùng: /pheduyet <proposal_id>" };
      }
      const context = await setProposalStatus({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
        proposalId,
        status: "approved",
      });
      const proposal = context.state.proposals.find((entry) => entry.id === proposalId);
      if (!proposal) {
        return { text: `Không tìm thấy đề xuất ${proposalId}.` };
      }
      return renderApprovalResult({
        context,
        proposal,
        action: "approved",
      });
    },
  });

  api.registerCommand({
    name: "tuchoi",
    description: "Từ chối một đề xuất theo ID.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const proposalId = ctx.args?.trim();
      if (!proposalId) {
        return { text: "Dùng: /tuchoi <proposal_id>" };
      }
      const context = await setProposalStatus({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
        proposalId,
        status: "rejected",
      });
      const proposal = context.state.proposals.find((entry) => entry.id === proposalId);
      if (!proposal) {
        return { text: `Không tìm thấy đề xuất ${proposalId}.` };
      }
      return renderApprovalResult({
        context,
        proposal,
        action: "rejected",
      });
    },
  });

  api.registerCommand({
    name: "lenh",
    description: "Gửi lệnh mới cho trợ lý ads hoặc quản lý queue lệnh.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const text = ctx.args?.trim();
      if (!text) {
        return { text: buildLenhUsage() };
      }

      const tokens = text.split(/\s+/).filter(Boolean);
      const action = tokens[0]?.toLowerCase() ?? "";

      if (action === "status") {
        const context = await loadAssistantContext({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
        });
        return renderInstructionStatus(context);
      }

      if (action === "ack" || action === "done" || action === "xong") {
        const current = await loadAssistantContext({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
        });
        const requestedId = tokens[1]?.trim();
        const instructionId =
          !requestedId || requestedId === "latest"
            ? findLatestQueuedInstructionId(current)
            : requestedId;
        if (!instructionId) {
          return { text: "Không có lệnh nào đang ở trạng thái queued." };
        }
        const updated = await acknowledgeInstruction({
          runtime: api.runtime,
          logger: api.logger,
          pluginConfig,
          instructionId,
        });
        const instruction = updated.state.instructions.find((entry) => entry.id === instructionId);
        if (!instruction) {
          return { text: `Không tìm thấy instruction ${instructionId}.` };
        }
        return renderInstructionCompletion({
          context: updated,
          instruction,
        });
      }

      const { context, instruction } = await appendBossInstruction({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
        text,
      });
      const reply = renderInstructionAck({
        context,
        instruction,
      });
      return {
        ...reply,
        text: `${reply.text}\n${suggestFollowUp(text)}`,
      };
    },
  });
}
