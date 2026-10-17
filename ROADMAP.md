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
