import { Engine } from '/src/engine.js';
import { IndexedAnnotations } from '/src/annotations.js';
const key='qx-account-rules-fixture-041',listeners=[];
const storage={get:async()=>JSON.parse(localStorage.getItem(key)||'{}'),set:async value=>localStorage.setItem(key,JSON.stringify(value))};
window.fixtureCalls=[];
const engine=new Engine(storage,async item=>{window.fixtureCalls.push(item.handle);return{model:'synthetic',scores:{ai_written:.12,useful:.2,spam:.01},inputTokens:0,analyzedAt:Date.now()};},new IndexedAnnotations(indexedDB,IDBKeyRange,'qx-account-rules-fixture-041'));
await engine.ready;
if(!localStorage.getItem(key+'-seeded')){
  await engine.updateSettings({},'synthetic-fixture');
  await engine.learn({id:'201',handle:'fixture_human',kind:'reply',text:'这是一条真实使用经验。'},'human');
  await engine.learn({id:'301',handle:'fixture_ai',kind:'reply',text:'这是用于演示已折叠账号的回复。'},'ai');
  localStorage.setItem(key+'-seeded','yes');
}
window.fixtureEngine=engine;
window.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async m=>{
  let data={};
  if(m.type==='snapshot')data=await engine.snapshot();
  if(m.type==='classify')data=await engine.classify(m.item,m.force,m.owner);
  if(m.type==='local-decision')data=await engine.localDecision(m.item,m.owner);
  if(m.type==='learn')data=await engine.learn(m.item,m.label);
  if(m.type==='list')data=await engine.listAction(m.item?.handle||m.handle,m.action,m.item?.author?.userId);
  if(['learn','list'].includes(m.type))listeners.forEach(fn=>fn({type:'accounts-changed'}));
  return{ok:true,data};
}}};
for(const [id,handle,name,text] of [
  ['101','fixture_me','自己的账号','自己的回复，不显示判断入口。'],
  ['202','fixture_human','曾标为真人','这是后来的一条新回复，可以改标或恢复自动检测。'],
  ['302','fixture_ai','曾标为 AI','这是该账号后续发布的新回复。'],
  ['303','fixture_ai','曾标为 AI','同一作者的另一条回复，也应默认折叠。'],
  ['401','fixture_new','尚未标记','新的作者仍按现有规则判断。'],
]){
  const a=document.createElement('article');a.dataset.testid='tweet';a.id='post-'+id;
  a.innerHTML=`<div class="native"><div class="row"><div class="avcol"><span class="avatar" data-testid="Tweet-User-Avatar"></span></div><div class="body"><div data-testid="User-Name"><a href="/${handle}">${name}</a><a href="/${handle}/status/${id}"><time datetime="2026-10-20T13:00:00Z">12 分钟</time></a></div><div class="replying" dir="auto">Replying to @fixture_root</div><div data-testid="tweetText">${text}</div><div role="group"><span>回复</span><span>转发</span><span>赞</span></div></div></div></div>`;
  document.querySelector('#posts').append(a);
}
const script=document.createElement('script');script.src='/dist/chrome/content.js';document.body.append(script);
