$ErrorActionPreference = 'Stop'
& npx --yes license-checker@25.0.1 --production --json --customPath licenses/frontend-template.json --out src-tauri/.bundled/licenses/zaleznosci-frontend.json
if ($LASTEXITCODE) { throw 'Nie można przygotować licencji JavaScript' }
if (-not (Get-Command cargo-about -ErrorAction SilentlyContinue)) {
  & cargo install cargo-about --locked
  if ($LASTEXITCODE) { throw 'Nie można przygotować cargo-about' }
}
& cargo about generate -m src-tauri/Cargo.toml --all-features --target x86_64-pc-windows-msvc -o src-tauri/.bundled/licenses/zaleznosci-rust.html licenses/about.hbs
if ($LASTEXITCODE) { throw 'Nie można przygotować licencji Rust' }
