RolVixa — demonstracje przejść

Obrazy A/B to własne, proceduralne grafiki projektu, bez zdjęć ani nagrań użytkownika.
Każdy klip pokazuje prawdziwy filtr xfade FFmpeg odpowiadający nazwie pliku.
192×192, H.264/yuv420p, 30 FPS, bez audio: 0,3 s A + 1 s przejścia + 0,3 s B.
Interfejs dopasowuje szybkość do wybranej długości i odtwarza najwyżej jeden klip.

Generator: scripts/build-transition-demos.py (Python 3 + FFmpeg z libx264).
Integralność: scripts/test-transition-demos.mjs; sumy SHA-256 w manifest.json.
Test zgodności z rendererem montażu: .test-core/tests/transition_gallery.rs.
Klipy są gotowymi zasobami aplikacji; do ich oglądania nie trzeba uruchamiać FFmpeg.
