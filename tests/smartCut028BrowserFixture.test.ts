import {it,expect} from 'vitest';
import {newProject,parseProject} from '../src/model';
import {planSmartCut,smoothSmartCut,smartCutWindow,type SmartCutRequest} from '../src/smartCut';
import fixture from './fixtures/smartcut028.json';
// @ts-expect-error Shared actual native/browser seed.
import {smartCut028Fixture} from '../scripts/smartcut-fixture028.mjs';
it('rzeczywisty seed SmartCut dla WebView2 jest poprawnym projektem i nie udaje wyniku transkrypcji',()=>{const p=parseProject(JSON.stringify(smartCut028Fixture(newProject())));expect(p.schemaVersion).toBe(15);expect(p.clips).toHaveLength(2);expect(p.timelineSegments![0].words).toHaveLength(6);expect(p.clips![0].audio!.points).toHaveLength(1);});
it('wspólna próbka silników jest dokładnym wynikiem produkcyjnego planu TS',()=>{const p=parseProject(JSON.stringify(fixture.input)),plan=planSmartCut(p,fixture.request as SmartCutRequest,fixture.options),smooth=smoothSmartCut(plan,fixture.options);expect(plan.conflicts).toEqual([]);expect(smooth.conflicts).toEqual([]);expect(JSON.parse(JSON.stringify(plan.next))).toEqual(parseProject(JSON.stringify(fixture.exact)));expect(JSON.parse(JSON.stringify(smooth.next))).toEqual(parseProject(JSON.stringify(fixture.smooth)));expect(JSON.parse(JSON.stringify(smartCutWindow(smooth.next,2).project))).toEqual(parseProject(JSON.stringify(fixture.window)));});
