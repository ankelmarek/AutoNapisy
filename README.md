# AutoNapisy 0.6 — polska mowa → polskie napisy

Lokalna aplikacja Windows x64: Tauri 2, React, TypeScript, Vite i Rust. Rozpoznaje polską mowę przez whisper.cpp, bez tłumaczenia. Nie wysyła nagrań, nie zawiera klienta HTTP ani telemetrii.

## Aktualizacja z 0.1 / 0.2

Zachowaj projekty i nagrania. Pobierz ZIP z GitHuba i rozpakuj do nowego folderu, np. `C:\AutoNapisy-0.4`. Nie kopiuj starych `node_modules`, `dist` i `src-tauri/target`. Aplikacja otwiera projekty v1 z wersji 0.1/0.2 i migruje je w pamięci. Wersja 0.6 zapisuje format v3 z montażem oraz ustawieniami wyglądu; starsze AutoNapisy go nie odczyta. Zachowaj kopię poprzedniego JSON, jeśli potrzebujesz wracać do 0.2.

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
2. **whisper.cpp Windows x64**: [whisper-bin-x64.zip v1.7.6](https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip) — sprawdzony format CLI; wybierz paczkę z `whisper-cli.exe`, nie „Source code”. Rozpakuj całość razem z bibliotekami DLL. Jeżeli wydanie nie ma binariów, wybierz wydanie, które zawiera paczkę x64. Adapter używa CLI zgodnego z v1.7.6.
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
- Dla whisper.cpp argumenty są zapisywane do pliku UTF-8 (jeden argument na wiersz), a WAV i wynik mają względne nazwy ASCII. Zapobiega to utracie Unicode przez starszy Windows CRT. Znaki nowej linii w ścieżkach są odrzucane.
- Prywatny folder tymczasowy jest usuwany po zakończeniu/błędzie/anulowaniu. Po awarii systemu może pozostać `autonapisy-*` w TEMP; usuń go po zamknięciu aplikacji. WAV wymaga około 115 MB miejsca na godzinę nagrania.
- JSON projektu i wynik Whisper mają limit 16 MB; nieznane wersje schematu są odrzucane.
- `src/transcription.ts`: adapter IPC i anulowanie; `src/adapters.ts`: kontrakty podglądu/synchronizacji/renderowania; `src/model.ts`: walidacja; `src-tauri/src/transcription.rs`: procesy i parser; `commands.rs`: dialogi, konfiguracja i zadania; `subtitles.rs`: SRT; `project.rs`: walidacja backendowa.
- `schemas/project-v1.schema.json`, `schemas/project-v2.schema.json` i `schemas/project-v3.schema.json`: archiwalne i aktualny format danych; migracja v1/v2 → v3 zachowuje font, kolory, tekst i tworzy pełne ujęcie źródła. Czasy są w sekundach.

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

Etap 1 został sprawdzony na Windows przez użytkownika. Testy i smoke test rdzenia nie zastępują testu interfejsu oraz polskiego nagrania na docelowym Windows. Przed wydaniem sprawdź: mowę, ciszę, brak audio, brak modelu/DLL, Unicode, anulowanie w obu fazach, zamknięcie podczas zadania, zapis/otwarcie JSON, eksport SRT oraz 1366×768 i Full HD.

## Ograniczenia

Brak tłumaczenia, GPU, proxy wideo, diarizacji, edycji czasów, renderowania filmu i automatycznego pobierania modeli. Podgląd zależy od kodeków WebView2; transkrypcja FFmpeg może działać nawet bez podglądu danego kodeka. Długie nagrania potrzebują miejsca i czasu; nie ma wznawiania po zamknięciu. SRT nie zawiera stylizacji. Model i komponenty nie są dołączone do źródeł ani instalatora.


## Wygląd i łamanie napisów — 0.3

Domyślny styl nowych projektów i przycisk **Żółta plansza · Bebas Neue** w prawym panelu odtwarzają referencję: czarny tekst wielkimi literami, żółte tło, zaokrąglenie i maksymalnie dwie wyśrodkowane linie. Font Bebas Neue z polskimi znakami jest dołączony lokalnie na licencji SIL OFL 1.1; treść licencji dostępna jest w Ustawieniach i `src/assets/BebasNeue-OFL.txt`. Nie trzeba instalować fontu w Windows i nie jest pobierany przez aplikację.

Starsze projekty zachowują dotychczasowy styl. Otwórz projekt i kliknij **Żółta plansza · Bebas Neue**, aby zastosować nowy wygląd. Możesz zmienić rozmiar, liczbę linii (1–3), orientacyjny limit znaków na linię, słowa na planszę, szerokość, zaokrąglenie i odstęp od krawędzi. Rozmiary są względne do szerokości obrazu 720 px, a nie okna programu. Napisy są kotwiczone do rzeczywistego obrazu w podglądzie, z pominięciem czarnych pasów.

Automatyczne łamanie zachowuje pełne słowa, wyrównuje długości linii i unika samotnych przyimków/spójników na ich końcu. Enter w polu tekstu ustawia ręczną linię; do zadanej liczby linii takie łamanie ma pierwszeństwo. Nadmiar ręcznych linii jest ponownie składany do limitu. Szerokości tekstu są mierzone w dołączonej czcionce; zbyt długi blok zmniejsza rozmiar, zamiast ucinać słowa. Długie segmenty warto skrócić lub ponownie rozpoznać.

Krótkie plansze powstają tylko wtedy, gdy czasy słów z Whisper są spójne i odpowiadają tekstowi. Przejścia wykorzystują rzeczywiste początki słów, bez dzielenia czasu proporcjonalnie. Bez czasów słów, przy ich nakładaniu lub po korekcie tekstu cały segment jest wyświetlany jako blok i dopasowywany do liczby linii. To celowe: aplikacja nie zgaduje synchronizacji. Nowa transkrypcja prosi Whisper o krótsze segmenty (limit 48 zamiast 80), bez ucinania słów. Przy nakładaniu segmentów w podglądzie wybierana jest jedna, najpóźniej rozpoczęta plansza.

**Eksport SRT** zachowuje podział plansz i linie, a tekst oryginalnego projektu nie jest zmieniany przez skład. SRT nie przenosi żółtego tła, fontu ani zaokrągleń. Eksport MP4 utrwala wygląd napisów w obrazie.

## Jak poprawić dokładność polskiej transkrypcji

Największy wpływ ma model: `tiny`/`base` są szybkie, ale mniej dokładne. Wypróbuj [ggml-small.bin](https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true) (około 466 MiB), a przy wystarczającej pamięci i czasie `ggml-medium.bin` (około 1.5 GiB). Wielojęzyczne `large-v3` są jeszcze większe i na CPU mogą działać bardzo wolno. To nie gwarantuje poprawy każdego fragmentu — porównaj ten sam fragment nagrania. Model należy pobrać osobno i wskazać w Ustawieniach; program nie pobiera go automatycznie.

Po zmianie modelu wykonaj transkrypcję ponownie. Zachowaj poprzedni projekt do porównania. Czysta, głośna mowa bez muzyki pomaga bardziej niż zwiększanie rozdzielczości wideo. Nie dodajemy automatycznego „poprawiania” tekstu, które mogłoby zmienić sens wypowiedzi. Nadal pracujemy lokalnie, bez usług chmurowych. Ustawienia wyszukiwania Whisper już używają domyślnego beam search; zmiana wyglądu i krótsze segmenty same nie poprawiają rozpoznawania słów.


Podgląd przykładowego stylu (tekst referencyjny, nie wynik transkrypcji):

![Bebas Neue na żółtej planszy](docs/caption-style.png)

Weryfikacja 0.3: testy składu i migracji, kontrola polskich glifów w dołączonym foncie oraz przeglądarkowy test układu 1366×768 i 1920×1080. Test przeglądarkowy używał kontrolowanego adaptera dialogów oraz wygenerowanego jednolitego filmu demonstracyjnego; nie zastępuje rzeczywistego testu WebView2 i Whisper na Windows. Implementację samego adaptera Whisper sprawdzono wcześniej z prawdziwym CLI. Raport automatycznej kompilacji i instalator są w GitHub Actions.


## Eksport MP4 — 0.4

1. W ustawieniach wskaż `ffmpeg.exe` z pełnego pakietu FFmpeg; obok musi znajdować się `ffprobe.exe`. Nie potrzebujesz dodatkowych ustawień Whisper do samego eksportu.
2. Otwórz projekt, sprawdź tekst, podział plansz i wygląd w podglądzie.
3. Kliknij **Eksport MP4**, wybierz plik docelowy i zaczekaj na komunikat zakończenia. Przycisk **Anuluj** przerywa pracę.

Napisy są na stałe zapisane w obrazie: Bebas Neue, kolory, zaokrąglone tło i ręczne łamanie korzystają ze wspólnego układu z podglądem. Eksport używa lokalnych plansz PNG i FFmpeg (H.264/libx264, CRF 18, preset medium, pierwsza ścieżka audio AAC 192 kb/s). Obsługuje również film bez dźwięku. Nie wysyła nagrania do internetu.

Źródło nie może być plikiem docelowym. Kodowanie odbywa się w katalogu tymczasowym obok wybranego pliku; potrzebne jest wolne miejsce na plansze i cały MP4. Anulowanie lub błąd zachowuje istniejący plik docelowy; udane kodowanie zastępuje go po sprawdzeniu, czy nie został zmieniony podczas pracy.

Limity tej wersji: 3000 plansz, 8 MB na planszę, 512 MB plansz łącznie, maksymalnie 16 megapikseli i 8192 pikseli na bok, film do 24 godzin. Eksport działa na CPU i może potrwać. Nie zawiera montażu, wyboru ścieżek audio ani eksportu HDR. Rozmiar uwzględnia obrót o wielokrotność 90° oraz proporcje pikseli, wynik ma parzyste wymiary i kwadratowe piksele.

Testy eksportu: testy adaptera IPC, walidacji PNG, osi czasu i ochrony źródła oraz test integracyjny z prawdziwym FFmpeg. Test integracyjny jest opcjonalny: `.test-core/tests/video_export.rs` opisuje zmienne środowiskowe z lokalnymi plikami testowymi; uruchom `cargo test --manifest-path .test-core/Cargo.toml --test video_export -- --ignored`. Kompilację natywnego Tauri i instalatora sprawdza workflow Windows.


## Pełny instalator 0.5 — narzędzia i licencje

Pełny instalator z workflow Windows zawiera `ffmpeg.exe`, `ffprobe.exe` oraz
`whisper-cli.exe` (CPU x64). Aplikacja wykrywa je z własnego katalogu zasobów;
nie korzysta z PATH. Działające ścieżki wybrane ręcznie mają pierwszeństwo.
Nieaktualne ścieżki z poprzedniej instalacji zastępuje narzędziami dołączonymi.
Model GGML nadal wybierasz osobno; aplikacja nie pobiera modeli ani nie wysyła nagrań.

Ustawienia → „Komponenty i licencje” zawierają informacje oraz pełne teksty
GPL i MIT; licencja Bebas Neue jest dostępna osobno. Obok aplikacji są foldery
`licenses` (również raporty zależności JS/Rust, licencje runtime i sumy SHA-256)
i `sources` (dokładne archiwa źródłowe FFmpeg, x264, whisper.cpp, konfiguracje
i skrypty kompilacji). Nie usuwaj tych plików z dystrybuowanego pakietu.

FFmpeg z libx264 jest na GPL-2.0-or-later; brak komponentów nonfree. Narzędzia
są odrębnymi procesami, nie bibliotekami linkowanymi do aplikacji. whisper.cpp
i ggml mają MIT, Bebas Neue SIL OFL 1.1. Licencję modelu należy sprawdzić u
jego dostawcy — nie jest dołączony. Nie nadano nowej licencji kodowi AutoNapisy.

Budowanie pełnego instalatora wymaga MSYS2 MINGW64 (`C:\msys64`) z pakietami
`make diffutils curl mingw-w64-x86_64-gcc mingw-w64-x86_64-pkgconf mingw-w64-x86_64-nasm`,
VS C++ z CMake, Node i Rust. Uruchom `powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1`.
Skrypt pobiera źródła i narzędzia do raportowania licencji wyłącznie podczas
budowania. Tak samo robi `.github/workflows/windows.yml`; sprawdza uruchomienie
FFmpeg/FFprobe/Whisper i rzeczywiste kodowanie H.264 przed utworzeniem instalatora.
Zwykłe `npm run tauri -- dev` i `npm run tauri -- build` pozostają wariantami
deweloperskimi bez wbudowanych narzędzi. Pierwsza pełna kompilacja trwa dłużej.

Workflow dodatkowo instaluje gotowy pakiet w katalogu ze spacją i polskimi znakami, sprawdza obecność źródeł i licencji oraz uruchamia narzędzia z zainstalowanego katalogu. whisper.cpp jest budowany ze statycznym runtime C++, aby nie wymagać osobnego instalowania Visual C++ Redistributable.


## Montaż na jednej ścieżce — 0.6

Importuj jeden film i wycinaj z niego ujęcia. Oryginał pozostaje bez zmian.
- **Żyletka** (C): kliknij klip lub ustaw głowicę i wybierz **Przetnij tutaj**.
- **Zaznacz** (V): przeciągnij środek klipu, aby go przesunąć. Klipy nie nakładają się. Przeniesienie fragmentu za inny zmienia kolejność.
- Przeciągnij boczny uchwyt, aby skrócić lub przywrócić fragment w granicach źródła i wolnego miejsca.
- **Magnes** przyciąga krawędzie do sąsiada (10 pikseli), uchwyty także do głowicy.
- **Usuń ujęcie** / Delete usuwa zaznaczony fragment i pozostawia przerwę. **Dosuń wszystkie** zamyka wszystkie przerwy w aktualnej kolejności. Gdy oś jest pusta, **Przywróć cały film** dodaje pełne źródło, zachowując oryginalną transkrypcję.
- **Cofnij/Ponów**: przyciski lub Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Jedno przeciągnięcie jest jedną zmianą.
- Kliknij lub przeciągnij linijkę, aby przewinąć. Zoom i poziomy pasek przewijania pomagają przy dłuższych nagraniach. Pola pod osią umożliwiają dokładne ustawienie czasów w sekundach.

Podgląd przeskakuje między punktami wejścia i wyjścia ujęć. Przerwy są czarne
i bez dźwięku. Napisy z oryginalnymi czasami słów są przycinane i przesuwane
razem z materiałem; ponownie użyty fragment korzysta z tego samego źródłowego
tekstu. Edycja tekstu w panelu dotyczy źródłowego segmentu we wszystkich jego
użyciach. Po ręcznej zmianie tekstu czasy słów są usuwane — program nie zgaduje
nowych czasów. Segment bez czasów słów zachowuje cały tekst w widocznej części
ujęcia; przy cięciu wewnątrz takiego segmentu tekst może powtórzyć się po cięciu.

Eksport MP4 i SRT korzystają z czasu montażu. MP4 można wyeksportować także
bez napisów. Eksport jest sekwencyjny, wymaga miejsca na pliki pośrednie i
normalizuje obraz do **30 kl./s**, dźwięk do stereo 48 kHz AAC. Cięcia eksportu
są dopasowane do klatek (do około 1/30 s). Krawędzie dźwięku nie mają przejść
ani wygładzania. Przy dużej liczbie ujęć przygotowanie eksportu potrwa dłużej;
postęp dotyczy aktualnego etapu. Anulowanie zachowuje istniejący plik docelowy.

Format projektu v3 zapisuje `clips: [{id, sourceIn, sourceOut, start}]`. Napisy
w projekcie nadal mają czasy źródłowe. `clips: []` oznacza pusty montaż,
`null` oczekiwanie na metadane pierwszego filmu. Projekty v1/v2 są migrowane
do jednego ujęcia obejmującego źródło. Starsze wersje aplikacji nie otworzą v3;
zachowaj kopię starszego JSON. Maksymalnie 100 ujęć, jedna ścieżka i jedno
nagranie źródłowe; brak przejść i nakładania. Nie dodano automatycznego proxy
HEVC — podgląd nadal wymaga kodeka obsługiwanego przez WebView2.

Rzeczywisty test eksportu: `AUTONAPISY_FFMPEG` wskazuje FFmpeg, następnie
`cargo test --manifest-path .test-core/Cargo.toml --test montage_export -- --ignored`.
Test sam generuje kolorowe nagranie, sprawdza kolejność i cięcia, czarne/ciche
przerwy, źródło bez audio, czas wyniku, ścieżki Unicode i niezmieniony oryginał.
Workflow Windows uruchamia go z dołączonym FFmpeg przed budową instalatora.

Opcjonalny test interfejsu: zainstaluj Playwright przez `npm install --prefix .tools/browser playwright@1.56.1`, następnie `.tools/browser/node_modules/.bin/playwright install chromium`. Uruchom `npm run dev` w osobnym terminalu, ustaw `AUTONAPISY_FFMPEG` na FFmpeg z enkoderami libvpx/libopus i wykonaj `node scripts/test-editor.mjs`. Test generuje własny WebM oraz kontrolowany projekt demonstracyjny; sprawdza cięcie, uchwyty, magnes, undo/redo, usuwanie, odtwarzanie przez cięcie i przerwę oraz układ 1366×768 / 1920×1080. Nie zastępuje ręcznego testu WebView2 na docelowym komputerze.

Wersja 0.6 poprawia też kompilację dołączonego FFmpeg: zawiera statycznie linkowaną zlib 1.3.2 potrzebną do odczytu i zapisu PNG. Licencja i źródła zlib są w instalatorze. Testy sprawdzają PNG → H.264, faktyczne nakładanie plansz i działanie po instalacji.
