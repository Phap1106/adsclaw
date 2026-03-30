/**
 * chat-handler.ts — Conversational AI Mode (Phase 20)
 * ─────────────────────────────────────────────────────
 * Xử lý tin nhắn tự nhiên tiếng Việt, không cần lệnh slash.
 * Xưng hô: "em" (bot) ↔ "Sếp" (user).
 * Pattern: NLP intent detection → route to existing command handlers.
 */

// ─── Intent Map ───────────────────────────────────────────────────────────────
//
// Mỗi intent có danh sách pattern keywords (regex) và action tương ứng.
// Ưu tiên theo thứ tự từ trên xuống dưới.

export type IntentAction =
  | "baocao"
  | "tongquan"
  | "canhbao"
  | "ngansach"
  | "doithu_top"
  | "de_xuat"
  | "dongbo"
  | "pheduyet"
  | "tuchoi"
  | "lenh"
  | "cau_hinh"
  | "kiem_tra"
  | "huong_dan"
  | "noi_quy"
  | "accounts"
  | "inbox"
  | "tra_loi"
  | "bai_viet"
  | "dat_lich"
  | "xoa_bai"
  | "inbox_forward"
  | "unknown";

export type DetectedIntent = {
  action: IntentAction;
  confidence: "high" | "medium" | "low";
  extractedArgs?: string;
  matchedPattern: string;
};

// ─── Intent Patterns ─────────────────────────────────────────────────────────

const INTENT_RULES: Array<{
  action: IntentAction;
  patterns: RegExp[];
  confidence: "high" | "medium";
}> = [
  // ── Báo cáo & Tổng quan ──
  {
    action: "baocao",
    patterns: [
      /b[aá]o c[aá]o/i,
      /h[oô]m nay (chi ti[eê]u|spending|k[eế]t qu[aả]|hi[eê]u qu[aả])/i,
      /chi ti[eê]u bao nhi[eê]u/i,
      /h[oô]m nay th[eế] n[àa]o/i,
      /kết quả quảng c[aá]o/i,
      /camp.*h[oô]m nay/i,
      /\broas\b.*h[oô]m nay/i,
    ],
    confidence: "high",
  },
  {
    action: "tongquan",
    patterns: [
      /t[oổ]ng quan/i,
      /s[ưứ]c kh[oỏ]e/i,
      /t[àaá]i kho[aả]n.*([oổ]n|kh[oỏ]e|t[ốo]t)/i,
      /overview/i,
      /[aả]nh.*t[oổ]ng th[eể]/i,
      /k[hH][ốo][eE] kh[oô]ng/i,
    ],
    confidence: "high",
  },

  // ── Cảnh báo & Ngân sách ──
  {
    action: "canhbao",
    patterns: [
      /c[aả]nh b[aá]o/i,
      /c[aó] v[aấ]n đ[ềế] g[ìi]/i,
      /b[aấ]t th[uườ][ờo]ng/i,
      /l[oỗ]i g[ìi]/i,
      /alert/i,
      /camp n[àa]o \w+ th[ấặ]p/i,
    ],
    confidence: "high",
  },
  {
    action: "ngansach",
    patterns: [
      /ng[aâ]n s[aá]ch/i,
      /budget/i,
      /pacing/i,
      /chi ti[eê]u nhanh/i,
      /c[ạắ]n ki[eệ]t/i,
      /h[eế]t ti[eề]n/i,
    ],
    confidence: "high",
  },

  // ── Đối thủ ──
  {
    action: "doithu_top",
    patterns: [
      /\u0111[oố]i th[uủ]/i,
      /competitor/i,
      /b[àài] qu[aả]ng c[aá]o.*t[oố]t/i,
      /winning ads/i,
      /b[àài] n[àa]o hi[eệ]u qu[aả]/i,
      /top \d* b[àài]/i,
      /b[àài] \u0111[aá]ng h[oọ]c/i,
      /soi qu[aả]ng c[aá]o/i,
    ],
    confidence: "high",
  },

  // ── Đề xuất AI ──
  {
    action: "de_xuat",
    patterns: [
      /\u0111[eề] xu[aấ]t/i,
      /proposal/i,
      /ai g[oợ]i [yý]/i,
      /t[ôô]i n[eế]n l[àa]m g[ìi]/i,
      /ph[ảả]i l[àa]m g[ìi]/i,
      /g[oợ]i [yý] h[ôô]m nay/i,
      /action.*n[àa]o/i,
      /c[aó] n[eế]n.*kh[oô]ng/i,
    ],
    confidence: "high",
  },

  // ── Phê duyệt / Từ chối ──
  {
    action: "pheduyet",
    patterns: [
      /ph[eê] duy[eệ]t/i,
      /ch[aấ]p thu[aậ]n/i,
      /\b(ok|okay|OK)\b.*(?:id|#\d)/i,
      /duy[eệ]t\s+(#?\w+)/i,
      /\byes\b.*\bcamp\b/i,
      /\u0111[oồ]ng [yý]/i,
    ],
    confidence: "medium",
  },
  {
    action: "tuchoi",
    patterns: [
      /t[uừ] ch[oố]i/i,
      /b[oỏ] qua/i,
      /kh[oô]ng duy[eệ]t/i,
      /cancel.*proposal/i,
      /\bno\b.*\bid\b/i,
    ],
    confidence: "medium",
  },

  // ── Ra lệnh (free-form) ──
  {
    action: "lenh",
    patterns: [
      /^(h[aã]y|cho tôi|em [oơ]i|b[aả]o)\s+(t[aắ]t|d[uừ]ng|gi[aả]m|t[aă]ng|b[aậ][tậ])\s+/i,
      /(t[aắ]t|pause|d[uừ]ng) camp/i,
      /(t[aă]ng|scale up|t[aă]ng thêm) budget/i,
      /(gi[aả]m|c[aắ]t|reduce) budget/i,
      /(duplicate|nh[aâ]n b[aả]n) camp/i,
    ],
    confidence: "high",
  },

  // ── Đồng bộ ──
  {
    action: "dongbo",
    patterns: [
      /[dđ][oồ]ng b[oộ]/i,
      /c[aậ]p nh[aậ]t d[uữ] li[eệ]u/i,
      /refresh data/i,
      /sync/i,
      /reload/i,
      /l[aấ]y s[oố] li[eệ]u m[oớ]i/i,
    ],
    confidence: "high",
  },

  // ── System ──
  {
    action: "cau_hinh",
    patterns: [
      /c[aấ]u h[iì]nh/i,
      /config/i,
      /token/i,
      /api key/i,
      /thi[eế]t l[aậ]p/i,
      /setting/i,
    ],
    confidence: "high",
  },
  {
    action: "kiem_tra",
    patterns: [
      /ki[eể]m tra/i,
      /k[eế]t n[oố]i/i,
      /doctor/i,
      /ch[aẩ]n [dđ][oò]an/i,
      /c[oó] ho[aạ]t [dđ][oộ]ng kh[oô]ng/i,
      /bot.*[oổ]n kh[oô]ng/i,
      /h[eệ] th[oố]ng.*[oổ]n/i,
    ],
    confidence: "high",
  },
  {
    action: "huong_dan",
    patterns: [
      /h[uướ][oớ]ng d[aẫ]n/i,
      /d[uù]ng th[eế] n[àa]o/i,
      /c[aó] nh[uữ]ng g[ìi]/i,
      /\bhelp\b/i,
      /l[aà]m [dđ][uượ][oợ]c g[ìi]/i,
      /ch[uứ]c n[aă]ng/i,
      /menu/i,
    ],
    confidence: "medium",
  },
  {
    action: "noi_quy",
    patterns: [/n[oộ]i quy/i, /[dđi]i[eề]u kho[aả]n/i, /terms/i, /rules/i],
    confidence: "medium",
  },
  {
    action: "accounts",
    patterns: [
      /danh s[aá]ch t[àaá]i kho[aả]n/i,
      /s[ưứ]c kh[oỏ]e t[àaá]i kho[aả]n/i,
      /qu[ảả]n l[ýý] t[àaá]i kho[aả]n/i,
      /status accounts/i,
      /t[àaá]i kho[aả]n ch[eế]t/i,
    ],
    confidence: "high",
  },
  {
    action: "inbox",
    patterns: [
      /inbox/i,
      /tin nh[aắ]n/i,
      /kh[aá]ch h[oỏ]i/i,
      /ai nh[aắ]n tin/i,
      /messenger/i,
    ],
    confidence: "high",
  },
  {
    action: "bai_viet",
    patterns: [
      /b[àài] vi[eế]t/i,
      /b[àài] [đđ][aă]ng/i,
      /post/i,
      /feeds/i,
    ],
    confidence: "high",
  },
  {
    action: "dat_lich",
    patterns: [
      /[đđ][aặ]t l[iị]ch/i,
      /h[eẹ]n gi[oờ]/i,
      /schedule/i,
    ],
    confidence: "high",
  },
  {
    action: "xoa_bai",
    patterns: [
      /x[oó]a b[àài]/i,
      /delete post/i,
      /remove post/i,
    ],
    confidence: "high",
  },
  {
    action: "inbox_forward",
    patterns: [
      /forward/i,
      /chuy[eể]n ti[eế]p/i,
      /b[aáo] tin nh[aắ]n/i,
    ],
    confidence: "high",
  },
];

// ─── Core NLP Detector ────────────────────────────────────────────────────────

export function detectIntent(message: string): DetectedIntent {
  const msg = message.trim();

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(msg)) {
        // Try extract args for "lenh" action
        let extractedArgs: string | undefined;
        if (rule.action === "lenh") {
          extractedArgs = msg;
        } else if (rule.action === "doithu_top") {
          // Extract keyword after commonly used phrases
          const kw = msg
            .replace(/soi|qu[aả]ng c[aá]o|[dđ][oố]i th[uủ]|h[aả]y|cho em|top|b[àà]i|ng[àa]nh/gi, "")
            .trim();
          if (kw.length > 2) extractedArgs = kw;
        } else if (rule.action === "pheduyet" || rule.action === "tuchoi") {
          // Extract proposal ID
          const idMatch = msg.match(/[#]?([a-z0-9_-]{4,})/i);
          if (idMatch) extractedArgs = idMatch[1];
        }

        return {
          action: rule.action,
          confidence: rule.confidence,
          extractedArgs,
          matchedPattern: pattern.toString(),
        };
      }
    }
  }

  return {
    action: "unknown",
    confidence: "low",
    matchedPattern: "none",
  };
}

// ─── Response Templates ──────────────────────────────────────────────────────

export function buildConfusedResponse(message: string): string {
  const greetings = [
    "Dạ Sếp ơi, em chưa hiểu ý Sếp muốn làm gì ạ 😅",
    "Em xin lỗi Sếp, câu đó em chưa xử lý được ạ.",
    "Sếp nói lại cho em hiểu được không ạ?",
  ];
  const random = greetings[Math.floor(Date.now() / 1000) % greetings.length]!;

  return [
    random,
    "",
    "Sếp có thể thử:",
    "• \"Báo cáo hôm nay\"",
    "• \"Đối thủ nào đang chạy tốt?\"",
    "• \"Tắt camp X\"",
    "• \"Đề xuất AI\"",
    "",
    "Hoặc bấm nút 📖 Hướng dẫn bên dưới để xem đầy đủ ạ.",
  ].join("\n");
}

export function buildGreetingResponse(ownerName?: string): string {
  const name = ownerName ?? "Sếp";
  const hour = new Date().getHours();
  const timeGreet =
    hour < 12 ? "Chào buổi sáng" : hour < 18 ? "Xin chào buổi chiều" : "Chào buổi tối";

  return [
    `${timeGreet} ${name} ạ! 🤖`,
    "",
    "Em là Trợ lý Ads AI của Sếp. Sếp cứ nhắn tự nhiên nhé, em hiểu tiếng Việt ạ!",
    "",
    "Sếp muốn làm gì hôm nay?",
    "• Xem báo cáo → \"báo cáo hôm nay\"",
    "• Soi đối thủ → \"đối thủ đang chạy gì?\"",
    "• Ra lệnh → \"tắt camp X\"",
  ].join("\n");
}

export function buildRoutingAck(intent: DetectedIntent): string {
  const ackMap: Record<IntentAction, string> = {
    baocao: "Dạ Sếp, em đang lấy báo cáo ngay ạ...",
    tongquan: "Vâng Sếp, em kiểm tra sức khỏe tài khoản ngay ạ!",
    canhbao: "Dạ, em xem cảnh báo cho Sếp ngay ạ...",
    ngansach: "Vâng Sếp, em kiểm tra ngân sách liền ạ!",
    doithu_top: "Dạ Sếp, em đang phân tích ads đối thủ, chờ em tí ạ... 🔍",
    de_xuat: "Vâng, em lấy danh sách đề xuất AI cho Sếp ạ!",
    dongbo: "Dạ Sếp, em sync dữ liệu mới nhất ngay ạ...",
    pheduyet: "Vâng Sếp, em phê duyệt ngay ạ!",
    tuchoi: "Dạ, em ghi nhận Sếp từ chối rồi ạ.",
    lenh: "Dạ Sếp, em nhận lệnh rồi ạ! Em xử lý ngay...",
    cau_hinh: "Vâng, em mở cấu hình cho Sếp xem ạ!",
    kiem_tra: "Dạ, em chẩn đoán hệ thống ngay ạ...",
    huong_dan: "Vâng Sếp, em mở hướng dẫn ngay ạ!",
    noi_quy: "Dạ Sếp, em mở nội quy cho Sếp xem ạ!",
    accounts: "Dạ Sếp, em kiểm tra danh sách tài khoản cho Sếp ngay ạ...",
    inbox: "Vâng, em xem tin nhắn inbox mới nhất cho Sếp ạ...",
    tra_loi: "Dạ, em chuẩn bị trả lời tin nhắn ngay ạ...",
    bai_viet: "Vâng Sếp, em lấy danh sách bài đăng gần đây ạ...",
    dat_lich: "Dạ, em hỗ trợ lên lịch đăng bài cho Sếp ạ!",
    xoa_bai: "Vâng, em kiểm tra để xóa bài bài đăng theo ý Sếp ạ...",
    inbox_forward: "Vâng Sếp, em mở cài đặt chuyển tiếp tin nhắn ạ!",
    unknown: "",
  };
  return ackMap[intent.action] || "";
}

// ─── Greeting Detector ────────────────────────────────────────────────────────

export function isGreeting(message: string): boolean {
  return /^(xin ch[àa]o|ch[àa]o|hello|hi|hey|ờm|ừm|ok bot|bot ơi|\bstart\b|bắt đầu|mở)/i.test(
    message.trim(),
  );
}
