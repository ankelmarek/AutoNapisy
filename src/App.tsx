import { useEffect, useRef, useState, useMemo } from "react";
import { invoke,convertFileSrc } from "@tauri-apps/api/core";
import AudioLibrary,{type LibraryAudio} from "./AudioLibrary";
import { backend, preview, type Diagnostics } from "./adapters";
import {
  transcription,
  toolSettings,
  type Tools,
  type TaskStatus,
} from "./transcription";
import {
  applyTimelineTranscript,
  newProject,
  parseProject,
  serializeProject,
  formatTime,
  type Project,
} from "./model";
import Timeline from "./Timeline";
import ProjectMenu from './ProjectMenu';
import EffectsLibrary,{type EffectChoice} from './EffectsLibrary';
import VideoProperties from './VideoProperties';
import {visuals,videoFilter,reconcileTransitions,applyTransition} from './effects';
import {editCaption,resizeCaption} from './captionEditing';


import MediaLibrary from "./MediaLibrary";
import Icon from "./Icons";
import rolvixaIcon from "./assets/rolvixa-icon.png";
import {libraryItems,insertLibraryItem,registerMedia} from "./library";
import { useProjectHistory } from "./useHistory";
import FrameEditor from './FrameEditor';
import TransformControls from './TransformControls';
import LayersPanel from './LayersPanel';
import { useMltPlayback } from "./useMltPlayback";
import {useVideoProxies} from './useVideoProxies';
import {useSafeZones,SafeZoneControls,SafeZoneOverlay} from './SafeZones';
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
      "Gotowy.",
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
  useEffect(()=>{if(!settings)return;const previous=document.activeElement;document.querySelector<HTMLButtonElement>('.modal button')?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[settings]);
  const captionSurface = useRef<HTMLDivElement>(null);
  const stage=useRef<HTMLDivElement>(null);
  const [stageSize,setStageSize]=useState({width:0,height:0}),[aspect,setAspect]=useState(16/9);
  useEffect(()=>{const el=stage.current;if(!el)return;const observer=new ResizeObserver(()=>setStageSize({width:el.clientWidth,height:el.clientHeight}));observer.observe(el);return()=>observer.disconnect();},[]);
  const canvasAspect=project.canvas?project.canvas.width/project.canvas.height:aspect;
  const surfaceWidth=Math.min(stageSize.width,stageSize.height*canvasAspect);
  const [frameAspects,setFrameAspects]=useState<Record<string,number>>({});
  const elements=useRef(new Map<string,HTMLMediaElement>());
  const [sources,setSources]=useState<Record<string,string>>({});
  const [leftTab,setLeftTab]=useState<"files"|"captions"|"effects"|"audio">("files");
  const [inspectorTab,setInspectorTab]=useState<'video'|'captions'|'layers'>('video'),[selectedClip,setSelectedClip]=useState(''),[selectedCaption,setSelectedCaption]=useState(''),[selectedTransition,setSelectedTransition]=useState('');
  const [effectChoice,setEffectChoice]=useState<EffectChoice>({kind:'fade',duration:.4});
  const captionInput=useRef<HTMLTextAreaElement>(null);
  const proxies=useVideoProxies(project,sources),safeZones=useSafeZones();
  const playback = useMltPlayback(project,proxies.revision);
  useEffect(()=>{if(playback.error&&proxies.active)void proxies.fallback();},[playback.error,proxies.revision]);
  const {time,playing,seek} = playback;
  const toggle=playback.toggle;
  useEffect(()=>{setAspect(playback.aspect);},[playback.aspect]);
  const duration = editDuration(project);
  const displayed = useMemo(()=>compositionProject(project),[project]);
  const displayedSegments = useMemo(()=>compositionSegments(project),[project]);
  const selected=projectClips(project).find(c=>c.id===selectedClip)??clipAt(projectClips(project),time);
  const caption=displayedSegments.find(s=>s.id===selectedCaption);
  const picture=visuals(project,Math.min(time,Math.max(0,duration-1e-7)));
  const selectCaption=(id:string)=>{setSelectedCaption(id);setInspectorTab('captions');requestAnimationFrame(()=>{captionInput.current?.focus();captionInput.current?.scrollIntoView({block:'nearest'});});};
  const changeProject=(p:Project)=>{setProject(p);setDirty(true);};
  const gap = !visuals(project,Math.min(time,Math.max(0,duration-1e-7))).length;
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
    const files=await preview.import(kind);if(!files?.length)return;
    let next=latestProject.current;const prepared:Record<string,string>={},failed:string[]=[];let added=0;
    for(const media of files){try{
      const url=await preview.prepare(media.path);
      const info=await invoke<{duration:number}>('media_info',{path:media.path,kind});const metadata=info.duration;
      const updated=registerMedia(next,{...media,duration:metadata},kind);if(updated!==next)added++;next=updated;prepared[media.path]=url;
    }catch(e){failed.push(`${media.name}: ${String(e)}`);}}
    if(added){setProject(next);setDirty(true);}setSources(prev=>({...prev,...prepared}));setSource(previous=>previous||Object.values(prepared)[0]||'');
    setMessage(`Dodano do biblioteki: ${added}. Dodaj wybrane pliki na oś przyciskiem +.${failed.length?' Niedodane: '+failed.join('; '):''}`);
  });
  const registerAudio=(item:LibraryAudio)=>{const next=registerMedia(latestProject.current,{path:item.path,name:item.name,duration:item.duration,provenance:item.provenance},'audio');if(next!==latestProject.current){latestProject.current=next;changeProject(next);}setSources(prev=>({...prev,[item.path]:convertFileSrc(item.path)}));return libraryItems(next).find(a=>a.path===item.path)!.id;};
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
      setSources(prepared);
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
    if (!projectClips(project).length || controller.current) return;
    if (
      displayedSegments.length &&
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
        project,
        abort.signal,
        setTask,
      );
      const current=latestProject.current;
      const updated=applyTimelineTranscript(current,segments);
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
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(locked)return;const el=e.target as HTMLElement,text=el?.isContentEditable||el?.tagName==='TEXTAREA'||(el?.tagName==='INPUT'&&['text','search',''].includes((el as HTMLInputElement).type));
      if(e.code==='Space'&&(!text||e.ctrlKey)){e.preventDefault();toggle();return;}
      if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='s'){e.preventDefault();void save();return;}if(e.key.toLowerCase()==='o'){e.preventDefault();void open();return;}if(e.key.toLowerCase()==='i'){e.preventDefault();if(e.shiftKey)void importMedia('audio');else void importVideo();return;}if(e.key.toLowerCase()==='n'){e.preventDefault();if(replace()){resetPlayback();history.reset(newProject());setSource('');setSources({});setDirty(false);}return;}}
      if(text||['INPUT','SELECT'].includes(el?.tagName))return;
      if(e.key==='Home'){e.preventDefault();seek(0);}else if(e.key==='End'){e.preventDefault();seek(duration);}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seek(time+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:1/30));}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[locked,project,time,playing]);
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
          <img className="brand-icon" src={rolvixaIcon} alt=""/>
          <div>
            RolVixa
          </div>
        </div>
        <input className="header-project-name" aria-label="Nazwa projektu" value={project.name} maxLength={200} disabled={locked} onChange={e=>{setProject(p=>({...p,name:e.target.value}));setDirty(true);}}/>
        <span className="dirty-indicator">{dirty?'●':''}</span>
        <ProjectMenu actions={[
          {label:'Nowy',keys:'Ctrl+N',disabled:locked,run:()=>{if(replace()){resetPlayback();history.reset(newProject());setSource('');setSources({});setDirty(false);}}},
          {label:'Otwórz',keys:'Ctrl+O',disabled:locked,run:open},
          {label:'Zapisz',keys:'Ctrl+S',disabled:locked,run:save},
          {label:'Importuj filmy',keys:'Ctrl+I',disabled:locked,run:importVideo},
          {label:'Importuj audio',keys:'Ctrl+Shift+I',disabled:locked,run:()=>importMedia('audio')},
          {label:'Eksport MP4',disabled:locked||!project.media||!duration,run:()=>void exportMp4()},
          {label:'Eksport SRT',disabled:locked||!displayedSegments.length,run:exportSrt},
          {label:'Ustawienia',disabled:locked,run:()=>{playback.pause();setSettings(true);void run(loadSettings);}},
        ]}/>
      </header>
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
            <div className="library-tabs" role="tablist" aria-label="Zasoby projektu">
              <button id="files-tab" role="tab" aria-selected={leftTab==='files'} aria-controls="files-panel" onClick={()=>setLeftTab('files')}><Icon name="files" size={16}/>Pliki <small>{libraryItems(project).length}</small></button>
              <button id="captions-tab" role="tab" aria-selected={leftTab==='captions'} aria-controls="captions-panel" onClick={()=>setLeftTab('captions')}><Icon name="captions" size={16}/>Napisy</button><button id="audio-tab" role="tab" aria-selected={leftTab==='audio'} aria-controls="audio-panel" onClick={()=>setLeftTab('audio')}><Icon name="audio" size={15}/>Audio</button><button role="tab" aria-selected={leftTab==='effects'} onClick={()=>setLeftTab('effects')}><Icon name="effects" size={15}/>Efekty</button>
            </div>
          </div>
          {leftTab==='audio'&&<AudioLibrary project={project} locked={locked} timelinePlaying={playing} onImport={()=>importMedia('audio')} onRegister={registerAudio} onPause={playback.pause} onAdd={id=>{try{playback.pause();changeProject(insertLibraryItem(latestProject.current,id,time));setMessage('Dodano audio na oś czasu.');}catch(e){setMessage(String(e));}}}/>}
          {leftTab==='effects'&&<EffectsLibrary chosen={effectChoice} onChoose={setEffectChoice}/>}
          {leftTab==='files'&&<MediaLibrary project={project} sources={sources} locked={locked} onImport={importVideo} proxies={proxies} onClearCache={()=>{if(window.confirm('Usunąć wszystkie kopie proxy z cache? Oryginalne nagrania i projekt zostaną zachowane.'))void playback.suspend().then(()=>new Promise(r=>setTimeout(r,200))).then(()=>proxies.clear()).then(()=>playback.retry()).catch(e=>setMessage(String(e)));}}
            onAdd={id=>{try{playback.pause();const next=insertLibraryItem(project,id,time);setProject(next);setDirty(true);setMessage('Dodano plik z biblioteki na oś czasu.');}catch(e){setMessage(String(e));}}}/>}
          <div className="captions-tab-content" role="tabpanel" id="captions-panel" aria-labelledby="captions-tab" hidden={leftTab!=='captions'}>
          <div className="transcription-controls">
            <span className="transcription-scope">Napisy z montażu · tylko fragmenty na osi</span>
            <button
              className="primary"
              disabled={locked || !projectClips(project).length}
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
                  <button onClick={() => {seek(s.start);selectCaption(s.id);}}>
                    {formatTime(s.start)} — {formatTime(s.end)}
                  </button>
                  <button className="caption-list-text" onClick={()=>selectCaption(s.id)}>{s.text}</button>
                </article>
              ))
            ) : (
              <div className="empty">
                <div className="symbol">≋</div>
                <h3>{project.media && !duration ? "Montaż jest pusty" : "Tu pojawią się Twoje słowa"}</h3>
                <p>
                  {project.media && !duration ? 'Cofnij usunięcie lub wybierz „Przywróć cały film” na osi czasu. Oryginalna transkrypcja pozostaje zapisana.' : 'Importuj film i kliknij „Transkrybuj po polsku”. W ustawieniach wskaż model Whisper.'}
                </p>

              </div>
            )}
          </div>
          </div>
        </section>
        <section className="panel preview">
          <div className="panelhead">
            <h2>Podgląd wideo</h2>
            <span>{project.media?.name ?? "Brak filmu"}</span>
          </div>
          <div className="preview-toolbar"><label>Format<select aria-label="Format obrazu" disabled={locked} value={project.canvas?`${project.canvas.width}x${project.canvas.height}`:'source'} onChange={e=>{playback.pause();const [width,height]=e.target.value.split('x').map(Number);changeProject({...project,canvas:e.target.value==='source'?null:{width,height}});}}><option value="source">Źródłowy</option><option value="1080x1920">9:16 · Rolka</option><option value="1920x1080">16:9 · Poziomo</option><option value="1080x1080">1:1 · Kwadrat</option></select></label><SafeZoneControls value={safeZones} portrait={Math.abs(canvasAspect-9/16)<.01}/><button aria-pressed={inspectorTab==='layers'} onClick={()=>setInspectorTab('layers')}><Icon name="layers" size={13}/>Warstwy</button></div>
          <div className="stage" ref={stage}>
            {libraryItems(project).length ? (
              <div className="composition-surface" ref={captionSurface} style={{width:surfaceWidth,height:surfaceWidth/canvasAspect}}>
                <video ref={playback.video} className="mlt-video" preload="auto" playsInline/>
                {playback.loading&&<span className="transition-preparing">Przygotowywanie podglądu MLT…</span>}
                {playback.error&&<div className="preview-error" role="alert"><strong>Podgląd niedostępny</strong><p>{playback.error}</p><button onClick={playback.retry}>Ponów podgląd</button></div>}
                <FrameEditor project={project} proxyRevision={proxies.revision} time={Math.min(time,Math.max(0,duration-1/30))} playing={playing} locked={locked} selectedId={selected?.id??''} onSelect={id=>{setSelectedClip(id);setSelectedTransition('');setInspectorTab('layers');}} onPause={playback.pause} onChange={changeProject} onAspects={setFrameAspects}/>
                <CaptionOverlay video={captionSurface} project={displayed} time={time} compositionCanvas />
                <SafeZoneOverlay value={safeZones} portrait={Math.abs(canvasAspect-9/16)<.01}/>
                {gap && <span className="gap-label">{duration?'Przerwa między ujęciami':'Dodaj film z biblioteki na oś czasu'}</span>}
              </div>
            ) : (
              <div className="empty">
                <div className="symbol"><Icon name="video" size={40}/></div>
                <h3>Twój film, w centrum uwagi</h3>
                <p>Wybierz film, aby rozpocząć.</p>
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
              <Icon name="back5" size={19}/>
            </button>
            <button
              aria-label={playing?"Wstrzymaj odtwarzanie":"Odtwórz film"}
              className="play"
              disabled={!duration || busy}
              onClick={toggle}
            >
              <Icon name={playing?"pause":"play"} size={20}/>
            </button>
            <button
              aria-label="Przewiń 5 sekund"
              disabled={!duration || busy}
              onClick={() => seek(time + 5)}
            >
              <Icon name="forward5" size={19}/>
            </button>
            <code>
              {formatTime(time)} <span>/ {formatTime(duration)}</span>
            </code>
          </div>
        </section>
        <section className="panel styling">
          <div className="panelhead">
            <h2>Właściwości</h2>
          </div>
          <div className="panelbody">
            <div className="inspector-tabs"><button aria-pressed={inspectorTab==='video'} onClick={()=>setInspectorTab('video')}>Film / audio</button><button aria-pressed={inspectorTab==='captions'} onClick={()=>setInspectorTab('captions')}>Napisy</button><button aria-pressed={inspectorTab==='layers'} onClick={()=>setInspectorTab('layers')}>Warstwy</button></div>
            {inspectorTab==='layers'&&<LayersPanel project={project} time={time} selectedId={selected?.id??''} locked={locked} onSelect={id=>{playback.pause();const c=projectClips(project).find(c=>c.id===id)!;if(time<c.start||time>=c.start+c.sourceOut-c.sourceIn)seek(c.start);setSelectedClip(id);setSelectedTransition('');}} onCaptions={()=>setInspectorTab('captions')} onChange={changeProject}/>}
            {(inspectorTab==='video'||inspectorTab==='layers')&&<TransformControls project={project} clip={selected} sourceAspect={frameAspects[selected?.id??'']??0} canvasAspect={canvasAspect} locked={locked} onChange={changeProject}/>}
            {inspectorTab==='video'&&<VideoProperties project={project} clip={selected} locked={locked} transitionId={selectedTransition} onChange={changeProject}/>}
            <div hidden={inspectorTab!=='captions'}>
            {caption&&<div className="caption-editor"><h3>Edycja zaznaczonego napisu</h3><textarea ref={captionInput} aria-label="Tekst zaznaczonego napisu" value={caption.text} disabled={locked} onChange={e=>changeProject(editCaption(project,caption,{text:e.target.value}))}/><div><label>Początek<input aria-label="Początek napisu" type="number" step={.01} value={Number(caption.start.toFixed(3))} disabled={locked} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))changeProject(resizeCaption(project,caption,'left',e.target.valueAsNumber-caption.start));}}/></label><label>Koniec<input aria-label="Koniec napisu" type="number" step={.01} value={Number(caption.end.toFixed(3))} disabled={locked} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))changeProject(resizeCaption(project,caption,'right',e.target.valueAsNumber-caption.end));}}/></label></div></div>}
            <div className="caption-presets">{[
              {name:'Żółta plansza',effect:'box',color:'#080808',background:'#ffe600',outlineColor:'#000000',outlineWidth:0},
              {name:'Biały obrys',effect:'outline',color:'#ffffff',background:'#000000',outlineColor:'#080808',outlineWidth:3},
              {name:'Zielone podświetlenie',effect:'highlight',color:'#10140c',background:'#b4ff58',outlineColor:'#000000',outlineWidth:0},
              {name:'Fioletowe podświetlenie',effect:'highlight',color:'#ffffff',background:'#742cff',outlineColor:'#12092a',outlineWidth:1},
            ].map(preset=><button key={preset.name} disabled={locked} onClick={()=>updateStyle({effect:preset.effect as 'box'|'outline'|'highlight',color:preset.color,background:preset.background,outlineColor:preset.outlineColor,outlineWidth:preset.outlineWidth})}>{preset.name}</button>)}</div>
            <fieldset className="style-fields" disabled={exporting}>
              <p className="eyebrow">STYL DOMYŚLNY</p>
              <label>Wygląd<select aria-label="Wygląd napisów" value={style.effect??'box'} onChange={e=>updateStyle({effect:e.target.value as 'box'|'outline'|'highlight'})}><option value="box">Plansza</option><option value="outline">Obrys</option><option value="highlight">Podświetlenie</option></select></label>
              <label>Grubość obrysu <b>{style.outlineWidth??0}</b><input aria-label="Grubość obrysu" type="range" min={0} max={8} step={.5} value={style.outlineWidth??0} onChange={e=>updateStyle({outlineWidth:Number(e.target.value)})}/></label>
              <label>Kolor obrysu<input aria-label="Kolor obrysu" type="color" value={style.outlineColor??'#080808'} onChange={e=>updateStyle({outlineColor:e.target.value})}/></label>
              <button
                className="preset-button"
                onClick={() => updateStyle({ ...yellowPreset,effect:'box',outlineWidth:0 })}
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
          </div>
        </section>
      </main>
      <Timeline project={project} time={time} locked={locked} onSeek={seek}
        onChange={(clips,mode)=>{if(mode!=='volume')playback.pause();setProject(p=>({...p,clips,transitions:reconcileTransitions(p,clips)}));setDirty(true);}} onPreviewVolume={playback.previewVolume} onSelect={id=>{setSelectedClip(id);setSelectedTransition('');setInspectorTab('video');}} onCaptionSelect={selectCaption}
        onMediaDrop={(id,at,track)=>{try{playback.pause();changeProject(insertLibraryItem(project,id,at,track));setMessage('Dodano plik na oś czasu.');}catch(e){setMessage(String(e));}}}
        onCaptionChange={p=>changeProject(p)} effectChoice={effectChoice} onTransition={(a,b,choice)=>{try{playback.pause();const next=applyTransition(project,a,b,choice.kind,choice.duration);changeProject(next);setSelectedTransition(next.transitions.find(t=>t.toId===b)!.id);setInspectorTab('video');}catch(e){setMessage(String(e));}}} onTransitionSelect={id=>{setSelectedTransition(id);setInspectorTab('video');}}
        undo={undo} redo={redo} canUndo={history.canUndo} canRedo={history.canRedo}/>
      <footer role="status">
        {busy ? "Przetwarzanie…" : message}

      </footer>
      {settings && (
        <div className="overlay" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();setSettings(false);}if(e.key==='Tab'){const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary')).filter(el=>el.getClientRects().length);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}>
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
              automatycznie. Wybierz osobno model wielojęzyczny (bez .en).
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
                CPU · język polski. Model nie jest
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
