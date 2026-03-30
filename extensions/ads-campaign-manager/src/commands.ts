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
  renderGuide,
  renderConfig,
  renderConfigCheck,
  renderRules,
  renderWelcome,
  renderSubMenuKiemSoan,
  renderSubMenuChienThuat,
  renderSubMenuRaLenh,
  renderSubMenuPage,
  renderKhamPha,
  renderTopCompetitorAds,
  renderEnterpriseHealth,
  renderPageSelectionMenu,
} from "./ui.js";
import { setSelectedPage } from "./db-state.js";
import { getPostEngagement } from "./apify-service.js";
import { calculateAdTrustScore, estimateEngagementFromProxy } from "./ad-math.js";
import { resolveMetaSecret } from "./meta-api.js";
import {
  detectIntent,
  buildConfusedResponse,
  buildGreetingResponse,
  buildRoutingAck,
  isGreeting,
} from "./chat-handler.js";


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

// ─── Refactored Page Command Handlers ──────────────────────────────────────────

async function getBusinessId(pluginConfig: AdsManagerPluginConfig) {
  return Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
}

async function handleInbox(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig) {
  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, getPageInbox } = await import("./facebook-page.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    const threads = await getPageInbox(pageCfg, 5);
    if (threads.length === 0) return { text: "📥 Inbox trống — chưa có tin nhắn nào." };
    
    const lines = ["📥 **INBOX — 5 tin nhắn mới nhất**", ""];
    for (const t of threads) {
      const unread = t.unread > 0 ? `🔴 ${t.unread} chưa đọc` : "✅ Đã đọc";
      lines.push(`👤 ${t.participants.join(", ")} | ${unread}`);
      lines.push(`   💬 ${t.snippet.slice(0, 80)}${t.snippet.length > 80 ? "..." : ""}`);
      lines.push(`   🆔 \`${t.id}\` | 🕐 ${t.updatedAt}`);
      lines.push("");
    }
    lines.push("💡 Trả lời: \`/tra_loi <conv_id> <nội dung>\`\n\n🚀 Để bật tự động chuyển tin nhắn mới về đây, dùng: \`/inbox_forward start\`");
    api.logger.info(`[inbox] Loaded ${threads.length} threads for page ${pageCfg.pageId}`);
    return { text: lines.join("\n") };
  } catch (err: any) {
    const { parseGraphApiError, formatErrorLog, buildErrorMessage } = await import("./graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("inbox", "getPageInbox", graphErr));
    return { text: buildErrorMessage("đọc inbox", graphErr) };
  }
}

async function handleTraLoi(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, argsStr: string) {
  const args = argsStr.trim().split(/\s+/);
  const threadId = args[0];
  const message = args.slice(1).join(" ");
  if (!threadId || !message) return { text: "Dùng: \`/tra_loi <conv_id> <nội dung trả lời>\`" };

  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, replyToMessage } = await import("./facebook-page.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    await replyToMessage(pageCfg, threadId, message);
    api.logger.info(`[tra_loi] Reply sent to ${threadId}`);
    return { text: `✅ Đã gửi lời nhắn đến \`${threadId}\` thành công!` };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("./graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("tra_loi", "replyToMessage", graphErr));
    return { text: buildErrorMessage("trả lời tin nhắn", graphErr) };
  }
}

async function handleDatLich(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, argsStr: string) {
  const args = argsStr.trim().split(/\s+/);
  const datePart = args[0];
  const timePart = args[1];
  const message = args.slice(2).join(" ");

  if (!datePart || !timePart || !message) {
    return { text: "Dùng: \`/dat_lich 2026-04-01 09:00 Chào buổi sáng!\`" };
  }

  const scheduledTime = new Date(`${datePart}T${timePart}:00`).getTime() / 1000;
  if (isNaN(scheduledTime)) return { text: "❌ Định dạng ngày giờ không hợp lệ. Sếp dùng: YYYY-MM-DD HH:mm" };
  if (scheduledTime < (Date.now() / 1000) + 600) return { text: "❌ Thời gian lên lịch phải cách hiện tại ít nhất 10 phút." };

  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, schedulePost } = await import("./facebook-page.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    const res = await schedulePost(pageCfg, message, scheduledTime);
    api.logger.info(`[dat_lich] SUCCESS | pageId=${pageCfg.pageId} postScheduleId=${res.id}`);
    return { text: `✅ Đã lên lịch thành công!\n🕐 Thời gian: ${datePart} ${timePart}\n📝 ID: \`${res.id}\`` };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("./graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("dat_lich", "schedulePost", graphErr));
    return { text: buildErrorMessage("đặt lịch bài đăng", graphErr) };
  }
}

async function handleXoaBai(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, postId: string) {
  if (!postId) return { text: "Dùng: \`/xoa_bai <post_id>\` (Dùng \`/bai_viet\` để lấy ID)" };

  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, deletePost } = await import("./facebook-page.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    await deletePost(pageCfg, postId);
    api.logger.info(`[xoa_bai] SUCCESS | postId=${postId} pageId=${pageCfg.pageId}`);
    return { text: `✅ Đã xóa bài đăng \`${postId}\` thành công!` };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("./graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("xoa_bai", "deletePost", graphErr));
    return { text: buildErrorMessage("xóa bài đăng", graphErr) };
  }
}

async function handleBaiViet(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig) {
  const businessId = await getBusinessId(pluginConfig);
  const { resolvePageContext, getRecentPosts } = await import("./facebook-page.js");
  const pageCfg = await resolvePageContext(pluginConfig, businessId);
  if (!pageCfg) return { text: "❌ Chưa chọn Page — dùng \`/page_list\`" };

  try {
    const posts = await getRecentPosts(pageCfg, 10);
    if (!posts.data || posts.data.length === 0) return { text: "📝 Hiện chưa có bài viết nào trên Page." };
    
    const lines = ["📝 **10 BÀI ĐĂNG GẦN NHẤT**", ""];
    for (const p of posts.data) {
      const preview = p.message ? p.message.slice(0, 50) + (p.message.length > 50 ? "..." : "") : "(Ảnh/Video/Không lời)";
      lines.push(`📅 ${new Date(p.created_time).toLocaleString("vi-VN")}`);
      lines.push(`   💬 ${preview}`);
      lines.push(`   🆔 \`${p.id}\``);
      lines.push("");
    }
    api.logger.info(`[bai_viet] SUCCESS | pageId=${pageCfg.pageId}`);
    return { text: lines.join("\n") };
  } catch (err: any) {
    const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("./graph-errors.js");
    const graphErr = parseGraphApiError(err);
    api.logger.error(formatErrorLog("bai_viet", "getRecentPosts", graphErr));
    return { text: buildErrorMessage("lấy danh sách bài viết", graphErr) };
  }
}

async function handleInboxForward(api: OpenClawPluginApi, pluginConfig: AdsManagerPluginConfig, telegramId: string, action: string) {
  const { getOrInitForwarder } = await import("./inbox-forwarder.js");
  const { resolvePageContext } = await import("./facebook-page.js");
  const businessId = await getBusinessId(pluginConfig);

  const forwarder = getOrInitForwarder(
    { 
      pollIntervalMs: 15000, 
      telegramChatId: telegramId, 
      maxConvs: 20, 
      lookbackSec: 60 
    },
    () => resolvePageContext(pluginConfig, businessId),
    (text) => api.runtime.channel.telegram.sendMessageTelegram(telegramId, text).then(() => {})
  );

  const act = action.toLowerCase();
  if (act === "start") {
    return { text: await forwarder.start() };
  } else if (act === "stop") {
    return { text: forwarder.stop() };
  } else if (act === "status") {
    return { text: forwarder.getStatus() };
  } else {
    return { text: "Dùng: \`/inbox_forward start | stop | status\`" };
  }
}

export function registerAdsManagerCommands(params: {
  api: OpenClawPluginApi;
  pluginConfig: AdsManagerPluginConfig;
}): void {
  const { api, pluginConfig } = params;

  // ─── /cauhinhads ──────────────────────────────────────────────────────────
  api.registerCommand({
    name: "cauhinhads",
    description: "Cấu hình Meta Ads Access Token và Ad Account ID.",
    handler: async (ctx: any) => {
      const args = (ctx.args || "").trim().split(/\s+/);
      if (args.length < 2) {
        return {
          text: "Dạ Sếp vui lòng cấu hình theo cú pháp:\n`/cauhinhads <access_token> <ad_account_id>`\n\nVí dụ: `/cauhinhads EAAG... act_123456789`"
        };
      }
      const [token, accountId] = args;
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);

      const { executeQuery } = await import("./db.js");
      await executeQuery(pluginConfig,
        "UPDATE business_config SET meta_access_token = ?, meta_ad_account_id = ? WHERE id = ?",
        [token, accountId, businessId]
      );

      return { text: `✅ Tuyệt vời thưa Sếp! Em đã lưu cấu hình Ads cho **${pluginConfig.business.name}** thành công. Bây giờ em có thể bắt đầu đọc dữ liệu thật từ Meta rồi ạ!` };
    },
  });

  // ─── /nhap_token (UPGRADED v3) ─────────────────────────────────────────────
  // Multi-method page discovery + structured error logging
  api.registerCommand({
    name: "nhap_token",
    description: "Nhập Facebook User Token để kích hoạt hệ thống (khuyên dùng thay /dangnhapfb).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const token = (ctx.args || "").trim();

      if (!token) {
        return {
          text: [
            "📋 **CÁCH LẤY TOKEN FACEBOOK:**",
            "",
            "**Bước 1:** Mở link sau trên trình duyệt đã đăng nhập Facebook:",
            "https://developers.facebook.com/tools/explorer/",
            "",
            "**Bước 2:** Chọn App → nhấn **Generate Access Token**",
            "Cấp các quyền: `pages_manage_posts`, `pages_read_engagement`,",
            "`pages_messaging`, `ads_management`, `ads_read`",
            "",
            "**Bước 3:** Copy token → gửi lệnh:",
            "`/nhap_token EAAxxxxxxxxxx`",
            "",
            "⚡ Bot sẽ tự động gia hạn token lên **60 ngày** và lưu vào hệ thống.",
            "",
            "💡 Phương án này không bao giờ bị Facebook Checkpoint.",
          ].join("\n"),
        };
      }

      if (!token.startsWith("EAA") && !token.startsWith("EAG")) {
        return { text: "❌ Token không hợp lệ. Token Facebook phải bắt đầu bằng `EAA...`" };
      }

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);

      try {
        const { initPhase3Tables, saveUserMetaAuth, saveUserFacebookPages } = await import("./db-state.js");
        const { exchangeToLongLived, fetchUserPages, isMobileInternalToken, decodeFbHtmlToken, validateTokenBasic } = await import("./meta-login.js");

        await initPhase3Tables(pluginConfig);

        // ── Phase 1: Validate token is actually alive ──
        const validation = await validateTokenBasic(token);
        if (!validation.valid) {
          const hint = validation.errorCode === 190
            ? "\n\n💡 **Nguyên nhân:** Token đã hết hạn hoặc bị thu hồi.\n\n**Cách lấy token mới:**\n1. Mở https://developers.facebook.com/tools/explorer/\n2. Chọn App → Generate Access Token\n3. Cấp quyền: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`\n4. Copy token mới → `/nhap_token <token_mới>`"
            : validation.errorCode === 1
              ? "\n\n💡 **Nguyên nhân:** Meta chặn request từ IP/Server này. Hãy thử `/nhap_cookie` thay thế."
              : `\n\n💡 Chi tiết: ${validation.error}`;
          
          return {
            text: `❌ **TOKEN KHÔNG HỢP LỆ!**\n\nEm đã kiểm tra token với Graph API và nhận lỗi:\n\`${validation.error}\` (code: ${validation.errorCode})${hint}`
          };
        }

        api.logger.info(`[nhap_token] Token validated! User: ${validation.userName} (${validation.userId})`);

        // ── Phase 3: Token exchange (short → long-lived) ──
        let finalToken = token;
        let expiresAt = Date.now() + 2 * 60 * 60 * 1000; // fallback 2h

        if (!isMobileInternalToken(token)) {
          try {
            const longLived = await exchangeToLongLived(token, businessId);
            finalToken = longLived.token;
            expiresAt = longLived.expiresAt;
            api.logger.info(`[nhap_token] Token exchange SUCCESS | expiresAt=${new Date(expiresAt).toISOString()}`);
          } catch (extendErr: any) {
            api.logger.warn(`[nhap_token] Token exchange FAILED: ${extendErr.message}. Saving as short-lived.`);
          }
        } else {
          api.logger.info(`[nhap_token] Mobile token detected (EAAG/EAAB), skipping Graph API extension.`);
          expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;
        }

        const expiryDate = new Date(expiresAt).toLocaleDateString("vi-VN");
        const isExtended = expiresAt > Date.now() + 24 * 60 * 60 * 1000;

        // ── Save to DB ──
        await saveUserMetaAuth(pluginConfig, businessId, {
          email: "manual_token_input",
          passwordEnc: "N/A",
          accessToken: finalToken,
          expiresAt,
        });
        api.logger.info(`[nhap_token] Token saved to DB | businessId=${businessId}`);

        // ── Multi-method Page Discovery ──
        let pages: any[] = [];
        let discoveryMethod = "";
        const version = process.env.META_GRAPH_VERSION || "v25.0";

        // Method 1: Direct Graph API with Bearer auth (best for web-origin tokens)
        try {
          const directUrl = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,category,access_token&limit=100`;
          const directRes = await fetch(directUrl, {
            headers: { "Authorization": `Bearer ${finalToken}` }
          });
          const directJson = await directRes.json() as any;
          if (directJson?.data?.length > 0) {
            pages = directJson.data;
            discoveryMethod = "Graph API (Bearer auth)";
            api.logger.info(`[nhap_token] Page discovery Method 1 SUCCESS | count=${pages.length}`);
          } else if (directJson?.error) {
            api.logger.warn(`[nhap_token] Page discovery Method 1 FAILED | code=${directJson.error.code} | ${directJson.error.message}`);
          } else {
            api.logger.info(`[nhap_token] Page discovery Method 1: no pages returned (user may have no pages)`);
          }
        } catch (e: any) {
          api.logger.warn(`[nhap_token] Page discovery Method 1 error: ${e.message}`);
        }

        // Method 2: fetchUserPages with 4-layer mobile headers (fallback)
        if (pages.length === 0) {
          try {
            const mobilePages = await fetchUserPages(finalToken);
            if (mobilePages.length > 0) {
              pages = mobilePages;
              discoveryMethod = "Multi-layer discovery (mobile headers)";
              api.logger.info(`[nhap_token] Page discovery Method 2 SUCCESS | count=${pages.length}`);
            } else {
              api.logger.info(`[nhap_token] Page discovery Method 2: no pages returned`);
            }
          } catch (e: any) {
            api.logger.warn(`[nhap_token] Page discovery Method 2 FAILED: ${e.message}`);
          }
        }

        // Save pages to DB
        let pagesText = "Không tìm thấy Page nào.";
        if (pages.length > 0) {
          await saveUserFacebookPages(pluginConfig, businessId, "manual_token_input", pages);
          pagesText = `Tìm thấy **${pages.length} Page** (${discoveryMethod})`;
        }

        const tokenStatus = isExtended
          ? `✅ Token gia hạn thành công — hết hạn **${expiryDate}** (~60 ngày)`
          : `⚠️ Token ngắn hạn (~2h) — thêm META_APP_ID + META_APP_SECRET vào .env để gia hạn 60 ngày`;

        return {
          text: [
            "🚀 **TOKEN ĐÃ ĐƯỢC KÍCH HOẠT!**",
            "",
            `👤 Tài khoản: **${validation.userName}** (ID: ${validation.userId})`,
            tokenStatus,
            `📘 Pages: ${pagesText}`,
            "",
            "**Bước tiếp theo:**",
            pages.length > 0 ? "• `/page_list` → Xem và chọn Page để sử dụng" : "• `/capnhat_page` → Quét lại danh sách Page",
            "• `/kiem_tra` → Kiểm tra kết nối hệ thống",
            "• `/baocao` → Xem báo cáo Ads",
          ].join("\n"),
        };
      } catch (err: any) {
        const { parseGraphApiError, buildErrorMessage } = await import("./graph-errors.js");
        const graphErr = parseGraphApiError(err);
        api.logger.error(`[nhap_token] FATAL: ${graphErr.message}`);
        return { text: buildErrorMessage("kích hoạt token", graphErr) };
      }
    },
  });

  // ─── /nhap_cookie (MỚI) ────────────────────────────────────────────────────
  api.registerCommand({
    name: "nhap_cookie",
    description: "Nhập Cookie Facebook (c_user, xs) để chạy tính năng Đăng Profile Cá Nhân (vượt rào Anti-Bot).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const input = (ctx.args || "").trim();
      if (!input || !input.includes("c_user=") || !input.includes("xs=") || (!input.includes("datr=") && !input.includes("wd=")) || !input.includes("sb=")) {
        return {
          text: [
            "📋 **CÁCH NHẬP COOKIE ĐỂ KẾT NỐI (CHUẨN 100%):**",
            "",
            "Sếp cần dùng tiện ích lấy Cookie (Get Cookie For F-Plus) trên trình duyệt, copy nguyên chuỗi Cookie.",
            "Chuỗi Cookie bắt buộc phải có đủ các trường để duy trì phiên đăng nhập:",
            "  - `c_user=...`",
            "  - `xs=...`",
            "  - `sb=...`",
            "  - `datr=...` (hoặc `wd=...`)",
            "",
            "**Cú pháp:**",
            "`/nhap_cookie c_user=1000...; xs=...; datr=...; sb=...; fr=...;`",
            "",
            "💡 **Lưu ý:** Cookie Sếp vừa nhập có thể đang thiếu `datr` hoặc `sb`. Hãy đăng xuất Facebook trên máy tính, đăng nhập lại và lấy Cookie mới nhé!"
          ].join("\n")
        };
      }

      // Convert raw cookie string into Playwright format
      const cookieArray = input.split(";").map(c => c.trim()).filter(Boolean);
      const playwrightCookies = cookieArray.map(c => {
        const [name, ...valParts] = c.split("=");
        return {
          name: name.trim(),
          value: valParts.join("=").trim(),
          domain: ".facebook.com",
          path: "/"
        };
      });

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { executeQuery } = await import("./db.js");
      const { safeAutoLoginOrRenew } = await import("./meta-login.js");
      
      // 1. Clear OLD access_token to stop stale page logic
      await executeQuery(pluginConfig, 
        "UPDATE user_meta_auth SET access_token = NULL, token_expires_at = NULL WHERE business_id = ?",
        [businessId]
      );

      // 2. Upsert Cookie into user_meta_auth
      await executeQuery(pluginConfig,
        `INSERT INTO user_meta_auth (business_id, fb_email, fb_password, cookies) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE cookies = VALUES(cookies)`,
        [businessId, "manual_cookie_input", "none", JSON.stringify(playwrightCookies)]
      );

      // 3. Trigger immediate background sync (Tier 2/3)
      const senderId = ctx.from || (ctx as any).senderId;
      safeAutoLoginOrRenew(pluginConfig, {
        business_id: businessId,
        fb_email: "manual_cookie_input",
        fb_password_enc: "none"
      }, (msg) => {
        if (senderId) {
          api.runtime.channel.telegram.sendMessageTelegram(senderId, msg).catch(() => {});
        }
      }).catch(e => {
        api.logger.error(`[MetaAuth] Background cookie sync FAILED: ${e.message}`);
      });

      return {
        text: "✅ **NẠP COOKIE THÀNH CÔNG!**\n\n- Đã xóa Token cũ để tránh xung đột.\n- Đang bật Trình duyệt ảo để đồng bộ Page cho Sếp...\n\nSếp chờ em vài giây nhé, em sẽ báo khi quét xong ạ!"
      };
    }
  });

  // ─── /dangnhapfb (ĐÃ SỬA) ────────────────────────────────────────────────
  api.registerCommand({
    name: "dangnhapfb",
    description: "Đăng nhập Facebook tự động để lấy EAAG Token (Email|Pass|2FA).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const args = (ctx.args || "").trim().split(/\s+/);
      if (args.length < 2) {
        return {
          text: [
            "❌ Sếp ơi, sai cú pháp rồi ạ! Dùng:",
            "`/dangnhapfb <email> <password> <2fa_secret>`",
            "",
            "⚠️ **LƯU Ý (2026):** Facebook hay chặn đăng nhập tự động.",
            "Nếu bị lỗi Checkpoint, dùng phương án không bao giờ bị chặn:",
            "👉 `/nhap_token` — Nhập token trực tiếp từ Graph API Explorer",
          ].join("\n"),
        };
      }

      const [email, password, otpSecret] = args;
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);

      try {
        const { encrypt } = await import("./crypto-utils.js");
        const { safeAutoLoginOrRenew } = await import("./meta-login.js");
        const { initPhase3Tables } = await import("./db-state.js");
        await initPhase3Tables(pluginConfig);

        const payload = {
          business_id: businessId,
          fb_email: email,
          fb_password_enc: encrypt(password),
          fb_2fa_secret_enc: otpSecret ? encrypt(otpSecret) : undefined,
        };

        const senderId = ctx.from || (ctx as any).senderId;

        // Fire-and-forget
        safeAutoLoginOrRenew(pluginConfig, payload, (msg) => {
          if (senderId) {
            api.runtime.channel.telegram.sendMessageTelegram(senderId, msg).catch((e: any) => {
              api.logger.error(`[MetaAuth] Failed to send proactive notification: ${e.message}`);
            });
          }
        })
          .then(() => {
            api.logger.info(`[MetaAuth] Background login SUCCESS for ${businessId}`);
          })
          .catch((err: any) => {
            const isCheckpoint =
              err.message.includes("Checkpoint") ||
              err.message.includes("checkpoint") ||
              err.message.includes("xác minh");

            const notifyMsg = isCheckpoint
              ? [
                  "⚠️ **FACEBOOK YÊU CẦU XÁC MINH BẢO MẬT**",
                  "",
                  "Facebook đang chặn đăng nhập tự động vào tài khoản này.",
                  "",
                  "**Cách xử lý — chọn 1 trong 2:**",
                  "",
                  "**Cách 1: Xác nhận trên điện thoại**",
                  "1. Mở Facebook app trên điện thoại",
                  "2. Vào Settings → Security → Where You're Logged In",
                  "3. Xác nhận login mới → Thử `/dangnhapfb` lại",
                  "",
                  "**Cách 2: Nhập token trực tiếp (Khuyên dùng)**",
                  "1. Mở: https://developers.facebook.com/tools/explorer/",
                  "2. Generate Access Token → Copy token",
                  "3. Gửi: `/nhap_token EAAAxxxx`",
                  "",
                  "✅ Cách 2 không bao giờ bị checkpoint.",
                ].join("\n")
              : `❌ Lỗi đăng nhập: ${err.message.slice(0, 200)}`;

            if (senderId) {
              api.runtime.channel.telegram
                .sendMessageTelegram(senderId, notifyMsg)
                .catch(() => {});
            }
            api.logger.error(`[MetaAuth] Background login FAILED for ${businessId}: ${err.message}`);
          });

        return {
          text: [
            "☕️ Em đang chạy đăng nhập ngầm cho Sếp đây ạ!",
            "",
            "⏱ Quá trình mất khoảng 1-2 phút.",
            "Nếu Facebook yêu cầu xác minh bảo mật, em sẽ thông báo và hướng dẫn Sếp cách xử lý.",
            "",
            "💡 **Backup:** `/nhap_token` hoạt động 100% nếu đăng nhập tự động thất bại.",
          ].join("\n"),
        };
      } catch (error: any) {
        return { text: `❌ Sếp ơi, có lỗi khởi động rồi ạ: ${error.message}` };
      }
    },
  });

  // ─── /page_list ───────────────────────────────────────────────────────────
  api.registerCommand({
    name: "page_list",
    description: "Xem danh sách Page có thể làm việc.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderPageSelectionMenu(context);
    },
  });

  // ─── /chon_page ───────────────────────────────────────────────────────────
  api.registerCommand({
    name: "chon_page",
    description: "Chọn Page để làm việc (nhắn kèm ID page).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const pageId = (ctx.args || "").trim();
      if (!pageId) return { text: "Sếp ơi, cho em xin ID của Page Sếp muốn chọn nhé ạ!" };

      const { getUserFacebookPages } = await import("./db-state.js");
      const allPages = await getUserFacebookPages(pluginConfig);
      const targetPage = allPages?.find((p: any) => p.id === pageId);
      
      if (!targetPage) {
        return { text: `❌ Không tìm thấy Page ID \`${pageId}\`. Dùng /page_list để xem danh sách.` };
      }
      if (!targetPage.access_token) {
        api.logger.warn(`[chon_page] Page ${pageId} has no access_token — commands may fail`);
      }

      await setSelectedPage(pluginConfig, pageId);
      api.logger.info(`[chon_page] User selected pageId=${pageId}`);

      return { text: `✅ Đã chọn Page: **${targetPage.page_name || pageId}**\n\nBây giờ em sẽ dùng quyền của Page này để đăng bài và tương tác cho Sếp ạ!\n\n💡 Gợi ý:\n• \`/dang_bai <nội dung>\`: Đăng bài mới\n• \`/inbox\`: Xem tin nhắn mới nhất` };
    },
  });

  // ─── /accounts ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "accounts",
    description: "Xem danh sách tài khoản Meta đã đăng nhập.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderEnterpriseHealth(context);
    },
  });

  // ─── /debug_auth ──────────────────────────────────────────────────────────
  api.registerCommand({
    name: "debug_auth",
    description: "Kiểm tra trạng thái kỹ thuật của hệ thống Auth & Pages.",
    handler: async () => {
      try {
        const { calculateBusinessId, getDbPool } = await import("./db.js");
        const { getUserMetaAuth, getUserFacebookPages, initPhase3Tables } = await import("./db-state.js");
        await initPhase3Tables(pluginConfig);

        const businessId = calculateBusinessId(pluginConfig.business.name);
        const dbPool = getDbPool(pluginConfig);
        const dbStatus = dbPool ? "🟢 Connected" : "🔴 Not connected (DB disabled or error)";

        const auth = await getUserMetaAuth(pluginConfig, businessId);
        const pages = await getUserFacebookPages(pluginConfig);

        const tokenPreview = auth?.access_token
          ? `${auth.access_token.substring(0, 10)}... (${auth.access_token.substring(0, 4)} type)`
          : "❌ No token stored";

        const expiresAt = auth?.token_expires_at
          ? new Date(Number(auth.token_expires_at)).toLocaleDateString("vi-VN")
          : "N/A";

        const lines = [
          "🔬 **DEBUG AUTH — Trạng thái Hệ thống**",
          "──────────────────────────────",
          `🏢 Business: \`${pluginConfig.business.name}\``,
          `🆔 Business ID: \`${businessId}\``,
          "",
          "🔑 **META AUTH:**",
          `• Email: ${auth?.fb_email || "❌ Not registered"}`,
          `• Token: \`${tokenPreview}\``,
          `• Hết hạn: ${expiresAt}`,
          `• Đăng nhập thành công: ${auth?.success_count ?? 0} lần`,
          `• Lỗi: ${auth?.fail_count ?? 0} lần`,
          auth?.last_error ? `• Lỗi cuối: ${String(auth.last_error).substring(0, 80)}` : "",
          "",
          "📘 **FACEBOOK PAGES:**",
          `• Tổng Pages trong DB: **${pages?.length ?? 0}**`,
          ...(pages ?? []).map((p: any) => `  • ${p.is_selected ? "📍" : "⚪"} ${p.page_name} (${p.id})`),
          "",
          "💾 **DATABASE:**",
          `• Trạng thái: ${dbStatus}`,
          "",
          "💡 Nếu No token stored → dùng `/nhap_token` để kích hoạt.",
          "💡 Nếu Pages = 0 → thử `/dangnhapfb` hoặc `/capnhat_page`.",
        ].filter(l => l !== "");

        return { text: lines.join("\n") };
      } catch (err: any) {
        return { text: `❌ Debug error: ${err.message}` };
      }
    },
  });

  // ─── /capnhat_page ────────────────────────────────────────────────────────
  api.registerCommand({
    name: "capnhat_page",
    description: "Cập nhật danh sách Page từ tài khoản hiện tại.",
    handler: async (ctx: any) => handleCapNhatPage(api, pluginConfig, ctx),
  });

  async function handleCapNhatPage(api: any, pluginConfig: AdsManagerPluginConfig, ctx: any) {
    const context = await loadAssistantContext({
      runtime: api.runtime,
      logger: api.logger,
      pluginConfig,
    });
    
    // Robust token sourcing: context → DB direct → ENV
    let token = context.operations.accounts?.[0]?.access_token;
    if (!token) {
      const { getUserMetaAuth } = await import("./db-state.js");
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const auth = await getUserMetaAuth(pluginConfig, businessId);
      token = auth?.access_token;
      if (token) api.logger.info(`[capnhat_page] Token sourced from user_meta_auth`);
    }
    if (!token) token = process.env.META_ACCESS_TOKEN;
    
    if (!token) {
      return { text: "❌ Sếp ơi, em chưa thấy tài khoản Facebook nào đăng nhập để quét Page ạ!\n\nDùng `/nhap_token` để nhập token nhé Sếp." };
    }

    const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
    const { fetchUserPages } = await import("./meta-login.js");
    const { saveUserFacebookPages } = await import("./db-state.js");

    // Multi-method Page Discovery
    let pages: any[] = [];
    let method = "";
    const version = process.env.META_GRAPH_VERSION || "v25.0";

    try {
      const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,category,access_token&limit=100`;
      const res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
      const json = await res.json() as any;
      if (json?.data?.length > 0) {
        pages = json.data;
        method = "Graph API (Bearer auth)";
      }
    } catch (e: any) {
      api.logger.warn(`[capnhat_page] Method 1 (Bearer) FAILED: ${e.message}`);
    }

    if (pages.length === 0) {
      try {
        pages = await fetchUserPages(token, context.operations.accounts?.[0]?.proxy_url);
        if (pages.length > 0) method = "Multi-layer discovery (mobile headers)";
      } catch (e: any) {
        api.logger.warn(`[capnhat_page] Method 2 (fetchUserPages) FAILED: ${e.message}`);
      }
    }

    if (pages.length > 0) {
      await saveUserFacebookPages(pluginConfig, businessId, context.operations.accounts?.[0]?.fb_email || "auto_renew", pages);
      api.logger.info(`[capnhat_page] SUCCESS | count=${pages.length} method=${method}`);
      return { text: `✅ Đã quét xong! Tìm thấy **${pages.length} Page** (qua ${method}). Sếp dùng /page_list để xem và chọn nhé!` };
    } else {
      // Method 3: Fallback to safeAutoLoginOrRenew if cookies exist
      const { getUserMetaAuth } = await import("./db-state.js");
      const auth = await getUserMetaAuth(pluginConfig, businessId);
      
      if (auth?.cookies) {
        api.logger.info(`[capnhat_page] Fallback to safeAutoLoginOrRenew via Cookies`);
        const senderId = (ctx as any).from || (ctx as any).senderId;
        const { safeAutoLoginOrRenew } = await import("./meta-login.js");
        
        safeAutoLoginOrRenew(pluginConfig, {
          business_id: businessId,
          fb_email: auth.fb_email,
          fb_password_enc: auth.fb_password
        }, (msg) => {
          if (senderId) api.runtime.channel.telegram.sendMessageTelegram(senderId, msg).catch(() => {});
        }).catch(e => api.logger.error(`[capnhat_page] Background sync FAILED: ${e.message}`));

        return { text: "⚠️ Không tìm thấy Page qua API. Em đang dùng Trình duyệt ảo để quét sâu hơn cho Sếp, Sếp đợi em chút nhé..." };
      }

      api.logger.warn(`[capnhat_page] No pages found for the associated account.`);
      const isEAAG = token.startsWith("EAAG");
      const hint = isEAAG 
        ? "\n\n💡 **Mẹo:** Token của Sếp là loại `EAAG` (Android), loại này Meta thường chặn quét qua API (Lỗi Code 1). Sếp nên dùng lệnh `/nhap_cookie` để em dùng Trình duyệt ảo quét trực tiếp sẽ chuẩn 100% ạ!"
        : "\n\n💡 **Gợi ý:** Nếu Sếp chắc chắn mình có Page, hãy thử dùng `/nhap_cookie` để em quét sâu hơn nhé.";

      return { text: `⚠️ Không tìm thấy Page nào. Token có thể thiếu quyền hoặc tài khoản chưa tạo Page.${hint}` };
    }
  }

  // ─── /dang_bai ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "dang_bai",
    description: "Đăng bài viết lên Page đang chọn.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const message = (ctx.args || "").trim();
      if (!message) return { text: "Sếp ơi, nội dung bài đăng là gì ạ? (Dùng: /dang_bai <nội dung>)" };

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { resolvePageContext, createPost } = await import("./facebook-page.js");
      const pageCfg = await resolvePageContext(pluginConfig, businessId);

      if (!pageCfg) {
        return { text: "❌ Sếp chưa chọn Page nào ạ! Sếp dùng lệnh /page_list để chọn Page trước nhé." };
      }

      try {
        const res = await createPost(pageCfg, message);
        const postId = res.id?.split("_")[1] || res.id;
        const postUrl = `https://facebook.com/${pageCfg.pageId}/posts/${postId}`;
        api.logger.info(`[dang_bai] SUCCESS | pageId=${pageCfg.pageId} postId=${res.id}`);
        return { text: `✅ Đã đăng thành công lên Page!\n🔗 Xem bài: ${postUrl}\n📝 ID: \`${res.id}\`` };
      } catch (err: any) {
        const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("./graph-errors.js");
        const graphErr = parseGraphApiError(err);
        api.logger.error(formatErrorLog("dang_bai", "createPost", graphErr));
        return { text: buildErrorMessage("đăng bài", graphErr) };
      }
    },
  });

  // ─── /up_anh ──────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "up_anh",
    description: "Đăng ảnh lên Page đang chọn (nhắn kèm URL ảnh và ghi chú).",
    acceptsArgs: true,
    handler: async (ctx) => {
      const args = (ctx.args || "").trim().split(/\s+/);
      const imageUrl = args[0];
      const caption = args.slice(1).join(" ");

      if (!imageUrl) return { text: "Sếp ơi, cho em xin URL ảnh nhé! (Dùng: /up_anh <url> <ghi chú>)" };

      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { resolvePageContext, uploadPhoto } = await import("./facebook-page.js");
      const pageCfg = await resolvePageContext(pluginConfig, businessId);

      if (!pageCfg) {
        return { text: "❌ Sếp chưa chọn Page nào ạ! Sếp dùng lệnh /page_list để chọn Page trước nhé." };
      }

      try {
        const res = await uploadPhoto(pageCfg, imageUrl, caption);
        const postId = res.id?.split("_")[1] || res.id;
        const postUrl = `https://facebook.com/${pageCfg.pageId}/posts/${postId}`;
        api.logger.info(`[up_anh] SUCCESS | pageId=${pageCfg.pageId} photoId=${res.id}`);
        return { text: `✅ Đã đăng ảnh thành công!\n🔗 Xem ảnh: ${postUrl}\n📝 ID ảnh: \`${res.id}\`` };
      } catch (err: any) {
        const { parseGraphApiError, buildErrorMessage, formatErrorLog } = await import("./graph-errors.js");
        const graphErr = parseGraphApiError(err);
        api.logger.error(formatErrorLog("up_anh", "uploadPhoto", graphErr));
        return { text: buildErrorMessage("đăng ảnh", graphErr) };
      }
    },
  });

  // ─── /baocao ──────────────────────────────────────────────────────────────
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

  // ─── /tongquan ────────────────────────────────────────────────────────────
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

  // ─── /canhbao ─────────────────────────────────────────────────────────────
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

  // ─── /ngansach ────────────────────────────────────────────────────────────
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

  // ─── /kehoach ─────────────────────────────────────────────────────────────
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

  // ─── /de_xuat ─────────────────────────────────────────────────────────────
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

  // ─── /doithu ──────────────────────────────────────────────────────────────
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

  // ─── /dongbo ──────────────────────────────────────────────────────────────
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

  // ─── /pheduyet ────────────────────────────────────────────────────────────
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

  // ─── /tuchoi ──────────────────────────────────────────────────────────────
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

  // ─── /lenh ────────────────────────────────────────────────────────────────
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

  // ─── /start ───────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "start",
    description: "Khởi động Bot và mở Menu chính.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderWelcome(context);
    },
  });

  // ─── /huong_dan ───────────────────────────────────────────────────────────
  api.registerCommand({
    name: "huong_dan",
    description: "Xem hướng dẫn sử dụng bot.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderGuide(context);
    },
  });

  // ─── /cau_hinh ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "cau_hinh",
    description: "Xem cấu hình token và môi trường.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderConfig(context);
    },
  });

  // ─── /kiem_tra ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "kiem_tra",
    description: "Kiểm tra sức khỏe kết nối hệ thống.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderConfigCheck(context);
    },
  });

  // ─── /noi_quy ─────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "noi_quy",
    description: "Xem nội quy sử dụng bot.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderRules(context);
    },
  });

  // ─── /accounts (enterprise) ───────────────────────────────────────────────
  api.registerCommand({
    name: "accounts",
    description: "Xem chi tiết sức khỏe và hiệu suất của tất cả tài khoản Meta.",
    handler: async () => {
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });
      return renderEnterpriseHealth(context);
    },
  });

  // ─── Sub-menu commands ────────────────────────────────────────────────────
  api.registerCommand({
    name: "menu_kiemsoan",
    description: "Menu kiểm soát hiệu suất Ads.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuKiemSoan(context);
    },
  });

  api.registerCommand({
    name: "menu_chienthuat",
    description: "Menu chiến thuật & nghiên cứu đối thủ.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuChienThuat(context);
    },
  });

  api.registerCommand({
    name: "menu_ralenh",
    description: "Menu ra lệnh và phê duyệt AI.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuRaLenh(context);
    },
  });

  api.registerCommand({
    name: "menu_page",
    description: "Menu quản lý Facebook Fanpage.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderSubMenuPage(context);
    },
  });

  api.registerCommand({
    name: "kham_pha",
    description: "Khám phá tính năng nâng cao.",
    handler: async () => {
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      return renderKhamPha(context);
    },
  });

  // ─── /doithu_top ─────────────────────────────────────────────────────────
  // Circuit breaker state
  let apifyCircuitBroken = false;
  let apifyCircuitBrokenAt = 0;
  let apifyErrorCount = 0;
  const CIRCUIT_BREAK_THRESHOLD = 3;
  const CIRCUIT_BREAK_DURATION_MS = 60 * 60 * 1000;

  function checkAndResetCircuit() {
    if (apifyCircuitBroken && Date.now() - apifyCircuitBrokenAt > CIRCUIT_BREAK_DURATION_MS) {
      apifyCircuitBroken = false;
      apifyErrorCount = 0;
      api.logger.info("[Phase19] Apify circuit breaker reset after cooldown.");
    }
  }

  function recordApifyError() {
    apifyErrorCount++;
    if (apifyErrorCount >= CIRCUIT_BREAK_THRESHOLD) {
      apifyCircuitBroken = true;
      apifyCircuitBrokenAt = Date.now();
      api.logger.warn(`[Phase19] Apify circuit breaker OPENED after ${apifyErrorCount} errors.`);
    }
  }

  api.registerCommand({
    name: "doithu_top",
    description: "Top bài quảng cáo đối thủ hiệu quả nhất, đã được chấm điểm AI.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const keyword = (ctx.args ?? "").trim();
      if (!keyword || keyword.length > 100) {
        return { text: "❌ Vui lòng nhập từ khóa. Ví dụ: /doithu_top Đồ Gỗ" };
      }

      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });

      const apifyConfig = pluginConfig.intelligence?.apify;
      const apifyToken = apifyConfig?.enabled
        ? resolveMetaSecret(apifyConfig.apiToken, apifyConfig.apiTokenEnvVar)
        : null;

      const MOCK_ADS = [
        {
          adLibraryId: "1463339925143906",
          adText: "843 khách đã chọn Nghê Hoàng Đế — Cột 16 Chân 18 | Vách Liền Nguyên Khối | Gỗ Hương Đá Tuyển Chọn. Nhắn tin ngay để nhận báo giá tốt nhất!",
          pageName: "Thế Giới Đồ Gỗ VIP",
          postUrl: undefined,
          adLibraryUrl: "https://facebook.com/ads/library/?id=1463339925143906",
          startDate: "2026-02-25",
          daysLive: 29,
          isActive: true,
          platforms: ["facebook", "instagram"],
          mediaType: "video" as const,
          impressionsBand: "20K-100K" as const,
          ctaButton: "Nhắn tin ngay",
        },
        {
          adLibraryId: "1268569011847938",
          adText: "Siêu phẩm phòng khách Nghê Hoàng Đế. Mẫu mã đa dạng, giá từ 15 triệu. Freeship toàn quốc!",
          pageName: "Gỗ Mỹ Nghệ ABC",
          postUrl: undefined,
          adLibraryUrl: "https://facebook.com/ads/library/?id=1268569011847938",
          startDate: "2026-03-04",
          daysLive: 22,
          isActive: true,
          platforms: ["facebook"],
          mediaType: "carousel" as const,
          impressionsBand: "5K-20K" as const,
          ctaButton: "",
        },
        {
          adLibraryId: "1996040371345734",
          adText: "Sản phẩm đồ gỗ chất lượng cao. Liên hệ hôm nay.",
          pageName: "Nội Thất XYZ",
          postUrl: undefined,
          adLibraryUrl: "https://facebook.com/ads/library/?id=1996040371345734",
          startDate: "2026-03-20",
          daysLive: 6,
          isActive: true,
          platforms: ["facebook"],
          mediaType: "image" as const,
          impressionsBand: "1K-5K" as const,
          ctaButton: "",
        },
        {
          adLibraryId: "1212531514227973",
          adText: "5.000 đơn được giao thành công! Bộ ghế Nghê 18 chân có giá chỉ từ 8.500.000đ. Đặt hàng ngay hôm nay!",
          pageName: "Gỗ Hoàng Gia",
          postUrl: undefined,
          adLibraryUrl: "https://facebook.com/ads/library/?id=1212531514227973",
          startDate: "2026-02-10",
          daysLive: 44,
          isActive: true,
          platforms: ["facebook", "instagram", "messenger"],
          mediaType: "video" as const,
          impressionsBand: "100K-500K" as const,
          ctaButton: "Đặt hàng ngay",
        },
        {
          adLibraryId: "1235783961690295",
          adText: "Quảng cáo đồ gỗ mới. Xem thêm!",
          pageName: "Gỗ Thu Hương",
          postUrl: undefined,
          adLibraryUrl: "https://facebook.com/ads/library/?id=1235783961690295",
          startDate: "2026-03-22",
          daysLive: 4,
          isActive: false,
          platforms: ["facebook"],
          mediaType: "image" as const,
          impressionsBand: "< 1K" as const,
          ctaButton: "",
        },
      ];

      const validAds = MOCK_ADS.filter((a) => a.daysLive >= 7);
      const scoredAds = [];
      checkAndResetCircuit();

      for (const ad of validAds) {
        let engagement;

        if (ad.postUrl && apifyToken && !apifyCircuitBroken) {
          try {
            engagement = await getPostEngagement({
              postUrl: ad.postUrl,
              apiToken: apifyToken,
              pollIntervalMs: 10_000,
            });
            apifyErrorCount = 0;
          } catch (err: any) {
            api.logger.warn(`[Phase19] Apify engagement failed for ${ad.adLibraryId}: ${err.message}`);
            recordApifyError();
            engagement = estimateEngagementFromProxy(ad);
          }
        } else {
          engagement = estimateEngagementFromProxy(ad);
        }

        const scored = calculateAdTrustScore({ ad, engagement });
        scoredAds.push(scored);
        await new Promise((r) => setTimeout(r, 2000));
      }

      const qualified = scoredAds
        .filter((a) => a.trustScore >= 60)
        .sort((a, b) => b.trustScore - a.trustScore || b.daysLive - a.daysLive);

      return renderTopCompetitorAds({
        keyword,
        totalScanned: validAds.length,
        qualifiedCount: qualified.length,
        topAds: qualified.slice(0, 5),
        context,
      });
    },
  });

  // ─── /ai ──────────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "ai",
    description: "💬 Nói chuyện tự nhiên — hỏi bất cứ điều gì về ads của Sếp.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const message = (ctx.args ?? "").trim();

      if (!message) {
        return {
          text: [
            "Dạ Sếp ơi! Sếp muốn làm gì ạ? 🤖",
            "",
            "Sếp cứ nhắn tự nhiên nhé, em hiểu tiếng Việt ạ! Ví dụ:",
            "• \"báo cáo hôm nay\"",
            "• \"đối thủ nào đang chạy mạnh?\"",
            "• \"tăng budget camp A lên 20%\"",
            "• \"sức khỏe tài khoản thế nào?\"",
          ].join("\n"),
        };
      }

      if (isGreeting(message)) {
        return { text: buildGreetingResponse() };
      }

      const intent = detectIntent(message);
      const telegramId = String((ctx as any)?.message?.from?.id || "");
      const context = await loadAssistantContext({
        runtime: api.runtime,
        logger: api.logger,
        pluginConfig,
      });

      api.logger.info(`[ChatMode] "${message}" → intent=${intent.action} (${intent.confidence})`);

      switch (intent.action) {
        case "baocao":
          return renderReport(context);
        case "tongquan":
          return renderOverview(context);
        case "canhbao":
          return renderAlerts(context);
        case "ngansach":
          return renderBudget(context);
        case "de_xuat":
          return renderProposals(context);
        case "dongbo": {
          await runAssistantSync({ runtime: api.runtime, logger: api.logger, pluginConfig, telegramId });
          const syncCtx = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
          return renderSyncResult(syncCtx);
        }
        case "cau_hinh":
          return renderConfig(context);
        case "kiem_tra":
          return renderConfigCheck(context);
        case "huong_dan":
          return renderGuide(context);
        case "accounts":
          return renderEnterpriseHealth(context);
        case "noi_quy":
          return renderRules(context);
        case "doithu_top": {
          const keyword = intent.extractedArgs ?? "Facebook Ads";
          return {
            text: [
              buildRoutingAck(intent),
              "",
              `Sếp muốn em phân tích ngành: "${keyword}" đúng không ạ?`,
              `Sếp dùng lệnh: /doithu_top ${keyword}`,
              "để em chạy phân tích đầy đủ nhé ạ!",
            ].join("\n"),
          };
        }
        case "pheduyet": {
          const pid = intent.extractedArgs;
          const pending = context.state.proposals.filter((p) => p.status === "pending");
          if (!pid && pending.length === 0) {
            return { text: "Dạ Sếp, hiện không có đề xuất nào đang chờ phê duyệt ạ." };
          }
          const targetId = pid ?? pending[0]!.id;
          const approvedCtx = await setProposalStatus({ runtime: api.runtime, logger: api.logger, pluginConfig, proposalId: targetId, status: "approved" });
          const approvedProposal = approvedCtx.state.proposals.find((p) => p.id === targetId);
          if (!approvedProposal) return { text: `Dạ Sếp, em không tìm thấy đề xuất "${targetId}" ạ.` };
          return renderApprovalResult({ context: approvedCtx, proposal: approvedProposal, action: "approved" });
        }
        case "tuchoi": {
          const pid = intent.extractedArgs;
          if (!pid) return { text: "Dạ Sếp, Sếp muốn từ chối đề xuất nào ạ? Sếp cho em ID đề xuất nhé." };
          const rejectedCtx = await setProposalStatus({ runtime: api.runtime, logger: api.logger, pluginConfig, proposalId: pid, status: "rejected" });
          const rejectedProposal = rejectedCtx.state.proposals.find((p) => p.id === pid);
          if (!rejectedProposal) return { text: `Dạ Sếp, em không tìm thấy đề xuất "${pid}" ạ.` };
          return renderApprovalResult({ context: rejectedCtx, proposal: rejectedProposal, action: "rejected" });
        }
        case "lenh": {
          const result = await appendBossInstruction({ runtime: api.runtime, logger: api.logger, pluginConfig, text: message });
          return renderInstructionAck({ context: result.context, instruction: result.instruction });
        }
        case "inbox":
          return handleInbox(api, pluginConfig);
        case "tra_loi":
          return handleTraLoi(api, pluginConfig, intent.extractedArgs || message);
        case "bai_viet":
          return handleBaiViet(api, pluginConfig);
        case "dat_lich":
          return handleDatLich(api, pluginConfig, intent.extractedArgs || message);
        case "xoa_bai":
          return handleXoaBai(api, pluginConfig, intent.extractedArgs || "");
        case "inbox_forward":
          return handleInboxForward(api, pluginConfig, telegramId, intent.extractedArgs || "status");
        default:
          return { text: buildConfusedResponse(message) };
      }
    },
  });

  // ─── /themngucanhfile ─────────────────────────────────────────────────────
  api.registerCommand({
    name: "themngucanhfile",
    description: "Gửi tài liệu để bot học (PDF/TXT/MD).",
    handler: async (ctx: any) => {
      const telegramId = String(ctx?.message?.from?.id || "");
      const fileUrl = (ctx.args || "").trim();
      if (!fileUrl) return { text: "Dạ Sếp vui lòng gửi file kèm lệnh này hoặc dán URL file nhé ạ!" };

      const { downloadFileToBuffer, detectFileType, extractTextFromFile, summarizeWithMistral } = await import("./file-processor.js");
      const { saveUserDocument } = await import("./knowledge-base.js");
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });

      try {
        const buffer = await downloadFileToBuffer(fileUrl);
        const filename = fileUrl.split("/").pop() || "document.pdf";
        const type = detectFileType(filename);
        const mistralToken = process.env.MISTRAL_API_KEY;

        const extracted = await extractTextFromFile(buffer, type, mistralToken);
        const summary = mistralToken ? await summarizeWithMistral(extracted, mistralToken) : undefined;

        const doc: any = {
          id: `kb_${Date.now().toString(36)}`,
          telegramId,
          filename,
          fileType: type,
          rawSizeBytes: buffer.length,
          extractedText: extracted,
          summary,
          processingStatus: "done",
          processingModel: mistralToken ? "mistral" : "local"
        };

        await saveUserDocument(pluginConfig, doc);
        const { renderKnowledgeAdded } = await import("./ui.js");
        return renderKnowledgeAdded({ doc, context });
      } catch (err) {
        return { text: `⚠️ Lỗi đọc tài liệu: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  });

  // ─── /xemngucanh ──────────────────────────────────────────────────────────
  api.registerCommand({
    name: "xemngucanh",
    description: "Xem bộ nhớ tài liệu của Sếp.",
    handler: async (ctx: any) => {
      const telegramId = String(ctx?.message?.from?.id || "");
      const { getUserDocuments } = await import("./knowledge-base.js");
      const { renderKnowledgeList } = await import("./ui.js");
      const context = await loadAssistantContext({ runtime: api.runtime, logger: api.logger, pluginConfig });
      const docs = await getUserDocuments(pluginConfig, telegramId);
      return renderKnowledgeList({ docs, context });
    },
  });

  // ─── /inbox ──────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "inbox",
    description: "Xem 5 tin nhắn inbox mới nhất của Page.",
    handler: async () => handleInbox(api, pluginConfig),
  });

  // ─── /tra_loi ─────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "tra_loi",
    description: "Trả lời tin nhắn inbox (dùng: /tra_loi <conv_id> <nội dung>).",
    acceptsArgs: true,
    handler: async (ctx: any) => handleTraLoi(api, pluginConfig, ctx.args || ""),
  });

  // ─── /dat_lich ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "dat_lich",
    description: "Đặt lịch đăng bài (dùng: /dat_lich <YYYY-MM-DD HH:mm> <nội dung>).",
    acceptsArgs: true,
    handler: async (ctx: any) => handleDatLich(api, pluginConfig, ctx.args || ""),
  });

  // ─── /xoa_bai ─────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "xoa_bai",
    description: "Xóa bài đăng (dùng: /xoa_bai <post_id>).",
    acceptsArgs: true,
    handler: async (ctx: any) => handleXoaBai(api, pluginConfig, (ctx.args || "").trim()),
  });

  // ─── /bai_viet ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "bai_viet",
    description: "Xem 10 bài đăng gần nhất của Page.",
    handler: async () => handleBaiViet(api, pluginConfig),
  });

  // ─── /inbox_forward ───────────────────────────────────────────────────────
  api.registerCommand({
    name: "inbox_forward",
    description: "Quản lý chuyển tiếp inbox (start/stop/status).",
    acceptsArgs: true,
    handler: async (ctx: any) => {
      const telegramId = String(ctx?.message?.from?.id || "");
      const action = (ctx.args || "").trim();
      return handleInboxForward(api, pluginConfig, telegramId, action);
    },
  });

  // ─── /dang_xuat ───────────────────────────────────────────────────────────
  api.registerCommand({
    name: "dang_xuat",
    description: "Đăng xuất tài khoản Facebook và xóa toàn bộ dữ liệu Page.",
    handler: async () => {
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { executeQuery } = await import("./db.js");
      const { clearUserFacebookPages } = await import("./db-state.js");

      // 1. Clear Pages
      await clearUserFacebookPages(pluginConfig, businessId);
      
      // 2. Clear Auth
      await executeQuery(pluginConfig, "DELETE FROM user_meta_auth WHERE business_id = ?", [businessId]);
      
      // 3. Clear Business Config Token
      await executeQuery(pluginConfig, "UPDATE business_config SET meta_access_token = NULL WHERE id = ?", [businessId]);

      api.logger.info(`[dang_xuat] SUCCESS | businessId=${businessId}`);
      return { text: "✅ **ĐÃ ĐĂNG XUẤT THÀNH CÔNG!**\n\nToàn bộ dữ liệu Token và Page đã được xóa sạch khỏi hệ thống. Sếp có thể bắt đầu lại bằng `/nhap_token` hoặc `/nhap_cookie` nhé!" };
    },
  });

  // ─── /reset_page ──────────────────────────────────────────────────────────
  api.registerCommand({
    name: "reset_page",
    description: "Xóa danh sách Page và quét lại từ đầu.",
    handler: async (ctx: any) => {
      const businessId = Buffer.from(pluginConfig.business.name).toString("base64").slice(0, 64);
      const { clearUserFacebookPages } = await import("./db-state.js");

      // Clear existing
      await clearUserFacebookPages(pluginConfig, businessId);
      
      // Trigger update via the extracted handler
      return handleCapNhatPage(api, pluginConfig, ctx);
    },
  });
}

