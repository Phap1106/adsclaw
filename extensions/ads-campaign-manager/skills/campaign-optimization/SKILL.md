---
name: campaign-optimization
description: Budget and bidding optimization with CEP safety protocol. Handles /pheduyet, /tuchoi, scale up/down proposals, campaign pause/resume. ALWAYS uses Confirm→Execute→Verify before any Meta write. Auto-generates proposals based on health scores. safeMode=true means proposals only, no direct execution.
---

# Campaign Optimization Skill

### Phase 3 ZERO-TRUST & CEP DISCIPLINE
- **Rule 1: Mathematical Justification:** Mọi đề xuất Scale hay Cut PHẢI trích dẫn công thức từ `ad-math.ts`. Ghi nhãn `[HỆ THỐNG XÁC THỰC 100%]`.
- **Rule 2: Anomaly Protection:** Tuyệt đối không scale các campaign có data dị thường (ROAS ảo, CPA ảo).
- **Rule 3: Audit Trail:** Báo cáo thực thi phải ghi rõ `[Audit Trail: Đã lưu vào MySQL]`.
- **Rule 4: Zero-Hallucination:** Tuyệt đối không tự nhẩm ngân sách mới. AI chỉ đề xuất % hoặc hướng tăng/giảm.

## CORE PROTOCOL: CEP (Confirm → Execute → Verify)

NEVER execute a Meta change without this protocol:

```
STEP 1 — CONFIRM
Show exactly what will change:
"⚠️ XÁC NHẬN THAY ĐỔI:
  Campaign: [Name]
  Thay đổi: Budget [X]đ → [Y]đ (+30%)
  Lý do: ROAS 3.2 vượt ngưỡng scale (2.6)
  Rủi ro: [low/medium/high]
  
  Nhập 'xác nhận' để thực thi hoặc 'bỏ qua' để hủy"

STEP 3 — VERIFY
Check that change took effect:
"✅ ĐÃ THỰC THI (🕒 [Timestamp]):
  Campaign [Name]
  Budget: [X]đ → [Y]đ ✅ (confirmed via API)
  [MATH ENGINE]: Đã khớp ngân sách mới với multiplier x [Multiplier].
  [Audit Trail]: Record ID `[proposalId]` đã đóng."
```

**EXCEPTION**: `/tuchoi` (reject) never needs confirmation — it's a safe action.

---

## PROPOSAL TYPES

### tangngansach (Scale Up)
```
Trigger: ROAS ≥ 2.6 + CTR ≥ 1.2% + active + !learning + spend > 300k
Action: Budget × scaleUpMultiplier (default 1.15 = +15%)
Cap: Never exceed 2× current budget in single step
Template:
  Title: "Tăng budget [Name] +[X]%"
  Summary: "ROAS [X] vượt ngưỡng scale. CTR [X]% khỏe."
  Reason: "Strong efficiency with enough data to scale safely."
  Impact: high
```

### giamngansach (Scale Down)
```
Trigger: ROAS < 1.5 + spend > 300k + !learning
Action: Budget × scaleDownMultiplier (default 0.85 = -15%)
Floor: Never below minimumBudget (default 100,000đ)
Template:
  Title: "Giảm budget [Name] -[X]%"
  Summary: "ROAS [X] dưới ngưỡng tối thiểu [1.5]."
  Reason: "Stop waste before ROAS improves."
  Impact: high
```

### lammoiads (Creative Refresh)
```
Trigger: CTR < 1.2% + spend > 300k + !learning
OR: Frequency > 3.0 + CTR declining
Template:
  Title: "Làm mới creative [Name]"
  Summary: "CTR [X]% / Frequency [X] → dấu hiệu creative fatigue."
  Reason: "New creative is safer than budget changes."
  Impact: medium
```

### tamngung (Pause)
```
Trigger: Manual boss request OR ROAS < 0.5 (emergency)
ALWAYS requires CEP confirmation
Template:
  Title: "Tạm dừng [Name]"
  Summary: "Boss yêu cầu tạm dừng / Performance khẩn cấp."
  Reason: "[specific reason]"
  Impact: high
```

---

## /pheduyet HANDLER

## ULTRA-CONCISE RESPONSE TEMPLATES (C-SUITE STANDARD)

Always use strict bullet points, maximum data density, and the `👉 TÌNH TRẠNG - 🔍 INSIGHT - ⚡ HÀNH ĐỘNG` format. No fluff permitted.

### CEP PROTOCOL (Confirm → Execute → Verify)
**1. CONFIRM (Before any Meta write):**
```
👉 TÌNH TRẠNG (XÁC NHẬN THAY ĐỔI):
• Lệnh: [Tăng/Giảm/Tạm dừng] Campaign `[Name]`.
• NS Mới: [X]đ → [Y]đ (+[Z]%).

🔍 INSIGHT:
• ROAS hiện tại [X] (Vượt ngưỡng scale / Dưới ngưỡng). 

⚡ HÀNH ĐỘNG (CEP Required):
• Rủi ro: [Thấp/Cao].
► Sếp gõ 'yes' để em bắn API thực thi, hoặc 'no' để huỷ lệnh?
```

**2. VERIFY (After Boss says 'yes'):**
```
👉 TÌNH TRẠNG (ĐÃ THỰC THI):
• ✅ Campaign `[Name]` đã cập nhật NS thành [Y]đ.

⚡ HÀNH ĐỘNG:
• Hệ thống sẽ theo dõi KPI (CPA/ROAS) trong 48h tới để đánh giá thay đổi.
```

## /pheduyet & /tuchoi HANDLERS

### /pheduyet [proposalId]:
```
👉 TÌNH TRẠNG (ĐÃ DUYỆT):
• Mã đề xuất: `[ID]`.
• Trạng thái: Đang bắn lệnh qua API (hoặc: Cần manual vì safeMode=true).

⚡ HÀNH ĐỘNG:
• Còn [N] đề xuất đang chờ. Sếp gõ `/de_xuat` để xem tiếp nhé.
```

### /tuchoi [proposalId]:
```
👉 TÌNH TRẠNG (ĐÃ TỪ CHỐI):
• Mã đề xuất: `[ID]` đã bị huỷ.

⚡ HÀNH ĐỘNG:
• Em đã note lại lý do. Sẽ không đề xuất lại trong 7 ngày tới.
```

---

## BUDGET PACING RULES

```
Pacing < 60%:
  → "Đang chi chậm — điều chỉnh bid strategy nếu cần"
  → No automatic action unless boss requests

Pacing 60-100%: ✅ Normal

Pacing 100-115%: ⚠️ "Gần vượt — theo dõi"

Pacing > 115%: 🔴 ALERT HIGH
  → Immediate proposal: giamngansach
  → "Overspending detected: [X]% over budget"
```

---

## CBO vs ABO HANDLING

```
CBO (Campaign Budget Optimization):
  → Evaluate at CAMPAIGN level only
  → Never analyze individual ad sets for scaling
  → Budget change at campaign level

ABO (Ad Budget Optimization):
  → Evaluate each ad set independently
  → Budget per ad set
```

---

## SCALE CALCULATION

```
New budget = current × multiplier
Round to nearest 50,000đ (cleaner numbers)
Example: 1,234,567đ × 1.15 = 1,419,752đ → round to 1,400,000đ

Minimum: 100,000đ/day
Maximum single step increase: 2× current
```

---

## PROPOSAL DEDUPLICATION

Never create duplicate proposals:
- Same action + same campaign = skip if pending exists
- Use proposalId format: `[action]_[campaign-slug]`
- Example: `tangngansach_winner-campaign-1`
