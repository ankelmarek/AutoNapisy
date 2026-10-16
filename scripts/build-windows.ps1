$ErrorActionPreference = 'Stop'
if (-not [System.Environment]::Is64BitOperatingSystem) { throw 'Wymagany Windows x64' }
& npm ci
if ($LASTEXITCODE) { throw 'npm ci nie powiodło się' }
& npm test
if ($LASTEXITCODE) { throw 'Testy frontend nie przeszły' }
& cargo test --locked --manifest-path src-tauri/Cargo.toml
if ($LASTEXITCODE) { throw 'Testy Rust nie przeszły' }
& "$PSScriptRoot/prepare-bundle.ps1"
& npm run tauri -- build --config src-tauri/tauri.bundled.conf.json --target x86_64-pc-windows-msvc
if ($LASTEXITCODE) { throw 'Kompilacja nie powiodła się' }
