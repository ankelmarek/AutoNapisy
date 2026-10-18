# Kolejne etapy RolVixa

## Wykonane w 0.21 — UX C (ukończone)

- [x] Ekran startowy, sześć ostatnich projektów, Nowy/Otwórz, usuwanie wpisu i preferencja startowa.
- [x] Backendowy rejestr ID, atomowy zapis i blokada; błędy historii nie blokują zapisu projektu.
- [x] Pierwszeństwo odzyskiwania i ochrona przed spóźnioną odpowiedzią historii; schemat nadal v10.
- [x] Testy rejestru, brakujących/nowszych plików, restartu, klawiatury i dwóch rozdzielczości.
- [x] Osobny PR #7 połączony; pełny zielony Windows run 39128334953: 153 TS, 71 Rust, 13 integracyjnych, instalator 12137396252, instalacja i WebView2 1366×700 / Full HD. Zrzuty sprawdzone; potwierdzone restart/odzyskiwanie, błędy historii, klawiatura i cofnięcie preferencji po błędzie zapisu.

Karty używają symboli Tabler do czasu powstania cache miniatur projektów. Po odbiorze kolejnym dużym etapem pozostają dynamiczne V3/A3 (issue #3).

## Wykonane w 0.20 — UX B (ukończone)

- [x] Regulowane szerokości trzech paneli i wysokość osi; minima, klawiatura, Escape, reset i lokalny zapis układu poza projektem.
- [x] Kwadratowe kafle z dwoma obrazami i rzeczywistymi demonstracjami wszystkich 20 xfade; pojedynczy dekoder, pauza i ograniczenie ruchu.
- [x] Usunięta redundantna zakładka Warstwy; zachowane FrameEditor, TransformControls i widoczność torów.
- [x] Test integralności zasobów oraz porównanie demonstracji z właściwym rendererem montażu.
- [x] Osobny PR #6 połączony; pełny zielony Windows run 39122531200: 153 TS, 64 Rust, 13 integracyjnych, instalator 12134394783, WebView2 i zrzuty 1366/Full HD. Potwierdzone gesty/klawiatura, trwałość układu, pojedynczy dekoder i ograniczony ruch, MLT/kadrowanie, eksport, zapis i odzyskiwanie. UX C pozostaje osobno; schemat nadal v10.


## Wykonane w 0.19 — UX A (ukończone)

- [x] Kompaktowe akcje napisów: istniejące ikony Tabler i tekst, postęp/anulowanie w jednym obszarze.
- [x] Krótki empty-state, zachowany osobny stan pustej osi, bez technicznych objaśnień o silniku.
- [x] Usunięte dekoracyjne MONTAŻ i opis V1/V2/audio; kontrolki i semantyka osi zachowane.
- [x] Widoczny podpis Eksportuj na żółtym przycisku, z dopasowaniem do mniejszego okna.
- [x] Naprawiony warunek eksportu SRT z transkrypcji montażu, test pustego źródłowego transcriptu i granic.
- [x] Pełny zielony Windows/WebView2 run 39113930634: 150 TS, 64 Rust, 12 integracyjnych; instalator 12131567187, rzeczywisty plik SRT UTF-8 i zrzuty 1366/Full HD. Osobny PR A: #5, połączony. Etapy B/C oraz V3/A3 pozostają poza tą wersją.


## Wykonane w 0.18 — Ripple i niezależne audio (ukończone)

- [x] Globalne Ripple On/Off i zapisane per-tor auto/on/off, automatyczna ochrona późnych/pustych ścieżek.
- [x] Usuwanie i oba brzegi trim z zachowaniem celowych luk, podgląd przed/po, konflikty i opcja wykonania bez Ripple.
- [x] Blokady torów, ochrona połączonego i odłączonego audio, napisy źródłowe przesuwane raz i niezależne T według R.
- [x] Odłącz audio na A1/A2 bez dublowania miksu, źródłowe obwiednie oraz zachowanie miksu istniejących przejść.
- [x] Niezależne J-cut/L-cut przez trim audio, przesunięcie synchronizacji i świadome wyrównanie; pojedynczy Undo/Redo.
- [x] Schemat v10 i migracje v1–v9; 150 testów TS, 60 rdzenia Rust i rzeczywisty miks/eksport MLT/FFmpeg lokalnie.
- [x] Pełny zielony odbiór Windows: run 39105640931; 150 TS, 62 Rust, 12 integracyjnych, instalacja i WebView2 1366/Full HD. Instalator: artefakt 12128183979.

Zakres: Ripple przy usuwaniu i przycinaniu klipów, bez automatycznego cięcia przecinających elementów innych torów. Import i zwykłe przesuwanie zachowują dotychczasową semantykę. Konflikty wymagają decyzji; szczegóły ograniczeń w README.

**Następny priorytet: dynamiczne V3/A3 i kolejne tory, issue #3.** Zachować wdrożone reguły R/blokad, trasowanie i brak zdublowanego dźwięku. SmartCut oraz Export Studio nadal osobno.

## Zatwierdzona paczka UX - uporządkowanie interfejsu

**Zebrano i zamknięto uwagi użytkownika 18.10.2026.** Pełna, techniczna specyfikacja wraz z kryteriami testów: **[issue #4 - poprawki interfejsu](https://github.com/ankelmarek/AutoNapisy/issues/4)**. Nie wdrażać wszystkiego naraz i nie zakłócać prac nad silnikiem montażu.

- **Etap A, wykonany w 0.19 / PR #5:** uprościć zakładkę napisów, usunąć zbędny tekst o zakresie montażu i o Whisperze w empty-state; dodać czytelne ikony Tabler do „Transkrybuj po polsku” i „Eksport SRT”, zachowując tekst; usunąć etykietę „MONTAŻ” na dolnej osi oraz stale wyświetlane objaśnienie V1/V2 i audio; do żółtego przycisku w nagłówku dopisać „Eksportuj”.
- **Etap B, wykonany w 0.20 / PR #6:** usunąć mylącą zakładkę/polecenie „Warstwy” i niedziałające „Dodaj warstwę” (bez usuwania warstw obrazu, transformacji i ukrywania torów); zachować kadrowanie pod „Film / audio”. Przerobić duże karty efektów na siatkę kompaktowych kwadratowych kafli, z dwoma obrazami demo i faktycznym, lekkim podglądem danego przejścia. Dodać bezpieczne, ograniczone przeciąganie granic paneli z zapisem układu lokalnie.
- **Etap C, wykonany w 0.21 / PR #7:** galeria **6 ostatnich projektów** po uruchomieniu RolVixa, z kartami i akcjami „Nowy” / „Otwórz”. Okno odzyskiwania po awarii z 0.17 ma pierwszeństwo; historia opiera się o bezpieczny, backendowy rejestr plików, bez przenoszenia mediów.
- [x] Odbiór A/B/C: layout laptop / Full HD, klawiatura, ARIA, istniejące testy MLT, transkrypcji, SRT, MP4 oraz save/recovery. Szczegóły i dokładne rozdzielczości obszaru roboczego w README.

**Pozycja w planie:** małe poprawki A wykonać przy najbliższej bezpiecznej okazji; większe B i C w oddzielnych przetestowanych aktualizacjach. **Nie zmienia to przyjętej kolejności dużych etapów: Ripple/J/L-cut przed V3/A3.**

## Wykonane w 0.17 — odzyskiwanie i podgląd źródła/I/O

Użytkownik połączył punkty 9 oraz 1+2 w jedną wersję. Wdrożono:

- [x] Dwie atomowe kopie, oddzielone od zapisu ręcznego; blokada OS i sprzątanie niedokończonych tempów.
- [x] Odzyskiwanie po awarii procesu, otwarcie zapisu ręcznego lub wyraźne odrzucenie; ochrona nowszego schematu i błędy autozapisu bez blokowania ręcznego zapisu.
- [x] Scrubbing miniaturek FFmpeg: pojedyncza kolejka, pomijanie nieaktualnych zadań, cache i proxy.
- [x] Osobny podgląd źródła MLT, zakres I/O, dokładne pola, dodawanie przyciskiem/przeciąganiem wybranego przedziału i pojedynczy Undo. Schemat pozostaje v9.
- [x] Pełny zielony odbiór Windows: run 39097201488 — 125 TS, 59 Rust, 11 integracyjnych, kompilacja, instalator i WebView2 1366/Full HD. Potwierdzone wymuszona awaria, nowsze kopie i zapis przy błędzie autozapisu. README zawiera link i ograniczenia.

Ripple i odłączanie audio/J/L-cut wdrożono w 0.18. Po jego odbiorze priorytetem są V3/A3 zgodnie z decyzją użytkownika poniżej.

## Plan kolejnych etapów - ustalona kolejność

1. **Autozapis i odzyskiwanie sesji** - wykonane w 0.17.
2. **Podgląd źródeł i In/Out** - wykonane razem z odzyskiwaniem w 0.17.
3. **Ripple Edit oraz odłączanie audio / J-cut / L-cut** - wykonane w 0.18 (ukończone), **najpierw** na obecnych V1/V2 i A1/A2. Reguły Ripple per ścieżka, automatyczna ochrona torów zaczynających się po 00:00, świadoma kontrola synchronizacji. Projektować algorytm bez założenia stałej liczby torów.
4. **Dynamiczne V3/A3 i kolejne tory** - **istotny priorytet po Ripple/J/L-cut**, domyślnie zachować prostą oś 2+2; nowe tory dodawane niezależnie przyciskami. Rozszerzyć już działające zasady Ripple na nowe tory.
5. **Dalsze funkcje** - zastępowanie źródeł, kontrola przed eksportem, SmartCut i Export Studio w osobnych etapach.

Kolejność 3 → 4 jest wyraźną decyzją użytkownika: **najpierw Ripple, potem więcej ścieżek**. [Issue #3 - dynamiczne tory](https://github.com/ankelmarek/AutoNapisy/issues/3) nie może blokować prac nad Ripple.

## Wykonane w 0.16 — fade i automatyka głośności

- [x] Obwiednia w schemacie v9, źródłowe czasy i zachowanie po trim/split/copy/Undo.
- [x] Łagodne fade in/out, nakładanie przez mnożenie, klawiatura i dokładne pola czasu.
- [x] Alt+klik, romby czas/poziom, menu/Delete, edycja liczbowa i jeden krok historii na gest.
- [x] Wspólny model MLT/FFmpeg/eksportu/transkrypcji; rzeczywiste testy RMS, przewijania, cięcia, miksu i mute.
- [x] Odbiór Windows/WebView2 i instalator: run 39069356974; 115 TS, 54 Rust, 10 integracyjnych. Paczka i ograniczenia opisane w README.

## Wykonane w 0.15 — nagłówek i poprawny zapis projektu

**Wdrożone zgodnie z zatwierdzonym zakresem** po 0.14/proxy, a przed zaawansowanym audio, SmartCut i Export Studio: nowy nagłówek oraz właściwe `Zapisz` / `Zapisz jako`. Pełne kryteria i testy: **[issue #2 - nowy nagłówek i zapis](https://github.com/ankelmarek/AutoNapisy/issues/2)**.

- [x] Przenieść menu **Projekt ▼** bezpośrednio obok logo RolVixa; tekstowe pozycje `Zapisz` / `Zapisz jako...` pozostają w menu.
- [x] Na prawym końcu belki: dwie **ikonowe**, zawsze widoczne akcje: **Zapisz** (dyskietka; kolor statusu) i **Eksportuj** (większy żółty przycisk z ikoną; na początek obecny eksport MP4). Używać Tabler Icons, czytelnych tooltipów, aria-label i skrótów.
- [x] Status zapisu: **zielony** - zapisano; **żółty** - niezapisany / są zmiany; **niebieski** - trwa zapis; **czerwony** - błąd. Stan wynika ze skutku rzeczywistej operacji i rewizji projektu, nie tylko z timera.
- [x] **Ctrl+S**: pierwszy zapis pyta o plik; wszystkie następne zapisują do zapamiętanej ścieżki bez dialogu. **Ctrl+Shift+S**: `Zapisz jako` zawsze pyta o nazwę i po sukcesie ustawia nową aktywną ścieżkę. Wybrać zabezpieczony, atomowy zapis i ochronę przed konfliktem z modyfikacją zewnętrzną; żadnych dowolnych ścieżek zapisu z frontendu.
- [x] Nazwa projektu jako wyraźny tytuł z **ołówkiem**. Kliknięcie tytułu/ołówka włącza edycję (Enter/zatwierdź, Esc/anuluj), zmiana nazwy nie zmienia nazwy istniejącego pliku na dysku.
- [x] Testy 1366×768, Full HD, skrótów, menu i edycji tytułu, projektu świeżego i otwartego, anulowania i błędów zapisu, danych niezapisanych podczas zapisywania; zachować kompatybilność starszych projektów.
- [x] Ukończyć jako osobną, przetestowaną zmianę/PR, **nie doklejać do trwającego proxy**. Docelowy panel z presetami eksportu to **[odłożone issue #1](https://github.com/ankelmarek/AutoNapisy/issues/1)**, bez zmiany zakresu tego zadania.

## Wykonane w 0.14 — proxy i biblioteka

- [x] Proxy SDR H.264/AAC: diagnostyka FFprobe, automatyczne przygotowanie wymagających źródeł, profile 540p/720p, kolejka, rzeczywisty postęp i anulowanie.
- [x] Trwały cache z identyfikacją źródeł, limitem 8 GiB, kontrolą miejsca i czyszczeniem; przełączanie oryginał/proxy w podglądzie MLT i miniaturach.
- [x] Eksport i transkrypcja z oryginałów; proxy nie zmienia projektu ani czasów montażu.
- [x] Siatka miniaturek i zielony znacznik użycia źródła, aktualizowany z osi oraz Undo/Redo.
- [x] Regulowane, przybliżone strefy Reels/TikTok/Shorts w podglądzie 9:16, poza eksportem.
- [x] Czytelna pełna długość utworu Openverse i poprawiona warstwa okna ustawień.
- [ ] Rozszerzenie proxy o świadomą konwersję HDR→SDR i dalsze pomiary wydajności. 0.14 pozostawia wykryte PQ/HLG na oryginale.

Kryteria i ograniczenia profilu 0.14 oraz instrukcja użytkownika są w README. P1 z issue #2 wykonano jako osobną zmianę 0.15. Pełny przebieg Windows 39066339364 przeszedł; instalator i wyniki są w README.

## Biblioteka audio — wykonane w 0.12, rozszerzone w 0.13

- [x] Muzyka Openverse: wyszukiwanie frazą, pobieranie i dane autora/licencji.
- [x] Kenney Interface Sounds: 100 efektów CC0, odsłuch i przeciąganie na A1/A2.
- [x] Moje audio: ręczny import wielu plików bez automatycznego dodawania na oś.
- [x] 0.13: odsłuch wyniku Openverse przed importem; tymczasowy, ograniczony cache, anulowanie i szybkie przełączanie.
- [x] 0.13: pozycja i głośność odsłuchu oraz kategorie Kenney.
- [x] 0.13: przebieg audio dopasowany do pełnej wysokości klipu, bez zmiany głośności.
- [x] 0.13: Tabler Icons jako wspólny zestaw ikon całego interfejsu.
- [ ] Miniatury przebiegu w samej bibliotece własnego audio.
- [ ] Rozbudowane filtrowanie i ulubione nagrania.

Openverse łączy się z internetem po wyszukaniu frazy; dostęp realizują kontrolowane komendy Rust. Odsłuch nie dodaje pliku ani klipu do projektu. Kenney i własne pliki działają offline.

## Kolejność po proxy

Proxy SDR wdrożono w 0.14, a P1 (nagłówek i zapis) w 0.15. Dalszy kierunek: fade in/out i automatyka głośności zgodnie z planem audio poniżej. SmartCut i Export Studio pozostają osobnymi przyszłymi etapami.

## SmartCut: inteligentny podgląd i propozycje cięcia (planowane)

Cel: przyspieszyć precyzyjny montaż bez zastępowania decyzji użytkownika. SmartCut jest asystentem osi czasu, **nie** montażem przez edycję transkrypcji. Żadna analiza ani odsłuch propozycji nie zmienia projektu przed jednoznacznym zatwierdzeniem.

### SmartCut 0.1: podgląd i świadome zatwierdzanie

1. Użytkownik zaznacza na osi czasu przybliżony zakres do usunięcia albo złączenie, które chce poprawić. Zakres i pozycje granic są widoczne; można je korygować także ręcznie z dokładnością do klatki.
2. Program proponuje trzy **opcjonalne** warianty: „Dokładne” (granice bez korekty), „Naturalne” (granice przesunięte do wiarygodnej pauzy / granicy wypowiedzi) i „Wygładzone” (naturalne granice oraz krótki crossfade audio, jeśli ma zastosowanie).
3. W panelu porównawczym użytkownik może odsłuchać i obejrzeć kilka sekund **przed i po proponowanym połączeniu**, odtworzyć fragment w pętli oraz natychmiast przełączyć wariant. Pokazać faktyczne granice i ich przesunięcia względem ręcznego zaznaczenia, nie jedynie opisową ocenę.
4. Analiza w pierwszym etapie bazuje na energii/pausach dźwięku (np. FFmpeg) oraz wiarygodnych czasach segmentów lub słów Whisper. Nie wolno przesuwać granic w połowie wyrazu na podstawie zgadywanego czasu; przy brakujących danych zaproponować wariant dokładny i ograniczone wskazówki zamiast fałszywej precyzji.
5. Podgląd jest generowany z **tymczasowego wariantu montażu** ograniczonego do krótkiego fragmentu i nie wymaga renderowania całego projektu. W miarę możliwości wykorzystać istniejący graf MLT, ale sprawdzić zgodność podglądu z finalnym eksportem.
6. Dopiero „Zastosuj cięcie” wykonuje jedną odwracalną operację na istniejącym modelu projektu; „Anuluj” nie wprowadza zmian. Obsłużyć Undo/Redo, dosuwanie klipów, przesunięcie napisów i konsekwencje dla pozostałych ścieżek zgodnie z regułami obecnego edytora. Przed zastosowaniem wyraźnie pokazać, które elementy się przesuną.
7. Szczególne przypadki: początek/koniec klipu, bardzo krótki zakres, brak audio, mowa na muzyce, zmiana źródła i granica przejścia, nakładające się ścieżki, niepewna transkrypcja, anulowanie w czasie renderowania podglądu i brak dostępnego MLT. Nie wykonywać „inteligentnych” korekt bez wystarczających danych.

### SmartCut 0.2: ocena obrazu (po stabilizacji 0.1)

1. Porównywać klatki w sąsiedztwie proponowanego cięcia; sygnalizować możliwy skok pozycji/kompozycji, ale nie orzekać automatycznie, że cięcie jest błędne.
2. Opcjonalnie zaproponować przesunięcie granicy lub przykrycie cięcia przebitką. Nigdy nie dodawać przebitki ani przejścia bez potwierdzenia.
3. Ocenę przedstawiać jako czytelną wskazówkę z możliwością podejrzenia wyniku, nie jako nieuzasadniony procent „jakości”.

### Kryteria odbioru

1. Każdy wariant ma identyczny efekt w podglądzie i wyeksportowanym filmie, z uwzględnieniem audio i napisów.
2. Przełączanie wariantów i anulowanie nie zapisuje zmian w projekcie ani nie narusza materiałów źródłowych.
3. Zatwierdzenie tworzy pojedynczy krok Undo; ponowne otwarcie projektu zachowuje prawidłową oś czasu.
4. Testy jednostkowe granic i synchronizacji oraz integracyjne z prawdziwym FFmpeg/MLT; sprawdzić też ręcznie naturalność łączenia wypowiedzi i responsywność podglądu na typowych nagraniach.
5. Nie pogarszać działania istniejących narzędzi cięcia. W razie niedostępności analizy przycisk zwykłego, dokładnego cięcia pozostaje dostępny.

Status: **do zaplanowania i implementacji**, bez zmiany priorytetów bieżących prac nad stabilizacją RolVixa.

## Proxy wideo: inteligentny import i płynny montaż (SDR wdrożone w 0.14)

**Cel:** płynny montaż popularnych formatów (MOV, MP4, MKV, WEBM, AVI, M4V), w szczególności wymagających kodeków HEVC/H.265, ProRes, rozdzielczości 4K i nagrań 50/60 FPS. Praca na lekkich kopiach lokalnych, a finalny eksport z **oryginalnych źródeł**. Samo rozszerzenie pliku nie gwarantuje poprawnego dekodowania.

### Etap 1: inteligentna diagnostyka importu

1. Odczyt metadanych przez FFprobe: kontener, kodek i profil, rozdzielczość, nominalny/średni FPS, czas trwania, orientacja, ścieżki audio, informacje HDR i kolorystyczne oraz możliwe VFR (bez zgadywania).
2. Program proponuje przygotowanie proxy po wykryciu wymagającego materiału, braku obsługi w podglądzie albo na żądanie użytkownika; możliwość pracy na oryginale.
3. W bibliotece media mają status: Oryginał, Proxy w przygotowaniu, Proxy gotowe, Błąd proxy. Pokazać postęp, anulowanie, ponowienie oraz zarządzanie przełączaniem źródła.
4. Generowanie nie blokuje montażu innych klipów; nie wysyłamy plików do sieci.

### Etap 2: generator i cache proxy

1. Pierwszy profil proxy: lokalne MP4 H.264 SDR w 540p lub 720p (z zachowaniem proporcji i poprawnym audio), dobrane pod obsługiwane dekodery MLT/WebView2; profile porównać na testowych nagraniach.
2. Zachować deterministyczne powiązanie oryginał ↔ proxy, na podstawie stabilnego identyfikatora, cech pliku i profilu. Wykrywać zmienione/usunięte oryginały i nie używać nieaktualnej kopii.
3. Stosować spójne mapowanie czasu, orientacji i numerów klatek; szczególnie sprawdzić źródła VFR, 60 FPS, obrót i synchronizację audio/napisów. Proxy nie może zmieniać długości czy kolejności zdarzeń w projekcie.
4. Ustalić limit miejsca cache, wykrywać brak miejsca, usuwać osierocone kopie za potwierdzeniem i chronić pliki aktualnie wykorzystywane przez projekty. Oryginały pozostają nietknięte.

### Etap 3: podgląd z proxy, eksport z oryginału

1. Podgląd MLT i miniatury wykorzystują wybrane proxy, a cięcia, przejścia, keyframes i napisy odnoszą się do oryginalnej osi czasu.
2. Eksport MP4 i transkrypcja mają korzystać z oryginalnego audio/wideo (nie degradować wyniku przez proxy). Jeśli oryginał zniknął, program zgłasza brak źródła zamiast eksportować z proxy bez zgody.
3. Automatycznie wracać do oryginału lub zgłaszać błąd przy brakującym/uszkodzonym proxy; bez utraty stanu projektu, ręcznych cięć, warstw i licencji audio.
4. W przyszłości dodać profile konwersji SDR/HDR i świadome zarządzanie barwami, bez deklarowania zachowania HDR dopóki nie ma wdrożonych testów.

### Testy i kryteria odbioru

1. Próbki: MOV H.264, MOV HEVC z iPhone'a, MP4 H.264/H.265, MKV, WEBM i AVI, ProRes, 4K, 60 FPS, VFR, pionowe filmy z obrotem, pliki bez audio i ścieżki Unicode.
2. Porównać wynik eksportu (z oryginału) i podglądu (proxy) pod kątem synchronizacji, kadrowania, długości, pozycji cięć, przejść i napisów.
3. Sprawdzić tworzenie, przerwanie, ponawianie, regenerację po zmianie źródła, otwieranie zapisanego projektu, brak miejsca oraz czyszczenie pamięci.
4. Nie zmieniać źródeł i nie blokować dotychczasowego importu w razie awarii generatora.
5. Dodać testy integracyjne FFmpeg/MLT i testy UI do CI, bez zmuszania użytkownika do ręcznej konwersji.

Status: **profil SDR wdrożony w 0.14**. Zarządzanie barwami HDR i dalsze pomiary pozostają rozszerzeniem; szczegóły i ograniczenia wydania w README.

## Edycja audio i siatka mediów — wykonane w 0.14/0.16

Siatkę i znacznik użycia wdrożono w 0.14; fade in/out oraz automatykę przez Alt+klik w 0.16. Kontrolki korzystają z Tabler Icons. Pozostają przyszłe rozszerzenia: podpowiedzi pauz/snap audio i dalszy rozwój odsłuchu zmian w trakcie gestu.

### A. Punkty głośności na osi audio — wykonane w 0.16

- **Alt+klik** na linii głośności klipu audio dodaje punkt w dokładnym czasie kliknięcia, bez przesuwania klipu i głowicy. Obsługiwać również dźwięk powiązany z klipem wideo na A1/A2.
- Punkt można przeciągać **pionowo** (poziom) i **poziomo** (czas), z ograniczeniem do długości klipu i kolejności sąsiadujących punktów. Pokazywać czas oraz realną głośność (procent, opcjonalnie dB). Wymagana precyzyjna edycja, obsługa klawiatury i usuwanie punktu z menu kontekstowego/Delete.
- Linia ma przedstawiać rzeczywistą obwiednię; odcinki między punktami na początek interpolowane liniowo. Dodanie punktu bez przesunięcia nie może zmienić dźwięku. Brak punktów zachowuje aktualne działanie pojedynczej wartości `clip.volume`.
- Model danych powinien rozdzielać bazową głośność klipu, punkty automatyki i fade. Proponowana semantyka: `wynik = clip.volume × envelope(t) × fadeIn(t) × fadeOut(t)` (oraz istniejące mute ścieżek). Definicje i wyświetlana linia powinny być spójne w frontendzie, MLT, eksporcie i transkrypcji.
- Zapis i odczyt w nowym schemacie projektu z migracją starszych projektów. Uwzględnić Undo/Redo (jeden gest to jeden krok), kopię/duplikowanie, przesuwanie, przycinanie, dzielenie, zmianę prędkości jeśli dojdzie, oraz powrót po ponownym otwarciu.
- Podczas przeciągania zapewnić responsywny podgląd linii i wskazania, bez wielokrotnego kosztownego renderowania MLT. Weryfikacja audio po zatwierdzeniu gestu; jeśli dostępny jest odsłuch na żywo, nie może rozmijać się z finalnym eksportem.

### B. Fade in / fade out na uchwytach audio — wykonane w 0.16

- Dwa małe, dostępne myszą i klawiaturą **okrągłe uchwyty** przy początku i końcu ścieżki audio. Przeciąganie lewego w prawo ustala czas narastania, prawego w lewo ustala czas wyciszenia. Wizualizować krzywe na przebiegu dźwięku bez zmiany skali samego waveform.
- Fade ma działać na osobnych klipach audio oraz audio połączonym z wideo; wartości domyślnie zerowe (bez automatycznego wyciszania). Kształt krzywej początkowo łagodny, później możliwe presety liniowy/łagodny (np. equal-power tam, gdzie uzasadnione).
- Fade i keyframes muszą się **łączyć**, a nie nadpisywać; wynikiem jest jedna widoczna i renderowana obwiednia. Długości fade nie przekraczają klipu. Jeżeli dwa fade nachodzą na siebie, jasno określić sposób połączenia (mnożenie ramp) i utrzymać podgląd zgodny z eksportem.
- **Przyszłe rozszerzenie, poza 0.16:** „inteligentne” ułatwienia: opcjonalna podpowiedź/ciche przyciąganie do sensownych miejsc na podstawie poziomu audio, bez samoczynnego stosowania; użytkownik może ręcznie ustawić dokładny czas albo wyłączyć przyciąganie. Priorytetem jest kontrola, a nie AI.
- Nie mylić uchwytów fade z uchwytami przycinania klipu ani z punktami automatyki; odpowiednie obszary chwytania, kursor, tooltip, focus i blokada zdarzeń rodzica.

### C. Siatka miniaturek w zakładce Pliki — wykonane w 0.14

- Zastąpić pionową listę plików **responsywną siatką kart** w panelu mediów, z możliwie dużymi miniaturami 16:9, skróconą nazwą pliku (maksymalnie dwa wiersze/ellipsis) i pełną nazwą oraz ścieżką w podpowiedzi.
- Karty powinny zawierać zwięzłe dane (np. czas trwania), a ikonę **+** dodawania na oś pokazywać w czytelnym miejscu lub po najechaniu/focusie. Zachować dotychczasowy drag-and-drop i obsługę klawiatury.
- Siatka ma dopasowywać liczbę kolumn do szerokości panelu (np. 2–4 bez poziomego przewijania), zachować wyszukiwarkę, powiadomienie o niedostępnym źródle, miniatury audio i przewijanie. Utrzymać lazy loading/cache miniaturek, uwzględnić proxy przy dostępności.
- Opcjonalnie przełącznik „Siatka / Lista” jako preferencja, jeśli okaże się przydatny; **domyślny widok: Siatka**.

### D. Zielony znacznik użycia filmu na osi czasu — wykonane w 0.14

- W **prawym górnym rogu miniatury** pliku wideo w panelu Pliki pokazywać **mały zielony okrąg z białym znakiem ✓** wtedy i tylko wtedy, gdy źródło ma co najmniej jedno wystąpienie na osi czasu. To znacznik **„użyty w montażu”**, nie status dostępności/proxy.
- Liczyć automatycznie na podstawie obecnego `libraryItems(project).uses` zamiast osobnej zapisywanej flagi. Znacznik aktualizuje się po dodaniu, usunięciu i cofnięciu/ponowieniu; wiele użyć nadal pokazuje pojedynczy znacznik. Liczba użyć może być w tooltipie.
- Rozdzielić wygląd znaczników „użyty”, „proxy gotowe” i „brak źródła”; nie zakrywać nimi podstawowych informacji na miniaturze. Ikona ma własną etykietę dostępną dla czytnika ekranu.

### Kryteria odbioru i testy

- Alt+klik dodaje wyłącznie punkt automatyki, zwykłe kliknięcia nadal zaznaczają/przewijają; gesty fade, klipów i trimmingu nie kolidują.
- Poprawny wynik audio i identyczne rampy w podglądzie, eksporcie MP4 i wejściu do transkrypcji; testy rzeczywistego MLT/FFmpeg z pomiarem poziomów na początkach, końcach i wokół punktów.
- Serializacja/migracja projektów, Undo/Redo, split/trim, nakładające się ścieżki, mute i audio z wideo nie powodują utraty automatyki.
- Status użycia miniatur jest zgodny z rzeczywistym projektem; siatka działa dla paneli wąskich, wielu mediów i plików niedostępnych, bez regresji przeciągania na oś.
- Wdrożyć w kolejności: **(1) siatka i znacznik użycia, (2) fade, (3) punkty automatyki i synchronizacja audio z MLT**, o ile pomiar pracochłonności nie wskaże korzystniejszej kolejności połączenia fade z obwiednią.

## Istotny etap: ścieżki dodawane na żądanie (V3 / A3) - po Ripple

**Zatwierdzone jako istotne rozszerzenie - [issue #3](https://github.com/ankelmarek/AutoNapisy/issues/3).** Niektóre montaże wymagają V3 lub A3. **Najpierw wdrażamy Ripple Edit oraz odłączanie audio / J-cut i L-cut na obecnych torach**, a następnie dynamiczne dokładanie V3/A3. Przy implementacji Ripple unikać założenia stałej liczby torów. Ta kolejność jest decyzją użytkownika.

- **Bez sztywnego limitu dwóch:** domyślnie zachować prosty układ V1/V2 i A1/A2, z przyciskiem `+ Dodaj ścieżkę wideo` lub `+ Dodaj ścieżkę audio`. W pierwszej iteracji zapewnić co najmniej V3 i A3, ale model danych zaprojektować tak, aby późniejsze V4/A4 nie wymagały kolejnej przebudowy. Dodanie wideo **nie dodaje automatycznie** ścieżki audio i odwrotnie.
- **Ergonomia:** dodane tory dopiero na żądanie; V3 nad V2 nad V1, niezależne A1/A2/A3, T ponad obrazem. Pionowy scroll obszaru ścieżek, możliwość zwinięcia/zmiany wysokości audio, przewijanie poziome zsynchronizowane z podziałką. Na każdym torze opcje mute/ukryj (dla wideo), blokada, docelowo Solo oraz osobne R dla Ripple; jednoznaczne podpisy i podpowiedzi.
- **Dźwięk źródłowego klipu:** obecny projekt wizualnie odwzorowuje audio filmu na torze A o tym samym numerze co V. Przy rozbudowie oddzielić logiczną tożsamość toru obrazu od trasowania/miksowania audio. Wideo z dźwiękiem musi nadal grać i pozostawać zsynchronizowane, niezależne pliki audio nie wymagają pary Vn, a po przyszłym „Odłącz audio” dźwięk ma trafić na wskazany tor A bez zdublowania sygnału. Migracja nie może zmienić brzmienia istniejących projektów.
- **Ripple:** osobne domyślne ustawienia `auto/on/off` na każdym torze, zgodnie z regułą: pierwszy klip od `00:00` może uczestniczyć; pierwszy klip później lub pusty tor ma R domyślnie wyłączone. Manualne R nadpisuje automat. Blokady i powiązania synchronizacji (szczególnie odłączone audio i napisy) mają pierwszeństwo przed niekontrolowanym przesunięciem.
- **Dane i silnik:** obecna wersja ma typ `track: 0|1` w TS, ograniczenie `track <= 1` w Rust, sztywny `tracksSchema` V1/V2/A1/A2/T oraz wyliczane bezpośrednio w pikselach współrzędne torów w `Timeline.tsx`; MLT przechodzi `for lane in 0..2`. Wymaga to wspólnego, stabilnego opisu torów (ID/typ/kolejność/ustawienia) oraz migracji v9 w przód; nie wystarczy dorysować przycisku „V3”. Implementacja obejmuje kompozycję warstw, miks, import, drag/drop, klipy, przejścia, napisy, podgląd MLT, eksport FFmpeg/MLT i walidację JSON po obu stronach.
- **Bezpieczeństwo:** nowe, usuwane lub przestawiane tory muszą zachować Undo/Redo. Usunięcie toru z klipami wymaga świadomego potwierdzenia albo przeniesienia klipów; nigdy cichej utraty. Limit jednoczesnego montażu należy dobrać do wydajności i sprawdzić na materiałach z 3 źródeł obrazu oraz 3 niezależnych źródeł audio, również gdy część źródeł korzysta z proxy.
- **Kolejność techniczna:** najpierw wdrożyć Ripple i odłączanie audio/J-cut/L-cut na obecnych torach V1/V2/A1/A2, projektując je tak, aby późniejsze V3/A3 nie wymagały zmiany semantyki. **Dopiero później** rozbudować liczbę ścieżek i dostosować algorytm do nowych torów; nie łączyć dużych migracji ze stabilizacją bieżącego wydania.

## Kolejna paczka ergonomii montażu: zatwierdzone funkcje (TODO)

Użytkownik zatwierdził z poprzedniej listy **punkty 1, 2, 3, 4, 6, 7, 8, 9**. **Punkt 5 (kolorowe znaczniki na osi) nie jest częścią tej paczki.** Celem jest intuicyjny, niedestrukcyjny montaż z pełną kontrolą użytkownika. Nie wdrażać wszystkiego jedną zmianą; weryfikować każdą funkcję na realnym podglądzie MLT i eksporcie. Korzystać z Tabler Icons.

### 1. Scrubbing miniaturek w bibliotece i podgląd źródła — wykonane w 0.17

- Po przesuwaniu kursora w poziomie po miniaturze filmu wyświetlać klatki odpowiadające pozycji kursora w **źródłowym nagraniu**, bez zmiany głowicy i montażu projektu. Po opuszczeniu miniatury wraca kadr reprezentatywny. Dla klawiatury/touch zapewnić osobne polecenie „Podgląd źródła”.
- Kliknięcie/otwarcie karty wyświetla **podgląd pliku źródłowego** (source viewer), wyraźnie odróżniony od podglądu aktualnego montażu; bez przypadkowego dodawania na oś.
- Miniaturki dekodować oszczędnie: ograniczyć liczbę jednoczesnych dekoderów i częstotliwość odczytu, buforować klatki, odwoływać nieaktualne zadania. W miarę dostępności korzystać z proxy zamiast wielokrotnie dekodować HEVC/4K; przy braku proxy zastosować bezpieczny fallback.

### 2. Zaznaczanie In / Out przed dodaniem na oś — wykonane w 0.17

- W podglądzie źródła umożliwić ustawienie punktów wejścia **I** i wyjścia **O**, klawiaturą, przyciskami i myszą; wyświetlać ich timecode, wybrany zakres i długość.
- Polecenie „Dodaj zaznaczony fragment” lub przeciągnięcie z podglądu na tor wstawia **tylko wskazany przedział**, zapisując prawidłowe `sourceIn/sourceOut` i `start`. Nie kopiować ani nie zmieniać pliku źródłowego.
- Walidować granice, długość, tempo klatek i dostępność materiału; przy braku zaznaczenia zachować dotychczasowe dodawanie całego klipu. Nie naruszać montażu podczas samego zaznaczania.
- Zapewnić spójne znaczniki czasu dla proxy i oryginału; w razie ponownego otwarcia źródła można pamiętać ostatni zakres jako ustawienie biblioteki, bez przekształcania projektu.

### 3. Odłączanie audio od wideo oraz montaż J-cut/L-cut

- Menu klipu: **„Odłącz audio”**. Oddzielić logiczne powiązanie i utworzyć niezależny klip audio odwołujący się do tej samej ścieżki źródłowej, **bez zdublowania dźwięku w miksie**. Oryginalny klip wideo przestaje odtwarzać swoją powiązaną ścieżkę audio.
- Dźwięk i obraz zyskują niezależne przycinanie, przesuwanie i wybór toru; zachować możliwość świadomego zsynchronizowania ich ponownie (opcjonalna akcja „Połącz ponownie”).
- Obsłużyć **L-cut** (dźwięk poprzedniego ujęcia trwa po zmianie obrazu) oraz **J-cut** (dźwięk następnego ujęcia rozpoczyna się przed jego obrazem), z prawidłowym miksowaniem, napisami i podglądem.
- Przeciągnięcie granic bez przypadkowego odłączenia, Undo/Redo jako pojedyncza odwracalna operacja, zapis nowego schematu/migracje. Nie naruszać starszych projektów.

### 4. Ripple Edit: kontrolowane domykanie przerw

- Przełączalny tryb **Ripple On/Off**, wyraźnie oznaczony na osi. Przy Ripple On skrócenie/usunięcie ujęcia może przesunąć kolejne elementy do lewej; Ripple Off zachowuje przerwę tak jak dotychczas.
- **Zasada ochronna dla ścieżek rozpoczynających się później niż 00:00:** gdy pierwszy klip na danym torze ma `start > 0` (z tolerancją precyzji klatki), ten tor **domyślnie nie uczestniczy w Ripple**, nawet jeśli Ripple jest globalnie włączony. Dotyczy zarówno operacji z innego toru, jak i usuwania/przycinania na samym torze: zachować istniejące odstępy i pozycje. Pusta ścieżka także jest wyłączona. Przykład: V1 start 00:00 z R, V2 start 00:20 bez R, A2 muzyka start 00:12 bez R - wycięcie 3 s na V1 nie przesuwa przebitek ani muzyki.
- **Jawny wyjątek:** użytkownik może **ręcznie włączyć R** przy późno rozpoczynającej się ścieżce, jeżeli chce, aby kolejne klipy na niej przesuwały się. Globalne Ripple nie przełamuje automatycznego wykluczenia; przełączenie R przy torze jest świadomym nadpisaniem reguły domyślnej. Ręczne wyłączenie R również ma pierwszeństwo nad automatem. UI pokazuje czytelnie „R wyłączone - ścieżka zaczyna się później” i nie włącza go bez wiedzy użytkownika.
- **Nie mylić z przesuwaniem pojedynczego klipu:** gdy użytkownik ręcznie przesuwa klip, ruch ma zachować dotychczasową semantykę; automatyczne domykanie lub rozsuwanie kolejnych klipów następuje jedynie w świadomie aktywowanej operacji Ripple. Nie wolno usuwać celowo pozostawionych luk przez wywołanie `closeGaps()`.
- **Synchronizacja, blokady i napisy:** powiązane audio/wideo nie może się rozjechać z powodu automatycznego pominięcia toru; przed zmianą pokazać konflikt i dać wybór dalszego działania. Napisy zależne od źródła podążają za nim tylko raz; niezależne napisy osi czasu podlegają ustawieniu R toru T. Zablokowanych torów Ripple nigdy nie przesuwa.
- **Deterministyczność i testy:** osobne per-tor ustawienie `auto/on/off` (albo równoważne) i jego zapis w projekcie z migracją starych schematów, aby ręczna decyzja nie znikała po ponownym otwarciu; automatyczny stan wynika z pozycji pierwszego klipu w chwili operacji. Testy toru od 00:00, toru od 00:12/00:20, pierwszej luki, ręcznego przełączenia R, operacji na późnym torze, sklejonego/odłączonego audio, napisów T, Undo/Redo i podglądu przyszłych pozycji.
- Przed zatwierdzeniem, dla operacji obejmujących kilka ścieżek, pokazać podgląd przesunięć (ghost clips, liczba przesuwanych elementów, długość skrócenia montażu), a nie przesuwać ich niejawnie.
- Jawnie zdefiniować wpływ na V1/V2, A1/A2, napisy, przejścia, rozdzielone audio i elementy powiązane. Zapewnić możliwość ograniczenia do wybranych/odblokowanych torów i ochronę innych. Konflikty oraz nakładanie sygnalizować przed zastosowaniem.
- Przetestować Undo/Redo, cofanie dużych operacji, cięcia wielu klipów, puste przerwy, koniec montażu, synchronizację dźwięku i napisów.

### 6. Bezpieczne strefy Reels / Shorts / TikTok — wykonane w 0.14

- Opcjonalna nakładka **safe zones** na podglądzie formatu 9:16, z presetami Reels, TikTok i Shorts, wskazująca obszary potencjalnie zasłonięte przez elementy platformy.
- Przezroczysta nakładka jest wyłącznie pomocą edycyjną i **nie trafia do eksportu**. Ma skalować się razem z kadrem i nie przechwytywać gestów transformacji i zaznaczania napisów.
- Presety mają charakter przybliżony, mogą zmieniać się wraz z interfejsem platform. Udostępnić możliwość dostosowania marginesów i wyłączenia warstwy; unikać deklaracji „gwarantowanej bezpiecznej strefy”.

### 7. „Zastąp źródło” bez utraty montażu

- Akcja dla pliku w bibliotece: zamiana odwołania do źródła przy zachowaniu tożsamości klipów, ich pozycji, ręcznych cięć, kadrowania, transformacji i efektów tam, gdzie wynik pozostaje poprawny.
- Najpierw sprawdzić zgodność nowego pliku przez FFprobe (czas, liczba i typ strumieni, proporcje/obrót, FPS, audio). Jeśli wymiana skróci materiał poniżej użytych `sourceOut`, pokazać konkretne konflikty i zaoferować anulowanie albo jawne, kontrolowane dopasowanie.
- Dotychczasowe napisy/transkrypcje źródłowe wymagają odświeżenia lub świadomego zachowania, gdy nie odpowiadają nowemu nagraniu; nie przenosić ich po cichu na obcą wypowiedź.
- Unieważniać stare proxy, miniatury, waveforms i cache źródła; zachować dane autorskie/licencje audio z prawidłowym przypisaniem. Testy wielu wystąpień jednego źródła i cofania zamiany.

### 8. Kontrola jakości przed eksportem (preflight)

- Przed eksportem zaoferować raport z **ostrzeżeniami, nie automatyczną ingerencją**: brakujące źródła, możliwy clipping/przesterowanie audio, nieoczekiwana cisza, puste/czarne przerwy, napisy i grafiki poza wskazaną strefą, potencjalnie niewłaściwy format/kadr.
- Wynik ma zawierać **lokalizację na osi czasu i przejście do problemu**. Rozdzielać błędy blokujące poprawny eksport od sugestii, z opcją „Eksportuj mimo ostrzeżeń”.
- Analiza dźwięku/obrazu musi opierać się na realnym złożonym montażu i pomiarach (FFmpeg/MLT), nie na arbitralnym „score jakości”. Przeprowadzać kosztowniejsze analizy na żądanie/z odpowiednim cache, nie podczas każdego ruchu myszy.
- Zgłaszać ograniczenia detekcji; np. cisza i czarny kadr mogą być celowym środkiem narracyjnym.

### 9. Autozapis i odzyskiwanie sesji po awarii — wykonane w 0.17

- Zapisywać kopie odzyskiwania stanu **lokalnie** i atomowo, z rozsądnym odstępem/debounce oraz na wybranych punktach ryzyka. Autozapis nigdy nie nadpisuje ręcznie zapisanego pliku projektu bez świadomego polecenia.
- Po uruchomieniu po awarii wyświetlić różnicę czasu/stanu pomiędzy ostatnim zapisem ręcznym i kopią awaryjną oraz opcje **„Odzyskaj”, „Otwórz zapisany projekt”, „Odrzuć kopię”**. Zachować poprzednią kopię do czasu zakończenia odzyskiwania.
- Ograniczać liczbę/miejsce kopii; nie umieszczać kopii filmów i audio w snapshots, tylko bezpieczne odwołania do źródeł. Obsłużyć brak miejsca, uszkodzony JSON, nieaktualną wersję schematu, brak mediów i zamknięcie podczas zapisu.
- Zapis ma nie blokować UI, zapewnić walidację i poprawne Undo/Redo po odzyskaniu; testy symulowanej awarii i ponownego otwarcia.

### Proponowane etapy i wspólne testy

1. **9 (odzyskiwanie)** wykonano w połączonym wydaniu 0.17.
2. **1 + 2 (biblioteka źródeł)** wykonano także w 0.17, z proxy, siatką i znacznikiem użycia.
3. Następnie **3 + 4 (J/L-cut i Ripple)** na obecnych torach: zaplanować wspólne reguły powiązania audio z obrazem, przesunięć na osi oraz napisów, by nie utracić synchronizacji. Algorytm Ripple projektować niezależnie od liczby ścieżek.
4. **Po Ripple/J/L-cut - dynamiczne V3/A3** ([issue #3](https://github.com/ankelmarek/AutoNapisy/issues/3)), z zachowaniem reguł montażu i synchronizacji.
5. Niezależnie dodać **6 (strefy bezpieczne)**, **7 (zastępowanie źródła)** oraz **8 (preflight)**; zastępowanie źródła uwzględnia mechanizm proxy, a preflight wymaga stabilnego i sprawdzalnego eksportu.
6. Każdy etap wymaga testów TypeScript/Rust oraz realnego podglądu MLT i porównania z eksportem; potwierdzić migracje schematów, Undo/Redo, działania przy brakującym źródle i bez internetu.

**Status:** punkty 1, 2, 3, 4, 6 i 9 wykonane. Następne duże rozszerzenie: dynamiczne V3/A3; zatwierdzone UX z issue #4 wykonywać etapami A/B/C jako osobne zmiany. Pozostałe rozszerzenia nadal planowane. Punkt 5 (kolorowe znaczniki na osi czasu) celowo pominięty.

