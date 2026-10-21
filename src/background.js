import { Engine } from './engine.js';
import { resolveConnection, mergeSettings } from './connection.js';
import { senderContext } from './context.js';
import { IndexedAnnotations } from './annotations.js';
import { Contacts } from './contacts.js';
import { Posts, blobChunk } from './posts.js';
import { backupFile,parseBackup,backupSummary,restoreBackup,BACKUP_KEYS } from './backup.js';
import { Bookmarks, bookmarkPath } from './bookmarks.js';
import { Workspace } from './workspace.js';
import { importSearches, normalizeSearch } from './search.js';
import { replyIntent } from './reply.js';
import { Community, COMMUNITY_ORIGIN } from './community.js';
import { handleOf, validateItem } from './core.js';
import { registerWriterBackground, writerMessage } from './writer/background';
import { NAV_KEY, SEEN_KEY, DEFAULT_NAV, normalizeNav, mergeSeen } from './x-nav.js';
registerWriterBackground();
const owners = new Map();
const bookmarks = new Bookmarks();
const contacts = new Contacts();
const posts = new Posts();
// A fill job binds one queued post to the X tab this extension opened for it.
const fillJobs = new Map();
const FILL_TTL = 30 * 60000;
const excerpt = text => (text || '').replace(/\s+/g, ' ').trim().slice(0, 90) || '（只有附件）';
async function notifyPages(){ try { await chrome.runtime.sendMessage({ type: 'posts-changed' }); } catch {} }
async function syncPosts(){
  const rows = await posts.all(), now = Date.now();
  if (!chrome.alarms) return;
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter(a => a.name.startsWith('post:')).map(a => chrome.alarms.clear(a.name)));
  for (const p of rows) if (p.status === 'queued' && p.remind && p.scheduledAt > now) await chrome.alarms.create('post:' + p.id, { when: p.scheduledAt });
  const due = rows.filter(p => p.status === 'queued' && p.scheduledAt && p.scheduledAt <= now).length;
  await chrome.action?.setBadgeBackgroundColor?.({ color: '#1d9bf0' });
  await chrome.action?.setBadgeText?.({ text: due ? String(Math.min(due, 99)) : '' });
}
async function openFill(id){
  const post = await posts.get(id); if (!post) throw Error('这条帖子已删除。');
  const tab = await chrome.tabs.create({ url: 'https://x.com/compose/post' });
  fillJobs.set(tab.id, { postId: post.id, mediaIds: new Set(post.mediaIds), pending: true, at: Date.now() });
  return { opened: true };
}
function jobFor(sender, postId){
  const job = fillJobs.get(sender.tab?.id);
  if (!job || Date.now() - job.at > FILL_TTL || (postId && job.postId !== postId)) throw Error('这次填入已过期，请回到发帖页重新点「填入 X」。');
  return job;
}
let notificationsBound = false;
function bindNotifications(){
  if (notificationsBound || !chrome.notifications) return; notificationsBound = true;
  const open = id => { if (id.startsWith('post:')) { void openFill(id.slice(5)).catch(() => {}); chrome.notifications.clear(id); } };
  chrome.notifications.onClicked.addListener(open);
  chrome.notifications.onButtonClicked.addListener(id => open(id));
}
bindNotifications();
chrome.permissions?.onAdded?.addListener(bindNotifications);
chrome.alarms?.onAlarm.addListener(async alarm => {
  if (!alarm.name.startsWith('post:')) return;
  const post = await posts.get(alarm.name.slice(5));
  await syncPosts();
  if (!post || post.status !== 'queued') return;
  bindNotifications();
  chrome.notifications?.create(alarm.name, { type: 'basic', iconUrl: 'icons/icon-128.png', title: '到时间发帖了', message: excerpt(post.text), buttons: [{ title: '填入 X' }], requireInteraction: true });
});
chrome.runtime.onStartup?.addListener(() => void syncPosts().catch(() => {}));
chrome.runtime.onInstalled?.addListener(() => void syncPosts().catch(() => {}));
const secure = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const engine = new Engine({
  get: async key => { await secure; return chrome.storage.local.get(key); },
  set: async value => { await secure; return chrome.storage.local.set(value); },
}, undefined, new IndexedAnnotations());
engine.activeOwners=owners;
const workspace=new Workspace();
const community=new Community({get:async k=>{await secure;return chrome.storage.local.get(k);},set:async v=>{await secure;return chrome.storage.local.set(v);}});
engine.communityEvidence=id=>community.evidence(id);
void community.sync();
async function share(item,label){try{const result=await community.enqueue(item,label);void community.sync();return result;}catch(e){return{shared:false,reason:e.message};}}
let navWrites=Promise.resolve();
const navStore=fn=>navWrites=navWrites.then(async()=>{await secure;return fn();});
const navState=async()=>{await secure;const v=await chrome.storage.local.get([NAV_KEY,SEEN_KEY]);return{...normalizeNav(v[NAV_KEY]||DEFAULT_NAV),seen:mergeSeen([],v[SEEN_KEY])};};
async function broadcast(message = {type:'refresh'}) {
  const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'] });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, message)));
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (writerMessage(message)) return;
  (async () => {
    const who = senderContext(sender, chrome.runtime);
    if (who === 'admin' && message?.action === 'qiaomuWriteFocus') {
      const tabs = await chrome.tabs.query({url:chrome.runtime.getURL('write.html')+'*'});
      const target = tabs.find(tab=>new URL(tab.url).searchParams.get('id')===message.id);
      if(target) await chrome.tabs.update(target.id,{active:true});
      return {};
    }
    if (who === 'none' || !message || typeof message.type !== 'string') throw new Error('消息来源无效');
    if(who==='content' && Object.hasOwn(message,'owner')) {
      const owner=handleOf(message.owner);
      if(owners.get(sender.tab.id)!==owner){owners.set(sender.tab.id,owner);engine.revision++;}
    }
    const owner=who==='content'?owners.get(sender.tab.id)||'':'';
    if (message.type === 'snapshot') return engine.snapshot(who === 'admin');
    if (message.type === 'classify') return engine.classify(message.item,message.force===true,owner);
    if (message.type === 'local-decision') return engine.localDecision(message.item,owner);
    if (message.type === 'list') {
      const item=message.item?validateItem(message.item):null;
      const result = await engine.listAction(item?.handle||message.handle, message.action,item?.author?.userId); await broadcast({type:'accounts-changed'}); return result;
    }
    if (message.type === 'feedback') { const result = await engine.feedback(message.item, message.label); await broadcast({type:'annotation-changed',id:message.item.id}); return result; }
    if (message.type === 'learn') {
      if(owner && handleOf(message.item?.handle)===owner)throw Error('自己的账号无需标记');
      const result = await engine.learn(message.item, message.label); const shared=await share(message.item,message.label); await broadcast({type:'accounts-changed'}); return {...result,...shared};
    }
    if (message.type === 'options') {
      if(['contacts','bookmarks','workspace','workspace/search','workspace/inbox','posts','write'].includes(message.page)){
        const draft=message.page==='workspace/search'&&message.searchDraft?'?'+new URLSearchParams({draft:JSON.stringify(normalizeSearch(message.searchDraft))}):'';
        await chrome.tabs.create({url:chrome.runtime.getURL('ui.html#'+message.page+draft)});
      }else await chrome.runtime.openOptionsPage();
      return {};
    }
    if(message.type==='x-nav-state'){const state=await navState();return who==='admin'?state:{hidden:state.hidden,order:state.order,custom:state.custom};}
    if(message.type==='x-nav-seen'&&who==='content')return navStore(async()=>{const v=await chrome.storage.local.get(SEEN_KEY);await chrome.storage.local.set({[SEEN_KEY]:mergeSeen(v[SEEN_KEY],message.items)});return{};});
    if(message.type==='x-nav-save'&&who==='admin'){const config=normalizeNav(message.config);await navStore(()=>chrome.storage.local.set({[NAV_KEY]:config}));await broadcast({type:'x-nav-changed'});return navState();}
    if(message.type==='workspace-state')return workspace.profile(message.owner);
    if(message.type==='sidebar-searches')return workspace.page('searches',message.owner,{limit:20,sort:'rank'});
    if(message.type==='sidebar-search-save'){
      const row=await workspace.saveSearch(message.owner,{name:message.name,filters:message.filters||{mode:'raw',raw:message.query},pinned:true});
      await broadcast({type:'searches-changed',owner:message.owner});return row;
    }
    if(message.type==='inbox-add'){
      if(message.source==='mention'){
        if(who!=='content'||!/^\/notifications(?:\/mentions)?\/?$/.test(new URL(sender.url).pathname))throw Error('自动提及仅限 X 通知页。');
        if(!(await workspace.profile(message.owner)).collectMentions)return{skipped:'paused'};
      }
      const row=await workspace.queue(message.owner,message.item,{source:message.source==='mention'?'mention':'manual'});await broadcast({type:'inbox-changed',owner:message.owner,id:message.item.id});return row;
    }
    if(message.type==='inbox-status'){if(!Array.isArray(message.ids)||message.ids.length>50)throw Error('待回复查询过多');return Promise.all(message.ids.filter(id=>/^\d{1,25}$/.test(id)).map(async id=>{const r=await workspace.get('inbox',message.owner,id);return{id,status:r?.status||null};}));}
    if(message.type==='inbox-summary')return workspace.inboxSummary(message.owner);
    if(message.type==='author-evidence'){
      const item=(await import('./core.js')).validateItem(message.item),rows=await engine.annotations.byAuthor({...item,id:''});
      return{ai:rows.filter(r=>r.label==='ai').length,human:rows.filter(r=>r.label==='human').length,sampleLimit:40,community:item.author?.userId?await community.evidence(item.author.userId).catch(()=>null):null};
    }
    if(message.type==='contacts-page')return contacts.page(message);
    if(message.type==='contacts-observe'&&who==='content')return contacts.observe(message.owner);
    if(message.type==='contacts-reply'&&who==='content'){if(!/^\d{1,25}$/.test(message.replyId||''))throw Error('缺少回复成功凭据');return contacts.put(message.owner,message.contact,{replyId:message.replyId});}
    if(message.type==='contacts-interact'&&who==='content')return contacts.interact(message.owner,message.contact,{kind:message.kind,postId:message.postId});
    if(who==='content'&&message.type==='posts-fill-pending'){
      const job=fillJobs.get(sender.tab.id);if(!job?.pending||Date.now()-job.at>120000)return null;job.pending=false;
      const post=await posts.get(job.postId);if(!post)return null;
      const media=(await Promise.all(post.mediaIds.map(id=>posts.media(id)))).filter(Boolean).map(({id,name,type,size})=>({id,name,type,size}));
      return{post:{id:post.id,text:post.text,scheduledAt:post.scheduledAt,nativeSchedule:post.nativeSchedule},media};
    }
    if(who==='content'&&message.type==='posts-media-chunk'){
      const job=jobFor(sender,message.postId);if(!job.mediaIds.has(message.mediaId)||!Number.isSafeInteger(message.offset)||message.offset<0)throw Error('附件请求无效。');
      const row=await posts.media(message.mediaId);if(!row)throw Error('附件已丢失，请重新添加。');return blobChunk(row.blob,message.offset);
    }
    if(who==='content'&&message.type==='posts-filled'){
      const job=jobFor(sender,message.id);if(!message.error)await posts.update(job.postId,{status:'filled',filledAt:Date.now()});await syncPosts();await notifyPages();return{};
    }
    if(who==='content'&&message.type==='posts-posted'){
      const job=jobFor(sender,message.id);if(!/^https:\/\/x\.com\/\w{1,15}\/status\/\d{1,25}$/.test(message.url||''))throw Error('帖子链接无效。');
      await posts.update(job.postId,{status:'posted',postedAt:Date.now(),postedUrl:message.url});fillJobs.delete(sender.tab.id);await syncPosts();await notifyPages();return{};
    }
    if(message.type==='contacts-refresh'&&who==='content')return contacts.refresh(message.owner,message.items);
    if(message.type==='contacts-use')return contacts.use(message.owner,message.handle);
    if(['bookmarks-status','bookmarks-configure','bookmarks-capture'].includes(message.type)&&who==='content'){
      if(!bookmarkPath(new URL(sender.url).pathname))throw Error('请打开 X 的书签页。');
      if(message.type==='bookmarks-status')return bookmarks.status(message.owner);
      if(message.type==='bookmarks-configure'){const result=await bookmarks.configure(message.owner,message.automatic);await broadcast({type:'bookmarks-preference',owner:message.owner,...result});return result;}
      return bookmarks.capture(message.owner,message.items);
    }
    if (who !== 'admin') throw new Error('只能在扩展设置中执行此操作');
    if(message.type==='posts-fill')return openFill(message.id);
    if(message.type==='posts-sync'){await syncPosts();return{};}
    if(message.type==='community-state')return community.snapshot();
    if(message.type==='community-connect'){
      if(!await chrome.permissions.contains({origins:[COMMUNITY_ORIGIN+'/*']}))throw Error('尚未授予社区服务访问权限。');
      return community.connect(message.invite);
    }
    if(message.type==='community-configure')return community.configure(message);
    if(message.type==='community-sync')return community.sync();
    if(message.type==='community-withdraw')return community.withdraw();
    if(message.type==='workspace-configure'){const r=await workspace.profile(message.owner,{collectMentions:message.profile?.collectMentions});await broadcast({type:'workspace-preferences-changed',owner:message.owner});return r;}
    if(message.type==='backup-export')return engine.mutate(async()=>{
      const rows=[];let before=null;do{const page=await engine.annotations.page({before,limit:200});rows.push(...page.items);if(JSON.stringify(rows).length>20e6)throw Error('标记数据超过 20 MB，请分批导出');before=page.next;}while(before);
      return backupFile(engine.data,await engine.storage.get(BACKUP_KEYS),rows,message.includeKeys===true);
    });
    if(message.type==='backup-preview')return backupSummary(parseBackup(message.value));
    if(message.type==='backup-restore'){const result=await restoreBackup(engine,message.value,message.restorePreferences===true);await broadcast();return result;}
    if(message.type==='workspace-page'){if(!['searches','inbox'].includes(message.store))throw Error('未知记录类型。');return workspace.page(message.store,message.owner,message);}
    if(message.type==='search-save'){const row=await workspace.saveSearch(message.owner,message.search);await broadcast({type:'searches-changed',owner:message.owner});return row;}
    if(message.type==='search-import'){const result=await workspace.importSearches(message.owner,importSearches(message.value));await broadcast({type:'searches-changed',owner:message.owner});return result;}
    if(message.type==='workspace-remove'){
      if(!['searches','inbox'].includes(message.store))throw Error('未知记录类型。');
      const r=await workspace.remove(message.store,message.owner,message.id);
      if(message.store==='inbox')await broadcast({type:'inbox-changed',owner:message.owner,id:message.id});
      if(message.store==='searches')await broadcast({type:'searches-changed',owner:message.owner});
      return r;
    }
    if(message.type==='inbox-update'){const row=await workspace.get('inbox',message.owner,message.id);if(!row)throw Error('这条记录已移除。');const updated=await workspace.queue(message.owner,row,{status:message.status,pinned:message.pinned,note:message.note});await broadcast({type:'inbox-changed',owner:message.owner,id:message.id});return updated;}
    if(message.type==='inbox-compose'){
      const row=await workspace.get('inbox',message.owner,message.id);if(!row)throw Error('这条记录已移除。');
      const url=replyIntent(row.id,message.note);
      await workspace.queue(message.owner,row,{note:message.note});
      await chrome.tabs.create({url});return{opened:true};
    }
    if(message.type==='bookmarks-state')return bookmarks.state();
    if(message.type==='bookmarks-page')return bookmarks.page(message);
    if(message.type==='bookmarks-edit')return bookmarks.edit(message.owner,message.id,message);
    if(message.type==='bookmarks-remove')return bookmarks.remove(message.owner,message.id);
    if(message.type==='contacts-state')return contacts.state(message.owner);
    if(message.type==='contacts-save')return contacts.put(message.owner,message.contact);
    if(message.type==='contacts-configure')return contacts.configure(message.owner,message.automatic);
    if(message.type==='contacts-remove')return contacts.remove(message.owner,message.handle);
    if(message.type==='annotations')return engine.annotationPage(message);
    if(message.type==='reveal-key'){await engine.ready;return {apiKey:engine.data.apiKey};}
    if (message.type === 'remove-example' || message.type==='edit-annotation') {
      const item=await engine.annotations.get(message.key);
      const result=await engine.editAnnotation(message.key,message.type==='remove-example'?null:message.label);
      if(item)await share(item,message.type==='remove-example'?null:message.label);
      await broadcast({type:'accounts-changed'});return result;
    }
    if (message.type === 'connect') {
      const connection = resolveConnection(mergeSettings((await engine.snapshot()).settings,message.settings));
      if (!await chrome.permissions.contains({ origins:[connection.origin] })) throw new Error('尚未授予模型服务访问权限');
      const result = await engine.connect(message.settings,message.apiKey); await broadcast(); return result;
    }
    if (message.type === 'save') {
      if (message.apiKey) throw new Error('请使用“连接并保存”验证新的模型密钥');
      const result = await engine.updateSettings(message.settings, message.apiKey, message.forgetKey); await broadcast(); return result;
    }
    if (message.type === 'test') return engine.classify(message.item, true);
    if (message.type === 'clear') { const result = await engine.clearHistory(); await broadcast(); return result; }
    throw new Error('未知操作');
  })().then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message || '操作失败，请重试' }));
  return true;
});
chrome.tabs.onRemoved.addListener(id=>{owners.delete(id);fillJobs.delete(id);});
