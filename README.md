# AutoNapisy 0.1 — etap 1

Fundament lokalnej aplikacji Windows x64: Tauri 2, React, TypeScript, Vite i Rust. Interfejs po polsku. Nagrania nie są wysyłane do internetu. Program nie zawiera klienta API, telemetrii ani mechanizmu pobierania modeli.

## Stan weryfikacji

Kod został przygotowany w środowisku Linux z Node 24 i npm 11. Środowisko nie ma Rust/Cargo, bibliotek GTK/WebKit ani Windows/WebView2. Pobranie zależności npm nie powiodło się (niedostępny proxy), więc testy Vitest, kompilacja TypeScript, testy Rust, uruchomienie desktopu oraz instalator **nie zostały zweryfikowane**. Nie powstał instalator. Workflow Windows jest przygotowany, ale nie został uruchomiony. Nie traktuj tego wydania jako gotowej, przetestowanej dystrybucji.

## Uruchomienie na Windows x64

1. Zainstaluj Node.js 22 LTS, aktualny Rust stable z targetem `x86_64-pc-windows-msvc`, Visual Studio Build Tools 2022 z komponentem „Desktop development with C++” i Windows SDK oraz Microsoft Edge WebView2 Runtime.
2. Otwórz PowerShell w katalogu projektu.
3. Wykonaj:

```powershell
npm install
npm run tauri -- dev
```

Sam frontend: `npm run dev` (http://localhost:1420). Dialogi i diagnostyka wymagają Tauri; w przeglądarce operacje backendu zwrócą błąd.

Pierwsza instalacja zależności i narzędzi wymaga internetu; aplikacja nie korzysta z niego do obsługi projektów ani nagrań. Po udanym `npm install` zachowaj wygenerowany `package-lock.json` i zmień instalację CI na `npm ci`. Cargo wygeneruje analogicznie `Cargo.lock`; oba lockfile należy utrwalić przed wydaniem.

## Testy i instalator

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

Skrypt zatrzymuje się przy błędzie testów lub kompilacji. Instalator NSIS powinien powstać w `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Workflow `.github/workflows/windows.yml` wykonuje te same testy i publikuje artefakt instalatora, bez automatycznego wydawania aplikacji. Instalator nie jest podpisany cyfrowo.

## Funkcje

- Trzy panele: transkrypcja, podgląd filmu, stylizacja; dolna oś czasu. Układ przewidziany dla 1366×768 i Full HD, wymaga sprawdzenia na prawdziwym Windows i przy skalowaniu DPI.
- Natywny import MP4, MOV, MKV, WEBM, AVI i M4V, odtwarzanie/pauza, przewijanie suwakiem i o 5 sekund.
- Tworzenie, otwieranie i zapisywanie projektów JSON przez natywne dialogi. Ostrzeżenie przed zastąpieniem niezapisanego projektu. Zapis przez plik tymczasowy w tym samym katalogu i zastąpienie docelowego pliku.
- Walidacja wersji, stylów, ID, zakresów segmentów i słów. Limit projektu 16 MB. Unicode w nazwach i ścieżkach.
- Styl domyślny: krój, rozmiar, kolory i pozycja; demonstracja wyglądu w panelu. Zaimportowane segmenty mogą być wyświetlane i synchronizowane, ale nie ma edytora segmentów.
- Diagnostyka systemu, CPU, liczby procesorów logicznych i RAM. Statusy Whisper, FFmpeg oraz GPU opisują faktyczny brak integracji.
- Osobne interfejsy transkrypcji, synchronizacji, podglądu i renderowania. Transkrypcja i rendering zwracają jawny błąd niedostępności; żadnych fikcyjnych wyników.

## Architektura i bezpieczeństwo

`src/model.ts` jest walidatorem frontendowym. `schemas/project-v1.schema.json` dokumentuje format v1; czasy są w sekundach, ścieżka filmu jest absolutna, plik projektu nie zawiera nagrania. Przeniesienie filmu wymaga ponownego importu (który usuwa segmenty poprzedniego filmu). Przyszłe wersje schematu są odrzucane, bez cichego nadpisywania danych.

`src/adapters.ts` definiuje kontrakty usług. `src-tauri/src/project.rs` ponownie waliduje projekt na granicy backendu. `main.rs` udostępnia wyłącznie `import_video`, `prepare_preview`, `open_project`, `save_project` i `diagnostics`. Frontend nie ma shell, dowolnego odczytu/zapisu plików ani klienta HTTP.

Protokół asset ma początkowo pusty zakres. Rust kanonizuje ścieżkę i dopuszcza tylko konkretny plik wybrany w natywnym dialogu albo wskazany w poprawnym projekcie wybranym przez użytkownika. Nie udostępnia całego katalogu. Uprawnienia wybranych plików obowiązują do końca sesji. Otwieraj projekty wyłącznie z zaufanych źródeł: projekt może wskazać lokalny film. JSON nie jest interpretowany jako kod, a tekst segmentów renderuje React bez HTML.

Podgląd korzysta z HTML video i kodeków WebView2. Rozszerzenie pliku **nie gwarantuje** obsługi kodeka. Błąd odtwarzania pokazuje komunikat o kodeku/proxy. `PreviewAdapter.prepare` jest punktem rozszerzenia dla przyszłego FFmpeg; w etapie 1 nie konwertuje filmu. Brak obrazu lub dźwięku przy częściowym wsparciu kodeka wymaga ręcznej oceny. GPU, FFmpeg i Whisper nie są wykrywane ani uruchamiane.

## Pliki

- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` — konfiguracja frontendowa.
- `src/main.tsx`, `src/App.tsx`, `src/style.css` — interfejs.
- `src/model.ts`, `src/adapters.ts` — model i kontrakty usług.
- `schemas/project-v1.schema.json` — dokumentowany schemat JSON.
- `tests/model.test.ts` — testy projektów, Unicode, czasów, synchronizacji i niedostępnych usług.
- `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/icons/icon.ico` — konfiguracja desktopu i instalatora.
- `src-tauri/src/main.rs`, `src-tauri/src/project.rs` — backend i testy Rust.
- `.github/workflows/windows.yml`, `scripts/build-windows.ps1` — budowanie Windows.
- `README.md` — instrukcja i stan weryfikacji.

## Lista ręcznej weryfikacji na Windows

1. Uruchom wszystkie testy, zbuduj NSIS i zainstaluj program na czystym Windows x64.
2. Sprawdź Full HD, 1366×768 oraz DPI 100/125/150%.
3. Importuj film H.264/AAC MP4 z nazwą Unicode; sprawdź dźwięk, play/pause, seek i koniec filmu.
4. Sprawdź nieobsługiwany kodek, usunięty film, brak dostępu, anulowanie każdego dialogu, błędny JSON i przyszłą wersję.
5. Zapisz projekt, zamknij i otwórz; sprawdź nazwę, styl, ścieżkę i podgląd. Sprawdź nadpisanie istniejącego projektu.
6. Spróbuj wywołać `prepare_preview` dla niewybranego pliku — backend musi odmówić.
7. Uruchom bez sieci i sprawdź diagnostykę. Zweryfikuj brak ruchu sieciowego aplikacji.

## Etap 2 — rekomendacje, bez implementacji

Po potwierdzeniu builda Windows: integracja lokalnego whisper.cpp, anulowanie i postęp zadań, zarządzanie modelami i akceleracją, adapter FFmpeg do proxy z mapowaniem czasu, testy kodeków, edycja segmentów/słów i eksport SRT/ASS. Następnie ujednolicenie rendererów stylów, migracje schematu, odzyskiwanie/autozapis oraz podpisywanie instalatora.
