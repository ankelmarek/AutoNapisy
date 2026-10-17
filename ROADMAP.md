# Kolejne etapy RolVixa

## Audio w panelu multimediów — po wdrożeniu MLT 0.11

Nowa zakładka Audio w zasobach multimedialnych, z trzema sekcjami:

- Muzyka: wyszukiwarka frazą korzystająca z API Openverse, odsłuch, pobieranie do biblioteki projektu, zachowane dane autora, adres źródła, typ i adres licencji oraz wymagane przypisanie autorstwa. Wyniki API nie powinny sugerować, że każda pozycja jest dozwolona do każdego zastosowania.
- Dźwięki: wbudowana paczka efektów Kenney, wyszukiwanie i grupowanie według kategorii, odsłuch i przeciąganie na oś. Konkretny zestaw oraz jego licencję trzeba potwierdzić przed dołączeniem; użytkownik odwołał się do innej rozmowy, której treść nie jest dostępna w tej sesji.
- Moje audio: ręczny import własnych plików, miniatury/przebieg, odsłuch, przeciąganie na A1/A2 i dotychczasowe przycinanie oraz głośność.

Katalog Openverse jest świadomie dodawaną funkcją online. Dostęp do API i pobieranie plików przez kontrolowany adapter Rust, bez dowolnych URL/komend z projektu JSON. Ta funkcja nie wymaga wysyłania materiałów montażowych. Efekty Kenney i zaimportowane pliki działają bez połączenia. Biblioteka nie pobiera wszystkiego automatycznie podczas uruchamiania.

Nie implementować tej zakładki w trakcie kończenia i weryfikacji instalatora MLT 0.11.

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

## Proxy wideo: inteligentny import i płynny montaż (wysoki priorytet, TODO)

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

Status: **do implementacji po ustabilizowaniu bieżącego wydania**. Wysoki priorytet ze względu na płynność pracy oraz obsługę nagrań z telefonów.
