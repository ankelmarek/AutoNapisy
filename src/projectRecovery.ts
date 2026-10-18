/** One serialized recovery writer. Newer edits stay pending while an older copy is written. */
export type RecoveryRequest={json:string|null;session:number};
export class RecoveryWriter {
 private latest:RecoveryRequest|null=null;
 private committed=''; private timer:ReturnType<typeof setTimeout>|undefined;private deadline:ReturnType<typeof setTimeout>|undefined;
 private running:Promise<void>|null=null;
 error='';capturedAt:number|null=null;writing=false;
 constructor(private transport:(r:RecoveryRequest)=>Promise<number|null>,private changed:()=>void,private delay=1500,private maxWait=10000){}
 private key(r:RecoveryRequest){return `${r.session}:${r.json??'<clean>'}`;}
 update(r:RecoveryRequest|null){
  this.latest=r;clearTimeout(this.timer);
  if(!r||this.key(r)===this.committed){clearTimeout(this.deadline);this.deadline=undefined;return;}
  this.timer=setTimeout(()=>void this.flush().catch(()=>{}),this.delay);
  this.deadline??=setTimeout(()=>void this.flush().catch(()=>{}),this.maxWait);
 }
 async flush():Promise<void>{
  clearTimeout(this.timer);clearTimeout(this.deadline);this.deadline=undefined;
  if(this.running){await this.running;return this.flush();}
  const r=this.latest;if(!r||this.key(r)===this.committed)return;
  const key=this.key(r);this.writing=true;this.changed();
  this.running=(async()=>{
   try{const at=await this.transport(r);this.committed=key;this.capturedAt=at;this.error='';}
   catch(e){this.error=String(e);if(this.latest)this.timer=setTimeout(()=>void this.flush().catch(()=>{}),30000);throw e;}
   finally{this.writing=false;this.running=null;this.changed();}
  })();
  await this.running;
  if(this.latest&&this.key(this.latest)!==this.committed)await this.flush();
 }
 dispose(){clearTimeout(this.timer);clearTimeout(this.deadline);this.deadline=undefined;this.latest=null;}
}
export type RecoveryInfo={available:boolean;recoverable?:boolean;session:number;name:string;capturedAt:number|null;manualPath:string|null;manualAt:number|null;warning:string};
