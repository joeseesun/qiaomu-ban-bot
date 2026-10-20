import { connectionFields, resolveConnection, sameCredentialTarget, mergeSettings } from './connection.js';
import { DEFAULTS, PROVIDERS, handleOf } from './core.js';
import { MemoryAnnotations } from './annotations.js';
import { Contacts } from './contacts.js';
import { initContactsUI } from './ui-contacts.js';
import { initForecastsUI } from './ui-forecasts.js';
import { Forecasts } from './forecasts.js';
import { Bookmarks } from './bookmarks.js';
import { initBookmarksUI } from './ui-bookmarks.js';
import { initWorkspaceUI } from './ui-workspace.js';
import { initCommunityUI } from './ui-community.js';
import { Workspace } from './workspace.js';
import { Features } from './features.js';
import { importSearches, SEARCH_TEMPLATES } from './search.js';
import { createElement, Bot, UserRoundCheck, RefreshCw, Eye, EyeOff, Trash2, MessageSquare, CodeXml, ArrowUpRight, History, ShieldCheck, UserRoundMinus, Plus, Pin, Copy, Pencil, Download, Search, SlidersHorizontal, MessageSquarePlus, AtSign, Bookmark, Flame, Sparkles, UsersRound, Tag, Cpu, Info } from 'lucide';
const glyphs={Bot,UserRoundCheck,RefreshCw,Eye,EyeOff,Trash2,MessageSquare,CodeXml,ArrowUpRight,History,ShieldCheck,UserRoundMinus,Plus,Pin,Copy,Pencil,Download,Search,SlidersHorizontal,MessageSquarePlus,AtSign,Bookmark,Flame,Sparkles,UsersRound,Tag,Cpu,Info};
const glyph=name=>createElement(glyphs[name],{width:17,height:17,'stroke-width':1.7,'aria-hidden':'true',focusable:'false'});
if('scrollRestoration' in history)history.scrollRestoration='manual';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const demo=location.protocol!=='chrome-extension:'&&params.has('demo');
if(params.has('popup'))document.body.classList.add('popup');
for(const node of document.querySelectorAll('[data-icon]'))node.append(glyph(node.dataset.icon));
let snapshot,keyEditing=false,keyVisible=false,keyEpoch=0,labelFilter='all',pageIndex=0,cursors=[null],nextCursor=null,labelsEpoch=0;
let authorFilter='ai',authorIndex=0,authorCursors=[null],authorNext=null,authorsEpoch=0;
const MASK='••••••••••••••••';
const demoLabels=new MemoryAnnotations();
let exportBookmarks;
const getBookmarks=()=>exportBookmarks??=(demo?new Bookmarks(indexedDB,'qiaomu-banbot-demo-bookmarks'):new Bookmarks());
const demoBookmarksReady=demo?getBookmarks().capture('demo_me',Array.from({length:25},(_,n)=>({id:String(30001+n),handle:'demo_author_'+(n%3),displayName:['开源观察站','产品随记','小夏同学'][n%3],text:['一个值得反复使用的小工具：把复杂的步骤，变成一次清晰的操作。\n这是模拟书签，方便预览导出效果。','做产品时，先找到那个每天都会发生的小麻烦。','留存思考的过程，比堆积链接更重要。'][n%3],publishedAt:Date.now()-86400000,partial:n===1,links:['https://example.com'],images:[]}))):Promise.resolve();
const demoContacts=demo?new Contacts(indexedDB,'qiaomu-banbot-demo-contacts'):null;
const demoForecasts=demo?new Forecasts(indexedDB,'qiaomu-banbot-demo-forecasts'):null;
const demoWorkspace=demo?new Workspace(indexedDB,IDBKeyRange,'qiaomu-x-helper-demo-workspace'):null;
const demoFeatures=demo?new Features(demoWorkspace,{evaluate:async(state,questions)=>({scores:Object.fromEntries(Object.keys(questions).map(k=>[k,k==='originality'?.78:k==='interaction'?.83:.86])),model:'示例模型',analyzedAt:Date.now()})}):null;
const demoWorkspaceReady=demo?(async()=>{
  await demoWorkspace.profile('demo_me',{topics:'AI 工具、独立开发、开源项目',avoid:'空泛广告',enabled:false});
  if(!(await demoWorkspace.page('searches','demo_me')).items.length){for(const t of SEARCH_TEMPLATES.slice(0,3))if(!t.ownerField)await demoWorkspace.saveSearch('demo_me',{name:t.name,category:t.category,filters:t.filters,pinned:true});}
  const item={id:'50001',handle:'demo_author',displayName:'开源观察站',kind:'post',text:'你在实际项目里怎样评估 AI 工具？想比较真实使用经验。',parent:'',metrics:{}};
  await demoWorkspace.queue('demo_me',item,{score:.88,pinned:true});
  await demoWorkspace.saveFeedback('demo_me',item,'yes','具体有用');
  await demoWorkspace.rate('demo_me','demo_author',{displayName:'开源观察站',dimensions:{content:.86,originality:.78,interaction:null},overall:83,postCount:8,replyCount:1,coverage:'partial',model:'示例模型',evidence:[{id:item.id,kind:'post',text:item.text}]});
})():Promise.resolve();
const demoForecastsReady=demo?demoForecasts.watch('demo_me',{id:'10001',handle:'demo_author',displayName:'开源观察站',text:'一个开源小工具，能把三个小时的重复工作缩短到几分钟。',createdAt:Date.now()-3600000,metrics:{views:320,likes:8,replies:2}}, {scores:{hot:.32},model:'演示模型'},30000):Promise.resolve();
const demoContactsReady=demo?Promise.all(Array.from({length:26},(_,n)=>demoContacts.put('demo_me',{handle:'friend_'+(n+1),displayName:['陈一 · 工具笔记','Lin / 产品随记','开源观察站','小夏同学','独立开发日常'][n%5],note:n<2?'一起做开源的朋友':'',pinned:n<2},{at:Date.now()-n*3600000}))):Promise.resolve();
const demoReady=demo?demoLabels.migrate(Array.from({length:65},(_,n)=>({key:'demo-'+String(n).padStart(3,'0'),id:String(100+n),handle:'reader_'+(n%25+1),displayName:['陈一 · 工具笔记','Lin / 产品随记','开源观察站','小夏同学','独立开发日常'][n%5],kind:'reply',text:n%2?'我在自己的项目里试过，缓存清理后就恢复正常了。这里补充一个具体使用体验。':'这个观点提供了全新的思考维度，值得我们继续深入探讨。',parent:'你用过这个工具吗？',label:n%2?'human':'ai',at:Date.now()-n*3600000,modelResult:{model:'演示数据',scores:{ai_written:n%2?.28:.83}}}))):Promise.resolve();
let demoState={settings:{...DEFAULTS,allowlist:['vista8'],blocklist:[]},configured:true,stats:{requests:38,cacheHits:126,inputTokens:18420},feedback:[],connection:{model:'jev-1.13.0',verifiedAt:Date.now()},lastModel:'jev-1.13.0',lastError:''};
async function send(message){
  if(demo){
    await demoReady;$('demo-note').hidden=false;
    if(message.type==='community-state')return{connected:false,subscribe:false,contribute:false,pending:0};
    if(message.type.startsWith('community-'))throw Error('预览不会连接社区，请在已安装扩展中使用。');
    if(message.type==='inbox-compose')throw Error('当前为模拟预览；已安装扩展会打开真实的 X 回复框。');
    if(message.type==='inbox-summary'){await demoWorkspaceReady;return demoWorkspace.inboxSummary(message.owner);}
    if(['workspace-state','workspace-page','workspace-configure','workspace-remove','search-save','search-import','inbox-update','inbox-rank','interest-label'].includes(message.type)){
      await demoWorkspaceReady;const w=demoWorkspace,m=message;
      if(m.type==='workspace-state')return w.profile(m.owner);
      if(m.type==='workspace-page')return w.page(m.store,m.owner,m);
      if(m.type==='workspace-configure')return w.profile(m.owner,m.profile);
      if(m.type==='workspace-remove')return w.remove(m.store,m.owner,m.id);
      if(m.type==='search-save')return w.saveSearch(m.owner,m.search);
      if(m.type==='search-import')return w.importSearches(m.owner,importSearches(m.value));
      if(m.type==='interest-label')return w.saveFeedback(m.owner,m.item,m.label,m.reason);
      if(m.type==='inbox-rank')return demoFeatures.rankInbox(m.owner,m.id);
      if(m.type==='inbox-update')return w.queue(m.owner,await w.get('inbox',m.owner,m.id),{status:m.status,pinned:m.pinned,note:m.note});
    }
    if(message.type==='forecast-summary'){await demoForecastsReady;return demoForecasts.summary(message.owner);}
    if(message.type.startsWith('bookmarks-')){await demoBookmarksReady;const b=getBookmarks();if(message.type==='bookmarks-state')return b.state();if(message.type==='bookmarks-page')return b.page(message);if(message.type==='bookmarks-edit')return b.edit(message.owner,message.id,message);if(message.type==='bookmarks-remove')return b.remove(message.owner,message.id);}
    if(message.type==='forecast-page'){await demoForecastsReady;return demoForecasts.page(message);}
    if(message.type==='forecast-remove')return demoForecasts.remove(message.owner,message.id);
    if(message.type.startsWith('contacts-')){
      await demoContactsReady;
      if(message.type==='contacts-state')return demoContacts.state(message.owner);
      if(message.type==='contacts-page')return demoContacts.page(message);
      if(message.type==='contacts-save')return demoContacts.put(message.owner,message.contact);
      if(message.type==='contacts-remove')return demoContacts.remove(message.owner,message.handle);
      if(message.type==='contacts-configure')return demoContacts.configure(message.owner,message.automatic);
    }
    if(message.type==='save'){demoState.settings={...demoState.settings,...message.settings};if(message.forgetKey){demoState.configured=false;demoState.connection=null;}}
    if(message.type==='connect'){demoState.settings={...demoState.settings,...message.settings};demoState.configured=true;demoState.connection={model:'演示模型',verifiedAt:Date.now()};}
    if(message.type==='reveal-key')return{apiKey:'demo-key-not-a-real-credential'};
    if(message.type==='list'){
      const h=handleOf(message.handle);if(!h)throw Error('请填写有效的 X 用户名');
      for(const k of ['allowlist','blocklist'])demoState.settings[k]=demoState.settings[k].filter(v=>v!==h);
      if(message.action!=='remove')demoState.settings[message.action==='allow'?'allowlist':'blocklist'].push(h);
    }
    if(message.type==='authors')return demoLabels.authorPage(message);
    if(message.type==='annotations')return{...await demoLabels.page(message),counts:await demoLabels.stats()};
    if(message.type==='edit-annotation'){
      const entry=await demoLabels.get(message.key);
      if(message.label)await demoLabels.put({...entry,label:message.label,at:Date.now()});else await demoLabels.remove(message.key);
      return{};
    }
    if(message.type==='clear')await demoLabels.clear();
    if(message.type==='test')return{scores:{ai_written:.94,useful:.08,spam:.02},model:'演示数据'};
    return structuredClone({...demoState,learningCount:(await demoLabels.stats()).total});
  }
  const response=await chrome.runtime.sendMessage(message);
  if(!response?.ok)throw Error(response?.error||'暂时无法连接扩展。请关闭后重新打开。');
  return response.data;
}
// Confirmations float briefly at the bottom; errors stay until the next action.
let noticeTimer=0;
function notice(text,error=false){clearTimeout(noticeTimer);$('notice').textContent=text;$('notice').className=error?'error':'';$('notice').hidden=!text;if(text&&!error)noticeTimer=setTimeout(()=>{$('notice').hidden=true;},2400);}
function bind(id,fn){$(id).addEventListener('click',async()=>{const b=$(id);b.disabled=true;notice('');try{await fn();}catch(e){notice(e.message,true);}finally{b.disabled=false;}});}
function hideKey(){keyEpoch++;if(!keyEditing&&savedForProvider())$('api-key').value=MASK;$('api-key').type='password';keyVisible=false;updateKeyButton();}
function updateKeyButton(){const b=$('toggle-key');b.replaceChildren(glyph(keyVisible?'EyeOff':'Eye'));const text=keyVisible?'隐藏密钥':'显示密钥';b.setAttribute('aria-label',text);b.title=text;b.setAttribute('aria-pressed',String(keyVisible));}
function connectionDraft(){return{provider:$('provider').value,model:$('model-name').value,baseURL:$('base-url').value,protocol:$('protocol').value};}
function savedForProvider(){return snapshot?.configured&&sameCredentialTarget(connectionDraft(),snapshot.settings);}
function renderKey(){
  hideKey();const saved=savedForProvider();
  $('api-key').readOnly=saved&&!keyEditing;
  if(saved&&!keyEditing)$('api-key').value=MASK;
  if(!saved&&!keyEditing)$('api-key').value='';
  $('api-key').placeholder='粘贴你的 API Key';
  $('key-badge').hidden=!saved;$('key-badge').textContent='已保存';
  $('key-status').textContent=saved?(keyEditing?'正在更换。新密钥验证成功前，继续使用已保存的密钥。':'密钥已保存并隐藏，无需重复填写。'):'仅保存在此浏览器。';
  $('change-key').hidden=!saved||keyEditing;$('forget-key').hidden=!saved;
  $('save-model').textContent=saved&&!keyEditing?'检查连接':'连接并保存';
}
function providerDetails(){
  const p=PROVIDERS[$('provider').value];$('key-help').textContent=p.help;
  $('get-key').hidden=!p.keyURL;if(p.keyURL)$('get-key').href=p.keyURL;
  try{$('provider-details').textContent='请求地址：'+resolveConnection(connectionDraft()).endpoint;}catch(e){$('provider-details').textContent=e.message;}
}
function fillConnection(settings){
  $('provider').value=settings.provider;const fields=connectionFields(settings);
  $('model-name').value=fields.model;$('base-url').value=fields.baseURL;$('protocol').value=fields.protocol;
  renderKey();providerDetails();
}
async function tab(name){
  document.body.classList.remove('inbox-workbench');
  const workspaceRoute=name.startsWith('workspace')?name:null;
  if(workspaceRoute)name='workspace';
  const contactsView=name==='contacts';if(contactsView)name='accounts';
  if(!['overview','rules','annotations','accounts','model','about','forecasts','bookmarks','workspace'].includes(name))name='overview';
  if(name!=='model')hideKey();
  for(const n of document.querySelectorAll('.panel'))n.hidden=n.id!==name;
  // Section ids double as hash routes, so the browser also jumps to the
  // section on load. Reset after that native scroll, too.
  document.documentElement.scrollTop=0;document.body.scrollTop=0;requestAnimationFrame(()=>scrollTo(0,0));
  for(const n of document.querySelectorAll('nav button')){n.classList.toggle('selected',n.dataset.tab===(name==='forecasts'?'overview':name));n.setAttribute('aria-current',n.dataset.tab===(name==='forecasts'?'overview':name)?'page':'false');}
  const route=workspaceRoute||(contactsView?'contacts':name);
  history.replaceState(null,'',`${location.pathname}${location.search}#${route}`);
  for(const a of document.querySelectorAll('.side-nav a')){if(a.dataset.tab===route.split('?')[0])a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  if(name==='workspace'){const [route,query='']=workspaceRoute.split('?');await workspaceUI.open(route.split('/')[1]||'search',new URLSearchParams(query).get('draft')||'');}
  if(name==='bookmarks')await bookmarksUI.open();
  if(name==='forecasts')await forecastsUI.open();
  if(name==='annotations')await loadLabels(true);
  if(name==='accounts'){
    $('contacts-view').hidden=!contactsView;$('account-statistics').hidden=contactsView;
    for(const b of document.querySelectorAll('[data-account-view]'))b.setAttribute('aria-pressed',String((b.dataset.accountView==='contacts')===contactsView));
    if(contactsView)await contactsUI.open();else{snapshot=await send({type:'snapshot'});renderAccounts();await loadAuthors(true);}
  }
}
const contactsUI=initContactsUI({send,notice,glyph});
const bookmarksUI=initBookmarksUI({send,notice,glyph,getStore:getBookmarks});
const forecastsUI=initForecastsUI({send,notice});
const workspaceUI=initWorkspaceUI({send,notice,glyph});
const communityUI=initCommunityUI({send,notice,demo});
$('open-forecasts').onclick=()=>tab('forecasts').catch(e=>notice(e.message,true));
for(const b of document.querySelectorAll('[data-account-view]'))b.onclick=()=>{notice('');void tab(b.dataset.accountView).catch(e=>notice(e.message,true));};
for(const b of document.querySelectorAll('nav button'))b.addEventListener('click',()=>{notice('');void tab(b.dataset.tab).catch(e=>notice(e.message,true));});
function renderAccounts(){
  for(const kind of ['allowlist','blocklist']){
    const container=$(kind);container.replaceChildren();
    if(!snapshot.settings[kind].length)container.textContent='暂无账号';
    for(const handle of snapshot.settings[kind]){
      const row=document.createElement('div');row.className='account-row';
      const name=document.createElement('span');name.textContent='@'+handle;
      const remove=document.createElement('button');remove.className='quiet';remove.textContent='移除';remove.setAttribute('aria-label',`移除 @${handle}`);
      remove.onclick=async()=>{remove.disabled=true;try{snapshot=await send({type:'list',handle,action:'remove'});renderAccounts();await loadAuthors();}catch(e){notice(e.message,true);remove.disabled=false;}};
      row.append(name,remove);container.append(row);
    }
  }
  $('feedback').replaceChildren();
  for(const f of(snapshot.feedback||[]).slice(0,10)){
    const row=document.createElement('div');row.className='feedback-row';const title=document.createElement('span');title.textContent=`@${f.handle} · ${f.label==='keep'?'保留':'折叠'}`;const text=document.createElement('p');text.textContent=f.excerpt;row.append(title,text);$('feedback').append(row);
  }
  if(!snapshot.feedback?.length)$('feedback').textContent='还没有手动操作。';
}
async function loadAuthors(reset=false){
  if(reset){authorCursors=[null];authorIndex=0;}
  const generation=++authorsEpoch,list=$('author-list');list.setAttribute('aria-busy','true');$('authors-prev').disabled=$('authors-next').disabled=true;
  try{
    const page=await send({type:'authors',label:authorFilter,before:authorCursors[authorIndex]});if(generation!==authorsEpoch)return;
    authorNext=page.next;list.replaceChildren();
    if(!page.items.length&&authorIndex>0){authorIndex--;await loadAuthors();return;}
    if(!page.items.length){const p=document.createElement('p');p.className='empty-state';p.textContent=`还没有${authorFilter==='ai'?' AI':'真人'}标注。你在 X 标注后，对应账号会出现在这里。`;list.append(p);}
    for(const [index,entry] of page.items.entries()){
      const row=document.createElement('article');row.className='author-row';row.dataset.handle=entry.handle;
      const rank=document.createElement('span');rank.className='author-rank';rank.textContent=String(authorIndex*20+index+1).padStart(2,'0');
      const info=document.createElement('div');info.className='author-info';const name=document.createElement('b');name.textContent=entry.displayName||'@'+entry.handle;
      const handle=document.createElement('span');handle.className='author-handle';handle.textContent=entry.displayName?'@'+entry.handle:'昵称尚未记录';info.append(name,handle);
      const counts=document.createElement('div');counts.className='author-counts';
      for(const [type,title] of [['ai','AI'],['human','真人']]){const count=document.createElement('span');count.className=type===authorFilter?'active':'';count.textContent=`${title} ${entry[type]}`;counts.append(count);}
      const head=document.createElement('div');head.className='author-head';head.append(rank,info,counts);
      const actions=document.createElement('div');actions.className='author-actions';
      for(const [action,title,icon,listKey] of [['block','本机屏蔽','UserRoundMinus','blocklist'],['allow','始终保留','ShieldCheck','allowlist']]){
        const selected=snapshot.settings[listKey].includes(entry.handle),b=document.createElement('button');b.className='secondary';b.append(glyph(icon),document.createTextNode(selected?title==='本机屏蔽'?'已屏蔽':'已保留':title));b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',`${selected?'取消':''}${title} @${entry.handle}`);
        b.onclick=async()=>{for(const n of actions.querySelectorAll('button'))n.disabled=true;try{snapshot=await send({type:'list',handle:entry.handle,action:selected?'remove':action});renderAccounts();await loadAuthors();notice(selected?'账号设置已取消。':`${title} @${entry.handle}。`);}catch(e){notice(e.message,true);for(const n of actions.querySelectorAll('button'))n.disabled=false;}};
        actions.append(b);
      }
      const link=document.createElement('a');link.className='author-profile';link.textContent=authorFilter==='human'?'去 X 关注':'主页 / 拉黑';link.append(glyph('ArrowUpRight'));link.title=authorFilter==='human'?'打开主页，在 X 选择关注':'打开主页，在 X 的更多菜单选择拉黑';link.href=`https://x.com/${entry.handle}`;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);
      row.append(head,actions);list.append(row);
    }
    $('authors-page').textContent=`第 ${authorIndex+1} 页 · 每页 20 个`;$('authors-prev').disabled=authorIndex===0;$('authors-next').disabled=!authorNext;
  }finally{if(generation===authorsEpoch)list.removeAttribute('aria-busy');}
}
for(const b of document.querySelectorAll('[data-author-filter]'))b.onclick=async()=>{authorFilter=b.dataset.authorFilter;for(const n of document.querySelectorAll('[data-author-filter]'))n.setAttribute('aria-pressed',String(n===b));try{await loadAuthors(true);}catch(e){notice(e.message,true);}};
bind('refresh-authors',async()=>{snapshot=await send({type:'snapshot'});renderAccounts();await loadAuthors(true);});
bind('authors-next',async()=>{if(!authorNext)return;authorCursors[++authorIndex]=authorNext;await loadAuthors();});
bind('authors-prev',async()=>{if(!authorIndex)return;authorIndex--;await loadAuthors();});
const PRESETS={70:'宽松',50:'标准',35:'严格'};
function thresholdCopy(){
  const value=$('threshold-number').value;
  $('threshold-value').textContent=`高于 ${value}% 隐藏，恰好 ${value}% 保留。`;
}
function render({connection=true}={}){
  const s=snapshot.settings;
  communityUI.set(s);
  for(const k of ['enabled','radar','duplicates','highlightUseful'])$(k).checked=s[k];
  $('spamGuard').checked=s.spamGuard!==false;$('hide-ai').checked=s.filterMode==='ai';
  for(const k of ['customRule','hotViews','dailyLimit'])$(k).value=s[k];
  const pct=Math.round(s.threshold*100);$('threshold-number').value=pct;thresholdCopy();
  for(const b of document.querySelectorAll('[data-threshold]'))b.setAttribute('aria-pressed',String(+b.dataset.threshold===pct));
  $('sensitivity-custom').hidden=!!PRESETS[pct];$('sensitivity-custom').textContent=`自定义 ${pct}%`;
  $('hide-ai-hint').textContent=s.filterMode!=='ai'?'现在只标出估计，不隐藏':({70:'宽松：只隐藏把握很大的，AI 估计高于 70%',50:'标准：AI 估计高于 50% 就隐藏',35:'严格：高于 35% 就隐藏，偶尔会误伤真人'})[pct]||`自定义：AI 估计高于 ${pct}% 就隐藏`;
  document.querySelector('.sensitivity').classList.toggle('muted',s.filterMode!=='ai');
  $('exceptions-summary').textContent=`始终显示 ${s.allowlist.length} 人 · 本机屏蔽 ${s.blocklist.length} 人`;
  $('radar-hint').textContent='依据发布时间、浏览增长及互动率，不设固定爆款门槛';
  $('annotations-summary').textContent=`${(snapshot.learningCount||0).toLocaleString()} 条，随时改标或导出`;
  $('model-summary').textContent=`${!snapshot.configured?'未连接模型，AI 判断暂不可用':snapshot.connection?'已连接 Jev':'密钥已保存'} · 今天 ${snapshot.stats.requests.toLocaleString()} 次`;
  $('status-title').textContent=!s.enabled?'已暂停，所有回复原样显示':'回复区正在保持安静';
  $('status-subtitle').textContent=!s.enabled?'打开开关，随时继续。':!snapshot.configured?(s.spamGuard!==false?'本机引流过滤已开启。连接模型后可判断 AI 回复。':'连接模型后可判断 AI 回复。'):s.filterMode==='label'?'只标出 AI 估计；本机词汇规则与手动屏蔽仍生效。':`AI 估计高于 ${Math.round(s.threshold*100)}% 的回复会折成一行，点一下就能展开。`;
  $('stat-requests').textContent=snapshot.stats.requests.toLocaleString();$('stat-labels').textContent=(snapshot.learningCount||0).toLocaleString();
  $('model-state').textContent=!snapshot.configured?'未连接模型':snapshot.connection?'已连接 Jev':'密钥已保存';
  document.body.classList.toggle('connected',!!snapshot.configured);
  if(connection)fillConnection(s);renderAccounts();
}
async function save(patch,forgetKey=false){snapshot=await send({type:'save',settings:patch,forgetKey});render({connection:forgetKey});}
for(const name of ['enabled','radar','duplicates','highlightUseful','spamGuard'])$(name).addEventListener('change',async()=>{try{await save({[name]:$(name).checked});notice('设置已保存。');}catch(e){$(name).checked=snapshot.settings[name]!==false;notice(e.message,true);}});
$('hide-ai').addEventListener('change',async()=>{try{await save({filterMode:$('hide-ai').checked?'ai':'label'});notice($('hide-ai').checked?'已开启隐藏 AI 回复。':'已关闭按 AI 分数隐藏。');}catch(e){render({connection:false});notice(e.message,true);}});
for(const b of document.querySelectorAll('[data-threshold]'))b.addEventListener('click',async()=>{try{await save({threshold:Number(b.dataset.threshold)/100});notice(`敏感度：${PRESETS[b.dataset.threshold]}。新的回复按这个标准隐藏。`);}catch(e){notice(e.message,true);}});
$('hotViews').addEventListener('change',async()=>{if(!$('hotViews').reportValidity())return;try{await save({hotViews:Number($('hotViews').value)});notice(`热帖目标：${snapshot.settings.hotViews.toLocaleString()} 浏览。`);}catch(e){notice(e.message,true);}});
$('threshold-number').addEventListener('input',()=>{if($('threshold-number').checkValidity())thresholdCopy();});
$('api-key').addEventListener('input',()=>{if(!$('api-key').readOnly)keyEditing=true;});
$('provider').addEventListener('change',()=>{keyEditing=false;$('api-key').value='';const provider=$('provider').value;fillConnection(provider===snapshot.settings.provider?snapshot.settings:{provider});$('advanced-connection').open=provider==='custom';});
for(const id of ['base-url','model-name','protocol'])$(id).addEventListener('input',()=>{providerDetails();renderKey();});
bind('change-key',()=>{hideKey();keyEditing=true;$('api-key').value='';renderKey();$('api-key').focus();});
bind('toggle-key',async()=>{
  if(keyVisible){hideKey();return;}
  const generation=++keyEpoch;
  if(savedForProvider()&&!keyEditing){const data=await send({type:'reveal-key'});if(generation!==keyEpoch)return;$('api-key').value=data.apiKey;}
  $('api-key').type='text';keyVisible=true;updateKeyButton();
});
bind('open-options',()=>{if(demo){document.body.classList.remove('popup');return tab('overview');}return chrome.runtime.openOptionsPage();});
bind('save-rules',async()=>{
  if(!$('threshold-number').reportValidity())return;
  await save({...communityUI.get(),threshold:Number($('threshold-number').value)/100,customRule:$('customRule').value});notice('规则已保存。新的回复会按你的设置整理。');
});
bind('save-usage',async()=>{if(!$('dailyLimit').reportValidity())return;await save({dailyLimit:Number($('dailyLimit').value)});notice(`每日上限已设为 ${snapshot.settings.dailyLimit.toLocaleString()} 次。`);});
bind('save-model',async()=>{
  const settings=connectionDraft(),connection=resolveConnection(settings),apiKey=savedForProvider()&&!keyEditing?'':$('api-key').value.trim();
  if(!apiKey&&!savedForProvider())throw Error('先粘贴这个服务商的 API Key。');
  const controls=['provider','model-name','base-url','protocol','api-key','forget-key','change-key','toggle-key'];controls.forEach(id=>$(id).disabled=true);$('save-model').textContent='正在验证…';
  try{
    if(!demo&&!await chrome.permissions.request({origins:[connection.origin]}))throw Error('需要允许访问模型服务，才能完成连接。原设置已保留。');
    notice('正在验证连接…');snapshot=await send({type:'connect',settings,apiKey});keyEditing=false;render();notice('已连接，密钥已保存。现在可以去 X 浏览了。');
  }finally{controls.forEach(id=>$(id).disabled=false);$('save-model').textContent=savedForProvider()&&!keyEditing?'检查连接':'连接并保存';}
});
bind('forget-key',async()=>{keyEditing=false;hideKey();await save({},true);notice('密钥已移除。需要时可以重新连接。');});
bind('clear-history',async()=>{if(!confirm('清空全部标注、手动记录和判断缓存？账号名单、密钥与今日用量会保留。'))return;snapshot=await send({type:'clear'});render();notice('本机记录与缓存已清空。');});
$('account-form').addEventListener('submit',async event=>{event.preventDefault();const handle=handleOf($('account-handle').value);if(!handle)return notice('请填写有效的 X 用户名，不需要完整链接。',true);try{snapshot=await send({type:'list',handle,action:event.submitter.value});$('account-handle').value='';renderAccounts();await loadAuthors();notice('账号设置已保存。');}catch(e){notice(e.message,true);}});
async function loadLabels(reset=false){
  if(reset){cursors=[null];pageIndex=0;}
  const generation=++labelsEpoch;$('annotation-list').setAttribute('aria-busy','true');$('labels-prev').disabled=$('labels-next').disabled=true;
  try{
    const page=await send({type:'annotations',label:labelFilter,before:cursors[pageIndex]});if(generation!==labelsEpoch)return;
    nextCursor=page.next;const list=$('annotation-list');list.replaceChildren();
    for(const [id,key] of [['all','total'],['ai','ai'],['human','human']])$('count-'+id).textContent=page.counts[key].toLocaleString();
    $('stat-labels').textContent=page.counts.total.toLocaleString();
    if(!page.items.length&&pageIndex>0){pageIndex--;await loadLabels();return;}
    if(!page.items.length){const empty=document.createElement('p');empty.className='empty-state';empty.textContent=page.counts.total?'这里还没有这类标注。':'在 X 回复下点机器人或真人图标，你的标注就会出现在这里。';list.append(empty);}
    for(const entry of page.items){
      const row=document.createElement('article');row.className='annotation-row';row.dataset.key=entry.key;
      const head=document.createElement('div');head.className='annotation-head';const author=document.createElement('b');author.textContent=(entry.displayName?entry.displayName+' · ':'')+'@'+entry.handle;const time=document.createElement('time');time.textContent=new Date(entry.at).toLocaleDateString();head.append(author,time);
      const text=document.createElement('p');text.className='annotation-text';text.textContent=entry.text;
      const actions=document.createElement('div');actions.className='annotation-actions';const group=document.createElement('div');group.className='label-choice';group.setAttribute('role','group');group.setAttribute('aria-label','修改标注');
      for(const [label,name,icon] of [['ai','AI','Bot'],['human','真人','UserRoundCheck']]){
        const b=document.createElement('button');b.append(glyph(icon),document.createTextNode(name));b.setAttribute('aria-pressed',String(entry.label===label));b.setAttribute('aria-label',`标记 @${entry.handle} 为${name}`);
        b.onclick=()=>changeLabel(entry,label,b);group.append(b);
      }
      actions.append(group);
      if(typeof entry.modelResult?.scores?.ai_written==='number'){const score=document.createElement('span');score.className='annotation-score';score.textContent=`原评分 ${Math.round(entry.modelResult.scores.ai_written*100)}%`;actions.append(score);}
      const link=document.createElement(demo?'span':'a');link.textContent='原帖 ↗';if(!demo){link.href=`https://x.com/${entry.handle}/status/${entry.id}`;link.target='_blank';link.rel='noopener noreferrer';}actions.append(link);
      const remove=document.createElement('button');remove.className='icon-control';remove.append(glyph('Trash2'));remove.title='移除标注';remove.setAttribute('aria-label',`移除 @${entry.handle} 的标注`);remove.onclick=()=>changeLabel(entry,null,remove);actions.append(remove);
      row.append(head,text,actions);list.append(row);
    }
    $('labels-page').textContent=`第 ${pageIndex+1} 页 · 每页 20 条`;$('labels-prev').disabled=pageIndex===0;$('labels-next').disabled=!nextCursor;
  }finally{if(generation===labelsEpoch)$('annotation-list').removeAttribute('aria-busy');}
}
async function changeLabel(entry,label,button){button.disabled=true;try{await send({type:'edit-annotation',key:entry.key,label});await loadLabels(false);notice(label?`已改为${label==='ai'?' AI':'真人'}。`:'标注已移除，原帖不受影响。');}catch(e){notice(e.message,true);button.disabled=false;}}
for(const b of document.querySelectorAll('[data-label-filter]'))b.onclick=async()=>{labelFilter=b.dataset.labelFilter;for(const n of document.querySelectorAll('[data-label-filter]'))n.setAttribute('aria-pressed',String(n===b));try{await loadLabels(true);}catch(e){notice(e.message,true);}};
bind('refresh-annotations',()=>loadLabels(true));
bind('labels-next',async()=>{if(!nextCursor)return;cursors[++pageIndex]=nextCursor;await loadLabels();});
bind('labels-prev',async()=>{if(!pageIndex)return;pageIndex--;await loadLabels();});
bind('test-model',async()=>{
  const text=$('test-text').value.trim();if(!text)throw Error('先粘贴一条回复。');$('test-result').hidden=false;$('test-result').textContent='正在判断…';
  try{const result=await send({type:'test',item:{id:'0',handle:'sandbox',kind:'reply',text,parent:$('test-parent').value,metrics:{}}});if(!result.scores)throw Error('设置刚刚有变化，请再试一次。');$('test-result').replaceChildren();
    for(const [key,title] of Object.entries({ai_written:'AI 概率',useful:'值得一读',spam:'引流推广',rule_match:'符合附加规则'}))if(key in result.scores){const row=document.createElement('div');row.className='score-row';const label=document.createElement('span');label.textContent=title;const value=document.createElement('b');value.textContent=`${Math.round(result.scores[key]*100)}%`;row.append(label,value);$('test-result').append(row);}
    const p=document.createElement('p');p.className='hint';p.textContent=`${demo?'演示分数':result.cached?'复用已有结果':'已收到模型判断'} · ${result.model}`;$('test-result').append(p);snapshot=await send({type:'snapshot'});$('stat-requests').textContent=snapshot.stats.requests.toLocaleString();
  }catch(e){$('test-result').textContent='这次没有收到判断。原设置未改变。';throw e;}
});
send({type:'snapshot'}).then(async data=>{snapshot=data;render();await tab(location.hash.slice(1));}).catch(e=>notice(e.message,true));
document.addEventListener('click',e=>{const row=e.target.closest('.settings-home a[data-tab], .side-nav a[data-tab]');if(!row||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();notice('');void tab(row.dataset.tab).catch(err=>notice(err.message,true));});
window.addEventListener('hashchange',()=>{if(snapshot)void tab(location.hash.slice(1)).catch(e=>notice(e.message,true));});
