import {invoke} from '@tauri-apps/api/core';
const cache=new Map<string,string>();
type Request={key:string;path:string;time:number;valid:()=>boolean;resolve:(url:string|undefined)=>void};
let active=false;const queue:Request[]=[];
async function pump(){
 if(active)return;active=true;
 try{while(queue.length){const r=queue.shift()!;if(!r.valid()){r.resolve(undefined);continue;}const saved=cache.get(r.key);if(saved){r.resolve(saved);continue;}
  try{const png=await invoke<string>('source_thumbnail',{path:r.path,time:r.time}),url='data:image/png;base64,'+png;cache.set(r.key,url);if(cache.size>160)cache.delete(cache.keys().next().value!);r.resolve(r.valid()?url:undefined);}catch{r.resolve(undefined);}
 }}finally{active=false;}
}
/** At most one decoder; stale hover jobs are skipped before decoding. */
export function thumbnailFrame(path:string,time:number,identity:string,valid:()=>boolean,priority=false):Promise<string|undefined>{
 const key=JSON.stringify([path,identity,time]);if(cache.has(key))return Promise.resolve(cache.get(key));
 return new Promise(resolve=>{const r={key,path,time,valid,resolve};if(priority)queue.unshift(r);else queue.push(r);void pump();});
}
