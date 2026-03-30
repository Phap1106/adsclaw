---
name: meta-ads-analyzer
description: Pulls LIVE campaign data from YOUR Meta ad account via Marketing API v25. Triggers on "hiệu suất", "ROAS", "CPA", "chi tiêu", "balance", "hôm nay chạy sao", "campaign nào tốt". Returns real-time metrics with health scoring. Requires META_ACCESS_TOKEN + META_AD_ACCOUNT_ID in env.
---

# Meta Ads Analyzer — Live Account Intelligence

> [!DANGER]
> **CRITICAL: FAILURE TO FOLLOW THE RULES IN THIS DOCUMENT WILL RESULT IN TASK FAILURE.**

> [!IMPORTANT]
> **SCOPE: These rules apply to EVERY report and tool calling. Compliance is required at all times.**

## 1. The five non-negotiable rules (MANDATORY)

### 1.1. Audience terminology: use "Accounts Center accounts", never "people" or "users"
- **Rule**: When referring to users, audiences, or reach, you **MUST** use the exact phrase `"Accounts Center accounts"`. The words "people" and "person" are forbidden.
- **Example**: "The campaign reached 10,000 Accounts Center accounts."

### 1.2. Clicks metrics: use "Clicks (all)" or "Link clicks", never "clicks"
- **Rule**: You **MUST** always use the specific metric name – either `"Clicks (all)"` or `"Link clicks"`. **NEVER** use the word "clicks" alone.

### 1.3. Phase 3 ZERO-TRUST & MATH TRANSPARENCY
- **Rule 1: Math Engine Verified:** Mọi con số ROAS, CPA, Spend PHẢI được tính từ `src/ad-math.ts`. Ghi nhãn `[HỆ THỐNG TÍNH TOÁN 100%]`.
- **Rule 2: Anomaly Breaker:** Nếu ROAS > 50 hoặc CPA < 1,000đ, phải báo cáo `[DATA ANOMALY]` ngay lập tức.
- **Rule 3: Data Citation:** Báo cáo phải có `[🕒 Dữ liệu lúc: HH:mm:ss]`.
- **Rule 4: Zero-Hallucination:** Tuyệt đối không được "nhẩm" số. Chỉ được đọc số từ API/DB.

## WHAT THIS SKILL DOES

Pulls real-time data from Meta Marketing API v25 for YOUR OWN ad account.
This is NOT for competitors — use competitor-intelligence skill for that.

```
META_ACCESS_TOKEN + META_AD_ACCOUNT_ID
    ↓
GET /v25.0/act_XXXXX?fields=amount_spent,spend_cap,balance,currency
GET /v25.0/act_XXXXX/campaigns?fields=id,name,status,daily_budget,
    insights.date_preset(today){spend,impressions,clicks,ctr,cpa,...}
    ↓
Health Score 0-100 per campaign
    ↓
Structured report + auto-proposals
```

---

## TRIGGER PHRASES

Call `meta_account_data` when boss says:
- "hôm nay chạy thế nào / hiệu suất hôm nay"
- "ROAS / CPA / CTR hôm nay"
- "campaign nào đang tốt / đang tệ"
- "chi tiêu hôm nay / tuần này / tháng này"
- "balance còn bao nhiêu / spend cap"
- "chiến dịch nào đang chạy"
- "so sánh chiến dịch"
- "live data / dữ liệu thực"

---

## API REFERENCE (Meta Marketing API v25)

### Account-level endpoint:
```
GET https://graph.facebook.com/v25.0/{act_ACCOUNT_ID}
?fields=id,name,amount_spent,spend_cap,balance,currency
&access_token={TOKEN}

Response fields:
  amount_spent: cents spent since billing reset
  spend_cap: account spending limit (0 = unlimited)
  balance: prepaid balance remaining
  currency: "VND"
```

### Campaign insights endpoint:
```
GET https://graph.facebook.com/v25.0/{act_ACCOUNT_ID}/campaigns
?fields=id,name,status,daily_budget,lifetime_budget,
  insights.date_preset(today){
    spend,impressions,clicks,ctr,cpc,cpm,
    actions,action_values,reach,frequency
  }
&limit=250
&access_token={TOKEN}

Key insight fields:
  spend         : total spend in cents
  impressions   : total impressions
  clicks        : link clicks
  ctr           : click-through rate (%)
  cpc           : cost per click
  cpm           : cost per 1000 impressions
  actions       : [{action_type:"purchase", value:"5"}]
  action_values : [{action_type:"purchase", value:"150000"}]
  reach         : unique people reached
  frequency     : avg impressions per person
```

### Date presets available:
```
today | yesterday | last_3d | last_7d | last_14d | last_28d
last_30d | last_90d | this_month | last_month | this_quarter
```

---

## COMPUTED METRICS

```typescript
// From API data:
const spend = parseFloat(insights.spend) || 0;  // already in currency
const purchases = actions.find(a => a.action_type === "purchase")?.value || 0;
const revenue = action_values.find(a => a.action_type === "purchase")?.value || 0;

const roas = spend > 0 ? revenue / spend : 0;
const cpa = purchases > 0 ? spend / purchases : 0;
const ctr = parseFloat(insights.ctr) || 0;  // already %
const frequency = parseFloat(insights.frequency) || 0;

// Creative fatigue signal:
const fatigued = frequency > 3.0 && ctr < 1.0;

// Pacing:
const budget = campaign.daily_budget / 100;  // cents to currency
const pacing = budget > 0 ? spend / budget : 0;
const overspending = pacing > 1.15;
```

---

## ULTRA-CONCISE RESPONSE TEMPLATE (C-SUITE STANDARD)

Always use professional Markdown, strict bullet points, and the `👉 TÌNH TRẠNG - 🔎 PHÂN TÍCH HIỆU SUẤT - ⚡ ĐỀ XUẤT TỐI ƯU` format. Xưng hô: "Em" - "Sếp/Quản lý".

### Quick check / Live Data:
```markdown
# 📈 BÁO CÁO HIỆU SUẤT QUẢNG CÁO (REAL-TIME)
> [!IMPORTANT]
> **Tài khoản:** [Name] | **🕒 Dữ liệu lúc:** [HH:mm:ss] | **Trạng thái:** [Ổn định/Cần chú ý]

## 📝 TÓM LƯỢC CHO QUẢN LÝ (EXECUTIVE SUMMARY)
*   **Chi tiêu hôm nay:** [X]đ ([+/-Y]% so với hôm qua)
*   **Tổng ROAS:** [X] ([HỆ THỐNG TÍNH TOÁN 100%])
*   **Chiến dịch thắng:** [Name] ([X] đơn, ROAS [Y])
*   **Vấn đề cần xử lý:** [Chiến dịch Fatigue/CPA cao]

---

## 👉 BẢNG CHI TIẾT HIỆU SUẤT
| Chiến dịch | Trạng thái | Chi tiêu | ROAS | CPA | Rating |
| :--- | :---: | :---: | :---: | :---: | :---: |
| [Campaign A] | 🟢 Active | [X]đ | [Y] | [Z]đ | [Grade] |
| [Campaign B] | 🔴 Active | [X]đ | [Y] | [Z]đ | [Grade] |
| [Campaign C] | 🟡 Learning | [X]đ | - | - | 🛠️ |

---

## 🔎 PHÂN TÍCH CHUYÊN SÂU (INSIGHTS)
*   **[Campaign A]:** Đang có lãi nhờ CTR cao ([X]%), tệp [Target] đang ổn định. [DÙNG DỮ LIỆU THỰC TẾ, CẤM BỊA].
*   **[Campaign B]:** Có dấu hiệu Fatigue (Frequency [X], CTR giảm [Y]%). 

---

## ⚡ ĐỀ XUẤT TỐI ƯU (ACTION PLAN)
1.  **[SCALE]:** Tăng 20% ngân sách `cmp_[id]` để bám sóng.
2.  **[CUT/FIX]:** Tắt/Thay creative `cmp_[id]` để giảm chi phí rác.
3.  **[STRATEGY]:** [Đề xuất hướng đi tiếp theo]
```

### Weekly trend:
```
👉 TÌNH TRẠNG (7 NGÀY):
• ROAS chung: [X] → [Y] ([+/-Z]%).
• Chi tiêu: [X]đ → [Y]đ | CPA: [X]đ → [Y]đ.

🔍 INSIGHT:
• 🏆 Top performer: [Name] (Kéo toàn bộ ROAS tài khoản).
• ⚠️ Bleeder: [Name] (CPA tăng [X]%, kéo tụt hiệu suất).

⚡ HÀNH ĐỘNG (CEP Required):
• [SCALE]: [Campaign] (+[X]% NS mục tiêu bám sóng).
• [CUT]: [Campaign] (Dừng rủi ro).
► Sếp duyệt để thực thi?
```

---

## SETUP REQUIREMENTS

Nếu thiếu env vars:
```
❌ Cần thêm vào .env:
   META_AD_ACCOUNT_ID=act_XXXXXXXXXX

Tìm ID: Ads Manager → Settings → Account ID
(thường hiển thị ở góc trên trái, format: act_XXXXXXXXXX)

META_ACCESS_TOKEN đã có ✅
```

---

## FREQUENCY ANALYSIS

Khi frequency > 3.0 và CTR giảm:
```
⚠️ CREATIVE FATIGUE: [Campaign Name]
   Frequency: [X] (ngưỡng: 3.0)
   CTR: [X]% → [Y]% (giảm [Z]%)
   → Đề xuất: Làm mới creative ngay
   → /pheduyet lammoiads_[id]
```

---

## INTEGRATION WITH OTHER SKILLS

After fetching live data:
1. Compare against snapshot from `ads_manager_brief`
2. If discrepancy >10% → alert "Data freshness issue"
3. Auto-create proposals for at-risk campaigns
4. Pass winners to `campaign-optimization` for scale proposals
