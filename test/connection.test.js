import test from 'node:test';
import assert from 'node:assert/strict';
import {PROVIDERS,resolveConnection} from '../src/connection.js';
import {DEFAULTS,normalizeSettings,cacheKey} from '../src/core.js';
import {analyze} from '../src/jev.js';
import {Engine} from '../src/engine.js';
const item={id:'321',handle:'reader',kind:'reply',text:'我测试过了，重启后恢复正常。',parent:'',metrics:{}};
const answer={model:'fixture-jev',scores:{ai_written:.2,low_value:.1,useful:.8,spam:0}};
test('documented Jev presets and custom bases use typed decisions, with the selected model',async()=>{
  const expected={magpie:'https://magpie.qiaomu.ai/v1/systemone',typesafe:'https://api.typesafe.ai/v1/systemone',openrouter:'https://openrouter.ai/api/alpha/decisions',vercel:'https://ai-gateway.vercel.sh/typesafe/v1/systemone',custom:'https://fixture.example/proxy/v1/systemone'};
  for(const provider of Object.keys(PROVIDERS)){
    const s=normalizeSettings({...DEFAULTS,provider,...provider==='custom'?{baseURL:'https://fixture.example/proxy/v1/',model:'custom/jev'}:{}});
    await analyze(item,s,'test-key',async(url,init)=>{
      assert.equal(url,expected[provider]);const payload=JSON.parse(init.body);assert.equal(payload.model,s.model);assert.equal(payload.questions.ai_written.type,'noul');assert.equal(payload.messages,undefined);
      return Response.json({model:s.model,answers:Object.fromEntries(Object.keys(payload.questions).map(k=>[k,{type:'noul',noul:.2}]))});
    });
  }
  assert.equal(resolveConnection({provider:'custom',baseURL:'http://127.0.0.1:3456/v1/systemone',model:'jev'}).endpoint,'http://127.0.0.1:3456/v1/systemone');
  assert.equal(resolveConnection({provider:'openrouter',baseURL:'https://openrouter.ai/api/v1'}).endpoint,expected.openrouter);
});
test('reject malformed, credential-bearing, insecure and chat URLs before any request',async()=>{
  for(const baseURL of ['bad','http://remote.example/v1','https://u:p@example.com','https://example.com?k=secret','https://example.com/#key','https://example.com/v1/chat/completions']){
    await assert.rejects(analyze(item,{provider:'custom',baseURL,model:'jev'},'key',()=>assert.fail('must not fetch')));
  }
});
test('a new destination cannot reuse a saved key; successful model changes invalidate cached scores',async()=>{
  let saved={},calls=[];const engine=new Engine({get:async()=>saved,set:async v=>{saved=structuredClone(v);}},async(i,s,key)=>{calls.push({s,key});return answer;});
  await engine.connect({},'private-fixture');
  await assert.rejects(engine.connect({baseURL:'https://different.example/v1'},''),/API Key/);
  assert.equal(calls.length,1);assert.equal(saved.banbot.settings.baseURL,'https://magpie.qiaomu.ai/v1');
  await engine.connect({model:'typesafe/jev-other'},'');assert.equal(calls.at(-1).key,'private-fixture');assert.equal(calls.at(-1).s.model,'typesafe/jev-other');
  await engine.connect({provider:'openrouter'},'router-fixture');assert.equal(calls.at(-1).s.baseURL,PROVIDERS.openrouter.baseURL);assert.equal(calls.at(-1).s.model,PROVIDERS.openrouter.model);
  const key=await cacheKey(item,DEFAULTS);for(const patch of [{model:'another'},{baseURL:'https://different.example'},{protocol:'decisions'}])assert.notEqual(await cacheKey(item,{...DEFAULTS,...patch}),key);
});
test('changing providers while request accounting is saving never sends the new key to the old URL',async()=>{
  let release,entered,gate=false;const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r),calls=[];
  const engine=new Engine({get:async()=>({}),set:async()=>{if(gate){gate=false;entered();await blocked;}}},async(i,s,key)=>{calls.push({s,key});return answer;});
  await engine.updateSettings({},'old-key');gate=true;const request=engine.classify(item);await started;
  const update=engine.updateSettings({provider:'openrouter'},'new-key');
  await new Promise(r=>setTimeout(r,0));release();await update;
  assert.equal((await request).skipped,'changed');assert.equal(calls.length,0);
});
