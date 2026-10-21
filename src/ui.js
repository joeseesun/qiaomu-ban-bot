import { connectionFields, resolveConnection, sameCredentialTarget, mergeSettings } from './connection.js';
import { DEFAULTS, PROVIDERS, handleOf } from './core.js';
import { MemoryAnnotations } from './annotations.js';
import { backupFile,parseBackup,backupSummary } from './backup.js';
import { accountHandles } from './account-rules.js';
import { Contacts } from './contacts.js';
import { initContactsUI } from './ui-contacts.js';
import { Bookmarks } from './bookmarks.js';
import { initBookmarksUI } from './ui-bookmarks.js';
import { initWorkspaceUI } from './ui-workspace.js';
import { initPostsUI } from './ui-posts.js';
import { initCommunityUI } from './ui-community.js';
import { initXNavUI } from './ui-xnav.js';
import { normalizeNav } from './x-nav.js';
import { Workspace } from './workspace.js';
import { importSearches, SEARCH_TEMPLATES } from './search.js';
import { createElement, Bot, UserRoundCheck, RefreshCw, Eye, EyeOff, Trash2, MessageSquare, CodeXml, ArrowUpRight, History, ShieldCheck, UserRoundMinus, Plus, Pin, Copy, Pencil, Download, Search, SlidersHorizontal, MessageSquarePlus, AtSign, Bookmark, Flame, Sparkles, UsersRound, Tag, Cpu, Info, Settings , ImagePlus, Send, Check, X, PanelLeft } from 'lucide';
const glyphs={Bot,UserRoundCheck,RefreshCw,Eye,EyeOff,Trash2,MessageSquare,CodeXml,ArrowUpRight,History,ShieldCheck,UserRoundMinus,Plus,Pin,Copy,Pencil,Download,Search,SlidersHorizontal,MessageSquarePlus,AtSign,Bookmark,Flame,Sparkles,UsersRound,Tag,Cpu,Info,Settings,ImagePlus,Send,Check,X,PanelLeft};
const glyph=name=>createElement(glyphs[name],{width:17,height:17,'stroke-width':1.7,'aria-hidden':'true',focusable:'false'});
if('scrollRestoration' in history)history.scrollRestoration='manual';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const demo=location.protocol!=='chrome-extension:'&&params.has('demo');
if(params.has('popup'))document.body.classList.add('popup');
for(const node of document.querySelectorAll('[data-icon]'))node.append(glyph(node.dataset.icon));
let snapshot,keyEditing=false,keyVisible=false,keyEpoch=0,labelFilter='all',pageIndex=0,cursors=[null],nextCursor=null,labelsEpoch=0;
const MASK='••••••••••••••••';
const demoLabels=new MemoryAnnotations();
let exportBookmarks;
const getBookmarks=()=>exportBookmarks??=(demo?new Bookmarks(indexedDB,'qiaomu-banbot-demo-bookmarks'):new Bookmarks());
const demoBookmarksReady=demo?getBookmarks().capture('demo_me',Array.from({length:25},(_,n)=>({id:String(30001+n),handle:'demo_author_'+(n%3),displayName:['开源观察站','产品随记','小夏同学'][n%3],text:['一个值得反复使用的小工具：把复杂的步骤，变成一次清晰的操作。\n这是模拟书签，方便预览导出效果。','做产品时，先找到那个每天都会发生的小麻烦。','留存思考的过程，比堆积链接更重要。'][n%3],publishedAt:Date.now()-86400000,partial:n===1,links:['https://example.com'],images:[]}))):Promise.resolve();
const demoContacts=demo?new Contacts(indexedDB,'qiaomu-banbot-demo-contacts'):null;
const demoWorkspace=demo?new Workspace(indexedDB,IDBKeyRange,'qiaomu-x-helper-demo-workspace'):null;
const demoWorkspaceReady=demo?(async()=>{
  await demoWorkspace.profile('demo_me',{collectMentions:true});
  if(!(await demoWorkspace.page('searches','demo_me')).items.length){for(const t of SEARCH_TEMPLATES.slice(0,3))if(!t.ownerField)await demoWorkspace.saveSearch('demo_me',{name:t.name,category:t.category,filters:t.filters,pinned:true});}
  const item={id:'50001',handle:'demo_author',displayName:'开源观察站',kind:'post',text:'你在实际项目里怎样评估 AI 工具？想比较真实使用经验。',parent:'',metrics:{}};
  await demoWorkspace.queue('demo_me',item,{score:.88,pinned:true});
})():Promise.resolve();
const demoContactsReady=demo?Promise.all(Array.from({length:26},(_,n)=>demoContacts.put('demo_me',{handle:'friend_'+(n+1),displayName:['陈一 · 工具笔记','Lin / 产品随记','开源观察站','小夏同学','独立开发日常'][n%5],note:n<2?'一起做开源的朋友':'',pinned:n<2},{at:Date.now()-n*3600000}))):Promise.resolve();
const demoReady=demo?demoLabels.migrate(Array.from({length:65},(_,n)=>({key:'demo-'+String(n).padStart(3,'0'),id:String(100+n),handle:'reader_'+(n%25+1),displayName:['陈一 · 工具笔记','Lin / 产品随记','开源观察站','小夏同学','独立开发日常'][n%5],kind:'reply',text:n%2?'我在自己的项目里试过，缓存清理后就恢复正常了。这里补充一个具体使用体验。':'这个观点提供了全新的思考维度，值得我们继续深入探讨。',parent:'你用过这个工具吗？',label:n%2?'human':'ai',at:Date.now()-n*3600000,modelResult:{model:'演示数据',scores:{ai_written:n%2?.28:.83}}}))):Promise.resolve();
let demoState={settings:{...DEFAULTS,allowlist:['vista8'],blocklist:[]},configured:true,stats:{requests:38,cacheHits:126,inputTokens:18420},feedback:[],connection:{model:'jev-1.13.0',verifiedAt:Date.now()},lastModel:'jev-1.13.0',lastError:''};
const demoIcon=d=>({viewBox:'0 0 24 24',paths:[d]});
let demoNav={hidden:['href:/i/grok','href:/i/money'],order:[],custom:[{id:'demo1',name:'AI 列表',url:'/i/lists/123',icon:{type:'emoji',value:'🤖'},newTab:false}],seen:[
  {key:'testid:AppTabBar_Home_Link',label:'主页',icon:demoIcon('M12 2.5 2 10v11.5h7v-7h6v7h7V10z')},{key:'testid:AppTabBar_Explore_Link',label:'探索',icon:demoIcon('M10.5 3a7.5 7.5 0 1 0 4.6 13.4l5 5 1.4-1.4-5-5A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z')},
  {key:'testid:AppTabBar_Notifications_Link',label:'通知',icon:demoIcon('M12 2a7 7 0 0 0-7 7v4l-2 4h18l-2-4V9a7 7 0 0 0-7-7zm-3 17a3 3 0 0 0 6 0z')},{key:'testid:AppTabBar_DirectMessage_Link',label:'聊天',icon:null},
  {key:'href:/i/grok',label:'Grok',icon:null},{key:'href:/i/premium',label:'订阅',icon:null},{key:'href:/i/money',label:'Money',icon:null},{key:'href:/i/bookmarks',label:'书签',icon:null},{key:'testid:AppTabBar_Profile_Link',label:'个人资料',icon:null}]};
async function send(message){
  if(demo){
    await demoReady;$('demo-note').hidden=false;
    if(message.type==='backup-export'){const rows=[];let before=null;do{const page=await demoLabels.page({before});rows.push(...page.items);before=page.next;}while(before);return backupFile(demoState,{},rows,false);}
    if(message.type==='backup-preview')return backupSummary(parseBackup(message.value));
    if(message.type==='backup-restore')throw Error('界面预览不写入真实扩展配置。');
    if(message.type==='community-state')return{connected:false,subscribe:false,contribute:false,pending:0};
    if(message.type.startsWith('community-'))throw Error('预览不会连接社区，请在已安装扩展中使用。');
    if(message.type==='inbox-compose')throw Error('当前为模拟预览；已安装扩展会打开真实的 X 回复框。');
    if(message.type==='x-nav-state')return demoNav;
    if(message.type==='x-nav-save')return demoNav={...normalizeNav(message.config),seen:demoNav.seen};
    if(message.type==='posts-sync')return{};
    if(message.type==='inbox-summary'){await demoWorkspaceReady;return demoWorkspace.inboxSummary(message.owner);}
    if(['workspace-state','workspace-page','workspace-configure','workspace-remove','search-save','search-import','inbox-update'].includes(message.type)){
      await demoWorkspaceReady;const w=demoWorkspace,m=message;
      if(m.type==='workspace-state')return w.profile(m.owner);
      if(m.type==='workspace-page')return w.page(m.store,m.owner,m);
      if(m.type==='workspace-configure')return w.profile(m.owner,m.profile);
      if(m.type==='workspace-remove')return w.remove(m.store,m.owner,m.id);
      if(m.type==='search-save')return w.saveSearch(m.owner,m.search);
      if(m.type==='search-import')return w.importSearches(m.owner,importSearches(m.value));
      if(m.type==='inbox-update')return w.queue(m.owner,await w.get('inbox',m.owner,m.id),{status:m.status,pinned:m.pinned,note:m.note});
    }
    if(message.type.startsWith('bookmarks-')){await demoBookmarksReady;const b=getBookmarks();if(message.type==='bookmarks-state')return b.state();if(message.type==='bookmarks-page')return b.page(message);if(message.type==='bookmarks-edit')return b.edit(message.owner,message.id,message);if(message.type==='bookmarks-remove')return b.remove(message.owner,message.id);}
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
  const annotationsView=name==='annotations';
  if(annotationsView)name='accounts';
  if(name==='rules'){name='overview';$('advanced-rules').open=true;}
  if(['forecasts','workspace/interests','workspace/review'].includes(name))name='about';
  const modelView=name.startsWith('model/')?name.split('/')[1]:null;if(modelView)name='model';
  const workspaceRoute=name.startsWith('workspace')?name:null;
  if(workspaceRoute)name='workspace';
  const contactsView=name==='contacts';if(contactsView)name='accounts';
  if(!['overview','accounts','model','about','bookmarks','workspace','write','posts','xnav'].includes(name))name='overview';
  if(name!=='model')hideKey();
  for(const n of document.querySelectorAll('.panel'))n.hidden=n.id!==name;
  // Section ids double as hash routes, so the browser also jumps to the
  // section on load. Reset after that native scroll, too.
  document.documentElement.scrollTop=0;document.body.scrollTop=0;requestAnimationFrame(()=>scrollTo(0,0));
  for(const n of document.querySelectorAll('nav button[data-tab]')){n.classList.toggle('selected',n.dataset.tab===name);n.setAttribute('aria-current',n.dataset.tab===name?'page':'false');}
  const route=workspaceRoute||(contactsView?'contacts':modelView?'model/'+modelView:name);
  history.replaceState(null,'',`${location.pathname}${location.search}#${route}`);
  for(const a of document.querySelectorAll('.side-nav a')){if(a.dataset.tab===(contactsView?'accounts':name==='model'?'model':route.split('?')[0]))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
  if(name==='workspace'){const [route,query='']=workspaceRoute.split('?');await workspaceUI.open(route.split('/')[1]||'search',new URLSearchParams(query).get('draft')||'');}
  if(name==='bookmarks')await bookmarksUI.open();
  if(name==='posts')await postsUI.open();
  if(name==='xnav')await xnavUI.open();
  if(annotationsView)await openAnnotations();
  if(name==='model')showModel(modelView||'interpreter');
  if(name==='write')writerFrame('writing-drafts-frame','write');
  if(name==='accounts'){
    $('contacts-view').hidden=!contactsView;$('account-statistics').hidden=contactsView;
    for(const b of document.querySelectorAll('[data-account-view]'))b.setAttribute('aria-pressed',String((b.dataset.accountView==='contacts')===contactsView));
    if(contactsView)await contactsUI.open();else{snapshot=await send({type:'snapshot'});renderAccounts();}
  }
}
function writerFrame(slot,section){
  const container=$(slot);let frame=container.querySelector(`[data-section="${section}"]`);
  if(!frame){frame=document.createElement('iframe');frame.dataset.section=section;frame.title=section==='write'?'文章草稿':section==='interpreter'?'写作模型':section==='web-search'?'联网搜索':section==='image-sources'?'图库来源':'配图模型';frame.src=`settings.html?embed=1&section=${section}`;container.append(frame);}
  for(const other of container.children)other.hidden=other!==frame;
  if(section==='write')frame.contentDocument?.dispatchEvent(new Event('qiaomu-write-shown'));
}
window.addEventListener('focus',()=>{if(!$('write').hidden)$('writing-drafts-frame').querySelector('iframe')?.contentDocument?.dispatchEvent(new Event('qiaomu-write-shown'));});
function showModel(section){
  const writing=section!=='judgment';$('writing-model-frame').hidden=!writing;$('judgment-settings').hidden=writing;
  for(const b of document.querySelectorAll('[data-model-view]'))b.setAttribute('aria-pressed',String(b.dataset.modelView===section));
  if(writing)writerFrame('writing-model-frame',['image-models','web-search','image-sources'].includes(section)?section:'interpreter');
}
for(const b of document.querySelectorAll('[data-model-view]'))b.onclick=()=>{hideKey();showModel(b.dataset.modelView);history.replaceState(null,'',location.pathname+location.search+'#model/'+b.dataset.modelView);};
async function openAnnotations(){await loadLabels(true);if(!$('annotation-dialog').open){$('annotation-dialog').append($('notice'));$('annotation-dialog').showModal();}}
bind('open-annotations',openAnnotations);
$('close-annotations').onclick=()=>$('annotation-dialog').close();
$('annotation-dialog').addEventListener('close',()=>{$('app').insertBefore($('notice'),$('overview'));void send({type:'snapshot'}).then(data=>{snapshot=data;renderAccounts();}).catch(e=>notice(e.message,true));});
let pendingBackup=null;
bind('backup-export',async()=>{
 const value=await send({type:'backup-export',includeKeys:$('backup-keys').checked}),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`qiaomu-x-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('配置与标记数据已导出。');
});
$('backup-import').onclick=()=>$('backup-file').click();
$('backup-file').onchange=async()=>{pendingBackup=null;$('backup-preview').hidden=true;try{const file=$('backup-file').files[0];if(!file)return;if(file.size>20e6)throw Error('备份文件不能超过 20 MB');const value=JSON.parse(await file.text()),summary=await send({type:'backup-preview',value});pendingBackup={value,summary};$('backup-summary').textContent=`${summary.services} 个写作服务 · ${summary.models} 个文字模型 · ${summary.images} 个配图服务 · ${summary.accounts} 个账号规则 · ${summary.annotations} 条标记${summary.includesKeys?' · 含 API Key':''}`;$('backup-origins').textContent=summary.origins.map(v=>v.replace('/*','')).join('、')||'无模型服务地址';$('backup-preview').hidden=false;}catch(e){notice(e.message,true);}finally{$('backup-file').value='';}};
bind('backup-restore',async()=>{if(!pendingBackup)throw Error('请先选择配置文件');const {value,summary}=pendingBackup;if(!demo&&summary.origins.length&&!await chrome.permissions.request({origins:summary.origins}))throw Error('未允许访问备份中的模型服务，尚未恢复配置');const r=await send({type:'backup-restore',value,restorePreferences:$('backup-preferences').checked});pendingBackup=null;$('backup-preview').hidden=true;snapshot=await send({type:'snapshot'});render();for(const frame of document.querySelectorAll('.frame-slot iframe'))frame.remove();notice(`配置已恢复；新增 ${r.added} 条标记，保留 ${r.skipped} 条已有记录。`);});
$('backup-cancel').onclick=()=>{pendingBackup=null;$('backup-preview').hidden=true;};
const contactsUI=initContactsUI({send,notice,glyph});
const bookmarksUI=initBookmarksUI({send,notice,glyph,getStore:getBookmarks});
const workspaceUI=initWorkspaceUI({send,notice,glyph});
const postsUI=initPostsUI({send,notice,glyph,demo});
const xnavUI=initXNavUI({send,notice});
const communityUI=initCommunityUI({send,notice,demo});
for(const b of document.querySelectorAll('[data-account-view]'))b.onclick=()=>{notice('');void tab(b.dataset.accountView).catch(e=>notice(e.message,true));};
for(const b of document.querySelectorAll('nav button[data-tab]'))b.addEventListener('click',()=>{notice('');void tab(b.dataset.tab).catch(e=>notice(e.message,true));});
function renderAccounts(){
  $('current-accounts').textContent=snapshot.activeOwners?.length?`当前登录：${snapshot.activeOwners.map(h=>'@'+h).join('、')} · 自动跳过判断`:'打开已登录的 X 页面后，自动识别自己的账号。';
  for(const kind of ['allowlist','blocklist']){
    const container=$(kind);container.replaceChildren();
    const handles=accountHandles(snapshot.settings,kind==='allowlist'?'human':'ai');
    if(!handles.length)container.textContent='暂无账号';
    for(const handle of handles){
      const row=document.createElement('div');row.className='account-row';
      const name=document.createElement('span');name.textContent='@'+handle;
      const remove=document.createElement('button');remove.className='quiet';remove.textContent=kind==='blocklist'?'恢复显示':'恢复自动检测';remove.setAttribute('aria-label',`${remove.textContent} @${handle}`);
      remove.onclick=async()=>{remove.disabled=true;try{snapshot=await send({type:'list',handle,action:kind==='blocklist'?'allow':'remove'});renderAccounts();notice(kind==='blocklist'?'已恢复显示，以后跳过判断。':'已移除，下次重新判断。');}catch(e){notice(e.message,true);remove.disabled=false;}};
      row.append(name,remove);
      if(kind==='allowlist'){
        const change=document.createElement('button');change.className='quiet';change.textContent='改标为 AI';change.setAttribute('aria-label',`改标为 AI @${handle}`);
        change.onclick=async()=>{change.disabled=true;try{snapshot=await send({type:'list',handle,action:'block'});renderAccounts();notice('已折叠该账号，后续跳过判断。');}catch(e){notice(e.message,true);change.disabled=false;}};
        row.append(change);
      }
      container.append(row);
    }
  }
  $('feedback').replaceChildren();
  for(const f of(snapshot.feedback||[]).slice(0,10)){
    const row=document.createElement('div');row.className='feedback-row';const title=document.createElement('span');title.textContent=`@${f.handle} · ${f.label==='keep'?'保留':'折叠'}`;const text=document.createElement('p');text.textContent=f.excerpt;row.append(title,text);$('feedback').append(row);
  }
  if(!snapshot.feedback?.length)$('feedback').textContent='还没有手动操作。';
}
const PRESETS={70:'宽松',50:'标准',35:'严格'};
function thresholdCopy(){
  const value=$('threshold-number').value;
  $('threshold-value').textContent=`超过 ${value}% 时折叠`;
}
function render({connection=true}={}){
  const s=snapshot.settings;
  communityUI.set(s);
  for(const k of ['enabled','radar'])$(k).checked=s[k];
  $('spamGuard').checked=s.spamGuard!==false;$('hide-ai').checked=s.filterMode==='ai';
  for(const k of ['customRule','dailyLimit'])$(k).value=s[k];
  const pct=Math.round(s.threshold*100);$('threshold-number').value=pct;thresholdCopy();
  for(const b of document.querySelectorAll('[data-threshold]'))b.setAttribute('aria-pressed',String(+b.dataset.threshold===pct));
  $('sensitivity-custom').hidden=!!PRESETS[pct];$('sensitivity-custom').textContent=`自定义 ${pct}%`;
  $('hide-ai-hint').textContent=s.filterMode!=='ai'?'只显示判断结果':({70:'仅折叠把握较大的回复',50:'适合日常浏览',35:'折叠更多，可能误伤真人'})[pct]||`自定义阈值 ${pct}%`;
  document.querySelector('.sensitivity').classList.toggle('muted',s.filterMode!=='ai');
  $('radar-hint').textContent='帖子旁显示小火图标，查看速度、增长与互动';
  $('status-title').textContent=!s.enabled?'回复过滤已暂停':'回复过滤已开启';
  $('status-subtitle').textContent=!s.enabled?'打开开关继续过滤。':!snapshot.configured?'连接回复判断模型后，可折叠疑似 AI 回复。':'折叠的回复随时可以展开。';
  $('model-state').textContent=!snapshot.configured?'回复判断未连接':snapshot.connection?'回复判断已连接':'密钥已保存';
  document.body.classList.toggle('connected',!!snapshot.configured);
  if(connection)fillConnection(s);renderAccounts();
}
async function save(patch,forgetKey=false){snapshot=await send({type:'save',settings:patch,forgetKey});render({connection:forgetKey});}
for(const name of ['enabled','radar','spamGuard'])$(name).addEventListener('change',async()=>{try{await save({[name]:$(name).checked});notice('设置已保存。');}catch(e){$(name).checked=snapshot.settings[name]!==false;notice(e.message,true);}});
$('hide-ai').addEventListener('change',async()=>{try{await save({filterMode:$('hide-ai').checked?'ai':'label'});notice($('hide-ai').checked?'已开启疑似 AI 回复过滤。':'已关闭疑似 AI 回复过滤。');}catch(e){render({connection:false});notice(e.message,true);}});
for(const b of document.querySelectorAll('[data-threshold]'))b.addEventListener('click',async()=>{try{await save({threshold:Number(b.dataset.threshold)/100});notice(`敏感度：${PRESETS[b.dataset.threshold]}。新的回复按此过滤。`);}catch(e){notice(e.message,true);}});
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
// Popup shortcuts open the full settings page on the matching screen; on the settings page they just switch screens.
document.addEventListener('click',e=>{
  const link=e.target.closest('[data-open]');if(!link||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();notice('');
  const route=link.dataset.open;
  if(document.body.classList.contains('popup')&&!demo){void chrome.tabs.create({url:chrome.runtime.getURL('ui.html#'+route)}).then(()=>window.close());return;}
  document.body.classList.remove('popup');void tab(route).catch(err=>notice(err.message,true));
});
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
$('account-form').addEventListener('submit',async event=>{event.preventDefault();const handle=handleOf($('account-handle').value);if(!handle)return notice('请填写有效的 X 用户名，不需要完整链接。',true);try{snapshot=await send({type:'list',handle,action:event.submitter.value});$('account-handle').value='';renderAccounts();notice('账号设置已保存。');}catch(e){notice(e.message,true);}});
async function loadLabels(reset=false){
  if(reset){cursors=[null];pageIndex=0;}
  const generation=++labelsEpoch;$('annotation-list').setAttribute('aria-busy','true');$('labels-prev').disabled=$('labels-next').disabled=true;
  try{
    const page=await send({type:'annotations',label:labelFilter,before:cursors[pageIndex]});if(generation!==labelsEpoch)return;
    nextCursor=page.next;const list=$('annotation-list');list.replaceChildren();
    for(const [id,key] of [['all','total'],['ai','ai'],['human','human']])$('count-'+id).textContent=page.counts[key].toLocaleString();
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
async function changeLabel(entry,label,button){button.disabled=true;try{await send({type:'edit-annotation',key:entry.key,label});await loadLabels(false);notice(label?`已改为${label==='ai'?' AI':'真人'}。`:'标注已移除，账号名单已更新。');}catch(e){notice(e.message,true);button.disabled=false;}}
for(const b of document.querySelectorAll('[data-label-filter]'))b.onclick=async()=>{labelFilter=b.dataset.labelFilter;for(const n of document.querySelectorAll('[data-label-filter]'))n.setAttribute('aria-pressed',String(n===b));try{await loadLabels(true);}catch(e){notice(e.message,true);}};
bind('refresh-annotations',()=>loadLabels(true));
bind('labels-next',async()=>{if(!nextCursor)return;cursors[++pageIndex]=nextCursor;await loadLabels();});
bind('labels-prev',async()=>{if(!pageIndex)return;pageIndex--;await loadLabels();});
bind('test-model',async()=>{
  const text=$('test-text').value.trim();if(!text)throw Error('先粘贴一条回复。');$('test-result').hidden=false;$('test-result').textContent='正在判断…';
  try{const result=await send({type:'test',item:{id:'0',handle:'sandbox',kind:'reply',text,parent:$('test-parent').value,metrics:{}}});if(!result.scores)throw Error('设置刚刚有变化，请再试一次。');$('test-result').replaceChildren();
    for(const [key,title] of Object.entries({ai_written:'AI 概率',useful:'值得一读',spam:'引流推广',rule_match:'符合附加规则'}))if(key in result.scores){const row=document.createElement('div');row.className='score-row';const label=document.createElement('span');label.textContent=title;const value=document.createElement('b');value.textContent=`${Math.round(result.scores[key]*100)}%`;row.append(label,value);$('test-result').append(row);}
    const p=document.createElement('p');p.className='hint';p.textContent=`${demo?'演示分数':result.cached?'复用已有结果':'已收到模型判断'} · ${result.model}`;$('test-result').append(p);snapshot=await send({type:'snapshot'});
  }catch(e){$('test-result').textContent='这次没有收到判断。原设置未改变。';throw e;}
});
send({type:'snapshot'}).then(async data=>{snapshot=data;render();await tab(location.hash.slice(1));}).catch(e=>notice(e.message,true));
document.addEventListener('click',e=>{const row=e.target.closest('.settings-home a[data-tab], .side-nav a[data-tab]');if(!row||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();notice('');void tab(row.dataset.tab).catch(err=>notice(err.message,true));});
window.addEventListener('hashchange',()=>{if(snapshot)void tab(location.hash.slice(1)).catch(e=>notice(e.message,true));});
