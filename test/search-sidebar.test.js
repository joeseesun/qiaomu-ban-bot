import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
const code=(await build({stdin:{contents:`import {createSearchSidebar} from './src/search-sidebar.js';window.sidebar=createSearchSidebar({send:m=>window.send(m),getOwner:()=>window.owner});window.sidebar.mount();`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const tick=()=>new Promise(r=>setTimeout(r,20));
test('searches mount below the native fixed search spacer, open native results, and persist editable conditions without requiring search syntax',async()=>{
  const dom=new JSDOM('<div data-testid="sidebarColumn"><div><div style="position:fixed"><form role="search"><input></form></div><div id="spacer"></div><section>趋势</section></div></div>',{url:'https://x.com/home',runScripts:'outside-only'}),calls=[];
  try{
    const w=dom.window;w.owner='me';w.send=async m=>{calls.push(m);return m.type==='sidebar-searches'?{items:[{name:'我的资料',filters:{from:'alice',media:'links'}}]}:{};};w.eval(code);await tick();
    const h=w.document.querySelector('.qx-search-sidebar'),root=h.shadowRoot;
    assert.equal(h.previousElementSibling.id,'spacer');assert.equal(w.document.querySelector('form[role=search]').contains(h),false);
    const a=[...root.querySelectorAll('a')].find(n=>n.textContent==='我收到的回复');assert.ok(new URL(a.href).searchParams.get('q').includes('to:me'));assert.equal(new URL(a.href).pathname,'/search');
    root.querySelector('[aria-label="添加自定义搜索"]').click();
    const field=k=>root.querySelector(`[name=${k}]`);field('name').value='研究';field('all').value='开源 工具';field('from').value='@alice';field('likes').value='50';field('period').value='7d';field('all').dispatchEvent(new w.Event('input',{bubbles:true}));
    const q=new URL(root.querySelector('.search-now').href).searchParams.get('q');assert.match(q,/^"开源" "工具" from:alice min_faves:50 since:/);
    assert.ok(root.querySelector('.summary').textContent.includes('作者 @alice'));assert.equal(root.querySelector('details').open,false);
    root.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
    assert.deepEqual(JSON.parse(JSON.stringify(calls.find(m=>m.type==='sidebar-search-save'))),{type:'sidebar-search-save',owner:'me',name:'研究',filters:{all:'开源 工具',from:'@alice',likes:'50',period:'7d',mode:'builder',raw:''}});
    assert.equal(root.querySelector('form').hidden,true);assert.equal(root.querySelectorAll('.links a').length,5);
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

test('builder validates input, offers raw syntax explicitly and transfers conditions to full settings',async()=>{
 const dom=new JSDOM('<div data-testid="sidebarColumn"><form role="search"><input></form></div>',{url:'https://x.com/search?q=from%3Aalice',runScripts:'outside-only'}),calls=[];
 try{const w=dom.window;w.owner='me';w.send=async m=>{calls.push(m);return m.type==='sidebar-searches'?{items:[]}:{};};w.eval(code);await tick();const root=w.document.querySelector('.qx-search-sidebar').shadowRoot,field=k=>root.querySelector(`[name=${k}]`);
 root.querySelector('[aria-label="添加自定义搜索"]').click();assert.equal(field('rawMode').checked,false);assert.equal(field('all').value,'');assert.equal(root.querySelector('.search-now').hasAttribute('href'),false);
 field('all').value='AI';field('likes').value='-1';field('likes').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(root.querySelector('.search-now').hasAttribute('href'),false);assert.match(root.querySelector('.summary').textContent,/整数/);
 field('likes').value='10';field('likes').dispatchEvent(new w.Event('input',{bubbles:true}));root.querySelector('[aria-label="高级搜索与管理"]').click();await tick();assert.equal(calls.at(-1).searchDraft.all,'AI');assert.equal(calls.at(-1).searchDraft.likes,'10');
 field('rawMode').click();assert.equal(field('raw').value,'"AI" min_faves:10');assert.equal(field('raw').hidden,false);field('raw').value='(AI OR 开源) min_faves:50';root.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(calls.find(m=>m.type==='sidebar-search-save').filters.mode,'raw');
 root.querySelector('[aria-label="添加自定义搜索"]').click();field('all').value='private draft';w.owner='other';w.sidebar.mount();assert.equal(field('all').value,'');assert.equal(root.querySelector('form').hidden,true);
 }finally{dom.window.close();}
});
