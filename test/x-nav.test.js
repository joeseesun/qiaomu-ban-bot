import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {customItem,linkTarget,mergeSeen,navCSS,navRows,normalizeNav,readNav,INBOX_KEY} from '../src/x-nav.js';
const bundle=async(entry,extra={})=>(await build({entryPoints:[entry],bundle:true,write:false,format:'iife',target:'chrome120',...extra})).outputFiles[0].text;
const [content,uiCode,background]=await Promise.all([bundle('src/x-nav-content.js'),bundle('src/ui-xnav.js',{globalName:'XNavUI'}),bundle('src/background.js')]);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await delay(15);}throw Error('x-nav did not settle');}
const NAV=`<header role="banner"><nav role="navigation" aria-label="主要">
 <a href="/home" data-testid="AppTabBar_Home_Link"><svg viewBox="0 0 24 24"><path d="M12 2 2 10v12h20V10z"></path></svg><div dir="ltr"><span>主页</span></div></a>
 <a href="/explore" data-testid="AppTabBar_Explore_Link"><svg viewBox="0 0 24 24"><path d="M10 3a7 7 0 1 0 0 14z" onclick="alert(1)"></path><path d="javascript:alert(1)"></path></svg><div dir="ltr"><span>探索</span></div></a>
 <a href="/notifications" data-testid="AppTabBar_Notifications_Link" aria-label="通知（3 条未读）"><div dir="ltr"><span>通知</span></div></a>
 <a href="/i/grok" aria-label="Grok"><div dir="ltr"><span>Grok</span></div></a>
 <div><a href="/i/money?ref=nav"><div dir="ltr"><span>Money</span></div></a></div>
 <a href="/me" data-testid="AppTabBar_Profile_Link"><div dir="ltr"><span>个人资料</span></div></a>
 <button data-testid="AppTabBar_More_Menu"><span>更多</span></button>
</nav></header><main data-testid="primaryColumn"></main>`;

test('native entries are keyed by test id or path, never by translated text, and icons keep only path data',()=>{
  const d=new JSDOM(NAV).window.document,items=readNav(d.querySelector('nav'));
  assert.deepEqual(items.map(i=>i.key),['testid:AppTabBar_Home_Link','testid:AppTabBar_Explore_Link','testid:AppTabBar_Notifications_Link','href:/i/grok','href:/i/money','testid:AppTabBar_Profile_Link']);
  assert.equal(items[2].label,'通知');assert.equal(items[4].label,'Money');
  assert.deepEqual(items[1].icon,{viewBox:'0 0 24 24',paths:['M10 3a7 7 0 1 0 0 14z']});
  assert.ok(!items.some(i=>i.key.includes('More')),'"More" stays as the escape hatch');
  const merged=mergeSeen([{key:'href:/i/premium',label:'订阅'},{key:'testid:AppTabBar_Home_Link',label:'Home'},{key:'custom:x',label:'bad'},{key:'href:/a b',label:'bad'}],items);
  assert.deepEqual(merged.map(i=>i.key).slice(-2),['testid:AppTabBar_Profile_Link','href:/i/premium']);assert.equal(merged[0].label,'主页');assert.equal(merged.length,7);
});

test('custom links accept https, X paths and plugin pages only',()=>{
  assert.equal(linkTarget('https://x.com/i/lists/9?x=1'),'/i/lists/9?x=1');
  assert.equal(linkTarget('/i/lists/9'),'/i/lists/9');
  assert.equal(linkTarget('example.com/a'),'https://example.com/a');
  assert.equal(linkTarget('qiaomu:posts'),'qiaomu:posts');
  for(const bad of['javascript:alert(1)','http://example.com','//evil.com','data:text/html,1','qiaomu:../../x',' '])assert.throws(()=>linkTarget(bad),bad);
  const item=customItem({name:'  列表  ',url:'/i/lists/1',icon:{type:'lucide',value:'NotAnIcon'},newTab:true});
  assert.equal(item.name,'列表');assert.deepEqual(item.icon,{type:'lucide',value:'Link'});assert.equal(item.newTab,true);
  assert.equal(customItem({name:'发帖',url:'qiaomu:posts',newTab:true}).newTab,false);
  assert.throws(()=>customItem({name:'x',url:'/a',icon:{type:'image',value:'data:image/svg+xml;base64,PHN2Zz4='}}));
  assert.throws(()=>customItem({name:'',url:'/a'}));
  const config=normalizeNav({hidden:['href:/i/grok','custom:gone','bad key',INBOX_KEY],order:['custom:gone','testid:AppTabBar_Home_Link'],custom:[{id:'a',name:'A',url:'/a'},{id:'a',name:'dup',url:'/b'}]});
  assert.deepEqual(config.hidden,['href:/i/grok',INBOX_KEY]);assert.deepEqual(config.order,['testid:AppTabBar_Home_Link']);assert.equal(config.custom.length,1);
});

test('settings rows follow the saved order and put the plugin entry after Explore by default',()=>{
  const seen=[{key:'testid:AppTabBar_Home_Link',label:'主页'},{key:'testid:AppTabBar_Explore_Link',label:'探索'},{key:'href:/i/grok',label:'Grok'}];
  const config=normalizeNav({hidden:['href:/i/grok'],custom:[{id:'a',name:'A',url:'/a'}]});
  assert.deepEqual(navRows(config,seen).map(r=>r.key),['testid:AppTabBar_Home_Link','testid:AppTabBar_Explore_Link',INBOX_KEY,'href:/i/grok','custom:a']);
  assert.equal(navRows(config,seen)[3].hidden,true);
  assert.deepEqual(navRows({...config,order:['custom:a','href:/i/grok']},seen).map(r=>r.key).slice(0,2),['custom:a','href:/i/grok']);
});

test('hide and order rules match X sidebar entries, including wrapped links',()=>{
  const css=navCSS(normalizeNav({hidden:['href:/i/money','testid:AppTabBar_Home_Link','custom:a',INBOX_KEY],order:['href:/i/grok','testid:AppTabBar_Home_Link'],custom:[{id:'a',name:'A',url:'/a'}]}));
  const d=new JSDOM(NAV).window.document,rules=css.split('\n');
  const matches=(rule,sel)=>[...d.querySelectorAll(rule.slice(0,rule.indexOf('{')).replace(/:is\(([^,]+),:has\([^)]*\)\)\)/,'$1'))].some(n=>n.matches(sel)||n.querySelector(sel));
  assert.ok(rules[0].endsWith('{display:none!important}')&&rules[0].includes(':has(a[href="/i/money"])'));
  assert.ok(matches(rules[1],'[data-testid=AppTabBar_Home_Link]'));
  assert.equal(rules.filter(r=>r.includes('display:none')).length,2,'plugin and custom entries are simply not mounted');
  assert.ok(css.includes('nav > *{order:1000}')&&css.includes('a[href="/i/grok"])){order:0}'));
});

function page(path='/home'){
  const dom=new JSDOM(NAV,{url:'https://x.com'+path,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],listeners=[];
  let config={hidden:['href:/i/grok'],order:[],custom:[{id:'list',name:'AI 列表',url:'/i/lists/7',icon:{type:'emoji',value:'🤖'}},{id:'site',name:'博客',url:'https://example.com',icon:{type:'lucide',value:'Globe'}},{id:'post',name:'发帖',url:'qiaomu:posts',icon:{type:'lucide',value:'Send'}}]};
  w.chrome={runtime:{sendMessage:async m=>{calls.push(m);return{ok:true,data:m.type==='x-nav-state'?config:{}};},onMessage:{addListener:f=>listeners.push(f)}}};
  return{dom,w,calls,set:c=>{config=c;},emit:m=>listeners.forEach(f=>f(m))};
}
test('X page: hidden entries get a style before render, plugin and custom entries mount in place, and the seen list is reported',async()=>{
  const p=page('/i/lists/7');const{w,calls}=p,d=w.document;
  try{
    w.eval(content);await until(()=>d.querySelectorAll('.qx-nav-host').length===4);
    assert.ok(d.getElementById('qx-nav-style').textContent.includes('a[href="/i/grok"]'));
    const nav=d.querySelector('nav'),kids=[...nav.children].map(n=>n.dataset.qxNav||n.dataset.testid||n.getAttribute('href')||'wrap');
    assert.deepEqual(kids,['AppTabBar_Home_Link','AppTabBar_Explore_Link',INBOX_KEY,'AppTabBar_Notifications_Link','/i/grok','wrap','AppTabBar_Profile_Link','custom:list','custom:site','custom:post','AppTabBar_More_Menu']);
    const link=id=>d.querySelector(`[data-qx-nav="custom:${id}"]`).shadowRoot.querySelector('a');
    assert.equal(link('list').getAttribute('aria-current'),'page');assert.equal(link('list').textContent,'🤖AI 列表');
    assert.equal(link('site').target,'_blank');assert.equal(link('site').rel,'noopener noreferrer');
    await until(()=>calls.some(m=>m.type==='x-nav-seen'));
    assert.deepEqual([...calls.find(m=>m.type==='x-nav-seen').items.map(i=>i.key)],['testid:AppTabBar_Home_Link','testid:AppTabBar_Explore_Link','testid:AppTabBar_Notifications_Link','href:/i/grok','href:/i/money','testid:AppTabBar_Profile_Link']);
    // Internal links stay inside X's single-page app.
    let popped=0;w.addEventListener('popstate',()=>popped++);
    p.set({hidden:[],order:[],custom:[{id:'home',name:'回主页',url:'/home',icon:{type:'lucide',value:'House'}}]});
    p.emit({type:'x-nav-changed'});await until(()=>d.querySelector('[data-qx-nav="custom:home"]'));
    const click=new w.MouseEvent('click',{bubbles:true,cancelable:true});d.querySelector('[data-qx-nav="custom:home"]').shadowRoot.querySelector('a').dispatchEvent(click);
    assert.equal(click.defaultPrevented,true);assert.equal(w.location.pathname,'/home');assert.equal(popped,1);
    assert.equal(d.querySelector('[data-qx-nav="custom:list"]'),null);
    // Plugin pages open through the extension.
    p.set({hidden:[INBOX_KEY],order:['custom:p','testid:AppTabBar_Home_Link'],custom:[{id:'p',name:'发帖',url:'qiaomu:posts',icon:{type:'lucide',value:'Send'}}]});p.emit({type:'x-nav-changed'});
    await until(()=>d.querySelector('[data-qx-nav="custom:p"]')&&!d.querySelector(`[data-qx-nav="${INBOX_KEY}"]`));
    assert.equal(d.querySelector('[data-qx-nav="custom:p"]').style.order,'0');
    d.querySelector('[data-qx-nav="custom:p"]').shadowRoot.querySelector('a').click();assert.deepEqual({...calls.at(-1)},{type:'options',page:'posts'});
    // X re-rendering the sidebar re-mounts entries on the new node.
    const fresh=nav.cloneNode(true);for(const n of fresh.querySelectorAll('.qx-nav-host'))n.remove();nav.replaceWith(fresh);
    await until(()=>fresh.querySelector('[data-qx-nav="custom:p"]'));assert.equal(d.querySelectorAll('.qx-nav-host').length,1);
  }finally{await delay(40);p.w.requestAnimationFrame=()=>0;p.dom.window.close();}
});

test('background keeps sidebar config admin-only and merges reports from X tabs',async()=>{
  let listener,store={};const id='nav-fixture',runtime={id,onConnect:{addListener(){}},getURL:p=>`chrome-extension://${id}/${p}`,onMessage:{addListener:f=>listener=f}},sent=[];
  const chrome={runtime,storage:{local:{setAccessLevel:async()=>{},get:async k=>Object.fromEntries((Array.isArray(k)?k:[k]).filter(x=>x in store).map(x=>[x,structuredClone(store[x])])),set:async v=>{Object.assign(store,structuredClone(v));}}},tabs:{onRemoved:{addListener(){}},query:async()=>[{id:1}],create:async()=>{},sendMessage:async(_t,m)=>{sent.push(m);}}};
  vm.runInNewContext(background,{atob,btoa,chrome,indexedDB:new IDBFactory(),IDBKeyRange,crypto,TextEncoder,URL,URLSearchParams,setTimeout,clearTimeout,structuredClone,AbortController,fetch:async()=>{throw Error('no network');}});
  const call=(message,who='admin')=>new Promise(resolve=>listener(message,who==='content'?{id,url:'https://x.com/home',tab:{id:1},frameId:0}:{id,url:runtime.getURL('ui.html')},resolve));
  assert.equal((await call({type:'x-nav-save',config:{hidden:['href:/i/grok']}},'content')).ok,false);
  assert.equal((await call({type:'x-nav-seen',items:[{key:'href:/i/grok',label:'Grok'}]})).ok,false);
  assert.equal((await call({type:'x-nav-seen',items:[{key:'href:/i/grok',label:'Grok'},{key:'javascript:x',label:'x'}]},'content')).ok,true);
  const saved=await call({type:'x-nav-save',config:{hidden:['href:/i/grok'],custom:[{id:'a',name:'A',url:'javascript:alert(1)'},{id:'b',name:'B',url:'/b'}]}});
  assert.deepEqual([...saved.data.custom.map(c=>c.id)],['b']);assert.deepEqual([...saved.data.seen.map(s=>s.key)],['href:/i/grok']);
  assert.deepEqual({...sent.at(-1)},{type:'x-nav-changed'});
  const forPage=(await call({type:'x-nav-state'},'content')).data;assert.equal(forPage.seen,undefined);assert.deepEqual([...forPage.hidden],['href:/i/grok']);
});

test('settings page toggles, reorders, adds and edits entries with focus kept on the control',async()=>{
  const dom=new JSDOM(await readFile('public/ui.html','utf8'),{url:'https://fixture.test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
  let state={hidden:[],order:[],custom:[],seen:[{key:'testid:AppTabBar_Home_Link',label:'主页',icon:{viewBox:'0 0 24 24',paths:['M1 1h2z']}},{key:'testid:AppTabBar_Explore_Link',label:'探索'},{key:'href:/i/grok',label:'Grok'}]};const notes=[];
  try{
    w.eval(uiCode);const ui=w.XNavUI.initXNavUI({send:async m=>{if(m.type==='x-nav-save')state={...normalizeNav(m.config),seen:state.seen};return state;},notice:m=>notes.push(m)});
    await ui.open();const rows=()=>[...d.querySelectorAll('.xnav-row')].map(r=>r.dataset.key);
    assert.deepEqual(rows(),['testid:AppTabBar_Home_Link','testid:AppTabBar_Explore_Link',INBOX_KEY,'href:/i/grok']);
    assert.equal(d.querySelector('.xnav-row svg path').getAttribute('d'),'M1 1h2z');
    const grok=()=>d.querySelector('[data-key="href:/i/grok"] input');grok().click();await until(()=>state.hidden.includes('href:/i/grok'));
    assert.equal(d.activeElement,grok());assert.ok(d.querySelector('[data-key="href:/i/grok"]').classList.contains('off'));
    d.querySelector('[data-key="href:/i/grok"] [data-action="上移"]').click();await until(()=>state.order.length);
    assert.deepEqual(rows().slice(2),['href:/i/grok',INBOX_KEY]);assert.equal(d.activeElement,d.querySelector('[data-key="href:/i/grok"] [data-action="上移"]'));
    d.getElementById('xnav-add').click();d.getElementById('xnav-name').value='列表';d.getElementById('xnav-url').value='javascript:alert(1)';
    d.getElementById('xnav-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await delay(10);
    assert.match(d.getElementById('xnav-error').textContent,/https/);
    [...d.querySelectorAll('.xnav-chip')].find(b=>b.textContent==='发帖').click();assert.equal(d.getElementById('xnav-url').value,'qiaomu:posts');
    d.querySelector('[data-icon-type="emoji"]').click();d.getElementById('xnav-emoji').value='📝';d.getElementById('xnav-emoji').dispatchEvent(new w.Event('input'));
    d.getElementById('xnav-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>state.custom.length===1);
    assert.deepEqual({...state.custom[0],id:''},{id:'',name:'发帖',url:'qiaomu:posts',icon:{type:'emoji',value:'📝'},newTab:false});
    assert.equal(rows().at(-1),'custom:'+state.custom[0].id,'a new link joins the end of a custom order');assert.equal(d.getElementById('xnav-editor').hidden,true);
    d.querySelector('.xnav-row:last-child [aria-label="编辑「发帖」"]').click();assert.equal(d.getElementById('xnav-emoji').value,'📝');
    d.getElementById('xnav-name').value='排期';d.getElementById('xnav-form').dispatchEvent(new w.Event('submit',{cancelable:true}));await until(()=>state.custom[0].name==='排期');
    assert.equal(state.custom.length,1);
    d.querySelector('.xnav-row:last-child [aria-label="删除「排期」"]').click();await until(()=>!state.custom.length&&!state.order.some(k=>k.startsWith('custom:')));
  }finally{dom.window.close();}
});
