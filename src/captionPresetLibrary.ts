import {z} from 'zod';
import {styleSchema} from './model';
import type {CaptionStyle} from './captions';
export const presetNameSchema=z.string().refine(n=>!/[\u0000-\u001f\u007f-\u009f]/.test(n),'Nazwa nie może zawierać znaków sterujących.').transform(n=>n.trim()).refine(n=>[...n].length>=1&&[...n].length<=60,'Nazwa musi mieć od 1 do 60 znaków.');
export const presetCatalogSchema=z.object({version:z.literal(1),revision:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),entries:z.array(z.object({id:z.string().regex(/^user-[0-9a-fA-F]{32}$/),name:presetNameSchema,style:styleSchema}).strict()).max(128)}).strict().superRefine((c,ctx)=>{if(new Set(c.entries.map(e=>e.id)).size!==c.entries.length||new Set(c.entries.map(e=>e.name.toLowerCase())).size!==c.entries.length)ctx.addIssue({code:'custom',message:'Powtórzone identyfikatory lub nazwy stylów.'});});
export type PresetCatalog=z.infer<typeof presetCatalogSchema>;
export type OwnCaptionPreset=PresetCatalog['entries'][number];
export type PresetMutation={kind:'create';name:string;style:CaptionStyle}|{kind:'rename'|'duplicate';id:string;name:string}|{kind:'delete';id:string};
