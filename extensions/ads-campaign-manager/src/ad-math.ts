/**
 * Ad Math Engine
 * Explicit, hardcoded mathematical formulas for Performance Marketing.
 * This prevents AI hallucinations in financial reporting.
 */

export interface AdPerformanceMetrics {
  spend: number;
  revenue: number;
  cogs: number;      // Cost of Goods Sold
  shipping: number;
  leads: number;
}

/**
 * Tính ROAS thực tế (True ROAS)
 * Công thức: (Doanh thu - Giá vốn - Phí ship) / Tiền ads
 */
export function calculateTrueROAS(metrics: AdPerformanceMetrics): number {
  if (metrics.spend <= 0) return 0;
  const grossProfit = metrics.revenue - metrics.cogs - metrics.shipping;
  return grossProfit / metrics.spend;
}

/**
 * Tính CPA mục tiêu (Break-even CPA)
 * Công thức: Giá bán * Biên lợi nhuận mục tiêu
 */
export function calculateBreakEvenCPA(salePrice: number, marginPercent: number): number {
  return salePrice * (marginPercent / 100);
}

/**
 * Ước tính chi tiêu đối thủ (Competitor Spend Estimation)
 * Dựa trên số lượng bài ads và thời gian chạy.
 * @param durationDays Số ngày bài ads đã active
 * @param mediaType Định dạng ('video', 'image', 'carousel')
 */
export function estimateCompetitorSpend(durationDays: number, mediaType: string): number {
  // Benchmark trung bình: Video tiêu ~500k/ngày, Ảnh tiêu ~200k/ngày (VND)
  const dailyBenchmark = mediaType.toLowerCase().includes('video') ? 500000 : 200000;
  return durationDays * dailyBenchmark;
}

/**
 * Kiểm tra điểm bất thường (Anomaly Detection)
 * Chặn các con số phi lý trước khi báo cáo cho người quản lý.
 */
export function detectMetricAnomaly(metric: string, value: number): { isAnomaly: boolean; reason?: string } {
  if (metric === 'roas' && value > 50) {
    return { isAnomaly: true, reason: "ROAS > 50 là con số quá phi lý, cần kiểm tra lại pixel/tracking." };
  }
  if (metric === 'cpa' && value < 1000 && value > 0) {
    return { isAnomaly: true, reason: "CPA < 1000đ thường là do lỗi mapping lead hoặc data rác." };
  }
  if (value < 0) {
     return { isAnomaly: true, reason: "Số liệu không thể âm." };
  }
  return { isAnomaly: false };
}

/**
 * Audit Trail: Trả về chuỗi mô tả phép tính để đảm bảo tính minh bạch
 */
export function getFormulaAuditTrail(action: string, params: any): string {
  switch (action) {
    case 'estimate_spend':
      const daily = params.mediaType.toLowerCase().includes('video') ? '500k' : '200k';
      return `(Số ngày: ${params.durationDays} x Định mức ${daily}/ngày)`;
    case 'true_roas':
      return `(Doanh thu ${params.revenue.toLocaleString()} - Giá vốn ${params.cogs.toLocaleString()} - Ship ${params.shipping.toLocaleString()}) / Ads ${params.spend.toLocaleString()}`;
    default:
      return "Phép tính chuẩn hệ thống.";
  }
}

// ─── Phase 19: Ad Intelligence Scoring Engine ─────────────────────────────

import type {
  RawCompetitorAd,
  PostEngagementData,
  ScoredCompetitorAd,
  HookType,
  ScoreLabel,
  ImpressionsBand,
} from "./types.js";

/**
 * Proxy Model: Ước lượng engagement khi không có post URL hoặc Apify fail.
 * Dùng impressions_band + industry benchmark (avg engagement rate 0.9%).
 */
export function estimateEngagementFromProxy(ad: {
  impressionsBand?: ImpressionsBand;
  daysLive: number;
  platforms: string[];
  adLibraryId: string;
}): PostEngagementData {
  const reachMap: Record<string, number> = {
    "< 1K": 500,
    "1K-5K": 3000,
    "5K-20K": 12000,
    "20K-100K": 60000,
    "100K-500K": 300000,
    "> 500K": 800000,
  };
  const reach = reachMap[ad.impressionsBand ?? "1K-5K"] ?? 3000;
  // Industry benchmark: FB ads avg organic engagement ~0.9%
  const totalEngagements = Math.round(reach * 0.009);
  return {
    postUrl: `https://facebook.com/ads/library/?id=${ad.adLibraryId}`,
    likes:    Math.round(totalEngagements * 0.70),
    comments: Math.round(totalEngagements * 0.20),
    shares:   Math.round(totalEngagements * 0.10),
    isVideo:  false,
    postText: "",
    scrapedAt: new Date().toISOString(),
    source: "proxy_model",
  };
}

/**
 * AdTrustScore v2 — Hệ thống chấm điểm (0-100)
 * A: Social Signals (max 40đ)
 * B: Longevity Signals (max 30đ)
 * C: Creative Quality (max 30đ)
 */
export function calculateAdTrustScore(params: {
  ad: RawCompetitorAd;
  engagement: PostEngagementData;
}): ScoredCompetitorAd {
  const { ad, engagement } = params;
  const { likes, comments, shares, isVideo } = engagement;

  // ── GUARD: Phát hiện fake engagement ────────────────────────────
  const commentLikeRatio = comments / Math.max(likes, 1);
  const suspectedFakeEngagement = likes > 1000 && commentLikeRatio < 0.02;

  // ── A: Social Signals (max 40đ) ─────────────────────────────────
  let socialSignals = 0;
  socialSignals += Math.min(likes / 50, 10);          // max 10đ — 200 likes = max
  socialSignals += Math.min(comments / 7, 15);        // max 15đ — 105 comments = max
  socialSignals += Math.min(shares / 3, 10);          // max 10đ — 30 shares = max
  // Bonus: comment/like ratio — tín hiệu genuine engagement
  socialSignals += commentLikeRatio >= 0.10 ? 5 :
                   commentLikeRatio >= 0.05 ? 2 : 0;
  // Penalty: suspected fake
  if (suspectedFakeEngagement) socialSignals = Math.max(socialSignals - 10, 0);
  socialSignals = Math.min(Math.round(socialSignals), 40);

  // ── B: Longevity Signals (max 30đ) ──────────────────────────────
  let longevitySignals = 0;
  longevitySignals += Math.min(ad.daysLive / 2, 15);         // max 15đ — 30 ngày = max
  longevitySignals += ad.platforms.length >= 3 ? 10 :
                      ad.platforms.length >= 2 ? 8 : 4;      // multi-platform
  longevitySignals += ad.isActive ? 5 : 0;                   // đang live hôm nay
  longevitySignals = Math.min(Math.round(longevitySignals), 30);

  // ── C: Creative Quality (max 30đ — text analysis) ───────────────
  const adText = ad.adText;
  const adTextLower = adText.toLowerCase();

  const hasCTA = !!(ad.ctaButton) ||
    /nhắn tin|đặt hàng|xem thêm|liên hệ|gọi ngay|order ngay|inbox/i.test(adText);
  const hasSocialProof =
    /\d+.*(khách|đơn|sao|review|feedback|tin tưởng|đã mua|hộ gia đình)/i.test(adText);
  const hasPrice =
    /\d+.*([đ₫k]|\.000|giá|giảm|sale|ưu đãi|khuyến mãi|freeship)/i.test(adText);

  // Hook detection — scan 60 ký tự đầu
  const firstChars = adText.slice(0, 60);
  const hookType: HookType =
    /^\s*\d/.test(firstChars)                                       ? "number" :
    /[?？]/.test(firstChars.slice(0, 40))                           ? "question" :
    /đau|vấn đề|sợ|lo lắng|chưa|tại sao|bí quyết/i.test(firstChars) ? "painpoint" :
    "generic";

  let creativeQuality = 0;
  creativeQuality += isVideo ? 10 : ad.mediaType === "carousel" ? 8 : 4;
  creativeQuality += hasCTA          ? 8 : 0;
  creativeQuality += hasSocialProof  ? 7 : 0;
  creativeQuality += hasPrice        ? 5 : 0;
  // Hook bonus
  creativeQuality += hookType === "number"    ? 3 :
                     hookType === "question"  ? 2 :
                     hookType === "painpoint" ? 2 : 0;
  creativeQuality = Math.min(Math.round(creativeQuality), 30);

  // ── TỔNG ĐIỂM (hard cap 100) ─────────────────────────────────────
  const rawScore = socialSignals + longevitySignals + creativeQuality;
  const trustScore = Math.min(Math.round(rawScore), 100);

  const scoreLabel: ScoreLabel =
    trustScore >= 80 ? "excellent" :
    trustScore >= 60 ? "good" :
    trustScore >= 40 ? "average" : "skip";

  return {
    ...ad,
    engagement,
    trustScore,
    scoreLabel,
    scoringVersion: "v2",
    scoreBreakdown: { socialSignals, longevitySignals, creativeQuality },
    analysisFlags: {
      commentLikeRatio,
      suspectedFakeEngagement,
      hookType,
      hasCTA,
      hasSocialProof,
      hasPrice,
    },
  };
}
