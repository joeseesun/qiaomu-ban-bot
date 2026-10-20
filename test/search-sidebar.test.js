import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const code=(await build({stdin:{contents:`import {createSearchSidebar} from './src/search-sidebar.js';window.sidebar=createSearchSidebar({send:m=>window.send(m),getOwner:()=>window.owner});window.sidebar.mount();`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const tick=()=>new Promise(r=>setTimeout(r,20));
test('searches mount below the native fixed search spacer, open native results, and persist a custom query',async()=>{
  const dom=new JSDOM('<div data-testid="sidebarColumn"><div><div style="position:fixed"><form role="search"><input></form></div><div id="spacer"></div><section>趋势</section></div></div>',{url:'https://x.com/home',runScripts:'outside-only'}),calls=[];
  try{
    const w=dom.window;w.owner='me';w.send=async m=>{calls.push(m);return m.type==='sidebar-searches'?{items:[{name:'我的资料',filters:{from:'alice',media:'links'}}]}:{};};w.eval(code);await tick();
    const h=w.document.querySelector('.qx-search-sidebar'),root=h.shadowRoot;
    assert.equal(h.previousElementSibling.id,'spacer');assert.equal(w.document.querySelector('form[role=search]').contains(h),false);
    const a=[...root.querySelectorAll('a')].find(n=>n.textContent==='我收到的回复');assert.ok(new URL(a.href).searchParams.get('q').includes('to:me'));assert.equal(new URL(a.href).pathname,'/search');
    root.querySelector('[aria-label="添加自定义搜索"]').click();const [name,query]=root.querySelectorAll('input');name.value='研究';query.value='(AI OR 开源) min_faves:50';
    root.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.deepEqual(JSON.parse(JSON.stringify(calls.find(m=>m.type==='sidebar-search-save'))),{type:'sidebar-search-save',owner:'me',name:'研究',query:'(AI OR 开源) min_faves:50'});
    assert.equal(root.querySelector('form').hidden,true);assert.equal(root.querySelectorAll('a').length,5);
    w.sidebar.mount();assert.equal(w.document.querySelectorAll('.qx-search-sidebar').length,1);
  }finally{dom.window.close();}
});
test('a delayed saved-search response cannot leak the previous account into the new sidebar',async()=>{
  const dom=new JSDOM('<div data-testid="sidebarColumn"><form role="search"><input></form></div>',{url:'https://x.com/home',runScripts:'outside-only'});
  try{
    const w=dom.window;let resolve;w.owner='first';w.send=async()=>new Promise(r=>resolve=r);w.eval(code);
    w.owner='second';const first=resolve;w.sidebar.mount();first({items:[{name:'private first query',filters:{all:'first'}}]});resolve({items:[]});await tick();
    const root=w.document.querySelector('.qx-search-sidebar').shadowRoot;assert.ok(!root.textContent.includes('private first query'));assert.ok([...root.querySelectorAll('a')].some(a=>a.href.includes('to%3Asecond')));
  }finally{dom.window.close();}
});
