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
test('legacy low-information results never appear in the toolbar or expanded scores',async()=>{
  const env=mount(markup(1,'我现在都是扔给 Bot 让它抓数据'),async()=>({...result(.26),scores:{ai_written:.26,low_value:.99,spam:.01,useful:.1}}));
  try{
    const a=env.dom.window.document.getElementById('a1');
    await until(()=>a.querySelector('.qb-host')?.shadowRoot.textContent.includes('AI 写作估计 26%'));
    const root=a.querySelector('.qb-host').shadowRoot;
    assert.equal(a.hasAttribute('data-qb-collapsed'),false);
    assert.equal(root.querySelector('.status'),null);
    root.querySelector('button[aria-label="判断与操作"]').click();
    assert.deepEqual([...root.querySelectorAll('.scores dt')].map(n=>n.textContent),['AI 概率','引流']);
    assert.equal(root.textContent.includes('低信息量'),false);
    assert.ok(root.querySelector('button[aria-label="标记真人"]'));
  }finally{env.close();}
});
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
    await until(()=>a.querySelector('.qb-host')?.shadowRoot.textContent.includes('AI 写作估计 27%'));
    const root=a.querySelector('.qb-host').shadowRoot;
    const mark=root.querySelector('button[aria-label="标记 AI"]'),toggle=root.querySelector('button[aria-label="判断与操作"]');
    assert.ok(mark.querySelector('svg'));assert.equal(mark.textContent,'标记 AI');
    assert.equal(root.querySelector('[aria-label="值得一读"]'),null,'the useful marker is withdrawn until it is reliable');
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
test('a preloaded recommendation heading must not stop new replies after the root is recycled',async()=>{
  const base=id=>markup(id,'Unique reply '+id).replace('<div dir="auto">Replying to @parent</div>','');
  const env=mount(base(100)+base(101)+'<h2>发现更多</h2>'+base(999),async()=>result(.1));
  try{
    env.dom.window.history.replaceState(null,'','/person100/status/100');env.refresh();
    await until(()=>env.calls.includes('101'));
    const d=env.dom.window.document;d.getElementById('a100').remove();
    d.querySelector('h2').insertAdjacentHTML('beforebegin',base(102));
    await until(()=>env.calls.includes('102'));
    assert.equal(env.calls.includes('999'),false);
  }finally{env.close();}
});
test('same article recycled through timestamp attributes and text nodes is reanalyzed',async()=>{
  const env=mount(markup(1,'Initial reply.'),async()=>result(.1));
  try{await until(()=>env.calls.includes('1'));const a=env.dom.window.document.getElementById('a1');
    a.querySelector('a').setAttribute('href','/person2/status/2');a.querySelector('[data-testid="tweetText"]').firstChild.nodeValue='A changed second reply';
    await until(()=>env.calls.includes('2'));
  }finally{env.close();}
});
test('recommendations stay outside the reply classifier when their heading is recycled',async()=>{
  const base=id=>markup(id,'Unique content '+id).replace('<div dir="auto">Replying to @parent</div>','');
  const env=mount(base(100)+base(101)+'<h2>发现更多</h2>'+base(999),async()=>result(.1));
  try{
    env.dom.window.history.replaceState(null,'','/person100/status/100');env.refresh();await until(()=>env.calls.includes('101'));await pause(150);
    const d=env.dom.window.document;for(const id of ['a100','a101'])d.getElementById(id).remove();d.querySelector('h2').remove();
    d.querySelector('main').insertAdjacentHTML('beforeend',base(1000));await pause(200);
    assert.equal(env.calls.includes('999'),false);assert.equal(env.calls.includes('1000'),false);
  }finally{env.close();}
});
test('expanding a long reply keeps its start in place and identifies the opened reply',async()=>{
  const env=mount(markup(1,'A long reply. '.repeat(100))+markup(2,'Next reply.'),async item=>result(item.id==='1'?.95:.1));
  try{const a=env.dom.window.document.getElementById('a1');await until(()=>a.hasAttribute('data-qb-collapsed'));
    let scroll=0;env.dom.window.scrollBy=({top})=>{scroll+=top;};
    a.getBoundingClientRect=()=>({top:300-scroll,bottom:360-scroll});
    const host=a.querySelector('.qb-host');host.getBoundingClientRect=()=>({top:(host.parentElement===a||host.parentElement.firstChild===host?300:1300)-scroll,bottom:360-scroll});
    host.shadowRoot.querySelector('[data-action=expand]').focus();host.shadowRoot.querySelector('[data-action=expand]').click();await pause(60);
    assert.equal(a.getBoundingClientRect().top,300);assert.equal(host.shadowRoot.activeElement?.dataset.action,'expand');assert.equal(a.parentElement.firstChild,a);assert.ok(host.shadowRoot.textContent.includes('已展开 · @person1'));assert.equal(host.parentElement.firstChild,host);
    [...host.shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='收起').click();await pause(60);assert.equal(a.getBoundingClientRect().top,300);
  }finally{env.close();}
});

test('reply controls join the native action row before the bookmark cluster, adding no row',async()=>{
  const html='<article data-testid="tweet"><div class="original"><div class="row"><div class="avatar">avatar</div><div class="body-column"><div dir="auto">Replying to @parent</div><a href="/alice/status/123"><time datetime="2026-10-18T10:00:00Z">1h</time></a><div data-testid="tweetText">一条真人回复</div><div role="group"><button>原生回复</button><div class="bookmark"><button data-testid="bookmark">书签</button></div></div></div></div></div></article>';
  const env=mount(html,async()=>result(.1));try{const d=env.dom.window.document;await until(()=>d.querySelector('.qb-host')?.shadowRoot.querySelector('.annotation'));
    const host=d.querySelector('.qb-host'),group=d.querySelector('.body-column>[role=group]');assert.equal(host.parentElement,group);assert.equal(host.nextElementSibling,group.querySelector('.bookmark'));assert.equal(host.dataset.qbPlace,'inline');assert.ok(host.shadowRoot.querySelector('.panel .annotation'));assert.equal(host.shadowRoot.querySelector('.toolbar .annotation'),null);assert.equal(host.shadowRoot.querySelector('.disclosure').textContent,'','a low estimate shows only the icon');
    assert.equal(d.querySelector('article').children.length,1);assert.equal(d.querySelector('.body-column>[role=group] button').textContent,'原生回复');
  }finally{env.close();}
});
test('hot badge follows timestamp, opens details, and removes cleanly when radar is disabled',async()=>{
  const html='<article data-testid="tweet"><div class="original"><div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice/status/123"><time datetime="2026-10-18T10:00:00Z">1h</time></a></div><div data-testid="tweetText">A main post</div></div></article>';
  const env=mount(html,async()=>({model:'fixture',analyzedAt:Date.now(),scores:{hot:.02,discussion:.1},hot:{status:'forecast',velocity:138}}));
  try{const d=env.dom.window.document;await until(()=>d.querySelector('.qb-hot-host'));const badge=d.querySelector('.qb-hot-host'),b=badge.shadowRoot.querySelector('button'),bar=d.querySelector('.qb-host').shadowRoot.querySelector('.bar');
    assert.equal(badge.previousElementSibling.tagName,'A');assert.equal(b.title,'传播表现');assert.equal(b.textContent,'');assert.match(b.getAttribute('aria-label'),/数据不足/);assert.equal(env.calls.length,0);assert.equal(bar.hidden,true);
    b.click();assert.equal(bar.hidden,false);assert.equal(b.getAttribute('aria-expanded'),'true');assert.ok(!bar.textContent.includes('我感觉能爆'));assert.ok(bar.textContent.includes('更新当前数据'));assert.ok(bar.textContent.includes('不是爆款概率'));
    env.settings.radar=false;env.refresh();await until(()=>!d.querySelector('.qb-hot-host'));assert.equal(d.querySelector('[data-testid=User-Name] a').textContent,'Alice');
  }finally{env.close();}
});

test('a high estimate shows its percentage in the action row trigger',async()=>{
  const html='<article data-testid="tweet"><div class="original"><div dir="auto">Replying to @parent</div><a href="/alice/status/124"><time datetime="2026-10-18T10:00:00Z">1h</time></a><div data-testid="tweetText">一条回复</div><div role="group"><button>原生回复</button></div></div></article>';
  const env=mount(html,async()=>result(.82));try{const d=env.dom.window.document;env.settings.filterMode='label';env.refresh();
    await until(()=>d.querySelector('.qb-host')?.shadowRoot.querySelector('.disclosure.high'));
    const t=d.querySelector('.qb-host').shadowRoot.querySelector('.disclosure');assert.equal(t.textContent,'82%');assert.equal(t.getAttribute('aria-label'),'判断与操作');
    assert.equal(d.querySelector('article').hasAttribute('data-qb-collapsed'),false);
  }finally{env.close();}
});

test('replies show the estimate under the avatar, keeping the action row native',async()=>{
  const html='<article data-testid="tweet"><div class="original"><div class="row"><div class="avcol"><div data-testid="Tweet-User-Avatar">A</div></div><div class="body-column"><div dir="auto">Replying to @parent</div><a href="/alice/status/125"><time datetime="2026-10-18T10:00:00Z">1h</time></a><div data-testid="tweetText">一条回复</div><div role="group"><button>原生回复</button></div></div></div></div></article>';
  const env=mount(html,async()=>result(.18));try{const d=env.dom.window.document;
    await until(()=>d.querySelector('.qb-host')?.dataset.qbPlace==='avatar');
    const host=d.querySelector('.qb-host');assert.equal(host.parentElement,d.querySelector('.avcol'));assert.equal(d.querySelector('[role=group] .qb-host'),null);
    const t=host.shadowRoot.querySelector('.disclosure');assert.equal(t.textContent,'18%','beside the avatar even a low estimate is shown');assert.equal(t.hasAttribute('title'),false);assert.match(t.dataset.tip,/AI 写作估计 18%/);
  }finally{env.close();}
});

test('marking a reply human hides the estimate; undoing brings it back',async()=>{
  const html='<article data-testid="tweet"><div class="original"><div class="row"><div class="avcol"><div data-testid="Tweet-User-Avatar">A</div></div><div class="body-column"><div dir="auto">Replying to @parent</div><a href="/alice/status/126"><time datetime="2026-10-18T10:00:00Z">1h</time></a><div data-testid="tweetText">一条回复</div><div role="group"><button>原生回复</button></div></div></div></div></article>';
  const env=mount(html,async()=>({...result(.82),annotation:'human'}));try{const d=env.dom.window.document;env.settings.filterMode='label';env.refresh();
    await until(()=>d.querySelector('.qb-host')?.shadowRoot.querySelector('.pop-head'));
    const root=d.querySelector('.qb-host').shadowRoot,t=root.querySelector('.disclosure');
    assert.equal(t.textContent,'');assert.equal(t.classList.contains('high'),false);assert.equal(root.querySelector('.pop-head strong').textContent,'你标为真人');assert.equal(root.querySelector('.scores'),null);
  }finally{env.close();}
});

test('a focal reply with an avatar/name/header row never mounts a full-width estimate inside that row',async()=>{
  // X detail view: the entire header is a sibling of the body. It is not an avatar column.
  const html='<article data-testid="tweet"><div class="original"><div class="detail-header" style="display:flex;flex-direction:row"><div data-testid="Tweet-User-Avatar">A</div><div data-testid="User-Name"><a href="/alice">Alice</a><span>@alice</span></div><button aria-label="更多">…</button></div><div dir="auto">Replying to @parent</div><div data-testid="tweetText">太强了，Lex 就是我名字的来源</div><a href="/alice/status/127"><time datetime="2026-10-18T10:00:00Z">下午7:59 · 2026年10月18日</time></a><div role="group"><button data-testid="reply">回复</button><button data-testid="bookmark">书签</button></div></div></article>';
  const env=mount(html,async()=>result(.17));try{const d=env.dom.window.document;
    await until(()=>d.querySelector('.qb-host')?.shadowRoot.querySelector('.disclosure'));
    assert.equal(d.querySelector('.detail-header .qb-host'),null,'the full-width host must not compete with the name');
    assert.equal(d.querySelector('.qb-host').dataset.qbPlace,'inline');
    assert.equal(d.querySelector('[data-testid="User-Name"]').textContent,'Alice@alice');
  }finally{env.close();}
});
