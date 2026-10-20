import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, normalizeSettings, validateItem, buildRequest, parseResponse, decide, duplicateKey, cacheKey } from '../src/core.js';
import { analyze } from '../src/jev.js';
const reply = { id: '123', handle: 'alice', text: '我实际测试后发现缓存会失效，刷新后要重新连接。', kind: 'reply', parent: '如何缓存模型结果', metrics: {} };
const result = scores => ({ scores: { ai_written: .95, low_value: .1, spam: .1, useful: .9, ...scores } });
test('uncertain or invalid model output cannot collapse a reply', () => {
  assert.equal(decide(reply, null, DEFAULTS).collapse, false);
  assert.equal(decide(reply, result({ ai_written: .5 }), DEFAULTS).collapse, false);
  for (const value of [undefined, null, NaN, Infinity, -1, 1.01, '0.99', true]) assert.throws(() => parseResponse({ model: 'jev', answers: { ai_written: { type: 'noul', noul: value } } }, ['ai_written']));
  assert.throws(() => parseResponse({ model: 'jev', answers: {} }, ['ai_written']));
  assert.equal(parseResponse({ model: 'jev', answers: { ai_written: { type: 'noul', noul: 0 } } }, ['ai_written']).scores.ai_written, 0);
});
test('mode and allowlist decisions match user policy', () => {
  assert.equal(decide(reply, result({}), DEFAULTS).collapse, true);
  assert.equal(decide(reply, result({ spam: 1 }), { ...DEFAULTS, filterMode: 'label' }).collapse, false);
  assert.equal(decide(reply, result({}), { ...DEFAULTS, allowlist: ['alice'], blocklist: ['alice'] }).collapse, false);
  assert.equal(decide(reply, null, { ...DEFAULTS, blocklist: ['alice'] }).collapse, true);
  assert.equal(decide(reply, result({}), { ...DEFAULTS, enabled: false, blocklist: ['alice'] }).collapse, false);
  assert.equal(decide({ ...reply, kind: 'post' }, result({}), DEFAULTS).collapse, false);
});
test('retired information-volume scores cannot label or fold any reply', () => {
  const settings=normalizeSettings({...DEFAULTS,filterMode:'low-value'});
  assert.equal(settings.filterMode,'label');
  for(const text of ['谢谢','为了流量不要脸','我现在都是扔给 Bot 让它抓数据','详细且具体的长回复。'.repeat(20)]) {
    const item={...reply,text};
    const oldResult=result({ai_written:.26,low_value:1,useful:.1,spam:0});
    for(const s of [DEFAULTS,settings]) {
      const decision=decide(item,oldResult,s);
      assert.equal(decision.collapse,false);assert.equal(decision.label,'');
    }
    assert.deepEqual(Object.keys(buildRequest(item,DEFAULTS).questions),['ai_written','useful','spam']);
  }
});
test('semantic rule is independent of AI authorship', () => {
  const s = { ...DEFAULTS, customRule: '引流' };
  assert.equal(decide(reply, result({ ai_written: .1, rule_match: .96 }), s).collapse, true);
  assert.equal(decide(reply, result({ ai_written: .1, rule_match: .96 }), DEFAULTS).collapse, false);
  const q = buildRequest(reply, s); assert.equal(q.model, 'jev-latest'); assert.ok(q.questions.rule_match); assert.equal(q.state.text, reply.text);
});
test('retired main-post predictions cannot build model requests',()=>{assert.throws(()=>buildRequest({...reply,kind:'post'},DEFAULTS),/仅支持回复/);});
test('cache identity includes context, rules, and provider', async () => {
  const key = await cacheKey(reply, DEFAULTS, 1);
  for (const [item,s] of [[{...reply,text:'edited'},DEFAULTS],[{...reply,parent:'other'},DEFAULTS],[reply,{...DEFAULTS,customRule:'promotion'}],[reply,{...DEFAULTS,provider:'magpie'}]]) assert.notEqual(await cacheKey(item,s,1),key);
  assert.equal(await cacheKey(reply,{...DEFAULTS,threshold:.99},1),key);
});
test('input boundary and duplicates do not confuse short human replies', () => {
  assert.equal(duplicateKey('谢谢'), '');
  assert.equal(duplicateKey('This is a sufficiently long REPLY!'), duplicateKey('this is a sufficiently long reply!'));
  assert.throws(() => validateItem({...reply,id:'bad-id'}));
  assert.throws(() => validateItem({...reply,kind:'unknown'}));
  assert.deepEqual(normalizeSettings({allowlist:['@Alice','ALICE','bad handle']}).allowlist,['alice']);
  assert.equal(normalizeSettings({threshold:Infinity}).threshold,.5);
});
test('AI folds strictly above 50%, without relaxing promotion and custom rules',()=>{
  for(const [p,collapse] of [[.49,false],[.5,false],[.51,true]]) assert.equal(decide(reply,result({ai_written:p}),DEFAULTS).collapse,collapse);
  assert.equal(decide(reply,result({ai_written:.2,spam:.6,rule_match:.6}),{...DEFAULTS,customRule:'promotion'}).collapse,false);
  assert.equal(decide(reply,result({ai_written:.51}),{...DEFAULTS,filterMode:'label'}).collapse,false);
});
test('actual HTTP adapter uses decisions protocol, rejects redirects and handles status/errors', async () => {
  const valid = { model: 'jev-test', answers: Object.fromEntries(['ai_written','useful','spam'].map(k=>[k,{type:'noul',noul:.3}])) };
  await analyze(reply, DEFAULTS, 'fixture-key', async (url, init) => {
    assert.equal(url,'https://api.typesafe.ai/v1/systemone'); assert.equal(init.redirect,'error'); assert.equal(init.credentials,'omit'); assert.equal(init.headers.Authorization,'Bearer fixture-key');
    const body=JSON.parse(init.body); assert.equal(body.state.text,reply.text); assert.equal(body.messages,undefined); return new Response(JSON.stringify(valid));
  });
  await assert.rejects(analyze(reply,DEFAULTS,'fixture',async()=>new Response('',{status:429})), /限流/);
  await assert.rejects(analyze(reply,DEFAULTS,'fixture',async()=>new Response('invalid')), /JSON/);
  await assert.rejects(analyze(reply,DEFAULTS,'fixture',async()=>new Response('{}')), /格式/);
});
