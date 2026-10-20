import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory,IDBKeyRange } from 'fake-indexeddb';
import { buildRequest,validateItem,normalizeSettings,decide } from '../src/core.js';
import { formatFollowers } from '../src/evidence.js';
import { RULE_PRESETS,ruleMatches } from '../src/rules.js';
import { Community,COMMUNITY_ORIGIN } from '../src/community.js';
import { Workspace } from '../src/workspace.js';
import { IndexedAnnotations } from '../src/annotations.js';
import { Engine } from '../src/engine.js';
import { annotationExport } from '../src/annotation-export.js';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
const item={id:'123',handle:'alice',kind:'reply',text:'我测试时是 32 秒。🙂',parent:'',author:{userId:'456',followers:12200},metrics:{}};
test('typed model evidence retains missing fields and labels weak signals without identity inference',()=>{
  const v=validateItem({...item,root:{id:'1',text:'原帖',createdAt:1000},directParent:{id:'2',text:'直接问题',createdAt:2000},createdAt:5000});
  const payload=buildRequest(v,normalizeSettings());
  assert.equal(payload.state.evidence.replyDelaySeconds,3);
  assert.equal(payload.state.evidence.root.text,'原帖');
  assert.equal(payload.state.evidence.author.posts,null);
  assert.equal(payload.state.evidence.author.userId,undefined);
  assert.equal(payload.state.evidence.features.emoji,1);
  assert.match(payload.questions.ai_written.instructions,/weak contextual cues/);
  assert.match(payload.questions.ai_written.instructions,/Never turn one reply into/);
  assert.equal(formatFollowers(12200),'12.2k');assert.equal(formatFollowers(986),'986');assert.equal(formatFollowers(null),'');
});
test('local rules work without model, allowlist wins, emoji and multilingual names remain valid',()=>{
  const settings=normalizeSettings({wordRules:RULE_PRESETS,symbolHint:true});
  assert.equal(decide({...item,displayName:'互关小屋'},null,settings).collapse,true);
  assert.equal(decide({...item,displayName:'同城咖啡'},null,settings).collapse,false);
  assert.equal(decide({...item,displayName:'互关小屋'},null,{...settings,allowlist:['alice']}).collapse,false);
  assert.deepEqual(ruleMatches({...item,displayName:'João · 小夏🌲'},settings),[]);
  assert.equal(ruleMatches({...item,displayName:'ab\u202ecd'},settings)[0].action,'hint');
  assert.equal(decide({...item,displayName:'同城咖啡'},{scores:{ai_written:.99,useful:.1,spam:0}},settings).collapse,true,'a hint must not bypass model filtering');
  assert.equal(decide({...item,displayName:'同城咖啡'},null,settings).rules[0].action,'hint');
});
test('community starts private, queues exact minimum data, retries and persists across worker restarts',async()=>{
  let saved={},offline=false;const calls=[];
  const storage={get:async()=>structuredClone(saved),set:async v=>{saved=structuredClone(v);}};
  const fetcher=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(offline)throw Error('offline');
    return{ok:true,json:async()=>url.endsWith('enroll')?{token:'x'.repeat(43),scope:'contribute',contributor:'fixture'}:{accepted:true,revision:JSON.parse(options.body).revision}};
  };
  let c=new Community(storage,fetcher);
  assert.equal((await c.enqueue(item,'ai')).shared,false);assert.equal(calls.length,0);
  await c.connect('i'.repeat(43));assert.equal((await c.snapshot()).subscribe,false);
  await c.configure({contribute:true});offline=true;
  await c.enqueue({...item,note:'PRIVATE',text:'PRIVATE BODY'},'ai');await c.sync();
  assert.equal((await c.snapshot()).pending,1);
  c=new Community(storage,fetcher);await c.enqueue(item,null);offline=false;await c.sync();
  assert.equal((await c.snapshot()).pending,0);
  const sent=calls.at(-1);assert.equal(sent.url,COMMUNITY_ORIGIN+'/v1/annotations');assert.equal(sent.body.label,null);
  assert.deepEqual(Object.keys(sent.body).sort(),['handle','label','postId','revision','userId']);
  assert.ok(!JSON.stringify(await c.snapshot()).includes('x'.repeat(43)));
});
test('queue survives restart, manual collection restores pending, notes and owners remain separate',async()=>{
  const factory=new IDBFactory();let w=new Workspace(factory,IDBKeyRange,'reading-queue');
  await w.queue('me',item,{source:'manual',note:'先讲使用经验'},10);
  await w.queue('me',item,{status:'done'});await w.queue('other',item,{source:'manual'});
  w=new Workspace(factory,IDBKeyRange,'reading-queue');
  await w.queue('me',item,{source:'manual'});
  assert.equal((await w.get('inbox','me','123')).status,'pending');
  assert.equal((await w.get('inbox','me','123')).note,'先讲使用经验');
  assert.equal((await w.get('inbox','other','123')).note,'');
  await w.queue('me',{...item,id:'124',author:{userId:'457',followers:500}},{source:'manual'},20);
  assert.equal((await w.page('inbox','me',{sort:'queueOld'})).items[0].id,'123');
  assert.equal((await w.page('inbox','me',{sort:'followers'})).items[0].id,'123');
  assert.equal((await w.page('inbox','me',{query:'使用经验'})).items.length,1);
  assert.deepEqual(await w.inboxSummary('me'),{pending:2,done:0,snoozed:0});
});
test('author evidence follows stable account ID and export preserves original post evidence',async()=>{
  const labels=new IndexedAnnotations(new IDBFactory(),IDBKeyRange,'reading-labels');
  await labels.migrate();
  await labels.put({...item,key:'a',label:'ai',at:10});
  await labels.put({...item,id:'124',key:'b',handle:'renamed',label:'human',at:20});
  const history=await labels.byAuthor({...item,id:'999',handle:'renamed'});
  assert.equal(history.length,2);
  assert.equal((await labels.byAuthor(item)).length,1);
  assert.equal((await labels.post('123')).key,'a');
  const md=annotationExport(history);assert.match(md,/AI 标注/);assert.match(md,/https:\/\/x.com\/alice\/status\/123/);
  assert.equal(JSON.parse(annotationExport(history,'json')).items[0].userId,'456');
});
test('seeing an old labelled post backfills its stable author ID without duplicating or relabelling it',async()=>{
  const labels=new IndexedAnnotations(new IDBFactory(),IDBKeyRange,'legacy-identity');
  await labels.migrate();
  await labels.put({...item,author:null,key:'legacy-key',displayName:'Alice',label:'human',at:10});
  const engine=new Engine({get:async()=>({}),set:async()=>{}},undefined,labels);
  assert.equal((await labels.byAuthor({...item,id:'999'})).length,0);
  assert.equal((await engine.localDecision({...item,displayName:'Alice'})).annotation,'human');
  const history=await labels.byAuthor({...item,id:'999'});
  assert.equal(history.length,1);assert.equal(history[0].key,'legacy-key');assert.equal(history[0].at,10);
  assert.equal((await labels.byAuthor({...item,id:'999',author:{userId:'789'}})).length,0);
  assert.deepEqual(await labels.stats(),{total:1,ai:0,human:1,revision:2});
});
test('v2 annotations upgrade deduplicates edits of the same post without restoring retired account counts',async()=>{
  const factory=new IDBFactory(),db=await new Promise((resolve,reject)=>{
    const r=factory.open('old-labels',2);r.onupgradeneeded=()=>{
      const rows=r.result.createObjectStore('annotations',{keyPath:'key'});rows.createIndex('time',['at','key']);rows.createIndex('labelTime',['label','at','key']);rows.createIndex('label','label');
      const authors=r.result.createObjectStore('authors',{keyPath:'handle'});authors.createIndex('ai',['ai','handle']);authors.createIndex('human',['human','handle']);
      const meta=r.result.createObjectStore('meta');meta.put(true,'migrated');meta.put(2,'revision');
      rows.put({...item,key:'old',label:'ai',at:10});rows.put({...item,key:'new',label:'human',at:20});
      authors.put({handle:'alice',ai:1,human:1});
    };r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });db.close();
  const labels=new IndexedAnnotations(factory,IDBKeyRange,'old-labels');await labels.migrate();
  assert.deepEqual(await labels.stats(),{total:1,ai:0,human:1,revision:3});
  assert.equal((await labels.stats()).ai,0);assert.equal((await labels.ready).objectStoreNames.contains('authors'),false);
  assert.equal((await labels.post('123')).key,'new');
});
test('MAIN world bridge only returns matched loaded public author fields and rejects foreign messages',async()=>{
  const dom=new JSDOM('<article data-testid="tweet"><a href="/alice/status/123"><time></time></a></article>',{url:'https://x.com/home',runScripts:'outside-only'});
  try{
    const w=dom.window,a=w.document.querySelector('article'),sent=[];
    a.__reactFiber$test={memoizedProps:{tweet:{id_str:'123',in_reply_to_status_id_str:'12',user:{id_str:'456',screen_name:'alice',followers_count:12200,created_at:'2024-01-01',cookie:'NEVER_RETURN'}}}};
    w.postMessage=value=>sent.push(value);w.eval(await readFile('src/page-evidence.js','utf8'));
    const data={channel:'qx-evidence-request',request:'fixture',ids:['123']};
    w.dispatchEvent(new w.MessageEvent('message',{data,source:null,origin:'https://x.com'}));assert.equal(sent.length,0);
    w.dispatchEvent(new w.MessageEvent('message',{data,source:w,origin:'https://x.com'}));
    assert.equal(sent[0].rows[0].author.userId,'456');assert.equal(sent[0].rows[0].parentId,'12');assert.ok(!JSON.stringify(sent).includes('NEVER_RETURN'));
    a.__reactFiber$test.memoizedProps.tweet.user.screen_name='other';
    w.dispatchEvent(new w.MessageEvent('message',{data,source:w,origin:'https://x.com'}));assert.equal(sent[1].rows.length,0);
  }finally{dom.window.close();}
});
