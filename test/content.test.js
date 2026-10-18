import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { DEFAULTS } from '../src/core.js';
const code=(await build({entryPoints:['src/content.js'],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<60;i++){if(fn())return;await pause(15);}throw new Error('UI state did not settle');}
const markup=(id,text)=>`<article data-testid="tweet" id="a${id}"><div class="original"><div dir="auto">Replying to @parent</div><a href="/person${id}/status/${id}"><time datetime="2026-10-18T10:00:00Z">1h</time></a><div data-testid="tweetText">${text}</div></div></article>`;
function mount(html,request){
  const dom=new JSDOM(`<body><main data-testid="primaryColumn">${html}</main></body>`,{url:'https://x.com/home',runScripts:'outside-only',pretendToBeVisual:true});
  let settings={...DEFAULTS},listeners=[],overrides=new Map(),calls=[];
  dom.window.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(target){queueMicrotask(()=>this.fn([{target,isIntersecting:true}]));}unobserve(){}disconnect(){}};
  dom.window.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async m=>{
    if(m.type==='snapshot')return {ok:true,data:{settings,configured:true}};
    if(m.type==='local-decision')return {ok:true,data:overrides.has(m.item.id)?{override:overrides.get(m.item.id)}:{}};
    if(m.type==='classify'){calls.push(m.item.id);return{ok:true,data:await request(m.item)};}
    if(m.type==='feedback'){overrides.set(m.item.id,m.label);listeners.forEach(fn=>fn({type:'refresh'}));return{ok:true,data:{}};}
    return{ok:true,data:{}};
  }}};
  dom.window.eval(code);
  return{dom,calls,settings,refresh:()=>listeners.forEach(fn=>fn({type:'refresh'})),close:()=>dom.window.close()};
}
const result=(ai=.95)=>({model:'fixture',scores:{ai_written:ai,low_value:.1,spam:.1,useful:.1}});
test('normal controls mount within the native column, never beside it in the article row',async()=>{
  const env=mount(markup(1,'A useful human reply.'),async()=>result(.1));
  try{const a=env.dom.window.document.getElementById('a1');a.style.display='flex';a.style.flexDirection='row';a.firstElementChild.style.display='flex';a.firstElementChild.style.flexDirection='column';
    await until(()=>a.querySelector('.qb-host'));
    assert.equal(a.querySelector('.qb-host').parentElement,a.querySelector('.original'));
    assert.equal(a.children.length,1);
  }finally{env.close();}
});
test('turning off post radar does not disable an explicit author block',async()=>{
  const env=mount(markup(1,'A main post.').replace('<div dir="auto">Replying to @parent</div>',''),async()=>result(.1));
  try{env.settings.radar=false;env.settings.blocklist=['person1'];env.refresh();
    await until(()=>env.dom.window.document.getElementById('a1').classList.contains('qb-collapsed'));
    assert.equal(env.calls.length,0);
  }finally{env.close();}
});
test('fold/expand preserves original nodes; disabling restores every post',async()=>{
  const env=mount(markup(1,'A reply with enough detail to test folding.'),async()=>result());
  try{
    const a=env.dom.window.document.getElementById('a1'),original=a.firstElementChild;
    await until(()=>a.classList.contains('qb-collapsed'));
    const button=[...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='展开');button.click();
    assert.equal(a.classList.contains('qb-collapsed'),false);assert.equal(a.firstElementChild,original);
    env.settings.enabled=false;env.refresh();await until(()=>!a.querySelector('.qb-host'));assert.equal(a.firstElementChild,original);assert.equal(a.classList.contains('qb-collapsed'),false);
  }finally{env.close();}
});
test('a recycled article rejects the previous delayed judgment',async()=>{
  let finish;const env=mount(markup(1,'Old reply.'),async item=>item.id==='1'?new Promise(r=>finish=r):result(.1));
  try{
    await until(()=>finish);const a=env.dom.window.document.getElementById('a1');a.querySelector('a').href='/newperson/status/2';a.querySelector('[data-testid=tweetText]').textContent='A human specific correction';finish(result());
    await until(()=>env.calls.includes('2'));await pause(40);assert.equal(a.classList.contains('qb-collapsed'),false);
    assert.ok(!a.querySelector('.qb-host').shadowRoot.textContent.includes('95%'));
  }finally{env.close();}
});
test('manual keep overrides duplicate folding without another model request',async()=>{
  const text='This repeated reply has enough characters for the duplicate filter.';
  const env=mount(markup(1,text)+markup(2,text),async()=>result(.1));
  try{
    const a=env.dom.window.document.getElementById('a2');await until(()=>a.classList.contains('qb-collapsed'));await pause(20);
    assert.deepEqual(env.calls,['1']);
    [...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='误判，保留').click();
    await until(()=>a.querySelector('.qb-host')?.shadowRoot.textContent.includes('你已保留此条'));
    assert.equal(a.classList.contains('qb-collapsed'),false);assert.ok(!env.calls.includes('2'));
  }finally{env.close();}
});
test('X block helper opens the native confirmation without confirming a block',async()=>{
  const env=mount(markup(1,'A reply to test the native menu.'),async()=>result());
  try{
    const document=env.dom.window.document,a=document.getElementById('a1');let opened=false,blocked=0;
    const hidden=document.createElement('div');hidden.setAttribute('role','dialog');hidden.style.display='none';document.body.append(hidden);
    const confirm=document.createElement('button');confirm.onclick=()=>blocked++;hidden.append(confirm);
    const caret=document.createElement('button');caret.dataset.testid='caret';a.querySelector('.original').append(caret);
    caret.onclick=()=>{const b=document.createElement('button');b.setAttribute('role','menuitem');b.textContent='屏蔽 @person1';b.onclick=()=>{opened=true;hidden.style.display='block';b.remove();};document.body.append(b);};
    await until(()=>a.classList.contains('qb-collapsed'));
    const b=[...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='在 X 拉黑…');b.click();
    await until(()=>opened);assert.equal(blocked,0);
  }finally{env.close();}
});
