import { createElement,MessageSquarePlus,MessageSquareCheck,X } from 'lucide';
import { formatFollowers } from './evidence.js';
import { currentOwner } from './composer.js';
import { ARTICLE,extractArticle } from './dom.js';
import { bookmarkPath } from './bookmarks.js';
import { tip } from './tooltip.js';
import { createSearchSidebar } from './search-sidebar.js';

const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'扩展连接中断，请刷新 X。');return r.data;};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const glyph=node=>createElement(node,{width:16,height:16,'stroke-width':1.7,'aria-hidden':'true'});
const style=`:host{font:12px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:var(--qx-ink,#536471);display:inline-flex;flex:none;align-items:center}*{box-sizing:border-box}[hidden]{display:none!important}button,input,textarea{font:inherit}button{cursor:pointer;border:0;border-radius:6px;background:transparent;color:inherit;padding:6px 9px;display:inline-flex;align-items:center;gap:6px;line-height:1.5}button:hover{background:var(--qx-soft,#f2f2f2)}button:active{filter:brightness(.9)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:1px solid #888;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}svg{flex:none}.trigger{min-width:22px;min-height:24px;padding:3px 5px;white-space:nowrap}.trigger svg{width:14px;height:14px}.pop{position:fixed;inset:auto;margin:0;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:16px;border:1px solid var(--qx-line,#e5e5e5);border-radius:8px;background:var(--qx-bg,#fff);color:var(--qx-strong,#171717);box-shadow:0 8px 28px #0002;z-index:2147483645;white-space:normal;font-size:13px;text-align:left}.pop h3{font-size:14px;line-height:1.6;margin:0;font-weight:600}.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.head>button{margin-left:auto;padding:4px}.hint{font-size:12px;color:var(--qx-ink,#666);line-height:1.8;margin:8px 0}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:12px 0}.actions button{background:var(--qx-soft,#fafafa);border:1px solid var(--qx-line,#e5e5e5)}.actions button[aria-pressed=true]{background:var(--qx-strong,#171717);color:var(--qx-bg,#fff)}.error{font-size:12px;color:#ba332b;line-height:1.7}.status{font-size:12px;line-height:1.7;color:var(--qx-ink,#666)}:host(.qx-in-row) .trigger{min-width:34px;height:34px;padding:0;justify-content:center;border-radius:999px;transition:background-color 120ms ease-out,color 120ms ease-out}:host(.qx-in-row) .trigger:has(svg+*){padding:0 10px 0 8px;gap:2px}:host(.qx-in-row) .trigger svg{width:18.75px;height:18.75px}:host(.qx-in-row) .trigger:hover{background:rgba(29,155,240,.1);color:rgb(29,155,240)}:host(.qx-in-row) .trigger[aria-pressed=true]{color:rgb(29,155,240)}@media(max-width:500px){:host(.qx-in-row) .trigger{min-width:28px;height:28px}:host(.qx-in-row) .trigger svg{width:16px;height:16px}}:host(.qx-author-host){font:inherit;color:var(--qx-ink)}.followers{font:inherit;font-size:12px;line-height:16px;color:inherit;min-height:0;padding:0 2px;border-radius:4px}.followers:hover{background:transparent;text-decoration:underline}.sep{padding:0 4px 0 0}.badge{margin-left:4px;font-size:12px;line-height:16px;padding:0 4px;border-radius:4px;background:var(--qx-badge,#eff3f4);white-space:nowrap}@media(prefers-reduced-motion:reduce){*{transition:none!important}}`;
let owner='',profile=null,generation=0,lastURL=location.href,timer,navHost=null;
const states=new Map(),mentioned=new Set();
const searches=createSearchSidebar({send,getOwner:()=>currentOwner()});
function theme(host){const rgb=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number),dark=rgb&&rgb.reduce((a,b)=>a+b,0)<350;for(const[k,v]of Object.entries({bg:dark?'#0a0a0a':'#fff',soft:dark?'#171717':'#fafafa',ink:dark?'#71767b':'#536471',badge:dark?'#202327':'#eff3f4',strong:dark?'#ededed':'#171717',line:dark?'#333':'#e5e5e5'}))host.style.setProperty('--qx-'+k,v);}
function host(tag='span',cls=''){const h=el(tag,null,cls);h.attachShadow({mode:'open'});const css=el('style');css.textContent=style;h.shadowRoot.append(css);h.addEventListener('click',e=>e.stopPropagation());h.addEventListener('pointerdown',e=>e.stopPropagation());theme(h);return h;}
function button(name,icon,run,cls=''){const b=el('button',name,cls);b.type='button';if(icon)b.prepend(glyph(icon));b.onclick=async e=>{e.preventDefault();e.stopPropagation();b.disabled=true;try{await run(b);}catch(error){const panel=b.closest('.pop')||b.getRootNode();panel.querySelector('.error')?.remove();const p=el('p',error.message,'error');p.setAttribute('role','alert');panel.append(p);}finally{b.disabled=false;}};return b;}
function popover(h,trigger,title){const box=el('section',null,'pop');box.hidden=true;box.setAttribute('role','dialog');box.setAttribute('aria-label',title);const head=el('div',null,'head');head.append(el('h3',title));let outside;
  const place=()=>{if(box.hidden)return;const r=trigger.getBoundingClientRect(),width=Math.min(360,innerWidth-24);box.style.left=Math.max(12,Math.min(r.left,innerWidth-width-12))+'px';box.style.top=Math.max(12,Math.min(r.bottom+7,innerHeight-box.getBoundingClientRect().height-12))+'px';};
  const sizing=typeof ResizeObserver==='function'?new ResizeObserver(place):null;sizing?.observe(box);
  const close=()=>{if(typeof box.hidePopover==='function'&&box.matches(':popover-open'))box.hidePopover();box.hidden=true;trigger.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',outside,true);trigger.focus({preventScroll:true});};
  const closeButton=button('',X,close);closeButton.setAttribute('aria-label','关闭');head.append(closeButton);box.append(head);box.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});h.shadowRoot.append(box);
  const open=()=>{box.hidden=false;trigger.setAttribute('aria-expanded','true');if(typeof box.showPopover==='function'){box.setAttribute('popover','auto');box.showPopover();}place();document.removeEventListener('pointerdown',outside,true);outside=e=>{if(!e.composedPath().includes(h))close();};document.addEventListener('pointerdown',outside,true);closeButton.focus({preventScroll:true});};
  return{box,head,open,close,destroy:()=>{sizing?.disconnect();document.removeEventListener('pointerdown',outside,true);if(typeof box.hidePopover==='function'&&box.matches(':popover-open'))box.hidePopover();}};
}
// X's action row: reply · repost · like · views · [bookmark share]. Our
// buttons join it as peers right before the bookmark cluster (no extra row).
function actionGroup(article){return[...article.querySelectorAll('[role="group"]')].find(g=>g.closest(ARTICLE)===article&&!g.closest('[data-testid="quoteTweet"]'));}
function placeInRow(group,h){const before=[...group.children].find(n=>!n.matches('.qb-host,.qx-interest-host')&&n.querySelector('[data-testid="bookmark"],[data-testid="removeBookmark"]'))||null;if(h.parentElement!==group||h.nextElementSibling!==before)group.insertBefore(h,before);}
function removeState(state){state.authorPanel?.destroy();state.host.remove();state.authorHost?.remove();}
function itemFor(article){const item=extractArticle(article,location.href);return item&&item.kind!=='unknown'?item:item?{...item,kind:'reply'}:null;}
function live(article,id,boundOwner){return article.isConnected&&currentOwner()===boundOwner&&itemFor(article)?.id===id;}
function mountQueue(article,item){
  const old=states.get(article);if(old?.id===item.id&&old.owner===owner&&old.host.isConnected&&(!old.authorHost||old.authorHost.isConnected)){old.item=item;authorWidget(old,article);return old;}
  if(old)removeState(old);const stamp=[...article.querySelectorAll('time')].find(n=>n.closest(ARTICLE)===article&&n.closest('a')?.getAttribute('href')?.includes('/status/'+item.id));if(!stamp)return null;
  const h=host('span','qx-interest-host'),state={host:h,id:item.id,owner,item,busy:false,result:null,label:null,stamp};
  const save=button('',MessageSquarePlus,async()=>{
    if(!live(article,item.id,state.owner))throw Error('账号或帖子已变化。');
    if(state.queueStatus==='pending'){await send({type:'options',page:'workspace/inbox'});return;}
    await send({type:'inbox-add',owner:state.owner,item:state.item});if(live(article,item.id,state.owner))queueButton(state,'pending');
  },'trigger');state.save=save;queueButton(state,null);h.shadowRoot.append(save);
  void refreshQueue(state);
  const group=actionGroup(article);if(group){h.classList.add('qx-in-row');placeInRow(group,h);}else{h.style.marginLeft='4px';const anchor=stamp.closest('a');(anchor.parentElement.querySelector('.qb-hot-host')||anchor).after(h);}states.set(article,state);authorWidget(state,article);return state;
}
function queueButton(state,status){state.queueStatus=status;state.save.replaceChildren(glyph(status==='pending'?MessageSquareCheck:MessageSquarePlus));const label=status==='pending'?'已加入待回复 · 打开列表':status?'重新加入待回复':'加入待回复';tip(state.save,label);state.save.setAttribute('aria-label',label);state.save.setAttribute('aria-pressed',String(status==='pending'));}
async function refreshQueue(state){try{const rows=await send({type:'inbox-status',owner:state.owner,ids:[state.id]});if(state.owner===owner)queueButton(state,rows[0]?.status);}catch{}}
function authorWidget(state,article){
  const a=state.item.author;if(!a)return;
  const key=JSON.stringify([a.userId,a.followers,a.followsYou,a.youFollow,a.posts,a.joinedAt]);if(state.authorKey===key)return;
  state.authorPanel?.destroy();state.authorHost?.remove();state.authorHost=null;state.authorKey=key;
  const n=formatFollowers(a.followers);if(!n)return;
  // Author facts read as X's own grey metadata after the timestamp.
  const ah=host('span','qx-author-host');ah.style.setProperty('--qx-ink',getComputedStyle(state.stamp).color||'#536471');state.authorHost=ah;
  const b=button(n+' 关注者',null,async()=>{
    card.open();const [stats,contacts]=await Promise.all([send({type:'author-evidence',item:state.item}),send({type:'contacts-page',owner:state.owner,query:state.item.handle}).catch(()=>({items:[]}))]);
    if(!live(article,state.id,state.owner))return;
    summary.textContent=`本机近 ${stats.sampleLimit} 条标注：AI ${stats.ai} · 非 AI ${stats.human}`;
    if(stats.community)summary.textContent+=`\n社区：${stats.community.contributors} 人 · ${stats.community.posts} 帖 · AI ${stats.community.ai} / 非 AI ${stats.community.human}${stats.community.conflictingPosts?' · 存在分歧':''}`;
    const contact=contacts.items?.find(c=>c.handle===state.item.handle);if(contact?.note)summary.textContent+='\n我的备注：'+contact.note;
  },'trigger followers');tip(b,`${a.followers.toLocaleString()} 位关注者 · 查看账号信息`);b.setAttribute('aria-expanded','false');state.authorButton=b;
  const card=popover(ah,b,'账号信息');state.authorPanel=card;
  const facts=[a.joinedAt?'注册于 '+new Date(a.joinedAt).toLocaleDateString('zh-CN'):'注册时间未知',a.posts===null?'发帖数未知':a.posts.toLocaleString()+' 条帖子',a.following===null?'关注中数量未知':'关注中 '+formatFollowers(a.following)];
  const summary=el('p','人工标注读取中…','hint');summary.style.whiteSpace='pre-line';
  card.box.append(el('p',facts.join(' · '),'hint'),summary,el('p','公开页面已加载的数据。标注是文本参考，不是机器人认证。','hint'));
  const relationship=a.followsYou?(a.youFollow?'互相关注':'关注了你'):'';
  ah.shadowRoot.append(el('span','·','sep'),b);
  if(relationship)ah.shadowRoot.append(el('span',relationship,'badge'));
  const anchor=state.stamp.closest('a');(anchor.parentElement.querySelector('.qb-hot-host')||anchor).after(ah);
}
function searchEntry(){const explore=document.querySelector('[data-testid="AppTabBar_Explore_Link"]');if(!explore||navHost?.isConnected)return;navHost=host('span','qx-search-entry');navHost.style.display='block';const css=el('style');css.textContent='.nav-button{height:50px;max-width:100%;padding:12px;gap:20px;border-radius:999px;font-size:20px;color:var(--qx-strong)}.nav-button svg{width:26px;height:26px}.nav-button span{white-space:nowrap}@media(max-width:1265px){.nav-button span{display:none}}';const inbox=button('',MessageSquarePlus,()=>send({type:'options',page:'workspace/inbox'}),'nav-button');inbox.append(el('span','待回复'));inbox.title='待回复';inbox.setAttribute('aria-label','待回复');inbox.dataset.inboxNav='';navHost.shadowRoot.append(css,inbox);explore.after(navHost);}
function scan(){
  searchEntry();searches.mount();if(!owner||bookmarkPath(location.pathname))return;
  for(const[a,state]of states)if(!a.isConnected){removeState(state);states.delete(a);}
  for(const article of document.querySelectorAll(ARTICLE)){
    const item=itemFor(article);if(!item?.text)continue;const state=mountQueue(article,item);if(!state)continue;
    const key=owner+'/'+item.id,mention=/^\/notifications(?:\/mentions)?\/?$/.test(location.pathname)&&new RegExp('@'+owner+'(?:\\b|$)','i').test(item.text);
    if(profile?.collectMentions!==false&&mention&&!mentioned.has(key)){mentioned.add(key);send({type:'inbox-add',owner,item,source:'mention'}).catch(()=>mentioned.delete(key));}
  }
}
function schedule(){clearTimeout(timer);timer=setTimeout(scan,150);}
async function refresh(){const gen=++generation;owner=currentOwner();profile=null;for(const s of states.values())removeState(s);states.clear();if(owner){try{const value=await send({type:'workspace-state',owner});if(gen!==generation||currentOwner()!==owner)return;profile=value;}catch{}}if(gen===generation)scan();}
async function refreshPreferences(){const boundOwner=owner,gen=++generation;try{const value=await send({type:'workspace-state',owner:boundOwner});if(gen!==generation||currentOwner()!==boundOwner)return;profile=value;scan();}catch{}}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',()=>{lastURL=location.href;void refresh();});
setInterval(()=>{if(location.href!==lastURL||currentOwner()!==owner){lastURL=location.href;void refresh();}},700);
chrome.runtime.onMessage.addListener(m=>{if(m.type==='refresh')void refresh();else if(m.type==='searches-changed'&&m.owner===owner)void searches.refresh();else if(m.type==='workspace-preferences-changed'&&m.owner===owner)void refreshPreferences();else if(m.type==='inbox-changed'&&m.owner===owner){for(const s of states.values())if(s.id===m.id)void refreshQueue(s);}});
window.addEventListener('qx-evidence-updated',schedule);
void refresh();
