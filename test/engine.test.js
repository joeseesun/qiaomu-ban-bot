import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
const item = id => ({ id:String(id),handle:'alice',kind:'reply',text:'这是一条用来验证调度和缓存的回复。',metrics:{} });
const result = () => ({ model:'fixture',scores:{ai_written:.95,useful:.2,spam:.1},inputTokens:100,analyzedAt:Date.now() });
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function setup(request) { let saved={banbot:{apiKey:'fixture',settings:{dailyLimit:300}}};const storage={get:async()=>structuredClone(saved),set:async data=>{saved=structuredClone(data);}};return {engine:new Engine(storage,request),saved:()=>saved}; }
test('retired filter migrates safely while credentials and human annotations survive',async()=>{
  const {engine,saved}=setup(async()=>result());await engine.learn(item(1),'human');
  const old=saved();old.banbot.settings.filterMode='low-value';old.banbot.cacheVersion=3;
  old.banbot.cache={legacy:{result:{scores:{low_value:.99}}}};
  const upgraded=new Engine({get:async()=>old,set:async()=>{}},async()=>{throw Error('Migration must not call the model');},engine.annotations);
  const snapshot=await upgraded.snapshot(true);
  assert.equal(snapshot.settings.filterMode,'label');assert.equal(snapshot.configured,true);
  assert.equal(snapshot.cacheSize,0);assert.equal(snapshot.learningCount,1);
  assert.equal((await upgraded.classify(item(1))).annotation,'human');
  assert.equal((await upgraded.classify(item(1))).override,'keep');
});
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
  await engine.listAction('alice','allow');assert.equal((await engine.classify(item(2))).account,'human');
  await engine.listAction('alice','block');assert.deepEqual((await engine.snapshot()).settings.allowlist,[]);assert.equal(calls,0);
});
test('snapshot never discloses credentials; provider changes clear old key',async()=>{
  const {engine}=setup(async()=>result());
  assert.equal(JSON.stringify(await engine.snapshot(true)).includes('fixture'),false);
  await engine.updateSettings({provider:'magpie'});assert.equal((await engine.snapshot()).configured,false);
  await assert.rejects(engine.classify(item(1)),/API Key/);
});
test('concurrent list edits preserve every author and partial preferences preserve lists',async()=>{
  const {engine}=setup(async()=>result());
  await Promise.all(['alice','bob','carol'].map(h=>engine.listAction(h,'allow')));
  await engine.updateSettings({enabled:false});
  assert.deepEqual((await engine.snapshot()).settings.allowlist,['alice','bob','carol']);
});
test('one click validates a real model response before saving the candidate credentials',async()=>{
  let calls=0;const {engine,saved}=setup(async(i,s,key)=>{calls++;assert.equal(key,'candidate');assert.ok(i.text);assert.equal(saved().banbot.apiKey,'fixture');return result();});
  const snapshot=await engine.connect({provider:'magpie'},'candidate');
  assert.equal(calls,1);assert.equal(snapshot.configured,true);assert.ok(snapshot.connection.verifiedAt);assert.equal(saved().banbot.apiKey,'candidate');
  assert.equal(JSON.stringify(snapshot).includes('candidate'),false);
});
test('failed connection validation preserves the previous working setup',async()=>{
  const {engine,saved}=setup(async()=>{throw new Error('unauthorized');});
  await assert.rejects(engine.connect({provider:'magpie'},'wrong'),/unauthorized/);
  assert.equal(saved().banbot.apiKey,'fixture');assert.equal((await engine.snapshot()).settings.provider,'typesafe');
});
test('user labels affect later requests, invalidate cached decisions, and can be removed',async()=>{
  const requests=[];const {engine}=setup(async(i,s)=>{requests.push(structuredClone(s));return result();});
  await engine.classify(item(2));
  await engine.learn({...item(1),text:'作为人工智能语言模型，我不能执行此请求。'},'ai');
  assert.equal((await engine.classify({...item(1),text:'作为人工智能语言模型，我不能执行此请求。'})).override,'hide');
  await engine.classify({...item(2),handle:'another'});assert.equal(requests.length,2);assert.equal(requests[1].examples[0].label,'ai');
  const snapshot=await engine.snapshot(true);assert.equal(snapshot.learning.length,1);
  assert.equal((await engine.snapshot()).learning,undefined);
  await engine.removeExample(snapshot.learning[0].key);assert.equal((await engine.snapshot(true)).learning.length,0);
  assert.equal((await engine.localDecision(item(1))).override,undefined);
});
test('negative labels retain short replies and bound the personalization examples',async()=>{
  let examples;const {engine}=setup(async(i,s)=>{examples=s.examples;return result();});
  for(let n=0;n<45;n++)await engine.learn({...item(n),text:'谢谢，已解决。'},n%2?'ai':'human');
  assert.equal((await engine.classify({...item(44),text:'谢谢，已解决。'})).override,'keep');
  await engine.classify({...item(100),handle:'another'});assert.ok(examples.length<=6);assert.ok((await engine.snapshot(true)).learning.length<=40);
});
test('clear history removes examples while preserving account choices',async()=>{
  const {engine}=setup(async()=>result());await Promise.all([engine.learn(item(1),'ai'),engine.clearHistory()]);
  assert.equal((await engine.snapshot(true)).learning.length,0);assert.equal((await engine.localDecision(item(1))).account,'ai');
});
test('explicit human labels survive provider and semantic-rule changes',async()=>{
  const {engine}=setup(async()=>result());await engine.learn(item(1),'human');
  await engine.updateSettings({provider:'typesafe',customRule:'hide unrelated ads'});
  assert.equal((await engine.classify(item(1))).override,'keep');
});
test('AI to human to unset persists one label and preserves the original model score',async()=>{
  const {engine,saved}=setup(async()=>result());await engine.classify(item(1));
  await engine.learn(item(1),'ai');await engine.learn(item(1),'human');
  const labeled=await engine.classify(item(1));
  assert.equal(labeled.annotation,'human');assert.equal(labeled.scores.ai_written,.95);assert.equal(labeled.override,'keep');
  assert.equal((await engine.snapshot(true)).learning.length,1);
  const reloaded=new Engine({get:async()=>saved(),set:async()=>{}},undefined,engine.annotations);
  assert.equal((await reloaded.localDecision(item(1))).annotation,'human');
  await engine.learn(item(1),null);assert.deepEqual(await engine.localDecision(item(1)),{});
  assert.equal((await engine.snapshot(true)).learning.length,0);
});
test('failed label removal rolls back the sample and override',async()=>{
  let fail=false,data={banbot:{apiKey:'fixture'}};
  const engine=new Engine({get:async()=>data,set:async value=>{if(fail)throw Error('disk');data=structuredClone(value);}},async()=>result());
  await engine.learn(item(1),'human');fail=true;
  await assert.rejects(engine.learn(item(1),null),/未保存/);
  assert.equal((await engine.localDecision(item(1))).annotation,'human');
});
test('10,000 daily requests by default, legacy default migrates, explicit values remain',async()=>{
  for(const [settings,expected] of [[undefined,10000],[{dailyLimit:300},10000],[{dailyLimit:1500},1500],[{dailyLimit:10000},10000],[{dailyLimit:50000},50000]]){
    const engine=new Engine({get:async()=>({banbot:{settings}}),set:async()=>{}});
    assert.equal((await engine.snapshot()).settings.dailyLimit,expected);
  }
  const {engine,saved}=setup(async()=>result());await engine.updateSettings({dailyLimit:300});
  const reload=new Engine({get:async()=>saved(),set:async()=>{}},undefined,engine.annotations);
  assert.equal((await reload.snapshot()).settings.dailyLimit,300);
});
test('old 90% default becomes 50% once and custom thresholds survive',async()=>{
  for(const [saved,expected] of [[{settings:{threshold:.9}},.5],[{settings:{threshold:.85}},.85],[{settings:{threshold:.9},thresholdVersion:1},.9]]) {
    const engine=new Engine({get:async()=>({banbot:saved}),set:async()=>{}});
    assert.equal((await engine.snapshot()).settings.threshold,expected);
  }
});

test('explicit re-prediction bypasses a fresh cache while still respecting the daily budget',async()=>{
  let calls=0;const {engine}=setup(async()=>{calls++;return result();});await engine.updateSettings({dailyLimit:2});
  await engine.classify(item(1));assert.equal((await engine.classify(item(1))).cached,true);assert.equal(calls,1);
  const fresh=await engine.classify(item(1),true);assert.equal(fresh.cached,undefined);assert.equal(calls,2);
  await assert.rejects(engine.classify(item(1),true),/今日请求上限/);assert.equal(calls,2);
});
