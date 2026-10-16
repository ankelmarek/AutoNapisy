$ErrorActionPreference = 'Stop'
if (-not [System.Environment]::Is64BitOperatingSystem) { throw 'Wymagany Windows x64' }
& npm install
if ($LASTEXITCODE) { throw 'npm install nie powiodło się' }
& npm test
if ($LASTEXITCODE) { throw 'Testy frontend nie przeszły' }
& cargo test --manifest-path src-tauri/Cargo.toml
if ($LASTEXITCODE) { throw 'Testy Rust nie przeszły' }
& npm run tauri -- build --target x86_64-pc-windows-msvc
if ($LASTEXITCODE) { throw 'Kompilacja nie powiodła się' }
