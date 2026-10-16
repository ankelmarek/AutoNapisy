import {beforeEach,describe,expect,it,vi} from 'vitest';
const {invoke,frame,fonts}=vi.hoisted(()=>({invoke:vi.fn(),frame:vi.fn(),fonts:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke,convertFileSrc:vi.fn()}));
vi.mock('../src/captionCanvas',()=>({ensureCaptionFonts:fonts,createFrameRenderer:()=>frame}));
import {rendering,type ExportStatus} from '../src/rendering';
import {newProject} from '../src/model';
const project=()=>{const p=newProject();p.media={path:'C:/Łódź/film.mp4',name:'film',duration:3};p.segments=[{id:'a',text:'Żółty tekst',start:0,end:2,words:[],styleId:'default'}];return p;};
const status=(state:ExportStatus['state'],extra:Partial<ExportStatus>={}):ExportStatus=>({id:9,state,message:'test fixture',progress:0,outputPath:null,exportInfo:{width:1280,height:720,duration:3,frames:1,received:0,outputPath:'C:/Wynik.mp4'},...extra});
beforeEach(()=>{invoke.mockReset();frame.mockReset().mockResolvedValue('TEST_PNG_BASE64');fonts.mockReset().mockResolvedValue(undefined);});
describe('eksport MP4',()=>{
 it('przekazuje kopię projektu, plansze i uruchamia kontrolowaną komendę',async()=>{
  invoke.mockImplementation(async(cmd:string)=>{if(cmd==='begin_video_export')return 9;if(cmd==='transcription_status')return invoke.mock.calls.some(c=>c[0]==='finish_export_frames')?status('completed',{outputPath:'C:/Wynik.mp4'}):status('awaiting_frames');if(cmd==='upload_export_frame')return status('awaiting_frames');});
  const p=project(),before=JSON.stringify(p);expect(await rendering.render(p)).toBe('C:/Wynik.mp4');expect(JSON.stringify(p)).toBe(before);
  expect(invoke).toHaveBeenCalledWith('upload_export_frame',{id:9,index:0,png:'TEST_PNG_BASE64'});expect(invoke).toHaveBeenCalledWith('finish_export_frames',{id:9});expect(frame).toHaveBeenCalled();
 });
 it('anulowanie dialogu nie uruchamia eksportu',async()=>{invoke.mockResolvedValue(null);expect(await rendering.render(project())).toBe(null);expect(frame).not.toHaveBeenCalled();});
 it('odrzuca brak filmu lub napisów',async()=>{await expect(rendering.render(newProject())).rejects.toThrow('Zaimportuj');expect(invoke).not.toHaveBeenCalled();});
 it('błąd backendu nie jest udawanym sukcesem',async()=>{invoke.mockResolvedValueOnce(9).mockResolvedValueOnce(status('failed',{message:'Brak kodeka H.264'})).mockResolvedValue(undefined);await expect(rendering.render(project())).rejects.toThrow('Brak kodeka');expect(invoke).toHaveBeenCalledWith('cancel_video_export',{id:9});});
 it('anulowany sygnał nie otwiera dialogu',async()=>{const controller=new AbortController();controller.abort();await expect(rendering.render(project(),controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(invoke).not.toHaveBeenCalled();});
 it('anulowanie podczas przygotowania wysyła cancel bez finish',async()=>{const controller=new AbortController();invoke.mockImplementation(async(cmd:string)=>{if(cmd==='begin_video_export')return 9;if(cmd==='transcription_status')return status('awaiting_frames');});frame.mockImplementation(async()=>{controller.abort();return 'PNG';});await expect(rendering.render(project(),controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(invoke).toHaveBeenCalledWith('cancel_video_export',{id:9});expect(invoke.mock.calls.some(c=>c[0]==='finish_export_frames')).toBe(false);});
 it('zakończenie zapisu wygrywa z późnym anulowaniem',async()=>{const controller=new AbortController();invoke.mockImplementation(async(cmd:string)=>{if(cmd==='begin_video_export')return 9;if(cmd==='transcription_status'){controller.abort();return status('completed',{outputPath:'C:/Wynik.mp4'});}});expect(await rendering.render(project(),controller.signal)).toBe('C:/Wynik.mp4');});
});
