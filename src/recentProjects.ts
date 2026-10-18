import {useCallback,useRef,useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
export type RecentProject={id:string;name:string;path:string;lastUsed:number};
export type RecentList={entries:RecentProject[];showOnStartup:boolean;warning:string};
export function useRecentProjects(){
 const [data,setData]=useState<RecentList>({entries:[],showOnStartup:true,warning:''}),[ready,setReady]=useState(false),[loading,setLoading]=useState(false),[pending,setPending]=useState(false);
 const epoch=useRef(0);
 const refresh=useCallback(async()=>{
  const ticket=++epoch.current;setLoading(true);
  try{const result=await invoke<RecentList>('recent_projects');if(ticket===epoch.current){setData({...result,entries:result.entries.slice(0,6)});setReady(true);}return result;}
  catch(e){if(ticket===epoch.current){setData(old=>({...old,warning:String(e)}));setReady(true);}return null;}
  finally{if(ticket===epoch.current)setLoading(false);}
 },[]);
 const action=async(cmd:string,args?:Record<string,unknown>)=>{setPending(true);try{await invoke(cmd,args);await refresh();}catch(e){setData(old=>({...old,warning:String(e)}));}finally{setPending(false);}};
 const preference=async(enabled:boolean)=>{const previous=data.showOnStartup;setPending(true);setData(old=>({...old,showOnStartup:enabled}));try{await invoke('set_startup_screen',{enabled});await refresh();}catch(e){setData(old=>({...old,showOnStartup:previous,warning:String(e)}));}finally{setPending(false);}};
 return {...data,ready,loading,pending,refresh,remove:(id:string)=>action('remove_recent_project',{id}),preference,clear:()=>action('clear_recent_projects')};
}
