$ErrorActionPreference = 'Stop'
$destination = Join-Path $env:RUNNER_TEMP 'RolVixa test Łódź'
# Instrumentation is compiled separately; the distributed installer keeps DevTools disabled.
Copy-Item 'src-tauri/target/x86_64-pc-windows-msvc/release/rolvixa.exe' (Join-Path $destination 'rolvixa.exe') -Force
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222 --disable-gpu'
$env:ROLVIXA_WEBVIEW_CDP = 'http://127.0.0.1:9222'
$env:AUTONAPISY_FFMPEG = Join-Path $destination 'vendor/ffmpeg.exe'
$env:ROLVIXA_TEST_WHISPER_MODEL = (Resolve-Path '.tools/caption035b-ggml-tiny.bin').Path
$env:ROLVIXA_TEST_PROJECT = Join-Path $env:RUNNER_TEMP 'RolVixa prawdziwy podgląd Łódź/projekt.json'
$env:ROLVIXA_TEST_REPLACEMENT = Join-Path $env:RUNNER_TEMP 'RolVixa prawdziwy podgląd Łódź/Zamiennik Łódź.mp4'
$env:ROLVIXA_TEST_HISTORY = Join-Path $env:RUNNER_TEMP 'RolVixa historia Łódź'
$env:ROLVIXA_TEST_RECOVERY = Join-Path $env:RUNNER_TEMP 'RolVixa odzyskiwanie Łódź'
$env:ROLVIXA_TEST_STUDIO_DIR = Join-Path $env:RUNNER_TEMP 'RolVixa eksport Łódź'
New-Item -ItemType Directory -Path $env:ROLVIXA_TEST_STUDIO_DIR -Force | Out-Null
$env:ROLVIXA_TEST_CAPTION_PRESETS = Join-Path $env:RUNNER_TEMP 'RolVixa style Łódź'
$env:ROLVIXA_TEST_STUDIO_PROJECT = $env:ROLVIXA_TEST_PROJECT
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
  # Simulate a genuine process crash: leave the recovery file, release the OS lock.
  taskkill /PID $app.Id /T /F 2>$null | Out-Null
  $app = Start-Process -FilePath (Join-Path $destination 'rolvixa.exe') -PassThru -RedirectStandardOutput '.tools/restart-stdout.log' -RedirectStandardError '.tools/restart-stderr.log'
  $ready = $false
  for ($n = 0; $n -lt 120; $n++) {
    if ($app.HasExited) { throw 'Restart po awarii nie uruchomił aplikacji' }
    try { $null = Invoke-RestMethod "$env:ROLVIXA_WEBVIEW_CDP/json/version" -NoProxy -TimeoutSec 1; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'Brak WebView2 po restarcie' }
  node scripts/test-recovery-restart.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Odzyskiwanie po awarii procesu nie przeszło testu' }
  # A newer-version copy belongs to a previous process, never an active writer.
  taskkill /PID $app.Id /T /F 2>$null | Out-Null
  node scripts/test-recovery-restart.mjs --seed-future
  if ($LASTEXITCODE -ne 0) { throw 'Nie udało się przygotować nowszej kopii' }
  $app = Start-Process -FilePath (Join-Path $destination 'rolvixa.exe') -PassThru -RedirectStandardOutput '.tools/future-stdout.log' -RedirectStandardError '.tools/future-stderr.log'
  $ready = $false
  for ($n = 0; $n -lt 120; $n++) {
    if ($app.HasExited) { throw 'Aplikacja nie uruchomiła się z nowszą kopią' }
    try { $null = Invoke-RestMethod "$env:ROLVIXA_WEBVIEW_CDP/json/version" -NoProxy -TimeoutSec 1; $ready = $true; break } catch { Start-Sleep -Milliseconds 250 }
  }
  if (-not $ready) { throw 'Brak WebView2 przy nowszej kopii' }
  node scripts/test-recovery-restart.mjs --future
  if ($LASTEXITCODE -ne 0) { throw 'Ochrona nowszej kopii nie przeszła testu' }
  $test = Start-Process -FilePath (Get-Command node).Source -ArgumentList 'scripts/test-editor9.mjs' -NoNewWindow -PassThru
  if (-not $test.WaitForExit(240000)) {
    taskkill /PID $test.Id /T /F 2>$null | Out-Null
    throw 'Test WebView2 przekroczył limit 4 minut'
  }
  if ($test.ExitCode -ne 0) { throw 'Test interfejsu w rzeczywistym WebView2 nie przeszedł' }
  Write-Output 'Actual installed Tauri/WebView2: media drag, transition drag, caption click/Delete/double-click, keyboard and MLT stream: OK'
} finally {
  taskkill /PID $app.Id /T /F 2>$null | Out-Null
  Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  $global:LASTEXITCODE = 0
}
