# RolVixa 0.17 — polska mowa → polskie napisy

**Poprzedni sprawdzony instalator 0.16:** [pobierz ZIP Windows x64](https://github.com/ankelmarek/AutoNapisy/actions/runs/39069356974/artifacts/12114951791), rozpakuj i uruchom `RolVixa_0.16.0_x64-setup.exe`.
RolVixa (wcześniej AutoNapisy) to lokalna aplikacja Windows x64: Tauri 2, React, TypeScript, Vite i Rust. Rozpoznaje polską mowę przez whisper.cpp, bez tłumaczenia. Transkrypcja i montaż działają na komputerze. Opcjonalna biblioteka muzyki łączy się z Openverse po wpisaniu frazy wyszukiwania; nie wysyła nagrań użytkownika.

## Wersja 0.17 — odzyskiwanie i wybór ujęć

- Kopia odzyskiwania po 1,5 s od ostatniej zmiany, najpóźniej po 10 s ciągłej edycji. Ponowna próba po błędzie następuje po 30 s. Przy zamykaniu okna kopia jest domykana; błąd przy niezapisanych zmianach zatrzymuje zamknięcie i pozwala zapisać projekt ręcznie.
- Dwie atomowe kopie JSON w katalogu danych aplikacji `recovery-v1` (`current.json`, `previous.json`); każda zawiera projekt do 16 MiB, bez nagrań. Kopie obejmują kadrowanie, napisy i automatykę audio, bez cache proxy. OS blokuje równoległy dostęp drugiej instancji i zwalnia blokadę również po awarii.
- Po ponownym uruchomieniu: **Odzyskaj**, **Otwórz zapisany projekt**, **Odrzuć kopię**. Widać czas kopii i bieżącego zapisu ręcznego. Uszkodzona najnowsza kopia pozwala wrócić do poprzedniej. Gdy żadnej kopii nie można odczytać (także z powodu nowszego schematu), pozostają na dysku do wyraźnego odrzucenia; można zamknąć okno i wrócić w nowszej wersji. Braki mediów są zgłaszane bez usuwania montażu. Odzyskiwanie otwiera stan jako niezapisany projekt; pierwszy zapis wymaga wyboru pliku, chroniąc dotychczasowy zapis.
- W zakładce **Pliki** przesuwanie myszy po miniaturze pokazuje klatki źródła. Miniatury dekoduje FFmpeg przez pojedynczą kolejkę: cache 160 klatek, kroki 0,5 s, ograniczenie wywołań i pomijanie nieaktualnych żądań. Nie zmienia to głowicy ani historii montażu.
- Kliknij miniaturę (także klawiaturą Enter), aby otworzyć oznaczony **Źródło** podgląd MLT. Obsługuje wideo i własne audio, korzysta z dostępnego aktywnego proxy, zachowuje czas źródła i nie wymaga obsługi kodeka oryginału przez WebView2. Oś montażu zostaje zatrzymana.
- Przewiń źródło, naciśnij **I** (początek) i **O** (koniec) lub użyj przycisków/pól sekundowych. Spacja odtwarza źródło, strzałki przewijają o klatkę 30 FPS (Shift: sekunda), Esc wraca do montażu. Pokazany zakres i długość dotyczą oryginalnego źródła.
- **Dodaj zaznaczony fragment** wstawia wybrany przedział w pozycji głowicy montażu; przycisk można też przeciągnąć na V1/V2 albo A1/A2 dla audio. Zachowane są reguły umieszczania i przyciągania istniejącej osi. Jeden krok Undo usuwa cały dodany klip. Zwykły **+** na karcie nadal dodaje cały plik. I/O są pamiętane tylko w bieżącej sesji biblioteki i nie zmieniają schematu v9.

Ograniczenia: utrata zasilania przed pierwszą kopią może utracić ostatnie 1,5–10 s; kopie są dodatkowym zabezpieczeniem, nie kopią zapasową nagrań. Jedna instancja naraz korzysta z odzyskiwania; druga pokazuje błąd i wymaga zapisu ręcznego. Podgląd źródła przełącza wspólny silnik MLT, więc pierwsza klatka i dalsze przewinięcie poza bufor wymagają przygotowania strumienia. Nie ma tu J/L-cut, Ripple ani SmartCut.

Status odbioru 0.17: trwa weryfikacja Windows; nie traktować poprzedniego instalatora 0.16 jako tego wydania.

## Aktualizacja i uruchomienie ze źródeł

Zachowaj projekty i nagrania. Pobierz ZIP z GitHuba i rozpakuj do nowego folderu, np. `C:\RolVixa-0.17`. Nie kopiuj starych `node_modules`, `dist` i `src-tauri/target`. Aplikacja otwiera projekty v1–v9 i zapisuje format v9. Przed zapisaniem zachowaj kopię JSON, jeśli chcesz wrócić do starszej wersji aplikacji.

Wymagania: Node.js 22 lub 24, Rust stable ≥1.89 x64 MSVC (blokada pliku kopii odzyskiwania), Visual Studio Build Tools z „Desktop development with C++” i Windows SDK oraz WebView2 Runtime.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml
npm.cmd run tauri -- dev
```

Pobieranie zależności wymaga internetu. Obsługa filmów i transkrypcja nie korzystają z sieci. Sam `npm run dev` uruchamia frontend bez usług Tauri.

## Przygotowanie komponentów — jednorazowo

Pełny instalator z GitHub Actions zawiera FFmpeg, FFprobe i whisper.cpp wraz z licencjami i źródłami. Osobno wybierz tylko model GGML. Przy uruchamianiu ze źródeł lub własnym zestawie narzędzi możesz wskazać je ręcznie, np. z `C:\AutoNapisy-Komponenty`.

1. **FFmpeg Windows x64**: wybierz dystrybucję Windows wskazaną na https://ffmpeg.org/download.html. Rozpakuj całą paczkę i odszukaj `bin\ffmpeg.exe`.
2. **whisper.cpp Windows x64**: [whisper-bin-x64.zip v1.7.6](https://github.com/ggml-org/whisper.cpp/releases/download/v1.7.6/whisper-bin-x64.zip) — sprawdzony format CLI; wybierz paczkę z `whisper-cli.exe`, nie „Source code”. Rozpakuj całość razem z bibliotekami DLL. Jeżeli wydanie nie ma binariów, wybierz wydanie, które zawiera paczkę x64. Adapter używa CLI zgodnego z v1.7.6.
3. **Wielojęzyczny model GGML**: https://huggingface.co/ggerganov/whisper.cpp/tree/main — `ggml-base.bin` (około 142 MiB), ewentualnie dokładniejszy i wolniejszy `ggml-small.bin` (około 466 MiB). Do szybkich prób `ggml-tiny.bin` (około 74 MiB). Nie wybieraj wariantu `.en.bin`, GGUF ani modeli innych implementacji.
4. W AutoNapisy kliknij **Ustawienia** i wskaż trzy pliki przyciskami **Wybierz**: FFmpeg, whisper-cli i model.

Aplikacja zapisuje ścieżki w `components.json` w katalogu konfiguracji użytkownika Tauri. Nie wyszukuje programów w PATH, nie pobiera nic automatycznie i nie uruchamia programów wskazanych w projekcie JSON. Sprawdza nazwę/pliki i nagłówek GGML; faktyczne uruchomienie sprawdzane jest przy transkrypcji. Korzystaj wyłącznie z zaufanych binariów.

## Obsługa

1. W menu **Projekt** wybierz import filmów lub audio (można zaznaczyć wiele plików). Import trafia tylko do biblioteki. Przycisk **+** przy pliku dodaje go na oś czasu. Pierwszy dodany film wyznacza format obrazu. Możesz też otworzyć projekt.
2. Kliknij **Transkrybuj po polsku**. FFmpeg przygotowuje mono PCM WAV 16 kHz wyłącznie z użytych fragmentów montażu, z uwzględnieniem cięć, kolejności, poziomów głośności i przejść. Puste przerwy oraz pliki pozostające w bibliotece są pomijane. Whisper rozpoznaje język polski na CPU, maksymalnie 8 wątków.
3. Przygotowanie i ładowanie modelu mają nieokreślony pasek. Procent pochodzi z Whisper i dotyczy tylko fazy rozpoznawania; nie jest szacowanym postępem całego zadania. Niektóre CLI nie podają procentu.
4. **Anuluj** zatrzymuje proces. Zamknięcie aplikacji też zatrzymuje zadanie, czeka na jego koniec i sprząta pliki tymczasowe.
5. Po sukcesie segmenty pojawiają się w lewym panelu i na podglądzie. Kliknij czas, aby przewinąć film. Pojedyncze kliknięcie napisu na osi zaznacza go; dwuklik lub Enter otwiera edycję po prawej. Uchwyty skracają czas wyświetlania bez cięcia filmu. Poprawki dotyczą wybranego wystąpienia; źródłowa transkrypcja pozostaje zachowana.
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
- `schemas/project-v1.schema.json`, `schemas/project-v2.schema.json` `schemas/project-v3.schema.json` oraz aktualny `schemas/project-v5.schema.json`: migracja v1/v2/v3/v4 → v5 zachowuje font, kolory, tekst i tworzy pełne ujęcie źródła. Czasy są w sekundach.

## Testy i instalator

```powershell
npm.cmd test
npm.cmd run build
npm.cmd audit
cargo test --manifest-path src-tauri/Cargo.toml
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

Workflow `.github/workflows/windows.yml` buduje Windows x64 i publikuje instalator jako artefakt. Instalator nie jest podpisany cyfrowo. Wynik lokalny: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`. Dołączone komponenty są wykrywane automatycznie; lokalny model wybierz w Ustawieniach.

Testy rdzenia bez bibliotek graficznych Linux: `cargo test --manifest-path .test-core/Cargo.toml`. Uruchamiają te same moduły Rust co aplikacja. Przykładowy JSON w testach jest wyłącznie fixture, nigdy wynikiem użytkownika. Opcjonalny test prawdziwych komponentów: ustaw zmienne `AUTONAPISY_FFMPEG`, `AUTONAPISY_WHISPER`, `AUTONAPISY_MODEL`, `AUTONAPISY_SAMPLE` (lokalny plik z mową) i uruchom `cargo test --manifest-path .test-core/Cargo.toml --test local_tools -- --ignored --nocapture`.

Etap 1 został sprawdzony na Windows przez użytkownika. Testy i smoke test rdzenia nie zastępują testu interfejsu oraz polskiego nagrania na docelowym Windows. Przed wydaniem sprawdź: mowę, ciszę, brak audio, brak modelu/DLL, Unicode, anulowanie w obu fazach, zamknięcie podczas zadania, zapis/otwarcie JSON, eksport SRT oraz 1366×768 i Full HD.

## Ograniczenia

Brak tłumaczenia, akceleracji Whisper na GPU, diarizacji i automatycznego pobierania modeli. Podgląd korzysta z MLT i strumienia H.264/AAC; po zmianach montażu może wymagać przygotowania nowego bufora. Długie nagrania potrzebują miejsca i czasu; nie ma wznawiania transkrypcji po zamknięciu. SRT nie zawiera stylizacji; eksport MP4 nanosi napisy. Pełny instalator zawiera FFmpeg, FFprobe, MLT i whisper.cpp, a model GGML użytkownik wybiera osobno.


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

Limity tej wersji: 3000 plansz, 8 MB na planszę, 512 MB plansz łącznie, maksymalnie 16 megapikseli i 8192 pikseli na bok, film do 24 godzin. Eksport działa na CPU i może potrwać. Nie zawiera wyboru wewnętrznych ścieżek wielokanałowego pliku ani eksportu HDR. Rozmiar uwzględnia obrót o wielokrotność 90° oraz proporcje pikseli, wynik ma parzyste wymiary i kwadratowe piksele.

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
`make diffutils curl mingw-w64-x86_64-gcc mingw-w64-x86_64-pkgconf mingw-w64-x86_64-nasm mingw-w64-x86_64-make mingw-w64-x86_64-cmake mingw-w64-x86_64-python`,
VS C++ z CMake, Node i Rust. Uruchom `powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1`.
Skrypt pobiera źródła i narzędzia do raportowania licencji wyłącznie podczas
budowania. Tak samo robi `.github/workflows/windows.yml`; sprawdza uruchomienie
FFmpeg/FFprobe/Whisper i rzeczywiste kodowanie H.264 przed utworzeniem instalatora.
Zwykłe `npm run tauri -- dev` i `npm run tauri -- build` pozostają wariantami
deweloperskimi bez wbudowanych narzędzi. Pierwsza pełna kompilacja trwa dłużej.

Workflow dodatkowo instaluje gotowy pakiet w katalogu ze spacją i polskimi znakami, sprawdza obecność źródeł i licencji oraz uruchamia narzędzia z zainstalowanego katalogu. whisper.cpp jest budowany ze statycznym runtime C++, aby nie wymagać osobnego instalowania Visual C++ Redistributable.


## Montaż — podstawowe narzędzia (od 0.6)

Importuj filmy i wycinaj z nich ujęcia. Oryginał pozostaje bez zmian.
- **Żyletka** (C): kliknij klip lub ustaw głowicę i wybierz **Przetnij tutaj**.
- **Zaznacz** (V): przeciągnij środek klipu, aby go przesunąć. Klipy wideo na tym samym pasie nie nakładają się. Przeniesienie fragmentu za inny zmienia kolejność.
- Przeciągnij boczny uchwyt, aby skrócić lub przywrócić fragment w granicach źródła i wolnego miejsca.
- **Magnes** przyciąga krawędzie do sąsiada (10 pikseli), uchwyty także do głowicy.
- **Usuń ujęcie** / Delete usuwa zaznaczony fragment i pozostawia przerwę. **Dosuń wszystkie** zamyka wszystkie przerwy w aktualnej kolejności. Gdy oś jest pusta, **Przywróć cały film** dodaje pełne źródło, zachowując oryginalną transkrypcję.
- **Cofnij/Ponów**: przyciski lub Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. Jedno przeciągnięcie jest jedną zmianą.
- Kliknij lub przeciągnij linijkę, aby przewinąć. Zoom i poziomy pasek przewijania pomagają przy dłuższych nagraniach. Pola pod osią umożliwiają dokładne ustawienie czasów w sekundach.

Podgląd przeskakuje między punktami wejścia i wyjścia ujęć. Przerwy są czarne
; dźwięk trwa, jeśli w tym miejscu leży osobne audio. Napisy z oryginalnymi czasami słów są przycinane i przesuwane
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
zachowaj kopię starszego JSON. W wersji 0.6: maksymalnie 100 ujęć, jedna ścieżka i jedno
nagranie źródłowe; brak przejść i nakładania. Nie dodano automatycznego proxy
HEVC — podgląd nadal wymaga kodeka obsługiwanego przez WebView2.

Rzeczywisty test eksportu: `AUTONAPISY_FFMPEG` wskazuje FFmpeg, następnie
`cargo test --manifest-path .test-core/Cargo.toml --test montage_export -- --ignored`.
Test sam generuje kolorowe nagranie, sprawdza kolejność i cięcia, czarne/ciche
przerwy, źródło bez audio, czas wyniku, ścieżki Unicode i niezmieniony oryginał.
Workflow Windows uruchamia go z dołączonym FFmpeg przed budową instalatora.

Opcjonalny test interfejsu: zainstaluj Playwright przez `npm install --prefix .tools/browser playwright@1.56.1`, następnie `.tools/browser/node_modules/.bin/playwright install chromium`. Uruchom `npm run dev` w osobnym terminalu, ustaw `AUTONAPISY_FFMPEG` na FFmpeg z enkoderami libvpx/libopus i wykonaj `node scripts/test-editor.mjs`. Test generuje własny WebM oraz kontrolowany projekt demonstracyjny; sprawdza cięcie, uchwyty, magnes, undo/redo, usuwanie, odtwarzanie przez cięcie i przerwę oraz układ 1366×768 / 1920×1080. Nie zastępuje ręcznego testu WebView2 na docelowym komputerze.

Wersja 0.6 poprawia też kompilację dołączonego FFmpeg: zawiera statycznie linkowaną zlib 1.3.2 potrzebną do odczytu i zapisu PNG. Licencja i źródła zlib są w instalatorze. Testy sprawdzają PNG → H.264, faktyczne nakładanie plansz i działanie po instalacji.


## Dwie ścieżki obrazu i dźwięku — 0.7

- **Importuj film** dodaje kolejne źródło, zachowując dotychczasowy montaż i napisy. Nowy klip trafia w pozycję głowicy na wolne V1 lub V2; gdy oba pasy są zajęte, na koniec V1.
- **V2 przykrywa V1** podczas nałożenia. Obraz jest dopasowany z zachowaniem proporcji i czarnymi pasami do rozmiaru pierwszego filmu. Bez przejść, przezroczystości i picture-in-picture.
- Filmy mają **połączony dźwięk** pokazany jako 🔗 na A1/A2. Żyletka, przesunięcie, przycięcie, usunięcie i cofnięcie dotyczą obu części. Nie dublujemy próbek: połączony pasek audio jest widokiem tego samego klipu.
- **Importuj audio** dodaje niezależne WAV, MP3, AAC/M4A, FLAC, OGG lub OPUS (podgląd zależy od kodeków WebView2). Można je przesuwać, ciąć i przycinać. Nie zmienia filmu.
- A1/A2 są dwoma pasami miksu: mogą zawierać jednocześnie połączony dźwięk filmu i osobne audio. Na każdym pasie połączony dźwięk jest w górnym wierszu, niezależny w dolnym. Wszystkie aktywne dźwięki sumują się; wybór górnego obrazu nie wycisza dolnego filmu.
- Zaznacz klip, ustaw **Głośność** 0–100% (0% wycisza). Przy głośnych nałożeniach zmniejsz poziomy. Eksport dodatkowo ogranicza szczyty limiterem, bez automatycznego wyrównywania głośności.
- Przeciągnij pionowo lub wybierz **Ścieżka** we właściwościach. Wideo nie może nakładać się na inne wideo na tym samym pasie; pomiędzy V1/V2 może. Niezależne audio może się nakładać i sumować.
- W panelu transkrypcji wybierz film źródłowy. Każdy film ma własne oryginalne segmenty. Napisy podążają za ujęciami, a podczas nałożenia dotyczą widocznego filmu; bez napisów w V2 napisy V1 są schowane.
- Zapis **v4** dodaje `assets` z lokalnymi ścieżkami i napisami oraz opcjonalne `assetId`, `track` (0/1), `kind` (video/audio), `volume` w klipach. Brak assetId oznacza główny film. Stare projekty v1–v3 są migrowane; starsza aplikacja nie otworzy v4, zachowaj kopię JSON.
- Nadal maksymalnie 100 klipów, 100 dodatkowych źródeł, 24 godziny i eksport 30 kl./s. Audio korzysta z pierwszego strumienia źródła; brak odłączania audio, crossfade i automatyki poziomu. Nie ma generatora proxy dla nieobsługiwanych kodeków.
- Projekty przechowują odwołania do nagrań. Przenosząc projekt na drugi komputer, zachowaj lokalizacje źródeł. Niedostępne źródła są raportowane. Eksport MP4 wymaga co najmniej jednego zaimportowanego filmu.

Testy 0.7: jednostkowe TypeScript i Rust; rzeczywisty FFmpeg sprawdza warstwy czerwony/niebieski, jednoczesne tony 440/880/1320 Hz, muzykę nad czarną przerwą, głośność, Unicode i niezmienność źródeł. Opcjonalny `scripts/test-editor.mjs` sprawdza import, cztery pasy, połączony montaż, niezależne audio, odtwarzanie i układ w 1366×768 oraz 1920×1080 (Playwright instalowany osobno do `.tools/browser`). Windows CI uruchamia test realnego miksu także z FFmpeg dołączonym do instalatora.


## RolVixa 0.11 — pliki, linia głośności i odtwarzanie

- Lewy panel otwiera się na zakładce **Pliki**. Pokazuje filmy i audio, czas trwania, pełną ścieżkę lokalną, dostępność oraz liczbę użyć. Wyszukiwarka filtruje nazwy i ścieżki. **+** na karcie dodaje istniejące źródło do montażu w pozycji głowicy; nie kopiuje nagrania. Usunięcie klipu z osi nie usuwa źródła z biblioteki. Ikona napisów przełącza na **Napisy** danego filmu.
- Narzędzia osi są ikonami z podpowiedziami i nazwami dla czytników ekranu. Skróty C, V, Ctrl+Z i Ctrl+Shift+Z nadal działają.
- Każdy pasek audio ma **linię głośności na całej długości fragmentu**. Chwyć ją i przesuń pionowo: w górę głośniej, w dół ciszej. Poziom 0–100% dotyczy całego klipu, zapisuje się w projekcie i jest stosowany przy eksporcie. Zmiana połączonego audio zmienia dźwięk jego filmu; osobne audio pozostaje niezależne.
- Podczas przeciągania słychać zmianę bez zatrzymania odtwarzania. Jedno przeciągnięcie to jedna operacja Cofnij. Anulowanie gestu przywraca poziom. Po zaznaczeniu linii ↑/↓ zmienia 1%, Shift 10%, Home wycisza, End ustawia 100%. Nadal jest też suwak we właściwościach. Linia jest regulacją poziomu całego fragmentu, bez punktów automatyki i bez wizualizacji przebiegu próbek.
- W wersji 0.11 odtwarzanie montażu korzysta z jednego strumienia MLT. Cięcia i zmiany źródła są składane przed przekazaniem obrazu i dźwięku do WebView2. Zasady buforowania opisuje sekcja „Silnik montażu MLT”.
- Nazwa programu, okna, pliku `rolvixa.exe`, instalatora `RolVixa_0.8.0_x64-setup.exe` i domyślnego folderu instalacji to **RolVixa**. Repozytorium GitHub nadal jest `ankelmarek/AutoNapisy`. Format projektu v4 pozostaje zgodny z 0.7, otwierane są także stare projekty v1–v3.
- Profil ustawień ma identyfikator `pl.rolvixa.desktop`. Jeśli nie ma jeszcze jego `components.json`, program odczyta poprzednie ustawienia z `pl.autonapisy.desktop` w katalogu konfiguracji użytkownika; nie usuwa ani nie nadpisuje starszych ustawień i nagrań. Własne narzędzia nadal mają pierwszeństwo, a niedostępne ścieżki FFmpeg/Whisper zastępują komponenty dołączone do instalatora. Poprzednia aplikacja może pozostać zainstalowana niezależnie.
- Ikona programu i instalatora oraz znak w nagłówku korzystają z kolorowego wariantu na ciemnym tle, przygotowanego na podstawie przesłanej planszy RolVixa. Zasób PNG jest w `src/assets/rolvixa-icon.png`, Windows ICO w `src-tauri/icons/icon.ico`; warianty rozmiarów tworzy CLI Tauri. Są to lokalne zasoby statyczne, bez usług sieciowych podczas pracy programu.

Weryfikacja podglądu: `scripts/test-studio.mjs` korzysta z tej samej lokalnej próby WebM wygenerowanej przez `scripts/test-editor.mjs` oraz Playwright. Sprawdza katalog plików, ikonowe narzędzia, przeciąganie linii, klawiaturę, cofanie, anulowanie i odsłuch w trakcie zmiany. Mierzy odtwarzanie przez ciągłe cięcie i zmianę pliku, bez pauzy dekodera na ciągłym cięciu i bez przewijania nowego źródła dopiero na łączeniu. Układ jest sprawdzany w 1366×700 oraz 1920×1080. Wyniki testu Chromium nie są gwarancją identycznych opóźnień WebView2 dla dowolnego kodeka i komputera.


## Edytor 0.9

Menu **Projekt** grupuje import, zapis, eksport i ustawienia. Biblioteka ma małe miniatury, a węższy podgląd zostawia miejsce na panele boczne. Panel **Film / audio** po prawej reguluje jasność, kontrast, nasycenie i głośność zaznaczonego fragmentu. Korekcje działają również w eksporcie MP4. Panel **Napisy** oferuje żółtą kartę, biały obrys oraz zielony i fioletowy marker; marker podświetla cały napis, nie pojedyncze wypowiadane słowa.

Na audio pojawia się rzeczywisty przebieg amplitudy, obliczany lokalnie przez FFmpeg. Linię głośności przeciąga się pionowo. Analiza jest wykonywana kolejno i nie zmienia źródłowych nagrań. Brak obsługi kodeka lub FFmpeg może uniemożliwić narysowanie przebiegu.

W zakładce **Efekty** ustaw długość i przeciągnij przejście w lewo, w prawo lub przez czerń na połączenie dwóch sąsiadujących filmów na tym samym pasie. Można też wybrać efekt i kliknąć połączenie. Przejście zużywa początek drugiego klipu i łączy go z końcem pierwszego: montaż skraca się o długość efektu. Następne klipy na tym pasie przesuwają się, inne pasy pozostają na swoich pozycjach. Dźwięk filmów jest płynnie mieszany. Kliknięcie istniejącego przejścia otwiera jego typ, długość i usuwanie po prawej. Przesunięcie lub przycięcie klipu naruszające połączenie usuwa efekt; nie przywraca automatycznie zużytego początku. Jawne usunięcie przejścia przywraca ten fragment. Nie ma jeszcze efektów między różnymi poziomami ani animowanych parametrów.

Skróty: **Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y** cofnij / ponów, **Ctrl+C / V / X / D** kopiuj / wklej przy głowicy / wytnij / duplikuj klip, **Delete** usuń klip lub ukryj napis, **Spacja** odtwarzaj / pauza. Podczas pisania Spacja wpisuje odstęp; **Ctrl+Spacja** steruje odtwarzaniem także w polu tekstowym. **Ctrl+S / O / N / I** zapis / otwórz / nowy / import filmów, **Ctrl+Shift+I** import audio. **Alt + przeciągnięcie myszą** lub środkowy przycisk przesuwa widok osi bez zmiany głowicy. Strzałki przewijają o klatkę, z Shift o sekundę; Home/End przenosi na początek/koniec.

Test interfejsu: `node scripts/test-editor9.mjs` przy uruchomionym Vite i lokalnie zainstalowanym Playwright/Chromium w `.tools`. Używa wygenerowanych filmów testowych i kontrolowanego mocka IPC; nie zastępuje próby w Windows WebView2. Testy rzeczywistego FFmpeg: `cargo test --manifest-path .test-core/Cargo.toml --test montage_export -- --ignored --nocapture` (ustaw `AUTONAPISY_FFMPEG` na pełną ścieżkę do FFmpeg). Obejmują montaż, miks, przejścia, korekcję i przebieg audio.


## Zmiany 0.10

- Transkrypcja obejmuje montaż, zamiast całego wybranego źródła. Używa pierwszej ścieżki audio każdego użytego pliku i miksuje słyszalne fragmenty, również samodzielne audio. Pliki z biblioteki poza osią nie są otwierane przez rozpoznawanie. Puste przerwy nie trafiają do Whispera; mapa czasów przywraca ich pozycje w wyniku. Nie jest to wykrywanie i wycinanie ciszy wewnątrz klipu. Zmniejszenie głośności do zera wyklucza fragment z rozpoznania.
- Napisy montażu mają własne czasy osi w `timelineSegments`; nie są ograniczane długością pierwszego filmu. Naprawiono odrzucanie poprawnej transkrypcji przy istniejących przejściach. Nowy wynik podmienia napisy dopiero po sukcesie. Napisy źródłowe pozostają w projekcie. Po zmianie kolejności montażu napisy z osi pozostają na dotychczasowych pozycjach; ponowna transkrypcja dopasuje je do nowego montażu.
- 20 przejść z filtra **FFmpeg xfade**. Galeria: przenikanie, czerń, biel, przesunięcia i kurtyny w czterech kierunkach, rozmycie, pikselizacja, koło, prostokąt, romb, rozpuszczanie, zoom, przekątna i żaluzja. Przeciągnij kartę na połączenie sąsiadujących klipów tego samego pasa. Pasek obejmuje oba filmy i pokazuje długość. Stare left/right/black są migrowane na odpowiedniki xfade. Efekt nadal zużywa początek drugiego filmu i skraca montaż o swoją długość; inne pasy nie przesuwają się automatycznie.
- Podgląd przejścia jest wynikiem FFmpeg, z tym samym xfade i korekcją obrazu co eksport. Krótki MP4 jest buforowany do końca sesji, w rozdzielczości do 540 px, i umieszczany na właściwej warstwie grafu MLT. Dźwięk miksuje MLT. Pierwsze przygotowanie wymaga chwili. Eksport zachowuje rozdzielczość projektu.
- Film lub audio można przeciągnąć z biblioteki na wybrany pas i pozycję osi. Przy zajętym miejscu klip trafia do najbliższego wolnego miejsca. Napisy są nad pasami obrazu. Usunięto podtytuł marki i zbędne komunikaty o przechowywaniu plików.
- Schemat v6: `schemas/project-v6.schema.json`. Zachowaj kopię JSON przed zapisaniem, jeśli potrzebujesz wracać do starszej aplikacji.

Regresje obejmują rzeczywisty eksport i podgląd wszystkich 20 efektów, przygotowanie skróconego audio z pominięciem nieużytego źródła i pustych przerw, prawdziwy Whisper na krótkim próbku testowym, zachowanie przejść przy zapisie rozpoznania i przeciąganie mediów w interfejsie.


## Silnik montażu MLT — 0.11

MLT 7.42.0 jest dołączany do instalatora. Rust generuje kontrolowany opis XML z walidowanego projektu JSON; frontend nie przekazuje XML, nazw usług ani argumentów systemowych. MLT składa warstwy obrazu, cięcia, przerwy, połączony dźwięk i samodzielne audio. Ten sam graf jest używany do podglądu, montażu MP4 i miksu do Whispera. Napisy nadal zachowują dotychczasowy wygląd i są nanoszone w końcowym etapie eksportu FFmpeg. 20 przejść xfade pozostaje obsługiwanych przez krótkie klipy efektów przygotowane w FFmpeg i umieszczone na odpowiedniej warstwie MLT.

Podgląd jest jednym strumieniem H.264/AAC z MLT, odbieranym przez kontrolowane IPC i MediaSource WebView2. Po zmianie montażu lub przewinięciu poza bufor podgląd wymaga krótkiego przygotowania. Rozdzielczość robocza wynosi maksymalnie 540 px na dłuższym boku; eksport zachowuje rozdzielczość projektu. Bufor sesji ma limit 512 MB; przewinięcie rozpoczyna nowy bufor. Klipy i miks pracują w bazie 30 klatek/s. Głośność po przeciągnięciu linii aktualizuje się po zatwierdzeniu gestu i przebudowie podglądu. Do pełnego MLT w instalatorze dołączone są źródła, receptura budowania i licencje.

Napisy: **klik** zaznacza bez otwierania edycji, **Delete** ukrywa zaznaczony napis, **dwuklik / Enter** otwiera edycję po prawej. **Ctrl+Z** cofa usunięcie. Importowane filmy i efekty można przeciągać z galerii na oś. Wyłączono natywne Tauri drag-and-drop, które na Windows przechwytuje zdarzenia HTML5. Windows CI sprawdza przeciąganie w WebView2 przez CDP, używając osobno skompilowanego programu testowego z włączonymi DevTools i zasobami z instalacji; fixture IPC zastępuje dialogi na czas testu. Instalator użytkownika zachowuje wyłączone DevTools. Błąd automatyzacji UI nie usuwa artefaktu poprawnie zbudowanego i przetestowanego instalatora, ale pozostawia workflow ze statusem błędu. Osobne testy Rust sprawdzają rzeczywisty MLT, kodeki, warstwy, audio, cięcia, przejścia, korekcję i Unicode.

Ze źródeł: pełne komponenty buduje `scripts/prepare-bundle.ps1`; MLT można zbudować oddzielnie w MSYS2 MINGW64 przez `scripts/build-bundled-mlt.sh`. W trybie deweloperskim `ROLVIXA_MLT` może wskazywać lokalny `melt`/`melt.exe`. W wydaniu instalacyjnym używany jest wyłącznie silnik z zasobów aplikacji. Dla testów: `ROLVIXA_MLT=/ścieżka/melt AUTONAPISY_FFMPEG=/ścieżka/ffmpeg cargo test --manifest-path .test-core/Cargo.toml --test mlt_engine -- --ignored --nocapture`. Projekt zapisuje format v8.


## Poprawka 0.11.1 — podgląd Windows i sterowanie ścieżkami

- Poprawiono przekazywanie kanonicznych ścieżek Windows z prefiksem `\\?\` do MLT. Ten prefiks w połączeniu ze ścieżkami pomocniczymi silnika powodował błąd odczytu plików MLT i czarny podgląd. Uprawnienia nadal sprawdzane są na ścieżkach kanonicznych; przekształcenie dotyczy granicy adaptera MLT.
- Stałe nagłówki **T, V2, V1, A1, A2** pozostają po lewej podczas przewijania osi. Głośnik V1/V2 wycisza dźwięk filmów na tej ścieżce; głośnik A1/A2 wycisza wszystkie fragmenty dźwięku w tym wierszu, również połączone z obrazem. Oczko V1/V2 ukrywa obraz, zachowując dźwięk. Oczko T wyłącza napisy w podglądzie i eksporcie bez usuwania danych.
- Ustawienia ścieżek mają historię Ctrl+Z/Ctrl+Shift+Z i zapisują się w projekcie **v7** (`schemas/project-v7.schema.json`). Otwierane są wersje v1–v6; przed nadpisaniem starszego projektu zachowaj kopię, jeśli potrzebujesz wrócić do starszej aplikacji.
- Błędy podglądu są widoczne również bezpośrednio nad filmem, z przyciskiem **Ponów podgląd**. Błąd odczytu bufora lub dekodowania WebView2 nie pozostawia pustego obrazu bez komunikatu.
- `scripts/test-native-preview.mjs` sprawdza zainstalowaną aplikację Windows bez zastępowania IPC podglądu: otwarcie projektu, rzeczywisty MLT, odczyt rosnącego MP4, dekodowane piksele, odtwarzanie, pauzę, przewinięcie i oczko. Jedynie wybór pliku projektu jest zastępowany stałą fixture w oddzielnym programie testowym (`ui-tests`); instalator użytkownika nie zawiera tej funkcji. Dotychczasowy `test-editor9.mjs` pozostaje testem interakcji UI z zastępczymi danymi IPC.


## RolVixa 0.12 — kadr, warstwy i biblioteka audio

- Nad podglądem wybierz format: źródło, rolka 9:16, poziom 16:9 lub kwadrat. Format ustala również rozmiar MP4. Przy źródle zachowana jest rozdzielczość głównego filmu.
- Zatrzymaj odtwarzanie i zaznacz film w podglądzie lub panelu „Warstwy”. Przeciągaj obraz, aby przesuwać kadr; uchwyty narożników zmieniają skalę. Shift ogranicza przesuwanie do jednej osi. Panel „Kadr warstwy” udostępnia skalę 10–400%, położenie X/Y, Dopasuj, Wypełnij i Wyśrodkuj. Każdy klip ma niezależny kadr, zapisywany w projekcie i zachowywany po cięciu. Ctrl+Z cofa zatwierdzony gest. Podczas przejścia zatrzymaj głowicę poza efektem, aby kadrować pojedynczy film.
- Podczas edycji zatrzymanego obrazu pokazywane są rzeczywiste klatki warstw wyodrębnione przez FFmpeg. Odtwarzanie i eksport składa MLT z adapterem affine; przejścia FFmpeg otrzymują te same parametry kadru. Podgląd roboczy pozostaje ograniczony do 540 px.
- Panel „Warstwy” pokazuje napisy T i klipy V1/V2 z wyborem i widocznością ścieżki. Sekcja dodawania tekstu, grafiki, naklejek i animacji jest przygotowanym interfejsem; te typy warstw nie są jeszcze implementowane.
- Zakładka Audio → Dźwięki zawiera **100 efektów Kenney Interface Sounds** dołączonych do instalatora. Wyszukuj po polskiej nazwie, odsłuchuj, dodawaj przyciskiem + w pozycji głowicy lub przeciągaj na A1/A2. Odsłuch zatrzymuje główne odtwarzanie i odwrotnie. Efekty są na CC0 1.0; dane autora i licencji są dostępne przy każdym pliku. Źródło: https://kenney.nl/assets/interface-sounds . Instalator zawiera oryginalną paczkę, licencję i recepturę konwersji WAV (`scripts/prepare-audio.py`, archiwum weryfikowane SHA-256).
- Audio → Muzyka: wpisz frazę i kliknij Szukaj. Openverse udostępnia utwory na różnych licencjach; domyślnie filtrujemy utwory dopuszczające komercyjne wykorzystanie i modyfikacje. Przeczytaj warunki wybranego nagrania, pobierz je do projektu, a następnie odsłuchaj lub dodaj na A1/A2. Autor, licencja, adres źródła i informacja o autorstwie zapisują się z plikiem i w projekcie. Pobieranie ma limit 100 MB; odsłuch trwa do 30 sekund. Usługa zewnętrzna może zwrócić limit 429, blokadę 403 lub niedostępny plik; aplikacja pokazuje błąd i pozwala nadal używać dźwięków wbudowanych i własnych.
- Audio → Moje audio: import wielu plików do biblioteki, bez automatycznego dodawania na oś. Dotychczasowy import audio nadal działa.
- Schemat projektu v8: `schemas/project-v8.schema.json`. Nowe pola: `canvas`, `clips[].transform` (skala oraz położenie liczone względem rozmiaru kadru), `assets[].provenance`. Migracja v1–v7 zachowuje montaż, napisy i ustawienia ścieżek. Zapisz kopię starszego projektu przed nadpisaniem.

Połączenia sieciowe biblioteki wykonuje wyłącznie Rust przez kontrolowane komendy. Wyszukiwanie wysyła frazę i filtry do `https://api.openverse.org/v1/audio/`; pobranie wykonuje żądanie HTTPS do dostawcy wybranego utworu. Nie wysyłamy filmów, ścieżek lokalnych ani projektów. Frontend nadal nie ma dostępu do dowolnych komend ani sieci. Wbudowany FFmpeg zachowuje wyłączoną obsługę sieci. Kenney i własne audio nie wymagają internetu.

Test kadrowania rzeczywistymi silnikami: `ROLVIXA_MLT=/ścieżka/melt AUTONAPISY_FFMPEG=/ścieżka/ffmpeg cargo test --manifest-path .test-core/Cargo.toml --test framing -- --ignored --nocapture`. Test sprawdza rozmiar pionowego MP4, dopasowanie, powiększenie, przesunięcie i kolory po przejściu.


## RolVixa 0.13 — odsłuch przed importem i czytelniejsze audio

- Wyniki Openverse mają przycisk odsłuchu. Odsłuch nie dodaje pliku do biblioteki ani klipu do montażu; osobne „Pobierz do projektu” importuje pełny utwór z licencją i autorem.
- Odtwarzacz odsłuchu pokazuje pozycję, pauzę/wznowienie i głośność. Jego głośność nie zmienia ustawień klipów. Zmiana zakładki, zamknięcie biblioteki lub start filmu zatrzymują odsłuch. Ładowanie można anulować albo wybrać inny utwór; spóźniona odpowiedź nie rozpoczyna poprzedniego odsłuchu.
- Rust pobiera do 4 MiB początku nagrania i tworzy maksymalnie 30-sekundowy stereo WAV w tymczasowym cache sesji (do ośmiu gotowych podglądów). Dane są pobierane również wtedy, gdy serwer ignoruje HTTP Range, ale limit odczytu nadal obowiązuje. Cache odsłuchu nie jest biblioteką projektu i jest usuwany przy prawidłowym zamknięciu aplikacji; po awarii może pozostać w systemowym TEMP. Niektóre formaty lub serwery wymagają pełnego pliku; wówczas dostępne pozostaje zwykłe pobranie do projektu. Nie jest to jeszcze proxy wideo.
- Dźwięki Kenney można filtrować kategorią i frazą. Przebieg audio na osi wypełnia wysokość klipu: skala rysunku jest normalizowana względem maksimum nagrania, pauzy i proporcje sygnału są zachowane. Nie zmienia to głośności materiału.
- Cały zestaw ikon interfejsu pochodzi z Tabler Icons v3.35.0 (MIT). Statyczny podzbiór jest dołączony do aplikacji; ikony nie wymagają internetu. Licencja: `licenses/Tabler-Icons-MIT.txt`.
- Format projektu pozostaje v8, zgodny z 0.12. Kolejny priorytet z ROADMAP.md: proxy wideo; SmartCut jest planowany oddzielnie.

Test ograniczonego wejścia i rzeczywistego odsłuchu: `AUTONAPISY_FFMPEG=/ścieżka/ffmpeg cargo test --manifest-path .test-core/Cargo.toml --test remote_audio -- --ignored --nocapture`. Windows CI sprawdza także podgląd utworu Openverse przed importem, pozycję, głośność i niezmienność projektu oraz oddzielne pobranie i zapis autorstwa.

## RolVixa 0.14 — proxy, biblioteka i strefy bezpieczne

Pełny instalator Windows zawiera wszystkie silniki; model Whisper nadal wybierasz osobno. Format projektu pozostaje v8. Zachowaj oryginalne nagrania: cache proxy nie jest kopią zapasową materiałów.

### Jak korzystać z proxy

1. Importuj filmy do zakładki **Pliki**. Import nadal nie dodaje ich na oś. Biblioteka pokazuje responsywną siatkę miniaturek, nazwy i czas trwania. Zielony okrąg z białym znakiem zaznacza źródło użyte w montażu; zmienia się po usunięciu lub cofnięciu.
2. Program odczytuje FFprobe: kontener, kodek/profil, orientację, rozdzielczość, FPS, ścieżki audio i informacje kolorystyczne. Różnica nominalnego i średniego FPS jest wskazówką możliwego VFR, a nie pełną analizą zmienności klatek.
3. Dla wymagającego materiału SDR (np. HEVC, ponad Full HD, ponad 40 FPS lub możliwy VFR) automatycznie przygotowuje proxy. Pod miniaturą widać kolejkę, rzeczywisty postęp, gotowość lub błąd. Pozostałe klipy można montować podczas przygotowywania.
4. Rozwiń status pod miniaturą. Możesz ręcznie przygotować **540p lub 720p**, anulować zadanie i przełączyć między oryginałem a gotową kopią. Podana rozdzielczość dotyczy dłuższego boku; proporcje są zachowane, małe nagrania nie są powiększane.
5. Proxy to H.264/AAC, stereo, pierwsza ścieżka audio i 30 kl./s. MLT oraz miniatury mogą korzystać z kopii; **eksport MP4 i transkrypcja zawsze korzystają z oryginałów**. Dotychczasowy montaż i eksport również pracują w 30 kl./s. Ścieżki cache nie są zapisywane w projekcie JSON.
6. Koło zębate nad siatką pokazuje zajętość cache i umożliwia jego wyczyszczenie po potwierdzeniu. Anuluj trwające zadania; czyszczenie nie usuwa oryginałów. Aktywny odczyt chroni używane pliki przed usunięciem.

Cache jest w systemowym katalogu cache RolVixa, w podfolderze `video-proxy-v1`. Powiązanie kopii ze źródłem obejmuje kanoniczną ścieżkę, rozmiar, datę modyfikacji, próbki początku/końca oraz wersję profilu. Gotowe kopie są używane także po ponownym otwarciu projektu. Zmiana lub brak źródła/proxy unieważnia odwołanie; brak oryginału blokuje prawidłowy podgląd/eksport zamiast niejawnego eksportu z kopii.

Limit cache wynosi **8 GiB**, pojedynczej kopii **4 GiB**; generator kontroluje limit podczas zapisu i dostępne miejsce na dysku. Jeden film jest przetwarzany naraz, z ograniczeniem wątków FFmpeg. Nie usuwamy automatycznie kopii innych projektów. Po awarii mogą pozostać nieukończone pliki, które usuwa czyszczenie cache. Cache ma jednego właściciela procesu; druga instancja może pracować na oryginałach.

**Ograniczenie HDR:** profil 0.14 obsługuje SDR. Przy wykryciu PQ/HLG program pokazuje informację i pozostawia oryginał; konwersja HDR→SDR z kontrolą barw jest osobnym etapem. Nie gwarantujemy obsługi każdego pliku na podstawie rozszerzenia.

### Strefy i poprawki interfejsu

- W pasku podglądu wybierz format **9:16 · Rolka**, następnie **Strefy** i preset Reels, TikTok lub Shorts. Marginesy można zmieniać w procentach i wyłączyć nakładkę. To przybliżona pomoc wobec zmiennego interfejsu platform.
- Strefy nie przechwytują przeciągania filmu i **nie trafiają do eksportu ani projektu**. Nie są automatyczną kontrolą położenia napisów.
- Lista Openverse pokazuje wyraźny czas **całego utworu**, również w odtwarzaczu próbki. Czas próbki nadal wynosi do 30 sekund. Gdy serwis nie poda długości, aplikacja jej nie zgaduje.
- Okno ustawień jest ponad podglądem i przejściami. Klawiatura pozostaje w oknie, Escape je zamyka.
- SmartCut, automatyka głośności, fade i nowy nagłówek nie należą do tej paczki. Najbliższy kolejny priorytet: nagłówek i Zapisz/Zapisz jako z issue #2.

Nowe pliki implementacji: `src/useVideoProxies.ts`, `src/SafeZones.tsx`, `src-tauri/src/proxy.rs`, `src-tauri/src/proxy_commands.rs`. Testy: `tests/media14.test.ts`, `.test-core/tests/proxy_video.rs`, syntetyczne próbki HEVC/VP9 w `.test-core/fixtures`.

### Weryfikacja 0.14

```powershell
npm.cmd test
npm.cmd run build
cargo test --locked --manifest-path src-tauri/Cargo.toml
# Po ustawieniu AUTONAPISY_FFMPEG i ROLVIXA_MLT:
cargo test --locked --manifest-path .test-core/Cargo.toml --test proxy_video -- --ignored --nocapture
```

Testy z prawdziwymi FFmpeg/MLT obejmują obrót, 60 FPS, synchronizację dźwięku, przycięcie, ponowne odczytanie cache i eksport w rozdzielczości oryginału po usunięciu proxy; dodatkowo HEVC/MOV, VP9/WebM, VFR, 4K i brak audio. Syntetyczne próbki są wyłącznie fixtures testowymi, bez nagrań użytkowników. Windows CI sprawdza rzeczywistą instalację, tworzenie i przełączanie proxy w MLT oraz WebView2: siatkę, znaczniki użycia, nakładkę bez zmiany JSON, czas całej muzyki i okno ustawień. Widoki testowe: 1366×700 i 1920×1080.


## RolVixa 0.15 — nagłówek i zapis projektu

- Menu **Projekt** znajduje się obok logo. Tytuł projektu jest tekstem z ołówkiem; kliknij, aby zmienić nazwę. Enter lub wyjście z pola zatwierdza, Esc anuluje. Nazwa musi mieć 1–200 znaków; nadmiarowe odstępy są usuwane. Zmiana tytułu nie zmienia nazwy pliku na dysku.
- Prawa belka zawsze pokazuje ikonę zapisu oraz większą żółtą ikonę eksportu MP4. Eksport wymaga materiału na osi czasu. Obie akcje mają podpowiedzi i etykiety dla czytników ekranu.
- **Ctrl+S / Zapisz:** pierwszy zapis otwiera dialog z nazwą opartą na tytule; kolejne aktualizują ten sam plik bez dialogu. Otwarty projekt zapamiętuje własny plik.
- **Ctrl+Shift+S / Zapisz jako…:** wybiera nową lokalizację. Po sukcesie kolejne zapisy trafiają do niej. Anulowanie lub błąd zachowuje poprzednią lokalizację i stan zmian.
- Kolory zapisu: **zielony** — zapisano bieżącą wersję, **żółty** — projekt nowy lub zmieniony, **niebieski** — trwa zapis, **czerwony** — błąd. Tooltip i komunikat opisują stan także tekstowo. Zmiany wykonane w czasie zapisywania pozostają niezapisane; cofnięcie do zapisanej wersji przywraca zielony stan.
- Backend pamięta ścieżkę zatwierdzoną przez natywny dialog; frontend przekazuje wyłącznie projekt i identyfikator sesji. Zapis jest walidowany i atomowy, przez plik tymczasowy w tym samym katalogu. Błąd dostępu lub konflikt z zewnętrzną modyfikacją nie przełącza aktywnego pliku. Przy konflikcie wybierz **Zapisz jako…** i inną nazwę, aby zachować kopię, albo ponownie otwórz aktualny plik.
- Kontrola konfliktów porównuje zawartość i datę modyfikacji przed zapisem i bezpośrednio przed podmianą. Nie jest to blokada innych programów: nie należy równocześnie zapisywać tego samego JSON w dwóch aplikacjach. Zapis asynchroniczny nie blokuje edycji; Nowy/Otwórz są na ten czas niedostępne.
- Schemat projektu pozostaje v8, z migracją v1–v7. Ścieżka aktywnego projektu i stan zapisu są stanem sesji, poza JSON montażu. Eksport nadal korzysta z dotychczasowego mechanizmu MP4; Export Studio nie jest częścią 0.15.

Testy 0.15: jednostkowe scenariusze rewizji/anulowania/błędów/sesji i atomowego zapisu Unicode, testy nagłówka w WebView2 (1366×700, 1920×1080 oraz belka przy 600 px), rzeczywisty zapis Windows, konflikt pliku, zapis kopii i przełączenie aktywnego celu. Wynik kompilacji Windows oraz instalator są w GitHub Actions dla tej zmiany.


Weryfikacja wydania 0.15: [pełny przebieg Windows x64](https://github.com/ankelmarek/AutoNapisy/actions/runs/39066339364) zakończony sukcesem: **106 testów TypeScript, 50 testów Rust oraz 8 testów integracyjnych FFmpeg/MLT/proxy/audio**, kompilacja NSIS, rzeczywista instalacja i testy WebView2. Testy potwierdziły także poprawkę Ctrl+O po zapisie. [Pobierz ZIP instalatora](https://github.com/ankelmarek/AutoNapisy/actions/runs/39066339364/artifacts/12113219339), rozpakuj i uruchom `RolVixa_0.15.0_x64-setup.exe`. Paczka zawiera standardową wersję aplikacji bez narzędzi deweloperskich.

Nowe pliki 0.15: `src/ProjectTitle.tsx`, `src/projectSaving.ts`, `src-tauri/src/project_file.rs`, `src-tauri/src/project_commands.rs`, `tests/projectSaving.test.ts`. Zmieniono również nagłówek App, menu, adapter IPC, style, oficjalny podzbiór Tabler Icons, testy WebView2 i metadane wersji. Uruchamianie deweloperskie pozostaje bez zmian: `npm ci`, `npm test`, `npm run tauri -- dev`; pakiet Windows: `./scripts/build-windows.ps1`.


## RolVixa 0.16 — fade i punkty głośności

Na dźwięku filmu oraz niezależnym audio A1/A2 znajdują się dwa okrągłe uchwyty: lewy ustawia **fade in**, prawy **fade out**. Przeciągnij je poziomo, aby ustawić długość; Home lub Delete zeruje zaznaczony fade. Strzałki zmieniają czas o klatkę (Shift: 0,1 s). Fade używa łagodnej krzywej smoothstep; nachodzące fade mnożą się.

**Alt+klik na krzywej głośności** dodaje romb w miejscu kliknięcia. Samo dodanie nie zmienia dźwięku. Przesuwaj punkt w poziomie (czas) i pionie (poziom); sąsiednich punktów nie można przekroczyć. Strzałki na zaznaczonym punkcie zmieniają czas/poziom, Delete lub menu pod prawym przyciskiem usuwa punkt. Limit: 64 punkty na klip. Alt+przeciąganie pustego obszaru nadal przesuwa widok osi.

Panel **Film / audio** udostępnia dokładne czasy fade oraz listę punktów (czas w klipie i poziom). Enter lub wyjście z pola zatwierdza, Esc anuluje. „Reset fade i punktów” zachowuje bazową głośność klipu. Zwykłe przeciąganie krzywej góra–dół reguluje bazową głośność całego fragmentu.

Przebieg źródłowego dźwięku zachowuje skalę widoku; na nim znajduje się rzeczywista obwiednia `głośność klipu × liniowa automatyka × fade in × fade out`. Procent punktu jest mnożnikiem bazowej głośności; panel i tooltip pokazują też wynik. Mute ścieżek i istniejące przejścia pozostają dodatkowymi czynnikami miksu.

Podczas gestu odtwarzanie jest zatrzymywane; krzywa aktualizuje się bez renderowania MLT przy każdym ruchu. Po puszczeniu uchwytu odsłuch uwzględnia wynik, a cały gest stanowi jeden krok Undo. Escape lub anulowanie wskaźnika odrzuca gest. Kopiowanie, przesuwanie, podział i ponowne otwieranie zachowują ustawienia.

**Przycinanie i podział zachowują źródłowe czasy punktów i fade**, także poza aktualnie widocznym fragmentem. Pozwala to ponownie odsłonić wcześniejszy zakres bez utraty ustawień i nie dodaje nowych wyciszeń na cięciu. Przestawienie uchwytu lub wpisanie czasu fade zakotwicza ten fade na bieżącym brzegu klipu. Przy bardzo krótkich klipach korzystaj z powiększenia osi lub pól liczbowych.

Schemat **v9**: opcjonalne `clips[].audio`, tablica `points` (`id`, `time` w sekundach źródła, `gain` 0–1), `fadeIn`/`fadeOut` (`anchor` w sekundach źródła, `duration`). Starsze projekty v1–v8 otwierają się bez zmiany dotychczasowego brzmienia; nowy zapis ma format v9, którego starsze wersje aplikacji nie odczytają. Zachowaj kopię przed nadpisaniem. Definicja: `schemas/project-v9.schema.json`.

Podgląd MLT, eksport MP4 i transkrypcja korzystają z tej samej obwiedni. MLT używa natywnego filtra volume i adaptacyjnie przeliczonych kluczy dB z dokładnością czasową osi 30 FPS; FFmpeg otrzymuje kontrolowane wyrażenia z tego samego modelu. Nie ma odsłuchu zmian w trakcie przeciągania. Ta wersja nie dodaje automatycznego wykrywania pauz ani SmartCut.


Nowe pliki 0.16: `src/audioEnvelope.ts`, `src/AudioAutomation.tsx`, `src/AudioProperties.tsx`, `src-tauri/src/audio_envelope.rs`, `schemas/project-v9.schema.json`, `tests/audioEnvelope.test.ts`, `.test-core/tests/audio_envelope.rs`. Zmieniono także model/migracje, oś czasu, panel właściwości, MLT/FFmpeg i testy Windows. Uruchamianie deweloperskie: `npm ci`, `npm test`, `npm run tauri -- dev`. Budowa instalatora z komponentami: `./scripts/build-windows.ps1` w Windows PowerShell.

Weryfikacja 0.16: [pełny przebieg Windows x64 39069356974](https://github.com/ankelmarek/AutoNapisy/actions/runs/39069356974) zakończony sukcesem: **115 testów TypeScript, 54 Rust, 10 integracyjnych FFmpeg/MLT/audio/proxy**, produkcyjny instalator NSIS, rzeczywista instalacja i WebView2. UI sprawdzono przy 1366×700 oraz 1920×1080: Alt+klik, przeciąganie punktów/fade bez renderowania każdego ruchu, Escape, Delete/menu, klawiatura, pola liczbowe, kopia, Undo/Redo, zapis/otwarcie i audio połączone z filmem. Rzeczywiste testy audio mierzą RMS dla fade, liniowej automatyki, miksu i mute, po seek/split oraz w MP4 i wejściu do transkrypcji. Testy neutralnych ścieżek porównują ten sam format/kanały, aby oddzielić zmianę wzmocnienia od downmixu i strat AAC.
