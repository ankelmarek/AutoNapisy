# GitHub Actions: retencja artefaktów — issue #32

Status: przygotowane do przeglądu w PR. **Kasowanie jest wyłączone.** Nie ustawiono zmiennej aktywującej, nie usunięto istniejących artefaktów i nie scalono tej zmiany do `main`.

Walidacja lokalna: 37 testów reguł/API/gate'ów, poprawny YAML i porównanie wszystkich kroków Windows z bazą. Poza usuniętym krokiem ręcznego anulowania i dodaniem retencji testów kroki kompilacji/testów/instalacji/WebView2 są identyczne. Pełny przebieg Windows oraz raport API z PR należy ocenić oddzielnie.

## Zasady

- Trzy najnowsze niewygasłe instalatory, wspólnie dla dokładnych nazw `RolVixa-Windows-x64` i `AutoNapisy-Windows-x64`, są chronione w całym repozytorium, niezależnie od workflow, gałęzi i wyniku testów. Kolejność: `created_at`, przy remisie większe ID. Pozostałe są kandydatami dopiero **powyżej** 7 × 24 godzin. Nie skracamy retencji uploadu instalatorów do 2 dni.
- Znane testy/preview/POC/diagnostyka: retencja nowych uploadów 2 dni; stare są kandydatami dopiero powyżej 2 × 24 godzin. Jawna lista nazw jest w `scripts/actions-artifact-policy.mjs`; rozszerzenie `.zip` niczego nie kwalifikuje.
- Nieznane nazwy, przyszłe daty, brak potwierdzenia zakończenia runu i aktywne runy są chronione. Wygasłych artefaktów nie liczymy jako dostępnego instalatora w najnowszej trójce ani ponownie nie usuwamy.
- Releases/tagi/kod/cache/paczki nie mają żadnych operacji zapisu w tym skrypcie. Dodatkowo artefakty pochodzące z commita wskazanego tagiem istniejącego Release są chronione. Brak możliwości zweryfikowania tagu zatrzymuje operację.
- Pełna paginacja jest obowiązkowa. Błąd API, brak uprawnień, zmiana liczby obiektów pomiędzy stronami, powtórzona/ucięta strona lub nieprawidłowe metadane zatrzymują pracę. Skrypt nie próbuje zgadywać ani kontynuować kasowania po błędzie.
- Repozytorium jest na stałe ograniczone do `ankelmarek/AutoNapisy`; fork z inną nazwą nie może uruchomić sprzątania tego repozytorium.

## Audyt i dry-run

[Pierwszy pełny audyt](github-actions-retention-audit.md) obejmuje 329 runów i 388 artefaktów. Każdy kandydat i chroniony obiekt ma ID, nazwę, run, wiek, bajty, decyzję oraz powód. To historyczny raport, nie trwała lista zgód do kasowania. Przyszły plan musi powstać z bieżącej listy.

Workflow `Actions artifact retention` uruchamia testy i **dry-run** w PR, raz dziennie o 05:23 UTC oraz ręcznie. Do raportowania ma tylko `contents: read` / `actions: read`. Pełna tabela/JSON są w dwudniowym artefakcie `Actions-retention-report`, a skrót w Summary runu.

Po zaakceptowaniu i scaleniu PR można uruchomić raport w GitHub: **Actions → Actions artifact retention → Run workflow → execute: false**. Alternatywnie, po zalogowaniu GitHub CLI:

```sh
gh workflow run artifact-retention.yml --repo ankelmarek/AutoNapisy --ref main -f execute=false
gh run list --repo ankelmarek/AutoNapisy --workflow artifact-retention.yml
gh run download NUMER_RUNU --repo ankelmarek/AutoNapisy --name Actions-retention-report
```

Samodzielny skrypt wymaga Node 22+ i `GH_TOKEN` z prawem odczytu Actions/contents w tym repozytorium. Nie wpisuj tokenu do repozytorium ani logów:

```sh
node scripts/actions-artifact-cleanup.mjs
node --test scripts/tests/actions-artifact-*.test.mjs
```

Domyślny wynik: `artifact-retention.md` / `.json`. Do lokalnego ponowienia audytu bez tokenu służy `--snapshot plik.json --output prefiks`; format to `{repository, artifacts, runs, releaseCommitShas}` zgodny z odpowiednimi polami API. Snapshotu **nie można** użyć do kasowania. Skrypt nie pobiera zawartości nagrań, instalatorów ani innych artefaktów — tylko metadane.

## Weryfikacja przed ewentualną aktywacją

1. Sprawdź testy i pełny raport w PR oraz identyfikatory chronionej trójki. Sprawdź potrzebę zachowania starszych dowodów: dwudniowa polityka obejmuje również archiwalne MP4/zrzuty/POC. Przed akceptacją można je pobrać do własnego archiwum.
2. Zatwierdź i scal PR osobno. Sam merge włącza krótką retencję **nowych** uploadów testowych oraz cykliczny **raport**; nie włącza kasowania istniejących artefaktów.
3. Osobno zaakceptuj etap C z issue #32. Dopiero po tej decyzji administrator może utworzyć repository variable `ROLVIXA_ARTIFACT_CLEANUP_ENABLED` z dokładną wartością `true` w **Settings → Secrets and variables → Actions → Variables**. To przełącznik, nie sekret; `GITHUB_TOKEN` wystarcza, PAT nie jest potrzebny.
4. Po aktywacji ręczne kasowanie wymaga dodatkowo **execute: true** i wyboru `main`. Dzienny harmonogram również zacznie wykonywać kasowanie. Ręczne **execute: false** zawsze pozostaje raportem, nawet przy aktywnej zmiennej.

Job kasujący jest odrębny (`actions: write` tylko tam), nie działa w PR ani na innej gałęzi. Przed każdą próbą usunięcia powstaje aktualna lista artefaktów i lista commitów Release, sprawdzany jest nowy status właściwego runu, chroniona trójka oraz aktualne metadane artefaktu. Plan z poprzedniego joba nie jest wykonywany w ciemno. Odpowiedź DELETE inna niż sukces zatrzymuje dalsze operacje. Zmiana stanu oznacza pominięcie obiektu. Jest dziennik potwierdzonych usunięć po każdej operacji oraz artefakt `Actions-retention-execution-report`, także przy częściowym błędzie. GitHub nie oferuje atomowej transakcji między listą Releases, runem i DELETE; zawsze istnieje krótki wyścig pomiędzy ostatnim sprawdzeniem a usunięciem.

## Wyłączenie i rollback

- Przed aktywacją wystarczy nie scalać PR; wszystkie dotychczasowe reguły pozostają w `main`.
- Po aktywacji usuń zmienną lub ustaw ją na `false`; wyłącza kolejne joby kasujące, ale nie zatrzymuje już trwającego procesu. Taki run trzeba od razu anulować w Actions.
- Można wyłączyć cały workflow w Actions albo usunąć harmonogram. Aby przywrócić poprzednie wyzwalacze/retencję nowych uploadów, cofnij commit z PR.
- **Usunięć ani automatycznego wygaśnięcia nie można cofnąć.** Cofnięcie kodu nie odtwarza plików. Ponowny build może stworzyć nowy instalator, ale nie zastąpi historycznego dowodu testów.

## Duplikacja Windows i uprawnienia

Audyt znalazł 96 pushów, dla których w historii istnieje także PR na tym samym `head_sha`. Dotychczasowy `concurrency` rozdzielał `refs/heads/...` i `refs/pull/...`, więc obu nie deduplikował. Dodatkowy krok anulowania widział tylko niektóre push-run i wymagał szerokiego `actions: write` w buildzie.

Proponowana zmiana: push tylko na `main`; gałęzie robocze testuje pełny `pull_request`, także jako draft. Ręczny `workflow_dispatch` zostaje dla gałęzi bez PR. `concurrency` anuluje starszy run tego samego PR/ref. Usunięto ręczny krok anulowania i `actions: write` z Windows. **Wszystkie dotychczasowe testy TS/Rust, rzeczywiste integracje, instalacja oraz WebView2 pozostają bez zmian.** Test po merge na `main` pozostaje osobny: potwierdza scalony commit, który może różnić się od gałęzi PR.

## Co oznaczają rozmiary

API podaje rozmiary przechowywanych artefaktów w bajtach. Sumy w raporcie są potencjalną oszczędnością tych obiektów, nie obietnicą zmiany rachunku. Nie obejmują cache ani wykorzystania minut runnerów. Historyczne usage/billing naliczone w czasie nie zeruje się po skasowaniu; GitHub może aktualizować wskaźniki z opóźnieniem. Skrócona retencja uploadów nie zmienia wstecz retencji istniejących artefaktów — dlatego potrzebny jest osobny, świadomie aktywowany cleanup.
