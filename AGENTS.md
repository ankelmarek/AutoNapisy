# Ustalenia projektu RolVixa

## Ikony interfejsu

Użytkownik wskazał 2026-10-17 **Tabler Icons** jako zestaw ikon dla całego interfejsu: https://tabler.io/icons.

Od 0.13 korzystamy z oficjalnego zestawu v3.35.0 (MIT), którego statyczny podzbiór jest w `src/tabler-icons.json`. Ikony renderuje wspólny komponent `src/Icons.tsx`. Kolejne kontrolki powinny korzystać z tego samego zestawu. Przy aktualizacji zachowaj licencję `licenses/Tabler-Icons-MIT.txt` i opis pochodzenia.

## Kolejność prac

Wykonane: 0.13 — odsłuch Openverse, Kenney, przebieg audio i Tabler Icons; 0.14 — proxy SDR, siatka mediów i strefy bezpieczne; 0.15 — nagłówek i zapis projektu; 0.16 — fade in/out, punkty głośności i schemat v9. Pełny odbiór Windows 0.16: run 39069356974, 115 testów TypeScript, 54 Rust, 10 integracyjnych, rzeczywisty WebView2 oraz instalator.

Obwiednia audio ma źródłowe czasy, zachowywane przy trim/split/copy. Wspólny model: `clip.volume × envelope × fadeIn × fadeOut`; punkty liniowe, fade smoothstep. MLT używa natywnego filtra volume i adaptacyjnych kluczy dB, FFmpeg kontrolowanych wyrażeń. Nie zastępować tego przez avfilter.volume bez ponownych testów miksu — weryfikacja 0.16 wykazała awarię tego wariantu przy połączonym i osobnym audio. Gest ma lokalny draft i jeden krok Undo; odsłuch po zatwierdzeniu. Ograniczenia: 64 punkty/klip, oś MLT 30 FPS. README i ROADMAP opisują obsługę i przyszłe rozszerzenia; SmartCut oraz Export Studio pozostają osobnymi planami.
