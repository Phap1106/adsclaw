---
name: creative-analysis
description: Scores ads on 6 dimensions (0-10 each), detects creative fatigue, analyzes hooks against Eugene Schwartz awareness levels, identifies winning creative patterns. Triggers on "đánh giá creative", "copy này có tốt không", "hook", "creative fatigue", or when reviewing competitor ads.
---

# Creative Analysis Skill

## AD SCORING SYSTEM (6 dimensions × 10 = 60 max → normalized to 100)

```
DIMENSION          WEIGHT  WHAT TO EVALUATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hook Strength        25%   Scroll-stop power, specificity, curiosity gap
Offer Clarity        20%   Promise clearly stated, tangible value
CTA Effectiveness    15%   Specific, low-friction, matches funnel stage
Emotional Resonance  15%   Pain/desire tapped, authenticity
Body Copy Flow       15%   Agitate → Solution → Proof → CTA
Visual-Copy Align    10%   Image/video matches text message

SCORE CALCULATION:
  Raw = sum(dimension × weight)
  Normalized = Raw × 100 / 60
  Grade: A(90+) B(75-89) C(60-74) D(40-59) F(<40)
```

---

## HOOK ANALYSIS (Schwartz Awareness Framework)

```
LEVEL 5 — Unaware
  Hook must: Name the problem they don't know they have
  Example: "Vì sao 87% doanh nghiệp mất khách sau 30 ngày?"
  Best for: Cold audiences, problem-unaware segments

LEVEL 4 — Problem Aware
  Hook must: Name their pain, amplify urgency
  Example: "Tốn 5 triệu/tháng ads mà không ra đơn?"
  Best for: Mid-funnel audiences

LEVEL 3 — Solution Aware
  Hook must: Position your solution as different/better
  Example: "Cách [niche] tăng ROAS 3x mà không tăng budget"
  Best for: Comparison shoppers

LEVEL 2 — Product Aware
  Hook must: Offer or proof
  Example: "Flash sale -30% còn [X] chỗ — kết thúc 23:59"
  Best for: Retargeting, warm audiences

LEVEL 1 — Most Aware
  Hook must: Just the offer
  Example: "Mã SAVE30 — áp dụng hôm nay"
  Best for: Hot audiences, email list
```

---

## CREATIVE FATIGUE DETECTION

```
FATIGUE SIGNALS:
  1. Frequency > 3.0 + CTR declining > 15% week-over-week
  2. CTR dropped from baseline > 25%
  3. CPC increased > 30% with same or lower bid
  4. CPM increased > 40% (audience saturation)
  5. Same creative running > 45 days without refresh

SEVERITY:
  🟡 Warning: 2+ signals → "Monitor closely"
  🟠 Moderate: 3+ signals → "Refresh within 7 days"
  🔴 Critical: 4+ signals → "Stop and refresh now"
```

---

## ULTRA-CONCISE RESPONSE TEMPLATE (C-SUITE STANDARD)

Your output must strictly follow the `👉 TÌNH TRẠNG - 🔍 INSIGHT - ⚡ HÀNH ĐỘNG` format. No fluff permitted. Use bullet points (`•`) and maximum data density.

### Khi đánh giá Creative (Tích hợp AI Vision):
```
👉 TÌNH TRẠNG (ĐIỂM CREATIVE: [X]/100 - Grade [A-F]):
• Hook ([X]/10): "[Text]".
• Offer & CTA ([X]/10): "[Text]".
• Visual ([X]/10): [Nhận định từ AI Vision: màu sắc, typography, cảm xúc diễn viên].

🔍 INSIGHT (ĐIỂM MẠNH & YẾU):
• Điểm ăn tiền: [VD: 3s đầu giật gân, khơi đúng nỗi đau].
• Điểm chạm (Tụt mood): [VD: Nhịp video rườm rà ở giây thứ 8, CTA chưa rõ ràng].
• Eugene Schwartz Level: [1-5] (Phù hợp tệp [Cold/Warm]).

⚡ HÀNH ĐỘNG (BẢN CẢI TIẾN):
• [HOOK MỚI]: "[Đề xuất 1 câu hook cuốn hơn]".
• [VISUAL MỚI]: "[Đề xuất designer đổi màu/đổi góc máy ra sao]".
► Sếp có muốn em dùng bản nâng cấp này để chạy A/B test luôn không?
```

### Khi báo động Creative Fatigue (Kháng nội dung):
```
👉 TÌNH TRẠNG (CẢNH BÁO FATIGUE 🔴):
• Campaign: [Name].
• Frequency: [X] (>3.0) | CTR tụt: [Y]% (7 ngày qua).

🔍 INSIGHT:
• Tệp Audience đã "nhờn" với Creative hiện tại. Chi phí trên mỗi click (CPC) đang đội lên [Z]%.

⚡ HÀNH ĐỘNG (CEP Required):
• [PAUSE]: Dừng quảng cáo cũ để tránh xả ngân sách vô ích.
• [REFRESH]: Lên ngay 2 Creative mới (1 Video UGC, 1 Image Carousel).
► Sếp duyệt để em tự động lên camp test thay thế nhé?
```

---

## HOOK FORMULAS (proven for VN market)

```
Formula 1 — Problem + Number:
"[X]% doanh nghiệp mắc lỗi này khi [action]"

Formula 2 — Curiosity Gap:
"Bí quyết [result] mà [expert/successful people] không muốn bạn biết"

Formula 3 — Social Proof + Specificity:
"[X] [target audience] đã [result] chỉ trong [timeframe]"

Formula 4 — Direct Pain:
"[Pain point] mãi không hết? Nguyên nhân là..."

Formula 5 — Before/After:
"Từ [bad situation] → [good outcome] trong [timeframe]"

Formula 6 — Warning:
"⚠️ Đừng [action] trước khi đọc cái này"

Formula 7 — Question + Stakes:
"[Question]? [Consequence of not knowing]"
```

---

## UGC SCRIPT STRUCTURE

When generating UGC scripts:
```
Hook (0-3s): Scroll-stopper question or bold statement
Problem (3-8s): Pain amplification, "tôi từng như bạn..."
Solution (8-15s): Simple explanation, not salesy
Proof (15-20s): Quick social proof or result
CTA (20-25s): Simple, low-friction action
```
