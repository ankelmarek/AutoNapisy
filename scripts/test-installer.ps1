$ErrorActionPreference = 'Stop'
$configuration = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
if ($configuration.productName -ne 'RolVixa') { throw 'Nieprawidłowa nazwa produktu' }
$expectedName = 'RolVixa_{0}_x64-setup.exe' -f $configuration.version
$installer = Get-Item (Join-Path 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis' $expectedName)
if ($env:GITHUB_ENV) { "ROLVIXA_INSTALLER=$($installer.FullName)" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append }
$destination = Join-Path $env:RUNNER_TEMP 'RolVixa test Łódź'
$process = Start-Process -FilePath $installer.FullName -ArgumentList '/S', "/D=$destination" -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "Instalator zwrócił $($process.ExitCode)" }
foreach ($relative in @('rolvixa.exe', 'vendor/mlt/melt.exe', 'vendor/mlt/BUILD.txt', 'licenses/mlt/README.txt', 'sources/mlt.tar.gz', 'sources/libxml2.tar.gz', 'sources/libiconv.tar.gz', 'sources/dlfcn.tar.gz', 'vendor/ffmpeg.exe', 'vendor/ffprobe.exe', 'vendor/whisper-cli.exe', 'licenses/FFmpeg-GPL-2.0.txt', 'licenses/whisper.cpp-MIT.txt', 'licenses/zaleznosci-frontend.json', 'licenses/zaleznosci-rust.html', 'sources/ffmpeg.tar.gz', 'sources/x264.tar.gz', 'sources/zlib.tar.gz', 'licenses/zlib.txt', 'sources/whisper.cpp.tar.gz')) {
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

$env:MLT_REPOSITORY = Join-Path $destination 'vendor/mlt/lib/mlt'
$env:MLT_DATA = Join-Path $destination 'vendor/mlt/share/mlt'
$env:MLT_PROFILES_PATH = Join-Path $destination 'vendor/mlt/share/mlt/profiles'
& "$destination/vendor/mlt/melt.exe" --version
if ($LASTEXITCODE) { throw 'Zainstalowany MLT nie działa' }
$graph = Join-Path $env:RUNNER_TEMP 'installed-mlt.mlt'
$escaped = [System.Security.SecurityElement]::Escape($video)
@"
<mlt><profile width="128" height="128" frame_rate_num="30" frame_rate_den="1" progressive="1" sample_aspect_num="1" sample_aspect_den="1" display_aspect_num="1" display_aspect_den="1"/><producer id="p"><property name="mlt_service">avformat</property><property name="resource">$escaped</property></producer><playlist><entry producer="p" in="0" out="2"/></playlist></mlt>
"@ | Set-Content -Path $graph -Encoding utf8
$mltOutput = Join-Path $env:RUNNER_TEMP 'installed-mlt.mp4'
& "$destination/vendor/mlt/melt.exe" $graph -consumer "avformat:$mltOutput" vcodec=libx264 acodec=aac real_time=-2 terminate_on_pause=1
if ($LASTEXITCODE -or -not (Test-Path $mltOutput)) { throw 'Zainstalowany MLT nie renderuje po przeniesieniu do folderu Unicode' }
Write-Output 'Installed, relocated MLT runtime and avformat decoder/encoder: OK'
