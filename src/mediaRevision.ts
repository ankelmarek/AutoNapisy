import {useSyncExternalStore} from 'react';
const versions=new Map<string,number>(),listeners=new Set<()=>void>();
export const mediaRevision=(path?:string)=>path?versions.get(path)??0:0;
export function invalidateMedia(path:string){versions.set(path,mediaRevision(path)+1);for(const fn of listeners)fn();}
export function useMediaRevision(path?:string){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>mediaRevision(path));}
