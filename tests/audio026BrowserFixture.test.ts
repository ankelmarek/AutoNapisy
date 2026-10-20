import {it,expect} from 'vitest';
import {newProject,parseProject} from '../src/model';
// @ts-expect-error Shared browser/native harness is plain JavaScript.
import {audio026Fixture} from '../scripts/test-audio026.mjs';
it('próbka rzeczywistych testów audio 0.26 pozostaje poprawnym v12 i nie zależy od poprzednich torów',()=>{
 const p=audio026Fixture({...newProject(),media:{path:'Film Łódź.mp4',name:'Film',duration:8}}),loaded=parseProject(JSON.stringify(p));expect(loaded.clips).toHaveLength(3);expect(loaded.trackLayout).toHaveLength(4);expect(loaded.clips![0].audioRoute).toBe('A1');expect(loaded.schemaVersion).toBe(17);
});
