# test-graph-api.ps1
param (
    [Parameter(Mandatory=$true)]
    [string]$Token
)

Write-Host "`n--- GRAPH API MATRIX TEST BEGIN ---" -ForegroundColor Cyan

$versions = @("v12.0", "v17.0", "v25.0")
$fieldSets = @(
    "name,access_token",
    "name,category,access_token,perms,tasks"
)

foreach ($v in $versions) {
    foreach ($f in $fieldSets) {
        $url = "https://graph.facebook.com/$v/me/accounts?fields=$f&access_token=$Token"
        Write-Host "`n[TESTING] $v | Fields: $f" -ForegroundColor Yellow
        Write-Host "URL: https://graph.facebook.com/$v/me/accounts?fields=$f&access_token=EAAG***"
        
        try {
            $resp = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
            Write-Host "SUCCESS! Count: $($resp.data.Count)" -ForegroundColor Green
            if ($resp.data.Count -gt 0) {
                Write-Host "First Page: $($resp.data[0].name)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
            if ($_.Exception.Response) {
                $body = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($body)
                Write-Host "Error Body: $($reader.ReadToEnd())" -ForegroundColor Magenta
            }
        }
    }
}

Write-Host "`n--- TEST COMPLETE ---`n" -ForegroundColor Cyan
