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
fetch zlib madler/zlib da607da739fa6047df13e66a2af6b8bec7c2a498
prefix="$work/prefix"
jobs=$(nproc)
if [ "$jobs" -gt 4 ]; then jobs=4; fi
mkdir -p "$prefix/include" "$prefix/lib/pkgconfig"
cd "$work/zlib"
make -f win32/Makefile.gcc -j"$jobs" libz.a
cp libz.a "$prefix/lib/"
cp zlib.h zconf.h "$prefix/include/"
cat > "$prefix/lib/pkgconfig/zlib.pc" <<PC
prefix=$prefix
libdir=\${prefix}/lib
includedir=\${prefix}/include
Name: zlib
Description: zlib compression library
Version: 1.3.2
Libs: -L\${libdir} -lz
Cflags: -I\${includedir}
PC
cp README "$out/licenses/zlib.txt"
cp win32/Makefile.gcc "$out/sources/zlib-Makefile.gcc"
cd "$work/x264"
./configure --prefix="$prefix" --enable-static --disable-cli --disable-opencl --bit-depth=8 --chroma-format=420
make -j"$jobs"
make install
cd "$work/ffmpeg"
PKG_CONFIG_PATH="$prefix/lib/pkgconfig" ./configure --prefix="$prefix" --disable-doc --disable-debug --disable-network --disable-autodetect --disable-ffplay --enable-gpl --enable-libx264 --enable-zlib --enable-static --disable-shared --disable-pthreads --enable-w32threads --pkg-config-flags=--static --extra-cflags="-I$prefix/include" --extra-ldflags="-L$prefix/lib -static"
make -j"$jobs" ffmpeg.exe ffprobe.exe
cp ffmpeg.exe ffprobe.exe "$out/vendor/"
cp COPYING.GPLv2 "$out/licenses/FFmpeg-GPL-2.0.txt"
cp "$work/x264/COPYING" "$out/licenses/x264-COPYING.txt"
cp ffbuild/config.mak "$out/sources/ffmpeg-config.mak"
cp "$work/x264/config.mak" "$out/sources/x264-config.mak"
cp "$root/scripts/build-bundled-ffmpeg.sh" "$out/sources/"
# License notices for MinGW runtime libraries and other build tools, unmodified.
cp -RL /mingw64/share/licenses "$out/licenses/mingw-toolchain"
"$out/vendor/ffmpeg.exe" -version > "$out/licenses/FFmpeg-build.txt"
"$out/vendor/ffmpeg.exe" -L >> "$out/licenses/FFmpeg-build.txt"
# Fail rather than ship an accidental dependency on DLLs from the CI machine.
for exe in "$out/vendor/ffmpeg.exe" "$out/vendor/ffprobe.exe"; do
  if objdump -p "$exe" | sed -n 's/.*DLL Name: //p' | grep -Eiq '(libgcc|libstdc\+\+|libwinpthread|libx264|avcodec|avformat|zlib1).*\.dll'; then
    echo "Unexpected external DLL: $exe" >&2; exit 1
  fi
done

# The caption renderer consumes PNG, so H.264 alone is not a sufficient smoke test.
"$out/vendor/ffmpeg.exe" -v error -y -f lavfi -i color=c=yellow:s=128x128:d=0.1 -frames:v 1 "$work/png-smoke.png"
"$out/vendor/ffmpeg.exe" -v error -y -i "$work/png-smoke.png" -frames:v 1 -c:v libx264 -pix_fmt yuv420p "$work/png-smoke.mp4"
