---
name: fanpage-content-publisher
description: Generates and publishes content to Facebook fanpage. Creates ad copy variants, organic posts, UGC scripts. Triggers on "đăng bài", "viết content", "tạo post", "caption", "copy quảng cáo". Uses Meta Graph API to post. Always proposes before publishing (CEP).
---

# Fanpage Content Publisher Skill

## CONTENT TYPES

### 1. Organic Post
```
Trigger: "đăng bài", "viết post", "tạo nội dung"
Structure:
  Hook (1 line, scroll-stopper)
  Problem/Story (2-3 lines)
  Value/Solution (2-3 lines)
  CTA (1 line, soft)
  Hashtags (3-5 relevant)
```

### 2. Ad Copy (for Meta Ads)
```
Trigger: "viết copy quảng cáo", "tạo ad copy", "copy cho campaign"
Variants generated: 5+ variants across:
  - Short: Primary text (125 chars) + Headline (25 chars)
  - Medium: Primary text + Headline + Description
  - Long: Full Facebook post style
```

### 3. UGC Script
```
Trigger: "viết script UGC", "kịch bản video", "script quảng cáo video"
Structure: Hook(0-3s) + Problem(3-8s) + Solution(8-15s) + Proof(15-20s) + CTA(20-25s)
```

---

## PUBLISHING FLOW (CEP)

```
STEP 1 — GENERATE content
STEP 2 — PRESENT for review
  "📝 NỘI DUNG ĐỀ XUẤT:
  [content]
  
  Đăng lên page [Page Name]?
  Nhập 'đăng' để xác nhận hoặc 'sửa' để điều chỉnh"

STEP 3 — PUBLISH (after confirmation)
  POST https://graph.facebook.com/v25.0/{page_id}/feed
  { message: "[content]", access_token: PAGE_TOKEN }
  
STEP 4 — VERIFY
  "✅ ĐÃ ĐĂNG THÀNH CÔNG
  Post ID: [id]
  URL: https://facebook.com/[page]/posts/[id]
  Thời gian: [timestamp]"
```

---

## META GRAPH API — PUBLISHING ENDPOINTS

### Text post:
```
POST /v25.0/{page_id}/feed
Body: { message: "content", access_token: PAGE_TOKEN }
```

### Photo post:
```
POST /v25.0/{page_id}/photos
Body: { url: "image_url", caption: "content", access_token: PAGE_TOKEN }
```

### Scheduled post:
```
POST /v25.0/{page_id}/feed
Body: {
  message: "content",
  published: false,
  scheduled_publish_time: unix_timestamp,
  access_token: PAGE_TOKEN
}
```

**Note:** Cần Page Token (không phải User Token) để đăng bài.
Page Token không bao giờ hết hạn.

---

## CONTENT FORMULAS (VN market)

### Education/Service businesses:
```
Hook: "Bạn có biết [surprising fact]?"
Body: Teach one useful thing in 3 lines
CTA: "Lưu lại để dùng sau 📌"
```

### E-commerce:
```
Hook: "[Product] - [Benefit statement]"
Body: 3 key benefits as bullet points
CTA: "Link mua hàng trong bio ↑"
```

### SaaS/Software:
```
Hook: "Trước vs Sau khi dùng [Product]"
Body: Before/After comparison
CTA: "Dùng thử miễn phí — link trong bio"
```

---

## CONTENT CALENDAR LOGIC

When boss asks for content plan:
```
Monday: Educational content (how-to, tips)
Tuesday: Product/Service showcase
Wednesday: Social proof (testimonial, case study)
Thursday: Behind-the-scenes / Story
Friday: Promotional / Offer
Saturday: Entertainment / Engagement post
Sunday: Rest or minimal (analytics only)
```

---

## BRAND VOICE DEFAULTS

```
Tone: Professional but friendly
Language: Vietnamese primary, mix English for tech terms
Length: Short to medium (under 300 words for organic)
Emoji: Moderate use, 2-3 per post max
Hashtags: 3-5, mix branded + generic
```
