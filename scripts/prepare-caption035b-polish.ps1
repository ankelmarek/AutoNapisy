$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force .tools | Out-Null
$source = '.tools/caption035b-polish.flac'
Invoke-WebRequest 'https://download.pytorch.org/torchaudio/tutorial-assets/5090_1447_000088.flac' -OutFile $source
if ((Get-FileHash $source -Algorithm SHA256).Hash.ToLower() -ne '331ac01fcd1ee05289342d5cbbb5511f507fbe05693d7be043b24e5e8eb9de09') { throw 'Polish research fixture changed' }
& $env:AUTONAPISY_FFMPEG -v error -y -i $source -t 4.5 -ac 1 -ar 16000 -c:a pcm_s16le .tools/caption035b-polish.wav
if ($LASTEXITCODE -ne 0) { throw 'Polish sample conversion failed' }
$model = '.tools/caption035b-ggml-tiny.bin'
if (-not (Test-Path $model)) { Invoke-WebRequest 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin' -OutFile $model -TimeoutSec 180 }
if ((Get-FileHash $model -Algorithm SHA256).Hash.ToLower() -ne 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21') { throw 'Multilingual research model changed' }
