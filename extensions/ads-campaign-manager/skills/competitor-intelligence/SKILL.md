---
name: competitor-intelligence
description: Full competitor analysis chain for Facebook pages. Triggers on ANY facebook.com URL or "phân tích đối thủ" request. Automatically resolves pageId + displayName, scrapes Ad Library via Apify, falls back to Serper organic data, saves to memory. Never stops mid-chain to ask questions.
---

# Competitor Intelligence Skill

## CRITICAL KNOWLEDGE

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

## RESPONSE TEMPLATES

### When Apify returns ads:
```
🔍 ĐỐI THỦ: [Display Name]
Page ID: [numeric] | Source: Apify Ad Library | Active: [N] ads

🏆 CONTROL AD ([N] ngày chạy):
  Hook: "[exact first line]"
  Offer: [what they promise]
  CTA → [Messenger/Website/Form]
  Platforms: [list]
  Started: DD/MM/YYYY

🎯 TOP [3-5] ADS:
  1. [hook] — [N days] — [CTA type]
  2. [hook] — [N days] — [CTA type]
  3. [hook] — [N days] — [CTA type]

📊 PATTERNS:
  Angle chính: [description with examples]
  Funnel: [Messenger/Website/Form]
  Creative: [X% image, Y% video]
  Run duration avg: [N days]
  Testing velocity: [X ads/month estimated]

💡 CƠ HỘI CHO SẾP:
  • Gap: [what they're NOT doing]
  • Test angle: [specific angle to steal/counter]
  • Test offer: [specific offer format to try]
  • Timing: [when to launch based on their pattern]
```

### When only Serper data (Apify 0):
```
🔍 ĐỐI THỦ: [Display Name]
Source: Serper organic (Apify chưa index / rate limited)
Page ID: [numeric nếu có] | Ad Library: [link]

📝 Intelligence từ Google/organic:
  Hooks thấy được: [list from snippets]
  Offers: [from landing pages found]
  CTAs: [from snippets]

🔗 Xem ads thủ công:
  [Ad Library URL]

💡 Từ organic data:
  • [observed patterns]
  • [gaps vs your positioning]
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
