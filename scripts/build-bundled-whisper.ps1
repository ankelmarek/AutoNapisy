$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'src-tauri/.bundled'
$work = Join-Path $root '.tools/vendor-build'
New-Item -ItemType Directory -Force "$out/vendor", "$out/sources", "$out/licenses", "$work/whisper" | Out-Null
$revision = 'a8d002cfd879315632a579e73f0148d06959de36'
Invoke-WebRequest "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/$revision" -OutFile "$out/sources/whisper.cpp.tar.gz"
& tar -xzf "$out/sources/whisper.cpp.tar.gz" --strip-components=1 -C "$work/whisper"
if ($LASTEXITCODE) { throw 'Rozpakowanie whisper.cpp nie powiodło się' }
& cmake -S "$work/whisper" -B "$work/whisper-build" -A x64 -DCMAKE_POLICY_DEFAULT_CMP0091=NEW -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF -DGGML_OPENMP=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded$<$<CONFIG:Debug>:Debug>'
if ($LASTEXITCODE) { throw 'Konfiguracja whisper.cpp nie powiodła się' }
& cmake --build "$work/whisper-build" --config Release --target whisper-cli -j 2
if ($LASTEXITCODE) { throw 'Kompilacja whisper.cpp nie powiodła się' }
$cli = Get-ChildItem "$work/whisper-build" -Recurse -Filter whisper-cli.exe | Select-Object -First 1
if (-not $cli) { throw 'Brak whisper-cli.exe' }
Copy-Item $cli.FullName "$out/vendor/whisper-cli.exe"
Copy-Item "$work/whisper/LICENSE" "$out/licenses/whisper.cpp-MIT.txt"
# In whisper.cpp 1.7.6, ggml is vendored under the repository-wide MIT license.
Copy-Item "$work/whisper/LICENSE" "$out/licenses/ggml-MIT.txt"
# Preserve every additional upstream license notice, including examples used by CLI.
$notices = Get-ChildItem "$work/whisper" -Recurse -File | Where-Object { $_.Name -match '^(LICENSE|COPYING|NOTICE)' }
foreach ($file in $notices) {
  $relative = $file.FullName.Substring((Resolve-Path "$work/whisper").Path.Length + 1)
  $destination = Join-Path "$out/licenses/whisper-notices" $relative
  New-Item -ItemType Directory -Force (Split-Path $destination -Parent) | Out-Null
  Copy-Item $file.FullName $destination
}
Copy-Item $PSCommandPath "$out/sources/"
Copy-Item "$root/licenses/THIRD-PARTY-NOTICES.txt" "$out/licenses/"
Copy-Item "$root/src/assets/BebasNeue-OFL.txt" "$out/licenses/"
# Full source, build scripts, revisions and hashes ship alongside the binaries.
@{
  ffmpeg = 'FFmpeg/FFmpeg@894da5ca7d742e4429ffb2af534fcda0103ef593 (8.0.1, GPL-2.0-or-later + x264)'
  x264 = 'mirror/x264@31e19f92f00c7003fa115047ce50978bc98c3a0d (GPL-2.0-or-later)'
  whisper = "ggml-org/whisper.cpp@$revision (1.7.6, MIT)"
  model = 'Not included. User-selected local multilingual GGML model.'
} | ConvertTo-Json | Set-Content "$out/licenses/components.json" -Encoding utf8
Get-ChildItem "$out/vendor", "$out/sources" -File | ForEach-Object {
  "$(($_ | Get-FileHash -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
} | Set-Content "$out/licenses/SHA256SUMS.txt" -Encoding utf8
& "$out/vendor/ffmpeg.exe" -hide_banner -loglevel error -y -f lavfi -i 'color=c=black:s=128x128:d=0.2' -c:v libx264 "$work/smoke.mp4"
if ($LASTEXITCODE) { throw 'Test enkodera x264 nie przeszedł' }
& "$out/vendor/ffprobe.exe" -v error -show_entries format=duration "$work/smoke.mp4"
if ($LASTEXITCODE) { throw 'Test ffprobe nie przeszedł' }
& "$out/vendor/whisper-cli.exe" --help
if ($LASTEXITCODE) { throw 'whisper-cli nie uruchamia się' }
