import {describe,it,expect} from 'vitest';
import {newProject,parseProject,serializeProject,formatTime} from '../src/model';
import {synchronization,transcription,rendering} from '../src/adapters';
describe('projekty',()=>{
 it('zapisuje i otwiera Unicode bez utraty danych',()=>{const p=newProject();p.name='Zażółć 🎬';p.media={path:'C:\\Filmy\\Łódź 🎬.mp4',name:'Łódź 🎬.mp4',duration:20};expect(parseProject(serializeProject(p))).toEqual({...p,updatedAt:expect.any(String)});});
 it('wymaga stylu domyślnego',()=>{const p=newProject();p.styles={};expect(()=>serializeProject(p)).toThrow();});
 it('odrzuca przyszłe wersje i błędny JSON',()=>{expect(()=>parseProject('{')).toThrow();expect(()=>parseProject(JSON.stringify({...newProject(),schemaVersion:2}))).toThrow();});
 it('odrzuca ujemne czasy i nieznane style',()=>{const p=newProject();p.segments=[{id:'a',text:'tekst',start:-1,end:2,words:[],styleId:'missing'}];expect(()=>serializeProject(p)).toThrow();});
 it('odrzuca słowa poza segmentem',()=>{const p=newProject();p.segments=[{id:'a',text:'tekst',start:0,end:1,words:[{text:'tekst',start:0,end:2}],styleId:'default'}];expect(()=>serializeProject(p)).toThrow();});
 it('odrzuca duplikaty oraz segment poza filmem',()=>{const p=newProject();p.media={path:'C:/a.mp4',name:'a',duration:1};p.segments=[{id:'a',text:'x',start:0,end:2,words:[],styleId:'default'}];expect(()=>serializeProject(p)).toThrow();p.media=null;p.segments.push(p.segments[0]);expect(()=>serializeProject(p)).toThrow();});
 it('formuje czas i synchronizuje granice',()=>{expect(formatTime(65.9)).toBe('01:05');const p=newProject();p.segments=[{id:'a',text:'x',start:1,end:2,words:[],styleId:'default'}];expect(synchronization.activeSegments(p,1)).toHaveLength(1);expect(synchronization.activeSegments(p,2)).toHaveLength(0);});
 it('nie zwraca fikcyjnej transkrypcji ani eksportu',async()=>{await expect(transcription.transcribe({path:'x',name:'x'})).rejects.toThrow();await expect(rendering.render(newProject())).rejects.toThrow();});
});
