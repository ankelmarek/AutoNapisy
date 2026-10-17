# Ustalenia projektu RolVixa

## Ikony interfejsu

Użytkownik wskazał 2026-10-17 **Tabler Icons** jako zestaw ikon dla całego interfejsu: https://tabler.io/icons.

Od 0.13 korzystamy z oficjalnego zestawu v3.35.0 (MIT), którego statyczny podzbiór jest w `src/tabler-icons.json`. Ikony renderuje wspólny komponent `src/Icons.tsx`. Kolejne kontrolki powinny korzystać z tego samego zestawu. Przy aktualizacji zachowaj licencję `licenses/Tabler-Icons-MIT.txt` i opis pochodzenia.

## Kolejność prac

Bieżąca iteracja 0.13: odsłuch Openverse przed importem, kontrolki odsłuchu, kategorie Kenney, większy przebieg audio i Tabler Icons. Następny priorytet wydajnościowy: pełne proxy wideo. SmartCut pozostaje osobnym planowanym etapem. Szczegóły w ROADMAP.md.
