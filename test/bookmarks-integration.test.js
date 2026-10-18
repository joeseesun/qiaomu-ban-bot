import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { DEFAULTS } from '../src/core.js';
const [background,ui,collector,content]=await Promise.all(['background','ui','bookmark-content','content'].map(async name=>(await build({entryPoints:[`src/${name}.js`],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{for(let i=0;i<180;i++){if(await fn())return;await wait(15);}throw Error('bookmark integration did not settle');};
const post=(id,text='正文',saved=true)=>`<article data-testid="tweet"><div data-testid="User-Name"><a href="/alice">艾丽丝</a></div><a href="/alice/status/${id}"><time datetime="2026-10-18T10:00:00Z"></time></a><div data-testid="tweetText">${text}</div>${saved?'<button data-testid="removeBookmark">已收藏</button>':''}</article>`;
function environment(){
  const factory=new IDBFactory();let listener,modelCalls=0;const runtime={id:'bookmark-test',getURL:p=>`chrome-extension://bookmark-test/${p}`,onMessage:{addListener:f=>listener=f}};
  const chrome={runtime,storage:{local:{setAccessLevel:async()=>{},get:async()=>({}),set:async()=>{}}},tabs:{query:async()=>[],create:async()=>{}}};
  vm.runInNewContext(background,{indexedDB:factory,IDBKeyRange,chrome,crypto,TextEncoder,URL,setTimeout,clearTimeout,structuredClone,AbortController,fetch:async()=>{modelCalls++;throw Error('must not call model');}});
  const dispatch=(m,url=runtime.getURL('ui.html'),isContent=false)=>new Promise(resolve=>listener(m,{id:runtime.id,url,...(isContent?{tab:{id:1},frameId:0}:{})},resolve));
  return{factory,runtime,dispatch,modelCalls:()=>modelCalls};
}
test('X collector requires start, records saved posts through real background, handles recycling and stops on account/route change',async()=>{
  const env=environment(),dom=new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/me"></a><main data-testid="primaryColumn"><div role="region">${post('1')}${post('2','推荐内容',false)}</div></main>`,{url:'https://x.com/i/history',runScripts:'outside-only',pretendToBeVisual:true});
  let captures=0;dom.window.chrome={runtime:{sendMessage:m=>{if(m.type==='bookmarks-capture')captures++;return env.dispatch(m,dom.window.location.href,true);}}};
  try{dom.window.eval(collector);const d=dom.window.document,root=()=>d.querySelector('.qm-bookmarks-host')?.shadowRoot;
    await until(()=>root());await wait(300);assert.equal(captures,0,'collecting is opt-in');root().querySelector('button').click();
    await until(()=>root().textContent.includes('本机 1 条'));assert.equal((await env.dispatch({type:'bookmarks-page',owner:'me'})).data.items.length,1);
    const a=d.querySelector('article');a.querySelector('a[href*="/status/"]').href='/alice/status/3';a.querySelector('[data-testid=tweetText]').firstChild.data='回收节点的新正文';
    await until(()=>root().textContent.includes('本机 2 条'));
    d.querySelector('[data-testid=AppTabBar_Profile_Link]').href='/other';await until(()=>root().querySelector('button').getAttribute('aria-pressed')==='false');
    assert.equal((await env.dispatch({type:'bookmarks-page',owner:'other'})).data.count,0);
    root().querySelector('button').click();await until(()=>root().textContent.includes('本机 1 条'));
    dom.window.history.pushState(null,'','/i/history/likes');dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));await until(()=>!root());const count=captures;
    d.querySelector('article [data-testid=tweetText]').textContent='喜欢页';await wait(300);assert.equal(captures,count);
    assert.equal((await env.dispatch({type:'bookmarks-capture',owner:'me',items:[]},dom.window.location.href,true)).ok,false);
    for(const type of ['bookmarks-page','bookmarks-state','bookmarks-edit','bookmarks-remove'])assert.equal((await env.dispatch({type,owner:'me',id:'1'},'https://x.com/i/bookmarks',true)).ok,false);
    assert.equal(env.modelCalls(),0);
  }finally{dom.window.close();}
});
test('collector retries failed writes without marking them as saved',async()=>{
  const dom=new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/me"></a><main data-testid="primaryColumn"><div role="region">${post('1')}</div></main>`,{url:'https://x.com/i/bookmarks',runScripts:'outside-only',pretendToBeVisual:true});let count=0;
  dom.window.chrome={runtime:{sendMessage:async()=>++count===1?{ok:false,error:'磁盘已满'}:{ok:true,data:{count:1}}}};
  try{dom.window.eval(collector);const root=dom.window.document.querySelector('.qm-bookmarks-host').shadowRoot;root.querySelector('button').click();await until(()=>root.textContent.includes('磁盘已满'));assert.equal(root.querySelector('button').getAttribute('aria-pressed'),'false');root.querySelector('button').click();await until(()=>root.textContent.includes('本机 1 条'));assert.equal(count,2);}finally{dom.window.close();}
});
test('settings search, notes, export download and removal use persistent data without model calls',async()=>{
  const env=environment();await env.dispatch({type:'bookmarks-capture',owner:'me',items:Array.from({length:25},(_,n)=>({id:String(100+n),handle:'alice',displayName:'艾丽丝',text:'收藏正文 '+n}))},'https://x.com/i/bookmarks',true);
  const dom=new JSDOM(await readFile('public/ui.html','utf8'),{url:env.runtime.getURL('ui.html')+'#bookmarks',runScripts:'outside-only',pretendToBeVisual:true});
  Object.assign(dom.window,{indexedDB:env.factory,IDBKeyRange,TextEncoder,Blob});dom.window.chrome={runtime:{sendMessage:m=>env.dispatch(m)}};dom.window.confirm=()=>true;
  let downloaded;dom.window.URL.createObjectURL=blob=>{downloaded=blob;return'blob:fixture';};dom.window.URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){assert.match(this.download,/x-bookmarks-me-.*\.md/);};
  try{dom.window.eval(ui);const d=dom.window.document;await until(()=>d.querySelectorAll('.bookmark-row').length===20);assert.equal(d.querySelector('#bookmarks-count').textContent,'本机已收集 25 条');
    d.querySelector('#bookmarks-next').click();await until(()=>d.querySelectorAll('.bookmark-row').length===5);
    d.querySelector('.bookmark-row button[aria-label="添加备注与标签"]').click();d.querySelector('#bookmark-note').value='我的阅读想法';d.querySelector('#bookmark-tags').value='开源，工具';d.querySelector('#bookmark-edit-save').click();await until(()=>d.querySelector('.bookmark-note')?.textContent==='我的阅读想法');
    d.querySelector('#bookmark-search').value='阅读想法';d.querySelector('#bookmark-search').dispatchEvent(new dom.window.Event('input'));await until(()=>d.querySelectorAll('.bookmark-row').length===1&&d.querySelector('#bookmarks-export-label').textContent==='导出搜索结果');
    d.querySelector('#bookmarks-export').click();await until(()=>downloaded);const md=await downloaded.text();assert.ok(md.includes('本次导出：1 条'));assert.ok(md.includes('我的阅读想法'));assert.ok(md.includes('开源、工具'));assert.ok(!md.includes('undefined'));assert.equal(env.modelCalls(),0);
    await env.dispatch({type:'clear'});assert.equal((await env.dispatch({type:'bookmarks-page',owner:'me'})).data.count,25);
    d.querySelector('.bookmark-row button[aria-label="移除本机副本"]').click();await until(()=>d.querySelector('#bookmarks-count').textContent==='本机已收集 24 条');
  }finally{dom.window.close();}
});
test('bookmarks are excluded from the automatic model pipeline even with radar enabled',async()=>{
  for(const path of ['/i/bookmarks','/i/history']){
    const dom=new JSDOM(`<main data-testid="primaryColumn">${post('1')}</main>`,{url:'https://x.com'+path,runScripts:'outside-only',pretendToBeVisual:true});const calls=[];
    dom.window.chrome={runtime:{sendMessage:async m=>{calls.push(m.type);return{ok:true,data:{settings:{...DEFAULTS,radar:true},configured:true}};},onMessage:{addListener(){}}}};
    dom.window.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(target){this.fn([{target,isIntersecting:true}]);}unobserve(){}disconnect(){}};
    try{dom.window.eval(content);await wait(200);assert.deepEqual(calls,['snapshot']);assert.equal(dom.window.document.querySelector('.qb-host'),null);}finally{dom.window.close();}
  }
});
