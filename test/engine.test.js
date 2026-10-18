import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
const item = id => ({ id:String(id),handle:'alice',kind:'reply',text:'这是一条用来验证调度和缓存的回复。',metrics:{} });
const result = () => ({ model:'fixture',scores:{ai_written:.95,low_value:.5,useful:.2,spam:.1},inputTokens:100,analyzedAt:Date.now() });
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function setup(request) { let saved={banbot:{apiKey:'fixture',settings:{dailyLimit:300}}};const storage={get:async()=>structuredClone(saved),set:async data=>{saved=structuredClone(data);}};return {engine:new Engine(storage,request),saved:()=>saved}; }
test('concurrent identical requests call provider once and persist statistics',async()=>{
  let calls=0;const {engine,saved}=setup(async()=>{calls++;await sleep(10);return result();});
  const responses=await Promise.all(Array.from({length:10},()=>engine.classify(item(1))));
  assert.equal(calls,1);assert.equal(responses.length,10);assert.equal(saved().banbot.stats.requests,1);
  const cached=await engine.classify(item(1));assert.equal(cached.cached,true);assert.equal(calls,1);
});
test('provider concurrency and daily quota are bounded across parallel callers',async()=>{
  let active=0,max=0,calls=0;const {engine}=setup(async()=>{active++;calls++;max=Math.max(max,active);await sleep(5);active--;return result();});
  await engine.updateSettings({dailyLimit:5});
  const responses=await Promise.allSettled(Array.from({length:12},(_,i)=>engine.classify(item(i))));
  assert.ok(max<=3);assert.equal(calls,5);assert.equal(responses.filter(r=>r.status==='rejected').length,7);
});
test('settings change during model call prevents stale cache or UI output',async()=>{
  let release,started;const start=new Promise(r=>started=r);const {engine,saved}=setup(async()=>{started();return new Promise(r=>release=r);});
  const pending=engine.classify(item(1));await start;await engine.updateSettings({customRule:'different'});release(result());
  assert.deepEqual(await pending,{skipped:'changed'});assert.equal(Object.keys(saved().banbot.cache).length,0);
});
test('failure is not cached as clean, and a 429 causes cooldown',async()=>{
  let calls=0;const {engine,saved}=setup(async()=>{calls++;const error=new Error('fixture limit');error.status=429;throw error;});
  await assert.rejects(engine.classify(item(1)),/fixture limit/);await assert.rejects(engine.classify(item(2)),/冷却/);
  assert.equal(calls,1);assert.equal(Object.keys(saved().banbot.cache).length,0);assert.equal(saved().banbot.stats.errors,1);
});
test('feedback, allowlist and blocklist avoid further model calls',async()=>{
  let calls=0;const {engine}=setup(async()=>{calls++;return result();});
  await engine.feedback(item(1),'keep');assert.deepEqual(await engine.classify(item(1)),{override:'keep'});
  await engine.listAction('alice','allow');assert.deepEqual(await engine.classify(item(2)),{local:true});
  await engine.listAction('alice','block');assert.deepEqual((await engine.snapshot()).settings.allowlist,[]);assert.equal(calls,0);
});
test('snapshot never discloses credentials; provider changes clear old key',async()=>{
  const {engine}=setup(async()=>result());
  assert.equal(JSON.stringify(await engine.snapshot(true)).includes('fixture'),false);
  await engine.updateSettings({provider:'typesafe'});assert.equal((await engine.snapshot()).configured,false);
  await assert.rejects(engine.classify(item(1)),/API Key/);
});
test('concurrent list edits preserve every author and partial preferences preserve lists',async()=>{
  const {engine}=setup(async()=>result());
  await Promise.all(['alice','bob','carol'].map(h=>engine.listAction(h,'allow')));
  await engine.updateSettings({enabled:false});
  assert.deepEqual((await engine.snapshot()).settings.allowlist,['alice','bob','carol']);
});
