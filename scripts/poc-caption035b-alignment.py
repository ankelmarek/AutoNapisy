"""Research only: real Polish MMS forced alignment, never shipped in RolVixa.

Run with torch/torchaudio 2.7.1 CPU and soundfile. Model weights are CC-BY-NC;
they MUST NOT be bundled as the application's production alignment engine.
"""
import hashlib
import json
import pathlib
import time
import urllib.request

import soundfile as sf
import torch
import torchaudio

root = pathlib.Path('.tools/alignment035b-poc')
root.mkdir(parents=True, exist_ok=True)
audio = root / '5090_1447_000088.flac'
urllib.request.urlretrieve('https://download.pytorch.org/torchaudio/tutorial-assets/5090_1447_000088.flac', audio)
samples, rate = sf.read(audio, dtype='float32')
wave = torch.from_numpy(samples[:int(4.5 * rate)]).reshape(1, -1)
assert rate == 16000 and wave.numel() == 72000
torch.set_num_threads(2)
bundle = torchaudio.pipelines.MMS_FA
started = time.monotonic()
model = bundle.get_model().eval()
with torch.inference_mode():
    emission, _ = model(wave)
    silent, _ = model(torch.zeros_like(wave))
align = bundle.get_aligner()
tokenize = bundle.get_tokenizer()
ratio = 4.5 / emission.size(1)

def attempt(text, acoustic):
    try:
        spans = align(acoustic[0], tokenize(text.split()))
        return [{'text': word, 'start': part[0].start * ratio,
                 'end': part[-1].end * ratio,
                 'score': sum(s.score * len(s) for s in part) / sum(len(s) for s in part)}
                for word, part in zip(text.split(), spans)]
    except (ValueError, RuntimeError) as error:
        return {'error': str(error)}

correct = 'wtedy ujrzalem na jego brzuchu okragla czarna rane'
wrong = 'dzisiaj budujemy nowa szeroka droge przez zielone pole'
result = {'engine': 'torchaudio 2.7.1 MMS_FA CTC', 'license': 'CC-BY-NC 4.0, research only',
          'source': 'https://docs.pytorch.org/audio/2.7/tutorials/forced_alignment_for_multilingual_data_tutorial.html',
          'sample': audio.name, 'audioSha256': hashlib.sha256(audio.read_bytes()).hexdigest(),
          'seconds': 4.5, 'correct': attempt(correct, emission),
          'unspokenText': attempt(wrong, emission), 'silence': attempt(correct, silent),
          'elapsedSeconds': time.monotonic() - started,
          'productionDecision': 'Do not ship: forced alignment alone does not verify that supplied words were spoken. Use bounded Whisper reanalysis with exact text verification and deliberate manual fallback.'}
assert isinstance(result['correct'], list) and len(result['correct']) == 8
assert all(w['end'] > w['start'] >= 0 and w['end'] <= 4.5 for w in result['correct'])
(root / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=False, indent=2))
