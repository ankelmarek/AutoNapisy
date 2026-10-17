# Ustalenia projektu RolVixa

## Ikony interfejsu

Użytkownik wskazał 2026-10-17 **Tabler Icons** jako zestaw ikon dla całego interfejsu: https://tabler.io/icons.

Od 0.13 korzystamy z oficjalnego zestawu v3.35.0 (MIT), którego statyczny podzbiór jest w `src/tabler-icons.json`. Ikony renderuje wspólny komponent `src/Icons.tsx`. Kolejne kontrolki powinny korzystać z tego samego zestawu. Przy aktualizacji zachowaj licencję `licenses/Tabler-Icons-MIT.txt` i opis pochodzenia.

## Kolejność prac

Wykonane: 0.13 — odsłuch Openverse, kontrolki odsłuchu, kategorie Kenney, większy przebieg audio i Tabler Icons; 0.14 — proxy SDR, siatka mediów i strefy bezpieczne; 0.15 — nagłówek i poprawny Zapisz/Zapisz jako (issue #2). Pełna weryfikacja Windows 0.15: run 39066339364, 106 testów TS, 50 Rust, 8 integracyjnych oraz rzeczywisty WebView2 i instalator. Następny planowany kierunek: audio fade i automatyka głośności; SmartCut i Export Studio (issue #1) pozostają osobnymi etapami. Szczegóły i kryteria w ROADMAP.md.
