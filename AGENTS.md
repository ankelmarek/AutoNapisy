# Ustalenia projektu RolVixa

## Ikony interfejsu

Użytkownik wskazał 2026-10-17 **Tabler Icons** jako zestaw ikon dla całego interfejsu: https://tabler.io/icons.

Od 0.13 korzystamy z oficjalnego zestawu v3.35.0 (MIT), którego statyczny podzbiór jest w `src/tabler-icons.json`. Ikony renderuje wspólny komponent `src/Icons.tsx`. Kolejne kontrolki powinny korzystać z tego samego zestawu. Przy aktualizacji zachowaj licencję `licenses/Tabler-Icons-MIT.txt` i opis pochodzenia.

## Kolejność prac

Bieżąca iteracja 0.13: odsłuch Openverse przed importem, kontrolki odsłuchu, kategorie Kenney, większy przebieg audio i Tabler Icons. Następny priorytet wydajnościowy: dokończenie i odbiór proxy wideo 0.14. **Natychmiast po jego odbiorze priorytet P1: nowy nagłówek z kolorową ikoną zapisu, żółtą ikoną eksportu, menu przy logo, czytelną nazwą projektu i prawidłowym Zapisz/Zapisz jako.** Specyfikacja i testy: GitHub issue #2 oraz sekcja na początku ROADMAP.md. Dopiero po tym dalsza automatyka audio, SmartCut i inne rozszerzenia. Export Studio z presetami zostaje odłożone w issue #1.
