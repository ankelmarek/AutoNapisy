# AutoNapisy 0.2 — polska mowa → polskie napisy

Lokalna aplikacja Windows x64: Tauri 2, React, TypeScript, Vite i Rust. Rozpoznaje polską mowę przez whisper.cpp, bez tłumaczenia. Nie wysyła nagrań, nie zawiera klienta HTTP ani telemetrii.

## Aktualizacja z 0.1

Zachowaj projekty i nagrania. Pobierz ZIP z GitHuba i rozpakuj do nowego folderu, np. `C:\AutoNapisy-0.2`. Nie kopiuj starych `node_modules`, `dist` i `src-tauri/target`. Projekty JSON zachowują schemat v1 i pozostają zgodne z 0.1.

Wymagania: Node.js 22 lub 24, aktualny Rust stable x64 MSVC, Visual Studio Build Tools z „Desktop development with C++” i Windows SDK oraz WebView2 Runtime.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run tauri -- dev
```

Pobieranie zależności wymaga internetu. Obsługa filmów i transkrypcja nie korzystają z sieci. Sam `npm run dev` uruchamia frontend bez usług Tauri.

## Przygotowanie komponentów — jednorazowo

Whisper, FFmpeg i model nie są dołączone do instalatora. Pobierz je osobno z zaufanych źródeł i trzymaj w stałym katalogu, np. `C:\AutoNapisy-Komponenty`.

1. **FFmpeg Windows x64**: wybierz dystrybucję Windows wskazaną na https://ffmpeg.org/download.html. Rozpakuj całą paczkę i odszukaj `bin\ffmpeg.exe`.
2. **whisper.cpp Windows x64**: https://github.com/ggml-org/whisper.cpp/releases — wybierz paczkę z `whisper-cli.exe`, nie „Source code”. Rozpakuj całość razem z bibliotekami DLL. Jeżeli wydanie nie ma binariów, wybierz wydanie, które zawiera paczkę x64. Adapter używa CLI zgodnego z v1.7.6.
3. **Wielojęzyczny model GGML**: https://huggingface.co/ggerganov/whisper.cpp/tree/main — `ggml-base.bin` (około 142 MiB), ewentualnie dokładniejszy i wolniejszy `ggml-small.bin` (około 466 MiB). Do szybkich prób `ggml-tiny.bin` (około 74 MiB). Nie wybieraj wariantu `.en.bin`, GGUF ani modeli innych implementacji.
4. W AutoNapisy kliknij **Ustawienia** i wskaż trzy pliki przyciskami **Wybierz**: FFmpeg, whisper-cli i model.

Aplikacja zapisuje ścieżki w `components.json` w katalogu konfiguracji użytkownika Tauri. Nie wyszukuje programów w PATH, nie pobiera nic automatycznie i nie uruchamia programów wskazanych w projekcie JSON. Sprawdza nazwę/pliki i nagłówek GGML; faktyczne uruchomienie sprawdzane jest przy transkrypcji. Korzystaj wyłącznie z zaufanych binariów.

## Obsługa

1. Zaimportuj film lub otwórz projekt.
2. Kliknij **Transkrybuj po polsku**. FFmpeg wyodrębnia pierwszą ścieżkę audio do mono PCM WAV 16 kHz. Whisper rozpoznaje język polski na CPU, maksymalnie 8 wątków.
3. Przygotowanie i ładowanie modelu mają nieokreślony pasek. Procent pochodzi z Whisper i dotyczy tylko fazy rozpoznawania; nie jest szacowanym postępem całego zadania. Niektóre CLI nie podają procentu.
4. **Anuluj** zatrzymuje proces. Zamknięcie aplikacji też zatrzymuje zadanie, czeka na jego koniec i sprząta pliki tymczasowe.
5. Po sukcesie segmenty pojawiają się w lewym panelu i na podglądzie. Kliknij czas, aby przewinąć film. Tekst można poprawić w polu segmentu. Korekta usuwa czasy słów tego segmentu, ponieważ przestały odpowiadać tekstowi.
6. **Zapisz** zapisuje projekt JSON z segmentami, słowami, czasami i stylami. **Eksport SRT** tworzy UTF-8 z tekstem i czasami; SRT nie zachowuje stylów ani nie zmienia filmu.

Nowe napisy zastępują stare dopiero po sukcesie i walidacji. Błąd lub anulowanie zachowuje poprzednie segmenty. Poprawny pusty wynik zastępuje je pustą listą i pokazuje komunikat „Nie rozpoznano mowy”. Whisper może halucynować na ciszy/muzyce — zawsze sprawdzaj wynik. Aplikacja nie generuje fikcyjnych transkrypcji.

Czasy segmentów pochodzą z JSON Whisper. Słowa składamy z tokenów tylko przy wiarygodnych czasach i zgodności tekstu; w przeciwnym razie `words` pozostaje puste. Nie wyznaczamy czasów proporcjonalnie. Koniec segmentu może zostać przycięty do długości nagrania, gdy Whisper wychodzi poza audio/film.

## Architektura i bezpieczeństwo

- Frontend nie ma shell, dowolnego dostępu do plików ani HTTP. Rust używa `Command` bez powłoki, ze stałymi argumentami i ścieżkami jako osobnymi argumentami Unicode.
- Film musi wcześniej zostać wybrany przez natywny import lub projekt. Zakres asset obejmuje konkretne pliki, nie katalogi. Projekt zawiera absolutną ścieżkę, a nie film; nie przenoś nagrania po zapisaniu projektu.
- FFmpeg ma whitelistę protokołów `file,pipe`. Whisper otrzymuje lokalny WAV, lokalny model, `-l pl`, bez tłumaczenia, z wyłączonym GPU.
- Prywatny folder tymczasowy jest usuwany po zakończeniu/błędzie/anulowaniu. Po awarii systemu może pozostać `autonapisy-*` w TEMP; usuń go po zamknięciu aplikacji. WAV wymaga około 115 MB miejsca na godzinę nagrania.
- JSON projektu i wynik Whisper mają limit 16 MB; nieznane wersje schematu są odrzucane.
- `src/transcription.ts`: adapter IPC i anulowanie; `src/adapters.ts`: kontrakty podglądu/synchronizacji/renderowania; `src/model.ts`: walidacja; `src-tauri/src/transcription.rs`: procesy i parser; `commands.rs`: dialogi, konfiguracja i zadania; `subtitles.rs`: SRT; `project.rs`: walidacja backendowa.
- `schemas/project-v1.schema.json`: schemat v1, czasy w sekundach. Nie dodano migracji ani nowej wersji formatu.

## Testy i instalator

```powershell
npm.cmd test
npm.cmd run build
npm.cmd audit
cargo test --manifest-path src-tauri/Cargo.toml
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

Workflow `.github/workflows/windows.yml` buduje Windows x64 i publikuje instalator jako artefakt. Instalator nie jest podpisany cyfrowo. Wynik lokalny: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Komponenty i model trzeba skonfigurować także po instalacji.

Testy rdzenia bez bibliotek graficznych Linux: `cargo test --manifest-path .test-core/Cargo.toml`. Uruchamiają te same moduły Rust co aplikacja. Przykładowy JSON w testach jest wyłącznie fixture, nigdy wynikiem użytkownika. Opcjonalny test prawdziwych komponentów: ustaw zmienne `AUTONAPISY_FFMPEG`, `AUTONAPISY_WHISPER`, `AUTONAPISY_MODEL`, `AUTONAPISY_SAMPLE` (lokalny plik z mową) i uruchom `cargo test --manifest-path .test-core/Cargo.toml --test local_tools -- --ignored --nocapture`.

Etap 1 został sprawdzony na Windows przez użytkownika. Testy i smoke test rdzenia 0.2 nie zastępują testu interfejsu oraz polskiego nagrania na docelowym Windows. Przed wydaniem sprawdź: mowę, ciszę, brak audio, brak modelu/DLL, Unicode, anulowanie w obu fazach, zamknięcie podczas zadania, zapis/otwarcie JSON, eksport SRT oraz 1366×768 i Full HD.

## Ograniczenia

Brak tłumaczenia, GPU, proxy wideo, diarizacji, edycji czasów, renderowania filmu i automatycznego pobierania modeli. Podgląd zależy od kodeków WebView2; transkrypcja FFmpeg może działać nawet bez podglądu danego kodeka. Długie nagrania potrzebują miejsca i czasu; nie ma wznawiania po zamknięciu. SRT nie zawiera stylizacji. Model i komponenty nie są dołączone do źródeł ani instalatora.
