import {describe,it,expect} from 'vitest';
import {newProject,applyTimelineTranscript,parseProject,serializeProject} from '../src/model';
import {applyTransition,timelineClips} from '../src/effects';
import {compositionSegments} from '../src/editing';
import {registerMedia,insertLibraryItem} from '../src/library';
import {transitionKinds} from '../src/transitionCatalog';
function project(){let p=registerMedia(newProject(),{path:'C:/Łódź/a.mp4',name:'Film',duration:10},'video');p=insertLibraryItem(p,'primary',0);p=insertLibraryItem(p,'primary',10);return p;}
const segment={id:'recognized',text:'Zażółć gęślą',start:11,end:12,words:[{text:'Zażółć',start:11,end:11.5},{text:'gęślą',start:11.5,end:12}],styleId:'default'};
describe('napisy z montażu',()=>{
 it('zapisuje wynik z czasami osi mimo aktywnego przejścia (regresja zgłoszenia)',()=>{const p=project();const t=applyTransition(p,p.clips![0].id,p.clips![1].id,'fade',.4);const updated=applyTimelineTranscript(t,[segment]);expect(updated.transitions).toEqual(t.transitions);expect(updated.clips).toEqual(t.clips);expect(compositionSegments(updated)[0]).toMatchObject({start:11,end:12,text:segment.text});expect(parseProject(serializeProject(updated)).timelineSegments).toEqual([segment]);});
 it('nie ogranicza napisów montażu do długości pierwszego źródła',()=>{const p=applyTimelineTranscript(project(),[{...segment,start:17,end:18,words:[]}]);expect(compositionSegments(p)[0].start).toBe(17);expect(p.segments).toEqual([]);});
 it('pusty wynik zastępuje poprzednie napisy montażu',()=>{const p=applyTimelineTranscript(project(),[segment]);expect(compositionSegments(applyTimelineTranscript(p,[]))).toEqual([]);});
 it('odrzuca błędny wynik bez mutowania poprzedniego projektu',()=>{const p=project();expect(()=>applyTimelineTranscript(p,[{...segment,start:-1}])).toThrow();expect(p.timelineSegments).toBe(null);});
 it('po skróceniu montażu zachowuje dane, ale nie pokazuje napisów poza filmem',()=>{const p=applyTimelineTranscript(project(),[segment]);p.clips=p.clips!.slice(0,1);expect(compositionSegments(p)).toEqual([]);expect(parseProject(serializeProject(p)).timelineSegments).toHaveLength(1);});
});
describe('galeria i przejścia FFmpeg',()=>{
 it('wszystkie 20 typów przechodzą walidację',()=>{for(const kind of transitionKinds){const p=project();expect(parseProject(serializeProject(applyTransition(p,p.clips![0].id,p.clips![1].id,kind,.4))).transitions[0].kind).toBe(kind);}});
 it('pasek przejścia obejmuje końcówkę pierwszego i początek drugiego obrazu',()=>{const p=project(),t=applyTransition(p,p.clips![0].id,p.clips![1].id,'fade',1),[a,b]=timelineClips(t);expect(a.start+a.sourceOut-a.sourceIn).toBe(9.5);expect(b.start).toBe(9.5);expect(b.sourceIn).toBe(.5);});
 it('migracja v5 zastępuje stare implementacje odpowiednikami FFmpeg',()=>{const p=project(),old={...applyTransition(p,p.clips![0].id,p.clips![1].id,'slideleft',.4),schemaVersion:5};old.transitions[0].kind='left' as never;expect(parseProject(JSON.stringify(old)).transitions[0].kind).toBe('slideleft');});
 it('upuszczenie na wskazany pas respektuje go i dosuwa do dostępnego miejsca',()=>{const p=project();const added=insertLibraryItem(p,'primary',5,1);expect(added.clips!.at(-1)).toMatchObject({track:1,start:5});const next=insertLibraryItem(p,'primary',8,0);expect(next.clips!.at(-1)).toMatchObject({track:0,start:20});});
});
