#!/bin/bash

# TomClaws Meta Ads — Technical Verification Suite (Phase 26)
# ───────────────────────────────────────────────────────────
# Sử dụng curl để kiểm tra các tính năng đăng bài, sửa bài và login.

GATEWAY_URL="http://localhost:18789"
TEST_ENDPOINT="${GATEWAY_URL}/test/meta-op"

echo "🚀 Starting TomClaws Meta Verification..."

# 1. Test Posting (Đăng bài mẫu)
echo -e "\n[1/3] Testing: POST NEW MESSAGE"
curl -X POST "${TEST_ENDPOINT}" \
     -H "Content-Type: application/json" \
     -d '{
       "op": "post",
       "message": "Hello from TomClaws AI Assistant! 🦾 (Auto-test at $(date))"
     }'

# 2. Test Login Trigger (Kích hoạt đăng nhập ngầm)
echo -e "\n\n[2/3] Testing: TRIGGER BACKGROUND LOGIN"
curl -X POST "${TEST_ENDPOINT}" \
     -H "Content-Type: application/json" \
     -d '{
       "op": "login"
     }'
echo -e "\n(Check gateway logs to see Playwright progress)"

# 3. Test Editing (Sửa bài - Yêu cầu ID bài viết)
echo -e "\n[3/3] Testing: EDIT POST (Requires POST_ID)"
echo "Nhập ID bài viết cần sửa (hoặc để trống để bỏ qua):"
read -r POST_ID

if [ -n "$POST_ID" ]; then
  curl -X POST "${TEST_ENDPOINT}" \
       -H "Content-Type: application/json" \
       -d "{
         \"op\": \"edit\",
         \"postId\": \"$POST_ID\",
         \"message\": \"Nội dung này đã được sửa bởi TomClaws Expert! ✅\"
       }"
else
  echo "Skipping edit test."
fi

echo -e "\n\n✨ Verification commands sent."
