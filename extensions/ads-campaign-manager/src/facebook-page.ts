/**
 * Facebook Page API Service — FIXED v2.0
 *
 * FIXES:
 * 1. resolvePageContext() — 4-tier fallback: selected_page → any_page_db → live_api_fetch → env_vars
 * 2. graphPost/graphGet — dùng Authorization header thay body token để tránh bị block
 * 3. createPost/uploadPhoto — error handling chi tiết hơn
 * 4. resolvePageTokenByPageId() — tự fetch page token từ user token khi cần
 */

import { executeQuery } from "./db.js";
import logger from "./logger.js";

export interface PagePostStats {
  postId: string;
  likes: number;
  comments: number;
  shares: number;
  reach?: number;
}

export interface PageInboxThread {
  id: string;
  snippet: string;
  unread: number;
  updatedAt: string;
  participants: string[];
}

export interface FacebookPageConfig {
  pageId?: string;
  accessToken?: string;
  apiVersion?: string;
  businessId?: string;
}

// ─── Tier 1–4 Page Context Resolution ────────────────────────────────────────

/**
 * resolvePageContext — 4-tier fallback, không bao giờ trả null nếu có token
 *
 * Tier 1: Selected page trong DB (is_selected = TRUE)
 * Tier 2: Bất kỳ page nào trong DB (auto-select)
 * Tier 3: Fetch live từ Meta API dùng stored user token
 * Tier 4: ENV variables (FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN)
 */
export async function resolvePageContext(
  config: any,
  businessId: string
): Promise<FacebookPageConfig | null> {
  const apiVersion = process.env.META_GRAPH_VERSION || "v25.0";

  // ── Tier 1: Selected page ──────────────────────────────────────────────────
  try {
    const rows = await executeQuery<any[]>(
      config,
      "SELECT id, access_token as accessToken FROM user_facebook_pages WHERE business_id = ? AND is_selected = TRUE LIMIT 1",
      [businessId]
    );
    if (rows && rows.length > 0 && rows[0].accessToken) {
      logger.info(`[PAGE-CTX] Tier 1: selected page ${rows[0].id}`);
      return { pageId: rows[0].id, accessToken: rows[0].accessToken, apiVersion, businessId };
    }
  } catch (e: any) {
    logger.warn(`[PAGE-CTX] Tier 1 DB error: ${e.message}`);
  }

  // ── Tier 2: Any page in DB (auto-select first) ─────────────────────────────
  try {
    const rows = await executeQuery<any[]>(
      config,
      "SELECT id, access_token as accessToken FROM user_facebook_pages WHERE business_id = ? LIMIT 1",
      [businessId]
    );
    if (rows && rows.length > 0 && rows[0].accessToken) {
      logger.info(`[PAGE-CTX] Tier 2: auto-select page ${rows[0].id}`);
      // Auto-select this page silently
      await executeQuery(config,
        "UPDATE user_facebook_pages SET is_selected = FALSE WHERE business_id = ?",
        [businessId]
      ).catch(() => {});
      await executeQuery(config,
        "UPDATE user_facebook_pages SET is_selected = TRUE WHERE id = ?",
        [rows[0].id]
      ).catch(() => {});
      return { pageId: rows[0].id, accessToken: rows[0].accessToken, apiVersion, businessId };
    }
  } catch (e: any) {
    logger.warn(`[PAGE-CTX] Tier 2 DB error: ${e.message}`);
  }

  // ── Tier 3: Fetch live from Meta API using stored user token ───────────────
  try {
    // Source 1: business_config table
    const bizRow = await executeQuery<any[]>(
      config,
      "SELECT meta_access_token FROM business_config WHERE id = ?",
      [businessId]
    ).catch(() => null);

    // Source 2: user_meta_auth table (where /nhap_token saves tokens)
    const userAuthRow = await executeQuery<any[]>(
      config,
      "SELECT access_token FROM user_meta_auth WHERE business_id = ? AND access_token IS NOT NULL ORDER BY updated_at DESC LIMIT 1",
      [businessId]
    ).catch(() => null);

    const userToken = bizRow?.[0]?.meta_access_token
      || userAuthRow?.[0]?.access_token
      || process.env.META_ACCESS_TOKEN;

    if (userToken) {
      logger.info(`[PAGE-CTX] Tier 3: fetching pages live from Meta API...`);
      const pages = await fetchAndSavePagesLive(config, businessId, userToken, apiVersion);
      if (pages && pages.length > 0) {
        logger.info(`[PAGE-CTX] Tier 3: found ${pages.length} pages, using first`);
        return {
          pageId: pages[0].id,
          accessToken: pages[0].access_token || userToken,
          apiVersion,
          businessId
        };
      }
    }
  } catch (e: any) {
    logger.warn(`[PAGE-CTX] Tier 3 live-fetch error: ${e.message}`);
  }

  // ── Tier 4: ENV variables ──────────────────────────────────────────────────
  const envPageId = process.env.FB_PAGE_ID;
  const envPageToken = process.env.FB_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (envPageId && envPageToken) {
    logger.info(`[PAGE-CTX] Tier 4: using ENV vars FB_PAGE_ID=${envPageId}`);
    return { pageId: envPageId, accessToken: envPageToken, apiVersion, businessId };
  }

  logger.error(`[PAGE-CTX] All tiers failed for businessId=${businessId}`);
  return null;
}

/**
 * Fetch pages from Meta API and save to DB.
 *
 * Uses 2-method approach:
 * Method 1: Bearer auth header (works for web-origin tokens from Graph API Explorer)
 * Method 2: Mobile-spoofed headers (works for EAAG/EAAB mobile tokens)
 */
async function fetchAndSavePagesLive(
  config: any,
  businessId: string,
  userToken: string,
  apiVersion: string
): Promise<any[]> {
  const fields = "id,name,category,access_token,tasks";
  let pages: any[] = [];

  // Method 1: Bearer auth (best for web tokens — no spoofing)
  try {
    const url = `https://graph.facebook.com/${apiVersion}/me/accounts?fields=${fields}&limit=100`;
    const res = await fetch(url, {
      headers: { "Authorization": `Bearer ${userToken}` }
    });
    if (res.ok) {
      const json = await res.json() as any;
      if (json?.data?.length > 0) {
        pages = json.data;
        logger.info(`[PAGE-CTX] fetchLive Method 1 (Bearer): found ${pages.length} pages`);
      }
    } else {
      const errBody = await res.text().catch(() => "");
      logger.warn(`[PAGE-CTX] fetchLive Method 1 failed: ${res.status} — ${errBody.slice(0, 100)}`);
    }
  } catch (e: any) {
    logger.warn(`[PAGE-CTX] fetchLive Method 1 error: ${e.message}`);
  }

  // Method 2: Mobile-spoofed headers (fallback for EAAG/EAAB tokens)
  if (pages.length === 0) {
    try {
      const url = `https://graph.facebook.com/${apiVersion}/me/accounts?fields=${fields}&access_token=${userToken}&limit=100`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "FBAN/FB4A;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/Google;FBBD/google;FBPN/com.facebook.katana;",
        }
      });
      if (res.ok) {
        const json = await res.json() as any;
        if (json?.data?.length > 0) {
          pages = json.data;
          logger.info(`[PAGE-CTX] fetchLive Method 2 (Mobile UA): found ${pages.length} pages`);
        }
      } else {
        const errBody = await res.text().catch(() => "");
        logger.warn(`[PAGE-CTX] fetchLive Method 2 failed: ${res.status} — ${errBody.slice(0, 100)}`);
      }
    } catch (e: any) {
      logger.warn(`[PAGE-CTX] fetchLive Method 2 error: ${e.message}`);
    }
  }

  // Save to DB if any pages found
  if (pages.length > 0) {
    const { saveUserFacebookPages } = await import("./db-state.js").catch(() => ({ saveUserFacebookPages: null }));
    if (saveUserFacebookPages) {
      await saveUserFacebookPages(config, businessId, "auto_fetch", pages).catch((e: any) =>
        logger.warn(`[PAGE-CTX] saveUserFacebookPages error: ${e.message}`)
      );
    }
    // Auto-select first
    if (pages[0]?.id) {
      await executeQuery(config,
        "UPDATE user_facebook_pages SET is_selected = TRUE WHERE id = ?",
        [pages[0].id]
      ).catch(() => {});
    }
  }

  return pages;
}

// ─── Config resolver ──────────────────────────────────────────────────────────

function resolveConfig(cfg: FacebookPageConfig): {
  pageId: string;
  token: string;
  baseUrl: string;
} {
  const token = cfg.accessToken || process.env.FB_PAGE_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || "";
  const pageId = cfg.pageId || process.env.FB_PAGE_ID || "";
  const version = cfg.apiVersion ?? process.env.META_GRAPH_VERSION ?? "v25.0";
  return { pageId, token, baseUrl: `https://graph.facebook.com/${version}` };
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

/**
 * Graph API GET — dùng Authorization header (ổn định hơn query param với tokens mới)
 */
async function graphGet(
  url: string,
  params: Record<string, string>,
  token: string
): Promise<unknown> {
  const qs = new URLSearchParams(params);
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
    "User-Agent": "FBAN/FB4A;FBAV/440.0.0.0.0;FBLC/vi_VN;FBPN/com.facebook.katana;",
  };
  const res = await fetch(`${url}?${qs.toString()}`, { headers });
  const body = await res.json() as any;
  if (!res.ok || body?.error) {
    const errMsg = body?.error?.message || `HTTP ${res.status}`;
    const errCode = body?.error?.code || res.status;
    throw new Error(`[${errCode}] ${errMsg}`);
  }
  return body;
}

/**
 * Graph API POST — hỗ trợ cả form-urlencoded và JSON
 */
async function graphPost(
  url: string,
  body: Record<string, string>,
  token: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/x-www-form-urlencoded",
    "Accept": "application/json",
    "User-Agent": "FBAN/FB4A;FBAV/440.0.0.0.0;FBLC/vi_VN;FBPN/com.facebook.katana;",
  };
  const formBody = new URLSearchParams(body);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: formBody.toString(),
  });
  const resBody = await res.json() as any;
  if (!res.ok || resBody?.error) {
    const errMsg = resBody?.error?.message || `HTTP ${res.status}`;
    const errCode = resBody?.error?.code || res.status;
    const errSubcode = resBody?.error?.error_subcode;
    throw new Error(`[${errCode}${errSubcode ? `/${errSubcode}` : ""}] ${errMsg}`);
  }
  return resBody;
}

async function graphDelete(url: string, token: string): Promise<unknown> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
  };
  const res = await fetch(url, { method: "DELETE", headers });
  const body = await res.json() as any;
  if (!res.ok || body?.error) {
    throw new Error(`[${body?.error?.code || res.status}] ${body?.error?.message || "DELETE failed"}`);
  }
  return body;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Đăng bài văn bản lên Fanpage */
export async function createPost(
  cfg: FacebookPageConfig,
  message: string
): Promise<{ id: string }> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  if (!pageId || !token) throw new Error("Thiếu pageId hoặc accessToken");
  return graphPost(`${baseUrl}/${pageId}/feed`, { message }, token) as Promise<{ id: string }>;
}

/** Đăng bài kèm ảnh lên Fanpage */
export async function uploadPhoto(
  cfg: FacebookPageConfig,
  imageUrl: string,
  caption: string
): Promise<{ id: string }> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  if (!pageId || !token) throw new Error("Thiếu pageId hoặc accessToken");
  return graphPost(`${baseUrl}/${pageId}/photos`, { url: imageUrl, caption }, token) as Promise<{ id: string }>;
}

/** Sửa nội dung bài đã đăng */
export async function editPost(
  cfg: FacebookPageConfig,
  postId: string,
  message: string
): Promise<{ success: boolean }> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphPost(`${baseUrl}/${postId}`, { message }, token) as Promise<{ success: boolean }>;
}

/** Lấy Like/Share/Comment của bài đăng */
export async function getPostStats(
  cfg: FacebookPageConfig,
  postId: string
): Promise<PagePostStats> {
  const { token, baseUrl } = resolveConfig(cfg);
  const data = (await graphGet(
    `${baseUrl}/${postId}`,
    { fields: "id,likes.summary(true),comments.summary(true),shares" },
    token
  )) as any;
  return {
    postId,
    likes: data?.likes?.summary?.total_count ?? 0,
    comments: data?.comments?.summary?.total_count ?? 0,
    shares: data?.shares?.count ?? 0,
  };
}

/** Đọc 5 tin nhắn inbox mới nhất */
export async function getPageInbox(
  cfg: FacebookPageConfig,
  limit = 5
): Promise<PageInboxThread[]> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  const data = (await graphGet(
    `${baseUrl}/${pageId}/conversations`,
    { fields: "id,snippet,unread_count,updated_time,participants", limit: String(limit) },
    token
  )) as any;
  return (data?.data ?? []).map((thread: any) => ({
    id: thread.id,
    snippet: thread.snippet ?? "",
    unread: thread.unread_count ?? 0,
    updatedAt: thread.updated_time ?? "",
    participants: (thread.participants?.data ?? []).map((p: any) => p.name),
  }));
}

/** Trả lời tin nhắn inbox (Sử dụng Send API chuẩn của Facebook) */
export async function replyToMessage(
  cfg: FacebookPageConfig,
  threadId: string,
  message: string
): Promise<{ id: string }> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);

  // 1. Fetch participants để tìm PSID của khách (loại trừ Page hiện tại)
  const threadData = (await graphGet(
    `${baseUrl}/${threadId}`,
    { fields: "participants" },
    token
  )) as any;

  const participants = threadData?.participants?.data || [];
  const customer = participants.find((p: any) => p.id !== pageId);
  if (!customer?.id) {
    throw new Error(`Không tìm thấy người dùng PSID hợp lệ trong hội thoại ${threadId}`);
  }

  // 2. Gửi tin nhắn qua /me/messages (Endpoint chuẩn cho Messenger Send API)
  const payload = {
    recipient: JSON.stringify({ id: customer.id }),
    message: JSON.stringify({ text: message }),
    messaging_type: "RESPONSE" // Theo chuẩn 24h window
  };

  return graphPost(`${baseUrl}/${pageId}/messages`, payload, token) as Promise<{ id: string }>;
}

/** Lấy top comment của bài đăng */
export async function getComments(
  cfg: FacebookPageConfig,
  postId: string,
  limit = 5
): Promise<Array<{ id: string; message: string; from: string }>> {
  const { token, baseUrl } = resolveConfig(cfg);
  const data = (await graphGet(
    `${baseUrl}/${postId}/comments`,
    { fields: "id,message,from", limit: String(limit) },
    token
  )) as any;
  return (data?.data ?? []).map((c: any) => ({
    id: c.id,
    message: c.message ?? "",
    from: c.from?.name ?? "Ẩn danh",
  }));
}

/** Lên lịch đăng bài */
export async function schedulePost(
  cfg: FacebookPageConfig,
  message: string,
  unixTimeSpanSeconds: number,
  link?: string
): Promise<{ id: string }> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  const payload: Record<string, string> = {
    message,
    published: "false",
    scheduled_publish_time: String(unixTimeSpanSeconds),
  };
  if (link) payload.link = link;
  return graphPost(`${baseUrl}/${pageId}/feed`, payload, token) as Promise<{ id: string }>;
}

/** Đăng video (dùng URL) */
export async function uploadVideo(
  cfg: FacebookPageConfig,
  videoUrl: string,
  description: string
): Promise<{ id: string }> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphPost(
    `${baseUrl}/${pageId}/videos`,
    { file_url: videoUrl, description },
    token
  ) as Promise<{ id: string }>;
}

/** Xóa bài đăng */
export async function deletePost(cfg: FacebookPageConfig, postId: string): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphDelete(`${baseUrl}/${postId}`, token);
}

/** Lấy danh sách bài đăng gần đây */
export async function getRecentPosts(cfg: FacebookPageConfig, limit = 10): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphGet(
    `${baseUrl}/${pageId}/published_posts`,
    { fields: "id,message,created_time", limit: String(limit) },
    token
  );
}

/** Lấy thông tin cơ bản của Page */
export async function getPageInfo(cfg: FacebookPageConfig): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphGet(
    `${baseUrl}/${pageId}`,
    { fields: "name,fan_count,followers_count,about" },
    token
  );
}

/** Like một bài đăng */
export async function likePost(cfg: FacebookPageConfig, postId: string): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphPost(`${baseUrl}/${postId}/likes`, {}, token);
}

/** Reply comment */
export async function replyToPostComment(
  cfg: FacebookPageConfig,
  commentId: string,
  message: string
): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphPost(`${baseUrl}/${commentId}/comments`, { message }, token);
}

/** Ẩn comment */
export async function hideComment(cfg: FacebookPageConfig, commentId: string): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphPost(`${baseUrl}/${commentId}`, { is_hidden: "true" }, token);
}

/** Xóa comment */
export async function deletePostComment(cfg: FacebookPageConfig, commentId: string): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphDelete(`${baseUrl}/${commentId}`, token);
}

/** Lấy Page Insights */
export async function getPageInsights(cfg: FacebookPageConfig): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphGet(
    `${baseUrl}/${pageId}/insights`,
    { metric: "page_fans,page_impressions", period: "day" },
    token
  );
}

/** Lấy Post Insights */
export async function getPostInsightsNode(cfg: FacebookPageConfig, postId: string): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphGet(
    `${baseUrl}/${postId}/insights`,
    { metric: "post_impressions,post_reactions_by_type_total" },
    token
  );
}

/** Xem danh sách Event */
export async function listEvents(cfg: FacebookPageConfig): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphGet(
    `${baseUrl}/${pageId}/events`,
    { fields: "name,start_time,description" },
    token
  );
}

/** Tạo Event */
export async function createEvent(
  cfg: FacebookPageConfig,
  name: string,
  startTime: string,
  description: string
): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphPost(`${baseUrl}/${pageId}/events`, { name, start_time: startTime, description }, token);
}

/** Xem danh sách Albums */
export async function listAlbums(cfg: FacebookPageConfig): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphGet(`${baseUrl}/${pageId}/albums`, { fields: "name,count" }, token);
}

/** Xem Page Roles */
export async function getPageRoles(cfg: FacebookPageConfig): Promise<any> {
  const { pageId, token, baseUrl } = resolveConfig(cfg);
  return graphGet(`${baseUrl}/${pageId}/roles`, {}, token);
}

/** Đăng bản nháp đã lưu */
export async function publishDraftPost(cfg: FacebookPageConfig, postId: string): Promise<any> {
  const { token, baseUrl } = resolveConfig(cfg);
  return graphPost(`${baseUrl}/${postId}`, { is_published: "true" }, token);
}

/**
 * resolvePageTokenByPageId — lấy Page Token từ User Token
 * Dùng khi chỉ có User Token nhưng cần Page Token để đăng bài
 */
export async function resolvePageTokenByPageId(
  userToken: string,
  pageId: string,
  apiVersion = "v25.0"
): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/${apiVersion}/${pageId}?fields=access_token&access_token=${userToken}`;
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${userToken}`,
        "User-Agent": "FBAN/FB4A;FBAV/440.0.0.0.0;FBLC/vi_VN;FBPN/com.facebook.katana;",
      }
    });
    const data = await res.json() as any;
    return data?.access_token || null;
  } catch {
    return null;
  }
}
