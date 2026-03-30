# TomClaws Meta Ads — Technical Verification Suite (Phase 26)
# PowerShell Version for Windows

$GatewayUrl = "http://localhost:18789"
$TestEndpoint = "$GatewayUrl/test/meta-op"

Write-Host "`n🚀 Starting TomClaws Meta Verification..." -ForegroundColor Cyan

# 1. Test Posting (Đăng bài mẫu)
Write-Host "`n[1/3] Testing: POST NEW MESSAGE" -ForegroundColor Yellow
$PostBody = @{
    op = "post"
    message = "Hello from TomClaws AI Assistant! 🦾 (PowerShell test at $(Get-Date))"
} | ConvertTo-Json

Invoke-RestMethod -Uri $TestEndpoint -Method Post -ContentType "application/json" -Body $PostBody

# 2. Test Login Trigger (Kích hoạt đăng nhập ngầm)
Write-Host "`n[2/3] Testing: TRIGGER BACKGROUND LOGIN" -ForegroundColor Yellow
$LoginBody = @{
    op = "login"
} | ConvertTo-Json

Invoke-RestMethod -Uri $TestEndpoint -Method Post -ContentType "application/json" -Body $LoginBody
Write-Host "(Check gateway logs to see Playwright progress)"

# 3. Test Editing (Sửa bài)
Write-Host "`n[3/3] Testing: EDIT POST (Requires POST_ID)" -ForegroundColor Yellow
$PostId = Read-Host "Nhập ID bài viết cần sửa (hoặc để trống để bỏ qua)"

if ($PostId) {
    $EditBody = @{
        op = "edit"
        postId = $PostId
        message = "Nội dung này đã được sửa bởi TomClaws Expert! ✅"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri $TestEndpoint -Method Post -ContentType "application/json" -Body $EditBody
} else {
    Write-Host "Skipping edit test."
}

Write-Host "`n`n✨ Verification commands sent." -ForegroundColor Green
