#!/usr/bin/env bash
# Run in MSYS2 MINGW64. Sources and this script accompany the installed binaries.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$root/.tools/vendor-build"
out="$root/src-tauri/.bundled"
mkdir -p "$work" "$out/vendor" "$out/sources" "$out/licenses"
fetch() {
  local name="$1" repo="$2" revision="$3"
  curl --fail --location --retry 3 "https://codeload.github.com/$repo/tar.gz/$revision" -o "$out/sources/$name.tar.gz"
  mkdir -p "$work/$name"
  tar -xzf "$out/sources/$name.tar.gz" --strip-components=1 -C "$work/$name"
}
fetch ffmpeg FFmpeg/FFmpeg 894da5ca7d742e4429ffb2af534fcda0103ef593
fetch x264 mirror/x264 31e19f92f00c7003fa115047ce50978bc98c3a0d
prefix="$work/prefix"
cd "$work/x264"
./configure --prefix="$prefix" --enable-static --disable-cli --disable-opencl --bit-depth=8 --chroma-format=420
make -j2
make install
cd "$work/ffmpeg"
PKG_CONFIG_PATH="$prefix/lib/pkgconfig" ./configure --prefix="$prefix" --disable-doc --disable-debug --disable-network --disable-autodetect --disable-ffplay --enable-gpl --enable-libx264 --enable-static --disable-shared --disable-pthreads --enable-w32threads --pkg-config-flags=--static --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib -static"
make -j2 ffmpeg.exe ffprobe.exe
cp ffmpeg.exe ffprobe.exe "$out/vendor/"
cp COPYING.GPLv2 "$out/licenses/FFmpeg-GPL-2.0.txt"
cp "$work/x264/COPYING" "$out/licenses/x264-COPYING.txt"
cp ffbuild/config.mak "$out/sources/ffmpeg-config.mak"
cp "$work/x264/config.mak" "$out/sources/x264-config.mak"
cp "$root/scripts/build-bundled-ffmpeg.sh" "$out/sources/"
# License notices for MinGW runtime libraries and other build tools, unmodified.
cp -R /mingw64/share/licenses "$out/licenses/mingw-toolchain"
"$out/vendor/ffmpeg.exe" -version > "$out/licenses/FFmpeg-build.txt"
"$out/vendor/ffmpeg.exe" -L >> "$out/licenses/FFmpeg-build.txt"
# Fail rather than ship an accidental dependency on DLLs from the CI machine.
for exe in "$out/vendor/ffmpeg.exe" "$out/vendor/ffprobe.exe"; do
  if objdump -p "$exe" | sed -n 's/.*DLL Name: //p' | grep -Eiq '(libgcc|libstdc\+\+|libwinpthread|libx264|avcodec|avformat).*\.dll'; then
    echo "Unexpected external DLL: $exe" >&2; exit 1
  fi
done
