# RolVixa 0.32 — polska mowa → polskie napisy

**Instalator 0.32:** [pobierz ZIP Windows x64](https://github.com/ankelmarek/AutoNapisy/actions/runs/39291594851/artifacts/12206647480), rozpakuj i uruchom `RolVixa_0.32.0_x64-setup.exe`. Pobranie z Actions wymaga zalogowania na GitHub.

## Wersja 0.32 — Export Studio 0.2

W Export Studio wybierz **Porównaj jakość A/B…**, zakres 3–5 s i **Przygotuj próbki A/B**. Krótszy montaż można porównać w całości. Powstają 2–3 rzeczywiście zakodowane MP4 w wybranej rozdzielczości, z tym samym kadrem, korekcją, napisami i pełnym miksem. Jeden odtwarzacz przełącza warianty z zachowaniem pozycji, ma pętlę i standardowe kontrolki. **Użyj ustawień wybranego wariantu** przenosi ustawienia do eksportu; montaż pozostaje niezmieniony. Zakresy i porównania są sesyjne, poza JSON/Undo.

Próbki pokazują zmierzony rozmiar, czas składania i kodowania. Szacunki całego filmu wynikają z jednej próbki i mają szeroki zakres: ruch, szczegóły innych scen, przygotowanie przejść oraz obciążenie komputera mogą je znacznie zmienić. To nie prognoza gwarantowana. Bez przygotowanej próbki pozostaje oznaczona heurystyka CRF.

**Tryb jakości → Maksymalny rozmiar MP4**: podaj 0,25–32000 dziesiętnych MB (1 MB = 1 000 000 B). Budżet uwzględnia AAC i rezerwę kontenera; zbyt mały limit blokuje zadanie, niski bitrate daje ostrzeżenie. Obraz jest kodowany w dwóch przebiegach x264, bez zmiany źródeł. Gotowy MP4 jest sprawdzany: przy przekroczeniu limitu podejmowana jest jedna ponowna próba z niższym bitrate, a kolejna porażka kończy zadanie bez publikacji wyniku. Limit obejmuje wyłącznie MP4; osobny SRT nie wchodzi do budżetu. Tryb oznacza maksymalny rozmiar, a nie konieczność wykorzystania całego limitu. CRF pozostaje osobnym trybem.

Próbka limitu MB używa bitrate'u obliczonego z długości **całego montażu**; nie zużywa całego budżetu na kilka sekund. Warianty CRF i limitu korzystają z jednego enkodera finalnego. Czasy źródeł/obwiedni, master gain, napisy i 30 FPS pozostają zgodne. Projekty nadal v14. Rejestr własnych profili zapisuje wersję 2, odczytuje także wersję 1 (bez limitu); aktualizacja następuje dopiero przy zapisie profilu. Nowsze/nieczytelne rejestry nadal wymagają jawnego odrzucenia.

Porównanie można anulować; zamknięcie okna kończy proces i usuwa jego pliki tymczasowe. Do podglądu autoryzowane są wyłącznie gotowe pliki wygenerowanej sesji. Stare lub anulowane żądanie nie może opublikować spóźnionego wyniku. Bieżąca sesja: do trzech MP4 po 128 MiB, kompozycja próbki do 2 GiB, plansze do dotychczasowych 512 MiB. Statystyki dwóch przebiegów mają limity 128/256 MiB. Wymuszone zabicie aplikacji może pozostawić tempy. Brak nowych kodeków, GPU, 50/60 FPS i automatycznej oceny jakości.

**Pełny zielony [Windows run 39291594851](https://github.com/ankelmarek/AutoNapisy/actions/runs/39291594851), także push 39291589231:** 315 testów TypeScript, 111 Rust i 23 rzeczywiste integracje, produkcyjny build, instalator, instalacja oraz rzeczywisty WebView2. Potwierdzone dekodowanie/odtwarzanie A/B, przewijanie i przełączenie wariantu w tym samym czasie, zastosowanie jakości, pomiary i eksport dwuprzebiegowy w limicie MB wraz z polskim SRT. Anulowanie przed rozpoczęciem nie publikuje spóźnionego wyniku; montaż pozostaje niezmieniony. Sprawdzone trzy zrzuty: natywny oraz 1366×700 / 1920×1080. Wcześniejsze scenariusze montażu, transkrypcji, normalizacji, zapisu i crash/restart zachowane. [PR #19](https://github.com/ankelmarek/AutoNapisy/pull/19) połączony; drzewo po scaleniu identyczne ze sprawdzonym `667782bf638cdbd218bf860bee377772492a7da4`. ZIP 81 501 867 B; SHA-256 `df8b8253084a1dde004f75192460158f1906638f2613b7d8916c879350ed3b52`.

Lokalnie: 315 TS, 108 Rust core, 18 rzeczywistych integracji i build frontendu. Test integracyjny porównuje piksele próbki z pełnym wynikiem, czasy napisów i rzeczywisty sygnał źródeł/obwiedni/master/muzyki. Limit MB sprawdzany na wymagającym ruchu z referencją CRF przekraczającą limit. Odbiór używa materiałów syntetycznych; jakość wybranego ustawienia na własnych nagraniach oceń przez A/B. Inne kodeki, GPU i nowa baza FPS pozostają dalszą częścią issue #1.

## Wersja 0.31 — Export Studio

Po sprawdzeniu przed eksportem otwiera się Export Studio. Wybierz profil, dopasowanie całego kadru z pasami albo centralne przycięcie, tryb napisów i folder. Podgląd rzeczywistej klatki z oryginałów oraz plansze napisów pokazują format docelowy; ostrzeżenia o zmianie proporcji i upscalingu wymagają akceptacji. Projekt montażowy pozostaje niezmieniony (schemat v14).

Profile: format montażu, Reels/TikTok/Shorts 1080×1920, YouTube/Facebook 1920×1080, 4K 3840×2160, szybkie 720p i archiwum CRF 15 w formacie montażu. Własne: parzyste wymiary 128–3840, CRF 12–35, fast/medium/slow oraz AAC 96/128/192/256/320 kb/s. Wszystkie: H.264, 30 kl./s i stereo 48 kHz, kodowanie CPU. Archiwum jest wysoką jakością stratną. Powiększenie nie odzyskuje szczegółów; profile platform są propozycją ustawień. Orientacyjny zakres MB dla CRF jest szeroką heurystyką, nie limitem rozmiaru ani gwarancją.

Napisy: w obrazie, osobny SRT obok MP4 albo bez napisów. Bitmapy z tego samego renderera co podgląd, z rzeczywistymi fontami. Wariant SRT nie wypala tekstu. Ustawienia miksu, gain master, fade'y, obwiednie, crossfade i J/L-cut zachowane. Nowy tor Export Studio składa oryginalny montaż MLT do FFV1 + PCM float, a następnie koduje jeden wynikowy H.264/AAC. Tymczasowy FFV1 nie oznacza bezstratnego pliku końcowego; przejścia nadal korzystają ze wspólnego renderera.

„Dodaj wariant do kolejki” zapisuje niezmienną kopię projektu i ustawień. Można dodać kilka wersji jednego montażu albo wybrać do 10 zapisanych projektów w natywnym dialogu, bez otwierania ich w edytorze. Przed dodaniem całej paczki obejrzyj i zatwierdź kadr każdego projektu. Kolejka ma maks. 10 pozycji, działa sekwencyjnie w backendzie i kontynuuje pracę po zamknięciu panelu; przycisk obok Eksportuj otwiera ją ponownie. Anulowanie jednej pozycji nie zatrzymuje innych; nieudane/anulowane zadanie z kompletnymi planszami można ponowić. Usuń ukończone pozycje, aby zwolnić ich zasoby. Zmiana źródeł lub narzędzi wymaga ponownego dodania zadania. Przygotowywanie plansz można przerwać osobno.

Zapis jest do folderu autoryzowanego natywnym wyborem; IPC nie przyjmuje dowolnej ścieżki wyjścia. Istniejące i zarezerwowane nazwy otrzymują kolejny numer. Publikacja nie nadpisuje istniejących plików także przy konflikcie w trakcie pracy. MP4 i SRT nie są jedną transakcją systemu plików: błąd publikacji MP4 wycofuje niezmieniony SRT tej próby. Pliki źródłowe i projekty JSON nie są nadpisywane.

Własne profile w app_data/export-studio-v1/profiles.json, osobno od projektu i Undo: do 24 wpisów, walidacja, blokada OS i atomowy zapis. Nieczytelny/nowszy rejestr zachowany do jawnego wyczyszczenia. Kolejka jest sesyjna i wymaga działającej aplikacji; przed zamknięciem programu ukończ lub anuluj zadania. Po awarii procesu zadania trzeba dodać ponownie; osierocone katalogi tymczasowe eksportu mogą pozostać w wybranym folderze. Tymczasowe plansze do 512 MiB na zadanie, aktywny plik pośredni i wynik do 32 GiB każdy; zapis FFV1 może wymagać znacznie więcej miejsca niż MP4. Brak automatycznego wznowienia po awarii, próbek A/B, docelowego limitu MB, innych kodeków, GPU i nowej bazy FPS w tej wersji. Normalizacja pozostaje istniejącą funkcją pomiaru miksu, nie jest wykonywana automatycznie przy eksporcie.

**Pełny zielony [Windows run 39279960579](https://github.com/ankelmarek/AutoNapisy/actions/runs/39279960579), również push 39279955807:** 305 testów TypeScript, 105 Rust i 22 rzeczywiste integracje, produkcyjny build, instalator, instalacja oraz WebView2. Scenariusz Export Studio przeszedł natywnie i w 1366×700 / 1920×1080; trzy zrzuty sprawdzone. Potwierdzone rzeczywiste MP4/SRT, podgląd, profile i ich ponowne wczytanie, kolejka, wybór projektów, zatwierdzanie paczki, autoryzacja i niezmieniony projekt. Integracje sprawdzają także głośność sygnału, burn/SRT/none, cancel/retry, konflikt celu i zmianę źródła. Zachowane wcześniejsze scenariusze montażu, normalizacji, transkrypcji, zapisu i crash/restart. [PR #18](https://github.com/ankelmarek/AutoNapisy/pull/18) połączony. ZIP 81 437 620 B; SHA-256 `e4ee2bba7142eef5e545f8b9dda8287ec2f0a7be3a094172e1fbbb08ab1e84a3`. Lokalnie: 305 TS, 102 Rust core, 17 rzeczywistych integracji i build frontendu.

## Wersja 0.30 — SmartCut 0.2: obraz i przebitka

- Otwórz SmartCut z zaznaczonego zakresu lub menu klipu. „Obraz przy cięciu” pokazuje ostatnią klatkę przed stykiem i pierwszą po nim. MLT mierzy do czterech rzeczywistych klatek montażu z oryginałów, z kadrowaniem, korekcją, widocznością i kolejnością warstw, bez napisów, do 320 px / 30 kl./s. Miniatury nie zależą od obsługi kodeka przez WebView2.
- Wskazówka porównuje zmianę pikseli na cięciu z ruchem w sąsiednich klatkach. Nie rozpoznaje osoby ani nie orzeka, że zamierzona zmiana ujęcia jest błędem. Brak ostrzeżenia nie gwarantuje naturalności. „Granice −1/+1 kl.” przesuwają kandydaturę; ręczne pola i wariant Naturalne pozostają dostępne. Nie przesuwamy granic automatycznie na podstawie obrazu.
- „Przykryj cięcie przebitką”: wybierz film z biblioteki, początek źródła i długość 0,2–4 s. Obraz trafia po obu stronach styku na pusty górny tor, ewentualnie nowy, z wyłączonym dźwiękiem. Podgląd „Wariant po cięciu” uwzględnia przebitkę; para klatek nadal pokazuje samo cięcie. Wolny tor musi być widoczny i odblokowany; limit 16 V jest zachowany. Przy Ripple Off z luką lub bez dwóch stron styku przebitka nie jest stosowana.
- Przebitka nie zastępuje napisów wypowiedzi własną transkrypcją. Przy napisach źródłowych zachowujemy aktualny widoczny tekst, trimy i przesunięcia jako napisy montażu T; konwersja wymaga odblokowanego T. Dźwięk, obwiednie i niezależna muzyka pozostają bez zmian.
- Analiza, regulacja, wybór przebitki i anulowanie nie zmieniają projektu. „Zastosuj cięcie” zatwierdza wycięcie i przebitkę jako jeden Undo/Redo; JSON zachowuje zwykłe klipy bez dodatkowego formatu. Schemat nadal v14. Niedostępność pomiaru obrazu nie blokuje dokładnego cięcia. Zadania są anulowane i sprzątają tempy; IPC autoryzuje źródła, a ukończony pomiar można wykorzystać tylko przy zgodnym projekcie, plikach i narzędziach.

Ograniczenia: heurystyka obrazu, bez semantycznego śledzenia osoby, automatycznego wyboru przebitek i optymalizowania cięcia według punktacji. Przebitka jest prostą, niemą nakładką wybraną z istniejącej biblioteki; jej kadrowanie można zmienić później zwykłymi kontrolkami. Ocena naturalności wypowiedzi i wydajności na własnych nagraniach pozostaje zadaniem użytkownika; testowe wzorce obrazu/dźwięku nie są pomiarem jakości językowej. Export Studio pozostaje osobnym etapem.
RolVixa (wcześniej AutoNapisy) to lokalna aplikacja Windows x64: Tauri 2, React, TypeScript, Vite i Rust. Rozpoznaje polską mowę przez whisper.cpp, bez tłumaczenia. Transkrypcja i montaż działają na komputerze. Opcjonalna biblioteka muzyki łączy się z Openverse po wpisaniu frazy wyszukiwania; nie wysyła nagrań użytkownika.

Weryfikacja 0.30: Pełny zielony Windows run 39254150340: 293 TS, 99 Rust, 21 rzeczywistych integracyjnych, produkcyjny build, instalacja oraz WebView2 1366×700 / Full HD. Zrzuty porównania i zdekodowanego podglądu sprawdzone. PR #17 połączony; instalator 12187284748. Lokalnie: 293 TS, 96 core Rust, 16 rzeczywistych integracyjnych oraz build frontendu.

## Wersja 0.29 — grupy, przesuwanie napisów i zakres transkrypcji

Pełny zielony [Windows run 39244370925](https://github.com/ankelmarek/AutoNapisy/actions/runs/39244370925): **274 TS, 96 Rust, 20 rzeczywistych integracyjnych**, produkcyjny build, instalacja i WebView2. Nowy scenariusz przeszedł natywnie oraz w 1366×700 i 1920×1080; zrzuty sprawdzono. Potwierdzone prostokąt/Ctrl+klik, Ctrl+kółko bez zoomu strony, wspólny ruch V1/V2 i powiązanego audio, jeden Undo/Redo, przesuwanie napisu/dwuklik/Delete/zapis/reopen v14 oraz zakres transkrypcji. Regresje SmartCut, źródeł, normalizacji, Ripple/J/L-cut, historii i crash/restart także przeszły.

Lokalnie: 274 TS, 93 Rust core, 15 rzeczywistych integracyjnych i build frontendu; dodatkowo prawdziwy whisper.cpp z modelem tiny zwrócił wynik dla całego przyciętego montażu z przejściem oraz pojedynczego wybranego filmu, z poprawnymi czasami osi. Nie oceniano jakości językowej modelu na tym krótkim materiale.

[PR #16](https://github.com/ankelmarek/AutoNapisy/pull/16) połączony. Instalator: artefakt **12182772670**, ZIP **81,324,609 B**, SHA-256 `40312987944e25ea4d2ee0161865dad3c4f3f08b2d4c077b9d689610d32299c5`.

- **Ctrl + kółko nad osią** powiększa i pomniejsza skalę wokół kursora. „Cały montaż” z pustą lupką Tabler znajduje się obok suwaka skali. Alt + przeciągnięcie i środkowy przycisk nadal przesuwają widok.
- **Ctrl/Shift + klik** dodaje lub odejmuje klipy zaznaczenia. Przeciągnięcie pustego obszaru tworzy prostokąt zaznaczenia; Ctrl+A wybiera klipy z odblokowanych torów. Przesunięcie dowolnego zaznaczonego klipu przesuwa grupę poziomo, zachowując odstępy, tory i źródłowe obwiednie. Powiązane odłączone audio filmu podąża raz, z dotychczasowym offsetem J/L-cut. Blokady i kolizje chronią całą operację; jeden gest to jeden Undo. Grupy nie zmieniają torów pionowo; pojedynczy klip nadal można przenosić między torami. Zwykły ruch pojedynczego odłączonego obrazu zachowuje dotychczasową niezależność audio; automatyczne dołączenie powiązanego audio dotyczy ruchu grupy. Kopiowanie/duplikowanie dotyczy aktywnego klipu, a Delete usuwa zaznaczenie jednym Undo; przy konflikcie Ripple nic nie jest zatwierdzane.
- **Przeciągnięcie środka napisu** przesuwa jego czas, bez zmiany długości. Uchwyty przycinają; pojedynczy klik zaznacza, Delete usuwa, dwuklik otwiera edycję tekstu. Escape anuluje gest. Przesunięcie zachowuje czasy słów i przypisanie źródła, a jego zapis/Undo działa tak jak pozostałe edycje.
- **Zakres transkrypcji**: domyślnie „Cały montaż”, opcjonalnie „Tylko zaznaczone klipy”. W obu trybach backend wybiera wyłącznie niewyciszony dźwięk filmów oraz ich powiązane odłączone audio. Samodzielna muzyka/dźwięki są wykluczone. Mute V i oryginalnego busa A jest respektowany; oczko steruje obrazem, Solo pozostaje tylko odsłuchem. Zachowane źródłowe trimy, J/L-cut, obwiednie i liniowy miks przejść. Luki bez wybranego dźwięku są pomijane przed Whisperem, a wynik wraca do czasu montażu. Brak odpowiedniego dźwięku daje jawny komunikat. Wybranie samej muzyki nie uruchamia całego montażu. W trybie zaznaczenia powiązane odłączone audio jest ograniczane do czasu wybranych filmów (wraz z wejściem przejścia); nie przemyca reszty długiej ścieżki po rozcięciu obrazu. Cały montaż zachowuje także słyszalne wyprzedzenia i zakończenia J/L-cut poza granicami obrazu.
- Wynik zaznaczenia **zastępuje napisy tylko we wskazanych zakresach dźwięku**; widoczny tekst i edycje poza nimi pozostają. Napisy przecinające granicę są dzielone według czasów słów. Przy braku czasów słów zachowany tekst może pojawić się w obu pozostałych częściach — trzeba sprawdzić go ręcznie. Błąd/anulowanie pozostawia napisy bez zmian. Istniejące napisy wymagają potwierdzenia zastąpienia, a blokada T chroni transkrypcję.

Schemat **v14**, `schemas/project-v14.schema.json`: opcjonalne przesunięcie `captionEdits[id].offset` (sekundy, −86400…86400). Migracje v1–v13 nie zmieniają miksu ani kolejności torów; stare projekty nie mają przesunięć. Starsza aplikacja nie otworzy zapisanych projektów v14. Historia zaznaczenia i wybór zakresu transkrypcji są sesyjne, poza JSON/Undo. W tej wersji nie rozszerzano SmartCut ani Export Studio.

Testy: logika grup/kolizji/blokad/magnesu i Undo, skala wokół kursora, globalne/źródłowe napisy i migracje/trim/Ripple/SmartCut, zakresy mowy/IPC/łączenie częściowych wyników. Test rzeczywistego PCM sprawdza MLT oraz FFmpeg z trzema rozróżnialnymi tonami: brak samodzielnej muzyki i wyciszonego V, wybór klipu, J/L-cut i kompresję luk; nie podstawia fikcyjnego wyniku Whispera. Nowy scenariusz WebView2 sprawdza prawdziwe gesty myszy, zapis/reopen i kontrolki zakresu. W dawnym teście Audio 0.26 usunięto wyścig otwierania: odczyt starego rzędu A nie oznacza już ukończenia nowego Open.

Nowe pliki: `src/groupEditing.ts`, `src/speechSelection.ts`, `schemas/project-v14.schema.json`, `tests/editor029.test.ts`, `scripts/test-editor029.mjs`, `.test-core/tests/speech_selection.rs`. Pełna lista zmian jest w PR #16. Dotychczasowe adaptery i licencje narzędzi pozostają zachowane.

Ograniczenie częściowej transkrypcji: zachowywany widoczny tekst poza zakresem jest utrwalany w napisach montażu, z uwzględnieniem wcześniejszych poprawek. Nie pozostaje odtąd dynamicznym napisem źródłowym. Kopiowanie/duplikowanie/wycinanie dotyczy aktywnego klipu; grupy w tej wersji obsługują wspólne przesuwanie poziome i usuwanie. Pozostałe limity (100 klipów, 16 V/16 A, MLT 30 FPS) nie zmieniły się.

## Wersja 0.28 — SmartCut 0.1 (ukończona)

**Osobny [PR #15](https://github.com/ankelmarek/AutoNapisy/pull/15) połączony.** Zielony [Windows run 39220210425](https://github.com/ankelmarek/AutoNapisy/actions/runs/39220210425): **252 testy TypeScript, 90 Rust, 19 rzeczywistych integracyjnych**, produkcyjna kompilacja, instalacja oraz WebView2. Potwierdzone rzeczywiste granice pauz, autoryzacja/cancel/stamp, krótki zdekodowany podgląd i pętla, warianty/odłączenie audio, brak edycji przy anulowaniu, pojedynczy Undo/Redo i zapis/reopen, upuszczenie przejścia 16 px obok styku oraz tryb istniejącego połączenia. Scenariusz przeszedł natywnie i w 1366×700 / Full HD; zrzuty sprawdzone. Regresje źródeł, normalizacji, SRT, dynamicznych torów, Ripple i crash/restart także zielone. Lokalnie 252 TS, 87 Rust core, 11 rzeczywistych integracji i build frontendu. ZIP: **81 307 253 B**, SHA-256 `ba3d4e29ec0c11229e7dbbb62813220213bdec1432d6e35593c99c382ed4ace6`. Narzędzia i licencje dołączone; model Whisper wybiera się osobno jak dotychczas.

Równoległy push [39220204501](https://github.com/ankelmarek/AutoNapisy/actions/runs/39220204501) wykazał sporadyczny wyścig w starszym teście Audio026: warunek przy ponownym Open tej samej nazwy może sprawdzić poprzedni widok, zanim zacznie się otwieranie. Pełny odbiór PR powyżej przeszedł również ten scenariusz. Do stabilizacji pozostaje synchronizacja zakończenia Open w teście; równoległego przebiegu nie oznaczamy jako zielonego.

1. Włącz **SmartCut** na osi i przeciągnij po filmie zakres do usunięcia. Zakres musi mieścić się w jednym klipie i mieć co najmniej dwie klatki. Alternatywnie kliknij film prawym przyciskiem: **SmartCut · wytnij zakres** albo **popraw połączenie** sąsiadujących filmów na tym samym V.
2. W oknie porównania popraw granice strzałkami po jednej klatce lub wpisz sekundy. **Dokładne** zachowuje te granice. **Naturalne** wymaga zmierzonych pauz oraz istniejących czasów słów; brak danych pozostawia Dokładne, bez zgadywania. Korekta wynosi najwyżej 0,6 s. Pomiar dotyczy dźwięku wybranego filmu, także odłączonego, a nie niezależnej muzyki.
3. **Wygładzone** dodaje do naturalnych granic rzeczywisty liniowy crossfade audio 4 klatek (0,133 s), przy ostrym cięciu obrazu. Wymaga zapasu źródła i zgodnych granic dźwięku; nie jest dostępne, jeżeli przywróciłoby fragment usuwanego słowa; połączone audio staje się widocznymi klipami A. Dotychczasowe źródłowe punkty, fade’y i głośność pozostają zachowane.
4. **Przed · początek / koniec** pokazują rzeczywiste krótkie fragmenty oryginalnego montażu; **Wariant po cięciu** pokazuje propozycję. Odtwarzaj przyciskiem lub spacją, przewijaj i włączaj pętlę. Podgląd obejmuje pełny miks; sesyjne Solo nie wpływa na porównanie. Analiza czyta maksymalnie dwa krótkie okna dźwięku przy granicach; podgląd MLT obejmuje kilka sekund, z ewentualnym rozszerzeniem do całego istniejącego przejścia.
5. Sprawdź listę zmian, rzeczywiste czasy i przesunięcia. Ripple zachowuje ustawienia torów, pozostałe luki, blokady i J/L-cut; niezależna muzyka Auto pozostaje na miejscu. Przesuwanie globalnych napisów T jest jawną opcją. **Zastosuj cięcie** tworzy jeden krok **Ctrl+Z/Redo**, obejmujący również napisy i odłączenie audio. **Anuluj** nie zmienia projektu. Zmienione źródła lub nieaktualny pomiar wymagają ponownej analizy.

Ograniczenia 0.1: zakres w jednym filmie; złożone wieloczęściowe grupy synchronizacji, przecięcie istniejącego przejścia i nieprzedstawialne edycje napisów są zgłaszane jako konflikty. Przesuwanie istniejącego złączenia z J/L-cut wymaga osobnego dopasowania dźwięku. Pauza to heurystyka energii (≥120 ms), nie ocena sensu wypowiedzi; efekt należy odsłuchać. Bez MLT nie ma porównania wideo, ale Dokładne pozostaje dostępne. MLT ma siatkę 30 FPS, więc krótka obwiednia podlega dokładności klatkowej; AAC może nieznacznie zmienić sygnał. Nie ma jeszcze oceny obrazu, propozycji przebitek ani automatycznego montażu całej transkrypcji (SmartCut 0.2).

Poprawiono również **przeciąganie przejść**: strefa styku przyjmuje upuszczenie do 20 px od granicy, również nad uchwytem trim; pokazuje podświetlenie i pozwala zastąpić istniejące przejście. Źródłowe napisy respektują przestawioną kolejność i widoczność V. Awaryjne składanie FFmpeg zachowuje PCM w osobnych plikach roboczych pomiędzy fragmentami i koduje AAC dopiero po ich połączeniu, eliminując przerwy od wielokrotnego paddingu AAC. Schemat pozostaje v13, bez nowych zależności ani usług sieciowych.

Nowe pliki: `src/smartCut.ts`, `src/SmartCutDialog.tsx`, `src/transitionDrop.ts`, `src-tauri/src/smart_cut.rs`, `src-tauri/src/smart_cut_commands.rs`, `tests/smartCut.test.ts`, `tests/smartCut028BrowserFixture.test.ts`, `tests/fixtures/smartcut028.json`, `.test-core/tests/smart_cut.rs`, `scripts/smartcut-fixture028.mjs`, `scripts/test-smartcut028.mjs`. Wspólna próbka porównuje rzeczywisty wynik planera TS z obrazem, tonami i napisami renderowanymi przez MLT/FFmpeg.

## Wersja 0.27 — sterowanie torami (ukończona)

**Osobny [PR #14](https://github.com/ankelmarek/AutoNapisy/pull/14) połączony.** Pełny zielony [Windows run 39198885893](https://github.com/ankelmarek/AutoNapisy/actions/runs/39198885893), także push 39198881666: **229 testów TypeScript, 87 Rust, 17 rzeczywistych integracyjnych**, produkcyjny build, instalacja i WebView2. Nowy scenariusz przeszedł natywnie oraz w 1366×700 / Full HD; sprawdzono zrzuty oraz rzeczywiście zdekodowany podgląd. Potwierdzone przeciąganie/klawiatura, kolejność i blokady/Undo/Redo, odsłuchowe Solo z busami/mute, wysokość myszą/klawiaturą/Escape, lokalne preferencje, zwijanie, dopasowanie i reopen v13. Regresje źródeł, normalizacji, napisów, Ripple/J/L-cut, historii i wymuszonego crash/restart także zielone. Lokalnie: 229 TS, 84 Rust core, pięć rzeczywistych integracji i build frontendu. ZIP: **81 259 124 B**, SHA-256 `0bd6c0a5127f5c0ac8482fee9d8c6ccdc30f1d6fd335c73ff653e169c41ce6ef`. Narzędzia i licencje dołączone; model Whisper wybiera się osobno jak dotychczas.

- **Solo** (ikona audio w nagłówku V/A) izoluje odsłuch. Można włączyć kilka torów; A obejmuje także dźwięk filmów trasowany do tego busa, V tylko filmy na tym V. Istniejący mute oraz odłączenie pozostają respektowane. Przycisk **Solo · pełny miks** przywraca odsłuch. Solo jest sesyjne, resetowane po otwarciu/utworzeniu projektu, poza Undo, pomiarami, transkrypcją i eksportem.
- **Przeciągnij numer V/A** na nagłówek tego samego typu, w jego górną/dolną połowę. Alternatywnie: fokus numeru i **Alt+↑/↓**. Wideo wyżej na osi zasłania niższe w podglądzie i eksporcie. Numery, trasy audio, klipy, przejścia i synchronizacja pozostają bez zmian. Nie można przekraczać zablokowanego toru; zmiana kolejności jest jednym Undo i zapisuje się w projekcie. T pozostaje na górze.
- **Dolna krawędź nagłówka** reguluje wysokość V/A (40–240 px na rząd; minimum 84 px dla filmu z dźwiękiem). Strzałki zmieniają ją o 8 px, Shift o 24 px, Home/dwuklik resetuje; Escape/anulowanie gestu przywraca poprzednią. Nakładające się A zachowują osobne pełne rzędy. Zwijanie przywraca ustawioną wysokość po rozwinięciu. Preferencje `rolvixa.timeline.v1` są lokalne dla edytora, poza projektem i Undo; nie zmieniają dekodera.
- **Cały montaż** dopasowuje skalę i wraca do początku poziomego przewijania, także dla długich projektów. Nie przesuwa głowicy ani klipów.

Schemat **v13** (`schemas/project-v13.schema.json`): kolejność `trackLayout` ma znaczenie (V od dołu do góry, A od góry do dołu), z dotychczasowymi stabilnymi ID/indeksami. Import v1–v12 zachowuje historyczną kolejność numeryczną i miks. Projekty zapisane jako v13 wymagają nowej aplikacji. Produkcyjny MLT, wybór warstwy, FrameEditor oraz render FFmpeg respektują tę samą kolejność. Analiza obrazu unieważnia cache po zmianie kolejności V; zmiana samej kolejności A nie zmienia miksu/normalizacji. Limit nadal 16 V / 16 A, 100 klipów i MLT 30 FPS. SmartCut / Export Studio poza tą paczką.

Nowe pliki: `src/TrackResize.tsx`, `src/timelineView.ts`, `tests/timeline027.test.ts`, `scripts/test-timeline027.mjs`, `schemas/project-v13.schema.json`. Testy obejmują migrację, blokady/Undo, Solo/busy/mute, geometrię/preferencje/dopasowanie i rzeczywiste kolory/sześć tonów obu silników po przestawieniu V1 ponad V3 oraz izolowany odsłuch. Test okna wykrył i potwierdził poprawkę przepełnienia podziałki przy dopasowaniu: etykiety są ograniczone do szerokości osi. Użyto istniejących Tabler Icons z zachowaną licencją.

## Wersja 0.26 — czytelne audio (ukończona)

**Osobny [PR #13](https://github.com/ankelmarek/AutoNapisy/pull/13) połączony.** Pełny zielony [Windows run 39189432808](https://github.com/ankelmarek/AutoNapisy/actions/runs/39189432808), także push 39189417417: **220 testów TypeScript, 85 Rust, 17 rzeczywistych integracyjnych**, produkcyjny build, instalacja i WebView2. Sprawdzono zrzuty pełnego audio, nakładania i panelu rozdzielania w 1366×700 / Full HD oraz rzeczywistego okna natywnego z dekodowanym MLT. Potwierdzone waveform w jednym V, pełne A, osobne rzędy kolizji, jawne dodanie A3 i przeniesienie z pojedynczym Undo/Redo, głośność, mute/routing/oczko, zwijanie bez restartu dekodera, odtwarzanie i zapis/reopen. Regresje źródeł, Ripple/J/L-cut, normalizacji, napisów, eksportu, historii i crash/restart także zielone. Lokalnie: 220 TS, 82 Rust core, pięć rzeczywistych integracji audio/dynamicznych torów/Ripple i build frontendu. ZIP: **81 243 839 B**, SHA-256 `9b846c2390e7cee29ed53828c8bd395418be3141547be3aa08a5e0a4abbf2e28`. Narzędzia i licencje pozostają dołączone; model Whisper wybiera się osobno jak dotychczas.

- Film i połączony dźwięk są **jednym klipem na V**. Waveform, głośność, punkty i fade’y znajdują się w dolnej części tego samego klipu. Przesuwanie/trim/żyletka nadal dotyczą całego połączonego ujęcia. Po odłączeniu dźwięk staje się osobnym klipem na A.
- **A1/A2 i dalsze A** pokazują wyłącznie niezależne lub odłączone audio. Pojedynczy klip wypełnia całą wysokość toru. Dźwięk filmu routowany do A nie tworzy drugiej połowy toru.
- Rzeczywiście nakładające się niezależne audio ma **oddzielne rzędy**, zachowane także po zwinięciu toru. Informacja „Rzędy: … · wspólny mute” wskazuje wspólny bus. Układ nie zmienia pozycji, gain, obwiedni ani dźwięku starych projektów.
- Zaznacz nakładające się audio: **Film / audio → Nakładanie audio** proponuje wolny odblokowany tor lub **Dodaj A3 i przenieś** (ewentualnie dalszy wolny A). Przeniesienie wraz z dodaniem to jeden Ctrl+Z. Jest jawne i przejmuje stan wyciszenia docelowego busa. Bez automatycznego przesuwania starych klipów.
- Oznaczenie **Audio → A1** przy filmie i opis przy nagłówku A przypominają, że wyciszenie busa obejmuje także ten film. Trasę zmienia się w **Film / audio → Trasowanie dźwięku**; widok nie zmienia audioRoute. Oczko V nadal ukrywa obraz bez wyciszenia dźwięku.
- Dodawanie audio bez wskazanego toru wybiera pierwsze wolne A według całego zakresu klipu, z pominięciem blokad i dźwięku filmów. Jawne upuszczenie na zajęty A pozostaje możliwe: kolizja jest widoczna w rzędach i opisana w panelu.

Schemat pozostaje **v12**, bez migracji. Silniki MLT/FFmpeg, obwiednie źródłowe, Ripple i J/L-cut pozostają bez zmiany. Wysokości i zwijanie należą do widoku, nie projektu/Undo. Limit nadal 16 V / 16 A i 100 klipów. Przy wielu jednoczesnych dźwiękach tor rośnie i wymaga przewijania; nie ukrywa klipów za innymi. Nie ma przeciągania samego paska połączonego dźwięku między A — użyj jawnego trasowania w panelu. SmartCut / Export Studio poza tą wersją.

Nowe pliki: `src/audioLayout.ts`, `tests/audioLayout.test.ts`, `tests/audio026BrowserFixture.test.ts`, `scripts/test-audio026.mjs`. Zmiany obejmują geometrię i renderowanie osi, panel właściwości, bibliotekę/drop, dotychczasowe testy dynamicznych torów i WebView2, manifesty wersji i workflow. Użyto istniejących Tabler Icons (MIT); instrukcja uruchomienia i narzędzia pozostają jak poniżej.

## Wersja 0.25 — prostsze Ripple (ukończona)

**Osobny [PR #12](https://github.com/ankelmarek/AutoNapisy/pull/12) połączony.** Pełny zielony [Windows run 39163940646](https://github.com/ankelmarek/AutoNapisy/actions/runs/39163940646), również równoległy 39163938036: **209 testów TypeScript, 85 Rust, 17 rzeczywistych integracyjnych**, kompilacja produkcyjna, instalacja i WebView2. Sprawdzono zrzuty nowego Ripple i niemodalnego konfliktu w 1366×700 oraz 1920×1080 i rzeczywisty zdekodowany podgląd MLT. Potwierdzone bezpośrednie cięcie, muzyka na tym samym busie, zaawansowane ustawienia bez restartu dekodera, brak cichego zwykłego cięcia przy konflikcie, anulowanie / jawne cięcie / unieważnienie planu, pojedynczy Undo/Redo i zapis projektu. Regresje normalizacji, źródeł, napisów, eksportu, historii i crash/restart także zielone. Lokalnie 209 TS, 82 Rust core, build frontendu i rzeczywisty nowy miks MLT/FFmpeg. ZIP: **81 240 645 B**, SHA-256 `ea9a296aed89b0d586e9ccc7566bba8aa547ac365bf3e130097cfc818da9d23f`. Narzędzia i licencje są dołączone; model Whisper nadal wybiera się osobno jak dotychczas.

- **Ripple wł./wył.** na osi: przycięcie lub usunięcie dosuwa od razu, gdy plan jest bezpieczny. Cała operacja to jeden **Ctrl+Z**; zwykłe przesuwanie i żyletka nie włączają dosuwania.
- Automatycznie uczestniczą wyłącznie tory **V rozpoczynające się od 00:00** (tolerancja pół klatki). Puste i późne tory pozostają na miejscu. **Samodzielna muzyka nie przesuwa się automatycznie**, również od 00:00 i na busie A współdzielonym z dźwiękiem filmu.
- Dźwięk wbudowany podąża za swoim filmem. Audio odłączone z `syncGroup` zachowuje zegar źródłowy, obwiednię, zamierzony offset i przycięcia J/L, także przy „Nigdy” na A. Ustawienie A dotyczy niezależnych klipów, a nie relacji synchronizacji.
- Ikona ustawień obok nazwy toru → **Uwzględniaj w dosuwaniu → Automatycznie / Zawsze / Nigdy**. Jawne ustawienia starych projektów pozostają zapisane i respektowane; blokady mają pierwszeństwo. Niezależne T domyślnie pozostaje na miejscu; napisy źródłowe podążają za obrazem.
- Konflikt niczego nie zatwierdza: na osi pojawia się **„Nie można dosunąć”** z powodem oraz **Wykonaj samo cięcie / Anuluj**. Escape anuluje, zmiana projektu unieważnia oczekującą operację. Pozostałe okna i zapis pozostają dostępne; zwykłe cięcie nadal respektuje blokady.
- Schemat nadal **v12**; bez migracji danych. Nowe i stare projekty bez ustawienia Ripple startują z wyłączonym trybem. Zachowane jawne `rippleEnabled` v10–v12 i per-track `auto/on/off`.

Ograniczenia: nie usuwamy automatycznie całej odłączonej pary po wybraniu tylko jednej jej części; taki konflikt wymaga jawnego zwykłego cięcia. Powiązania obejmujące wiele fragmentów po dalszych podziałach mogą wymagać ręcznej edycji, gdy źródłowe przesunięcia się różnią. Nie przycinamy automatycznie innych klipów przecinających usuwany przedział. Pełna wysokość niezależnego audio i waveform przy V pozostają osobnym PR (druga część issue #11). SmartCut i Export Studio poza tą wersją.

Pliki zmiany: `src/ripple.ts`, `src/Timeline.tsx`, `src/App.tsx`, `src/style.css` (usunięty `src/RipplePreview.tsx`), testy Ripple i wspólna próbka `tests/fixtures/ripple025.json`, rzeczywisty miks `.test-core/tests/ripple_mix.rs`, skrypty WebView2, manifesty wersji, workflow Windows i dokumentacja. Nowe kontrolki korzystają z istniejących Tabler Icons MIT.

## Wersja 0.24 — pomiary i normalizacja miksu (ukończona)

**Pełny zielony [odbiór Windows 39159998515](https://github.com/ankelmarek/AutoNapisy/actions/runs/39159998515), również równoległy 39159995807:** 195 testów TypeScript, 85 Rust, 16 integracyjnych, instalator, próbna instalacja i rzeczywisty WebView2. Sprawdzono zrzuty 1366×700 i Full HD. [PR #10](https://github.com/ankelmarek/AutoNapisy/pull/10) połączony. Potwierdzone rzeczywiste LUFS/true peak/cisza/czarny obraz, cache/anulowanie/autoryzacja, zastosowanie/Undo/Redo/zapis/reopen/ponowny pomiar normalizacji, strefy napisów i usuwanie źródła bez kasowania pliku. Regresje montażu, Ripple/J/L-cut, dynamicznych torów, crash/restart, historii i zapisu także zielone. ZIP: **81 242 960 B**, SHA-256 `0ccb9d4a73323513dd896635e7bc6145bed3ad2e3b99903a8322d8de1bc0bb85`.

W **Film / audio → Dźwięk całego filmu → Zmierz / normalizuj miks** uruchom pełną analizę. Można ją także włączyć w raporcie przed eksportem. Pomiar na żądanie pokazuje LUFS całego miksu, true peak w dBTP oraz zakresy ciszy, czarnego/bardzo ciemnego obrazu i ryzyka przesterowania. Link w ostrzeżeniu przenosi głowicę na oś. Pauzy i ciemne sceny mogą być zamierzone, więc ostrzeżenia nie blokują eksportu. Dostępność źródeł i ich zakresy nadal blokują nieprawidłowy eksport. Sprawdzane są rzeczywiste granice napisów i wybrana strefa bezpieczna dla 9:16, z tymi samymi fontami i łamaniem co renderer.

Wybierz **−14 LUFS** (internet/rolki), **−16 LUFS** (mowa/podcast), **−23 LUFS** (EBU R128) lub własny cel −30…−9. Przed zastosowaniem zobaczysz wzmocnienie oraz przewidywane LUFS i dBTP. Jest to **stałe wzmocnienie całego miksu**, zachowujące proporcje mowy, muzyki i efektów, ręczne obwiednie i wyciszenia. Szczyty ograniczają wzrost do −1,1 dBTP; gdy cel jest nieosiągalny bez zmiany dynamiki, program pokazuje osiągalny poziom. Nie jest to automatyczny kompresor, odszumianie ani naprawianie przesterowanego źródła. AAC może nieznacznie zmienić szczyty względem pomiaru przed kodowaniem. Normalizacja działa w podglądzie i eksporcie, zapisuje się w projekcie; zastosowanie i wyłączenie to pojedyncze kroki Undo/Redo. Po zmianie słyszalnego montażu panel przypomina o ponownym pomiarze. Wynik ponownego pomiaru zastępuje poprzedni gain, nie dodaje go drugi raz.

Analiza używa oryginalnych źródeł i produkcyjnego montażu MLT (stereo float 48 kHz, przed kodowaniem AAC), z obrazem do 320 px dłuższego boku, bez wypalonych napisów. Napisy mierzone są osobno w pełnym formacie kadru. Cisza: poniżej −50 dB przez ≥0,5 s; ciemny obraz: ≥98% pikseli poniżej progu 10% przez ≥0,15 s. Wykrywanie ciemnych scen jest heurystyką. Szczyty/klipy na osi mają dokładność około 0,1 s, obraz 30 FPS. Krótki/cichy materiał może nie dać stabilnego LUFS — wtedy normalizacja jest niedostępna. Postęp dotyczy bieżącej fazy; można anulować analizę, proces potomny jest kończony, a pliki tymczasowe sprzątane. Limit roboczego pliku wynosi **1 GiB**, metadanych 16 MiB/plik i 1000 zakresów/kategorię. Przy przekroczeniu limitu można użyć raportu podstawowego. Cztery wyniki w pamięci sesji są weryfikowane pełnym odciskiem montażu, źródeł i narzędzi; anulowane/nieudane analizy nie trafiają do cache.

**Pliki → Źródło → Usuń z projektu** pojawia się tylko dla plików nieużywanych na osi. Usunięcie dotyczy biblioteki projektu, pozostawia plik na dysku i daje pojedynczy Undo. Przy usunięciu nieużywanego filmu głównego następny film przejmuje tę rolę, z zachowaniem ID i montażu; gdy format jest źródłowy, potwierdzenie uprzedza o zmianie formatu. Bez żadnego filmu eksport MP4 pozostaje niedostępny. Blokady ścieżek pozostają chronione.

Nowy schemat **v12** zawiera `masterAudio.gainDb` i opcjonalne dane celu normalizacji. Migracje v1–v11 ustawiają gain 0 dB, bez zmiany dotychczasowego miksu i torów. RolVixa 0.23 nie otworzy projektu v12 — **Zapisz jako** pozwala zachować poprzednią kopię. Definicja: `schemas/project-v12.schema.json`; relacje ID/czasów dodatkowo weryfikują walidatory TS/Rust. Nie ma nowych zależności ani usług sieciowych. Używane są dotychczasowe MLT/FFmpeg i Tabler Icons, z zachowanymi licencjami.

Nowe moduły: `quality.rs`, `quality_commands.rs`, `qualityAnalysis.ts`, `PreflightDialog.tsx` (rozszerzony), `MasterAudioCard.tsx`, `masterAudio.ts`, `captionPreflight.ts`, `mediaRemoval.ts`; testy `tests/quality.test.ts`, `.test-core/tests/quality_audio.rs`, `scripts/test-quality024-native.mjs` i `tests/legacyBrowserFixture.test.ts` (sprawdza faktyczną próbkę v10 testu przeglądarkowego przed budową Windows). Uruchamianie: `npm ci`, `npm test`, `npm run tauri -- dev`. Instalator z narzędziami: `./scripts/build-windows.ps1` w Windows PowerShell. Lokalnie przeszły również 82 testy core Rust i rzeczywiste testy MLT/FFmpeg.

## Wersja 0.23 — źródła i sprawdzenie eksportu

**Ukończone, osobny [PR #9](https://github.com/ankelmarek/AutoNapisy/pull/9) połączony.** Pełny zielony [odbiór Windows 39140872733](https://github.com/ankelmarek/AutoNapisy/actions/runs/39140872733): **184 testy TypeScript, 79 Rust, 15 integracyjnych**, instalator, próbna instalacja i rzeczywisty WebView2. Obejrzano zrzuty laptopa 1366×700 i Full HD. Potwierdzono podmianę wielu użyć, konflikt zbyt krótkiego pliku, anulowanie, świadome zachowanie/usunięcie napisów, pojedyncze Undo/Redo, zapis v11, faktyczny brak źródła, naprawę i ponowne otwarcie z odtwarzaniem. Backend odrzuca nieznane, zmienione i wycofane identyfikatory; nieudany wybór nie zmienia projektu. Raport pozostaje w natywnej warstwie modalnej i wskazuje źródło także przy aktywnym filtrze biblioteki. Schemat projektu pozostaje **v11**, bez migracji.

Instalator: artefakt **12141718156**, ZIP 81,174,894 B, SHA-256 `2930e9fc4e33e6be443dd1511098b52aee1f1d6d8ad34bfd3687da8e86f187ba`. Wypakuj archiwum przed uruchomieniem EXE. Zawiera narzędzia i licencje jak poprzednie wydanie; model Whisper nadal wybiera się osobno.

**Pliki → Źródło → Odnajdź plik…** służy do wskazania przeniesionego nagrania. Trzeba potwierdzić, że to ten sam materiał: zachowane zostają napisy oraz dane autorstwa/licencji. **Zastąp źródło…** wymienia nagranie na inne; domyślnie usuwa jego napisy, a zachowanie tekstu wymaga jawnego zaznaczenia. Transkrypcja całego montażu nie ma przypisania do pojedynczych źródeł, dlatego przy wymianie źródła użytego na osi jej wyczyszczenie obejmuje cały montaż i jest opisane przed zatwierdzeniem. Podmiana źródła spoza osi nie usuwa napisów montażu. Napisy źródłowe innych materiałów pozostają zachowane. Dane licencji poprzedniego pliku nie są przenoszone na nowe nagranie.

FFprobe sprawdza czas, strumienie, rozmiar, obrót, FPS, kanały i częstotliwość audio. Dialog ostrzega o różnicach geometrii i dźwięku. Wskazuje każde ujęcie wymagające dłuższego pliku oraz źródłowe punkty/wyciszenia wychodzące poza zamiennik. Nie skraca niczego automatycznie: wybierz dłuższy zamiennik lub anuluj i popraw wskazane ujęcia. Blokady używanych torów chronią podmianę. Krótsze źródło jest dozwolone, jeśli mieści wszystkie używane zakresy, zachowywane napisy i obwiednie.

Zachowane są ID, pozycje i liczba klipów, cięcia, przejścia, trasowanie i odłączenie audio, kadrowanie, korekcja i obwiednie. Dotyczy wszystkich wystąpień wybranego źródła. Podmiana jest jednym krokiem **Ctrl+Z / Ctrl+Shift+Z**, zapisywanym i odzyskiwanym jak pozostałe zmiany projektu. Miniatury, przebiegi audio i podgląd są odświeżane; proxy ma tożsamość nowego źródła. Wybór i odczyty systemowe realizuje backend; akceptacja używa jednorazowego identyfikatora i ponownie sprawdza odcisk wybranego pliku. Pliki nagrań nie są modyfikowane.

**Eksportuj** najpierw pokazuje raport dostępności i parametrów źródeł oraz przerw bez widocznego filmu (z uwzględnieniem wszystkich widocznych torów). Błąd źródła blokuje eksport; ostrzeżenie o luce można zaakceptować przyciskiem **Eksportuj mimo ostrzeżeń**. Raport oferuje skok do czasu lub wskazanie pliku w bibliotece. W samym raporcie i podczas podmiany pozostałe okna są pod natywną warstwą modalną. Obecny eksport wymaga dostępności również źródeł pozostających w bibliotece poza osią — raport pokazuje je bez przypisania do czasu.

Ograniczenia: odnajdywanie pojedynczych plików, bez automatycznego przeszukiwania folderu; brak automatycznego dopasowania ujęć do zbyt krótkiego pliku. Cofnij przywraca odwołanie w projekcie, nie odtwarza nagrania usuniętego lub nadpisanego poza programem. Raport **nie mierzy** clippingu, ciszy ani czarnych klatek wewnątrz źródeł, nie sprawdza napisów poza strefą bezpieczną ani jakości kadrowania. Luki mogą być zamierzone. Pełna analiza jakości, SmartCut i Export Studio pozostają osobnymi etapami.

Nowe pliki: `src/sourceReplacement.ts`, `src/SourceReplacementDialog.tsx`, `src/preflight.ts`, `src/PreflightDialog.tsx`, `src/TaskDialog.tsx`, `src/mediaRevision.ts`, `src-tauri/src/media_sources.rs`, `src-tauri/src/source_commands.rs`, `tests/sourceReplacement.test.ts`, `.test-core/tests/source_replace.rs`, `scripts/test-sources023.mjs`, `scripts/test-sources023-native.mjs`. Zmiany obejmują bibliotekę, podgląd, cache mediów, komendy Tauri i workflow odbioru Windows. Instrukcja budowania i wybór narzędzi pozostają jak poniżej.

## Wersja 0.22 — dynamiczne tory

**Ukończone, osobny [PR #8](https://github.com/ankelmarek/AutoNapisy/pull/8) połączony.** Pełny zielony [Windows run 39135310340](https://github.com/ankelmarek/AutoNapisy/actions/runs/39135310340), również równoległy push 39135306974: **166 testów TypeScript, 75 Rust, 14 integracyjnych**, instalacja i WebView2. Odbiór na 1366×700 (obszar roboczy laptopa) i 1920×1080 oraz rzeczywiste okno natywne; zrzuty przejrzane. Potwierdzone rzeczywiste przeciąganie na V3, niezależne dodawanie V3/A3, własny dźwięk, R/blokady bez restartu dekodera, mute/oczko, zwijanie/wysokość, odłączanie do A3, anulowanie/potwierdzenie usuwania i pojedynczy Undo. Po Undo sprawdzono seek/play i zdekodowane piksele V3. Zachowane zapis, odzyskiwanie po wymuszonym zakończeniu procesu i ochrona przyszłego schematu.

Test `dynamic_tracks` sprawdza trzy rzeczywiste obrazy i sześć unikalnych tonów w MLT/FFmpeg, brak zdublowanego audio przy J-cut, niezależność wyciszania V3/A3, przejście na V3, pomniejszony V3 odsłaniający V2, proxy i brakujące źródło. Te same dane JSON v11 są weryfikowane w TS i Rust. Instalator: artefakt **12140085502**, ZIP 81 126 553 B, SHA-256 `1a33912952aaa72d354cdc1bf3cd86aff1ebae828feb4df56c221e04c00b0cfd`. Model Whisper nadal wybiera się osobno jak dotychczas.

Na osi użyj **+ V** / **Dodaj ścieżkę wideo** i **+ A** / **Dodaj ścieżkę audio**. Domyślnie pozostają dwa tory każdego typu. Nowe tory dodają się niezależnie, do 16 wideo i 16 audio; V3 leży nad V2, V4 nad V3, a T pozostaje nad obrazem. Wszystkie tory i nagłówki przewijają się razem. Każdy ma blokadę, R i mute; wideo także oczko. Strzałka w nagłówku zwija tor, przycisk audio zmienia jego wysokość. Rozmiary/zwinięcie są stanem widoku, poza historią projektu.

Film można przeciągnąć z biblioteki na dowolny istniejący tor V, plik audio na tor A. Klipy można przenosić pionowo lub przez listę **Ścieżka klipu**. Przejścia działają między sąsiadami na każdym V. Dodanie i usunięcie toru oraz przeniesienie klipu zachowują Undo/Redo. Podstawowe V1/V2/A1/A2 pozostają w projekcie; dodatkowy tor można usunąć krzyżykiem w jego nagłówku. Tor z klipami wymaga potwierdzenia. Zablokowany tor jest chroniony; nie można usunąć A, do którego nadal jest podłączony dźwięk filmu — najpierw zmień trasowanie lub odłącz audio.

**Dźwięk nie wymaga pary o tym samym numerze.** Nowy film na V3 i kolejnych ma połączony dźwięk na własnym torze; przebieg i obwiednia są pod obrazem na V3. Nie tworzy to A3. W **Film / audio → Trasowanie dźwięku** można skierować dźwięk na istniejący A albo pozostawić przy obrazie. Przeciągnięcie połączonego paska dźwięku pomiędzy A zmienia trasowanie, zachowując zsynchronizowany obraz. Przeniesienie samego obrazu zachowuje wybraną trasę. **Odłącz audio → A3** tworzy osobny klip bez podwojenia miksu. Blokada toru docelowego i audio chroni edycję. Ukrywanie obrazu nie wycisza dźwięku.

Schemat **v11** zapisuje `trackLayout` (stabilne ID, typ i indeks/kolejność) oraz opcjonalne `audioRoute` klipu. Migracje TS/Rust z v1–v10 zachowują źródła i dotychczasowe trasowanie A1/A2, mute, blokady, obwiednie i przejścia. Ripple z v10 pozostaje bez zmian, v1–v9 nadal migrują z Ripple Off. Późne/puste tory pozostają domyślnie wyłączone z Ripple, jawne R działa na każdym nowym torze. Starsze RolVixa nie otworzą plików v11 — przy pierwszym zapisie użyj „Zapisz jako”, jeśli chcesz zachować kopię dla 0.21.

Ograniczenia tej wersji: maks. 100 klipów jak dotychczas, MLT 30 FPS, brak Solo i ręcznego przestawiania kolejności torów; wysokości i zwinięcia nie są jeszcze zapamiętywane po restarcie. Więcej jednoczesnych filmów zwiększa obciążenie dekoderów; proxy nadal dotyczy wyłącznie podglądu, eksport używa oryginałów. SmartCut i Export Studio pozostają osobnymi planami.

Nowe pliki: `src/trackModel.ts`, `src/tracks.ts`, `tests/dynamicTracks.test.ts`, `tests/legacyFixture.ts`, `tests/fixtures/three-tracks-v11.json`, `.test-core/tests/dynamic_tracks.rs`, `scripts/test-tracks022.mjs`. Zmiany obejmują model TS/Rust, oś, trasowanie i odłączanie, import/drop, klucze podglądu, MLT, kadrowanie, testy regresji i workflow Windows.

## Wersja 0.21 — ekran startowy i ostatnie projekty, UX C

**Ukończone, osobny [PR #7](https://github.com/ankelmarek/AutoNapisy/pull/7) połączony.** Pełny zielony [odbiór Windows 39128334953](https://github.com/ankelmarek/AutoNapisy/actions/runs/39128334953): **153 testy TypeScript, 71 Rust, 13 integracyjnych**, instalacja i rzeczywisty WebView2. Zrzuty 1366×700 (obszar roboczy laptopa) oraz 1920×1080 zostały przejrzane. Testy potwierdziły otwieranie przez ID, kolejność Open/Save/Save As, Unicode, brakujący/nowszy projekt, usuwanie tylko wpisu, preferencję po przeładowaniu, jej cofnięcie po błędzie, zapis mimo awarii historii oraz pierwszeństwo odzyskiwania po wymuszonym zakończeniu procesu. Spóźniony odczyt nie otwiera startu nad montażem.

Instalator jest artefaktem **12137396252**; ZIP 81 106 085 B, SHA-256 `2d80a84c97b1832edbbcb5d0d6da316b956e41391ad2cb54547cba8c0913c626`. Wypakuj ZIP przed uruchomieniem EXE. Narzędzia i licencje są w paczce; model Whisper wybiera się osobno jak dotychczas.

Po uruchomieniu wybierz **Nowy projekt**, **Otwórz projekt** lub jedną z maksymalnie **6 kart ostatnich projektów**. Karty pokazują nazwę, ścieżkę i datę ostatniego otwarcia lub zapisu. Kliknięcie albo Enter otwiera projekt. Krzyżyk usuwa wyłącznie wpis z historii. Brakujący lub niepoprawny plik wyświetla błąd bez zastępowania bieżącego montażu. Historię można ponownie otworzyć z **Projekt → Ostatnie projekty**, a checkbox **Pokazuj przy uruchomieniu** zapamiętuje preferencję. **Wróć do montażu** zachowuje aktywny projekt i jego Undo.

Odzyskiwanie po awarii ma pierwszeństwo przed galerią. Spóźniona odpowiedź historii nie zastępuje odzyskanego ani nowo otwartego projektu. Historia aktualizuje się dopiero po udanym ręcznym otwarciu, zapisie lub „Zapisz jako”; autozapis nie dopisuje kopii odzyskiwania. Błąd historii nie zmienia powodzenia zapisu projektu i jest pokazywany osobno. Uszkodzony lub nowszy rejestr czeka na wyraźne **Wyczyść historię**; czyszczenie nie usuwa projektów ani mediów.

Rejestr `recent-v1/projects.json` znajduje się w katalogu danych aplikacji, poza projektem: ograniczenie rozmiaru, blokada systemowa i atomowa zamiana pliku. Frontend otwiera wpis przez identyfikator nadany przez backend; nie przekazuje dowolnej ścieżki do otwarcia. Schemat projektu pozostaje **v10**, bez migracji. Karty mają graficzne symbole Tabler, ponieważ aplikacja nie ma jeszcze bezpiecznego cache miniatur projektów; nie renderują filmu ani nie odczytują go podczas wyświetlania historii. Dynamiczne V3/A3 pozostają następnym osobnym etapem.

Nowe pliki: `src/StartScreen.tsx`, `src/recentProjects.ts`, `src-tauri/src/recent_projects.rs`, `scripts/test-start021.mjs`, `scripts/test-recent-native.mjs`. Integracja obejmuje App, komendy projektu, style, testy odzyskiwania i workflow Windows.

## Wersja 0.20 — regulowany układ i galeria przejść, UX B

Przeciągnij granicę między biblioteką, podglądem i właściwościami, aby zmienić ich szerokości. Poziomy uchwyt nad osią ustawia jej wysokość. Każdy uchwyt obsługuje strzałki (Shift: większy krok), Home/End, Enter i dwuklik przywracające domyślny rozmiar; Escape anuluje aktywne przeciąganie. Minimalne rozmiary chronią podgląd i kontrolki. Przy niskiej osi tory przewijają się wspólnie z nagłówkami. Układ jest zapamiętywany lokalnie, poza JSON-em projektu i historią Undo; dopasowuje się do mniejszego okna.

**Efekty** mają kompaktowe, kwadratowe kafelki. Dwa własne obrazy A/B oraz 20 małych klipów demonstracyjnych pokazują rzeczywiste filtry xfade używane przez montaż i eksport. Podgląd uruchamia najechanie lub fokus klawiatury; jednocześnie istnieje najwyżej jeden dekoder. Długość przejścia dostosowuje tempo demonstracji. Przycisk pauzy oraz Escape zatrzymują podglądy; systemowe ograniczenie ruchu wyłącza animacje. Enter/klik wybiera efekt, a przeciąganie na łączenie sąsiednich klipów i dotychczasowa regulacja długości pozostają dostępne.

Usunięto redundantną zakładkę **Warstwy**, polecenie w pasku podglądu i nieczynne „Dodaj warstwę”. Skala, pozycja, dopasowanie i kadrowanie pozostają pod **Film / audio**. Nadal można przeciągać obraz i uchwyty w podglądzie, nakładać V2 na V1 oraz sterować widocznością torów (także T). Schemat projektu pozostaje **v10**.

Ograniczenia: demonstracje galerii pokazują własne obrazy A/B, nie klatki aktualnego montażu; bez audio. Przy wąskim oknie poniżej 820 px panele przechodzą w układ pionowy. Docelowe okno desktopowe ma minimum 960×640. Historia 6 ostatnich projektów (UX C), dynamiczne V3/A3, SmartCut oraz Export Studio pozostają osobnymi etapami.

Nowe pliki: `src/EditorWorkspace.tsx`, `src/workspaceLayout.ts`, `src/TransitionDemo.tsx`, `tests/workspaceLayout.test.ts`, `scripts/test-ux020.mjs`, `scripts/build-transition-demos.py`, `scripts/test-transition-demos.mjs`, `.test-core/tests/transition_gallery.rs` i `public/transition-demos/` (obrazy A/B, 20 MP4, manifest i opis pochodzenia). Usunięto nieużywany `src/LayersPanel.tsx`; zachowano `FrameEditor` i `TransformControls`. Wykorzystano istniejące Tabler Icons v3.35.0 i ich licencję MIT.

Odbiór 0.20: **[pełny zielony Windows run 39122531200](https://github.com/ankelmarek/AutoNapisy/actions/runs/39122531200)** — **153 testy TypeScript, 64 Rust i 13 rzeczywistych integracyjnych**, kontrola integralności galerii, produkcyjny build, instalator NSIS i próba instalacji. WebView2 potwierdził przeciąganie i ograniczenia paneli, klawiaturę/Escape/reset, odtworzenie układu po przeładowaniu, kwadratowe kafle, rzeczywiste MP4, jeden dekoder, pauzę i systemowe ograniczenie ruchu. Kadrowanie zachowuje znormalizowane współrzędne i strumień MLT podczas zmiany układu. Przeszły wcześniejsze scenariusze transkrypcji, SRT, MP4, proxy, Ripple/J/L-cut, drag/drop, Undo/Redo, zapisu i odzyskiwania po awarii. Widoki 1366×700 obszaru roboczego laptopa i 1920×1080 sprawdzono także na zrzutach. Lokalnie: 153 TS, 62 Rust core, rzeczywiste porównanie klatek 20 efektów z rendererem i build frontendu. Zmianę połączono osobnym [PR #6](https://github.com/ankelmarek/AutoNapisy/pull/6).

ZIP instalatora 0.20: **81 092 638 bajtów**, SHA-256 `2ee3e309503a5d5fe232334d83896713562b79f464b99a64ab8153076080facd`. DevTools i dialogi testowe są wyłączone w instalatorze.

## Wersja 0.19 — porządki interfejsu, UX A

Zakładka **Napisy** ma kompaktowy obszar akcji z ikonami Tabler i czytelnymi opisami „Transkrybuj po polsku” oraz „Eksport SRT”. Postęp i anulowanie pozostają w tym samym miejscu. Pusty stan krótko wskazuje następny krok; konfiguracja silnika jest w Ustawieniach.

Żółty przycisk nagłówka ma stale widoczny podpis **Eksportuj** i uruchamia dotychczasowy eksport MP4. Z osi usunięto etykietę MONTAŻ i stały opis V1/V2/audio. Pozostają kontrolki klipu, suwak czasu, timecode oraz dostępna nazwa obszaru „Montaż filmu”.

Podczas odbioru poprawiono eksport SRT transkrypcji montażu: brak napisów źródłowych nie blokuje już eksportu faktycznych napisów z osi. Puste, ukryte i wychodzące poza montaż napisy są sprawdzane przed otwarciem dialogu. Zapis nadal jest atomowy, UTF-8 z czasami montażu. Nie zmieniono schematu **v10**, Ripple, obwiedni ani trasowania dźwięku.

Zakres to etap A z [issue #4](https://github.com/ankelmarek/AutoNapisy/issues/4). Warstwy/przejścia/splittery (B) i ostatnie projekty (C) pozostają osobnymi zmianami; dynamiczne V3/A3 pozostają kolejnym dużym etapem montażu.

Odbiór 0.19: **[pełny zielony przebieg Windows 39113930634](https://github.com/ankelmarek/AutoNapisy/actions/runs/39113930634)** — **150 testów TypeScript, 64 Rust i 12 rzeczywistych integracyjnych**, produkcyjna kompilacja, instalator NSIS i próba instalacji. WebView2 potwierdził natywny plik SRT UTF-8 z polskimi znakami i czasami montażu przy pustej transkrypcji źródła, wywołania SRT/MP4 klawiaturą, widoczny eksport przy 600 px oraz układy 1366×700 obszaru roboczego laptopa i 1920×1080. Zrzuty sprawdzono wizualnie. Ponownie przeszły scenariusze MLT, transkrypcji, proxy, Ripple/J/L-cut, Undo, zapisu i odzyskiwania po wymuszonym zakończeniu procesu. Lokalnie: 150 TS, 62 Rust core i build frontendu. Instalator ma wyłączone DevTools i testowe dialogi; instrumentacja jest osobnym binarium. Lista zmienionych obszarów: `src/App.tsx`, `src/Timeline.tsx`, `src/style.css`, walidacja SRT w `src-tauri/src/subtitles.rs` / `commands.rs`, istniejące skrypty odbioru oraz manifesty wersji. Ikony i licencja Tabler MIT pochodzą z dotychczasowego podzbioru v3.35.0.

ZIP instalatora 0.19: **80 829 342 bajty**, SHA-256 `e91ab1349375743ba38eabfff0dabf4ebf3b22c3023b178528b5a1b325c49df9`. Zmiany połączono przez osobny [PR #5](https://github.com/ankelmarek/AutoNapisy/pull/5). B/C pozostają do realizacji.

## Wersja 0.18 — Ripple i odłączanie audio

- **Ripple On/Off** w belce osi. Usunięcie lub przycięcie skraca/rozsuwa dokładnie edytowany przedział; zachowuje pozostałe celowe odstępy. Zwykłe przesuwanie klipu działa jak wcześniej.
- Każdy tor ma **R·A / R+ / R−**: automat / jawnie włączone / jawnie wyłączone. Automat obejmuje tylko tory zaczynające się od 00:00 (tolerancja pół klatki); późne i puste są chronione. Globalne On nie nadpisuje ręcznych decyzji. Podpowiedź przy R wyjaśnia stan.
- **Kłódka** chroni edycję klipów danego toru. Dźwięk wbudowany w film zajmuje V oraz odpowiadający A; blokada którejkolwiek części chroni cały połączony klip.
- Przed zatwierdzeniem Ripple jest osobne okno z pozycjami przed/po, długością montażu, zmianami napisów i utraconymi przejściami. Anulowanie nie zmienia projektu. Konflikty R, blokad, przecinających klipów lub synchronizacji blokują „Zastosuj Ripple”; można poprawić ustawienia albo wybrać samo cięcie **bez Ripple**.
- **Odłącz audio → A1/A2** w menu prawego przycisku klipu lub panelu filmu. Osobne audio zachowuje źródło, zakres, głośność, punkty i fade’y; obraz przestaje odtwarzać dźwięk. Jeśli pierwotny dźwięk był wyciszony przez tor V lub A, odłączony klip otrzymuje głośność 0 — można ją później podnieść.
- **J-cut / L-cut:** wyłącz Ripple, zaznacz osobny klip audio i przeciągnij jego lewy brzeg przed obraz lub prawy za obraz. Zakres ogranicza faktyczna długość źródła. Liczbowe In/Out zatwierdzaj Enter lub opuszczeniem pola (Esc anuluje). Przesunięcie synchronizacji jest w panelu; „Zsynchronizuj audio z obrazem” wyrównuje źródłowy czas, zachowując niezależne przycięcia.
- Odłączając dźwięk filmu z przejściem, zachowujemy jego liniowy miks w źródłowej obwiedni. Można ją jawnie usunąć w panelu audio; późniejsza zmiana przejścia wideo nie steruje odłączonym dźwiękiem.
- Operacja zatwierdzona to **jeden krok Undo/Redo**. R, blokady, powiązania i odłączenie zapisują się w **schemacie v10**; import v1–v9 automatycznie wyłącza globalne Ripple. Starsza aplikacja nie otworzy v10 — przed nadpisaniem zachowaj kopię projektu.

Ograniczenia 0.18: nadal V1/V2 i A1/A2, 100 klipów i 30 FPS. Ripple działa przy usuwaniu oraz przycinaniu klipów, nie przy importowaniu/przesuwaniu ani przy samym skracaniu kart napisów. Nie przycina po cichu klipów innych torów przecinających usuwany przedział. Takie konflikty wymagają ręcznego cięcia lub wyłączenia R. Napisy pochodzące ze źródła nadal odnoszą się do obrazu; po zmianie treści słyszalnej przez J/L-cut warto ponownie transkrybować końcowy montaż. Niezależne napisy T wymagają odpowiedniego R lub ręcznej korekty. Nie łączy ponownie audio z wideo w jeden klip; dostępne jest wyrównanie synchronizacji. SmartCut i dynamiczne V3/A3 pozostają następnymi osobnymi etapami.

Odbiór 0.18: **[pełny zielony przebieg Windows 39105640931](https://github.com/ankelmarek/AutoNapisy/actions/runs/39105640931)** — **150 testów TypeScript, 62 Rust i 12 rzeczywistych integracyjnych**, produkcyjny build, instalacja NSIS i WebView2. Sprawdzono Ripple (podgląd/anulowanie/zatwierdzanie, późne tory, konflikty), trim, blokady, odłączenie/J/L-cut, synchronizację, Undo/Redo, trwały zapis v10, przełączanie R bez restartu dekodera oraz 1366×700 obszaru roboczego laptopa i 1920×1080. Ponownie przeszły testy proxy, Openverse, transkrypcji montażu, eksportu i odzyskiwania po awarii procesu. Naprawiono wyścig przy Ctrl+O bezpośrednio po zapisie — decyzja o niezapisanych zmianach czyta bieżący stan zapisu.

ZIP instalatora: **80 839 708 bajtów**, SHA-256 `0d8d46a7e5457cb3f16b4914510f27839d4e6bf0295b3ea37ca7e1035f8946f7`. Źródła binariów i licencje są dołączone. Instrumentację WebView2 zbudowano oddzielnie; instalator ma wyłączone DevTools i testowe dialogi. Lokalnie Linux: 150 TS, 60 Rust core i 3 rzeczywiste testy audio MLT/FFmpeg; pełną aplikację i instalator zweryfikowano na Windows.

Nowe pliki 0.18: `src/ripple.ts`, `src/RipplePreview.tsx`, `src/detachedAudio.ts`, `schemas/project-v10.schema.json`, `tests/ripple.test.ts`, `scripts/test-edit018.mjs`. Zmodyfikowano model i parser TS/Rust, oś, inspektor, ochronę kadrowania, wspólny model audio oraz testy MLT/FFmpeg i WebView2. Użyte ikony kłódek pochodzą z tego samego oficjalnego Tabler Icons v3.35.0 (MIT); licencja pozostaje w `licenses/Tabler-Icons-MIT.txt`.

## Wersja 0.17 — odzyskiwanie i wybór ujęć

- Kopia odzyskiwania po 1,5 s od ostatniej zmiany, najpóźniej po 10 s ciągłej edycji. Ponowna próba po błędzie następuje po 30 s. Przy zamykaniu okna kopia jest domykana; błąd przy niezapisanych zmianach zatrzymuje zamknięcie i pozwala zapisać projekt ręcznie.
- Dwie atomowe kopie JSON w katalogu danych aplikacji `recovery-v1` (`current.json`, `previous.json`); każda zawiera projekt do 16 MiB, bez nagrań. Kopie obejmują kadrowanie, napisy i automatykę audio, bez cache proxy. OS blokuje równoległy dostęp drugiej instancji i zwalnia blokadę również po awarii. Po restarcie aplikacja usuwa wyłącznie własne niedokończone pliki tymczasowe, zachowując zatwierdzone kopie.
- Po ponownym uruchomieniu: **Odzyskaj**, **Otwórz zapisany projekt**, **Odrzuć kopię**. Widać czas kopii i bieżącego zapisu ręcznego. Uszkodzona najnowsza kopia pozwala wrócić do poprzedniej. Gdy żadnej kopii nie można odczytać (także z powodu nowszego schematu), pozostają na dysku do wyraźnego odrzucenia; można zamknąć okno i wrócić w nowszej wersji. Braki mediów są zgłaszane bez usuwania montażu. Odzyskiwanie otwiera stan jako niezapisany projekt; pierwszy zapis wymaga wyboru pliku, chroniąc dotychczasowy zapis.
- W zakładce **Pliki** przesuwanie myszy po miniaturze pokazuje klatki źródła. Miniatury dekoduje FFmpeg przez pojedynczą kolejkę: cache 160 klatek, kroki 0,5 s, ograniczenie wywołań i pomijanie nieaktualnych żądań. Nie zmienia to głowicy ani historii montażu.
- Kliknij miniaturę (także klawiaturą Enter), aby otworzyć oznaczony **Źródło** podgląd MLT. Obsługuje wideo i własne audio, korzysta z dostępnego aktywnego proxy, zachowuje czas źródła i nie wymaga obsługi kodeka oryginału przez WebView2. Oś montażu zostaje zatrzymana.
- Przewiń źródło, naciśnij **I** (początek) i **O** (koniec) lub użyj przycisków/pól sekundowych. Spacja odtwarza źródło, strzałki przewijają o klatkę 30 FPS (Shift: sekunda), Esc wraca do montażu. Pokazany zakres i długość dotyczą oryginalnego źródła.
- **Dodaj zaznaczony fragment** wstawia wybrany przedział w pozycji głowicy montażu; przycisk można też przeciągnąć na V1/V2 albo A1/A2 dla audio. Zachowane są reguły umieszczania i przyciągania istniejącej osi. Jeden krok Undo usuwa cały dodany klip. Zwykły **+** na karcie nadal dodaje cały plik. I/O są pamiętane tylko w bieżącej sesji biblioteki i nie zmieniają schematu v9.

Ograniczenia: utrata zasilania przed pierwszą kopią może utracić ostatnie 1,5–10 s; kopie są dodatkowym zabezpieczeniem, nie kopią zapasową nagrań. Jedna instancja naraz korzysta z odzyskiwania; druga pokazuje błąd i wymaga zapisu ręcznego. Podgląd źródła przełącza wspólny silnik MLT, więc pierwsza klatka i dalsze przewinięcie poza bufor wymagają przygotowania strumienia. Nie ma tu J/L-cut, Ripple ani SmartCut.

Nowe pliki tej iteracji:

- Frontend: `src/SourceViewer.tsx`, `src/sourceSelection.ts`, `src/thumbnailFrames.ts`, `src/projectRecovery.ts`, `src/RecoveryDialog.tsx`.
- Rust: `src-tauri/src/recovery.rs`, `src-tauri/src/source_preview.rs`.
- Testy: `tests/sourceSelection.test.ts`, `tests/projectRecovery.test.ts`, `.test-core/tests/source_range.rs`, `scripts/test-recovery-restart.mjs`.

Odbiór 0.17:

- **[Pełny przebieg Windows — wszystkie kroki zielone](https://github.com/ankelmarek/AutoNapisy/actions/runs/39097201488)**: **125 TypeScript, 59 Rust, 11 rzeczywistych testów integracyjnych**, kompilacja produkcyjna, instalacja NSIS i cały odbiór w WebView2.
- UI: podgląd źródła MLT, I/O, przeciąganie fragmentów i całych plików, Undo, zapis mimo błędu autozapisu, anulowanie dialogu, wymuszona awaria procesu i ponowne uruchomienie, ochrona kopii przyszłego schematu oraz 1366×700 obszaru roboczego laptopa i 1920×1080. Eksport wybranego zakresu sprawdzono przez rzeczywiste MLT i FFmpeg: czas, klatki oraz obecność audio.
- ZIP instalatora: **80 806 310 bajtów**, SHA-256 `5d9ddbd1ad34ccc7099600f7805e3b3dfae1b98c6b85eca25eb0054c3c31938a`. Do pobrania z Actions wymagane jest zalogowanie na GitHub.
- Lokalnie: 125 TS, 57 testów Rust core i rzeczywisty test FFmpeg/MLT zakresu źródła; kompilację całej aplikacji i instalatora sprawdzono na Windows, nie w środowisku Linux.

Ripple i odłączanie audio/J/L-cut wykonano w 0.18; następny priorytet: dynamiczne V3/A3 zgodnie z ROADMAP.

## Aktualizacja i uruchomienie ze źródeł

Zachowaj projekty i nagrania. Pobierz ZIP z GitHuba i rozpakuj do nowego folderu, np. `C:\RolVixa-0.20`. Nie kopiuj starych `node_modules`, `dist` i `src-tauri/target`. Aplikacja 0.20 otwiera projekty v1–v10 i zapisuje format v10. Przed zapisaniem zachowaj kopię JSON, jeśli chcesz wrócić do starszej wersji aplikacji.

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
- **Usuń ujęcie** / Delete usuwa zaznaczony fragment i pozostawia przerwę. **Ripple wł.** natychmiast domyka tylko edytowany przedział na uczestniczących torach; nie usuwa wszystkich przerw. Gdy oś jest pusta, **Przywróć cały film** dodaje pełne źródło, zachowując oryginalną transkrypcję.
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
- Zatrzymaj odtwarzanie i zaznacz film w podglądzie lub na osi. Od 0.20 regulację kadru znajdziesz w „Film / audio”. Przeciągaj obraz, aby przesuwać kadr; uchwyty narożników zmieniają skalę. Shift ogranicza przesuwanie do jednej osi. Panel „Kadr warstwy” udostępnia skalę 10–400%, położenie X/Y, Dopasuj, Wypełnij i Wyśrodkuj. Każdy klip ma niezależny kadr, zapisywany w projekcie i zachowywany po cięciu. Ctrl+Z cofa zatwierdzony gest. Podczas przejścia zatrzymaj głowicę poza efektem, aby kadrować pojedynczy film.
- Podczas edycji zatrzymanego obrazu pokazywane są rzeczywiste klatki warstw wyodrębnione przez FFmpeg. Odtwarzanie i eksport składa MLT z adapterem affine; przejścia FFmpeg otrzymują te same parametry kadru. Podgląd roboczy pozostaje ograniczony do 540 px.
- W 0.12 panel „Warstwy” pokazywał napisy T i klipy V1/V2. W 0.20 usunięto tę redundantną listę oraz nieczynne opcje dodawania tekstu, grafiki, naklejek i animacji. Widoczność T/V1/V2 kontrolują oczka na osi; silnik warstw i kadrowanie pozostają dostępne.
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
