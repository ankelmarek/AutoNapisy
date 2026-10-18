import {it,expect} from 'vitest';
import fixture from './fixtures/ripple025.json';
import {newProject,projectSchema,serializeProject,parseProject} from '../src/model';
import {planEdit,type EditOperation} from '../src/ripple';
it.each(fixture.cases)('wspólny z Rust rzeczywisty miks Ripple: $name',sample=>{
 const clips=fixture.clips.map(c=>sample.detachLast&&c.id==='last'?{...c,audioDetached:true,audioRoute:'embedded',syncGroup:'pair'}:c);
 const p=projectSchema.parse({...newProject(),rippleEnabled:true,media:{path:'Film Łódź.mp4',name:'Film',duration:16},assets:[{id:'music',kind:'audio',path:'Muzyka Łódź.wav',name:'Muzyka',duration:16,segments:[]}],clips:[...clips,...sample.extra]});
 const r=planEdit(p,fixture.operation as EditOperation);expect(r.conflicts).toEqual([]);
 expect(Object.fromEntries(r.next.clips!.map(c=>[c.id,c.start]))).toEqual(sample.expectedStarts);
 for(const c of r.next.clips!)expect({...c,start:0}).toEqual({...p.clips!.find(x=>x.id===c.id),start:0});
 expect(parseProject(serializeProject(r.next)).clips).toEqual(r.next.clips);
});
