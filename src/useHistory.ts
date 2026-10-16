import { useReducer } from 'react';
import {newProject,type Project} from './model';
type Update=Project|((p:Project)=>Project);
type State={present:Project;past:Project[];future:Project[]};
type Action={type:'edit'|'amend'|'reset';value:Update}|{type:'undo'}|{type:'redo'};
export function historyReducer(s:State,a:Action):State {
  if(a.type==='undo')return s.past.length?{present:s.past.at(-1)!,past:s.past.slice(0,-1),future:[s.present,...s.future]}:s;
  if(a.type==='redo')return s.future.length?{present:s.future[0],past:[...s.past,s.present].slice(-100),future:s.future.slice(1)}:s;
  const value=typeof a.value==='function'?a.value(s.present):a.value;
  if(a.type==='reset')return {present:value,past:[],future:[]};
  if(a.type==='amend')return {...s,present:value};
  return value===s.present?s:{present:value,past:[...s.past,s.present].slice(-100),future:[]};
}
export function useProjectHistory(){
 const [s,dispatch]=useReducer(historyReducer,undefined,()=>({present:newProject(),past:[],future:[]}));
 return {project:s.present,setProject:(value:Update)=>dispatch({type:'edit',value}),amend:(value:Update)=>dispatch({type:'amend',value}),reset:(value:Project)=>dispatch({type:'reset',value}),undo:()=>dispatch({type:'undo'}),redo:()=>dispatch({type:'redo'}),canUndo:!!s.past.length,canRedo:!!s.future.length};
}
