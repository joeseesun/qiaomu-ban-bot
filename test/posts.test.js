import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { Posts, xLength, checkMedia, nextSlot, blobChunk, chunkBytes, CHUNK } from '../src/posts.js';
const file=(name,type,size=10)=>new File([new Uint8Array(size)],name,{type});
test('weighted length counts CJK as two, links as 23 and Latin as one',()=>{
  assert.equal(xLength('hello'),5);
  assert.equal(xLength('你好'),4);
  assert.equal(xLength('看 https://example.com/a/very/long/path?with=query'),2+1+23);
  assert.equal(xLength('a'.repeat(280)),280);
  assert.equal(xLength('😀'),2);
});
test('media rules follow X: four images, or a single GIF or video, with size caps',()=>{
  assert.equal(checkMedia([],file('a.png','image/png')),'image');
  const four=Array.from({length:4},()=>({type:'image/png'}));
  assert.throws(()=>checkMedia(four,file('e.png','image/png')),/最多 4 张/);
  assert.throws(()=>checkMedia([{type:'image/png'}],file('v.mp4','video/mp4')),/1 个 GIF/);
  assert.throws(()=>checkMedia([{type:'video/mp4'}],file('a.png','image/png')),/1 个 GIF/);
  assert.throws(()=>checkMedia([],file('a.txt','text/plain')),/格式不支持/);
  assert.throws(()=>checkMedia([],{name:'big.png',type:'image/png',size:6*1024*1024}),/5 MB/);
  assert.throws(()=>checkMedia([],file('empty.png','image/png',0)),/空的/);
});
test('next slot skips past times, disabled weekdays and slots already taken',()=>{
  const mon9=new Date(2026,9,19,9,0).getTime();// Monday
  const slots={times:['09:00','21:00'],days:[1,3]};
  assert.equal(nextSlot(slots,[],mon9-3600000),mon9);
  assert.equal(nextSlot(slots,[mon9],mon9-3600000),new Date(2026,9,19,21,0).getTime());
  assert.equal(nextSlot(slots,[mon9,new Date(2026,9,19,21,0).getTime()],mon9-3600000),new Date(2026,9,21,9,0).getTime());
  assert.equal(nextSlot({times:[],days:[1]},[],mon9),0);
});
test('posts keep media blobs locally, release removed attachments and order by planned time',async()=>{
  const store=new Posts(new IDBFactory(),'posts');
  await assert.rejects(store.save({text:'  '}),/先写点内容/);
  const a=await store.addMedia(file('a.png','image/png',100));
  const draft=await store.save({text:'草稿',mediaIds:[a.id]});
  assert.equal(draft.status,'draft');assert.equal((await store.media(a.id)).size,100);
  const later=await store.save({text:'晚上',scheduledAt:Date.now()+7200000});
  const sooner=await store.save({text:'中午',scheduledAt:Date.now()+3600000});
  assert.equal(later.status,'queued');
  assert.deepEqual((await store.all()).map(p=>p.text),['中午','晚上','草稿']);
  await store.save({...draft,mediaIds:[]});assert.equal(await store.media(a.id),undefined,'detached media is deleted with the save');
  await assert.rejects(store.save({text:'x',mediaIds:['missing']}),/附件已丢失/);
  const b=await store.addMedia(file('b.png','image/png'));await store.update(sooner.id,{mediaIds:[b.id]});
  await store.remove(sooner.id);assert.equal(await store.media(b.id),undefined);
  const orphan=await store.addMedia(file('c.png','image/png'));
  assert.equal((await store.pruneMedia([],Date.now()+1)).removed,1);assert.equal(await store.media(orphan.id),undefined);
  await store.setSlots({times:['21:00','bad','09:00'],days:[9,1]});assert.deepEqual(await store.slots(),{times:['09:00','21:00'],days:[1]});
});
test('media travels in bounded base64 chunks and reassembles byte for byte',async()=>{
  const bytes=new Uint8Array(CHUNK+1234).map((_,i)=>i*7%256),blob=new Blob([bytes]);
  const parts=[];let offset=0;for(;;){const r=await blobChunk(blob,offset);parts.push(chunkBytes(r.data));offset=r.next;if(r.done)break;}
  assert.equal(parts.length,2);const joined=new Uint8Array(await new Blob(parts).arrayBuffer());assert.deepEqual(joined,bytes);
});
