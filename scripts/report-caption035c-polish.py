"""Report actual ASR errors, never a fabricated reference or a quality pass gate."""
import json
from pathlib import Path
import unicodedata

def tokens(s):
    s = unicodedata.normalize('NFC', s).lower()
    return ''.join(c if c.isalnum() or c.isspace() else ' ' for c in s).split()

def distance(a,b):
    prev=list(range(len(b)+1))
    for i,x in enumerate(a,1):
        cur=[i]
        for j,y in enumerate(b,1):
            cur.append(min(cur[-1]+1,prev[j]+1,prev[j-1]+(x!=y)))
        prev=cur
    return prev[-1]

data=json.loads(Path('.tools/caption035c-recognized.json').read_text(encoding='utf-8'))
for row in data:
    reference=tokens(row['reference'])
    actual=tokens(' '.join(s['text'] for s in row['segments']))
    row['wordErrors']=distance(reference,actual)
    row['referenceWords']=len(reference)
    row['wer']=row['wordErrors']/max(1,len(reference))
    row['realTimeFactor']=row['elapsedSeconds']/row['duration']
    # The corpus has sentence references, no hand-labelled word boundaries.
    row['boundaryAudit']='not available: no human word-boundary reference'
    print(f"REAL_PL {row['id']}: {row['duration']:.2f}s; WER={row['wer']:.3f}; elapsed={row['elapsedSeconds']:.2f}s; RTF={row['realTimeFactor']:.2f}")
report={'model':'whisper.cpp multilingual tiny, same pinned model as 0.35b',
        'qualityAcceptance':False, 'humanListening':'pending; not an automated assertion',
        'samples':data}
Path('.tools/caption035c-quality.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
