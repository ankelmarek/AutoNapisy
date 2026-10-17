# Requires MSYS2 MINGW64: make, mingw32-make, nasm, diffutils, gcc, pkgconf, CMake and Python.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$bash = 'C:/msys64/usr/bin/bash.exe'
if (-not (Test-Path $bash)) { throw 'Zainstaluj MSYS2 w C:\msys64 (instrukcja README)' }
$env:MSYSTEM = 'MINGW64'
$env:CHERE_INVOKING = '1'
Push-Location $root
try {
  & $bash -lc './scripts/build-bundled-ffmpeg.sh'
  if ($LASTEXITCODE) { throw 'Budowanie FFmpeg nie powiodło się' }
  & $bash -lc './scripts/build-bundled-mlt.sh'
  if ($LASTEXITCODE) { throw 'Budowanie MLT nie powiodło się' }
  & "$PSScriptRoot/build-bundled-whisper.ps1"
  & "$PSScriptRoot/license-report.ps1"
} finally { Pop-Location }
