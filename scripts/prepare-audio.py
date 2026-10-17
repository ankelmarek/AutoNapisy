"""Build the offline Kenney catalog from its pinned original CC0 package."""
import argparse, hashlib, json, os, pathlib, re, shutil, subprocess, tempfile, urllib.request, zipfile

URL='https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip'
SHA256='f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232'
root=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--archive');args=parser.parse_args()
bundle=root/'src-tauri/.bundled';audio=bundle/'vendor/audio';audio.mkdir(parents=True,exist_ok=True)
for folder in ['sources','licenses']:(bundle/folder).mkdir(parents=True,exist_ok=True)
archive=bundle/'sources/kenney-interface-sounds.zip'
if args.archive:shutil.copyfile(args.archive,archive)
elif not archive.exists():
 with urllib.request.urlopen(URL,timeout=45) as response:archive.write_bytes(response.read(8*1024*1024))
if hashlib.sha256(archive.read_bytes()).hexdigest()!=SHA256:raise SystemExit('Nieprawidłowa suma archiwum Kenney')
ffmpeg=os.environ.get('AUTONAPISY_FFMPEG',str(bundle/'vendor/ffmpeg.exe'));ffprobe=str(pathlib.Path(ffmpeg).with_name('ffprobe.exe' if ffmpeg.endswith('.exe') else 'ffprobe'))
groups={'back':('Wstecz','Nawigacja'),'click':('Kliknięcie','Kliknięcia'),'bong':('Dzwonek','Powiadomienia'),'close':('Zamknięcie','Nawigacja'),'confirmation':('Potwierdzenie','Powiadomienia'),'drop':('Upuszczenie','Ruch'),'error':('Błąd','Powiadomienia'),'glass':('Szkło','Akcenty'),'maximize':('Rozwinięcie','Nawigacja'),'minimize':('Zwinięcie','Nawigacja'),'open':('Otwarcie','Nawigacja'),'question':('Pytanie','Powiadomienia'),'scratch':('Szum','Akcenty'),'scroll':('Przewinięcie','Ruch'),'select':('Wybór','Kliknięcia'),'switch':('Przełączenie','Kliknięcia'),'tick':('Tyknięcie','Kliknięcia')}
catalog=[]
with zipfile.ZipFile(archive) as source,tempfile.TemporaryDirectory() as tmp:
 license=source.read('License.txt');(bundle/'licenses/Kenney-Interface-Sounds-CC0.txt').write_bytes(license)
 for name in sorted(source.namelist()):
  if not re.fullmatch(r'Audio/[a-zA-Z0-9_-]+\.ogg',name):continue
  basename=pathlib.Path(name).stem;input=pathlib.Path(tmp)/(basename+'.ogg');input.write_bytes(source.read(name));output=audio/(basename+'.wav')
  subprocess.run([ffmpeg,'-v','error','-y','-i',str(input),'-af','apad=whole_dur=0.1','-ar','48000','-ac','2','-c:a','pcm_s16le',str(output)],check=True)
  duration=float(subprocess.check_output([ffprobe,'-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(output)],text=True))
  prefix,_,number=basename.rpartition('_');label,group=groups.get(prefix,(prefix.replace('_',' ').capitalize(),'Inne'))
  catalog.append({'id':'kenney-'+basename,'name':f'{label} {int(number) if number.isdigit() else number}'.strip(),'group':group,'file':output.name,'duration':duration})
if len(catalog)!=100:raise SystemExit(f'Nieoczekiwana liczba dźwięków Kenney: {len(catalog)}')
(audio/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copyfile(__file__,bundle/'sources/prepare-audio.py')
print(f'Kenney Interface Sounds: {len(catalog)} WAV, CC0, SHA256 {SHA256}')
