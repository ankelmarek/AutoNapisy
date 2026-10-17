# Kolejne etapy RolVixa

## Audio w panelu multimediów — po wdrożeniu MLT 0.11

Nowa zakładka Audio w zasobach multimedialnych, z trzema sekcjami:

- Muzyka: wyszukiwarka frazą korzystająca z API Openverse, odsłuch, pobieranie do biblioteki projektu, zachowane dane autora, adres źródła, typ i adres licencji oraz wymagane przypisanie autorstwa. Wyniki API nie powinny sugerować, że każda pozycja jest dozwolona do każdego zastosowania.
- Dźwięki: wbudowana paczka efektów Kenney, wyszukiwanie i grupowanie według kategorii, odsłuch i przeciąganie na oś. Konkretny zestaw oraz jego licencję trzeba potwierdzić przed dołączeniem; użytkownik odwołał się do innej rozmowy, której treść nie jest dostępna w tej sesji.
- Moje audio: ręczny import własnych plików, miniatury/przebieg, odsłuch, przeciąganie na A1/A2 i dotychczasowe przycinanie oraz głośność.

Katalog Openverse jest świadomie dodawaną funkcją online. Dostęp do API i pobieranie plików przez kontrolowany adapter Rust, bez dowolnych URL/komend z projektu JSON. Ta funkcja nie wymaga wysyłania materiałów montażowych. Efekty Kenney i zaimportowane pliki działają bez połączenia. Biblioteka nie pobiera wszystkiego automatycznie podczas uruchamiania.

Nie implementować tej zakładki w trakcie kończenia i weryfikacji instalatora MLT 0.11.
