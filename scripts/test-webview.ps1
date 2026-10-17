$ErrorActionPreference = 'Stop'
$destination = Join-Path $env:RUNNER_TEMP 'RolVixa test Łódź'
# Instrumentation is compiled separately; the distributed installer keeps DevTools disabled.
Copy-Item 'src-tauri/target/x86_64-pc-windows-msvc/release/rolvixa.exe' (Join-Path $destination 'rolvixa.exe') -Force
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222 --disable-gpu'
$env:ROLVIXA_WEBVIEW_CDP = 'http://127.0.0.1:9222'
$env:AUTONAPISY_FFMPEG = Join-Path $destination 'vendor/ffmpeg.exe'
$env:ROLVIXA_TEST_PROJECT = Join-Path $env:RUNNER_TEMP 'RolVixa prawdziwy podgląd Łódź/projekt.json'
node scripts/test-native-preview.mjs --prepare
if ($LASTEXITCODE -ne 0) { throw 'Nie udało się przygotować projektu testowego' }
$app = Start-Process -FilePath (Join-Path $destination 'rolvixa.exe') -PassThru -RedirectStandardOutput '.tools/app-stdout.log' -RedirectStandardError '.tools/app-stderr.log'
try {
  Write-Output "Installed app PID $($app.Id); waiting for WebView2 CDP"
  $ready = $false
  for ($n = 0; $n -lt 120; $n++) {
    if ($app.HasExited) {
      Get-Content '.tools/app-stderr.log', '.tools/app-stdout.log' -ErrorAction SilentlyContinue | Write-Output
      throw "Aplikacja zakończyła uruchamianie z kodem $($app.ExitCode)"
    }
    try { $null = Invoke-RestMethod "$env:ROLVIXA_WEBVIEW_CDP/json/version" -NoProxy -TimeoutSec 1; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'WebView2 nie udostępnił połączenia testowego CDP' }
  Write-Output 'WebView2 CDP is ready; starting editor interactions'
  node scripts/test-native-preview.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Rzeczywisty podgląd MLT przez IPC nie przeszedł testu' }
  $test = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'scripts/test-editor9.mjs' -NoNewWindow -PassThru
  if (-not $test.WaitForExit(180000)) {
    taskkill /PID $test.Id /T /F 2>$null | Out-Null
    throw 'Test WebView2 przekroczył limit 3 minut'
  }
  if ($test.ExitCode -ne 0) { throw 'Test interfejsu w rzeczywistym WebView2 nie przeszedł' }
  Write-Output 'Actual installed Tauri/WebView2: media drag, transition drag, caption click/Delete/double-click, keyboard and MLT stream: OK'
} finally {
  taskkill /PID $app.Id /T /F 2>$null | Out-Null
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  $global:LASTEXITCODE = 0
}
