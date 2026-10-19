# Materiał POC Animated Captions 0.33a

`caption033-speech.wav`: pierwsze 4 s publicznego przemówienia prezydenta J. F. Kennedy'ego (1961), lokalna próbka `samples/jfk.wav` z whisper.cpp v1.7.6, resampling FFmpeg do mono PCM 16 kHz. Wypowiedź rządu USA jest w domenie publicznej; źródło kopii: https://github.com/ggml-org/whisper.cpp/blob/v1.7.6/samples/jfk.wav.

`caption033-whisper.json` to rzeczywisty wynik lokalnego wielojęzycznego ggml-tiny i whisper.cpp v1.7.6 (`-l en -ojf -ml 100 -sow`), z pominięciem ścieżek i diagnostyki komputera. `caption033-words.json` zawiera te same słowa po produkcyjnym grupowaniu tokenów; test Rust ponownie porównuje je z parserem. Nie jest to fikcyjna transkrypcja ani ręcznie wymyślony czas słów. ASR pozostaje przybliżeniem; zerowa długość pierwszego „And” jest zachowana. POC przycina źródło od 1/3 s, aby pokazać wiarygodne dalsze słowa. Nie służy to ocenie jakości polskiej transkrypcji. Polskie znaki, tekst ręczny i błędne dane mają osobne scenariusze syntetyczne.

Próbka jest wyłącznie fixture testowym. Żaden plik użytkownika nie jest pobierany ani wysyłany podczas POC.
