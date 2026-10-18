import {useEffect,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {libraryItems} from './library';
import {projectClips,clipMedia} from './editing';
import type {Project} from './model';
export type ProxyInfo={codec:string;profile:string;container:string;width:number;height:number;duration:number;fps:number|null;nominalFps:number|null;possibleVfr:boolean;rotation:number;hdr:boolean;audioStreams:number;colorPrimaries:string;colorTransfer:string;colorSpace:string};
export type ProxyRecord={path:string;status:'original'|'queued'|'building'|'ready'|'error';progress:number|null;message:string;enabled:boolean;profile:number;previewPath:string|null;sourceKey?:string;info?:ProxyInfo;recommended:boolean};
export type ProxyCache={bytes:number;limit:number;path:string};
export function proxyLabel(p?:ProxyRecord){if(!p)return 'Sprawdzanie…';if(p.status==='queued')return 'Proxy w kolejce';if(p.status==='building')return `Proxy ${p.progress==null?'…':`${p.progress}%`}`;if(p.status==='error')return 'Błąd proxy';if(p.previewPath&&p.enabled)return `Proxy ${p.profile}p`;if(p.status==='ready')return 'Oryginał · proxy gotowe';return 'Oryginał';}
export function useVideoProxies(project:Project,sources:Record<string,string>,sourceRevision=0){
 const paths=libraryItems(project).filter(m=>m.kind==='video'&&!!sources[m.path]).map(m=>m.path),key=JSON.stringify([paths,sourceRevision]);
 const [records,setRecords]=useState<Record<string,ProxyRecord>>({}),[error,setError]=useState(''),[cache,setCache]=useState<ProxyCache|null>(null);
 const latest=useRef(paths);latest.current=paths;const current=useRef(records);current.current=records;const mounted=useRef(true),fallbackRunning=useRef(false),autoTried=useRef(new Set<string>());
 const put=(r:ProxyRecord)=>{if(mounted.current&&latest.current.includes(r.path))setRecords(p=>({...p,[r.path]:r}));};
 const poll=async()=>{const paths=latest.current;if(!paths.length)return;const result=await invoke<ProxyRecord[]>('proxy_status',{paths});if(mounted.current)for(const r of result)put(r);};
 const inspect=async(path:string)=>{const r=await invoke<ProxyRecord>('proxy_info',{path});put(r);return r;};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{let alive=true;void(async()=>{for(const path of paths){if(!alive)return;try{const r=await inspect(path);if(alive&&r.enabled&&r.recommended&&r.status==='original'&&!autoTried.current.has(path)){autoTried.current.add(path);await invoke('start_proxy',{path,profile:540});await poll();}}catch(e){if(alive)put({path,status:'error',message:String(e),progress:null,enabled:false,profile:540,previewPath:null,recommended:false});}}})();return()=>{alive=false;};},[key]);
 useEffect(()=>{if(!paths.length)return;let alive=true,busy=false;const timer=setInterval(()=>{if(busy||!alive)return;busy=true;void poll().catch(e=>{if(alive)setError(String(e));}).finally(()=>{busy=false;});},1000);return()=>{alive=false;clearInterval(timer);};},[key]);
 const run=async(fn:()=>Promise<unknown>)=>{setError('');try{await fn();await poll();}catch(e){setError(String(e));}};
 const request=(path:string,profile:number)=>run(async()=>{await inspect(path);await invoke('start_proxy',{path,profile});});
 const cancel=(path:string)=>run(()=>invoke('cancel_proxy',{path}));
 const enable=(path:string,enabled:boolean)=>run(()=>invoke('set_proxy_enabled',{path,enabled}));
 const loadCache=()=>run(async()=>{const v=await invoke<ProxyCache>('proxy_cache_info');if(mounted.current)setCache(v);});
 const clear=()=>run(async()=>{await invoke('clear_proxy_cache');const v=await invoke<ProxyCache>('proxy_cache_info');if(mounted.current)setCache(v);});
 const fallback=async()=>{if(fallbackRunning.current)return;const active=Object.values(current.current).filter(r=>latest.current.includes(r.path)&&r.enabled&&r.previewPath);if(!active.length)return;fallbackRunning.current=true;try{await Promise.all(active.map(r=>invoke('set_proxy_enabled',{path:r.path,enabled:false})));await poll();setError('Podgląd wrócił do oryginałów po błędzie odtwarzania proxy. Możesz ponowić przygotowanie.');}catch(e){setError(String(e));}finally{fallbackRunning.current=false;}};
 const used=new Set(projectClips(project).filter(c=>c.kind!=='audio').map(c=>clipMedia(project,c)?.path));
 const active=paths.filter(path=>used.has(path)).map(path=>records[path]).filter(r=>r?.enabled&&r.previewPath);
 const revision=JSON.stringify(active.map(r=>[r.path,r.previewPath]));
 return {records,error,cache,revision,active:active.length,request,cancel,enable,loadCache,clear,fallback};
}
export type VideoProxies=ReturnType<typeof useVideoProxies>;
