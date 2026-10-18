import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { IndexedAnnotations } from '../src/annotations.js';
import { Engine } from '../src/engine.js';
const entry=n=>({key:String(n).padStart(8,'0'),id:String(n),handle:'fixture',kind:'reply',text:'独立测试记录 '+n,parent:'',label:n%2?'human':'ai',at:1000+Math.floor(n/3)});
test('10,000 annotations use indexed pages, preserve history and migrate only once',async()=>{
  const factory=new IDBFactory(),store=new IndexedAnnotations(factory,IDBKeyRange,'large');
  await store.migrate(Array.from({length:10000},(_,n)=>entry(n)));
  assert.deepEqual(await store.stats(),{total:10000,ai:5000,human:5000,revision:1});
  const db=await store.ready;
  // A page must not load the full history, even when the store is large.
  const objectStore=db.transaction('annotations').objectStore('annotations');
  const proto=Object.getPrototypeOf(objectStore),old=proto.getAll;
  proto.getAll=()=>{throw Error('unbounded history read');};
  try{
    const first=await store.page(),second=await store.page({before:first.next});
    assert.equal(first.items.length,20);assert.equal(second.items.length,20);
    assert.equal(new Set([...first.items,...second.items].map(e=>e.key)).size,40);
    const human=await store.page({label:'human'});assert.equal(human.items.length,20);assert.ok(human.items.every(e=>e.label==='human'));
    assert.equal((await store.recent()).length,40);
    await store.remove(first.items[0].key);await store.migrate([first.items[0]]);
    assert.equal(await store.get(first.items[0].key),undefined);
    const reopened=new IndexedAnnotations(factory,IDBKeyRange,'large');assert.equal((await reopened.stats()).total,9999);(await reopened.ready).close();
  }finally{proto.getAll=old;db.close();}
});
test('older labels remain effective beyond the 40-example prompt pool and survive reload',async()=>{
  let saved={banbot:{apiKey:'fixture'}},calls=0;
  const factory=new IDBFactory(),archive=new IndexedAnnotations(factory,IDBKeyRange,'engine');
  const storage={get:async()=>structuredClone(saved),set:async value=>{saved=structuredClone(value);}};
  const engine=new Engine(storage,async()=>{calls++;return{};},archive);
  for(let n=0;n<65;n++)await engine.learn(entry(n),'human');
  assert.equal((await engine.snapshot()).learningCount,65);
  assert.equal((await engine.snapshot(true)).learning.length,40);
  assert.equal(saved.banbot.learning,undefined,'daily statistics writes must not rewrite annotation text');
  assert.equal((await engine.classify(entry(0))).override,'keep');assert.equal(calls,0);
  const reloaded=new Engine(storage,async()=>{calls++;return{};},new IndexedAnnotations(factory,IDBKeyRange,'engine'));
  assert.equal((await reloaded.classify(entry(0))).annotation,'human');
  assert.equal((await reloaded.annotationPage()).items.length,20);
  await reloaded.clearHistory();assert.equal((await archive.stats()).total,0);
  (await archive.ready).close();(await reloaded.annotations.ready).close();
});
test('account ranking adjusts on relabel, undo, concurrent writes and deletion',async()=>{
  const store=new IndexedAnnotations(new IDBFactory(),IDBKeyRange,'authors');await store.migrate();
  await Promise.all(Array.from({length:25},(_,n)=>store.put({...entry(n),handle:n<23?'alice':'bob',displayName:n<23?'Alice / 艾丽丝':'Bob',label:n===24?'human':'ai'})));
  let ai=await store.authorPage();assert.equal(ai.items[0].handle,'alice');assert.equal(ai.items[0].ai,23);assert.equal(ai.items[0].displayName,'Alice / 艾丽丝');
  await store.put({...entry(0),handle:'alice',displayName:'Alice 新昵称',at:9999,label:'human'});
  ai=await store.authorPage();assert.equal(ai.items[0].ai,22);assert.equal(ai.items[0].human,1);assert.equal(ai.items[0].displayName,'Alice 新昵称');
  await store.remove(entry(0).key);assert.equal((await store.authorPage({label:'human'})).items.length,1);
  await store.remove(entry(23).key);assert.equal((await store.authorPage()).items.length,1);
  await store.remove(entry(24).key);assert.equal((await store.authorPage({label:'human'})).items.length,0);
  await store.clear();assert.equal((await store.authorPage()).items.length,0);(await store.ready).close();
});
test('version 1 upgrade preserves every annotation and builds stable indexed account pages',async()=>{
  const factory=new IDBFactory();
  await new Promise((resolve,reject)=>{const req=factory.open('old',1);req.onupgradeneeded=()=>{
    const rows=req.result.createObjectStore('annotations',{keyPath:'key'});rows.createIndex('time',['at','key']);rows.createIndex('labelTime',['label','at','key']);rows.createIndex('label','label');
    const meta=req.result.createObjectStore('meta');meta.put(true,'migrated');meta.put(19,'revision');
    for(let n=0;n<45;n++)rows.put({...entry(n),handle:'reader_'+n,label:'human'});
  };req.onsuccess=()=>{req.result.close();resolve();};req.onerror=()=>reject(req.error);});
  const store=new IndexedAnnotations(factory,IDBKeyRange,'old');await store.migrate([entry(999)]);
  assert.deepEqual(await store.stats(),{total:45,ai:0,human:45,revision:19});
  const db=await store.ready,proto=Object.getPrototypeOf(db.transaction('authors').objectStore('authors')),old=proto.getAll;
  proto.getAll=()=>{throw Error('ranking must not read the full archive');};
  try{const first=await store.authorPage({label:'human'}),second=await store.authorPage({label:'human',before:first.next}),third=await store.authorPage({label:'human',before:second.next});
    assert.equal(first.items.length,20);assert.equal(second.items.length,20);assert.equal(third.items.length,5);assert.equal(third.next,null);assert.equal(new Set([...first.items,...second.items,...third.items].map(a=>a.handle)).size,45);
    assert.equal((await store.authorPage({label:'ai'})).items.length,0);assert.equal(first.items[0].displayName,'');
  }finally{proto.getAll=old;db.close();}
});

test('reading an old labelled post fills its name without changing labels, counts or prompt revision',async()=>{
  const archive=new IndexedAnnotations(new IDBFactory(),IDBKeyRange,'names'),engine=new Engine({get:async()=>({banbot:{apiKey:'fixture'}}),set:async()=>{}},async()=>{throw Error('must not call model');},archive);
  await engine.learn(entry(1),'human');const before=await archive.stats();
  const result=await engine.classify({...entry(1),displayName:'现在可见的昵称'});
  assert.equal(result.annotation,'human');assert.deepEqual(await archive.stats(),before);assert.equal((await engine.authorPage({label:'human'})).items[0].displayName,'现在可见的昵称');
  await archive.remove((await engine.annotationPage()).items[0].key);
  await archive.rememberName(entry(1).key,'不能复活');assert.equal((await archive.stats()).total,0);(await archive.ready).close();
});
