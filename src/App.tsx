import { useEffect, useRef, useState, useMemo, useReducer } from "react";
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
import SourceViewer from './SourceViewer';
import {sourceRange,type SourceRange} from './sourceSelection';
import RecoveryDialog from './RecoveryDialog';
import {RecoveryWriter,type RecoveryInfo} from './projectRecovery';
import {getCurrentWindow} from '@tauri-apps/api/window';
import ProjectMenu from './ProjectMenu';
import ProjectTitle,{type TitleEditor} from './ProjectTitle';
import {ProjectSaver,projectRevision,saveStatus} from './projectSaving';
import EffectsLibrary,{type EffectChoice} from './EffectsLibrary';
import VideoProperties from './VideoProperties';
import {visuals,videoFilter,reconcileTransitions,applyTransition} from './effects';
import {editCaption,resizeCaption} from './captionEditing';


import SourceReplacementDialog from './SourceReplacementDialog';
import PreflightDialog from './PreflightDialog';
import {replaceSource,type Replacement,type ReplacementPolicy} from './sourceReplacement';
import {preflightIssues,type SourceCheck,type PreflightIssue} from './preflight';
import {invalidateMedia} from './mediaRevision';
import MediaLibrary from "./MediaLibrary";
import Icon from "./Icons";
import rolvixaIcon from "./assets/rolvixa-icon.png";
import {libraryItems,insertLibraryItem,registerMedia} from "./library";
import { useProjectHistory } from "./useHistory";
import FrameEditor from './FrameEditor';
import TransformControls from './TransformControls';
import EditorWorkspace from './EditorWorkspace';
import StartScreen from './StartScreen';
import {useRecentProjects} from './recentProjects';
import { useMltPlayback } from "./useMltPlayback";
import {useVideoProxies} from './useVideoProxies';
import {useSafeZones,SafeZoneControls,SafeZoneOverlay} from './SafeZones';
import { clipAt, editDuration, projectClips, compositionSegments, compositionProject, clipMedia, appendMedia } from "./editing";
import { rendering, type ExportStatus } from "./rendering";
import bebasLicense from "./assets/BebasNeue-OFL.txt?raw";
import CaptionOverlay, { CaptionBox } from "./CaptionOverlay";
import { captionExport, yellowPreset, referenceText } from "./captions";
import {assertUnlockedEdit,clipLocked} from './trackControls';
export default function App() {
  const history = useProjectHistory();
  const {project,setProject:writeProject} = history;
  const setProject=(value:Project|((p:Project)=>Project))=>{try{const next=typeof value==='function'?value(latestProject.current):value;assertUnlockedEdit(latestProject.current,next);writeProject(next);}catch(e){setMessage(String(e));}};
  const [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      "Gotowy.",
    ),
    [settings, setSettings] = useState(false),
    [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
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
  const [,refreshSave]=useReducer((n:number)=>n+1,0);
  const saverRef=useRef<ProjectSaver|null>(null);
  if(!saverRef.current)saverRef.current=new ProjectSaver(backend.save,refreshSave);
  const saver=saverRef.current,saveState=saver.state;
  const saving=saveState.phase==='saving';
  const revision=useMemo(()=>projectRevision(project),[project]);
  const pristineRevision=useRef(revision);
  const dirty=saveState.baseline===null||saveState.baseline!==revision;
  const status=useMemo(()=>saveStatus(saveState,project),[saveState,project]);
  const statusText=status==='saved'?'Zapisano':status==='saving'?'Zapisywanie…':status==='error'?`Błąd zapisu: ${saveState.error}`:saveState.path?'Niezapisane zmiany':'Projekt niezapisany';
  const titleEditor=useRef<TitleEditor>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      exportController.current?.abort();
    },
    [],
  );
  const [recoveryReady,setRecoveryReady]=useState(false),[recoveryInfo,setRecoveryInfo]=useState<RecoveryInfo|null>(null),[recoveryError,setRecoveryError]=useState('');
  const startup=useRef<Promise<RecoveryInfo>|null>(null),recovered=useRef(false);
  const [,refreshRecovery]=useReducer((n:number)=>n+1,0),recoveryRef=useRef<RecoveryWriter|null>(null);
  if(!recoveryRef.current)recoveryRef.current=new RecoveryWriter(async r=>{if(r.json===null){await invoke('clear_recovery',{session:r.session});return null;}return invoke<number>('write_recovery',{json:r.json,session:r.session});},refreshRecovery);
  const recovery=recoveryRef.current;
  const recent=useRecentProjects();
  const [homeMode,setHomeMode]=useState<'startup'|'initial'|'manual'|'closed'>('startup'),[startError,setStartError]=useState('');
  const homeVisible=recoveryReady&&!recoveryInfo&&homeMode!=='closed';
  useEffect(()=>{if(recoveryReady&&!recoveryInfo&&homeMode!=='closed'&&!recent.ready)void recent.refresh();},[recoveryReady,recoveryInfo,homeMode]);
  useEffect(()=>{if(homeMode==='startup'&&recoveryReady&&!recoveryInfo&&recent.ready)setHomeMode(recent.showOnStartup?'initial':'closed');},[homeMode,recoveryReady,recoveryInfo,recent.ready]);
  const [timelineModal,setTimelineModal]=useState(false);
  const [replacement,setReplacement]=useState<{id:string;locate:boolean;candidate:Replacement;project:Project}|null>(null),[replacementError,setReplacementError]=useState('');
  const [preflight,setPreflight]=useState<{project:Project;issues:PreflightIssue[]}|null>(null);
  const [sourceRevision,bumpSourceRevision]=useReducer((n:number)=>n+1,0),[highlightSource,setHighlightSource]=useState('');
  const locked = !!replacement || !!preflight || timelineModal || busy || transcribing || exporting || !recoveryReady || !!recoveryInfo;
  useEffect(()=>{let alive=true;startup.current??=invoke<RecoveryInfo>('recovery_status');void startup.current.then(info=>{if(!alive)return;saver.accept(latestProject.current,'',info.session);if(info.available)setRecoveryInfo(info);if(info.warning){if(info.available)setRecoveryError(info.warning);else setMessage('Odzyskiwanie: '+info.warning);}setRecoveryReady(true);}).catch(e=>{if(alive){setRecoveryError(String(e));setRecoveryReady(true);}});return()=>{alive=false;};},[]);
  useEffect(()=>{
    const needed=saveState.baseline===null?(recovered.current||revision!==pristineRevision.current):dirty;
    recovery.update(!recoveryReady||recoveryInfo||saving||busy?null:{session:saveState.session,json:needed?revision:null});
  },[revision,saveState,recoveryReady,recoveryInfo,busy]);
  useEffect(()=>()=>recovery.dispose(),[]);
  const resumeRecovery=()=>{
    if(!recoveryReady||recoveryInfo||saver.saving)return;
    const s=saver.state,r=projectRevision(latestProject.current),needed=s.baseline===null?(recovered.current||r!==pristineRevision.current):s.baseline!==r;
    recovery.update({session:s.session,json:needed?r:null});
  };
  const closeAction=useRef<()=>Promise<boolean>>(async()=>false);
  closeAction.current=async()=>{
    if(busy||transcribing||exporting||saver.saving){setMessage('Poczekaj na zakończenie operacji przed zamknięciem.');return false;}
    if(recoveryInfo||!recoveryReady)return true;
    if(titleEditor.current&&!titleEditor.current.commit())return false;
    const p=latestProject.current,r=projectRevision(p),needed=saveState.baseline===null?(recovered.current||r!==pristineRevision.current):saveState.baseline!==r;
    recovery.update({session:saveState.session,json:needed?r:null});
    try{await recovery.flush();return true;}
    catch(e){if(!needed)return true;setMessage(`Nie udało się zapisać kopii odzyskiwania: ${String(e)}. Zapisz projekt ręcznie przed zamknięciem.`);return false;}
  };
  useEffect(()=>{let alive=true,unlisten:(()=>void)|undefined;try{const win=getCurrentWindow();void win.onCloseRequested(event=>{event.preventDefault();void closeAction.current().then(ok=>{if(ok)return win.destroy();}).catch(e=>setMessage(String(e)));}).then(stop=>{if(alive)unlisten=stop;else stop();}).catch(()=>{});}catch{}const flush=()=>{if(document.hidden)void recovery.flush().catch(()=>{});};document.addEventListener('visibilitychange',flush);return()=>{alive=false;unlisten?.();document.removeEventListener('visibilitychange',flush);};},[]);
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
  const [inspectorTab,setInspectorTab]=useState<'video'|'captions'>('video'),[selectedClip,setSelectedClip]=useState(''),[selectedCaption,setSelectedCaption]=useState(''),[selectedTransition,setSelectedTransition]=useState('');
  const [effectChoice,setEffectChoice]=useState<EffectChoice>({kind:'fade',duration:.4});
  const captionInput=useRef<HTMLTextAreaElement>(null);
  const [sourceViewerId,setSourceViewerId]=useState('');
  const sourceRanges=useRef(new Map<string,SourceRange>()),sourceKeys=useRef<((e:KeyboardEvent)=>void)|null>(null);
  const [sourceRangeRevision,bumpSourceRange]=useReducer((n:number)=>n+1,0);
  const sourceViewerItem=libraryItems(project).find(m=>m.id===sourceViewerId&&m.duration!=null&&!!sources[m.path]);
  const chosenSourceRange=useMemo(()=>{if(!sourceViewerItem)return null;try{return sourceRange(sourceViewerItem.duration!,sourceRanges.current.get(sourceViewerItem.path));}catch{return sourceRange(sourceViewerItem.duration!);}},[sourceViewerItem?.path,sourceViewerItem?.duration,sourceRangeRevision]);
  const viewSource=(id:string)=>{playback.pause();setSourceViewerId(id);};
  const proxies=useVideoProxies(project,sources,sourceRevision),safeZones=useSafeZones();
  const playback = useMltPlayback(project,proxies.revision+sourceRevision,!sourceViewerItem&&!homeVisible);
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
  const changeProject=(p:Project)=>{try{assertUnlockedEdit(latestProject.current,p);setProject(p);}catch(e){setMessage(String(e));}};
  const gap = !visuals(project,Math.min(time,Math.max(0,duration-1e-7))).length;
  const undo = () => {playback.pause();history.undo();};
  const redo = () => {playback.pause();history.redo();};
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{
      if(locked || homeVisible || !(e.ctrlKey||e.metaKey) || (e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))))return;
      if(e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
      if(e.key.toLowerCase()==='y'){e.preventDefault();redo();}
    };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[locked,homeVisible,history.canUndo,history.canRedo]);
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
  const replace = () => {
    // Shortcuts may run before passive effects replace the previous key handler.
    // The saver and project refs are authoritative immediately after a save/title commit.
    const state=saver.state,current=projectRevision(latestProject.current);
    return !(state.baseline===null?current!==pristineRevision.current:current!==state.baseline) || window.confirm("Projekt ma niezapisane zmiany. Kontynuować?");
  };
  const importMedia = (kind:'video'|'audio') => run(async()=>{
    const files=await preview.import(kind);if(!files?.length)return;
    let next=latestProject.current;const prepared:Record<string,string>={},failed:string[]=[];let added=0;
    for(const media of files){try{
      const url=await preview.prepare(media.path);
      const info=await invoke<{duration:number}>('media_info',{path:media.path,kind});const metadata=info.duration;
      const updated=registerMedia(next,{...media,duration:metadata},kind);if(updated!==next)added++;next=updated;prepared[media.path]=url;
    }catch(e){failed.push(`${media.name}: ${String(e)}`);}}
    if(added){setProject(next);}setSources(prev=>({...prev,...prepared}));setSource(previous=>previous||Object.values(prepared)[0]||'');
    setMessage(`Dodano do biblioteki: ${added}. Dodaj wybrane pliki na oś przyciskiem +.${failed.length?' Niedodane: '+failed.join('; '):''}`);
  });
  const registerAudio=(item:LibraryAudio)=>{const next=registerMedia(latestProject.current,{path:item.path,name:item.name,duration:item.duration,provenance:item.provenance},'audio');if(next!==latestProject.current){latestProject.current=next;changeProject(next);}setSources(prev=>({...prev,[item.path]:convertFileSrc(item.path)}));return libraryItems(next).find(a=>a.path===item.path)!.id;};
  const importVideo=()=>importMedia('video');
  const open = (id?:string) => run(async () => {
      if (saver.saving || !replace()) return;
      setStartError('');recovery.update(null);try{await recovery.flush();}catch{}
      try{
        const result=id?await invoke<{json:string;path:string;session:number}>('open_recent_project',{id}):await backend.open();
        if(!result)return;
        const p=parseProject(result.json),prepared:Record<string,string>={},missing:string[]=[];
        for(const m of [...(p.media?[p.media]:[]),...p.assets]){try{prepared[m.path]=await preview.prepare(m.path);}catch{missing.push(m.name);}}
        setSources(prepared);setSourceViewerId('');sourceRanges.current.clear();resetPlayback();latestProject.current=p;history.reset(p);recovered.current=false;saver.accept(p,result.path,result.session);setSource(Object.values(prepared)[0]??'');setHomeMode('closed');
        void recent.refresh();setMessage(missing.length?`Projekt otwarty. Niedostępne pliki: ${missing.join(', ')}`:'Projekt otwarty.');
      }catch(e){setStartError(String(e));throw e;}finally{resumeRecovery();}
    });
  const showRecent=()=>{playback.pause();setSourceViewerId('');setStartError('');setHomeMode('manual');if(recent.ready)void recent.refresh();};
  const createNew=()=>run(async()=>{
    if(saver.saving||!replace())return;
    recovery.update(null);try{await recovery.flush();}catch{}const session=await backend.newProject();const p=newProject();
    setSourceViewerId('');sourceRanges.current.clear();recovered.current=false;resetPlayback();latestProject.current=p;history.reset(p);pristineRevision.current=projectRevision(p);saver.accept(p,'',session);setSource('');setSources({});setHomeMode('closed');setStartError('');
  });
  const save=async(saveAs=false)=>{
    if(saver.saving)return;
    if(titleEditor.current&&!titleEditor.current.commit())return;
    try{recovery.update(null);try{await recovery.flush();}catch{}const path=await saver.save(latestProject.current,saveAs);if(path){recovered.current=false;void recent.refresh();setMessage(`Zapisano projekt: ${path}`);}}
    catch(e){setMessage(`Błąd zapisu: ${e instanceof Error?e.message:String(e)} Użyj „Zapisz jako”, aby zapisać kopię.`);}
    finally{resumeRecovery();}
  };
  const resolveRecovery=(action:'recover'|'saved'|'discard')=>run(async()=>{
    setRecoveryError('');
    try {
      const result=await invoke<{json:string;path:string;session:number}|null>('resolve_recovery',{action});
      if(result){
        const p=parseProject(result.json),prepared:Record<string,string>={},missing:string[]=[];
        for(const m of [...(p.media?[p.media]:[]),...p.assets]){try{prepared[m.path]=await preview.prepare(m.path);}catch{missing.push(m.name);}}
        setSourceViewerId('');sourceRanges.current.clear();resetPlayback();latestProject.current=p;history.reset(p);pristineRevision.current=projectRevision(p);recovered.current=action==='recover';setHomeMode('closed');saver.accept(p,result.path,result.session);setSources(prepared);setSource(Object.values(prepared)[0]??'');
        if(action==='saved')void recent.refresh();
        setMessage(`${action==='recover'?'Odzyskano projekt. Zapisz go jako nowy plik.':'Otworzono zapisany projekt.'}${missing.length?' Niedostępne pliki: '+missing.join(', '):''}`);
      }else setMessage('Odrzucono kopię odzyskiwania.');
      setRecoveryInfo(null);
    }catch(e){setRecoveryError(String(e));}
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
  const closeReplacement=()=>{if(busy)return;const token=replacement?.candidate.token;setReplacement(null);setReplacementError('');if(token)void invoke('discard_source_replacement',{token}).catch(()=>{});};
  const chooseReplacement=(id:string,locate:boolean)=>run(async()=>{
    playback.pause();setSourceViewerId('');setReplacementError('');
    const current=latestProject.current;
    try{const candidate=await invoke<Replacement|null>('choose_source_replacement',{json:serializeProject(current),id});
      if(candidate)setReplacement({id,locate,candidate,project:current});
    }catch(e){setReplacementError(String(e));throw e;}
  });
  const applyReplacement=(policy:ReplacementPolicy)=>run(async()=>{
    if(!replacement)return;
    try{
      if(latestProject.current!==replacement.project)throw Error('Projekt zmienił się podczas wyboru. Wybierz źródło ponownie.');
      const next=replaceSource(replacement.project,replacement.id,replacement.candidate,policy);
      await playback.suspend();
      const path=await invoke<string>('confirm_source_replacement',{token:replacement.candidate.token});
      if(path!==replacement.candidate.path)throw Error('Nieprawidłowe potwierdzenie źródła.');
      const old=libraryItems(replacement.project).find(m=>m.id===replacement.id)!;
      sourceRanges.current.delete(old.path);sourceRanges.current.delete(path);
      invalidateMedia(old.path);if(old.path!==path)invalidateMedia(path);
      setSources(prev=>({...prev,[path]:convertFileSrc(path)}));bumpSourceRevision();setFrameAspects({});
      writeProject(next);latestProject.current=next;setReplacement(null);setReplacementError('');
      setMessage('Źródło podmienione. Sprawdź podgląd i synchronizację. Ctrl+Z przywraca cały poprzedni stan.');
    }catch(e){setReplacementError(String(e));throw e;}
  });
  const exportMp4=()=>run(async()=>{
    if(exportController.current||locked)return;
    playback.pause();setSourceViewerId('');setHighlightSource('');
    const current=latestProject.current;
    const checks=await invoke<SourceCheck[]>('check_project_sources',{json:serializeProject(current)});
    setSources(prev=>{const next={...prev};for(const m of libraryItems(current)){if(!checks.find(c=>c.id===m.id)?.available)delete next[m.path];}return next;});
    if(latestProject.current!==current)throw Error("Projekt zmienił się podczas sprawdzania. Uruchom sprawdzenie ponownie.");
    setPreflight({project:current,issues:preflightIssues(current,checks)});
  });
  const performExport = async (snapshot:Project) => {

    if (exportController.current) return;
    if(latestProject.current!==snapshot){setMessage("Projekt zmienił się. Sprawdź go ponownie przed eksportem.");return;}
    const abort = new AbortController();
    exportController.current = abort;
    setExporting(true);
    setExportStatus(null);
    try {
      const path = await rendering.render(
        snapshot,
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
      if(homeVisible){if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='n'){e.preventDefault();void createNew();}else if(e.key.toLowerCase()==='o'){e.preventDefault();void open();}else if(e.key.toLowerCase()==='s')e.preventDefault();}return;}
      if(e.code==='Space'&&(!text||e.ctrlKey)){if(sourceViewerItem){sourceKeys.current?.(e);return;}e.preventDefault();toggle();return;}
      if(e.ctrlKey||e.metaKey){if(e.key.toLowerCase()==='s'){e.preventDefault();void save(e.shiftKey);return;}if(e.key.toLowerCase()==='o'){e.preventDefault();void open();return;}if(e.key.toLowerCase()==='i'){e.preventDefault();if(e.shiftKey)void importMedia('audio');else void importVideo();return;}if(e.key.toLowerCase()==='n'){e.preventDefault();void createNew();return;}}
      if(text||['INPUT','SELECT'].includes(el?.tagName))return;
      if(sourceViewerItem){sourceKeys.current?.(e);return;}
      if(e.key==='Home'){e.preventDefault();seek(0);}else if(e.key==='End'){e.preventDefault();seek(duration);}else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();seek(time+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?1:1/30));}
    };window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);
  },[locked,homeVisible,project,time,playing,saveState,sourceViewerItem?.id]);
  const style = project.styles.default;
  const updateStyle = (patch: Partial<typeof style>) => {
    setProject((p) => ({
      ...p,
      styles: { ...p.styles, default: { ...p.styles.default, ...patch } },
    }));
    
  };
  return (
    <div className="app" data-startup-ready={recoveryReady&&(!!recoveryInfo||homeMode!=='startup')}>
      {homeVisible&&<StartScreen recent={recent} busy={busy||saving} error={startError} canReturn={homeMode==='manual'} onNew={()=>void createNew()} onOpen={()=>void open()} onRecent={id=>void open(id)} onDismiss={()=>setStartError('')} onReturn={()=>setHomeMode('closed')}/>}
      <div className="editor-ui" hidden={homeVisible} inert={homeVisible||!recoveryReady||!!recoveryInfo||undefined}>
      <header>
        <div className="brand">
          <img className="brand-icon" src={rolvixaIcon} alt=""/>
          <div>
            RolVixa
          </div>
        </div>
        <ProjectMenu actions={[
          {label:'Nowy',keys:'Ctrl+N',disabled:locked||saving,run:()=>void createNew()},
          {label:'Otwórz',keys:'Ctrl+O',disabled:locked||saving,run:()=>void open()},
          {label:'Ostatnie projekty',disabled:locked||saving,run:showRecent},
          {label:'Zapisz',keys:'Ctrl+S',disabled:locked||saving,run:()=>void save()},
          {label:'Zapisz jako…',keys:'Ctrl+Shift+S',disabled:locked||saving,run:()=>void save(true)},
          {label:'Importuj filmy',keys:'Ctrl+I',disabled:locked,run:importVideo},
          {label:'Importuj audio',keys:'Ctrl+Shift+I',disabled:locked,run:()=>importMedia('audio')},
          {label:'Eksport MP4',disabled:locked||!project.media||!duration,run:()=>void exportMp4()},
          {label:'Eksport SRT',disabled:locked||!displayedSegments.length,run:exportSrt},
          {label:'Ustawienia',disabled:locked,run:()=>{playback.pause();setSettings(true);void run(loadSettings);}},
        ]}/>
        <ProjectTitle key={saveState.session} ref={titleEditor} name={project.name} disabled={locked} onChange={name=>{const p={...latestProject.current,name};latestProject.current=p;setProject(p);}}/>
        <span className={`save-status status-${status}`} role="status" title={saveState.error||saveState.path||statusText}>{statusText}</span>
        <div className="header-actions">
          <button className={`header-save status-${status}`} data-save-status={status} aria-label="Zapisz projekt" aria-keyshortcuts="Control+S" title={`Zapisz projekt (Ctrl+S) · ${statusText}${saveState.path?' · '+saveState.path:''}`} disabled={locked||saving} onClick={()=>void save()}><Icon name={status==='saving'?'saveLoading':status==='error'?'saveError':'save'} size={22}/>{status==='saved'&&<Icon name="check" size={11}/>}</button>
          <button className="header-export" aria-label="Eksportuj MP4" title={locked?'Eksport niedostępny podczas operacji':!project.media||!duration?'Dodaj film na oś czasu, aby eksportować MP4':'Eksportuj MP4'} disabled={locked||!project.media||!duration} onClick={()=>void exportMp4()}><Icon name="export" size={21}/><span>Eksportuj</span></button>
        </div>
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
      <EditorWorkspace>
        <section className="panel transcript">
          <div className="panelhead">
            <div className="library-tabs" role="tablist" aria-label="Zasoby projektu">
              <button id="files-tab" role="tab" aria-selected={leftTab==='files'} aria-controls="files-panel" onClick={()=>setLeftTab('files')}><Icon name="files" size={16}/>Pliki <small>{libraryItems(project).length}</small></button>
              <button id="captions-tab" role="tab" aria-selected={leftTab==='captions'} aria-controls="captions-panel" onClick={()=>setLeftTab('captions')}><Icon name="captions" size={16}/>Napisy</button><button id="audio-tab" role="tab" aria-selected={leftTab==='audio'} aria-controls="audio-panel" onClick={()=>setLeftTab('audio')}><Icon name="audio" size={15}/>Audio</button><button id="effects-tab" role="tab" aria-controls="effects-panel" aria-selected={leftTab==='effects'} onClick={()=>setLeftTab('effects')}><Icon name="effects" size={15}/>Efekty</button>
            </div>
          </div>
          {leftTab==='audio'&&<AudioLibrary project={project} locked={locked} timelinePlaying={playing} onImport={()=>importMedia('audio')} onRegister={registerAudio} onPause={playback.pause} onAdd={id=>{try{playback.pause();changeProject(insertLibraryItem(latestProject.current,id,time));setMessage('Dodano audio na oś czasu.');}catch(e){setMessage(String(e));}}}/>}
          {leftTab==='effects'&&<EffectsLibrary chosen={effectChoice} onChoose={setEffectChoice}/>}
          {leftTab==='files'&&<MediaLibrary project={project} sources={sources} locked={locked} onReplace={chooseReplacement} highlightId={highlightSource} onView={viewSource} onImport={importVideo} proxies={proxies} onClearCache={()=>{if(window.confirm('Usunąć wszystkie kopie proxy z cache? Oryginalne nagrania i projekt zostaną zachowane.'))void playback.suspend().then(()=>new Promise(r=>setTimeout(r,200))).then(()=>proxies.clear()).then(()=>playback.retry()).catch(e=>setMessage(String(e)));}}
            onAdd={id=>{try{playback.pause();const next=insertLibraryItem(project,id,time);changeProject(next);setMessage('Dodano plik z biblioteki na oś czasu.');}catch(e){setMessage(String(e));}}}/>}
          <div className="captions-tab-content" role="tabpanel" id="captions-panel" aria-labelledby="captions-tab" hidden={leftTab!=='captions'}>
          <div className="transcription-controls" role="group" aria-label="Tworzenie i eksport napisów">
            <button
              className="primary"
              disabled={locked || !projectClips(project).length}
              onClick={() => void transcribe()}
            >
              <Icon name="captions" size={17}/><span>Transkrybuj po polsku</span>
            </button>
            <button
              disabled={locked || !displayedSegments.length}
              onClick={exportSrt}
            >
              <Icon name="download" size={17}/><span>Eksport SRT</span>
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
                <div className="symbol"><Icon name="captions" size={34}/></div>
                <h3>{project.media && !duration ? "Montaż jest pusty" : "Tu pojawią się Twoje słowa"}</h3>
                <p>
                  {project.media && !duration ? 'Przeciągnij nagranie z biblioteki na oś czasu.' : 'Dodaj nagranie i wybierz „Transkrybuj po polsku”.'}
                </p>

              </div>
            )}
          </div>
          </div>
        </section>
        <section className="panel preview">
          {sourceViewerItem&&chosenSourceRange&&<SourceViewer key={sourceViewerItem.path+sourceRevision} item={sourceViewerItem} range={chosenSourceRange} keyHandler={sourceKeys} proxyRevision={JSON.stringify([proxies.records[sourceViewerItem.path]?.previewPath,proxies.records[sourceViewerItem.path]?.enabled])} locked={locked||settings} onRange={r=>{sourceRanges.current.set(sourceViewerItem.path,r);bumpSourceRange();}} onClose={()=>setSourceViewerId('')} onAdd={range=>{try{const next=insertLibraryItem(latestProject.current,sourceViewerItem.id,time,undefined,range);setSourceViewerId('');changeProject(next);setMessage('Dodano zaznaczony fragment na oś czasu.');}catch(e){setMessage(String(e));}}}/>}
          <div className="montage-preview" hidden={!!sourceViewerItem}>
          <div className="panelhead">
            <h2>Podgląd wideo</h2>
            <span>{project.media?.name ?? "Brak filmu"}</span>
          </div>
          <div className="preview-toolbar"><label>Format<select aria-label="Format obrazu" disabled={locked} value={project.canvas?`${project.canvas.width}x${project.canvas.height}`:'source'} onChange={e=>{playback.pause();const [width,height]=e.target.value.split('x').map(Number);changeProject({...project,canvas:e.target.value==='source'?null:{width,height}});}}><option value="source">Źródłowy</option><option value="1080x1920">9:16 · Rolka</option><option value="1920x1080">16:9 · Poziomo</option><option value="1080x1080">1:1 · Kwadrat</option></select></label><SafeZoneControls value={safeZones} portrait={Math.abs(canvasAspect-9/16)<.01}/></div>
          <div className="stage" ref={stage}>
            {libraryItems(project).length ? (
              <div className="composition-surface" ref={captionSurface} style={{width:surfaceWidth,height:surfaceWidth/canvasAspect}}>
                <video ref={playback.video} className="mlt-video" preload="auto" playsInline/>
                {playback.loading&&<span className="transition-preparing">Przygotowywanie podglądu MLT…</span>}
                {playback.error&&<div className="preview-error" role="alert"><strong>Podgląd niedostępny</strong><p>{playback.error}</p><button onClick={playback.retry}>Ponów podgląd</button></div>}
                <FrameEditor project={project} proxyRevision={proxies.revision+sourceRevision} time={Math.min(time,Math.max(0,duration-1/30))} playing={playing} locked={locked} selectedId={selected?.id??''} onSelect={id=>{setSelectedClip(id);setSelectedTransition('');setInspectorTab('video');}} onPause={playback.pause} onChange={changeProject} onAspects={setFrameAspects}/>
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
        </div>
        </section>
        <section className="panel styling">
          <div className="panelhead">
            <h2>Właściwości</h2>
          </div>
          <div className="panelbody">
            <div className="inspector-tabs"><button aria-pressed={inspectorTab==='video'} onClick={()=>setInspectorTab('video')}>Film / audio</button><button aria-pressed={inspectorTab==='captions'} onClick={()=>setInspectorTab('captions')}>Napisy</button></div>

            {inspectorTab==='video'&&<TransformControls project={project} clip={selected} sourceAspect={frameAspects[selected?.id??'']??0} canvasAspect={canvasAspect} locked={locked||!!selected&&clipLocked(project,selected)} onChange={changeProject}/>}
            {inspectorTab==='video'&&<VideoProperties project={project} clip={selected} locked={locked||!!selected&&clipLocked(project,selected)} transitionId={selectedTransition} onChange={changeProject}/>}
            <div hidden={inspectorTab!=='captions'}>
            {caption&&<div className="caption-editor"><h3>Edycja zaznaczonego napisu</h3><textarea ref={captionInput} aria-label="Tekst zaznaczonego napisu" value={caption.text} disabled={locked} onChange={e=>changeProject(editCaption(project,caption,{text:e.target.value}))}/><div><label>Początek<input aria-label="Początek napisu" type="number" step={.01} value={Number(caption.start.toFixed(3))} disabled={locked} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))changeProject(resizeCaption(project,caption,'left',e.target.valueAsNumber-caption.start));}}/></label><label>Koniec<input aria-label="Koniec napisu" type="number" step={.01} value={Number(caption.end.toFixed(3))} disabled={locked} onChange={e=>{if(Number.isFinite(e.target.valueAsNumber))changeProject(resizeCaption(project,caption,'right',e.target.valueAsNumber-caption.end));}}/></label></div></div>}
            <div className="caption-presets">{[
              {name:'Żółta plansza',effect:'box',color:'#080808',background:'#ffe600',outlineColor:'#000000',outlineWidth:0},
              {name:'Biały obrys',effect:'outline',color:'#ffffff',background:'#000000',outlineColor:'#080808',outlineWidth:3},
              {name:'Zielone podświetlenie',effect:'highlight',color:'#10140c',background:'#b4ff58',outlineColor:'#000000',outlineWidth:0},
              {name:'Fioletowe podświetlenie',effect:'highlight',color:'#ffffff',background:'#742cff',outlineColor:'#12092a',outlineWidth:1},
            ].map(preset=><button key={preset.name} disabled={locked} onClick={()=>updateStyle({effect:preset.effect as 'box'|'outline'|'highlight',color:preset.color,background:preset.background,outlineColor:preset.outlineColor,outlineWidth:preset.outlineWidth})}>{preset.name}</button>)}</div>
            <fieldset className="style-fields" disabled={locked}>
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
      <Timeline project={project} time={time} locked={locked||settings||homeVisible} onPreviewOpen={setTimelineModal} onError={setMessage} onSeek={t=>{setSourceViewerId('');seek(t);}}
        onChange={(clips,mode)=>{if(mode!=='volume')playback.pause();changeProject({...latestProject.current,clips,transitions:reconcileTransitions(latestProject.current,clips)});}} onPreviewVolume={playback.previewVolume} onBeginAudio={playback.pause} onSelect={id=>{setSelectedClip(id);setSelectedTransition('');setInspectorTab('video');}} onCaptionSelect={selectCaption}
        onMediaDrop={(id,at,track,range,kind)=>{try{playback.pause();setSourceViewerId('');changeProject(insertLibraryItem(latestProject.current,id,at,track,range,kind));setMessage('Dodano plik na oś czasu.');}catch(e){setMessage(String(e));}}}
        onCaptionChange={p=>changeProject(p)} effectChoice={effectChoice} onTransition={(a,b,choice)=>{try{playback.pause();const next=applyTransition(project,a,b,choice.kind,choice.duration);changeProject(next);setSelectedTransition(next.transitions.find(t=>t.toId===b)!.id);setInspectorTab('video');}catch(e){setMessage(String(e));}}} onTransitionSelect={id=>{setSelectedTransition(id);setInspectorTab('video');}}
        undo={undo} redo={redo} canUndo={history.canUndo} canRedo={history.canRedo}/>
      </EditorWorkspace>
      <footer role="status">
        <span>{busy ? "Przetwarzanie…" : message}</span>
        <span className={`recovery-status ${recovery.error||recoveryError?'failed':''}`} title={recovery.error||recoveryError||'Kopia odzyskiwania jest oddzielona od ręcznego zapisu'} role="status">{recovery.error||recoveryError?'Błąd kopii odzyskiwania':recovery.writing?'Zapisywanie kopii…':recovery.capturedAt?'Kopia odzyskiwania · '+new Date(recovery.capturedAt).toLocaleTimeString('pl-PL'):''}</span>

        {recent.warning&&<span className="recent-editor-warning" title={recent.warning}>Historia projektów: {recent.warning}</span>}
      </footer>
      </div>
      {replacement&&<SourceReplacementDialog key={replacement.candidate.token} project={replacement.project} id={replacement.id} candidate={replacement.candidate} locate={replacement.locate} busy={busy} error={replacementError} onClose={closeReplacement} onChoose={()=>void chooseReplacement(replacement.id,replacement.locate)} onApply={applyReplacement}/>}
      {preflight&&<PreflightDialog issues={preflight.issues} onClose={()=>setPreflight(null)} onExport={()=>{const snapshot=preflight.project;setPreflight(null);void performExport(snapshot);}} onSeek={t=>{setPreflight(null);setSourceViewerId('');seek(t);}} onLocate={id=>{setPreflight(null);setLeftTab('files');setHighlightSource(id);}}/>}
      {recoveryInfo&&<RecoveryDialog info={recoveryInfo} busy={busy} error={recoveryError} onChoose={resolveRecovery}/>}
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
