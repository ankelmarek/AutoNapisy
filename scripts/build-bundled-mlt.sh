#!/usr/bin/env bash
# Build a small MLT runtime against our existing, network-disabled static FFmpeg.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$root/.tools/mlt-build"
out="$root/src-tauri/.bundled"
ffprefix="$root/.tools/vendor-build/prefix"
prefix="$work/prefix"
install="$out/vendor/mlt"
mkdir -p "$work" "$prefix" "$install" "$out/sources" "$out/licenses/mlt"
jobs=$(nproc); if [ "$jobs" -gt 4 ]; then jobs=4; fi
if [ ! -f "$ffprefix/lib/pkgconfig/libavformat.pc" ]; then
  "$root/scripts/build-bundled-ffmpeg.sh"
  make -C "$root/.tools/vendor-build/ffmpeg" -j"$jobs" install-libs install-headers install-pkgconfig
fi
fetch() {
 local name="$1" url="$2" sum="$3"
 curl --fail --location --retry 3 "$url" -o "$out/sources/$name.tar.gz"
 echo "$sum  $out/sources/$name.tar.gz" | sha256sum -c -
 mkdir -p "$work/$name"
 tar -xzf "$out/sources/$name.tar.gz" --strip-components=1 -C "$work/$name"
}
fetch mlt https://github.com/mltframework/mlt/releases/download/v7.42.0/mlt-7.42.0.tar.gz 8800e343f43aaa885bd5d9d23553030fa220aa3e2f0c94d9fd6a936d41638cdd
fetch libxml2 https://codeload.github.com/GNOME/libxml2/tar.gz/refs/tags/v2.14.6 546ab74561c040df210c88dbd3c652bf509d826954ab2002c8973f1fa8d10130
fetch libiconv https://ftp.gnu.org/pub/gnu/libiconv/libiconv-1.18.tar.gz 3b08f5f4f9b4eb82f151a7040bfd6fe6c6fb922efe4b1659c66ea933276965e8
fetch dlfcn https://codeload.github.com/dlfcn-win32/dlfcn-win32/tar.gz/refs/tags/v1.4.2 f61a874bc9163ab488accb364fd681d109870c86e8071f4710cbcdcbaf9f2565
cd "$work/libiconv"
./configure --prefix="$prefix" --disable-shared --enable-static --disable-nls
make -j"$jobs"
make install
prefix_win=$(cygpath -m "$prefix")
ffprefix_win=$(cygpath -m "$ffprefix")
# Native CMake and pkgconf must see Windows paths, including static dependency search paths.
for pc in "$ffprefix"/lib/pkgconfig/*.pc "$prefix"/lib/pkgconfig/*.pc; do
 [ -f "$pc" ] || continue
 sed -i "s|^prefix=$ffprefix$|prefix=$ffprefix_win|;s|^prefix=$prefix$|prefix=$prefix_win|" "$pc"
done
export PKG_CONFIG_PATH="$prefix/lib/pkgconfig:$ffprefix/lib/pkgconfig"
cmake -S "$work/dlfcn" -B "$work/dlfcn-out" -G 'MinGW Makefiles' -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_INSTALL_PREFIX="$prefix_win" -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTS=OFF
cmake --build "$work/dlfcn-out" -j "$jobs"
cmake --install "$work/dlfcn-out"
cmake -S "$work/libxml2" -B "$work/xml-out" -G 'MinGW Makefiles' -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix_win" -DBUILD_SHARED_LIBS=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_LZMA=OFF -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_HTTP=OFF
cmake --build "$work/xml-out" -j "$jobs"
cmake --install "$work/xml-out"
# MLT derives a pthread archive location from the iconv archive location on MinGW.
cp /mingw64/lib/libwinpthread.a "$prefix/lib/libpthread.a"
# Keep private static FFmpeg dependencies within one linker group.
python - "$work/mlt/src/modules/avformat/CMakeLists.txt" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text().replace('${FFMPEG_LIBRARIES}', '"-Wl,--start-group" ${FFMPEG_LIBRARIES} ${ROLVIXA_FFMPEG_STATIC_DEPS} "-Wl,--end-group"');p.write_text(s)
PY
static_libs=$(pkg-config --static --libs libavformat libavcodec libavfilter libswscale libswresample libavutil | tr ' ' ';')
opts=()
for name in DECKLINK FREI0R GDK GLAXNIMATE_QT6 JACKRACK KDENLIVE MOVIT NDI OLDFILM OPENCV OPENFX PLACEBO PLUS PLUSGPL QT6 RESAMPLE RTAUDIO RUBBERBAND RNNOISE SDL1 SDL2 SOX SPATIALAUDIO VIDSTAB VORBIS XINE; do opts+=("-DMOD_$name=OFF"); done
cmake -S "$work/mlt" -B "$work/mlt-out" -G 'MinGW Makefiles' -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$(cygpath -m "$install")" -DCMAKE_PREFIX_PATH="$prefix_win;$ffprefix_win" -DCMAKE_SHARED_LINKER_FLAGS='-static-libgcc -static-libstdc++' -DCMAKE_MODULE_LINKER_FLAGS='-static-libgcc -static-libstdc++' -DCMAKE_EXE_LINKER_FLAGS='-static-libgcc -static-libstdc++' -DGPL=ON -DGPL3=OFF -DUSE_AVDEVICE=OFF -DMOD_AVFORMAT=ON -DMOD_XML=ON -DMOD_NORMALIZE=ON -DROLVIXA_FFMPEG_STATIC_DEPS="$static_libs" -DBUILD_TESTING=OFF -DBUILD_DOCS=OFF -DCLANG_FORMAT=OFF "${opts[@]}"
cmake --build "$work/mlt-out" -j "$jobs"
cmake --install "$work/mlt-out"
# All compiler runtimes stay beside melt. Never rely on the developer's PATH.
for dll in libwinpthread-1.dll libgcc_s_seh-1.dll libstdc++-6.dll; do cp "/mingw64/bin/$dll" "$install/"; done
find "$install" -type f \( -name '*.exe' -o -name '*.dll' \) -exec strip --strip-unneeded '{}' +
for tree in mlt libiconv dlfcn libxml2; do
 mkdir -p "$out/licenses/mlt/$tree"
 find "$work/$tree" -maxdepth 1 -type f \( -iname 'copying*' -o -iname 'license*' -o -iname 'copyright*' \) -exec cp '{}' "$out/licenses/mlt/$tree/" \;
done
cp "$root/scripts/build-bundled-mlt.sh" "$out/sources/"
cat > "$out/licenses/mlt/README.txt" <<'TXT'
MLT 7.42.0 (LGPL-2.1-or-later framework; GPL-2.0 components enabled).
MLT links our GPL FFmpeg/x264 build; FFmpeg has network support disabled.
libxml2 2.14.6, libiconv 1.18, dlfcn-win32 1.4.2: see included license texts.
Complete upstream source archives and this build recipe are in the sources folder.
Compiler runtime notices are in licenses/mingw-toolchain.
MLT uses generated XML only; user projects cannot supply services or shell commands.
TXT
export MLT_REPOSITORY="$install/lib/mlt"
export MLT_DATA="$install/share/mlt"
export MLT_PROFILES_PATH="$install/share/mlt/profiles"
"$install/melt.exe" --version
"$install/melt.exe" -query consumer=avformat 2> "$work/mlt-services.txt"
grep -q 'identifier: avformat' "$work/mlt-services.txt"
printf 'MLT 7.42.0 built from verified sources\n' > "$install/BUILD.txt"
