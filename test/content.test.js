import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { DEFAULTS } from '../src/core.js';
const code=(await build({entryPoints:['src/content.js'],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const css=await readFile('public/content.css','utf8');
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
    if(m.type==='feedback'){overrides.set(m.item.id,m.label);listeners.forEach(fn=>fn({type:'annotation-changed',id:m.item.id}));return{ok:true,data:{}};}
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
    await until(()=>env.dom.window.document.getElementById('a1').hasAttribute('data-qb-collapsed'));
    assert.equal(env.calls.length,0);
  }finally{env.close();}
});
test('fold/expand preserves original nodes; disabling restores every post',async()=>{
  const env=mount(markup(1,'A reply with enough detail to test folding.'),async()=>result());
  try{
    const a=env.dom.window.document.getElementById('a1'),original=a.firstElementChild;
    await until(()=>a.hasAttribute('data-qb-collapsed'));
    const button=[...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='展开');button.click();
    assert.equal(a.hasAttribute('data-qb-collapsed'),false);assert.equal(a.firstElementChild,original);
    env.settings.enabled=false;env.refresh();await until(()=>!a.querySelector('.qb-host'));assert.equal(a.firstElementChild,original);assert.equal(a.hasAttribute('data-qb-collapsed'),false);
  }finally{env.close();}
});
test('native hover class replacement cannot reveal folded text or break expansion',async()=>{
  const env=mount(markup(1,'A reply that must stay hidden after X rewrites its className.'),async()=>result());
  try{
    const d=env.dom.window.document,a=d.getElementById('a1'),original=a.firstElementChild;
    const style=d.createElement('style');style.textContent='.original{display:flex;flex-direction:column}'+css;d.head.append(style);
    await until(()=>a.querySelector('.qb-host')?.shadowRoot.querySelector('.folded'));
    assert.equal(env.dom.window.getComputedStyle(original).display,'none');
    // React replaces the complete article className on pointer enter/leave.
    a.className='x-native-row x-hover';
    await pause(20);
    assert.equal(env.dom.window.getComputedStyle(original).display,'none');
    assert.equal(a.querySelector('.qb-host').parentElement,a);
    [...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='展开').click();
    assert.equal(env.dom.window.getComputedStyle(original).display,'flex');
    assert.equal(a.querySelector('.qb-host').parentElement,original);
    a.className='x-native-row';
    await pause(20);
    assert.equal(env.dom.window.getComputedStyle(original).display,'flex');
    assert.equal(a.firstElementChild,original);
    assert.equal(a.className,'x-native-row');
  }finally{env.close();}
});
test('recycling an already folded article removes its previous collapse state',async()=>{
  const env=mount(markup(1,'Old folded reply.'),async item=>result(item.id==='1'?.95:.1));
  try{
    const a=env.dom.window.document.getElementById('a1'),original=a.firstElementChild;
    await until(()=>a.hasAttribute('data-qb-collapsed'));
    a.className='x-native-row';a.querySelector('a').href='/newperson/status/2';
    a.querySelector('[data-testid=tweetText]').textContent='A new human reply.';
    await until(()=>env.calls.includes('2'));await pause(20);
    assert.equal(a.hasAttribute('data-qb-collapsed'),false);
    assert.equal(a.querySelector('.qb-host').parentElement,original);
  }finally{env.close();}
});
test('probability and accessible icon controls stay compact; the action panel closes with Escape',async()=>{
  const env=mount(markup(1,'A concrete useful reply.'),async()=>({...result(.27),scores:{ai_written:.27,low_value:.1,spam:.1,useful:.96}}));
  try{
    const a=env.dom.window.document.getElementById('a1');
    await until(()=>a.querySelector('.qb-host')?.shadowRoot.textContent.includes('AI 概率：27%'));
    const root=a.querySelector('.qb-host').shadowRoot;
    const mark=root.querySelector('button[aria-label="标记 AI"]'),toggle=root.querySelector('button[aria-label="判断与操作"]');
    assert.ok(mark.querySelector('svg'));assert.equal(mark.textContent,'');
    assert.ok(root.querySelector('[aria-label="值得一读"] svg'));
    assert.equal(toggle.textContent,'');assert.equal(toggle.getAttribute('aria-expanded'),'false');
    const panel=root.getElementById(toggle.getAttribute('aria-controls'));assert.equal(panel.hidden,true);
    toggle.click();assert.equal(panel.hidden,false);assert.equal(toggle.getAttribute('aria-expanded'),'true');
    const human=panel.querySelector('button');
    human.dispatchEvent(new env.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(panel.hidden,true);assert.equal(root.activeElement,toggle);
  }finally{env.close();}
});
test('a recycled article rejects the previous delayed judgment',async()=>{
  let finish;const env=mount(markup(1,'Old reply.'),async item=>item.id==='1'?new Promise(r=>finish=r):result(.1));
  try{
    await until(()=>finish);const a=env.dom.window.document.getElementById('a1');a.querySelector('a').href='/newperson/status/2';a.querySelector('[data-testid=tweetText]').textContent='A human specific correction';finish(result());
    await until(()=>env.calls.includes('2'));await pause(40);assert.equal(a.hasAttribute('data-qb-collapsed'),false);
    assert.ok(!a.querySelector('.qb-host').shadowRoot.textContent.includes('95%'));
  }finally{env.close();}
});
test('manual keep overrides duplicate folding without another model request',async()=>{
  const text='This repeated reply has enough characters for the duplicate filter.';
  const env=mount(markup(1,text)+markup(2,text),async()=>result(.1));
  try{
    const a=env.dom.window.document.getElementById('a2');await until(()=>a.hasAttribute('data-qb-collapsed'));await pause(20);
    assert.deepEqual(env.calls,['1']);
    [...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='只保留此条').click();
    await until(()=>a.querySelector('.qb-host')?.shadowRoot.textContent.includes('你已保留此条'));
    assert.equal(a.hasAttribute('data-qb-collapsed'),false);assert.ok(!env.calls.includes('2'));
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
    await until(()=>a.hasAttribute('data-qb-collapsed'));
    const b=[...a.querySelector('.qb-host').shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='在 X 拉黑…');b.click();
    await until(()=>opened);assert.equal(blocked,0);
  }finally{env.close();}
});
