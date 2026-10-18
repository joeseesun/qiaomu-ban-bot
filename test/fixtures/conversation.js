import { DEFAULTS } from '../../src/core.js';
import { Engine } from '../../src/engine.js';
history.replaceState(null,'','/demo/status/100');
let settings={...DEFAULTS},listeners=[];
window.qa={calls:[],blocks:0,feedback:[],notify:()=>listeners.forEach(fn=>fn({type:'refresh'}))};
const texts={100:'我做了一个开源 Chrome 插件，让回复区安静一点。你最希望过滤哪类回复？',101:'作为一个人工智能语言模型，我无法访问你的项目，但这个观点极具启发性，值得深入探讨。',102:'我测试了 30 条中文短回复，有两条正常回复被折叠。建议给短文本增加“证据不足”的状态。',103:'作为一个人工智能语言模型，我无法访问你的项目，但这个观点极具启发性，值得深入探讨。',104:'谢谢，已经用上了',105:'这是一条推荐内容，不属于上面的回复区。'};
function article(id,handle){
  const a=document.createElement('article');a.dataset.testid='tweet';a.dataset.fixtureId=id;
  a.innerHTML=`<div><div class="author" data-testid="User-Name"><span class="avatar">${handle.slice(0,2)}</span><strong>${handle}</strong><a href="/${handle}/status/${id}"><time datetime="${new Date(Date.now()-3600000).toISOString()}">1 小时</time></a><button data-testid="caret" aria-label="更多 ${handle}">···</button></div><div data-testid="tweetText"></div><div role="group" aria-label="32 回复、128 喜欢、3200 次观看">32 回复　128 喜欢　3,200 浏览</div></div>`;
  a.querySelector('[data-testid=tweetText]').textContent=texts[id];
  a.querySelector('[data-testid=caret]').onclick=()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');const b=document.createElement('button');b.setAttribute('role','menuitem');b.textContent=`屏蔽 @${handle}`;b.onclick=()=>{menu.remove();document.getElementById('confirmation').classList.add('open');};menu.append(b);document.body.append(menu);};
  return a;
}
for(const [id,h] of [[100,'builder'],[101,'botdemo'],[102,'tester'],[103,'copycat'],[104,'reader']])document.getElementById('timeline').append(article(id,h));
const h2=document.createElement('h2');h2.textContent='发现更多';document.getElementById('timeline').append(h2,article(105,'suggested'));
let saved={banbot:{settings,apiKey:'fixture-only'}};
const engine=new Engine({get:async()=>saved,set:async value=>{saved=structuredClone(value);}},async(item,config)=>{
  window.qa.calls.push({id:item.id,kind:item.kind,examples:config.examples?.length||0});
  return {model:'fixture-only',analyzedAt:Date.now(),inputTokens:10,scores:item.kind==='post'?{hot:.68,discussion:.91}:{ai_written:item.id==='101'?.94:.15,low_value:item.id==='101'?.92:.12,useful:item.id==='102'?.96:.1,spam:.02}};
});
window.qa.engine=engine;
window.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async m=>{
  try{
    let data={};
    if(m.type==='snapshot')data=await engine.snapshot();
    if(m.type==='classify')data=await engine.classify(m.item);
    if(m.type==='local-decision')data=await engine.localDecision(m.item);
    if(m.type==='list')data=await engine.listAction(m.handle,m.action);
    if(m.type==='feedback')data=await engine.feedback(m.item,m.label);
    if(m.type==='learn')data=await engine.learn(m.item,m.label);
    if(['list','feedback','learn'].includes(m.type))window.qa.notify();
    return{ok:true,data};
  }catch(error){return{ok:false,error:error.message};}
}}};
document.getElementById('toggle-dark').onclick=()=>{document.body.classList.toggle('dark');window.qa.notify();};
document.getElementById('toggle-enabled').onclick=async()=>{const enabled=!(await engine.snapshot()).settings.enabled;await engine.updateSettings({enabled});document.getElementById('toggle-enabled').textContent=enabled?'暂停自动判断':'继续自动判断';window.qa.notify();};
document.getElementById('recycle').onclick=()=>{const a=document.querySelector('[data-fixture-id="101"]');a.querySelector('a').href='/human/status/200';a.querySelector('[data-testid=tweetText]').textContent='我实际运行了一遍，刷新后缓存仍然有效。';};
document.getElementById('confirm-block').onclick=()=>{window.qa.blocks++;document.getElementById('confirmation').classList.remove('open');};
document.getElementById('cancel-block').onclick=()=>document.getElementById('confirmation').classList.remove('open');
const script=document.createElement('script');script.src='/dist/chrome/content.js';document.body.append(script);
