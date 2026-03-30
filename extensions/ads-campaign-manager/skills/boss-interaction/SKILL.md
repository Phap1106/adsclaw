---
name: boss-interaction
description: Handles boss instructions, acknowledgments, instruction queue management. Triggers on /lenh commands. Stores instructions with queued/acknowledged status. Provides smart follow-up suggestions based on instruction content.
---

# Boss Interaction Skill

## INSTRUCTION QUEUE MANAGEMENT

### /lenh [instruction text]
```
→ appendBossInstruction(text)
→ Returns: instruction ID + acknowledgment
→ Status: queued

Response:
"📝 LỆNH ĐÃ GHI NHẬN #[id]
Nội dung: [text]
Trạng thái: 🔴 Chờ xử lý
[follow-up suggestion based on content]"
```

### /lenh status
```
→ ads_manager_brief(mode: "plan")
→ Show instruction queue

Response:
"📋 QUEUE LỆNH:
🔴 [id] — [text] — [createdAt] — CHƯA XỬ LÝ
✅ [id] — [text] — [createdAt] — ĐÃ HOÀN THÀNH

→ /lenh ack [id|latest] khi hoàn thành"
```

### /lenh ack [id | latest]
```
→ ads_manager_ack_instruction(id)
→ Returns: acknowledged status

Response:
"✅ LỆNH HOÀN THÀNH: #[id]
[text] → Đã thực thi
→ /lenh status để xem queue"
```

---

## SMART FOLLOW-UP SUGGESTIONS

Based on instruction content, auto-suggest next action:

```javascript
if (text.includes("ngân sách") || text.includes("budget"))
  → suggest: "/ngansach để rà soát nhịp chi"

if (text.includes("đối thủ") || text.includes("competitor"))
  → suggest: "/doithu để xem note đối thủ hiện tại"

if (text.includes("chiến dịch") || text.includes("campaign"))
  → suggest: "/de_xuat để xem action nên duyệt trước"

if (text.includes("content") || text.includes("đăng bài"))
  → suggest: "Dùng fanpage-content-publisher skill"

if (text.includes("scale") || text.includes("tăng budget"))
  → suggest: "/baocao để kiểm tra ROAS trước khi scale"

default:
  → suggest: "/baocao để xem toàn cảnh trước khi ra lệnh"
```

---

## PENDING INSTRUCTION ALERT

When `state.instructions` has queued items:
```
⚠️ CÓ LỆNH CHƯA XỬ LÝ:
"[instruction text]" — [X hours/days] trước

→ /lenh ack [id] sau khi hoàn thành
→ /lenh status để xem toàn bộ queue
```

---

## INTERACTION PRINCIPLES

```
1. ACKNOWLEDGE instantly — never leave boss instruction hanging
2. QUEUE properly — instructions persist across sessions
3. LINK to relevant tools — always suggest what to do next
4. CLEAR STATUS — boss always knows what's done, what's pending
5. PROACTIVE ALERTS — surface queued instructions in /baocao
```

---

## EXAMPLE FLOWS

### Boss says: "Focus on retargeting today"
```
Response:
"📝 LỆNH #inst_abc123 GHI NHẬN
Nội dung: Focus on retargeting today
Trạng thái: 🔴 Chờ xử lý

Gợi ý: /baocao để xem audience retargeting hiện tại
→ Sau khi hoàn thành: /lenh ack latest"
```

### Boss says: "Tăng spend 20% cho campaign winter sale"
```
Response:
"📝 LỆNH #inst_xyz ghi nhận
Nội dung: Tăng spend 20% cho Winter Sale
Trạng thái: 🔴 Chờ xử lý

⚠️ Hành động này yêu cầu xác nhận (CEP protocol):
Gợi ý: /ngansach để kiểm tra Winter Sale trước
→ Sau đó /pheduyet để thực thi an toàn"
```
