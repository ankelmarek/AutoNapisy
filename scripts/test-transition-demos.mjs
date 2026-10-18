import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL('../public/transition-demos/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
const catalog=readFileSync(new URL('../src/transitionCatalog.ts',import.meta.url),'utf8').split('as const;')[0];
const kinds=[...catalog.matchAll(/'([^']+)'/g)].map(m=>m[1]);
assert.deepEqual(Object.keys(manifest.clips),kinds);
assert.equal(manifest.duration,1.6);assert.equal(manifest.width,192);assert.equal(manifest.fps,30);
for(const [name,record] of Object.entries(manifest.clips)){
 const bytes=readFileSync(new URL(`${name}.mp4`,base));
 assert.equal(bytes.length,record.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
}
for(const [name,hash] of Object.entries(manifest.sources))assert.equal(createHash('sha256').update(readFileSync(new URL(`${name}.png`,base))).digest('hex'),hash);
console.log('Gallery integrity: 20 real FFmpeg clips and local A/B images: OK');
