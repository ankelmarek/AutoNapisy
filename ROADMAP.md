# Kolejne etapy RolVixa

## NAJBLIŻSZY PRIORYTET P1 - nagłówek i poprawny zapis projektu

**Zatwierdzone przez użytkownika.** Po odbiorze gałęzi 0.14/proxy, a **przed** zaawansowanym audio, SmartCut i Export Studio, wdrożyć nowy nagłówek oraz właściwe `Zapisz` / `Zapisz jako`. Pełne kryteria i testy: **[issue #2 - nowy nagłówek i zapis](https://github.com/ankelmarek/AutoNapisy/issues/2)**.

- [ ] Przenieść menu **Projekt ▼** bezpośrednio obok logo RolVixa; tekstowe pozycje `Zapisz` / `Zapisz jako...` pozostają w menu.
- [ ] Na prawym końcu belki: dwie **ikonowe**, zawsze widoczne akcje: **Zapisz** (dyskietka; kolor statusu) i **Eksportuj** (większy żółty przycisk z ikoną; na początek obecny eksport MP4). Używać Tabler Icons, czytelnych tooltipów, aria-label i skrótów.
- [ ] Status zapisu: **zielony** - zapisano; **żółty** - niezapisany / są zmiany; **niebieski** - trwa zapis; **czerwony** - błąd. Stan wynika ze skutku rzeczywistej operacji i rewizji projektu, nie tylko z timera.
- [ ] **Ctrl+S**: pierwszy zapis pyta o plik; wszystkie następne zapisują do zapamiętanej ścieżki bez dialogu. **Ctrl+Shift+S**: `Zapisz jako` zawsze pyta o nazwę i po sukcesie ustawia nową aktywną ścieżkę. Wybrać zabezpieczony, atomowy zapis i ochronę przed konfliktem z modyfikacją zewnętrzną; żadnych dowolnych ścieżek zapisu z frontendu.
- [ ] Nazwa projektu jako wyraźny tytuł z **ołówkiem**. Kliknięcie tytułu/ołówka włącza edycję (Enter/zatwierdź, Esc/anuluj), zmiana nazwy nie zmienia nazwy istniejącego pliku na dysku.
- [ ] Testy 1366×768, Full HD, skrótów, menu i edycji tytułu, projektu świeżego i otwartego, anulowania i błędów zapisu, danych niezapisanych podczas zapisywania; zachować kompatybilność starszych projektów.
- [ ] Ukończyć jako osobną, przetestowaną zmianę/PR, **nie doklejać do trwającego proxy**. Docelowy panel z presetami eksportu to **[odłożone issue #1](https://github.com/ankelmarek/AutoNapisy/issues/1)**, bez zmiany zakresu tego zadania.

## Wykonane w 0.14 — proxy i biblioteka

- [x] Proxy SDR H.264/AAC: diagnostyka FFprobe, automatyczne przygotowanie wymagających źródeł, profile 540p/720p, kolejka, rzeczywisty postęp i anulowanie.
- [x] Trwały cache z identyfikacją źródeł, limitem 8 GiB, kontrolą miejsca i czyszczeniem; przełączanie oryginał/proxy w podglądzie MLT i miniaturach.
- [x] Eksport i transkrypcja z oryginałów; proxy nie zmienia projektu ani czasów montażu.
- [x] Siatka miniaturek i zielony znacznik użycia źródła, aktualizowany z osi oraz Undo/Redo.
- [x] Regulowane, przybliżone strefy Reels/TikTok/Shorts w podglądzie 9:16, poza eksportem.
- [x] Czytelna pełna długość utworu Openverse i poprawiona warstwa okna ustawień.
- [ ] Rozszerzenie proxy o świadomą konwersję HDR→SDR i dalsze pomiary wydajności. 0.14 pozostawia wykryte PQ/HLG na oryginale.

Kryteria i ograniczenia profilu 0.14 oraz instrukcja użytkownika są w README. Następny etap pozostaje **P1 z issue #2**, jako osobna zmiana.

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

Proxy SDR wdrożono w 0.14; najbliższy etap to P1 (nagłówek i zapis) powyżej. SmartCut pozostaje późniejszym etapem.

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

## Edycja audio i siatka mediów: usprawnienia UI/UX (TODO)

Cztery uzgodnione kierunki: automatyka głośności przez Alt+klik, płynne fade in/out z uchwytów, zielony znacznik klipu użytego na osi i siatka miniaturek zamiast listy w zakładce Pliki. Zaplanować jako odrębny etap bez ingerowania w aktualne prace Codex nad proxy. Nowe kontrolki wykorzystują istniejący styl Tabler Icons.

### A. Punkty głośności na osi audio (volume keyframes)

- **Alt+klik** na linii głośności klipu audio dodaje punkt w dokładnym czasie kliknięcia, bez przesuwania klipu i głowicy. Obsługiwać również dźwięk powiązany z klipem wideo na A1/A2.
- Punkt można przeciągać **pionowo** (poziom) i **poziomo** (czas), z ograniczeniem do długości klipu i kolejności sąsiadujących punktów. Pokazywać czas oraz realną głośność (procent, opcjonalnie dB). Wymagana precyzyjna edycja, obsługa klawiatury i usuwanie punktu z menu kontekstowego/Delete.
- Linia ma przedstawiać rzeczywistą obwiednię; odcinki między punktami na początek interpolowane liniowo. Dodanie punktu bez przesunięcia nie może zmienić dźwięku. Brak punktów zachowuje aktualne działanie pojedynczej wartości `clip.volume`.
- Model danych powinien rozdzielać bazową głośność klipu, punkty automatyki i fade. Proponowana semantyka: `wynik = clip.volume × envelope(t) × fadeIn(t) × fadeOut(t)` (oraz istniejące mute ścieżek). Definicje i wyświetlana linia powinny być spójne w frontendzie, MLT, eksporcie i transkrypcji.
- Zapis i odczyt w nowym schemacie projektu z migracją starszych projektów. Uwzględnić Undo/Redo (jeden gest to jeden krok), kopię/duplikowanie, przesuwanie, przycinanie, dzielenie, zmianę prędkości jeśli dojdzie, oraz powrót po ponownym otwarciu.
- Podczas przeciągania zapewnić responsywny podgląd linii i wskazania, bez wielokrotnego kosztownego renderowania MLT. Weryfikacja audio po zatwierdzeniu gestu; jeśli dostępny jest odsłuch na żywo, nie może rozmijać się z finalnym eksportem.

### B. Fade in / fade out na uchwytach audio

- Dwa małe, dostępne myszą i klawiaturą **okrągłe uchwyty** przy początku i końcu ścieżki audio. Przeciąganie lewego w prawo ustala czas narastania, prawego w lewo ustala czas wyciszenia. Wizualizować krzywe na przebiegu dźwięku bez zmiany skali samego waveform.
- Fade ma działać na osobnych klipach audio oraz audio połączonym z wideo; wartości domyślnie zerowe (bez automatycznego wyciszania). Kształt krzywej początkowo łagodny, później możliwe presety liniowy/łagodny (np. equal-power tam, gdzie uzasadnione).
- Fade i keyframes muszą się **łączyć**, a nie nadpisywać; wynikiem jest jedna widoczna i renderowana obwiednia. Długości fade nie przekraczają klipu. Jeżeli dwa fade nachodzą na siebie, jasno określić sposób połączenia (mnożenie ramp) i utrzymać podgląd zgodny z eksportem.
- „Inteligentne” ułatwienia: opcjonalna podpowiedź/ciche przyciąganie do sensownych miejsc na podstawie poziomu audio, bez samoczynnego stosowania; użytkownik może ręcznie ustawić dokładny czas albo wyłączyć przyciąganie. Priorytetem jest kontrola, a nie AI.
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

## Kolejna paczka ergonomii montażu: zatwierdzone funkcje (TODO)

Użytkownik zatwierdził z poprzedniej listy **punkty 1, 2, 3, 4, 6, 7, 8, 9**. **Punkt 5 (kolorowe znaczniki na osi) nie jest częścią tej paczki.** Celem jest intuicyjny, niedestrukcyjny montaż z pełną kontrolą użytkownika. Nie wdrażać wszystkiego jedną zmianą; weryfikować każdą funkcję na realnym podglądzie MLT i eksporcie. Korzystać z Tabler Icons.

### 1. Scrubbing miniaturek w bibliotece i podgląd źródła

- Po przesuwaniu kursora w poziomie po miniaturze filmu wyświetlać klatki odpowiadające pozycji kursora w **źródłowym nagraniu**, bez zmiany głowicy i montażu projektu. Po opuszczeniu miniatury wraca kadr reprezentatywny. Dla klawiatury/touch zapewnić osobne polecenie „Podgląd źródła”.
- Kliknięcie/otwarcie karty wyświetla **podgląd pliku źródłowego** (source viewer), wyraźnie odróżniony od podglądu aktualnego montażu; bez przypadkowego dodawania na oś.
- Miniaturki dekodować oszczędnie: ograniczyć liczbę jednoczesnych dekoderów i częstotliwość odczytu, buforować klatki, odwoływać nieaktualne zadania. W miarę dostępności korzystać z proxy zamiast wielokrotnie dekodować HEVC/4K; przy braku proxy zastosować bezpieczny fallback.

### 2. Zaznaczanie In / Out przed dodaniem na oś

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

### 9. Autozapis i odzyskiwanie sesji po awarii

- Zapisywać kopie odzyskiwania stanu **lokalnie** i atomowo, z rozsądnym odstępem/debounce oraz na wybranych punktach ryzyka. Autozapis nigdy nie nadpisuje ręcznie zapisanego pliku projektu bez świadomego polecenia.
- Po uruchomieniu po awarii wyświetlić różnicę czasu/stanu pomiędzy ostatnim zapisem ręcznym i kopią awaryjną oraz opcje **„Odzyskaj”, „Otwórz zapisany projekt”, „Odrzuć kopię”**. Zachować poprzednią kopię do czasu zakończenia odzyskiwania.
- Ograniczać liczbę/miejsce kopii; nie umieszczać kopii filmów i audio w snapshots, tylko bezpieczne odwołania do źródeł. Obsłużyć brak miejsca, uszkodzony JSON, nieaktualną wersję schematu, brak mediów i zamknięcie podczas zapisu.
- Zapis ma nie blokować UI, zapewnić walidację i poprawne Undo/Redo po odzyskaniu; testy symulowanej awarii i ponownego otwarcia.

### Proponowane etapy i wspólne testy

1. Najpierw **9 (odzyskiwanie)**, aby zmniejszyć ryzyko utraty pracy podczas dalszej rozbudowy.
2. Następnie **1 + 2 (biblioteka źródeł)**, najlepiej po ustabilizowaniu proxy. Zachować kompatybilność z siatką miniaturek i zielonym znacznikiem wykorzystania źródła.
3. Następnie **3 + 4 (J/L-cut i Ripple)**: zaplanować wspólne reguły powiązania audio z obrazem, przesunięć na osi oraz napisów, by nie utracić synchronizacji.
4. Niezależnie dodać **6 (strefy bezpieczne)**, **7 (zastępowanie źródła)** oraz **8 (preflight)**; zastępowanie źródła uwzględnia mechanizm proxy, a preflight wymaga stabilnego i sprawdzalnego eksportu.
5. Każdy etap wymaga testów TypeScript/Rust oraz realnego podglądu MLT i porównania z eksportem; potwierdzić migracje schematów, Undo/Redo, działania przy brakującym źródle i bez internetu.

**Status:** zaakceptowane do TODO; bez rozpoczęcia implementacji. Punkt 5 (kolorowe znaczniki na osi czasu) celowo pominięty.
