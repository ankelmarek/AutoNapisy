"""Generate bundled gallery demos with the same FFmpeg xfade kinds as export.

No user media, network, fonts or third-party artwork. Sources are our two PNGs.
Run: python scripts/build-transition-demos.py --ffmpeg path/to/ffmpeg.exe
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import subprocess
import zlib

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'public' / 'transition-demos'


def source(which):
    size = 192
    rows = bytearray()
    for y in range(size):
        rows.append(0)
        for x in range(size):
            if which == 'a':
                color = (int(28 + y*.2), int(75 + y*.35), int(138 + y*.3))
                if (x-142)**2 + (y-46)**2 < 22**2:
                    color = (185, 237, 255)
                if y > 135-43*math.sin(x/51):
                    color = (25, 118, 141)
                if y > 168-20*math.sin(x/29):
                    color = (16, 58, 91)
            else:
                color = (int(182 + y*.2), int(67 + y*.25), int(75 + y*.2))
                if (x-54)**2 + (y-76)**2 < 31**2:
                    color = (255, 211, 136)
                if y > 143+14*math.sin(x/32):
                    color = (95, 46, 107)
                if y > 167+10*math.sin(x/24):
                    color = (40, 37, 76)
            # Distinct A/B markers, drawn as pixels rather than system fonts.
            glyph = ['01110','11011','11011','11111','11011','11011'] if which == 'a' else ['11110','11011','11110','11011','11011','11110']
            gx, gy = (x-16)//3, (y-16)//3
            if 10 <= x < 38 and 10 <= y < 40:
                color = (17, 24, 42)
            if 0 <= gx < 5 and 0 <= gy < 6 and glyph[gy][gx] == '1':
                color = (240, 247, 255)
            rows.extend(color)
    def chunk(name, data):
        return struct.pack('>I', len(data))+name+data+struct.pack('>I', zlib.crc32(name+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>2I5B',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(bytes(rows),9))+chunk(b'IEND',b'')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg')
    args = parser.parse_args()
    kinds = re.findall(r"'([^']+)'", (ROOT/'src/transitionCatalog.ts').read_text().split('as const;')[0])
    rust = (ROOT/'src-tauri/src/effects.rs').read_text().split('pub const KINDS:')[1].split('];')[0]
    assert kinds == re.findall(r'"([a-z]+)"', rust), 'Gallery and renderer kinds differ'
    DEST.mkdir(parents=True, exist_ok=True)
    for key in ['a','b']:
        (DEST/f'{key}.png').write_bytes(source(key))
    records = {}
    for kind in kinds:
        graph = (f'[0:v]fps=30,settb=AVTB,format=yuv420p[a];[1:v]fps=30,settb=AVTB,format=yuv420p[b];'
                 f'[a][b]xfade=transition={kind}:duration=1:offset=0,trim=duration=1,setpts=PTS-STARTPTS,'
                 'format=yuv420p,fps=30,settb=1/30,tpad=start_mode=clone:start_duration=0.3:stop_mode=clone:stop_duration=0.3[v]')
        out = DEST/f'{kind}.mp4'
        subprocess.run([args.ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-y','-filter_complex_threads','1',
                        '-loop','1','-framerate','30','-i',str(DEST/'a.png'),'-loop','1','-framerate','30','-i',str(DEST/'b.png'),
                        '-filter_complex',graph,'-map','[v]','-an','-t','1.6','-c:v','libx264','-preset','slow',
                        '-crf','25','-threads','2','-pix_fmt','yuv420p','-movflags','+faststart','-map_metadata','-1',str(out)],check=True)
        records[kind] = {'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size}
    manifest = {'version':1,'engine':'FFmpeg xfade','width':192,'height':192,'fps':30,'duration':1.6,'transitionDuration':1,'hold':.3,
                'sources':{k:hashlib.sha256((DEST/f'{k}.png').read_bytes()).hexdigest() for k in ['a','b']},'clips':records}
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Generated {len(kinds)} real xfade demos; {sum(v["bytes"] for v in records.values())} bytes')


if __name__ == '__main__':
    main()
