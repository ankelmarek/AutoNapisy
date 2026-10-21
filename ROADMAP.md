# Kolejne etapy RolVixa

## W budowie: 0.35b — dodawanie słów, ponowna analiza fragmentu i ręczne czasy

POC rzeczywistego lokalnego MMS_FA na polskiej mowie: [39555141732](https://github.com/ankelmarek/AutoNapisy/actions/runs/39555141732), wynik i decyzja w [dokumencie badania](docs/0.35b-alignment-poc.md). Do produkcji wybrano ograniczoną ponowną analizę Whisper z pełnym porównaniem tekstu oraz świadome ręczne czasy, bez interpolacji. Implementacja v18 i testy są w przygotowaniu; brak jeszcze odbioru instalatora tej wersji. 0.35c oraz pełne 0.35 pozostają otwarte.

## RolVixa 0.35a wdrożone — następny osobny plan to 0.35b

Po ukończonym 0.34a/b/c użytkownik zatwierdził budowę etapu a z [issue #27](https://github.com/ankelmarek/AutoNapisy/issues/27). Korekta zachowuje istniejące czasy tylko przy jednoznacznych pozycjach; UI wskazuje odziedziczone pochodzenie bez deklaracji nowej zgodności z nagraniem. Ręcznie wybrana plansza jest trwała, a niepewne zmiany zachowują fallback. Lokalny draft i jeden Undo, schemat v17/migracje TS/Rust, zegary źródła oraz wspólne preview/MP4/SRT/A-B. Pełny zielony [Windows run 39480735671](https://github.com/ankelmarek/AutoNapisy/actions/runs/39480735671): **437 TS, 126 Rust i 27 rzeczywistych integracji**, produkcyjny build, instalacja i rzeczywisty WebView2. Head `d21ad044040b49aaf6d32eeef65dd4f8c666929c`, tree `f3193245cd79049667121737086507106e1a728f`; kod po scaleniu PR #29 zgodny ze sprawdzonym. Scenariusz 0.35a potwierdza brak zmiany projektu podczas pisania, pojedyncze zatwierdzenie draftu przed przełączeniem zaznaczenia na T, odziedziczone czasy po korekcie 1:1, jeden Undo/Redo, Escape, Ctrl+S, blokady T, reopen, aktywne słowo w podglądzie i rzeczywiste ruchome piksele H.264/AAC. Sprawdzono SRT z poprawioną treścią i niezmienionym zakresem, trzy rzeczywiste próbki A/B od niezerowego czasu, jawne przełączenie na planszę i fallback po dodaniu słów. Obejrzano zrzuty 1366×700/Full HD i klatki MP4. Pełna regresja zachowuje 0.33/0.34, własne style/restart, miks, montaż, eksport i odzyskiwanie. Lokalnie: 437 TS, 123 core Rust, 27 integracji i build. Nowe polskie teksty są syntetycznym fixture'em edycji, a wcześniejsza rzeczywista referencja mowy/Whisper pozostaje angielska; nie ma nowego potwierdzenia polskiego ASR ani forced alignment. [Instalator etapu a](https://github.com/ankelmarek/AutoNapisy/actions/runs/39480735671/artifacts/12292347141). **0.35b/c nie wdrożono; issue #27 pozostaje otwarte.**

To **tylko etap a**. 0.35b (zmiana liczby słów, POC lokalnego alignment PL/manualny fallback) i 0.35c (rzeczywisty polski materiał/pełny odbiór) pozostają osobnymi etapami. Nie uruchamiać ASR podczas pisania ani tworzyć czasów niewypowiedzianych słów. W nowym UI użyto syntetycznych polskich napisów; prawdziwa referencja mowy/Whisper w regresji pozostaje angielska.


## Historia ukończonego RolVixa 0.34a/b/c

**Decyzja użytkownika 20.10.2026.** Po scalonym 0.33a/b/c najbliższy priorytet UX to **uporządkowanie całej obsługi napisów**, przed kolejnymi dużymi nowościami. Pełne wymagania, scenariusze i testy: **[issue #24 — 0.34 Caption Styles UX](https://github.com/ankelmarek/AutoNapisy/issues/24)**. Etapy 0.34a/b/c wdrożono i sprawdzono osobno. **Odbiór użytkownika 20.10.2026:** użytkownik potwierdził praktyczny test wersji 0.33 na rzeczywistym polskim materiale: „wszystko działa idealnie”. Odbiór manualny jest pozytywny. To relacja użytkownika, nie nowy raport z CI ani osobno udokumentowany przebieg polskiego Whisper. Etapy 0.34a/b/c wykonano na podstawie tego odbioru.

- **Jedna galeria kafelków, bez duplikacji:** sekcja **Klasyczne: 2** (obowiązkowo **Żółta plansza** - tradycyjny czarny Bebas Neue na żółtym tle; **Biały obrys** - białe litery z ciemnym outline na przezroczystym tle) + sekcja **Animowane: 8** (Karaoke Flow, Pop Beat, Impact, Neon Pulse, Slide Reveal, Marker, Editorial Clean, Type Flow) + sekcja **Moje style**. Zamiast dotychczasowych czterech tekstowych przycisków klasycznych, wszystkie mają równie estetyczne kafelki z faktycznymi podglądami. Zielony i fioletowy nie są już fabrycznymi *kafelkami*, ale istniejące z nimi projekty/presety pozostają bez zmian. Pozostaje `Bez animacji` — ma wyłączać ruch bez kasowania wyboru/wyglądu istniejącego stylu.
- **Dwie podsekcje prawego inspektora `Napisy`:** `Style napisów` (wybór kafla i własnej biblioteki) oraz `Opcje napisów` (personalizacja **konkretnego** wybranego stylu: font, rozmiar, kolory tła/tekstu/akcentu, obrys, pozycja, marginesy, format/literowanie, tempo/intensywność animacji, On/Off; zaawansowane opcje zwinięte). Widoczny zakres `Zaznaczone (N)` albo `Wszystkie`, przycisk `Zastosuj`. Zmiana fontu w jednym stylu **nie zmienia wszystkich innych**.
- **Zaznaczanie wielu NAPISÓW:** w liście napisów i na torze T: Ctrl+klik dla dowolnych, Shift+klik dla zakresu, Ctrl+A w fokusie napisów; jednoznaczne podświetlenie obu widoków i licznik. Przy wielu zaznaczonych domyślny zakres to tylko wybrane. Grupowe zastosowanie jednego stylu/zmian czcionki = **jeden krok Undo/Redo**, bez naruszenia tekstów, timingów, obrazów i muzyki; dla mieszanych styli informacja `Różne style`. Zwykły pojedynczy edytor tekstu nie nadpisuje przypadkiem wszystkich.
- **Własne style zapisane na przyszłość:** dopracuj którykolwiek fabryczny, `Zapisz jako mój styl…`, nadaj nazwę, korzystaj w innych projektach. Biblioteka lokalna aplikacji, stabilne ID, bez zmiany fabrycznych, możliwość zmiany nazwy/usuwania tylko własnych. Po użyciu twórz migawkę stylu w projekcie, aby skasowanie lokalnego szablonu **nigdy nie uszkodziło dawnych projektów**. Zapis presetu ≠ zastosowanie do napisów. Czcionki dostępne i renderowane zgodnie z realnie załadowanymi fontami w preview/MP4.
- **Kolejność 0.34a/b/c:** (a) refaktor kafelków i rozdzielenie Style/Opcje; (b) wielozaznaczenie i grupowe stosowanie; (c) trwała lokalna biblioteka własnych stylów, dopracowanie fontów oraz regresje/export/Windows. Trzymać jeden rzeczywisty renderer dla WebView2/MP4/Export Studio/A-B i testować polskie znaki, animację Off, starsze projekty v1–v15, selekcję i Undo.

**0.34c — ukończone, PR #28 połączony.** Pełny zielony [Windows run 39430603694](https://github.com/ankelmarek/AutoNapisy/actions/runs/39430603694): **402 TS, 123 Rust i 27 rzeczywistych integracji**, produkcyjny build, instalacja i rzeczywisty WebView2. Head `1881f30f87862e1ddf7cac672167ef6130eaeb43`, tree `afa0625b3c1edf207781ab10854b7daef00cbc88`; kod po scaleniu PR #28 zgodny z przetestowanym. Nowy scenariusz: zapis draftu bez Apply, walidacja polskiej nazwy, duplikowanie i zmiana nazwy, Native New/Open, usunięcie użytego szablonu bez zmiany projektu i sprawdzanej klatki MP4, zachowanie szablonu po rzeczywistym restarcie procesu oraz ponowny kafelek w UI. Dla brakującego fontu trzy sprawdzone klatki H.264 odpowiadają eksportowi z dostarczanym Bebas Neue. Sprawdzono zrzuty laptop/FHD oraz MP4. Zachowano osiem animacji/104 klatki alpha, statyczne style/Off, Export Studio/A-B, SRT, montaż, audio i odzyskiwanie. Polskie teksty UI są syntetycznym fixture'em; rzeczywisty Whisper w referencji jest angielski. Lokalnie: 402 TS, 120 core Rust, 27 integracji i build. [Instalator 0.34.0](https://github.com/ankelmarek/AutoNapisy/actions/runs/39430603694/artifacts/12268104824). Wszystkie etapy 0.34a/b/c są wdrożone; 0.35 pozostaje osobnym planem. Etap 0.35a z issue #27 wdrożono później i odnotowano wyżej; dalsze 0.35b/c są planowane.

**0.34b — ukończone, PR #26 połączony.** Pełny zielony [Windows run 39395809610](https://github.com/ankelmarek/AutoNapisy/actions/runs/39395809610): **390 TS, 118 Rust i 27 rzeczywistych integracji**, build produkcyjny, instalacja oraz rzeczywisty WebView2. Testowany head `30cb51cf8ac4d8cb331b819b1b37b9ef0b1d9a12`, tree `b20b23c0ebd3fe3f0ba0f2ecb5f248d97167df82`; po scaleniu PR #26 kod aplikacji i testów identyczny, z zachowanymi późniejszymi dokumentami planu 0.35. Nowy scenariusz potwierdza pięć rozrzuconych napisów, spójne zaznaczenie listy/T, Ctrl/Shift/Ctrl+A/Escape, ochronę pisania, font/Off tylko wybranego zakresu i pojedyncze Undo/Redo, mieszane style, pojedynczy drag, blokadę T, grupowe Delete, zapis/reopen oraz brak zapisywania zaznaczenia. Sprawdzono zrzuty 1366×700 i Full HD oraz rzeczywisty MP4 z pięcioma zmienionymi i pięcioma pozostałymi napisami. Zestaw zachowuje osiem animacji, statyczne style/Off, standardowy eksport/Export Studio/A-B, miks, montaż i crash/restart. UI używa jawnie syntetycznych polskich napisów; referencja prawdziwej mowy/Whisper pozostaje angielska. Lokalnie: 390 TS, 115 core Rust, 27 integracji i build. [Instalator alpha.2](https://github.com/ankelmarek/AutoNapisy/actions/runs/39395809610/artifacts/12252378857). To historyczny odbiór etapu b; pełny odbiór a/b/c jest powyżej. Etap c wykonano osobno powyżej; issue #24 zamknięto po odbiorze wszystkich trzech etapów.

**0.34a — ukończone, osobny PR #25 połączony.** Pełny zielony [Windows run 39389410796](https://github.com/ankelmarek/AutoNapisy/actions/runs/39389410796): **381 TS, 118 Rust i 27 rzeczywistych integracji**, produkcyjny build, instalacja oraz rzeczywisty WebView2. Head `a24ecd4b55cda9f41b3b5eba5d6c27b6761702fb`, tree `d055e24b4714ca52230bbdd0ac44376430366bb6`; po scaleniu PR #25 drzewo identyczne. Nowy scenariusz 2+8 / Style-Opcje / osobne fonty draftów / Off-On / zapis i ponowne Open / jeden Undo-Redo / klawiatura przeszedł na Windows. Sprawdzono zrzuty 1366×700 i Full HD. Rzeczywiste MP4 obejmują oba klasyczne style oraz Off dla Type Flow, Neon, Marker i Editorial; zachowane 104 referencyjne klatki ośmiu animowanych presetów i wcześniejsze A/B, audio, montaż oraz odzyskiwanie. Lokalnie: 381 TS, 115 core Rust, 27 integracji i build. [Instalator](https://github.com/ankelmarek/AutoNapisy/actions/runs/39389410796/artifacts/12249932070). Wielozaznaczenie 0.34b odebrano osobno powyżej. Etap c odebrano osobno powyżej.

## NASTĘPNY ETAP PO 0.34 — RolVixa 0.35: inteligentna korekta napisów (PLANOWANE, P1)

**Decyzja użytkownika 20.10.2026:** po ręcznej korekcie błędnych słów w już wygenerowanych **animowanych** napisach użytkownik nie powinien bez potrzeby tracić efektów karaoke/pop. Dodatkowo musi być możliwa zmiana liczby słów, usuwanie/dodawanie i świadome przeredagowanie treści. **Szczegółowy issue [#27 — RolVixa 0.35: inteligentna korekta napisów](https://github.com/ankelmarek/AutoNapisy/issues/27)**. To zadanie należy rozpocząć **po 0.34b i 0.34c**, nie rozszerzać trwającego PR #26 o nowy algorytm ani nie deklarować 0.35 jako wdrożonego.

**Potwierdzony problem:** obecnie zapisanie dowolnej zmiany `captionEdits.text` powoduje w `src/editing.ts::compositionSegments` wyczyszczenie `words` tego napisu, niezależnie od tego, czy poprawiono jedną literę, czy przepisano wszystko. `captionAnimation.ts` słusznie odrzuca niepewne czasowanie i stosuje animację **całej planszy** zamiast aktywowania słów. To bezpieczny fallback, lecz zbyt radykalny przy drobnych korektach.

1. **Korekta 1:1:** zmiana słowa, interpunkcji, literówki i pisowni powinna zachować dawne czasy odpowiedniego tokenu, jeżeli możliwe jest jednoznaczne dopasowanie pozycji. Zmienić tekst i powiązany token w danych, zachowując Karaoke Flow / Pop Beat; w statusie odróżnić czas **odziedziczony po pierwotnej transkrypcji** od nowego potwierdzenia zgodności z audio. Nie przypisywać fałszywie „rozpoznane przez Whisper”, gdy tekst został dopisany ręcznie.
2. **Zmiana liczby lub kolejności słów:** zachować tylko bezsporne punkty odniesienia, oznaczyć `Wymaga dopasowania` i zaoferować akcję `Dopasuj do nagrania`, świadomie uruchamianą na **krótkim fragmencie** właściwego źródłowego audio. Najpierw sprawdzić technicznie dostępność i jakość lokalnego **forced alignment dla polskiego**; samo `whisper.cpp` nie gwarantuje takiej funkcji. Brak pewnego wyniku nie powoduje sztucznej synchronizacji: możliwe ręczne dopasowanie lub animacja całej planszy.
3. **Zmiana znaczenia (słowa nie padają w nagraniu):** nie wolno deklarować automatycznie precyzyjnej synchronizacji z mową; udostępnić `Animacja planszy` i `Ustaw czasy ręcznie` z czytelnym statusem. Ewentualna niesynchronizowana animacja dekoracyjna musi być jawna, nie udawać karaoke słowa w słowo.
4. **Bezpieczna ergonomia:** komunikat przy danym napisie, nie wielki modal po każdym znaku; status `Zachowano czasy`, `Wymaga dopasowania` czy `Ręczne czasy`. Nie wykonywać ponownej transkrypcji na każde naciśnięcie klawisza. Korekta i późniejsze zatwierdzenie dopasowania są osobnymi atomowymi krokami Undo/Redo; anulowanie nie zmienia projektu.
5. **Pełna zgodność:** rzeczywisty polski materiał, podgląd = MP4/Export Studio/A-B, SRT jako tekst i czas, animacja On/Off, polskie znaki, wielolinijkowość, trim/split/Ripple, starsze projekty, zapis/reopen, brak zmiany muzyki/obrazu. Jeśli nowe pola są potrzebne, jawna migracja i walidacja TS/Rust; brak niewidocznej edycji danych historycznych.

**Proponowane podetapy:** **0.35a** bezpieczny diff 1:1 + status i zachowanie timingu; **0.35b** dodawanie/usuwanie słów + ograniczony lokalny alignment + manualny fallback; **0.35c** testy polskiego nagrania, eksportów i regresji Windows. Szczegółowe kryteria w issue #27.

## Zakończona implementacja 0.33 Animated Captions: a/b/c scalone, pozytywny odbiór użytkownika na polskim materiale

Decyzję użytkownika z 19.10.2026 zrealizowano w trzech osobnych PR: [#21 — silnik i dwa style](https://github.com/ankelmarek/AutoNapisy/pull/21), [#22 — osiem stylów i galeria](https://github.com/ankelmarek/AutoNapisy/pull/22), [#23 — produkcyjny eksport i regresje](https://github.com/ankelmarek/AutoNapisy/pull/23). **20.10.2026:** użytkownik osobiście przetestował wersję 0.33 na polskim materiale i potwierdził, że działa idealnie. Ręczny odbiór produktu uznajemy za pozytywny; brak dostarczonego szczegółowego dziennika kolejnych kroków Whisper/MP4. [Issue #20](https://github.com/ankelmarek/AutoNapisy/issues/20) zawiera historyczną specyfikację i dowody CI, a nowym priorytetem wykonawczym jest #24 (0.34).

| Styl | Efekt |
| --- | --- |
| Karaoke Flow | Akcent bieżącego słowa z rzeczywistych czasów ASR |
| Pop Beat | Sprężysty akcent wypowiadanego słowa |
| Impact | Mocne hasła po 1–3 słowa i kontrolowany zoom |
| Neon Pulse | Cyjan/fiolet, glow i subtelny puls |
| Slide Reveal | Maska i płynny ruch od dołu |
| Marker | Rosnący zakreślacz pod słowem |
| Editorial Clean | Elegancka typografia, fade i dyskretny ruch |
| Type Flow | Kolejne słowa w stałym układzie |

Wspólny deterministyczny renderer 30 FPS działa w podglądzie, MP4, Export Studio i A/B. Galeria ma rzeczywiste demo, jeden aktywny kafelek, klawiaturę i ograniczony ruch. Parametry i jawny zakres cały montaż / zaznaczony napis są jednym Undo. Ręczne zmiany bez pewnego dopasowania słów dają animację całej planszy, bez zgadywania. Schemat v15, migracje v1–v14 zachowują statyczny wygląd; SRT to tekst i timing. Style pozostają po offset/Ripple, razor/copy i SmartCut.

**Potwierdzone:** 0.33a Windows 39306125331 i stabilizacja atomowego odczytu klatek na main 39308598494; 0.33b pełny zielony Windows 39367021466; 0.33c pełny zielony Windows 39367692306 — 366 TS, 116 Rust, 27 rzeczywistych integracji, build, instalacja, WebView2 1366×700 / Full HD i crash/restart. Osiem MP4 na rzeczywistej angielskiej mowie z rzeczywistym Whisper: 104 identyczne klatki alfa, odpowiadające piksele H.264 i zachowany dźwięk. Produkcyjny interfejs: Karaoke Full HD, Pop i Editorial, trzy A/B od niezerowego czasu, cancel i niezmieniony miks/tekst. Obejrzane zrzuty i klatki. Head `3b19dab1d7d07cee72961c5c37f317d0c5bd6fb7`, tree `daa1e2b4e8135ca9f491bf1c3ec14e40898c4714`; scalony PR #23 ma identyczne drzewo.

**Instalator kandydata:** [12241090738](https://github.com/ankelmarek/AutoNapisy/actions/runs/39367692306/artifacts/12241090738); [MP4](https://github.com/ankelmarek/AutoNapisy/actions/runs/39367692306/artifacts/12240761709), instrukcja i ograniczenia w README. Nie promować wcześniejszych alpha.1/alpha.2 jako pełnego wydania.

**Odbiór 20.10.2026:** użytkownik zgłosił pomyślny własny test na rzeczywistym polskim materiale. Szczegółowy raport kroków (w tym potwierdzenie nowej transkrypcji Whisper i klatek MP4) nie został dostarczony; wcześniejsza automatyczna referencja rzeczywistej mowy była angielska. Nie przedstawiać ręcznej deklaracji użytkownika jako wykonania nowych testów automatycznych. Etap 0.34 można rozpoczynać.

**Pamięć/czas/cancel:** Windows 60 s / 720p / 1800 klatek: 5,74 MB warstwy, 28,28 s. Próbka 110 klatek 1080×1920 przez UI: 71 s, ok. +79,3 MiB JS/ArrayBuffer; anulowanie ok. 9 s. Testy ograniczonego kanału, blokującego producenta, reap, tokenów i własności katalogu przeszły. To pomiary konkretnych próbek, nie benchmark typowych filmów. Limity ochronne: 16 777 216 px / 24 h / 4 GiB warstwy. Długie złożone montaże mogą dojść do limitu; nie deklarować testu 24 h.

**CI:** równoległy PR 39367696790 przerwano po 8 min w późniejszej regresji, już po pomyślnych nowych eksportach. Nie oznaczać go jako zielonego. Podniesienie budżetu kroku do 15 min jest zmianą CI, bez zmiany asercji ani kodu sprawdzonego instalatora.

## Wykonane w 0.32 — Export Studio 0.2: próbki A/B i limit MB

Wdrożone: rzeczywiste 3–5 s w 2–3 wariantach z pełnym kadrem/napisami/miksem, przełączanie w tym samym czasie, zastosowanie ustawień, szacunki oparte na pomiarze. Limit MP4 w dziesiętnych MB: budżet audio/kontenera, dwa przebiegi, sprawdzenie faktycznego pliku i brak publikacji przekroczenia. Wspólny enkoder próbek i całego filmu; schemat projektu nadal v14, profile v1 odczytywane i v2 zapisywane. H.264/AAC CPU 30 FPS. Pełny zielony Windows run 39291594851, także push 39291589231: 315 TS, 111 Rust, 23 rzeczywiste integracje, instalacja i WebView2. Natywne A/B z dekodowaniem/odtwarzaniem/przewijaniem, zastosowanie jakości i rzeczywisty eksport w limicie z polskim SRT; 1366×700 / Full HD i trzy zrzuty sprawdzone. PR #19 połączony; instalator 12206647480. Lokalnie 315 TS, 108 Rust core, 18 integracji. GPU, inne kodeki i nowa baza FPS poza tą paczką; issue #1 pozostaje otwarte w pozostałym zakresie.

## Wykonane w 0.31 — Export Studio: profile i kolejka

Zatwierdzony zakres: własne i gotowe profile H.264/AAC 30 FPS, rzeczywisty podgląd fit/crop, kolejka wariantów i zapisanych projektów, anulowanie/ponowienie oraz napisy w obrazie / SRT / bez napisów. Jawne sprawdzenie kadrów paczki, kopie projektów, ochrona źródeł i wyników. Bez migracji v14. Próbki A/B, docelowy rozmiar, inne kodeki/FPS/GPU pozostają dalszą częścią issue #1. Pełny zielony Windows run 39279960579 oraz push 39279955807: 305 TS, 105 Rust, 22 rzeczywiste integracje, instalacja i WebView2 natywnie / 1366×700 / Full HD. Trzy zrzuty panelu sprawdzone. PR #18 połączony; instalator 12200981818.

## Wykonane w 0.30 — SmartCut 0.2: obraz przy cięciu i jawna przebitka

- [x] Ostatnia/pierwsza klatka z oryginalnej kompozycji MLT, porównanie z sąsiednim ruchem; wskazówka bez fikcyjnej punktacji jakości.
- [x] Regulacja kandydatury o klatkę, ponowne porównanie, rzeczywisty podgląd w pętli i dokładne cięcie przy niedostępności analizy.
- [x] Jawny wybór przebitki z biblioteki: zakres źródła, 0,2–4 s po obu stronach styku, górna warstwa, bez dodawania jej dźwięku.
- [x] Zachowanie napisów wypowiedzi, blokad, limitów torów oraz jeden Undo obejmujący wycięcie i nakładkę. Schemat v14 bez migracji.
- [x] Odbiór Windows: Pełny zielony Windows run 39254150340: 293 TS, 99 Rust, 21 rzeczywistych integracyjnych, produkcyjny build, instalacja oraz WebView2 1366×700 / Full HD. Zrzuty porównania i zdekodowanego podglądu sprawdzone. PR #17 połączony; instalator 12187284748.

Pomiar do czterech klatek / 320 px nie jest rozpoznawaniem osoby ani automatyczną oceną montażu. Przebitka i regulacja pozostają decyzją użytkownika. Export Studio osobno.

## Wykonane w 0.29 — zaznaczenie i transkrypcja mowy

Ctrl+kółko ze stałym czasem pod kursorem; fit obok skali z istniejącą pustą lupką Tabler. Ctrl/Shift+klik, prostokąt i Ctrl+A zaznaczają klipy na różnych torach; grupa zachowuje odstępy i powiązane odłączone audio, blokady/kolizje oraz jeden Undo. Napisy można przesuwać bez trimowania; offset jest zapisany w v14 z migracją v1–v13. Dwuklik nadal edytuje tekst.

Domyślny zakres „Cały montaż” i opcja „Tylko zaznaczone klipy”. Filtrowanie w backendzie obejmuje niewyciszone wideo i jego powiązane audio, pomija muzykę dodaną osobno. Zachowane trasy/mute, źródłowe gain/fade/crossfade, J/L-cut i czasy montażu po pominięciu luk. Wynik wybranego zakresu zachowuje napisy poza nim. Rzeczywisty test PCM obu silników i nowy scenariusz WebView2. Pełny zielony Windows run 39244370925: 274 TS, 96 Rust, 20 integracyjnych, instalacja i WebView2; zrzuty sprawdzone. PR #16 połączony, instalator 12182772670. SmartCut 0.2 i Export Studio pozostają osobne.

## Wykonane w 0.28 — SmartCut 0.1

Zatwierdzone zaznaczanie zakresu / istniejącego połączenia, Dokładne / Naturalne / Wygładzone, pomiar krótkich okien dźwięku i istniejące czasy słów, porównanie krótkiego montażu MLT, pętla i jeden Undo. Zachowane Ripple, J/L-cut, blokady, źródłowe obwiednie i muzyka Auto. Zakres 0.1 mieści się w jednym wybranym filmie; konflikty są jawne. Schemat nadal v13. Szczegółowa obsługa i ograniczenia w README. Naprawa aktywnej strefy drag/drop przejść i pojedyncze kodowanie AAC w składaniu FFmpeg należą do tej iteracji. Pełny zielony Windows run 39220210425: 252 TS, 90 Rust, 19 rzeczywistych integracyjnych, produkcyjny build, instalacja oraz WebView2 1366×700 / Full HD. Zrzuty SmartCut i natywnego zdekodowanego podglądu sprawdzone. PR #15 połączony; instalator 12172325679. SmartCut 0.2 / Export Studio poza paczką.


## Wykonane w 0.27 — sterowanie torami

Zatwierdzone Solo odsłuchu, kolejność V/A przez nagłówki, trwałe wysokości widoku i dopasowanie całego montażu. Schemat v13 zachowuje stabilne ID; v1–v12 migrują z dawną kolejnością numeryczną. Bez SmartCut / Export Studio. Szczegółowa obsługa i ograniczenia w README. Pełny zielony Windows run 39198885893 i push 39198881666: 229 TS, 87 Rust, 17 integracyjnych, instalacja i rzeczywisty WebView2 1366×700 / Full HD. Zrzuty sprawdzone; PR #14 połączony, instalator 12163411665. Potwierdzone drag/klawiatura/Undo/blokady, Solo z trasowanym audio, pełne wysokości i preferencje, Escape, fit/reopen v13 oraz regresje normalizacji/źródeł/Ripple/napisów/odzyskiwania.


## Proponowana korekta UX: prosty Ripple i czytelne audio (issue #11)

**Wysoki priorytet użyteczności przed kolejnymi rozbudowanymi narzędziami.** [Szczegółowy plan i testy w issue #11](https://github.com/ankelmarek/AutoNapisy/issues/11). Pierwszą część ukończono w 0.25, osobny PR #12 połączony po pełnym odbiorze Windows. Druga część ukończona w 0.26; PR #13 połączony po pełnym odbiorze Windows. Obie poprawki issue #11 wdrożone.

- **PR 1 - Ripple bez okna:** pojedynczy czytelny przełącznik na osi i natychmiastowe bezpieczne przycięcie/usunięcie, jeden krok Ctrl+Z. Schować R·A/R+/R− do zaawansowanych ustawień toru; automatyczna kwalifikacja V od 00:00, V rozpoczynające się później są chronione. Samodzielne audio nie podlega domyślnemu Ripple, nawet przy routingu dźwięku filmu na ten sam bus A. Linked audio zawsze zachowuje synchronizację; przy konflikcie krótki komunikat zamiast modala i świadoma opcja cięcia bez przesuwania.
- **PR 2 - czytelne A1/A2:** audio połączone z filmem jako zwięzły waveform przy klipie V; audio niezależne lub odłączone na A w pełnej wysokości. Nie dzielić A na pół tylko dlatego, że strumień wideo jest routowany na ten bus. Dla rzeczywiście nakładających się niezależnych audio zapewnić jawny widok lub sugestię nowej ścieżki. Zgodność starych projektów, mute, audioRoute, miksu, J/L-cut, automatyzacji i eksportu jest obowiązkowa.

## Wykonane w 0.22 — dynamiczne ścieżki (ukończone)

- [x] Niezależne dodawanie V3/A3 i dalszych torów; stabilne ID bez renumeracji, do 16 każdego typu.
- [x] Wspólna geometria osi, drop, pionowe przesuwanie, mute/oczko/R/blokada, zwijanie i wysokość audio.
- [x] Oddzielne trasowanie połączonego audio, własny dźwięk V3 bez wymuszania A3; odłączanie do dowolnego A.
- [x] Schemat v11 i migracje TS/Rust, zachowane v10 Ripple/blokady/miks, Undo/Redo i ochrona usuwania torów.
- [x] Rzeczywisty test trzech obrazów i sześciu tonów, mute/visibility, J-cut, przejścia na V3, proxy i brakujące media w MLT/FFmpeg.
- [x] Osobny PR #8 połączony; pełny zielony Windows run 39135310340 (push 39135306974 także zielony): 166 TS, 75 Rust, 14 integracyjnych, instalator 12140085502. Rzeczywisty WebView2, drop V3, detach A3, potwierdzenie/usuwanie/Undo, odtwarzanie i piksele po Undo oraz crash/restart v11. Zrzuty laptop / Full HD sprawdzone.

Solo, przestawianie kolejności torów i trwałe wysokości wdrożono w 0.27. SmartCut i Export Studio poza tą paczką.

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
4. **Dynamiczne V3/A3 i kolejne tory** - **wykonane w 0.22 / PR #8**, domyślnie zachować prostą oś 2+2; nowe tory dodawane niezależnie przyciskami. Rozszerzyć już działające zasady Ripple na nowe tory.
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

## SmartCut: inteligentny podgląd i propozycje cięcia (0.1 wdrożone w 0.28)

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

Status: **SmartCut 0.1 wdrożono w 0.28 / PR #15**. Pełny zielony Windows run 39220210425: 252 TS, 90 Rust, 19 rzeczywistych integracyjnych, produkcyjny build, instalacja oraz WebView2 1366×700 / Full HD. Zrzuty SmartCut i natywnego zdekodowanego podglądu sprawdzone. PR #15 połączony; instalator 12172325679. Ocena obrazu 0.2 wdrożona w 0.30, opisana na początku tego planu.

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

## Wykonane w 0.22: ścieżki dodawane na żądanie (V3 / A3)

**Zrealizowane w 0.22 / PR #8, odbiór Windows 39135310340; poniżej zachowana specyfikacja [issue #3](https://github.com/ankelmarek/AutoNapisy/issues/3).** Niektóre montaże wymagają V3 lub A3. **Najpierw wdrażamy Ripple Edit oraz odłączanie audio / J-cut i L-cut na obecnych torach**, a następnie dynamiczne dokładanie V3/A3. Przy implementacji Ripple unikać założenia stałej liczby torów. Ta kolejność jest decyzją użytkownika.

- **Bez sztywnego limitu dwóch:** domyślnie zachować prosty układ V1/V2 i A1/A2, z przyciskiem `+ Dodaj ścieżkę wideo` lub `+ Dodaj ścieżkę audio`. W pierwszej iteracji zapewnić co najmniej V3 i A3, ale model danych zaprojektować tak, aby późniejsze V4/A4 nie wymagały kolejnej przebudowy. Dodanie wideo **nie dodaje automatycznie** ścieżki audio i odwrotnie.
- **Ergonomia:** dodane tory dopiero na żądanie; V3 nad V2 nad V1, niezależne A1/A2/A3, T ponad obrazem. Pionowy scroll obszaru ścieżek, możliwość zwinięcia/zmiany wysokości audio, przewijanie poziome zsynchronizowane z podziałką. Na każdym torze opcje mute/ukryj (dla wideo), blokada, Solo odsłuchu (0.27) oraz osobne R dla Ripple; jednoznaczne podpisy i podpowiedzi.
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

### 7. „Zastąp źródło” bez utraty montażu — wykonane w 0.23 / PR #9

- Akcja dla pliku w bibliotece: zamiana odwołania do źródła przy zachowaniu tożsamości klipów, ich pozycji, ręcznych cięć, kadrowania, transformacji i efektów tam, gdzie wynik pozostaje poprawny.
- Najpierw sprawdzić zgodność nowego pliku przez FFprobe (czas, liczba i typ strumieni, proporcje/obrót, FPS, audio). Jeśli wymiana skróci materiał poniżej użytych `sourceOut`, pokazać konkretne konflikty i zaoferować anulowanie albo jawne, kontrolowane dopasowanie.
- Dotychczasowe napisy/transkrypcje źródłowe wymagają odświeżenia lub świadomego zachowania, gdy nie odpowiadają nowemu nagraniu; nie przenosić ich po cichu na obcą wypowiedź.
- Unieważniać stare proxy, miniatury, waveforms i cache źródła; zachować dane autorskie/licencje audio z prawidłowym przypisaniem. Testy wielu wystąpień jednego źródła i cofania zamiany.

### 8. Kontrola jakości przed eksportem (preflight) — raport 0.23, pomiary i napisy 0.24

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

**Status:** punkty 1, 2, 3, 4, 6, 7 i 9 wykonane. Punkt 8 ma raport źródeł i luk z 0.23 oraz rzeczywiste pomiary miksu/obrazu i granice napisów/strefy z 0.24; ocena dowolnych przyszłych grafik i automatyczna ocena kompozycji kadru pozostają rozszerzeniami. Dynamiczne V3/A3 wykonano w 0.22; zatwierdzone UX A/B/C z issue #4 wykonano w 0.19–0.21 jako osobne zmiany. Pozostałe rozszerzenia nadal planowane. Punkt 5 (kolorowe znaczniki na osi czasu) celowo pominięty.



## 0.23 — źródła i podstawowy preflight (ukończone)

Odnajdywanie plików i zastępowanie źródła z wyborem polityki napisów, ochroną licencji i blokad, zgodnością FFprobe, pełną walidacją zakresów i pojedynczym Undo. Zbyt krótki plik można anulować lub zastąpić innym; bez automatycznych zmian ujęć. Pojedynczy plik, bez batch relink. Tożsamość klipów i schemat v11 pozostają bez zmian. Odświeżane proxy, miniatury i waveforms, jednorazowa akceptacja identyfikatora backendu z ponownym sprawdzeniem odcisku pliku.

Raport przed eksportem sprawdza dostępność i parametry źródeł oraz luki bez obrazu na widocznych torach; oddziela blokady od ostrzeżeń i pozwala przejść do pliku/czasu. To podstawowa część punktu 8: **pomiary miksu, clippingu, ciszy, czarnych klatek, stref i kadrowania nadal planowane**. Nie deklarować tych analiz jako wdrożonych. SmartCut/Export Studio nadal osobno.

Odbiór 0.23: Windows run 39140872733, 184 TS, 79 Rust, 15 integracyjnych, instalacja i WebView2 1366×700 / Full HD; sprawdzone zrzuty. PR #9 połączony; instalator 12141718156. Odnajdywanie prawdziwego braku źródła, zapis/reopen i autoryzacja potwierdzone natywnie. Podmiana nieużywanego assetu zachowuje transkrypcję montażu; waveform czyści stare piksele podczas analizy zamiennika.


## 0.24 — pełna analiza przed eksportem i normalizacja (ukończone)

- [x] Pomiar rzeczywistego miksu MLT stereo float: EBU R128 LUFS, true peak, ryzyko przesterowania, zakresy ciszy i ciemnego obrazu, skok na oś.
- [x] Granice napisów z rzeczywistym fontem i łamaniem, wybrana strefa bezpieczna 9:16.
- [x] Analiza na żądanie, fazowy postęp, anulowanie, cztery wyniki cache z odciskami źródeł/narzędzi; limity roboczych plików i liczby zdarzeń.
- [x] Normalizacja master: cel −14/−16/−23 LUFS lub własny, ograniczenie szczytów, uczciwy przewidywany wynik, zgodność podglądu/eksportu, jeden Undo i reset.
- [x] Schemat v12 i migracje v1–v11 z gain 0; nie naruszać obwiedni i reguł montażu.
- [x] Usuwanie tylko nieużywanych źródeł z biblioteki, bez usuwania plików, z Undo i ochroną blokad.
- [x] Pełny zielony odbiór Windows 39159998515 i równoległy 39159995807: 195 TS, 85 Rust, 16 integracyjnych, rzeczywisty FFmpeg/MLT, WebView2 1366×700 / Full HD, crash/restart, instalacja i instalator 12148458846. Zrzuty sprawdzone. PR #10 połączony.

Ograniczenia: pomiar obrazu przed napisami i w 320 px / 30 FPS; czarne/ciemne sceny są heurystyką. Normalizacja stałym wzmocnieniem nie kompresuje dynamiki i nie naprawia przesterowanych źródeł. Wynik po kodowaniu AAC może mieć nieco inne szczyty. Bez SmartCut, Export Studio, automatycznego duckingu i efektów odszumiania w tej paczce.


## 0.25 — Ripple bez okna (ukończone)

- [x] Natychmiastowa bezpieczna operacja, jeden Undo/Redo; niemodalny konflikt z jawnym zwykłym cięciem i anulowaniem.
- [x] Automatycznie tylko V od 00:00; niezależne A/T chronione, niezależnie od busa filmu. Zaawansowane ustawienia toru zamiast R·A/R+/R−.
- [x] Zegar źródłowy powiązanego dźwięku, J/L-cut, blokady, późne tory, istniejące jawne ustawienia; schemat nadal v12.
- [x] Wspólne dane TS/Rust i test rzeczywistego miksu MLT/FFmpeg: muzyka od 0/10 sekund na A1 oraz odłączony J/L-cut.
- [x] Pełny zielony odbiór Windows 39163940646 i równoległy 39163938036: 209 TS, 85 Rust, 17 rzeczywistych integracyjnych, WebView2 1366×700 / Full HD, crash/restart, instalacja i instalator 12149598498. Zrzuty sprawdzone; PR #12 połączony. Schemat nadal v12.

Następnie oddzielny PR: czytelne pełne A i zwięzły waveform połączonego dźwięku przy V. Bez mieszania z tą zmianą reguł Ripple.


## 0.26 — czytelne audio (ukończone, druga część issue #11)

- [x] Jedno ujęcie V zawiera połączony waveform i automatykę; niezależne/odłączone A zajmuje pełny rząd.
- [x] Nakładające się niezależne audio ma czytelne rzędy także w dawnych projektach, bez zmiany pozycji i miksu.
- [x] Jawna propozycja rozdzielenia na wolny A lub dodanie dalszego A jako jeden Undo, z ochroną blokad i limitem 16.
- [x] Widoczne trasowanie i zależność mute, obraz ukrywany osobno; schemat nadal v12, bez zmian silników.
- [x] Testy geometrii, v10/v11/v12, wspólna próbka rzeczywistych testów WebView2 i regresje automatyki/gestów.
- [x] Pełny zielony Windows run 39189432808 i push 39189417417: 220 TS, 85 Rust, 17 rzeczywistych integracyjnych, produkcyjna kompilacja, instalacja, WebView2 1366×700 / Full HD, crash/restart i instalator 12160120281. Zrzuty sprawdzone; PR #13 połączony.

SmartCut / Export Studio nadal oddzielnymi etapami. Solo, dowolną kolejność V/A i trwałe wysokości wdrożono w 0.27.

## Stabilizacja testów po 0.28

- [x] Audio026 (0.29): odrębny tytuł checkpointu i oczekiwanie na jego załadowanie oraz odblokowanie zapobiega odczytowi starych rzędów jako zakończenia Open. Wyścig pochodził z push 39220204501; pełny nowy odbiór Windows 39244370925 potwierdził poprawkę.

