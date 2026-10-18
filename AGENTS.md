# Ustalenia projektu RolVixa

## Ikony interfejsu

Użytkownik wskazał 2026-10-17 **Tabler Icons** jako zestaw ikon dla całego interfejsu: https://tabler.io/icons.

Od 0.13 korzystamy z oficjalnego zestawu v3.35.0 (MIT), którego statyczny podzbiór jest w `src/tabler-icons.json`. Ikony renderuje wspólny komponent `src/Icons.tsx`. Kolejne kontrolki powinny korzystać z tego samego zestawu. Przy aktualizacji zachowaj licencję `licenses/Tabler-Icons-MIT.txt` i opis pochodzenia.

## Kolejność prac

Wykonane: 0.13 — odsłuch Openverse, Kenney, przebieg audio i Tabler Icons; 0.14 — proxy SDR, siatka mediów i strefy bezpieczne; 0.15 — nagłówek i zapis projektu; 0.16 — fade in/out, punkty głośności i schemat v9. Pełny odbiór Windows 0.16: run 39069356974, 115 testów TypeScript, 54 Rust, 10 integracyjnych, rzeczywisty WebView2 oraz instalator.

Obwiednia audio ma źródłowe czasy, zachowywane przy trim/split/copy. Wspólny model: `clip.volume × envelope × fadeIn × fadeOut`; punkty liniowe, fade smoothstep. MLT używa natywnego filtra volume i adaptacyjnych kluczy dB, FFmpeg kontrolowanych wyrażeń. Nie zastępować tego przez avfilter.volume bez ponownych testów miksu — weryfikacja 0.16 wykazała awarię tego wariantu przy połączonym i osobnym audio. Gest ma lokalny draft i jeden krok Undo; odsłuch po zatwierdzeniu. Ograniczenia: 64 punkty/klip, oś MLT 30 FPS. README i ROADMAP opisują obsługę i przyszłe rozszerzenia; SmartCut oraz Export Studio pozostają osobnymi planami.

## Priorytety dalszego rozwoju

Użytkownik zatwierdził kolejność: **autozapis/odzyskiwanie → podgląd źródła i In/Out → Ripple Edit oraz odłączanie audio / J-cut / L-cut na V1/V2/A1/A2 → dynamiczne V3/A3** (issue #3, ważny etap). Nie blokować Ripple oczekiwaniem na trzecią ścieżkę. Algorytm Ripple projektować bez zakodowanego limitu dwóch torów, aby rozszerzyć go później bez zmiany reguł. Dotychczasowe wyłączenie R dla torów rozpoczynających się po 00:00 pozostaje w mocy. Gdy model rozszerzamy o V3/A3, migracje TS/Rust, zgodność projektów, podgląd i eksport są obowiązkowe. Kolejne szczegóły w ROADMAP.md.

## Wykonane w 0.17

Połączono odzyskiwanie i podgląd źródła/I/O. Kopie: odrębny atomowy zapis, dwie generacje, blokada OS, czyszczenie własnych osieroconych tempów; nie zmieniać statusu ani pliku zapisu ręcznego. Rust ≥1.89. Nieczytelne/nowsze kopie czekają na wyraźne odrzucenie. Podgląd źródła używa wspólnego MLT (montaż jest zawieszony), miniatury pojedynczej kolejki FFmpeg z proxy. Zakres I/O ma czasy źródła, jest sesyjny; dodanie to jeden krok Undo. Schemat nadal v9.

Pełny odbiór Windows 0.17: run 39097201488, wszystkie kroki zielone — 125 TS, 59 Rust, 11 integracyjnych, instalacja i WebView2. Potwierdzone wymuszone zakończenie procesu, ponowne uruchomienie, przyszły schemat, zapis mimo błędu autozapisu, anulowanie dialogu, I/O/przeciąganie/Undo i widoki 1366/Full HD. Instalator: artefakt 12124839247. Szczegóły i ograniczenia w README. Dalej obowiązuje kolejność Ripple/J/L-cut → V3/A3 z sekcji priorytetów powyżej.

## Wdrożenie 0.18

Ripple/odłączanie audio/J-cut/L-cut ukończone na obecnych torach. Pełny zielony odbiór Windows: run 39105640931, 150 TS, 62 Rust, 12 integracyjnych, instalator 12128183979 i WebView2 1366/Full HD. Schemat v10; import v1–v9 ustawia globalne Ripple Off. TrackState ma locked i ripple auto/on/off, klip ma audioDetached, syncGroup i opcjonalny crossfade. Crossfade zachowuje liniowy miks dawnego przejścia w źródłowym czasie, mnożony przez volume, punkty i smoothstep fade’y; nie podwajać dźwięku odłączonego wideo. Ripple ma podgląd, zachowuje pozostałe luki, nie zmienia zwykłego ruchu klipu, wykrywa konflikty i chroni blokady. Nie używać closeGaps jako implementacji Ripple. Kolejny zatwierdzony priorytet po odbiorze: dynamiczne V3/A3 i dalsze tory (issue #3), bez zmiany reguł montażu. Nie wdrażać SmartCut w tej paczce.

## Zatwierdzone poprawki UX

Użytkownik zakończył zbieranie ośmiu uwag do interfejsu. Dokładna specyfikacja i kryteria odbioru w [GitHub issue #4](https://github.com/ankelmarek/AutoNapisy/issues/4) i ROADMAP.md. Rozbić prace na 3 niezależne PR: A (napisy, ikony transkrypcji/SRT, skasowanie etykiety MONTAŻ i zbędnego opisu V1/V2, podpis „Eksportuj” na żółtym przycisku), B (usunąć redundantną zakładkę Warstwy, ale zachować FrameEditor/TransformControls i widoczność torów; siatka kafelków przejść z wiernym demo; przeciągane splittery paneli), C (ekran startowy z 6 ostatnimi projektami, z pierwszeństwem odzyskiwania po awarii i autoryzacją plików w backendzie). Nie mieszać UX z migracją schematu torów; zachować Ripple/J/L-cut → V3/A3. Używać wyłącznie istniejących Tabler Icons oraz testować WebView2/1366×768/Full HD.



Ctrl+O/Nowy sprawdzają bieżące `saver.state` i `latestProject.current`, bez stanu z poprzedniego handlera klawiatury. R i blokady nie należą do klucza strumienia MLT (tylko mute/widoczność): ich przełączanie nie powinno restartować dekodera. Blokada chroni też docelowy tor przy przenoszeniu istniejącego klipu.

## Wykonane w 0.19 — UX A

Uproszczono napisy i pusty stan, dodano istniejące ikony Tabler z tekstem akcji i podpis Eksportuj, usunięto MONTAŻ i stały opis V1/V2. Eksport SRT sprawdza faktyczne napisy montażu także przy pustym project.segments; zachować walidację granic i atomowy zapis UTF-8. Schemat nadal v10. Osobny PR #5 połączony. Pełny zielony Windows run 39113930634: 150 TS, 64 Rust, 12 integracyjnych, instalacja, natywny plik SRT z polskimi znakami i WebView2 1366/Full HD (zrzuty sprawdzone). Instalator: 12131567187. UX B i C pozostają do realizacji w osobnych PR; dynamiczne V3/A3 pozostają następnym dużym etapem montażu.
