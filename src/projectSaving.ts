import {serializeProject,type Project} from './model';
export type SavePhase='idle'|'saving'|'error';
export type SaveStatus='saved'|'dirty'|'saving'|'error';
export type SaveState={phase:SavePhase;baseline:string|null;path:string;session:number;error:string};
export const initialSaveState=():SaveState=>({phase:'idle',baseline:null,path:'',session:0,error:''});
export const projectRevision=(p:Project)=>JSON.stringify(p);
export function saveStatus(s:SaveState,p:Project):SaveStatus{return s.phase==='saving'?'saving':s.phase==='error'?'error':s.baseline===projectRevision(p)?'saved':'dirty';}
export function normalizedTitle(value:string):string|null {const name=value.trim().replace(/\s+/g,' ');return name.length>0&&name.length<=200?name:null;}
/** Captures the exact revision sent to Rust. Newer edits stay dirty; old sessions cannot turn green. */
export class ProjectSaver {
 state=initialSaveState(); private pending=false;private epoch=0;
 constructor(private transport:(json:string,session:number,saveAs:boolean)=>Promise<string|null>,private changed:()=>void){}
 get saving(){return this.pending;}
 accept(p:Project,path:string,session:number){this.epoch++;this.state={phase:'idle',baseline:path?projectRevision(p):null,path,session,error:''};this.changed();}
 async save(p:Project,saveAs=false):Promise<string|null>{
  if(this.pending)return null;
  const previous=this.state,epoch=this.epoch,revision=projectRevision(p);this.pending=true;this.state={...previous,phase:'saving',error:''};this.changed();
  try{
   const path=await this.transport(serializeProject(p),previous.session,saveAs);
   if(epoch!==this.epoch)return null;
   this.state=path?{...previous,phase:'idle',path,baseline:revision,error:''}:previous;
   return path;
  }catch(e){if(epoch===this.epoch)this.state={...previous,phase:'error',error:e instanceof Error?e.message:String(e)};throw e;}
  finally{this.pending=false;this.changed();}
 }
}
