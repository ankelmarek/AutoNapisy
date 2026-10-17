$ErrorActionPreference = 'Stop'
$destination = Join-Path $env:RUNNER_TEMP 'RolVixa test Łódź'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$env:ROLVIXA_WEBVIEW_CDP = 'http://127.0.0.1:9222'
$env:AUTONAPISY_FFMPEG = Join-Path $destination 'vendor/ffmpeg.exe'
$app = Start-Process -FilePath (Join-Path $destination 'rolvixa.exe') -PassThru
try {
  $ready = $false
  for ($n = 0; $n -lt 120; $n++) {
    try { $null = Invoke-RestMethod "$env:ROLVIXA_WEBVIEW_CDP/json/version"; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'WebView2 nie udostępnił połączenia testowego CDP' }
  node scripts/test-editor9.mjs
  if ($LASTEXITCODE) { throw 'Test interfejsu w rzeczywistym WebView2 nie przeszedł' }
  Write-Output 'Actual installed Tauri/WebView2: media drag, transition drag, caption click/Delete/double-click, keyboard and MLT stream: OK'
} finally {
  taskkill /PID $app.Id /T /F 2>$null | Out-Null
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
}
