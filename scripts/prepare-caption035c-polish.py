"""CI-only public human speech. No user recording or production network access.

FLEURS, Google et al., CC BY 4.0, pinned HF revision. Select three distinct
utterances (short/middle/long, <= 20 s) by duration, not by ASR success.
The manifest preserves corpus references separately from actual recognition.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.request
import wave

import pyarrow.parquet as pq

REV = '70bb2e84b976b7e960aa89f1c648e09c59f894dd'
BASE = 'https://huggingface.co/datasets/google/fleurs'
root = Path('.tools/caption035c-speech')
root.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(f'https://huggingface.co/api/datasets/google/fleurs/tree/{REV}/parquet-data/pl_pl', timeout=120) as response:
    files = json.load(response)
entry = sorted((f for f in files if f['path'].split('/')[-1].startswith('test-') and f['path'].endswith('.parquet')), key=lambda f: f['path'])[0]
parquet = root / 'pl-test.parquet'
urllib.request.urlretrieve(f"{BASE}/resolve/{REV}/{entry['path']}", parquet)
digest = hashlib.sha256(parquet.read_bytes()).hexdigest()
expected = entry.get('lfs', {}).get('oid')
if expected:
    assert digest == expected, 'Pinned FLEURS LFS object hash differs'
records = pq.read_table(parquet).to_pylist()
unique = {}
for row in records:
    duration = row['num_samples'] / 16000
    if 3 <= duration <= 20 and row['id'] not in unique:
        unique[row['id']] = row
ordered = sorted(unique.values(), key=lambda r: (r['num_samples'], r['id']))
assert len(ordered) >= 3
selected = [ordered[0], ordered[len(ordered)//2], ordered[-1]]
manifest = []
for i, row in enumerate(selected):
    original = root / f'fleurs-{i}.source'
    original.write_bytes(row['audio']['bytes'])
    wav = root / f'fleurs-{i}.wav'
    subprocess.run([os.environ['AUTONAPISY_FFMPEG'], '-v', 'error', '-y', '-i', str(original), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', str(wav)], check=True)
    with wave.open(str(wav)) as f:
        duration = f.getnframes() / f.getframerate()
    assert 3 <= duration <= 20
    manifest.append({'id': str(row['id']), 'path': str(wav.resolve()), 'duration': duration,
                     'reference': row['raw_transcription'], 'gender': row['gender'],
                     'sha256': hashlib.sha256(wav.read_bytes()).hexdigest(),
                     'sourceSha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                     'corpus': 'Google FLEURS / pl_pl / test', 'revision': REV,
                     'license': 'CC-BY-4.0', 'parquetSha256': digest, 'source': f"{BASE}/blob/{REV}/{entry['path']}"})
Path('.tools/caption035c-samples.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print('FLEURS_SELECTED', json.dumps([{k:v for k,v in r.items() if k not in ('path','reference')} for r in manifest]))
