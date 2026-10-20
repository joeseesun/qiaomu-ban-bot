import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine.js';
import { MemoryAnnotations } from '../src/annotations.js';
const item=(id='1',handle='alice',userId='123')=>({id,handle,author:{userId},kind:'reply',text:'这条回复用于验证账号选择。'});
function fixture(saved={banbot:{apiKey:'fixture'}}) {
  let data=structuredClone(saved),calls=0,community=0;
  const storage={get:async()=>structuredClone(data),set:async v=>{data=structuredClone(v);}};
  const request=async()=>{calls++;return{model:'fixture',scores:{ai_written:.99,spam:.01,useful:.2},inputTokens:0,analyzedAt:Date.now()};};
  const engine=new Engine(storage,request);
  engine.communityEvidence=async()=>{community++;return null;};
  return{engine,storage,request,calls:()=>calls,community:()=>community};
}
test('self, human and AI account choices bypass model and community, even on force requests',async()=>{
  const f=fixture(),e=f.engine;
  assert.equal((await e.classify(item(),true,'alice')).account,'self');
  await e.learn(item(),'human');
  assert.equal((await e.classify(item('2'),true)).override,'keep');
  await e.learn(item('3'),'ai');
  assert.equal((await e.classify({...item('4'),kind:'post'},true)).override,'hide');
  assert.equal((await e.classify(item('5'),true,'alice')).override,'keep');
  assert.equal(f.calls(),0);assert.equal(f.community(),0);
});
test('choices survive restart and renames without matching a different known account ID',async()=>{
  const f=fixture();await f.engine.learn(item(),'ai');
  const reload=new Engine(f.storage,f.request,f.engine.annotations);
  assert.equal((await reload.classify(item('2','renamed'))).account,'ai');
  assert.equal((await reload.classify(item('3','alice','456'))).account,undefined);
  assert.equal(f.calls(),1);
  await reload.listAction('renamed','allow','123');
  assert.equal((await reload.classify(item('4','new_name'))).account,'human');
  assert.equal(f.calls(),1);
});
test('restore display and resume automatic detection do not reapply old labels after restart',async()=>{
  const f=fixture();await f.engine.learn(item(),'ai');
  await f.engine.listAction('alice','allow');
  assert.equal((await f.engine.classify(item())).override,'keep');
  await f.engine.listAction('alice','remove');
  const reload=new Engine(f.storage,f.request,f.engine.annotations);
  assert.equal((await reload.classify(item())).account,undefined);
  assert.equal(f.calls(),1);
  assert.equal((await reload.snapshot(true)).learningCount,1);
});
test('high model predictions never become persistent account rules',async()=>{
  const f=fixture();await f.engine.classify(item());await f.engine.classify(item('2'));
  assert.equal(f.calls(),2);assert.deepEqual((await f.engine.snapshot()).settings.accountRules,[]);
});
test('legacy migration covers history beyond recent examples, takes latest choice, and runs once',async()=>{
  const labels=new MemoryAnnotations();
  await labels.migrate(Array.from({length:65},(_,n)=>({...item(String(n+1),'person'+n,String(n+100)),key:'k'+n,label:'ai',at:n+1})));
  await labels.put({...item('66','person0','100'),key:'newest',label:'human',at:100});
  let data={banbot:{}};
  const storage={get:async()=>data,set:async v=>{data=structuredClone(v);}};
  let e=new Engine(storage,()=>{throw Error('must not call');},labels);
  assert.equal((await e.snapshot()).settings.accountRules.length,65);
  assert.equal((await e.classify(item('900','person0','100'))).account,'human');
  await e.listAction('person0','remove');
  e=new Engine(storage,undefined,labels);
  assert.equal((await e.localDecision(item('66','person0','100'))).account,undefined);
});
test('label change rejects an already running model response for another post by that author',async()=>{
  let started,release;
  const entered=new Promise(r=>started=r);
  const f=fixture();f.engine.request=async()=>{started();return new Promise(r=>release=r);};
  const pending=f.engine.classify(item('2'));await entered;
  await f.engine.learn(item(),'human');
  release({model:'fixture',scores:{ai_written:1},inputTokens:0});
  assert.deepEqual(await pending,{skipped:'changed'});
  assert.equal((await f.engine.classify(item('2'))).account,'human');
});
test('owner/settings changes during evidence lookup cannot launch a stale model request',async()=>{
  const f=fixture();let release,entered;
  const started=new Promise(r=>entered=r);
  f.engine.communityEvidence=async()=>{entered();await new Promise(r=>release=r);};
  const pending=f.engine.classify(item());await started;
  f.engine.revision++;release();
  assert.deepEqual(await pending,{skipped:'changed'});assert.equal(f.calls(),0);
});
