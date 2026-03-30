/**
 * Graph API Error Parser — Centralized error handling for all Meta Graph API calls
 *
 * Error table sourced from:
 * - facebook-page SKILL.md (seph1709) — codes 100, 102, 190, 200, 10, 230, 368
 * - Lanbow meta-account-setup.md — permission chain troubleshooting
 *
 * Usage:
 *   import { parseGraphApiError, formatErrorLog } from "./graph-errors.js";
 *   catch (err) {
 *     const graphErr = parseGraphApiError(err);
 *     logger.error(formatErrorLog("dang_bai", "createPost", graphErr));
 *     return { text: `⚠️ ${graphErr.message}\n💡 ${graphErr.guidance}` };
 *   }
 */

export interface GraphApiError {
  code: number;
  subcode?: number;
  message: string;
  /** Vietnamese user-facing remediation instruction */
  guidance: string;
  severity: "fatal" | "recoverable" | "rate_limit";
}

interface ErrorTableEntry {
  guidance: string;
  severity: GraphApiError["severity"];
}

/**
 * Error code → user guidance mapping.
 * From facebook-page SKILL.md error table:
 *   100 = Invalid parameter
 *   102 = Session expired
 *   190 (subcode 460) = Token expired
 *   190 (subcode 467) = Invalid token
 *   200 = Permission denied
 *   10  = Page permission denied
 *   230 = Requires re-auth
 *   368 = Rate limited / temporarily blocked
 */
const ERROR_TABLE: Record<number, ErrorTableEntry> = {
  1: {
    guidance: "Facebook đang chặn token này (mã lỗi 1: Invalid Request). Vui lòng thử dùng lệnh /nhap_cookie để vượt rào bảo mật (IP/Bot Detection).",
    severity: "fatal",
  },
  4: {
    guidance: "Tài khoản đang bị giới hạn hoặc lỗi tham số hệ thống. Vui lòng thử dùng lệnh /nhap_cookie để thay thế.",
    severity: "fatal",
  },
  100: {
    guidance: "Tham số không hợp lệ — kiểm tra lại nội dung gửi đi.",
    severity: "recoverable",
  },
  102: {
    guidance: "Phiên đăng nhập hết hạn — dùng /nhap_token để nhập token mới.",
    severity: "fatal",
  },
  190: {
    guidance: "Token không hợp lệ hoặc hết hạn — dùng /nhap_token để nhập token mới.",
    severity: "fatal",
  },
  200: {
    guidance:
      "Thiếu quyền — vào developers.facebook.com/tools/explorer/ cấp thêm quyền (pages_manage_posts, pages_read_engagement) rồi /nhap_token lại.",
    severity: "fatal",
  },
  10: {
    guidance: "Thiếu quyền Page — cần cấp pages_read_engagement + pages_manage_posts.",
    severity: "fatal",
  },
  230: {
    guidance: "Cần xác thực lại — dùng /nhap_token để nhập token mới.",
    severity: "fatal",
  },
  368: {
    guidance: "Page đang bị giới hạn tạm thời (rate limited) — thử lại sau 30–60 phút.",
    severity: "rate_limit",
  },
};

/**
 * Subcode-specific overrides for error code 190.
 */
const SUBCODE_190: Record<number, string> = {
  460: "Token đã hết hạn — dùng /nhap_token để nhập token mới.",
  463: "Token đã hết hạn — dùng /nhap_token để nhập token mới.",
  467: "Token không hợp lệ — kiểm tra lại token hoặc tạo token mới tại Graph API Explorer.",
};

/**
 * Parse any error shape into a structured GraphApiError.
 *
 * Handles three patterns:
 * 1. Structured: err.response.data.error (axios) or err.error (fetch-parsed)
 * 2. Inline code: message contains "[190]" or "(#200)"
 * 3. Unknown: fallback with generic guidance
 */
export function parseGraphApiError(err: unknown): GraphApiError {
  // --- Pattern 1: Structured error object ---
  const errObj = err as Record<string, any> | null;
  const parsed =
    errObj?.response?.data?.error || // axios
    errObj?.error || // direct fetch JSON
    (typeof errObj?.code === "number" ? errObj : null); // already parsed

  if (parsed?.code && typeof parsed.code === "number") {
    const code: number = parsed.code;
    const subcode: number | undefined = parsed.error_subcode;
    const entry = ERROR_TABLE[code];

    let guidance = entry?.guidance ?? `Lỗi Graph API không xác định (code ${code}).`;

    // Subcode override for 190
    if (code === 190 && subcode && SUBCODE_190[subcode]) {
      guidance = SUBCODE_190[subcode]!;
    }

    return {
      code,
      subcode,
      message: parsed.message || String(err),
      guidance,
      severity: entry?.severity ?? "recoverable",
    };
  }

  // --- Pattern 2: Error code embedded in message string ---
  const errMsg =
    (errObj instanceof Error ? errObj.message : null) ||
    (typeof errObj === "string" ? errObj : String(err));

  const codeMatch = errMsg.match(/\[(\d+)\]|\(#(\d+)\)/);
  if (codeMatch) {
    const code = parseInt(codeMatch[1] || codeMatch[2]!, 10);
    const entry = ERROR_TABLE[code];
    return {
      code,
      message: errMsg,
      guidance: entry?.guidance ?? `Lỗi Graph API (code ${code}).`,
      severity: entry?.severity ?? "recoverable",
    };
  }

  // --- Pattern 3: Unknown ---
  return {
    code: 0,
    message: typeof errMsg === "string" ? errMsg.slice(0, 200) : "Unknown error",
    guidance: "Lỗi không xác định — kiểm tra /debug_auth để xem trạng thái hệ thống.",
    severity: "recoverable",
  };
}

/**
 * Format a structured log line for error tracking.
 * Output: [MODULE] ACTION FAILED | code=190 subcode=460 | Token has expired
 */
export function formatErrorLog(module: string, action: string, err: GraphApiError): string {
  const sub = err.subcode ? ` subcode=${err.subcode}` : "";
  return `[${module}] ${action} FAILED | code=${err.code}${sub} | ${err.message.slice(0, 150)}`;
}

/**
 * Build a user-facing Telegram error message block.
 */
export function buildErrorMessage(label: string, err: GraphApiError): string {
  return [
    `⚠️ **Lỗi ${label}** (code ${err.code}${err.subcode ? `/${err.subcode}` : ""})`,
    `📋 ${err.message.slice(0, 150)}`,
    "",
    `💡 **Cách xử lý:** ${err.guidance}`,
  ].join("\n");
}
