import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
const [background,ui,content]=await Promise.all(['background','ui','workspace-content'].map(async name=>(await build({entryPoints:[`src/${name}.js`],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){for(let i=0;i<150;i++){if(await fn())return;await delay(15);}throw Error('workspace integration did not settle');}
const item=(id=1,kind='post')=>({id:String(id),handle:'alice',displayName:'艾丽丝',kind,text:'给 @me 的具体问题：如何排查缓存？ '+id,parent:'',metrics:{views:300,likes:8,replies:2,reposts:1}});
function environment(){
 let listener;const calls=[],opened=[],factory=new IDBFactory(),runtime={id:'workspace-fixture',getURL:p=>`chrome-extension://workspace-fixture/${p}`,onMessage:{addListener:f=>listener=f}};
 const chrome={runtime,storage:{local:{setAccessLevel:async()=>{},get:async()=>({banbot:{apiKey:'never-expose-fixture',settings:{provider:'typesafe'}}}),set:async()=>{}}},tabs:{query:async()=>[],create:async options=>{opened.push(options);},sendMessage:async()=>{}}};
 vm.runInNewContext(background,{chrome,indexedDB:factory,IDBKeyRange,crypto,TextEncoder,URL,URLSearchParams,setTimeout,clearTimeout,structuredClone,AbortController,fetch:async(url,init)=>{const payload=JSON.parse(init.body);calls.push({url,payload});return Response.json({model:'jev-integration-fixture',answers:Object.fromEntries(Object.keys(payload.questions).map(k=>[k,{type:'noul',noul:k==='originality'?.7:.85}])),usage:{input_tokens:10}});}});
 const dispatch=(message,url=runtime.getURL('ui.html'),who='admin')=>new Promise(resolve=>listener(message,{id:runtime.id,url,...(who==='content'?{tab:{id:1},frameId:0}:who==='frame'?{tab:{id:1},frameId:1}:{})},resolve));
 return{dispatch,runtime,chrome,factory,calls,opened};
}
const article=(id=1)=>`<article data-testid="tweet"><div><div data-testid="User-Name"><a href="/alice">艾丽丝</a><a href="/alice/status/${id}"><time datetime="2026-10-19T00:00:00Z">1 小时</time></a></div><div data-testid="tweetText">给 @me 的具体问题：如何排查缓存？ ${id}</div><div role="group"><button data-testid="like">8</button></div></div></article>`;
const body=(path='/home')=>new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/me"></a><a data-testid="AppTabBar_Explore_Link" href="/explore">探索</a><main data-testid="primaryColumn"><div data-testid="UserDescription">具体项目与实践</div>${[1,2,3,4,5].map(article).join('')}</main>`,{url:'https://x.com'+path,runScripts:'outside-only',pretendToBeVisual:true});
function attach(dom,env){const listeners=[];env.chrome.tabs.query=async()=>[{id:1}];env.chrome.tabs.sendMessage=async(_id,m)=>{for(const fn of listeners)fn(m);};dom.window.chrome={runtime:{sendMessage:m=>env.dispatch(m,dom.window.location.href,'content'),onMessage:{addListener:f=>listeners.push(f)}}};dom.window.IntersectionObserver=class{constructor(fn){this.fn=fn;}observe(target){this.fn([{target,isIntersecting:true}]);}unobserve(){}disconnect(){}};dom.window.eval(content);}
test('production background validates access, model contract and isolated persisted feature records',async()=>{
 const e=environment();
 for(const type of['workspace-page','workspace-configure','search-save','search-import','workspace-remove','inbox-update','inbox-compose','inbox-rank','forecast-summary'])assert.equal((await e.dispatch({type,owner:'me',store:'feedback'},'https://x.com/home','content')).ok,false,type);
 assert.equal((await e.dispatch({type:'workspace-state',owner:'me'},'https://x.com/home','frame')).ok,false);
 await e.dispatch({type:'workspace-configure',owner:'me',profile:{topics:'开源实际经验',enabled:true}});
 const score=await e.dispatch({type:'interest-analyze',owner:'me',item:item()},'https://x.com/home','content');assert.equal(score.ok,true);assert.equal(score.data.interest,.85);assert.equal(e.calls[0].url,'https://api.typesafe.ai/v1/systemone');assert.equal(e.calls[0].payload.messages,undefined);assert.equal(e.calls[0].payload.questions.interest.type,'noul');
 for(const message of [{type:'kol-analyze',owner:'me',handle:'alice',items:[1,2,3,4,5].map(i=>item(i))},{type:'kol-get',owner:'me',handle:'alice'},{type:'profile-note',owner:'me',handle:'alice',note:'retired'},{type:'workspace-page',owner:'me',store:'ratings'}])assert.equal((await e.dispatch(message)).ok,false,message.type);
 assert.equal(e.calls.length,1,'retired profile actions must never call a model');
 assert.equal((await e.dispatch({type:'inbox-add',source:'mention',owner:'me',item:item()},'https://x.com/home','content')).ok,false);
 assert.equal((await e.dispatch({type:'inbox-add',source:'mention',owner:'me',item:item()},'https://x.com/notifications/mentions','content')).ok,true);
 assert.equal(JSON.stringify(score).includes('never-expose-fixture'),false);
});
test('production settings save/edit/export searches, open native X queries, and process an inbox record',async()=>{
 const e=environment();await e.dispatch({type:'contacts-observe',owner:'me'},'https://x.com/home','content');await e.dispatch({type:'inbox-add',owner:'me',item:item()},'https://x.com/home','content');
 const dom=new JSDOM(await readFile('public/ui.html','utf8'),{url:e.runtime.getURL('ui.html')+'#workspace/search',runScripts:'outside-only',pretendToBeVisual:true});Object.assign(dom.window,{indexedDB:e.factory,IDBKeyRange,Blob,TextEncoder});dom.window.chrome={runtime:{sendMessage:m=>e.dispatch(m)}};dom.window.confirm=()=>true;dom.window.scrollTo=()=>{};
 const downloads=[],opened=[];dom.window.URL.createObjectURL=b=>{downloads.push(b);return'blob:fixture';};dom.window.URL.revokeObjectURL=()=>{};dom.window.HTMLAnchorElement.prototype.click=function(){opened.push({href:this.href,download:this.download});};
 try{dom.window.eval(ui);const d=dom.window.document;await until(()=>d.querySelector('#ws-owner').value==='me');assert.equal(d.querySelector('#ws-search-error').hidden,true);
 d.querySelector('#ws-all').value='开源 工具';d.querySelector('#ws-all').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.querySelector('#ws-search-name').value='我的研究';d.querySelector('#ws-save-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>d.querySelectorAll('.workspace-row').length===1);
 d.querySelector('#ws-search-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(new URL(opened.at(-1).href).searchParams.get('q'),'"开源" "工具"');
 d.querySelector('#ws-export').click();await until(()=>downloads.length===1);const exported=JSON.parse(await downloads[0].text());assert.equal(exported.items.length,1);assert.equal(exported.items[0].name,'我的研究');assert.equal(exported.items[0].owner,undefined);assert.ok(!JSON.stringify(exported).includes('never-expose-fixture'));
 dom.window.location.hash='workspace/inbox';await until(()=>d.querySelector('#ws-inbox-view').hidden===false&&d.querySelector('.workspace-row')?.textContent.includes('如何排查'));
 await until(()=>d.querySelector('#ws-inbox-detail button')&&!d.querySelector('#ws-inbox-detail').hidden);
 const note=d.querySelector('[aria-label="回复草稿"]');note.value='我的实际经验：先检查缓存。\n再试一次 & 确认 #细节';note.dispatchEvent(new dom.window.Event('input'));
 await until(async()=>(await e.dispatch({type:'workspace-page',store:'inbox',owner:'me'})).data.items[0]?.note===note.value);
 [...d.querySelectorAll('#ws-inbox-detail button')].find(b=>b.textContent==='填入 X 回复框').click();await until(()=>e.opened.length===1);
 const intent=new URL(e.opened[0].url);assert.equal(intent.origin,'https://x.com');assert.equal(intent.pathname,'/intent/post');assert.equal(intent.searchParams.get('in_reply_to'),'1');assert.equal(intent.searchParams.get('text'),note.value);
 assert.equal((await e.dispatch({type:'workspace-page',store:'inbox',owner:'me'})).data.items[0].status,'pending');
 [...d.querySelectorAll('#ws-inbox-detail button')].find(b=>b.textContent==='标为已处理').click();await until(()=>!d.querySelector('.workspace-row'));
 d.querySelector('[data-inbox-status="done"]').click();await until(()=>d.querySelector('#ws-inbox-detail')?.textContent.includes('恢复待回复'));assert.equal(d.querySelector('[aria-label="回复草稿"]').value,note.value);
 }finally{dom.window.close();}
});
test('real content controls preserve native nodes, persist feedback and detect recycled articles without navigating',async()=>{
 const e=environment(),dom=body('/notifications/mentions');await e.dispatch({type:'workspace-configure',owner:'me',profile:{topics:'具体工具'}});
 try{const d=dom.window.document,article=d.querySelector('article'),text=d.querySelector('[data-testid=tweetText]');attach(dom,e);
 await until(()=>article.querySelector('.qx-interest-host'));await until(async()=>(await e.dispatch({type:'workspace-page',store:'inbox',owner:'me'})).data.items.length===5);
 const root=()=>article.querySelector('.qx-interest-host')?.shadowRoot;root().querySelector('[aria-label="兴趣偏好与判断"]').click();assert.equal(e.calls.length,0);[...root().querySelectorAll('button')].find(b=>b.textContent==='重新判断').click();await until(()=>root().textContent.includes('兴趣估计 85%'));
 const originalHost=article.querySelector('.qx-interest-host'),human=root().querySelector('[data-label=yes]');human.click();await until(()=>human.getAttribute('aria-pressed')==='true');assert.equal(article.querySelector('.qx-interest-host'),originalHost,'broadcast must preserve the open popover and its focus');assert.equal(root().querySelector('.pop').hidden,false);assert.equal(d.querySelector('[data-testid=tweetText]'),text);assert.equal(dom.window.location.pathname,'/notifications/mentions');
 const reason=root().querySelector('select');reason.value='具体有用';reason.dispatchEvent(new dom.window.Event('change'));await until(async()=>(await e.dispatch({type:'workspace-page',store:'feedback',owner:'me'})).data.items[0]?.reason==='具体有用');assert.equal(article.querySelector('.qx-interest-host'),originalHost);
 assert.equal((await e.dispatch({type:'workspace-page',store:'feedback',owner:'me'})).data.items.length,1);human.click();await until(()=>human.getAttribute('aria-pressed')==='false');assert.equal((await e.dispatch({type:'workspace-page',store:'feedback',owner:'me'})).data.items.length,0);
 root().querySelector('[aria-label="关闭"]').click();assert.equal(root().querySelector('.pop').hidden,true);
 article.querySelector('a[href*=status]').href='/alice/status/9';text.textContent='另一个新的 @me 问题';await until(()=>article.querySelector('.qx-interest-host')?.shadowRoot!==human.getRootNode());assert.equal(root().querySelector('.trigger').textContent,'');
 }finally{dom.window.close();}
});
test('profile pages retain their description without injecting removed assessment or note actions',async()=>{
 const e=environment(),dom=body('/alice');try{attach(dom,e);await until(()=>dom.window.document.querySelector('.qx-search-entry'));await delay(30);
 assert.equal(dom.window.document.querySelector('.qx-profile-host'),null);assert.equal(e.calls.length,0);
 assert.equal(dom.window.document.querySelector('[data-testid=UserDescription]').textContent,'具体项目与实践');
 }finally{dom.window.close();}
});
test('retired interest UI stays hidden even for previously enabled profiles and does not spend model calls',async()=>{
 const e=environment(),dom=body();await e.dispatch({type:'workspace-configure',owner:'me',profile:{enabled:true,topics:'AI 工具'}});
 try{attach(dom,e);const d=dom.window.document;await until(()=>d.querySelector('.qx-interest-host'));await delay(30);
 assert.equal(d.querySelector('.qx-interest-host').shadowRoot.querySelector('[aria-label="兴趣偏好与判断"]').hidden,true);
 assert.equal(e.calls.length,0);
 assert.ok(d.querySelector('.qx-search-entry').shadowRoot.textContent.includes('待回复'));
 assert.equal(d.querySelector('.qx-search-entry').shadowRoot.textContent.includes('高级搜索'),false);
 }finally{dom.window.close();}
});

test('switching owners ignores a delayed old preference response and cannot overwrite the new profile',async()=>{
 const e=environment();for(const owner of['alpha','beta']){await e.dispatch({type:'contacts-observe',owner},'https://x.com/home','content');await e.dispatch({type:'workspace-configure',owner,profile:{topics:owner+' topic'}});}
 let release,block=false;const dom=new JSDOM(await readFile('public/ui.html','utf8'),{url:e.runtime.getURL('ui.html')+'#workspace/interests',runScripts:'outside-only',pretendToBeVisual:true});Object.assign(dom.window,{indexedDB:e.factory,IDBKeyRange,Blob,TextEncoder});dom.window.chrome={runtime:{sendMessage:m=>block&&m.type==='workspace-state'&&m.owner==='alpha'?new Promise(r=>release=async()=>r(await e.dispatch(m))):e.dispatch(m)}};
 try{dom.window.eval(ui);const d=dom.window.document;await until(()=>d.querySelector('#ws-topics').value==='beta topic');block=true;d.querySelector('#ws-owner').value='alpha';d.querySelector('#ws-owner').dispatchEvent(new dom.window.Event('change'));await until(()=>release);
 d.querySelector('#ws-owner').value='beta';d.querySelector('#ws-owner').dispatchEvent(new dom.window.Event('change'));await until(()=>d.querySelector('#ws-topics').value==='beta topic');await release();await delay(30);assert.equal(d.querySelector('#ws-topics').value,'beta topic');assert.equal(d.querySelector('#ws-owner').value,'beta');
 }finally{dom.window.close();}
});
test('a late content estimate never appears after the owner changes',async()=>{
 const e=environment(),dom=body();let release;const dispatch=e.dispatch;
 e.dispatch=(m,...rest)=>m.type==='interest-analyze'?new Promise(r=>release=async()=>r(await dispatch(m,...rest))):dispatch(m,...rest);
 try{attach(dom,e);const d=dom.window.document;await until(()=>d.querySelector('.qx-interest-host'));const old=d.querySelector('.qx-interest-host');old.shadowRoot.querySelector('[aria-label="兴趣偏好与判断"]').click();[...old.shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='重新判断').click();await until(()=>release);d.querySelector('[data-testid=AppTabBar_Profile_Link]').href='/other';await release();await delay(40);assert.equal(old.shadowRoot.querySelector('.trigger').textContent,'');assert.equal((await dispatch({type:'workspace-page',owner:'other',store:'feedback'})).data.items.length,0);
 }finally{dom.window.close();}
});

test('sidebar saves structured filters and full settings handoff keeps them editable',async()=>{
 const e=environment();const filters={all:'开源',from:'@alice',period:'7d',likes:'50'};
 const row=await e.dispatch({type:'sidebar-search-save',owner:'me',name:'我的资料',filters},'https://x.com/home','content');assert.equal(row.ok,true);assert.equal(row.data.filters.mode,'builder');assert.equal(row.data.filters.period,'7d');assert.equal(row.data.filters.likes,50);
 const list=await e.dispatch({type:'sidebar-searches',owner:'me'},'https://x.com/home','content');assert.equal(list.data.items[0].filters.from,'@alice');
 await e.dispatch({type:'options',page:'workspace/search',searchDraft:filters},'https://x.com/home','content');const draft=JSON.parse(new URLSearchParams(e.opened[0].url.split('?')[1]).get('draft'));assert.equal(draft.all,'开源');assert.equal(draft.likes,50);
 assert.equal((await e.dispatch({type:'sidebar-search-save',owner:'me',name:'无效',filters:{likes:-1}},'https://x.com/home','content')).ok,false);
});
