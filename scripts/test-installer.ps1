$ErrorActionPreference = 'Stop'
$installer = Get-ChildItem 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/*-setup.exe' | Select-Object -First 1
if (-not $installer) { throw 'Brak instalatora' }
if ($installer.Name -notlike 'RolVixa_*') { throw 'Nieprawidłowa nazwa instalatora RolVixa' }
$destination = Join-Path $env:RUNNER_TEMP 'RolVixa test Łódź'
$process = Start-Process -FilePath $installer.FullName -ArgumentList '/S', "/D=$destination" -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Instalator zwrócił $($process.ExitCode)" }
foreach ($relative in @('rolvixa.exe', 'vendor/ffmpeg.exe', 'vendor/ffprobe.exe', 'vendor/whisper-cli.exe', 'licenses/FFmpeg-GPL-2.0.txt', 'licenses/whisper.cpp-MIT.txt', 'licenses/zaleznosci-frontend.json', 'licenses/zaleznosci-rust.html', 'sources/ffmpeg.tar.gz', 'sources/x264.tar.gz', 'sources/zlib.tar.gz', 'licenses/zlib.txt', 'sources/whisper.cpp.tar.gz')) {
  if (-not (Test-Path (Join-Path $destination $relative))) { throw "W instalacji brakuje $relative" }
}
$video = Join-Path $env:RUNNER_TEMP 'film Łódź.mp4'
& "$destination/vendor/ffmpeg.exe" -hide_banner -loglevel error -y -f lavfi -i 'color=c=black:s=128x128:d=0.2' -c:v libx264 $video
if ($LASTEXITCODE) { throw 'Zainstalowany FFmpeg nie koduje MP4' }
& "$destination/vendor/ffprobe.exe" -v error -show_entries format=duration $video
if ($LASTEXITCODE) { throw 'Zainstalowany FFprobe nie działa' }
& "$destination/vendor/whisper-cli.exe" --help
if ($LASTEXITCODE) { throw 'Zainstalowany Whisper nie działa' }
Write-Output 'Installer resources, licenses, sources and installed tools: OK'

$png = Join-Path $env:RUNNER_TEMP 'plansza Łódź.png'
& "$destination/vendor/ffmpeg.exe" -v error -y -f lavfi -i 'color=c=yellow:s=128x128:d=0.1' -frames:v 1 $png
if ($LASTEXITCODE) { throw 'Zainstalowany FFmpeg nie koduje PNG' }
& "$destination/vendor/ffmpeg.exe" -v error -y -i $png -frames:v 1 -c:v libx264 -pix_fmt yuv420p $video
if ($LASTEXITCODE) { throw 'Zainstalowany FFmpeg nie dekoduje PNG do MP4' }
