import {it,expect} from 'vitest';
import {newProject,parseProject} from '../src/model';
// Run the actual browser-test seed before any DOM operation. Catch fixture drift locally.
// @ts-expect-error Browser harness is plain JavaScript.
import {testEdit018} from '../scripts/test-edit018.mjs';
it('próbka przeglądarkowego testu Ripple pozostaje prawdziwym v10 po zmianie bieżącego modelu',async()=>{
 let seed:unknown;const stop=Symbol('seed captured');
 const page={evaluate:(fn:()=>unknown)=>{const host=globalThis as any,previous=host.window;host.window={__saved:newProject()};try{const value=fn();seed=host.window.__saved;return value;}finally{if(previous===undefined)delete host.window;else host.window=previous;}}};
 await expect(testEdit018(page,async()=>{throw stop;},1366,700)).rejects.toBe(stop);
 const legacy=seed as Record<string,unknown>;expect(legacy.schemaVersion).toBe(10);expect(legacy).not.toHaveProperty('masterAudio');expect(legacy).not.toHaveProperty('trackLayout');
 const loaded=parseProject(JSON.stringify(legacy));expect(loaded.schemaVersion).toBe(17);expect(loaded.masterAudio.gainDb).toBe(0);expect(loaded.rippleEnabled).toBe(true);expect(loaded.clips).toHaveLength(5);
});
