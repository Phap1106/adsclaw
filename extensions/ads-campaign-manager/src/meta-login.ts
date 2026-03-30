// //extensions/ads-campaign-manager/src/meta-login.ts
// import { chromium } from "playwright-extra";
// // @ts-ignore – puppeteer stealth plugin is compatible with playwright-extra
// import stealthPlugin from "puppeteer-extra-plugin-stealth";
// import * as otplibModule from "otplib";
// import pLimit from "p-limit";
// import os from "node:os";
// import path from "node:path";
// import { decrypt } from "./crypto-utils.js";
// import axios from "axios";
// import { HttpsProxyAgent } from "https-proxy-agent";
// import logger from "./logger.js";
// import { executeQuery } from "./db.js";
// import type { AdsManagerPluginConfig } from "./types.js";
// import { saveUserMetaAuth, getUserMetaAuth, incrementMetaSuccess, recordMetaFailure, saveUserFacebookPages } from "./db-state.js";
// import { globalWorkerPool } from "./worker-pool.js";

// // Apply stealth plugin once at module load
// // @ts-ignore
// chromium.use(stealthPlugin());

// // Max concurrent login sessions are now balanced via globalWorkerPool

// // ─── Types ────────────────────────────────────────────────────────────────────

// export interface MetaAuthPayload {
//   business_id: string;
//   fb_email: string;
//   fb_password_enc: string;   // AES-256 encrypted password
//   fb_2fa_secret_enc?: string; // AES-256 encrypted TOTP secret (optional)
//   proxy_url?: string;
//   device_fingerprint?: any;
// }

// export interface TokenResult {
//   token: string;
//   expiresAt: number; // Unix ms
// }

// /**
//  * Checks if a token is a mobile internal token (EAAG, EAAB, EAAW).
//  * Internal tokens belong to Facebook apps and should not be renewed via custom App IDs.
//  */
// export function isMobileInternalToken(token: string): boolean {
//   return token.startsWith("EAAG") || token.startsWith("EAAB") || token.startsWith("EAAW");
// }

// export interface MetaLoginResult {
//   token: string;
//   expiresAt: number;
// }

// /**
//  * Decode Facebook's proprietary HTML-encoded token format.
//  * When tokens are embedded in Ads Manager HTML, Facebook encodes:
//  *   + → ZB,  / → ZC,  = → ZA,  padding → ZD
//  * This function reverses that encoding so the token works with Graph API.
//  *
//  * Reference: Facebook Developer Community reports + verified by curl testing.
//  */
// export function decodeFbHtmlToken(token: string): string {
//   if (!token || !token.startsWith("EAA")) return token;
//   // Only decode if the token actually contains FB encoding markers
//   if (!/Z[ABCD]/.test(token)) return token;
  
//   const decoded = token
//     .replace(/ZD/g, "")   // Remove padding artifacts first
//     .replace(/ZB/g, "+")  // + was encoded as ZB
//     .replace(/ZC/g, "/")  // / was encoded as ZC
//     .replace(/ZA/g, "="); // = was encoded as ZA
  
//   logger.info(`[TOKEN] Decoded FB HTML-encoded token: ${token.substring(0, 12)}... (${token.length} → ${decoded.length} chars)`);
//   return decoded;
// }

// /**
//  * Quick validation: call /me?fields=id,name to check if token is alive.
//  * Returns { valid, userId, userName, error } for diagnostic purposes.
//  */
// export async function validateTokenBasic(token: string): Promise<{
//   valid: boolean;
//   userId?: string;
//   userName?: string;
//   error?: string;
//   errorCode?: number;
// }> {
//   const version = process.env.META_GRAPH_VERSION || "v25.0";
//   try {
//     const url = `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
//     const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
//     const json: any = await res.json();
    
//     if (json.id) {
//       logger.info(`[TOKEN] Validation OK: id=${json.id} name=${json.name}`);
//       return { valid: true, userId: json.id, userName: json.name };
//     }
    
//     const errMsg = json.error?.message || "Unknown error";
//     const errCode = json.error?.code || 0;
//     logger.warn(`[TOKEN] Validation FAILED: ${errMsg} (code=${errCode})`);
//     return { valid: false, error: errMsg, errorCode: errCode };
//   } catch (e: any) {
//     logger.error(`[TOKEN] Validation network error: ${e.message}`);
//     return { valid: false, error: e.message };
//   }
// }

// // ─── Fingerprint Pool (Anti-Detection) ───────────────────────────────────────

// /**
//  * Pool of realistic browser fingerprints to rotate per login session.
//  * Each profile simulates a different real user device/location.
//  */
// const FINGERPRINT_POOL = [
//   // ── Windows Chrome ─────────────────────────────────────────────────────────
//   {
//     userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
//     viewport: { width: 1920, height: 1080 },
//     locale: "vi-VN",
//     timezone: "Asia/Ho_Chi_Minh",
//     platform: "Win32",
//     colorScheme: "light" as const,
//     deviceScaleFactor: 1,
//   },
//   {
//     userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
//     viewport: { width: 1366, height: 768 },
//     locale: "vi-VN",
//     timezone: "Asia/Ho_Chi_Minh",
//     platform: "Win32",
//     colorScheme: "light" as const,
//     deviceScaleFactor: 1,
//   },
//   {
//     userAgent: "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
//     viewport: { width: 1440, height: 900 },
//     locale: "en-US",
//     timezone: "Asia/Ho_Chi_Minh",
//     platform: "Win32",
//     colorScheme: "dark" as const,
//     deviceScaleFactor: 1,
//   },
//   // ── macOS Chrome ────────────────────────────────────────────────────────────
//   {
//     userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
//     viewport: { width: 1512, height: 982 },
//     locale: "vi-VN",
//     timezone: "Asia/Ho_Chi_Minh",
//     platform: "MacIntel",
//     colorScheme: "light" as const,
//     deviceScaleFactor: 2,
//   },
//   // ── macOS Safari ────────────────────────────────────────────────────────────
//   {
//     userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
//     viewport: { width: 1280, height: 800 },
//     locale: "vi-VN",
//     timezone: "Asia/Ho_Chi_Minh",
//     platform: "MacIntel",
//     colorScheme: "light" as const,
//     deviceScaleFactor: 2,
//   },
//   // ── Mobile Android (simulated desktop viewport) ────────────────────────────
//   {
//     userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
//     viewport: { width: 390, height: 844 },
//     locale: "vi-VN",
//     timezone: "Asia/Ho_Chi_Minh",
//     platform: "Linux armv8l",
//     colorScheme: "light" as const,
//     deviceScaleFactor: 3,
//   },
// ];

// /**
//  * Returns a randomly selected fingerprint profile.
//  */
// function pickFingerprint(existing?: any) {
//   if (existing) return existing;
//   return FINGERPRINT_POOL[Math.floor(Math.random() * FINGERPRINT_POOL.length)];
// }

// /**
//  * Generates a random human-like delay between min and max ms.
//  */
// function humanDelay(minMs = 800, maxMs = 2500): Promise<void> {
//   const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
//   return new Promise((r) => setTimeout(r, delay));
// }

// /**
//  * Types text character-by-character with random intervals to mimic human typing.
//  */
// async function humanType(page: any, selector: string, text: string): Promise<void> {
//   // Ensure element is visible and stable before clicking
//   await page.waitForSelector(selector, { state: "visible", timeout: 15000 });
//   await page.click(selector);
//   await humanDelay(300, 800);
//   for (const char of text) {
//     await page.keyboard.type(char, { delay: Math.floor(Math.random() * 130) + 40 });
//   }
// }

// // ─── 2FA Code Retrieval ──────────────────────────────────────────────────────

// async function get2FACode(secretEnc: string): Promise<string> {
//   const secret = decrypt(secretEnc);

//   // 1. Primary: local otplib
//   try {
//     const authenticator = (otplibModule as any).authenticator ?? (otplibModule as any).totp;
//     if (authenticator) {
//       const code = authenticator.generate(secret);
//       logger.info("[2FA] Code generated via otplib (local).");
//       return code;
//     }
//   } catch (e: any) {
//     logger.warn(`[2FA] otplib failed: ${e.message}`);
//   }

//   // 2. Fallback A: 2faotp.live
//   try {
//     const res = await fetch(`https://2faotp.live/${secret}`, { signal: AbortSignal.timeout(5000) });
//     const json: any = await res.json();
//     if (json.success && json.code) {
//       logger.info("[2FA] Code from 2faotp.live fallback.");
//       return json.code;
//     }
//   } catch (e: any) {
//     logger.warn(`[2FA] 2faotp.live failed: ${e.message}`);
//   }

//   // 3. Fallback B: authenticatorapi.com (plain text response)
//   try {
//     const res = await fetch(`https://www.authenticatorapi.com/Validate.aspx?SecretCode=${secret}&Pin=NONE`, { signal: AbortSignal.timeout(5000) });
//     const text = await res.text();
//     const match = text.match(/\d{6}/);
//     if (match) {
//       logger.info("[2FA] Code from authenticatorapi.com fallback.");
//       return match[0];
//     }
//   } catch (e: any) {
//     logger.warn(`[2FA] authenticatorapi.com failed: ${e.message}`);
//   }

//   throw new Error("[2FA] All methods failed. Cannot generate 2FA code.");
// }

// // ─── Token Exchange (Graph API v25.0) ────────────────────────────────────────

// export async function exchangeToLongLived(shortToken: string, businessId?: string): Promise<TokenResult> {
//   // EAAG/EAAB are internal mobile tokens and cannot be renewed via standard OAuth exchanges
//   // with custom App IDs. They are typically already long-lived (~60d) or refreshed via browsers.
//   if (isMobileInternalToken(shortToken)) {
//     logger.info(`[RENEW] Mobile internal token detected (${shortToken.substring(0, 4)}) — skipping Graph API exchange to prevent App ID mismatch.`, { businessId });
//     return { token: shortToken, expiresAt: Date.now() + 5184000 * 1000 }; // Default 60 days
//   }

//   const appId = process.env.META_APP_ID;
//   const appSecret = process.env.META_APP_SECRET;
//   const version = process.env.META_GRAPH_VERSION || "v25.0";

//   if (!appId || !appSecret) {
//     logger.warn("[RENEW] META_APP_ID or META_APP_SECRET missing – using token as-is.");
//     return { token: shortToken, expiresAt: Date.now() + 3600 * 1000 };
//   }

//   const url = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
//   logger.info("[RENEW] Exchanging token via Graph API.", { businessId, tokenPreview: shortToken.substring(0, 12) });

//   const res = await fetch(url);
//   const json: any = await res.json();

//   if (json.access_token) {
//     const expiresAt = Date.now() + ((json.expires_in ?? 5184000) * 1000);
//     logger.info(`[RENEW SUCCESS] Token valid for ${json.expires_in}s (~${Math.round((json.expires_in ?? 0) / 86400)}d).`, { businessId });
//     return { token: json.access_token, expiresAt };
//   }

//   // Handle "The access token does not belong to application" error specifically
//   if (json.error?.message?.includes("does not belong to application")) {
//     logger.warn(`[RENEW IGNORED] App mismatch detected. Keeping original token to prevent lock-out.`, { businessId });
//     return { token: shortToken, expiresAt: Date.now() + 3600000 }; // Keep alive for 1 hour to retry later
//   }

//   logger.error(`[RENEW FAILED] ${json.error?.message}`, { businessId, errorCode: json.error?.code, errorSubcode: json.error?.error_subcode });
//   return { token: shortToken, expiresAt: Date.now() + 3600 * 1000 };
// }

// async function exchangeForLongLivedToken(shortToken: string, appId: string, appSecret: string, proxyUrl?: string): Promise<string | null> {
//   const version = process.env.META_GRAPH_VERSION || "v25.0";
//   const url = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;

//   const axiosOptions: any = { timeout: 15000 };
//   if (proxyUrl) {
//     axiosOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);
//   }

//   try {
//     const res = await axios.get(url, axiosOptions);
//     if (res.data?.access_token) {
//       return res.data.access_token;
//     }
//   } catch (e: any) {
//     logger.warn(`[RENEW] Graph API exchange failed: ${e.message}`);
//   }
//   return null;
// }

// /**
//  * Enterprise-grade hybrid token renewal logic.
//  * Correctly handles mobile tokens (EAAG/EAAB) by bypassing App ID exchange
//  * and implements self-healing discovery layers.
//  */
// async function performHybridTokenRenew(
//   config: AdsManagerPluginConfig,
//   payload: MetaAuthPayload,
//   shortToken: string,
//   browserPages?: any[] // Pages extracted directly from Playwright session
// ): Promise<TokenResult> {
//   const appId = process.env.META_APP_ID;
//   const appSecret = process.env.META_APP_SECRET;
//   const businessId = payload.business_id;
//   const proxyUrl = payload.proxy_url;

//   let finalToken = shortToken;
//   let expiresAt = Date.now() + 5184000 * 1000; // Default 60 days

//   // Case 1: Internal Mobile Token (EAAG/EAAB/EAAW)
//   if (isMobileInternalToken(shortToken)) {
//     logger.info(`[RENEW] Industrial mobile token detected (${shortToken.substring(0, 4)}) - skipping Graph API exchange.`);
//   } 
//   // Case 2: Standard App Token with available credentials
//   else if (appId && appSecret) {
//     logger.info(`[RENEW] Standard token detected - attempting Graph API exchange...`, { businessId });
//     const longLived = await exchangeForLongLivedToken(shortToken, appId, appSecret, proxyUrl);
//     if (longLived) {
//       finalToken = longLived;
//       logger.info(`[RENEW] Successfully exchanged for long-lived token.`);
//     }
//   }

//   // Phase A1: Use browser-extracted pages if available (PRIMARY PATH)
//   if (browserPages && browserPages.length > 0) {
//     try {
//       await saveUserFacebookPages(config, businessId, payload.fb_email, browserPages);
//       logger.info(`[DISCOVERY] In-browser extraction success: saved ${browserPages.length} pages.`);
//     } catch (e: any) {
//       logger.error(`[DISCOVERY] Failed to persist browser-extracted pages: ${e.message}`);
//     }
//     return { token: finalToken, expiresAt };
//   }

//   // Phase A3: Graph API Discovery (Fallback for Tier 1/1.5 paths)
//   try {
//     const pages = await fetchUserPages(finalToken, proxyUrl);
//     if (pages.length > 0) {
//       await saveUserFacebookPages(config, businessId, payload.fb_email, pages);
//       logger.info(`[DISCOVERY] Graph API sweep success: saved ${pages.length} pages.`);
//     } else {
//       logger.warn(`[DISCOVERY] Graph API returned 0 pages. Schedule delayed retry.`);
//       // Retry after 30s — token may need a moment to propagate
//       setTimeout(async () => {
//         try {
//           const retryPages = await fetchUserPages(finalToken, proxyUrl);
//           if (retryPages.length > 0) {
//             await saveUserFacebookPages(config, businessId, payload.fb_email, retryPages);
//             logger.info(`[DISCOVERY] Delayed retry success: saved ${retryPages.length} pages.`);
//           }
//         } catch (e2: any) {
//           logger.warn(`[DISCOVERY] Delayed retry failed: ${e2.message}`);
//         }
//       }, 30000);
//     }
//   } catch (e: any) {
//     logger.error(`[DISCOVERY] Graph API discovery failed: ${e.message}`);
//   }

//   return { token: finalToken, expiresAt };
// }

// // =============================================================================
// // ⭐ PHẦN QUAN TRỌNG NHẤT: HÀM EXTRACT TOKEN MỚI - FIX LỖI
// // =============================================================================

// /**
//  * extractToken - Multi-layer token extraction từ Facebook Ads Manager
//  * 
//  * Layer 1: localStorage và sessionStorage (nơi Facebook lưu token thực tế)
//  * Layer 2: Network request interception thông qua Performance API
//  * Layer 3: window.__accessToken (fallback cũ)
//  * Layer 4: Script tags và regex trên HTML
//  * 
//  * @param page - Playwright page object
//  * @returns Token string hoặc null nếu không tìm thấy
//  */
// async function extractToken(page: any): Promise<string | null> {
//   // ===== LAYER 1: localStorage và sessionStorage =====
//   // Đây là nơi Facebook lưu token thực tế sau khi đăng nhập
//   const tokenFromStorage = await page.evaluate(() => {
//     // Các key thường dùng của Facebook
//     const storageKeys = [
//       'accessToken',
//       'fbAccessToken', 
//       'adsToken',
//       'act',
//       'CUser',
//       'access_token',
//       'EAAG',
//       'EAAB',
//       'EAAW'
//     ];
    
//     // Tìm trong localStorage
//     for (const key of storageKeys) {
//       const val = localStorage.getItem(key);
//       if (val && /^EAA[ABG][a-zA-Z0-9_-]{20,}/.test(val)) {
//         return val;
//       }
//     }
    
//     // Tìm trong sessionStorage
//     for (const key of storageKeys) {
//       const val = sessionStorage.getItem(key);
//       if (val && /^EAA[ABG][a-zA-Z0-9_-]{20,}/.test(val)) {
//         return val;
//       }
//     }
    
//     return null;
//   });
  
//   if (tokenFromStorage) {
//     logger.info(`[TOKEN] Extracted from storage: ${tokenFromStorage.substring(0, 12)}...`);
//     return tokenFromStorage;
//   }
  
//   // ===== LAYER 2: Network request interception =====
//   // Thu thập token từ các request đến graph.facebook.com
//   const tokenFromNetwork = await page.evaluate(() => {
//     // @ts-ignore - Performance API
//     const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
//     const graphRequests = entries.filter(e => e.name.includes('graph.facebook.com'));
    
//     for (const req of graphRequests) {
//       const url = req.name;
//       const match = url.match(/access_token=([^&]+)/);
//       if (match && /^EAA[ABG][a-zA-Z0-9_-]{20,}/.test(match[1])) {
//         return decodeURIComponent(match[1]);
//       }
//     }
//     return null;
//   });
  
//   if (tokenFromNetwork) {
//     logger.info(`[TOKEN] Extracted from network request: ${tokenFromNetwork.substring(0, 12)}...`);
//     return tokenFromNetwork;
//   }
  
//   // ===== LAYER 3: window.__accessToken (legacy) =====
//   const tokenFromWindow = await page.evaluate(() => {
//     // @ts-ignore
//     if (window.__accessToken && /^EAA[ABG][a-zA-Z0-9_-]{20,}/.test(window.__accessToken)) {
//       // @ts-ignore
//       return window.__accessToken;
//     }
//     return null;
//   });
  
//   if (tokenFromWindow) {
//     logger.info(`[TOKEN] Extracted from window.__accessToken: ${tokenFromWindow.substring(0, 12)}...`);
//     return tokenFromWindow;
//   }
  
//   // ===== LAYER 4: Script tags và regex trên HTML =====
//   const tokenFromScripts = await page.evaluate(() => {
//     const scripts = document.querySelectorAll('script');
//     for (let i = 0; i < scripts.length; i++) {
//       const text = scripts[i].innerText;
//       // Tìm trong JSON objects trong script
//       const jsonMatch = text.match(/"accessToken":"(EAA[ABG][a-zA-Z0-9_-]{20,})"/);
//       if (jsonMatch) return jsonMatch[1];
      
//       // Tìm token trực tiếp
//       const directMatch = text.match(/EAA[ABG][a-zA-Z0-9_-]{20,}/);
//       if (directMatch) return directMatch[0];
//     }
//     return null;
//   });
  
//   if (tokenFromScripts) {
//     logger.info(`[TOKEN] Extracted from script tags: ${tokenFromScripts.substring(0, 12)}...`);
//     return tokenFromScripts;
//   }
  
//   // ===== LAYER 5: Regex trên toàn bộ HTML (fallback cuối) =====
//   const html = await page.content();
//   const htmlMatch = html.match(/EAA[ABG][a-zA-Z0-9_-]{20,}/);
//   if (htmlMatch) {
//     logger.info(`[TOKEN] Extracted from HTML regex: ${htmlMatch[0].substring(0, 12)}...`);
//     return htmlMatch[0];
//   }
  
//   logger.warn(`[TOKEN] All extraction layers failed - no token found`);
//   return null;
// }

// // ─── Core: Safe Auto Login or Renew ──────────────────────────────────────────

// /**
//  * 3-Tier Smart Auth:
//  *  Tier 1 – Token healthy (>10d)  → Graph API extend only (no browser)
//  *  Tier 2 – Cookies alive         → Silent Playwright login (no 2FA needed)
//  *  Tier 3 – Full login            → Playwright + fingerprint + 2FA + screenshot on block
//  */
// export async function safeAutoLoginOrRenew(
//   config: AdsManagerPluginConfig,
//   payload: MetaAuthPayload,
//   onStatusUpdate?: (message: string) => void
// ): Promise<TokenResult> {
//   return globalWorkerPool.addTask({
//     id: `auth-${payload.business_id}`,
//     type: "auth",
//     priority: 10,
//     execute: async () => {
//       logger.info(`[AUTH] safeAutoLoginOrRenew for ${payload.business_id}`);

//       try {
//         const existing = await getUserMetaAuth(config, payload.business_id);
//         if (existing) {
//           if (!payload.proxy_url) payload.proxy_url = existing.proxy_url;
//           if (!payload.device_fingerprint && existing.device_fingerprint) {
//             payload.device_fingerprint = JSON.parse(existing.device_fingerprint);
//           }
//         }
//         const tenDays = 10 * 24 * 60 * 60 * 1000;

//         // ── Tier 1: API-only renewal ──────────────────────────────────────────
//         if (existing?.access_token && existing.token_expires_at > Date.now() + tenDays) {
//           logger.info("[AUTH] Tier 1: Token healthy, validating...", { businessId: payload.business_id });
//           const renewed = await exchangeToLongLived(existing.access_token, payload.business_id);
//           await saveUserMetaAuth(config, payload.business_id, {
//             email: payload.fb_email,
//             passwordEnc: payload.fb_password_enc,
//             otpSecretEnc: payload.fb_2fa_secret_enc,
//             accessToken: renewed.token,
//             expiresAt: renewed.expiresAt,
//             cookies: existing.cookies ? JSON.parse(existing.cookies) : undefined,
//             deviceFingerprint: existing.device_fingerprint ? JSON.parse(existing.device_fingerprint) : undefined,
//             proxyUrl: payload.proxy_url
//           });
//           await incrementMetaSuccess(config, payload.business_id);
          
//           const isMobile = isMobileInternalToken(renewed.token);
//           const msg = isMobile 
//             ? `✅ Token nội bộ (**${renewed.token.substring(0, 4)}**) của Business **${payload.business_id}** còn rất tốt, em đã kiểm tra và cho phép tiếp tục sử dụng.`
//             : `✅ Token cho Business **${payload.business_id}** đã được gia hạn thành công (Tier 1 - Graph API).`;
//           onStatusUpdate?.(msg);
//           return renewed;
//         }

//       // ── Tier 1.5: Fast Request-Based Auth (Phase 27) ───────────────────
//       if (existing?.cookies) {
//         try {
//           logger.info("[AUTH] Tier 1.5: Attempting fast request-based token extraction.", { businessId: payload.business_id });
//           const result = await performRequestBasedLogin(config, payload, JSON.parse(existing.cookies));
//           if (result) {
//             await incrementMetaSuccess(config, payload.business_id);
//             onStatusUpdate?.(`✅ Trích xuất Token siêu tốc thành công (Tier 1.5).`);
//             return result;
//           }
//         } catch (e: any) {
//           logger.debug(`[AUTH] Tier 1.5 failed: ${e.message}`);
//         }
//       }

//       // ── Tier 2: Silent cookie login ───────────────────────────────────────
//       if (existing?.cookies) {
//         try {
//           logger.info("[AUTH] Tier 2: Attempting silent cookie login.", { businessId: payload.business_id });
//           const result = await performPlaywrightLogin(config, payload, JSON.parse(existing.cookies));
//           await incrementMetaSuccess(config, payload.business_id);
//           onStatusUpdate?.(`✅ Đăng nhập bằng Cookie thành công cho Business **${payload.business_id}** (Tier 2).`);
//           return result;
//         } catch (e: any) {
//           logger.warn(`[AUTH] Tier 2 failed (${e.message}). Escalating to Tier 3.`);
//         }
//       }

//       // ── Tier 3: Full fingerprinted login ──────────────────────────────────
//       logger.info("[AUTH] Tier 3: Full Playwright login with randomized fingerprint.", { businessId: payload.business_id });
//       const result = await performPlaywrightLogin(config, payload);
//       await incrementMetaSuccess(config, payload.business_id);
//       onStatusUpdate?.(`🚀 Đăng nhập toàn phần thành công cho Business **${payload.business_id}** (Tier 3 - Playwright).`);
//       return result;

//     } catch (err: any) {
//       logger.error(`[CRITICAL] ${payload.business_id}: ${err.message}`, { stack: err.stack, phase: "safeAutoLoginOrRenew" });
//       await recordMetaFailure(config, payload.business_id, err.message);
//       onStatusUpdate?.(`❌ Lỗi đăng nhập Business **${payload.business_id}**: ${err.message}`);
//       throw err;
//       }
//     }
//   });
// }

// // ─── Playwright Login (FIXED v20.0 – In-Browser Discovery) ─────────────────────────────
// export async function performPlaywrightLogin(
//   config: AdsManagerPluginConfig,
//   payload: MetaAuthPayload,
//   savedCookies?: any[]
// ): Promise<TokenResult> {
//   const fp = pickFingerprint(payload.device_fingerprint);
//   logger.info(`[BROWSER] Using fingerprint: ${fp.platform} | ${fp.viewport.width}x${fp.viewport.height}`);

//   const launchOptions: any = {
//     headless: true,
//     args: [
//       "--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled",
//       "--disable-infobars", "--disable-dev-shm-usage", "--no-first-run", "--no-zygote",
//       `--lang=${fp.locale}`,
//     ],
//   };

//   if (payload.proxy_url) launchOptions.proxy = { server: payload.proxy_url };

//   const browser = await chromium.launch(launchOptions);
//   const context = await browser.newContext({
//     userAgent: fp.userAgent,
//     viewport: fp.viewport,
//     locale: fp.locale,
//     timezoneId: fp.timezone,
//     colorScheme: fp.colorScheme,
//     deviceScaleFactor: fp.deviceScaleFactor,
//     geolocation: { latitude: 10.762622 + (Math.random() * 0.02 - 0.01), longitude: 106.660172 + (Math.random() * 0.02 - 0.01) },
//     permissions: ["geolocation"],
//   });

//   const page = await context.newPage();

//   await page.addInitScript((platform: string) => {
//     Object.defineProperty(navigator, "platform", { get: () => platform });
//     Object.defineProperty(navigator, "webdriver", { get: () => undefined });
//     // @ts-ignore
//     Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
//   }, fp.platform);

//   await page.mouse.move(Math.random() * fp.viewport.width * 0.8, Math.random() * fp.viewport.height * 0.8);

//   try {
//     // 1. Cookie silent login (nếu có)
//     if (savedCookies?.length) {
//       await context.addCookies(savedCookies);
//       // FIX A2: Use "load" instead of "networkidle" to avoid timeout on heavy SPA
//       await page.goto("https://www.facebook.com/adsmanager/manage/campaigns", { waitUntil: "load", timeout: 90000 });
//       await humanDelay(3000, 5000);
//       if (!page.url().includes("login") && !page.url().includes("checkpoint")) {
//         const token = await extractToken(page);
//         if (token) {
//           const pages = await extractPagesInBrowser(page, token, payload.proxy_url);
//           return await finalizeLogin(config, payload, token, fp, context, page, pages);
//         }
//       }
//     }

//     // 2. Full login via m.facebook.com (mobile login — faster, more reliable)
//     await page.goto("https://m.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 45000 });
//     await humanDelay(2500, 4500);

//     // ── Dismiss consent banner (rất quan trọng 2026) ─────────────────────
//     await dismissConsentBanner(page);

//     // ── Type credentials with human behavior ─────────────────────────────
//     await page.waitForSelector('input[name="email"]', { timeout: 20000 });
//     await humanType(page, 'input[name="email"]', payload.fb_email);
//     await humanDelay(800, 1600);

//     await humanType(page, 'input[name="pass"]', decrypt(payload.fb_password_enc));
//     await humanDelay(1200, 2200);

//     // ── SUBMIT RELIABLE (FIX CHÍNH LỖI TIMEOUT) ───────────────────────────
//     logger.info("[AUTH] Submitting login form with reliable method...");
//     await submitLoginForm(page);

//     await humanDelay(3500, 6000);

//     // ── Checkpoint / Security handling ───────────────────────────────────
//     if (page.url().includes("checkpoint") || page.url().includes("two_step")) {
//       logger.info("[AUTH] Security checkpoint detected. Analyzing screen...");
      
//       // 1. Check if it's a CAPTCHA (Google reCAPTCHA)
//       const isCaptcha = await page.locator('iframe[src*="recaptcha"]').isVisible({ timeout: 5000 }).catch(() => false) ||
//                         await page.locator('text="I\'m not a robot"').isVisible({ timeout: 1000 }).catch(() => false);
                        
//       if (isCaptcha) {
//         const screenshotPath = path.join(os.tmpdir(), `meta-captcha-${Date.now()}.png`);
//         await page.screenshot({ path: screenshotPath, fullPage: true });
//         throw new Error(`Facebook chặn đăng nhập bằng reCAPTCHA rủi ro bảo mật IP. Vui lòng đăng nhập Facebook trên máy tính của bạn 1 lần để xác minh IP an toàn, sau đó Bot sẽ qua được. (Screenshot: ${screenshotPath})`);
//       }

//       // 2. Check if it's exactly 2FA
//       const is2FA = await page.locator('input[name="approvals_code"], input#approvals_code').isVisible({ timeout: 3000 }).catch(() => false);
      
//       if (is2FA) {
//         logger.info("[AUTH] 2FA checkpoint confirmed.");
//         if (!payload.fb_2fa_secret_enc) throw new Error("2FA required but no secret provided. Bot cần mã bảo mật 2FA để tiếp tục.");
//         const code = await get2FACode(payload.fb_2fa_secret_enc);
//         await page.locator('input[name="approvals_code"], input#approvals_code').fill(code);
//         await humanDelay(800, 1500);
//         await page.locator('button[type="submit"]').click();
//         await humanDelay(2500, 4500);

//         // Trust this browser
//         const trustSelector = 'button:has-text("Trust this device"), button:has-text("Lưu thiết bị"), button:has-text("Tin cậy"), [role="button"]:has-text("Trust")';
//         const trustBtn = page.locator(trustSelector).first();
//         if (await trustBtn.isVisible({ timeout: 8000 })) {
//           await trustBtn.click();
//           await humanDelay(2000, 4000);
//         }
//       } else {
//         // Unknown checkpoint
//         const screenshotPath = path.join(os.tmpdir(), `meta-unknown-checkpoint-${Date.now()}.png`);
//         await page.screenshot({ path: screenshotPath, fullPage: true });
//         throw new Error(`Facebook yêu cầu xác minh danh tính bảo mật (Checkpoint). Vui lòng kiểm tra tài khoản trên điện thoại/máy tính của bạn để xác nhận. (Screenshot: ${screenshotPath})`);
//       }
//     }

//     // ── FIX A2: Navigate to Ads Manager with "load" instead of "networkidle" ──
//     logger.info("[AUTH] Navigating to Ads Manager for token extraction...");
//     await page.goto("https://www.facebook.com/adsmanager/manage/campaigns", {
//       waitUntil: "load", // Changed from "networkidle" — avoids 45s timeout on heavy SPA
//       timeout: 90000,    // Increased to 90s for slow connections
//     });
    
//     // ⭐ QUAN TRỌNG: Chờ token xuất hiện với polling mechanism
//     let token: string | null = null;
//     const maxAttempts = 15;      // 15 lần thử
//     const pollInterval = 2000;   // 2 giây mỗi lần
    
//     for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//       token = await extractToken(page);
//       if (token) {
//         logger.info(`[AUTH] Token extracted successfully on attempt ${attempt}/${maxAttempts}`);
//         break;
//       }
//       logger.info(`[AUTH] Waiting for token... attempt ${attempt}/${maxAttempts}`);
//       await humanDelay(pollInterval, pollInterval + 500);
//     }
    
//     if (!token) {
//       // Lưu screenshot để debug
//       const screenshotPath = path.join(os.tmpdir(), `auth-error-${payload.business_id.substring(0, 16)}-${Date.now()}.png`);
//       await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
//       throw new Error(`Cannot extract EAAG/EAAB token from Ads Manager page (Screenshot: ${screenshotPath})`);
//     }

//     // FIX A1: Extract Pages from within the active browser session
//     const pages = await extractPagesInBrowser(page, token, payload.proxy_url);

//     return await finalizeLogin(config, payload, token, fp, context, page, pages);

//   } catch (err: any) {
//     const errorScreenshot = path.join(os.tmpdir(), `auth-error-${payload.business_id.substring(0, 16)}-${Date.now()}.png`);
//     await page.screenshot({ path: errorScreenshot, fullPage: true }).catch(() => {});
//     logger.error(`[AUTH] Screenshot saved: ${errorScreenshot}`);
//     err.message += ` (Screenshot: ${errorScreenshot})`;
//     throw err;
//   } finally {
//     await browser.close();
//   }
// }

// // ── Helper functions ─────────────────────────────────────────────────────────
// async function dismissConsentBanner(page: any) {
//   const consentSelectors = [
//     'button:has-text("Allow all cookies")', 'button:has-text("Accept All")',
//     'button:has-text("Tiếp tục")', 'button:has-text("Cho phép tất cả cookie")',
//     'button:has-text("Chấp nhận tất cả")', '[data-cookiebanner="accept_button"]'
//   ];
//   for (const sel of consentSelectors) {
//     const btn = page.locator(sel).first();
//     if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
//       logger.info(`[AUTH] Dismissed consent: ${sel}`);
//       await btn.click();
//       await humanDelay(1000, 2000);
//       return;
//     }
//   }
// }

// async function submitLoginForm(page: any) {
//   // Most reliable 2026: press Enter on password field
//   try {
//     await page.locator('input[name="pass"]').press('Enter');
//     await humanDelay(2000, 4000);
//     return;
//   } catch {}

//   // Fallback 2: click via role + text (very stable)
//   const loginBtn = page.locator('button[type="submit"], button[name="login"], [role="button"]:has-text("Đăng nhập"), [role="button"]:has-text("Log In")').first();
//   if (await loginBtn.isVisible({ timeout: 15000 })) {
//     await loginBtn.click({ position: { x: 30 + Math.random() * 40, y: 15 + Math.random() * 10 } });
//   } else {
//     // Ultimate fallback
//     await page.keyboard.press('Enter');
//   }
// }

// /**
//  * FIX A1 (CRITICAL): Extract Facebook Pages directly from within the active Playwright
//  * browser session. This runs BEFORE closing the browser, using the authenticated session.
//  * 
//  * Strategy 1: Use Graph API in browser (bypasses CORS and App ID scope restrictions)
//  * Strategy 2: Scrape from /pages endpoint in the browser DOM
//  * Strategy 3: Parse __data__ JSON blobs from Business Manager
//  */
// async function extractPagesInBrowser(page: any, token: string, proxyUrl?: string): Promise<any[]> {
//   logger.info("[DISCOVERY] Attempting in-browser Page extraction...");

//   // Strategy 1: Navigate to Graph API directly in browser (most reliable)
//   // The browser session carries auth cookies so App ID scope doesn't matter
//   try {
//     const version = process.env.META_GRAPH_VERSION || "v25.0";
//     const graphUrl = `https://graph.facebook.com/${version}/me/accounts?fields=name,category,access_token,perms&access_token=${token}&limit=100`;
    
//     await page.goto(graphUrl, { waitUntil: "load", timeout: 20000 });
//     const bodyText = await page.textContent("body");
//     if (bodyText) {
//       const json = JSON.parse(bodyText);
//       if (json?.data && Array.isArray(json.data) && json.data.length > 0) {
//         logger.info(`[DISCOVERY] Strategy 1 (Graph in browser): Found ${json.data.length} pages.`);
//         return json.data;
//       }
//       // Handle error responses with detail logging
//       if (json?.error) {
//         logger.warn(`[DISCOVERY] Graph API in browser error: ${json.error.message} (code: ${json.error.code})`);
//       }
//     }
//   } catch (e: any) {
//     logger.debug(`[DISCOVERY] Strategy 1 failed: ${e.message}`);
//   }

//   // Strategy 2: Navigate to Pages Manager and extract from __initialData__ or JSON blobs
//   try {
//     await page.goto("https://www.facebook.com/pages/?category=your_pages&ref=bookmarks", {
//       waitUntil: "load",
//       timeout: 30000,
//     });
//     await humanDelay(2000, 4000);
    
//     const pages = await page.evaluate(() => {
//       const results: any[] = [];
//       // Search for JSON embedded in script tags
//       const scripts = document.querySelectorAll("script[type='application/json']");
//       scripts.forEach(script => {
//         try {
//           const data = JSON.parse(script.textContent || "");
//           // Look for page data structures in the JSON blob
//           const findPages = (obj: any, depth = 0): void => {
//             if (depth > 10 || !obj || typeof obj !== "object") return;
//             if (obj.page_id && obj.name) {
//               results.push({ id: String(obj.page_id), name: obj.name, category: obj.category || "Page" });
//             }
//             if (obj.id && obj.name && obj.category && typeof obj.id === "string" && obj.id.length > 5) {
//               results.push({ id: obj.id, name: obj.name, category: obj.category });
//             }
//             Object.values(obj).forEach(v => findPages(v, depth + 1));
//           };
//           findPages(data);
//         } catch {}
//       });
//       // Deduplicate by ID
//       const seen = new Set();
//       return results.filter(p => {
//         if (seen.has(p.id)) return false;
//         seen.add(p.id);
//         return true;
//       });
//     });

//     if (pages.length > 0) {
//       logger.info(`[DISCOVERY] Strategy 2 (Pages Manager DOM): Found ${pages.length} pages.`);
//       return pages;
//     }
//   } catch (e: any) {
//     logger.debug(`[DISCOVERY] Strategy 2 failed: ${e.message}`);
//   }

//   // Strategy 3: Business Manager Pages list
//   try {
//     await page.goto("https://business.facebook.com/settings/pages", {
//       waitUntil: "load",
//       timeout: 30000,
//     });
//     await humanDelay(2000, 3000);
    
//     const pages = await page.evaluate(() => {
//       const results: any[] = [];
//       const scripts = document.querySelectorAll("script");
//       scripts.forEach(script => {
//         const text = script.textContent || "";
//         // Look for page ID patterns in script content
//         const matches = text.matchAll(/"page_id":"(\d+)"[^}]*"name":"([^"]+)"/g);
//         for (const match of matches) {
//           results.push({ id: match[1], name: match[2], category: "Page" });
//         }
//       });
//       const seen = new Set();
//       return results.filter(p => {
//         if (seen.has(p.id)) return false;
//         seen.add(p.id);
//         return true;
//       });
//     });

//     if (pages.length > 0) {
//       logger.info(`[DISCOVERY] Strategy 3 (Business Manager): Found ${pages.length} pages.`);
//       return pages;
//     }
//   } catch (e: any) {
//     logger.debug(`[DISCOVERY] Strategy 3 failed: ${e.message}`);
//   }

//   logger.warn("[DISCOVERY] All in-browser strategies returned 0 pages. Will fall back to Graph API post-login.");
//   return [];
// }

// async function finalizeLogin(
//   config: AdsManagerPluginConfig,
//   payload: MetaAuthPayload,
//   token: string,
//   fp: any,
//   context: any,
//   page: any,
//   browserPages?: any[] // FIX A1: Pass in-browser extracted pages
// ) {
//   const cookies = await context.cookies();
//   const result = await performHybridTokenRenew(config, payload, token, browserPages);
  
//   await saveUserMetaAuth(config, payload.business_id, {
//     email: payload.fb_email,
//     passwordEnc: payload.fb_password_enc,
//     otpSecretEnc: payload.fb_2fa_secret_enc,
//     accessToken: result.token,
//     expiresAt: result.expiresAt,
//     cookies,
//     deviceFingerprint: fp,
//     proxyUrl: payload.proxy_url
//   });
  
//   logger.info(`[AUTH] Login SUCCESS - Token active until ${new Date(result.expiresAt).toISOString()}`);
//   return result;
// }

// /**
//  * ─── Tier 1.5: Fast Request-Based Token Extraction (Phase 27) ────────────────
//  * Mimics a real browser request to Ads Manager using existing cookies.
//  * Extremely fast, no browser engine required.
//  */
// async function performRequestBasedLogin(
//   config: AdsManagerPluginConfig,
//   payload: MetaAuthPayload,
//   cookies: any[]
// ): Promise<TokenResult | null> {
//   const fp = pickFingerprint(payload.device_fingerprint);
//   const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  
//   const headers: any = {
//     "User-Agent": fp.userAgent,
//     "Cookie": cookieString,
//     "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
//     "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
//     "Sec-Fetch-Dest": "document",
//     "Sec-Fetch-Mode": "navigate",
//     "Sec-Fetch-Site": "none",
//     "Upgrade-Insecure-Requests": "1"
//   };

//   const axiosOptions: any = { 
//     headers,
//     timeout: 30000,
//     validateStatus: () => true,
//   };
  
//   if (payload.proxy_url) {
//     axiosOptions.httpsAgent = new HttpsProxyAgent(payload.proxy_url);
//   }

//   try {
//     const res = await axios.get("https://www.facebook.com/adsmanager/manage/campaigns", axiosOptions);
//     const html = res.data;
    
//     // FIX B1: Scan for both EAAG and EAAB token patterns
//     const eaagMatch = html.match(/EAAG[a-zA-Z0-9_-]{20,}/);
//     if (eaagMatch) {
//       return await performHybridTokenRenew(config, payload, eaagMatch[0]);
//     }
//     const eaabMatch = html.match(/EAAB[a-zA-Z0-9_-]{20,}/);
//     if (eaabMatch) {
//       return await performHybridTokenRenew(config, payload, eaabMatch[0]);
//     }
//   } catch (err: any) {
//     logger.debug(`[TIER 1.5] Request failed: ${err.message}`);
//   }
//   return null;
// }

// /**
//  * FIX-A3 (Graph API Discovery — Post-Login fallback)
//  * Used when browser-based extraction fails (Tier 1/1.5 paths).
//  * 
//  * NOTE: This ONLY works reliably with EAAG tokens. EAAB tokens may fail
//  * with 400 due to missing pages_show_list scope. The primary path is
//  * extractPagesInBrowser() which uses the authenticated browser session.
//  */
// export async function fetchUserPages(rawToken: string, proxyUrl?: string): Promise<any[]> {
//   // Always decode FB HTML-encoded tokens before API use
//   const token = decodeFbHtmlToken(rawToken);
//   const version = process.env.META_GRAPH_VERSION || "v25.0";
//   const isIOS = token.startsWith("EAAB");
//   const isAndroid = token.startsWith("EAAG");
  
//   // Aligned Headers for high-privilege mobile sessions
//   const headers: any = {
//     "Accept": "*/*",
//     "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
//   };

//   if (isIOS) {
//     headers["User-Agent"] = "FBAN/FBIOS;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/iPhone;FBBD/apple;FBPN/com.facebook.Messenger;FBDV/iPhone13,2;FBSV/15.0;FBOP/1;FBCA/arm64-v8a:";
//     headers["X-FB-App-Id"] = "124024574287"; // Facebook for iOS
//     logger.info(`[DISCOVERY] EAAB (iOS) detected — aligned iOS headers.`);
//   } else if (isAndroid) {
//     headers["User-Agent"] = "FBAN/FB4A;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/Google;FBBD/google;FBPN/com.facebook.katana;FBDV/Pixel 5;FBSV/13;FBOP/1;FBCA/arm64-v8a:";
//     headers["X-FB-App-Id"] = "350685531728"; // Facebook for Android
//     logger.info(`[DISCOVERY] EAAG (Android) detected — aligned Android headers.`);
//   } else {
//     headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
//   }

//   const options: any = { timeout: 20000, headers };
//   if (proxyUrl) options.httpsAgent = new HttpsProxyAgent(proxyUrl);

//   // Layer 1: Nested Discovery (most resilient for all token types)
//   try {
//     const url = `https://graph.facebook.com/${version}/me?fields=accounts{name,category,access_token,perms,tasks}&access_token=${token}`;
//     logger.info(`[DISCOVERY] Layer 1 calling: /me?fields=accounts{...}`);
//     const resp = await axios.get(url, options);
//     if (resp.data?.accounts?.data?.length > 0) return resp.data.accounts.data;
//     if (resp.data?.data?.length > 0) return resp.data.data;
//     if (resp.data?.error) {
//       logger.warn(`[DISCOVERY] Layer 1 API error: ${resp.data.error.message} (${resp.data.error.code})`);
//     }
//   } catch (e: any) {
//     logger.debug(`[DISCOVERY] Layer 1 (Nested) failed: ${e.response?.data?.error?.message || e.message}`);
//   }

//   // Layer 2: Direct Discovery (Fallback)
//   try {
//     const url = `https://graph.facebook.com/${version}/me/accounts?fields=name,category,access_token&access_token=${token}`;
//     logger.info(`[DISCOVERY] Layer 2 calling: /me/accounts?fields=...`);
//     const resp = await axios.get(url, options);
//     if (resp.data?.data?.length > 0) {
//       logger.info(`[DISCOVERY] Recovered using Layer 2 (Direct)`);
//       return resp.data.data;
//     }
//   } catch (e: any) {
//     logger.debug(`[DISCOVERY] Layer 2 failed: ${e.response?.data?.error?.message || e.message}`);
//   }

//   // Layer 3: Minimal Discovery
//   try {
//     const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name&access_token=${token}`;
//     logger.info(`[DISCOVERY] Layer 3 calling: /me/accounts?fields=id,name`);
//     const resp = await axios.get(url, options);
//     if (resp.data?.data?.length > 0) {
//       logger.warn(`[DISCOVERY] Recovered using Layer 3 (Minimal)`);
//       return resp.data.data;
//     }
//   } catch (e: any) {
//     logger.debug(`[DISCOVERY] Layer 3 failed: ${e.response?.data?.error?.message || e.message}`);
//   }

//   // Layer 4: Plain Request (No Spoofing Headers) - Critical for manually inputted tokens
//   try {
//     const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token&access_token=${token}`;
//     logger.info(`[DISCOVERY] Layer 4 calling: /me/accounts without strict headers`);
//     const plainOptions: any = { timeout: 20000 };
//     if (proxyUrl) plainOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);
    
//     const resp = await axios.get(url, plainOptions);
//     if (resp.data?.data?.length > 0) {
//       logger.info(`[DISCOVERY] Recovered using Layer 4 (Plain)`);
//       return resp.data.data;
//     }
//   } catch (e: any) {
//     logger.error(`[DISCOVERY] All Graph API discovery layers failed.`, {
//       error: e.response?.data?.error?.message || e.message,
//       code: e.response?.data?.error?.code,
//       type: e.response?.data?.error?.type
//     });
//   }

//   return [];
// }











// extensions/ads-campaign-manager/src/meta-login.ts
// FIXED: No token extraction from HTML, use cookies directly to fetch pages via Graph API

import { chromium } from "playwright-extra";
// @ts-ignore
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import * as otplibModule from "otplib";
import os from "node:os";
import path from "node:path";
import { decrypt } from "./crypto-utils.js";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import logger from "./logger.js";
import type { AdsManagerPluginConfig } from "./types.js";
import { saveUserMetaAuth, getUserMetaAuth, incrementMetaSuccess, recordMetaFailure, saveUserFacebookPages } from "./db-state.js";
import { globalWorkerPool } from "./worker-pool.js";

chromium.use(stealthPlugin());

export interface MetaAuthPayload {
  business_id: string;
  fb_email: string;
  fb_password_enc: string;
  fb_2fa_secret_enc?: string;
  proxy_url?: string;
  device_fingerprint?: any;
}

export interface TokenResult {
  token: string;
  expiresAt: number;
}

export function isMobileInternalToken(token: string): boolean {
  return token.startsWith("EAAG") || token.startsWith("EAAB") || token.startsWith("EAAW");
}

export function decodeFbHtmlToken(token: string): string {
  // Previously we replaced ZD, ZB, ZC, ZA but this fundamentally corrupts
  // naturally occurring base62 token fragments from Graph API Explorer.
  // We MUST return the token as-is to Graph API.
  return token;
}

export async function validateTokenBasic(token: string): Promise<{
  valid: boolean;
  userId?: string;
  userName?: string;
  error?: string;
  errorCode?: number;
}> {
  const version = process.env.META_GRAPH_VERSION || "v25.0";
  try {
    const url = `https://graph.facebook.com/${version}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json: any = await res.json();
    if (json.id) {
      logger.info(`[TOKEN] Validation OK: id=${json.id} name=${json.name}`);
      return { valid: true, userId: json.id, userName: json.name };
    }
    const errMsg = json.error?.message || "Unknown error";
    const errCode = json.error?.code || 0;
    logger.warn(`[TOKEN] Validation FAILED: ${errMsg} (code=${errCode})`);
    return { valid: false, error: errMsg, errorCode: errCode };
  } catch (e: any) {
    logger.error(`[TOKEN] Validation network error: ${e.message}`);
    return { valid: false, error: e.message };
  }
}

// ─── Fingerprint Pool (unchanged) ───────────────────────────────────────────
const FINGERPRINT_POOL = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Win32",
    colorScheme: "light" as const,
    deviceScaleFactor: 1,
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Win32",
    colorScheme: "light" as const,
    deviceScaleFactor: 1,
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Win32",
    colorScheme: "dark" as const,
    deviceScaleFactor: 1,
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1512, height: 982 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "MacIntel",
    colorScheme: "light" as const,
    deviceScaleFactor: 2,
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    viewport: { width: 1280, height: 800 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "MacIntel",
    colorScheme: "light" as const,
    deviceScaleFactor: 2,
  },
  {
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.105 Mobile Safari/537.36",
    viewport: { width: 390, height: 844 },
    locale: "vi-VN",
    timezone: "Asia/Ho_Chi_Minh",
    platform: "Linux armv8l",
    colorScheme: "light" as const,
    deviceScaleFactor: 3,
  },
];

function pickFingerprint(existing?: any) {
  if (existing) return existing;
  return FINGERPRINT_POOL[Math.floor(Math.random() * FINGERPRINT_POOL.length)];
}

function humanDelay(minMs = 800, maxMs = 2500): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((r) => setTimeout(r, delay));
}

async function humanType(page: any, selector: string, text: string): Promise<void> {
  await page.waitForSelector(selector, { state: "visible", timeout: 15000 });
  await page.click(selector);
  await humanDelay(300, 800);
  for (const char of text) {
    await page.keyboard.type(char, { delay: Math.floor(Math.random() * 130) + 40 });
  }
}

// ─── 2FA Code Retrieval (unchanged) ─────────────────────────────────────────
async function get2FACode(secretEnc: string): Promise<string> {
  const secret = decrypt(secretEnc);
  try {
    const authenticator = (otplibModule as any).authenticator ?? (otplibModule as any).totp;
    if (authenticator) {
      const code = authenticator.generate(secret);
      logger.info("[2FA] Code generated via otplib (local).");
      return code;
    }
  } catch (e: any) {
    logger.warn(`[2FA] otplib failed: ${e.message}`);
  }
  try {
    const res = await fetch(`https://2faotp.live/${secret}`, { signal: AbortSignal.timeout(5000) });
    const json: any = await res.json();
    if (json.success && json.code) {
      logger.info("[2FA] Code from 2faotp.live fallback.");
      return json.code;
    }
  } catch (e: any) {
    logger.warn(`[2FA] 2faotp.live failed: ${e.message}`);
  }
  try {
    const res = await fetch(`https://www.authenticatorapi.com/Validate.aspx?SecretCode=${secret}&Pin=NONE`, { signal: AbortSignal.timeout(5000) });
    const text = await res.text();
    const match = text.match(/\d{6}/);
    if (match) {
      logger.info("[2FA] Code from authenticatorapi.com fallback.");
      return match[0];
    }
  } catch (e: any) {
    logger.warn(`[2FA] authenticatorapi.com failed: ${e.message}`);
  }
  throw new Error("[2FA] All methods failed. Cannot generate 2FA code.");
}

// ─── Token Exchange (unchanged) ─────────────────────────────────────────────
export async function exchangeToLongLived(shortToken: string, businessId?: string): Promise<TokenResult> {
  if (isMobileInternalToken(shortToken)) {
    logger.info(`[RENEW] Mobile internal token detected (${shortToken.substring(0, 4)}) — skipping Graph API exchange.`, { businessId });
    return { token: shortToken, expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000 };
  }
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const version = process.env.META_GRAPH_VERSION || "v25.0";
  if (!appId || !appSecret) {
    logger.warn("[RENEW] META_APP_ID or META_APP_SECRET missing – using token as-is.");
    return { token: shortToken, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  }
  const url = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  logger.info("[RENEW] Exchanging token via Graph API.", { businessId, tokenPreview: shortToken.substring(0, 12) });
  const res = await fetch(url);
  const json: any = await res.json();
  if (json.access_token) {
    const expiresAt = Date.now() + ((json.expires_in ?? 5184000) * 1000);
    logger.info(`[RENEW SUCCESS] Token valid for ${json.expires_in}s (~${Math.round((json.expires_in ?? 0) / 86400)}d).`, { businessId });
    return { token: json.access_token, expiresAt };
  }
  if (json.error?.message?.includes("does not belong to application")) {
    logger.warn(`[RENEW IGNORED] App mismatch detected. Keeping original token.`, { businessId });
    return { token: shortToken, expiresAt: Date.now() + 3600000 };
  }
  logger.error(`[RENEW FAILED] ${json.error?.message}`, { businessId });
  return { token: shortToken, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
}

async function exchangeForLongLivedToken(shortToken: string, appId: string, appSecret: string, proxyUrl?: string): Promise<string | null> {
  const version = process.env.META_GRAPH_VERSION || "v25.0";
  const url = `https://graph.facebook.com/${version}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`;
  const axiosOptions: any = { timeout: 15000 };
  if (proxyUrl) axiosOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);
  try {
    const res = await axios.get(url, axiosOptions);
    if (res.data?.access_token) return res.data.access_token;
  } catch (e: any) {
    logger.warn(`[RENEW] Graph API exchange failed: ${e.message}`);
  }
  return null;
}

// ─── NEW: Fetch pages using cookies (no token extraction) ───────────────────
async function fetchPagesWithCookies(
  cookies: any[],
  proxyUrl?: string,
  pageId?: string
): Promise<{ pages: any[]; accessToken?: string }> {
  const version = process.env.META_GRAPH_VERSION || "v25.0";
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const headers: any = {
    "Cookie": cookieString,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
  };
  const axiosOptions: any = { headers, timeout: 20000 };
  if (proxyUrl) axiosOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);

  try {
    // Try /me/accounts with cookies
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,category,access_token,perms&limit=100`;
    const resp = await axios.get(url, axiosOptions);
    if (resp.data?.data?.length) {
      logger.info(`[DISCOVERY] Found ${resp.data.data.length} pages via cookies`);
      // Also try to get a user token from the response (maybe not needed)
      return { pages: resp.data.data, accessToken: undefined };
    }
  } catch (e: any) {
    logger.debug(`[DISCOVERY] Cookie-based /me/accounts failed: ${e.message}`);
  }

  // Fallback: try to get user token from the cookies by calling /me
  try {
    const meUrl = `https://graph.facebook.com/${version}/me?fields=id,name`;
    const meResp = await axios.get(meUrl, axiosOptions);
    if (meResp.data?.id) {
      // If we got user info, we can try to get pages using the user token embedded in the cookies?
      // Actually, cookies may contain the access token in the 'act' cookie or similar.
      // For now, we just return empty.
      logger.info(`[DISCOVERY] Cookie-based /me succeeded: ${meResp.data.name}`);
    }
  } catch (e: any) {
    logger.debug(`[DISCOVERY] Cookie-based /me failed: ${e.message}`);
  }

  return { pages: [] };
}

// ─── Core: Safe Auto Login or Renew (unchanged except removing extractToken) ─
export async function safeAutoLoginOrRenew(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  onStatusUpdate?: (message: string) => void
): Promise<TokenResult> {
  return globalWorkerPool.addTask({
    id: `auth-${payload.business_id}`,
    type: "auth",
    priority: 10,
    execute: async () => {
      logger.info(`[AUTH] safeAutoLoginOrRenew for ${payload.business_id}`);
      try {
        const existing = await getUserMetaAuth(config, payload.business_id);
        if (existing) {
          if (!payload.proxy_url) payload.proxy_url = existing.proxy_url;
          if (!payload.device_fingerprint && existing.device_fingerprint) {
            payload.device_fingerprint = JSON.parse(existing.device_fingerprint);
          }
        }
        const tenDays = 10 * 24 * 60 * 60 * 1000;

        // Tier 1: Token healthy (>10d)
        if (existing?.access_token && existing.token_expires_at > Date.now() + tenDays) {
          logger.info("[AUTH] Tier 1: Token healthy, validating...", { businessId: payload.business_id });
          const renewed = await exchangeToLongLived(existing.access_token, payload.business_id);
          await saveUserMetaAuth(config, payload.business_id, {
            email: payload.fb_email,
            passwordEnc: payload.fb_password_enc,
            otpSecretEnc: payload.fb_2fa_secret_enc,
            accessToken: renewed.token,
            expiresAt: renewed.expiresAt,
            cookies: existing.cookies ? JSON.parse(existing.cookies) : undefined,
            deviceFingerprint: existing.device_fingerprint ? JSON.parse(existing.device_fingerprint) : undefined,
            proxyUrl: payload.proxy_url
          });
          await incrementMetaSuccess(config, payload.business_id);
          onStatusUpdate?.(`✅ Token còn hiệu lực đến ${new Date(renewed.expiresAt).toLocaleDateString("vi-VN")}`);
          return renewed;
        }

        // Tier 1.5: Fast request-based (using cookies)
        if (existing?.cookies) {
          try {
            logger.info("[AUTH] Tier 1.5: Attempting fast request-based token extraction.", { businessId: payload.business_id });
            const result = await performRequestBasedLogin(config, payload, JSON.parse(existing.cookies));
            if (result) {
              await incrementMetaSuccess(config, payload.business_id);
              onStatusUpdate?.(`✅ Trích xuất Token siêu tốc thành công (Tier 1.5).`);
              return result;
            }
          } catch (e: any) {
            logger.debug(`[AUTH] Tier 1.5 failed: ${e.message}`);
          }
        }

        // Tier 2: Silent cookie login (Playwright)
        if (existing?.cookies) {
          try {
            logger.info("[AUTH] Tier 2: Attempting silent cookie login.", { businessId: payload.business_id });
            const result = await performPlaywrightLogin(config, payload, JSON.parse(existing.cookies));
            await incrementMetaSuccess(config, payload.business_id);
            onStatusUpdate?.(`✅ Đăng nhập bằng Cookie thành công cho Business **${payload.business_id}** (Tier 2).`);
            return result;
          } catch (e: any) {
            logger.warn(`[AUTH] Tier 2 failed (${e.message}). Escalating to Tier 3.`);
          }
        }

        // Tier 3: Full login with email/password
        logger.info("[AUTH] Tier 3: Full Playwright login with randomized fingerprint.", { businessId: payload.business_id });
        const result = await performPlaywrightLogin(config, payload);
        await incrementMetaSuccess(config, payload.business_id);
        onStatusUpdate?.(`🚀 Đăng nhập toàn phần thành công cho Business **${payload.business_id}** (Tier 3 - Playwright).`);
        return result;

      } catch (err: any) {
        logger.error(`[CRITICAL] ${payload.business_id}: ${err.message}`, { stack: err.stack, phase: "safeAutoLoginOrRenew" });
        await recordMetaFailure(config, payload.business_id, err.message);
        onStatusUpdate?.(`❌ Lỗi đăng nhập Business **${payload.business_id}**: ${err.message}`);
        throw err;
      }
    }
  });
}

// ─── Playwright Login (modified: no token extraction, use cookies to get pages) ─
export async function performPlaywrightLogin(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  savedCookies?: any[]
): Promise<TokenResult> {
  const fp = pickFingerprint(payload.device_fingerprint);
  logger.info(`[BROWSER] Using fingerprint: ${fp.platform} | ${fp.viewport.width}x${fp.viewport.height}`);

  const launchOptions: any = {
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled",
      "--disable-infobars", "--disable-dev-shm-usage", "--no-first-run", "--no-zygote",
      `--lang=${fp.locale}`,
    ],
  };
  if (payload.proxy_url) launchOptions.proxy = { server: payload.proxy_url };

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    userAgent: fp.userAgent,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.timezone,
    colorScheme: fp.colorScheme,
    deviceScaleFactor: fp.deviceScaleFactor,
    geolocation: { latitude: 10.762622 + (Math.random() * 0.02 - 0.01), longitude: 106.660172 + (Math.random() * 0.02 - 0.01) },
    permissions: ["geolocation"],
  });

  const page = await context.newPage();
  await page.addInitScript((platform: string) => {
    Object.defineProperty(navigator, "platform", { get: () => platform });
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    // @ts-ignore
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
  }, fp.platform);
  await page.mouse.move(Math.random() * fp.viewport.width * 0.8, Math.random() * fp.viewport.height * 0.8);

  try {
    // Try cookie login first
    if (savedCookies?.length) {
      await context.addCookies(savedCookies);
      await page.goto("https://www.facebook.com/adsmanager/manage/campaigns", { waitUntil: "load", timeout: 90000 });
      await humanDelay(3000, 5000);
      if (!page.url().includes("login") && !page.url().includes("checkpoint")) {
        // Get cookies from context
        const cookies = await context.cookies();
        // Fetch pages using cookies
        const { pages } = await fetchPagesWithCookies(cookies, payload.proxy_url);
        // If pages found, treat as success
        if (pages.length > 0) {
          // Generate a dummy token result (since we don't have a real token, but we have pages)
          const dummyToken = "cookie_auth_success";
          const expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;
          await finalizeLogin(config, payload, dummyToken, fp, context, page, pages);
          return { token: dummyToken, expiresAt };
        }
      }
    }

    // Full login via m.facebook.com
    await page.goto("https://m.facebook.com/login", { waitUntil: "domcontentloaded", timeout: 45000 });
    await humanDelay(2500, 4500);
    await dismissConsentBanner(page);

    await page.waitForSelector('input[name="email"]', { timeout: 20000 });
    await humanType(page, 'input[name="email"]', payload.fb_email);
    await humanDelay(800, 1600);
    await humanType(page, 'input[name="pass"]', decrypt(payload.fb_password_enc));
    await humanDelay(1200, 2200);
    logger.info("[AUTH] Submitting login form with reliable method...");
    await submitLoginForm(page);
    await humanDelay(3500, 6000);

    // Checkpoint handling
    if (page.url().includes("checkpoint") || page.url().includes("two_step")) {
      logger.info("[AUTH] Security checkpoint detected. Analyzing screen...");
      const isCaptcha = await page.locator('iframe[src*="recaptcha"]').isVisible({ timeout: 5000 }).catch(() => false) ||
                        await page.locator('text="I\'m not a robot"').isVisible({ timeout: 1000 }).catch(() => false);
      if (isCaptcha) {
        const screenshotPath = path.join(os.tmpdir(), `meta-captcha-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        throw new Error(`Facebook chặn đăng nhập bằng reCAPTCHA. Vui lòng đăng nhập thủ công 1 lần để xác minh IP. (Screenshot: ${screenshotPath})`);
      }
      const is2FA = await page.locator('input[name="approvals_code"], input#approvals_code').isVisible({ timeout: 3000 }).catch(() => false);
      if (is2FA) {
        logger.info("[AUTH] 2FA checkpoint confirmed.");
        if (!payload.fb_2fa_secret_enc) throw new Error("2FA required but no secret provided.");
        const code = await get2FACode(payload.fb_2fa_secret_enc);
        await page.locator('input[name="approvals_code"], input#approvals_code').fill(code);
        await humanDelay(800, 1500);
        await page.locator('button[type="submit"]').click();
        await humanDelay(2500, 4500);
        const trustSelector = 'button:has-text("Trust this device"), button:has-text("Lưu thiết bị"), button:has-text("Tin cậy"), [role="button"]:has-text("Trust")';
        const trustBtn = page.locator(trustSelector).first();
        if (await trustBtn.isVisible({ timeout: 8000 })) {
          await trustBtn.click();
          await humanDelay(2000, 4000);
        }
      } else {
        const screenshotPath = path.join(os.tmpdir(), `meta-unknown-checkpoint-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        throw new Error(`Facebook yêu cầu xác minh bảo mật (Checkpoint). Kiểm tra tài khoản trên điện thoại/máy tính. (Screenshot: ${screenshotPath})`);
      }
    }

    // Navigate to Ads Manager to get cookies
    logger.info("[AUTH] Navigating to Ads Manager to capture cookies...");
    await page.goto("https://www.facebook.com/adsmanager/manage/campaigns", {
      waitUntil: "load",
      timeout: 90000,
    });
    await humanDelay(3000, 5000);

    // Get cookies from browser context
    const cookies = await context.cookies();
    // Fetch pages using cookies
    const { pages } = await fetchPagesWithCookies(cookies, payload.proxy_url);

    // Generate a dummy token (we don't have a real token, but we have pages)
    const dummyToken = "cookie_auth_success";
    const expiresAt = Date.now() + 60 * 24 * 60 * 60 * 1000;

    await finalizeLogin(config, payload, dummyToken, fp, context, page, pages);
    return { token: dummyToken, expiresAt };

  } catch (err: any) {
    const errorScreenshot = path.join(os.tmpdir(), `auth-error-${payload.business_id.substring(0, 16)}-${Date.now()}.png`);
    await page.screenshot({ path: errorScreenshot, fullPage: true }).catch(() => {});
    logger.error(`[AUTH] Screenshot saved: ${errorScreenshot}`);
    err.message += ` (Screenshot: ${errorScreenshot})`;
    throw err;
  } finally {
    await browser.close();
  }
}

// ── Helper functions (unchanged) ───────────────────────────────────────────
async function dismissConsentBanner(page: any) {
  const consentSelectors = [
    'button:has-text("Allow all cookies")', 'button:has-text("Accept All")',
    'button:has-text("Tiếp tục")', 'button:has-text("Cho phép tất cả cookie")',
    'button:has-text("Chấp nhận tất cả")', '[data-cookiebanner="accept_button"]'
  ];
  for (const sel of consentSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
      logger.info(`[AUTH] Dismissed consent: ${sel}`);
      await btn.click();
      await humanDelay(1000, 2000);
      return;
    }
  }
}

async function submitLoginForm(page: any) {
  try {
    await page.locator('input[name="pass"]').press('Enter');
    await humanDelay(2000, 4000);
    return;
  } catch {}
  const loginBtn = page.locator('button[type="submit"], button[name="login"], [role="button"]:has-text("Đăng nhập"), [role="button"]:has-text("Log In")').first();
  if (await loginBtn.isVisible({ timeout: 15000 })) {
    await loginBtn.click({ position: { x: 30 + Math.random() * 40, y: 15 + Math.random() * 10 } });
  } else {
    await page.keyboard.press('Enter');
  }
}

async function finalizeLogin(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  token: string,
  fp: any,
  context: any,
  page: any,
  pages: any[]
) {
  const cookies = await context.cookies();
  // Perform hybrid token renew (but token may be dummy, so we just save)
  // We'll keep the token as is (dummy)
  await saveUserMetaAuth(config, payload.business_id, {
    email: payload.fb_email,
    passwordEnc: payload.fb_password_enc,
    otpSecretEnc: payload.fb_2fa_secret_enc,
    accessToken: token,
    expiresAt: Date.now() + 60 * 24 * 60 * 60 * 1000,
    cookies,
    deviceFingerprint: fp,
    proxyUrl: payload.proxy_url
  });
  if (pages.length > 0) {
    await saveUserFacebookPages(config, payload.business_id, payload.fb_email, pages);
    logger.info(`[AUTH] Saved ${pages.length} pages to DB.`);
  }
  logger.info(`[AUTH] Login SUCCESS - Using cookie-based session.`);
}

// ─── Tier 1.5: Fast Request-Based Token Extraction (unchanged) ─────────────
async function performRequestBasedLogin(
  config: AdsManagerPluginConfig,
  payload: MetaAuthPayload,
  cookies: any[]
): Promise<TokenResult | null> {
  const fp = pickFingerprint(payload.device_fingerprint);
  const cookieString = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const headers: any = {
    "User-Agent": fp.userAgent,
    "Cookie": cookieString,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1"
  };
  const axiosOptions: any = { headers, timeout: 30000, validateStatus: () => true };
  if (payload.proxy_url) axiosOptions.httpsAgent = new HttpsProxyAgent(payload.proxy_url);
  try {
    const res = await axios.get("https://www.facebook.com/adsmanager/manage/campaigns", axiosOptions);
    const html = res.data;
    const eaagMatch = html.match(/EAAG[a-zA-Z0-9_-]{20,}/);
    if (eaagMatch) {
      return await exchangeToLongLived(eaagMatch[0], payload.business_id);
    }
    const eaabMatch = html.match(/EAAB[a-zA-Z0-9_-]{20,}/);
    if (eaabMatch) {
      return await exchangeToLongLived(eaabMatch[0], payload.business_id);
    }
  } catch (err: any) {
    logger.debug(`[TIER 1.5] Request failed: ${err.message}`);
  }
  return null;
}

// ─── fetchUserPages (Graph API fallback) – unchanged but kept for compatibility ─
export async function fetchUserPages(rawToken: string, proxyUrl?: string): Promise<any[]> {
  const token = decodeFbHtmlToken(rawToken);
  const version = process.env.META_GRAPH_VERSION || "v25.0";
  const isIOS = token.startsWith("EAAB");
  const isAndroid = token.startsWith("EAAG");
  const headers: any = { "Accept": "*/*", "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8" };
  if (isIOS) {
    headers["User-Agent"] = "FBAN/FBIOS;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/iPhone;FBBD/apple;FBPN/com.facebook.Messenger;FBDV/iPhone13,2;FBSV/15.0;FBOP/1;FBCA/arm64-v8a:";
    headers["X-FB-App-Id"] = "124024574287";
  } else if (isAndroid) {
    headers["User-Agent"] = "FBAN/FB4A;FBAV/440.0.0.0.0;FBBV/531000000;FBLC/vi_VN;FBMF/Google;FBBD/google;FBPN/com.facebook.katana;FBDV/Pixel 5;FBSV/13;FBOP/1;FBCA/arm64-v8a:";
    headers["X-FB-App-Id"] = "350685531728";
  } else {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  }
  const options: any = { timeout: 20000, headers };
  if (proxyUrl) options.httpsAgent = new HttpsProxyAgent(proxyUrl);

  try {
    const url = `https://graph.facebook.com/${version}/me?fields=accounts{name,category,access_token,perms,tasks}&access_token=${token}`;
    const resp = await axios.get(url, options);
    if (resp.data?.accounts?.data?.length > 0) return resp.data.accounts.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 1 failed: ${e.message}`); }
  try {
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=name,category,access_token&access_token=${token}`;
    const resp = await axios.get(url, options);
    if (resp.data?.data?.length > 0) return resp.data.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 2 failed: ${e.message}`); }
  try {
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name&access_token=${token}`;
    const resp = await axios.get(url, options);
    if (resp.data?.data?.length > 0) return resp.data.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 3 failed: ${e.message}`); }
  try {
    const url = `https://graph.facebook.com/${version}/me/accounts?fields=id,name,access_token&access_token=${token}`;
    const plainOptions: any = { timeout: 20000 };
    if (proxyUrl) plainOptions.httpsAgent = new HttpsProxyAgent(proxyUrl);
    const resp = await axios.get(url, plainOptions);
    if (resp.data?.data?.length > 0) return resp.data.data;
  } catch (e: any) { logger.debug(`fetchUserPages Layer 4 failed: ${e.message}`); }
  return [];
}
