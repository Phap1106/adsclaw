---
name: competitor-intelligence
description: Full competitor analysis chain for Facebook pages. Triggers on ANY facebook.com URL or "phân tích đối thủ" request. Automatically resolves pageId + displayName, scrapes Ad Library via Apify, falls back to Serper organic data, saves to memory. Never stops mid-chain to ask questions.
---

# Competitor Intelligence Skill

> [!DANGER]
> **CRITICAL: FAILURE TO FOLLOW THE RULES IN THIS DOCUMENT WILL RESULT IN TASK FAILURE.**

> [!IMPORTANT]
> **SCOPE: These rules apply to EVERY analysis and data extraction. Compliance is required.**

## 1. The five non-negotiable rules (MANDATORY)

### 1.1. Audience terminology: use "Accounts Center accounts", never "people" or "users"
- **Rule**: When referring to reach or audience size, you **MUST** use the exact phrase `"Accounts Center accounts"`.

### 1.2. Clicks metrics: use "Clicks (all)" or "Link clicks", never "clicks"
- **Rule**: Use specific metric names. **NEVER** use the word "clicks" alone.

### 1.3. Phase 3 ZERO-TRUST & ANTI-HALLUCINATION
- **Rule 1: Xưng Tội (Missing Data Protocol):** Tuyệt đối cấm bịa đặt. Nếu Tool trả về 0 kết quả, báo cáo: `[DỮ LIỆU TRỐNG]`.
- **Rule 2: Trích Dẫn Thời Gian (Data Citation):** Mọi bài ads phải đi kèm Timestamp quan sát (observed_at).
- **Rule 3: Explicit Math:** Ước tính chi tiêu đối thủ PHẢI sử dụng `ad-math.ts`. Không được tự nhẩm.
- **Rule 4: Anomaly Protection:** Nếu ad chạy >1000 ngày, phải cắm cờ `[DATA ANOMALY]`.
- **AUTONOMY RULE (NO-QUESTION)**: Không được hỏi lại sếp các câu hỏi cơ bản (thị trường, kênh, khoảng thời gian) nếu sếp chưa yêu cầu cụ thể. TỰ ĐỘNG mặc định: Thị trường: VN, Kênh: Facebook/Instagram, Thời gian: 3 tháng gần nhất.
- **PROACTIVE SEARCH**: Nếu sếp yêu cầu tìm kiếm tổng quát (ví dụ: "Ads ngành làm đẹp"), PHẢI:
  1. Dùng `market_industry_discovery({ keyword: "[ngành hàng]" })` để tìm các **Winning Ads** (bài ads đang chạy hiệu quả nhất thị trường).
  2. Nếu tool trên 0 results, mới dùng `serper_search` để tìm danh sách 3-5 thương hiệu nổi bật nhất của ngành đó, sau đó cào từng đối thủ.
- **WINNING ADS ANALYSIS**: Khi dùng `market_industry_discovery`, bạn sẽ nhận được bảng xếp hạng theo `Win-Score` (số ngày chạy bài). PHẢI phân tích tại sao 3 bài đứng đầu lại "Win" (Hook, Hình ảnh, Content, CTA) để sếp học hỏi.
- **STRATEGIC INFERENCE**: Nếu dữ liệu cào được bị lỗi hoặc quá ít (0-2 ads), không được dừng lại. PHẢI dùng kiến thức chuyên gia về ngành đó để đưa ra ĐỀ XUẤT và CHIẾN LƯỢC dựa trên benchmark thị trường.

### Why displayName matters more than pageId
```
slug: "gangnambeautycenter1"
  → Apify searchQueries=["gangnambeautycenter1"] → 0 results
  → webdatalabs cannot find

displayName: "Gangnam Beauty Center"
  → Apify searchQueries=["Gangnam Beauty Center"] → ✅ finds ads

ALWAYS: resolve pageId + findPageDisplayName() before calling Apify
```

### Meta Graph API VN limitation
```
ads_archive API → KHÔNG hỗ trợ VN commercial ads
Ad Library WEBSITE → hiển thị TẤT CẢ ads
→ Primary: Apify scrapes website (needs displayName or pageId)
→ Fallback: Serper organic data
```

---

## COMPLETE CHAIN (execute all 5 steps without stopping)

```
INPUT: https://www.facebook.com/gangnambeautycenter1

STEP 0 — MEMORY CHECK
  ads_manager_brief(mode: "competitors")
  → Analyzed today? Skip to STEP 4 with cached data.
  → Not cached? Continue.

STEP 1 — RESOLVE (pageId + displayName)
  resolve_facebook_page_id(url)
  Returns:
  {
    pageId: "12345678" (or undefined),
    pageName: "Gangnam Beauty Center" (official),
    displayName: "Gangnam Beauty Center" (from Serper search),
    method: "graph_user_token" | "serper_ad_library" | ...
  }
  
  displayName is CRITICAL — used as search query in Apify.
  Even if pageId fails, displayName from Serper is enough.
 
STEP 1.5 — DEEP INTELLIGENCE (Landing Page & Social Audit)
  serper_search({ query: "[displayName] landing page website official" })
  serper_search({ query: "[displayName] facebook posting frequency tiktok" })
  → Extract: Landing page (funnel type), Posting frequency, Brand tone.

STEP 2 — FETCH ADS (Apify primary)
  meta_ad_library(pageId: "12345678", country: "VN")
  
  INSIDE TOOL (automatic):
  ├── Graph API search_terms="Gangnam Beauty Center" → 0 (VN limit)
  └── Apify actors (priority order):
      1. whoareyouanas: { pageId: "12345678" }  ← if pageId available
      2. webdatalabs: { searchQueries: ["Gangnam Beauty Center"] } ← displayName
      3. webdatalabs: { searchQueries: [Ad Library URL] } ← if pageId
      4. curious_coder: { urls: [Ad Library URL] } ← ONLY if valid URL
  
  → Got ads? → STEP 4 (analysis)
  → 0 ads? → STEP 3

STEP 3 — ORGANIC FALLBACK (when Apify 0)
  DO NOT ASK BOSS. RUN IMMEDIATELY:
  
  serper_search({ query: "[displayName] facebook ads quảng cáo 2025 2026" })
  serper_search({ query: "site:facebook.com/ads/library [slug]" })
  serper_search({ query: "[displayName] facebook sponsored post" })
  
  Use Serper snippets to extract:
  - Hooks, offers, CTAs visible in meta descriptions
  - Landing page URLs
  - Audience signals

STEP 4 — SAVE TO MEMORY
  ads_manager_save_competitor({
    name: "[displayName]",
    angle: "[dominant angle from ads OR 'unknown — organic only']",
    note: "[control ad hook + offer + CTA + source + date]",
    sourceUrl: "[original URL]"
  })
  ALWAYS save regardless of data quality.

STEP 5 — RESPOND with structured report
```

---

## AD ANALYSIS FRAMEWORK

### For each ad:
```
Hook       : First line (scroll-stopper, <10 words)
Offer      : Promise (result / price / guarantee / deadline)
CTA        : Messenger / Website / Form / WhatsApp / Call
Format     : Image / Video / Carousel / Slideshow
Days live  : From startDate (longer = CONTROL AD)
Platforms  : Facebook / Instagram / Messenger / Audience Network
Angle type : Fear / Aspiration / Social Proof / Authority / Urgency / Curiosity
```

### Control Ad = longest running active ad
- Chạy lâu nhất → đang profitable → phân tích đầu tiên
- Nếu ad chạy >30 ngày với cùng creative → đây là winner

### Pattern recognition
```
Most common angle → dominant strategy
Most common CTA destination → funnel type
Image:Video ratio → creative preference
Average days running → testing velocity
```

---

## ULTRA-CONCISE RESPONSE TEMPLATES (C-SUITE STANDARD)

Always use professional Markdown, strict bullet points, and the `👉 TÌNH TRẠNG - 🔎 PHÂN TÍCH CHIÊU THỨC - ⚡ ĐỀ XUẤT HÀNH ĐỘNG` format. Xưng hô: "Em" - "Sếp/Quản lý".

### When Apify returns ads:
```markdown
# 📊 BÁO CÁO PHÂN TÍCH ĐIỂM NÓNG ĐỐI THỦ: [Display Name]
> [!IMPORTANT]
> **Trạng thái:** [N] Ads đang hoạt động | **Nguồn:** [Apify/Graph] | **🕒 Lúc:** [HH:mm:ss]

## 👉 TÌNH TRẠNG QUẢNG CÁO
[Bảng formatAds() sẽ hiển thị ở đây - Tự động có link Meta Ad Library]

### 🏆 CONTROL AD (Chiến thần giữ nhịp - [N] ngày)
*   **Hook:** "[...]"
*   **Creative:** [Image/Video] - [Mô tả nhanh mindset creative]
*   **Ước tính chi tiêu:** [Số tiền] ([Math justification])

---

## 🔎 PHÂN TÍCH CHIÊU THỨC (DEEP INTELLIGENCE)

### 1. Chiến lược Vĩ mô (Macro Strategy)
*   [Ví dụ: Tập trung phủ thương hiệu kết hợp phễu Messenger / Chuyên săn lead qua Form]

### 2. Chiến thuật Nội dung (Content Pillars)
*   **Trụ cột 1:** [VD: Feedback khách hàng - Chiếm 40%]
*   **Trụ cột 2:** [VD: Kiến thức chuyên gia - Chiếm 30%]
*   **Trụ cột 3:** [VD: Khuyến mãi sốc - Chiếm 30%]

### 3. Chiến thuật Đăng bài & Giữ chân (Posting & Retention)
*   **Tần suất:** [VD: 2 bài/ngày]
*   **Retention:** [VD: Tích cực trả lời comment, có group cộng đồng riêng, dùng chatbot re-marketing]

---

## ⚡ ĐỀ XUẤT HÀNH ĐỘNG CHO SẾP
1.  **[ATTACK]:** [Cách đánh bại điểm yếu của nó]
2.  **[TEST]:** "[Angle/Hook mới dựa trên data đối thủ]"
3.  **[SYSTEM]:** [Gợi ý lưu vào DB/Chạy tự động]
```

### When only Serper data (Apify 0):
```markdown
# 🔍 THÁM BÁO THỊ TRƯỜNG: [Display Name]
> [!WARNING]
> Apify chưa index / bị rate limit. Em đã cào dữ liệu Google/Organic để lấy insight.

## 📝 DỮ LIỆU THU THẬP ĐƯỢC
*   **Landing Pages:** [Link]
*   **Hooks/Offers thấy được:** [list from snippets]
*   **Chiến thuật phỏng đoán:** [dựa trên organic presence]

## 🔗 XEM ADS THỦ CÔNG (Sếp click đây ạ)
[Ad Library URL]
```

---

## COMPETITOR NOT ON FACEBOOK — FALLBACK

```
serper_search({ query: "[competitor name] quảng cáo facebook google ads" })
serper_search({ query: "[competitor name] sponsored instagram" })

→ Report with: website, landing pages, likely angles, market position
```

---

## FORBIDDEN OUTPUTS
❌ "Tôi không resolve được page ID"  (then stop)
❌ "Apify trả về 0" (then ask boss)
❌ "Bạn có muốn tôi thử cách khác không?"
✅ Run next step in chain automatically
