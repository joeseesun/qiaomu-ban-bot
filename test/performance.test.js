import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {DEFAULTS} from '../src/core.js';
import {articleExtractor} from '../src/dom.js';
import {pageMutation} from '../src/page-mutations.js';
import vm from 'node:vm';
const bundle=async name=>(await build({entryPoints:[`src/${name}.js`],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const tweet=id=>`<article data-testid="tweet"><div><a href="/alice/status/${id}"><time>now</time></a><div data-testid="tweetText">Concrete discussion ${id}</div><div role="group"></div></div></article>`;
const fixture=html=>new JSDOM(`<body><a data-testid="AppTabBar_Profile_Link" href="/me">Me</a><aside id="noise">Other content</aside><main data-testid="primaryColumn">${html}</main></body>`,{url:'https://x.com/alice/status/100',runScripts:'outside-only',pretendToBeVisual:true});
test('author evidence is batched into at most 50 IDs per page message',async()=>{
  const code=(await build({stdin:{contents:"import {enrichItem} from './src/observations.js';window.enrichItem=enrichItem;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  const dom=fixture(''),requests=[];
  try{
    dom.window.postMessage=m=>requests.push(m);dom.window.eval(code);
    for(let i=0;i<120;i++)dom.window.enrichItem({id:String(100+i),handle:'alice',text:'fixture',kind:'post'});
    await pause(30);
    assert.equal(requests.length,3);
    assert.deepEqual(requests.map(r=>r.ids.length),[50,50,20]);
    assert.equal(new Set(requests.flatMap(r=>r.ids)).size,120);
    const row={id:'100',handle:'alice',author:{userId:'1',followers:12,observedAt:Date.now()}};
    dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:dom.window,origin:dom.window.location.origin,data:{channel:'qx-evidence-response',request:requests[0].request,rows:[row,{...row,id:'219',author:{...row.author,followers:999}}]}}));
    assert.equal(dom.window.enrichItem({id:'100',handle:'alice',text:'fixture',kind:'post'}).author.followers,12);
    assert.equal(dom.window.enrichItem({id:'219',handle:'alice',text:'fixture',kind:'post'}).author,undefined,'a response cannot populate IDs outside its batch');
  }finally{dom.window.close();}
});
test('unrelated sidebar mutations and non-bookmark scrolling do not scan the timeline',async()=>{
  const codes=await Promise.all(['content','workspace-content','mentions','bookmark-content'].map(bundle));
  const dom=fixture(Array.from({length:20},(_,i)=>tweet(100+i)).join(''));
  const observers=[],Observer=dom.window.MutationObserver;
  dom.window.MutationObserver=class extends Observer{constructor(callback){super(callback);observers.push(this);}};
  try{
    dom.window.IntersectionObserver=class{observe(){}unobserve(){}};
    dom.window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>({ok:true,data:m.type==='snapshot'?{settings:DEFAULTS,configured:false}:m.type==='workspace-state'?{collectMentions:false}:m.type==='inbox-status'?[]:{items:[]}})}};
    codes.forEach(code=>dom.window.eval(code));await pause(600);
    let scans=0;const original=dom.window.Document.prototype.querySelectorAll;
    dom.window.Document.prototype.querySelectorAll=function(selector){if(selector.includes('article[data-testid="tweet"]'))scans++;return original.call(this,selector);};
    for(let i=0;i<3;i++){dom.window.document.querySelector('#noise').textContent='Counter '+i;dom.window.dispatchEvent(new dom.window.Event('scroll'));await pause(270);}
    assert.equal(scans,0,'changes outside tweets/editors/navigation must not wake timeline scanning');
  }finally{observers.forEach(observer=>observer.disconnect());dom.window.close();}
});
test('one extraction batch reads timeline structure once and a fresh batch sees recycling and headings',()=>{
  const dom=fixture(tweet(100)+tweet(101)+'<h2>Discover more</h2>'+tweet(102));
  try{
    const main=dom.window.document.querySelector('main'),articles=[...main.querySelectorAll('article')];
    const original=main.querySelectorAll.bind(main);let reads=0;
    main.querySelectorAll=selector=>{if(selector.includes('article[data-testid="tweet"]'))reads++;return original(selector);};
    const extract=articleExtractor(dom.window.location.href);
    assert.deepEqual(articles.map(a=>extract(a).kind),['post','reply','unknown']);
    assert.equal(reads,1);
    articles[0].remove();main.querySelector('h2').remove();
    articles[1].querySelector('a').href='/alice/status/200';
    const next=articleExtractor('https://x.com/alice/status/200');
    assert.deepEqual(articles.slice(1).map(a=>next(a).kind),['post','reply']);
    assert.equal(reads,2,'new scans cannot retain stale node order or IDs');
  }finally{dom.window.close();}
});
test('mutation filtering preserves host updates, account switches and replacement subtrees',()=>{
  const dom=fixture(tweet(100));
  try{
    const d=dom.window.document,a=d.querySelector('article'),text=a.querySelector('[data-testid="tweetText"]'),host=d.createElement('span');host.className='qx-interest-host';
    const selector='article[data-testid="tweet"],[data-testid="AppTabBar_Profile_Link"]';
    assert.equal(pageMutation([{type:'childList',target:a,addedNodes:[host],removedNodes:[]}],selector),false);
    assert.equal(pageMutation([{type:'childList',target:text,addedNodes:[d.createTextNode('edited')],removedNodes:[]}],selector),true);
    assert.equal(pageMutation([{type:'attributes',target:d.querySelector('a')}],selector),true);
    assert.equal(pageMutation([{type:'childList',target:d.body,addedNodes:[],removedNodes:[d.querySelector('main')]}],selector),true);
    assert.equal(pageMutation([{type:'childList',target:d.querySelector('#noise'),addedNodes:[d.createTextNode('news')],removedNodes:[]}],selector),false);
  }finally{dom.window.close();}
});
test('long scans yield to the page and stop before visiting stale items',async()=>{
  const code=(await build({stdin:{contents:"import {scanPageItems} from './src/page-scan.js';globalThis.scanPageItems=scanPageItems;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  let elapsed=0,active=true,yields=0;const visited=[];
  const context={performance:{now:()=>elapsed},scheduler:{yield:async()=>{yields++;active=false;}}};
  vm.runInNewContext(code,context);
  await context.scanPageItems([1,2,3],item=>{visited.push(item);elapsed+=9;},()=>active);
  assert.equal(yields,1);assert.deepEqual(visited,[1]);
  active=true;elapsed=0;context.scheduler.yield=async()=>{yields++;};
  await context.scanPageItems([4,5],item=>{visited.push(item);elapsed+=9;},()=>active);
  assert.deepEqual(visited,[1,4,5],'current scans finish every item after yielding');
});
