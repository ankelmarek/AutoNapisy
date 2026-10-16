import { useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { backend, preview, type Diagnostics } from "./adapters";
import {
  transcription,
  toolSettings,
  type Tools,
  type TaskStatus,
} from "./transcription";
import {
  applyTranscript,
  newProject,
  parseProject,
  serializeProject,
  formatTime,
  type Project,
} from "./model";
import Timeline from "./Timeline";
import { useProjectHistory } from "./useHistory";
import { usePlayback } from "./usePlayback";
import { clipAt, editDuration, projectClips, compositionSegments, compositionProject, clipMedia, appendMedia } from "./editing";
import { rendering, type ExportStatus } from "./rendering";
import bebasLicense from "./assets/BebasNeue-OFL.txt?raw";
import CaptionOverlay, { CaptionBox } from "./CaptionOverlay";
import { captionExport, yellowPreset, referenceText } from "./captions";
export default function App() {
  const history = useProjectHistory();
  const {project,setProject} = history;
  const [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      "Gotowy. Wszystkie pliki pozostają na tym komputerze.",
    ),
    [settings, setSettings] = useState(false),
    [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null),
    [dirty, setDirty] = useState(false);
  const [transcribing, setTranscribing] = useState(false),
    [task, setTask] = useState<TaskStatus | null>(null),
    [tools, setTools] = useState<Tools | null>(null);
  const [licenses, setLicenses] = useState<{name: string; text: string}[]>([]);
  const controller = useRef<AbortController | null>(null);
  const exportController = useRef<AbortController | null>(null);
  const [exporting, setExporting] = useState(false),
    [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const latestProject = useRef(project);
  latestProject.current = project;
  useEffect(
    () => () => {
      controller.current?.abort();
      exportController.current?.abort();
    },
    [],
  );
  const locked = busy || transcribing || exporting;
  const video = useRef<HTMLVideoElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const [stageSize,setStageSize]=useState({width:0,height:0}),[aspect,setAspect]=useState(16/9);
  useEffect(()=>{const el=stage.current;if(!el)return;const observer=new ResizeObserver(()=>setStageSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  const surfaceWidth=Math.min(stageSize.width,stageSize.height*aspect);
  const elements=useRef(new Map<string,HTMLMediaElement>());
  const [sources,setSources]=useState<Record<string,string>>({});
  const [transcriptSource,setTranscriptSource]=useState("primary");
  const playback = usePlayback(elements,project,source);
  const {time,playing,seek,toggle} = playback;
  const duration = editDuration(project);
  const displayed = useMemo(()=>compositionProject(project),[project]);
  const displayedSegments = useMemo(()=>compositionSegments(project),[project]);
  const gap = !clipAt(projectClips(project),Math.min(time,Math.max(0,duration-1e-7)));
  const undo = () => {playback.pause();history.undo();setDirty(true);};
  const redo = () => {playback.pause();history.redo();setDirty(true);};
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(locked || !(e.ctrlKey||e.metaKey) || (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))))return;
      if(e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
      if(e.key.toLowerCase()==='y'){e.preventDefault();redo();}
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[locked,history.canUndo,history.canRedo]);
  useEffect(()=>{if(playback.error)setMessage(playback.error);},[playback.error]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage(`Błąd: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };
  const resetPlayback = playback.reset;
  const replace = () =>
    !dirty || window.confirm("Projekt ma niezapisane zmiany. Kontynuować?");
  const importMedia = (kind:'video'|'audio') => run(async()=>{
    const media=await preview.import(kind);if(!media)return;
    const url=await preview.prepare(media.path);
    const metadata=await new Promise<number>((resolve,reject)=>{
      const el=document.createElement(kind==='video'?'video':'audio');
      const timeout=window.setTimeout(()=>{el.removeAttribute('src');el.load();reject(new Error('Nie można odczytać czasu pliku w WebView2. Sprawdź kodek lub użyj MP4 H.264 / AAC.'));},15000);
      el.preload='metadata';el.onloadedmetadata=()=>{clearTimeout(timeout);const d=el.duration;el.removeAttribute('src');el.load();Number.isFinite(d)&&d>=.05?resolve(d):reject(new Error('Nieprawidłowy czas nagrania'));};
      el.onerror=()=>{clearTimeout(timeout);reject(new Error('WebView2 nie obsługuje tego pliku. Dla wideo użyj H.264 / AAC, dla audio WAV, MP3 lub AAC.'));};el.src=url;
    });
    playback.pause();
    const next=appendMedia(latestProject.current,{...media,duration:metadata},kind,time);
    setProject(next);setSources(prev=>({...prev,[media.path]:url}));setSource(url);setDirty(true);
    setMessage(kind==='video'?'Dodano film. Jego dźwięk jest połączony z obrazem.':'Dodano niezależne audio. Możesz je przesuwać i miksować.');
  });
  const importVideo=()=>importMedia('video');
  const open = () =>
    run(async () => {
      if (!replace()) return;
      const result = await backend.open();
      if (!result) return;
      const p = parseProject(result.json);
      let url = "";const prepared:Record<string,string>={};const missing:string[]=[];
      for(const m of [...(p.media?[p.media]:[]),...p.assets]){
        try{prepared[m.path]=await preview.prepare(m.path);url ||= prepared[m.path];}catch{missing.push(m.name);}
      }
      setSources(prepared);setTranscriptSource('primary');
      resetPlayback();
      history.reset(p);
      setSource(url);
      setDirty(false);
      setMessage(missing.length?`Projekt otwarty. Niedostępne pliki: ${missing.join(", ")}`:"Projekt otwarty.");
    });
  const save = () =>
    run(async () => {
      const path = await backend.save(serializeProject(project));
      if (path) {
        setDirty(false);
        setMessage(`Zapisano projekt: ${path}`);
      }
    });
  const loadSettings = async () => {
    const [d, t, l] = await Promise.all([
      backend.diagnostics(),
      toolSettings.get(),
      invoke<{name: string; text: string}[]>("component_licenses"),
    ]);
    setDiagnostics(d);
    setTools(t);
    setLicenses(l);
  };
  const chooseTool = (kind: keyof Tools) =>
    run(async () => {
      setTools(await toolSettings.choose(kind));
      setDiagnostics(await backend.diagnostics());
    });
  const transcribe = async () => {
    const selectedMedia=transcriptSource==='primary'?project.media:project.assets.find(a=>a.id===transcriptSource);
    if (!selectedMedia || controller.current) return;
    if (
      project.segments.length &&
      !window.confirm(
        "Nowa transkrypcja zastąpi obecne napisy po poprawnym zakończeniu. Kontynuować?",
      )
    )
      return;
    const abort = new AbortController();
    controller.current = abort;
    setTranscribing(true);
    setTask(null);
    try {
      const segments = await transcription.transcribe(
        selectedMedia,
        abort.signal,
        setTask,
      );
      const current=latestProject.current;
      const bounded=applyTranscript({...current,media:selectedMedia,clips:null},segments).segments;
      const updated=transcriptSource==='primary'?{...current,segments:bounded}:{...current,assets:current.assets.map(a=>a.id===transcriptSource?{...a,segments:bounded}:a)};
      setProject(updated);
      setDirty(true);
      setMessage(
        segments.length
          ? `Gotowe: ${segments.length} segmentów. Sprawdź tekst i zapisz projekt.`
          : "Nie rozpoznano mowy. Wynik jest pusty.",
      );
    } catch (e) {
      setMessage(
        e instanceof DOMException && e.name === "AbortError"
          ? "Anulowano. Poprzednie napisy pozostają bez zmian."
          : `Błąd transkrypcji: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      controller.current = null;
      setTranscribing(false);
    }
  };
  const exportSrt = () =>
    run(async () => {
      const path = await backend.exportSrt(
        serializeProject(project),
        JSON.stringify(captionExport(displayed).segments),
      );
      if (path) setMessage(`Zapisano napisy SRT: ${path}`);
    });
  const exportMp4 = async () => {
    if (exportController.current || locked) return;
    const abort = new AbortController();
    exportController.current = abort;
    setExporting(true);
    setExportStatus(null);
    try {
      const path = await rendering.render(
        project,
        abort.signal,
        setExportStatus,
      );
      if (path) setMessage(`Zapisano MP4 z napisami: ${path}`);
      else setMessage("Anulowano wybór pliku eksportu");
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "Anulowano eksport. Plik docelowy pozostaje bez zmian."
          : `Błąd eksportu: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      exportController.current = null;
      setExporting(false);
    }
  };
  const style = project.styles.default;
  const updateStyle = (patch: Partial<typeof style>) => {
    setProject((p) => ({
      ...p,
      styles: { ...p.styles, default: { ...p.styles.default, ...patch } },
    }));
    setDirty(true);
  };
  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">A</span>
          <div>
            AutoNapisy <small>0.7 · lokalne studio napisów</small>
          </div>
        </div>
        <div className="actions">
          <button
            disabled={locked}
            onClick={() => {
              if (replace()) {
                resetPlayback();
                history.reset(newProject());
                setSource("");setSources({});setTranscriptSource("primary");
                setDirty(false);
              }
            }}
          >
            Nowy
          </button>
          <button disabled={locked} onClick={open}>
            Otwórz
          </button>
          <button disabled={locked} onClick={save}>
            Zapisz{dirty ? " •" : ""}
          </button>
          <button
            disabled={busy || exporting}
            onClick={() => {
              setSettings(true);
              void run(loadSettings);
            }}
          >
            Ustawienia
          </button>
        </div>
      </header>
      <div className="projectbar">
        <input
          aria-label="Nazwa projektu"
          disabled={exporting}
          value={project.name}
          maxLength={200}
          onChange={(e) => {
            setProject((p) => ({ ...p, name: e.target.value }));
            setDirty(true);
          }}
        />
        <span>PROJEKT LOKALNY</span>
        <button className="primary" disabled={locked} onClick={importVideo}>
          ＋ Importuj film
        </button>
        <button disabled={locked} onClick={()=>importMedia("audio")}>＋ Importuj audio</button>
        <button
          className="export-button"
          disabled={
            locked ||
            !project.media ||
            duration <= 0
          }
          onClick={() => void exportMp4()}
        >
          Eksport MP4
        </button>
      </div>
      {exporting && (
        <section className="export-progress" role="status">
          <div>
            <b>Eksport filmu</b>
            <span>
              {exportStatus?.message ?? "Wybierz miejsce zapisu MP4…"}
            </span>
          </div>
          <progress
            aria-label="Postęp eksportu MP4"
            max={100}
            value={exportStatus?.progress ?? undefined}
          />
          <span>
            {exportStatus?.progress != null ? `${exportStatus.progress}%` : ""}
          </span>
          <button
            disabled={exportStatus?.state === "cancelling"}
            onClick={() => exportController.current?.abort()}
          >
            Anuluj eksport
          </button>
        </section>
      )}
      <main>
        <section className="panel transcript">
          <div className="panelhead">
            <h2>Transkrypcja</h2>
            <span>{displayedSegments.length} segmentów w montażu</span>
          </div>
          <div className="transcription-controls">
            <select aria-label="Źródło transkrypcji" disabled={locked} value={transcriptSource} onChange={e=>setTranscriptSource(e.target.value)}>
              {project.media&&<option value="primary">{project.media.name}</option>}
              {project.assets.filter(a=>a.kind==='video').map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button
              className="primary"
              disabled={locked || !project.media}
              onClick={() => void transcribe()}
            >
              Transkrybuj po polsku
            </button>
            <button
              disabled={locked || !displayedSegments.length}
              onClick={exportSrt}
            >
              Eksport SRT
            </button>
            {transcribing && (
              <div className="job-status" role="status">
                <p>{task?.message ?? "Uruchamianie…"}</p>
                <progress
                  aria-label="Postęp rozpoznawania mowy"
                  max={100}
                  value={task?.progress ?? undefined}
                />
                {task?.progress != null && (
                  <span>{task.progress}% rozpoznawania</span>
                )}
                <button
                  disabled={task?.state === "cancelling"}
                  onClick={() => controller.current?.abort()}
                >
                  Anuluj
                </button>
              </div>
            )}
          </div>
          <div className="panelbody">
            {displayedSegments.length ? (
              displayedSegments.map((s) => (
                <article
                  className={
                    s.start <= time && time < s.end
                      ? "segment active"
                      : "segment"
                  }
                  key={s.id}
                >
                  <button onClick={() => seek(s.start)}>
                    {formatTime(s.start)} — {formatTime(s.end)}
                  </button>
                  <small className="source-caption-note">Tekst źródłowy · zmiana we wszystkich ujęciach</small>
                  <textarea
                    aria-label={`Treść segmentu ${s.id}`}
                    disabled={transcribing || exporting}
                    value={(s.assetId?project.assets.find(a=>a.id===s.assetId)?.segments:project.segments)?.find(original=>original.id===s.sourceId)?.text??s.text}
                    onChange={(e) => {
                      const text = e.target.value;
                      setProject((p) => ({
                        ...p,
                        assets:p.assets.map(a=>a.id===s.assetId?{...a,segments:a.segments.map(segment=>segment.id===s.sourceId?{...segment,text,words:[]}:segment)}:a),
                        segments: p.segments.map((segment) =>
                          !s.assetId && segment.id === s.sourceId
                            ? { ...segment, text, words: [] }
                            : segment,
                        ),
                      }));
                      setDirty(true);
                    }}
                  />
                </article>
              ))
            ) : (
              <div className="empty">
                <div className="symbol">≋</div>
                <h3>{project.media && !duration ? "Montaż jest pusty" : "Tu pojawią się Twoje słowa"}</h3>
                <p>
                  {project.media && !duration ? 'Cofnij usunięcie lub wybierz „Przywróć cały film” na osi czasu. Oryginalna transkrypcja pozostaje zapisana.' : 'Importuj film i kliknij „Transkrybuj po polsku”. W ustawieniach wskaż lokalny model Whisper.'}
                </p>
                <small>Rozpoznawanie lokalne · bez tłumaczenia</small>
              </div>
            )}
          </div>
        </section>
        <section className="panel preview">
          <div className="panelhead">
            <h2>Podgląd wideo</h2>
            <span>{project.media?.name ?? "Brak filmu"}</span>
          </div>
          <div className="stage" ref={stage}>
            {source ? (
              <div className="composition-surface" style={{width:surfaceWidth,height:surfaceWidth/aspect}}>
                {projectClips(project).map(c=>{
                  const media=clipMedia(project,c),url=media?sources[media.path]:undefined;
                  const isVideo=c.kind!=='audio',visible=clipAt(projectClips(project),Math.min(time,duration-1e-7))?.id===c.id;
                  const Tag=isVideo?'video':'audio';
                  return <Tag key={c.id} ref={el=>{if(el){elements.current.set(c.id,el);if(isVideo&&(!c.assetId||!projectClips(project).some(x=>x.kind!=='audio'&&!x.assetId)))video.current=el as HTMLVideoElement;}else elements.current.delete(c.id);}} src={url} preload="metadata"
                    className={visible?'composition-video':'composition-video gap'}
                    onLoadedMetadata={e=>{if(isVideo&&!c.assetId){const v=e.currentTarget as HTMLVideoElement;if(v.videoWidth&&v.videoHeight)setAspect(v.videoWidth/v.videoHeight);}playback.seek(time);}} onError={()=>setMessage(`Nie można odtworzyć: ${media?.name}. WebView2 wymaga obsługi kodeka (zalecany H.264 / AAC).`)} />;
                })}
                <CaptionOverlay video={video} project={displayed} time={time} compositionCanvas />
                {gap && <span className="gap-label">Przerwa między ujęciami</span>}
              </div>
            ) : (
              <div className="empty">
                <div className="symbol">▷</div>
                <h3>Twój film, w centrum uwagi</h3>
                <p>Wybierz lokalny plik wideo, aby rozpocząć.</p>
                <button disabled={locked} onClick={importVideo}>
                  Wybierz film
                </button>
                <small>MP4 · MOV · MKV · WEBM · AVI</small>
              </div>
            )}
          </div>
          <div className="transport">
            <button
              aria-label="Cofnij 5 sekund"
              disabled={!duration || busy}
              onClick={() => seek(time - 5)}
            >
              −5 s
            </button>
            <button
              className="play"
              disabled={!duration || busy}
              onClick={toggle}
            >
              {playing ? "Ⅱ" : "▶"}
            </button>
            <button
              aria-label="Przewiń 5 sekund"
              disabled={!duration || busy}
              onClick={() => seek(time + 5)}
            >
              +5 s
            </button>
            <code>
              {formatTime(time)} <span>/ {formatTime(duration)}</span>
            </code>
          </div>
        </section>
        <section className="panel styling">
          <div className="panelhead">
            <h2>Stylizacja napisów</h2>
          </div>
          <div className="panelbody">
            <fieldset className="style-fields" disabled={exporting}>
              <p className="eyebrow">STYL DOMYŚLNY</p>
              <button
                className="preset-button"
                onClick={() => updateStyle({ ...yellowPreset })}
              >
                Żółta plansza · Bebas Neue
              </button>
              <label>
                Krój pisma
                <select
                  value={style.fontFamily}
                  onChange={(e) => updateStyle({ fontFamily: e.target.value })}
                >
                  {["Bebas Neue", "Arial", "Segoe UI", "Georgia"].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </label>
              <label>
                Rozmiar <b>{style.fontSize}</b>
                <input
                  type="range"
                  min="12"
                  max="100"
                  value={style.fontSize}
                  onChange={(e) =>
                    updateStyle({ fontSize: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Kolor tekstu
                <input
                  type="color"
                  value={style.color}
                  onChange={(e) => updateStyle({ color: e.target.value })}
                />
              </label>
              <label>
                Tło napisów
                <input
                  type="color"
                  value={style.background}
                  onChange={(e) => updateStyle({ background: e.target.value })}
                />
              </label>
              <label>
                Pozycja
                <select
                  value={style.position}
                  onChange={(e) =>
                    updateStyle({
                      position: e.target.value as typeof style.position,
                    })
                  }
                >
                  <option value="bottom">Na dole</option>
                  <option value="center">Pośrodku</option>
                  <option value="top">Na górze</option>
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={style.uppercase}
                  onChange={(e) => updateStyle({ uppercase: e.target.checked })}
                />
                WIELKIE LITERY
              </label>
              <label>
                Maksymalnie linii
                <select
                  value={style.maxLines}
                  onChange={(e) =>
                    updateStyle({ maxLines: Number(e.target.value) })
                  }
                >
                  <option value={1}>1 linia</option>
                  <option value={2}>2 linie</option>
                  <option value={3}>3 linie</option>
                </select>
              </label>
              <label>
                Znaki na linię <b>{style.charsPerLine}</b>
                <input
                  type="range"
                  min="12"
                  max="48"
                  value={style.charsPerLine}
                  onChange={(e) =>
                    updateStyle({ charsPerLine: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Słowa na planszę <b>{style.wordsPerCard}</b>
                <input
                  type="range"
                  min="3"
                  max="16"
                  value={style.wordsPerCard}
                  onChange={(e) =>
                    updateStyle({ wordsPerCard: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Szerokość planszy <b>{style.boxWidth}%</b>
                <input
                  type="range"
                  min="40"
                  max="95"
                  value={style.boxWidth}
                  onChange={(e) =>
                    updateStyle({ boxWidth: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Zaokrąglenie <b>{style.cornerRadius}</b>
                <input
                  type="range"
                  min="0"
                  max="60"
                  value={style.cornerRadius}
                  onChange={(e) =>
                    updateStyle({ cornerRadius: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Odstęp od krawędzi <b>{style.marginPercent}%</b>
                <input
                  type="range"
                  min="0"
                  max="30"
                  value={style.marginPercent}
                  onChange={(e) =>
                    updateStyle({ marginPercent: Number(e.target.value) })
                  }
                />
              </label>
              <div className="caption-sample">
                <CaptionBox
                  text={referenceText}
                  style={style}
                  width={240}
                  height={135}
                />
              </div>
              <p className="hint">
                Enter w tekście segmentu ustawia ręczne łamanie. Krótkie plansze
                wykorzystują czasy słów; bez nich cały segment jest dopasowywany
                do zadanej liczby linii.
              </p>
              <p className="hint">
                Styl jest zapisywany w projekcie. Eksport SRT zapisuje treść i
                czasy; nie zachowuje stylizacji. Eksport MP4 wypala wygląd
                napisów w obrazie.
              </p>
            </fieldset>
          </div>
        </section>
      </main>
      <Timeline project={project} time={time} locked={locked} onSeek={seek}
        onChange={clips=>{playback.pause();setProject(p=>({...p,clips}));setDirty(true);}}
        undo={undo} redo={redo} canUndo={history.canUndo} canRedo={history.canRedo}/>
      <footer role="status">
        {busy ? "Przetwarzanie…" : message}
        <span>● Offline · bez wysyłania nagrań</span>
      </footer>
      {settings && (
        <div className="overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Ustawienia i diagnostyka"
          >
            <div className="panelhead">
              <h2>Ustawienia i diagnostyka</h2>
              <button onClick={() => setSettings(false)}>Zamknij</button>
            </div>
            <p>
              Polska mowa → polskie napisy. Lepszą dokładność zwykle zapewnia
              ggml-small.bin lub ggml-medium.bin, kosztem czasu i pamięci.
              Pełny instalator zawiera FFmpeg, FFprobe i whisper.cpp — są wykrywane
              automatycznie. Wybierz osobno lokalny model wielojęzyczny (bez .en).
              Możesz też wskazać własne wersje narzędzi.
            </p>
            <div className="tools">
              <h3>Komponenty transkrypcji</h3>
              {(["ffmpeg", "whisper", "model"] as const).map((kind) => (
                <div className="tool-row" key={kind}>
                  <div>
                    <b>
                      {kind === "ffmpeg"
                        ? "FFmpeg"
                        : kind === "whisper"
                          ? "whisper-cli"
                          : "Model GGML"}
                    </b>
                    <small>{tools?.[kind] ?? "Nie wybrano pliku"}</small>
                  </div>
                  <button disabled={locked} onClick={() => chooseTool(kind)}>
                    Wybierz
                  </button>
                </div>
              ))}
              <p>
                CPU · język polski · pliki pozostają na komputerze. Model nie jest
                pobierany automatycznie ani dołączony do instalatora.
              </p>
            </div>
            {diagnostics ? (
              <>
                <dl>
                  <dt>System</dt>
                  <dd>
                    {diagnostics.os} · {diagnostics.arch}
                  </dd>
                  <dt>Procesor</dt>
                  <dd>
                    {diagnostics.cpu} ({diagnostics.logicalCpus} wątków)
                  </dd>
                  <dt>Pamięć RAM</dt>
                  <dd>{(diagnostics.memoryBytes / 1024 ** 3).toFixed(1)} GB</dd>
                </dl>
                {diagnostics.components.map((c) => (
                  <div className="diagnostic" key={c.name}>
                    <b>{c.name}</b>
                    <span>{c.status}</span>
                  </div>
                ))}
              </>
            ) : (
              <p>Oczekiwanie na diagnostykę. {message}</p>
            )}
            {licenses.map((license) => (
              <details className="font-license" key={license.name}>
                <summary>{license.name}</summary><pre>{license.text}</pre>
              </details>
            ))}
            <details className="font-license">
              <summary>Licencja czcionki Bebas Neue</summary>
              <pre>{bebasLicense}</pre>
            </details>
            <p role="status">{message}</p>
          </section>
        </div>
      )}
    </div>
  );
}
