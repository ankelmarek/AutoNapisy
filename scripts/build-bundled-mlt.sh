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
ffmpeg_recipe=$(sha256sum "$root/scripts/build-bundled-ffmpeg.sh" | cut -d' ' -f1)
if [ ! -f "$ffprefix/lib/pkgconfig/libavformat.pc" ] || [ "$(cat "$ffprefix/lib/pkgconfig/.rolvixa-recipe" 2>/dev/null || true)" != "$ffmpeg_recipe" ]; then
  "$root/scripts/build-bundled-ffmpeg.sh"
  make -C "$root/.tools/vendor-build/ffmpeg" -j"$jobs" install-libs install-headers
  printf '%s' "$ffmpeg_recipe" > "$ffprefix/lib/pkgconfig/.rolvixa-recipe"
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
# dlfcn upstream uses LoadLibraryExA. MLT paths are UTF-8, including Unicode install folders.
python - "$work/dlfcn/src/dlfcn.c" <<'PYCODE'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text();old='hModule = LoadLibraryExA( lpFileName, NULL, LOAD_WITH_ALTERED_SEARCH_PATH );'
new='{\n                int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, lpFileName, -1, NULL, 0);\n                WCHAR *wide = count > 0 ? (WCHAR *) malloc(count * sizeof(WCHAR)) : NULL;\n                if (wide) {\n                    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, lpFileName, -1, wide, count);\n                    hModule = LoadLibraryExW(wide, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);\n                    free(wide);\n                } else { hModule = NULL; }\n            }'
if old not in s: raise SystemExit('Unexpected dlfcn source; review the Unicode patch')
p.write_text(s.replace(old,new))
PYCODE
cmake -S "$work/dlfcn" -B "$work/dlfcn-out" -G 'MinGW Makefiles' -DCMAKE_BUILD_TYPE=Release -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCMAKE_INSTALL_PREFIX="$prefix_win" -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTS=OFF
cmake --build "$work/dlfcn-out" -j "$jobs"
cmake --install "$work/dlfcn-out"
cmake -S "$work/libxml2" -B "$work/xml-out" -G 'MinGW Makefiles' -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$prefix_win" -DBUILD_SHARED_LIBS=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_LZMA=OFF -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_PROGRAMS=OFF -DLIBXML2_WITH_TESTS=OFF -DLIBXML2_WITH_HTTP=OFF
cmake --build "$work/xml-out" -j "$jobs"
cmake --install "$work/xml-out"
# MLT derives a pthread archive location from the iconv archive location on MinGW.
cp /mingw64/lib/libwinpthread.a "$prefix/lib/libpthread.a"
# Keep MLT's module/data paths in UTF-8, even under a non-UTF-8 Windows locale.
python - "$work/mlt/src/framework" <<'PYUNICODE'
from pathlib import Path
import sys
root=Path(sys.argv[1])
p=root/'mlt_factory.c';s=p.read_text()
old="""        char path[1024];
        DWORD size = sizeof(path);
        GetModuleFileName(NULL, path, size);"""
new="""        WCHAR wide_path[32768];
        char path[32768 * 4];
        GetModuleFileNameW(NULL, wide_path, 32768);
        WideCharToMultiByte(CP_UTF8, 0, wide_path, -1, path, sizeof(path), NULL, NULL);"""
if s.count(old)!=1: raise SystemExit('Review MLT app directory Unicode patch')
s=s.replace(old,new)
old="""        mlt_properties_set(global_properties, "MLT_APPDIR", appdir);
        free(appdir);
#elif defined(RELOCATABLE)"""
new="""        mlt_properties_set(global_properties, "MLT_APPDIR", appdir);
        WCHAR wide_data[32768];
        char data_path[32768 * 4];
        DWORD data_size = GetEnvironmentVariableW(L"MLT_DATA", wide_data, 32768);
        if (data_size > 0 && data_size < 32768) {
            WideCharToMultiByte(CP_UTF8, 0, wide_data, -1, data_path, sizeof(data_path), NULL, NULL);
            mlt_properties_set(global_properties, "MLT_DATA", data_path);
        } else {
            snprintf(data_path, sizeof(data_path), "%s%s", appdir, PREFIX_DATA);
            mlt_properties_set(global_properties, "MLT_DATA", data_path);
        }
        free(appdir);
#elif defined(RELOCATABLE)"""
if s.count(old)!=1: raise SystemExit('Review MLT data directory Unicode patch')
p.write_text(s.replace(old,new))
p=root/'mlt_properties.c';s=p.read_text()
s=s.replace('#include <dirent.h>', '#include <dirent.h>\n#ifdef _WIN32\n#include <windows.h>\n#endif')
a=s.index('    DIR *dir = opendir(dirname);', s.index('int mlt_properties_dir_list('))
b=s.index('    if (sort && mlt_properties_count(self))',a)
old=s[a:b]
new=r"""#ifdef _WIN32
    int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, dirname, -1, NULL, 0);
    WCHAR *search = count > 0 ? calloc(count + 3, sizeof(WCHAR)) : NULL;
    if (search) {
        MultiByteToWideChar(CP_UTF8, 0, dirname, -1, search, count);
        wcscat(search, L"\\*");
        WIN32_FIND_DATAW item;
        HANDLE handle = FindFirstFileW(search, &item);
        if (handle != INVALID_HANDLE_VALUE) {
            do {
                char name[4096], fullname[32768 * 4], key[20];
                WideCharToMultiByte(CP_UTF8, 0, item.cFileName, -1, name, sizeof(name), NULL, NULL);
                if (pattern == NULL || (name[0] != '.' && mlt_fnmatch(pattern, name))) {
                    snprintf(key, sizeof(key), "%d", mlt_properties_count(self));
                    snprintf(fullname, sizeof(fullname), "%s/%s", dirname, name);
                    mlt_properties_set_string(self, key, fullname);
                }
            } while (FindNextFileW(handle, &item));
            FindClose(handle);
        }
        free(search);
    }
#else
"""
s=s[:a]+new+old+'#endif\n\n'+s[b:];p.write_text(s)
PYUNICODE
# Keep private static FFmpeg dependencies within one linker group.
python - "$work/mlt/src/modules/avformat/CMakeLists.txt" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text().replace('${FFMPEG_LIBRARIES}', '"-Wl,--start-group" ${FFMPEG_LIBRARIES} ${ROLVIXA_FFMPEG_STATIC_DEPS} "-Wl,--end-group"');p.write_text(s)
PY
static_libs=$(pkg-config --static --libs libavformat libavcodec libavfilter libswscale libswresample libavutil | tr ' ' ';')
opts=()
for name in DECKLINK FREI0R GDK GLAXNIMATE_QT6 JACKRACK KDENLIVE MOVIT NDI OLDFILM OPENCV OPENFX PLACEBO PLUS PLUSGPL QT6 RESAMPLE RTAUDIO RUBBERBAND RNNOISE SDL1 SDL2 SOX SPATIALAUDIO VIDSTAB VORBIS XINE; do opts+=("-DMOD_$name=OFF"); done
cmake -S "$work/mlt" -B "$work/mlt-out" -G 'MinGW Makefiles' -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$(cygpath -m "$install")" -DCMAKE_PREFIX_PATH="$prefix_win;$ffprefix_win" -DCMAKE_C_FLAGS=-DMELT_NOSDL -DCMAKE_DISABLE_FIND_PACKAGE_SDL2=ON -DCMAKE_SHARED_LINKER_FLAGS='-static-libgcc -static-libstdc++' -DCMAKE_MODULE_LINKER_FLAGS='-static-libgcc -static-libstdc++' -DCMAKE_EXE_LINKER_FLAGS='-static-libgcc -static-libstdc++' -DGPL=ON -DGPL3=OFF -DUSE_AVDEVICE=OFF -DMOD_AVFORMAT=ON -DMOD_XML=ON -DMOD_NORMALIZE=ON -DROLVIXA_FFMPEG_STATIC_DEPS="$static_libs" -DBUILD_TESTING=OFF -DBUILD_DOCS=OFF -DCLANG_FORMAT=OFF "${opts[@]}"
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
"$install/melt.exe" -query consumer=avformat > "$work/mlt-services.txt" 2>&1
grep -q 'identifier: avformat' "$work/mlt-services.txt"
printf 'MLT 7.42.0 built from verified sources\n' > "$install/BUILD.txt"
