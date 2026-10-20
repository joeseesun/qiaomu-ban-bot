import { createElement,Search,Sparkles,ThumbsUp,ThumbsDown,MessageSquarePlus,MessageSquareCheck,X,UsersRound,NotebookPen } from 'lucide';
import { formatFollowers } from './evidence.js';
import { currentOwner } from './composer.js';
import { ARTICLE,extractArticle } from './dom.js';
import { contactHandle } from './contacts.js';
import { bookmarkPath } from './bookmarks.js';
import { INTEREST_REASONS } from './workspace.js';

const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'扩展连接中断，请刷新 X。');return r.data;};
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const glyph=node=>createElement(node,{width:16,height:16,'stroke-width':1.7,'aria-hidden':'true'});
const style=`:host{font:12px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:var(--qx-ink,#536471);display:inline-flex;flex:none;align-items:center}*{box-sizing:border-box}[hidden]{display:none!important}button,input,textarea{font:inherit}button{cursor:pointer;border:0;border-radius:6px;background:transparent;color:inherit;padding:6px 9px;display:inline-flex;align-items:center;gap:6px;line-height:1.5}button:hover{background:var(--qx-soft,#f2f2f2)}button:active{filter:brightness(.9)}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:1px solid #888;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}svg{flex:none}.trigger{min-width:22px;min-height:24px;padding:3px 5px;white-space:nowrap}.trigger svg{width:14px;height:14px}.pop{position:fixed;inset:auto;margin:0;width:min(360px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;padding:16px;border:1px solid var(--qx-line,#e5e5e5);border-radius:8px;background:var(--qx-bg,#fff);color:var(--qx-strong,#171717);box-shadow:0 8px 28px #0002;z-index:2147483645;white-space:normal;font-size:13px;text-align:left}.pop h3{font-size:14px;line-height:1.6;margin:0;font-weight:600}.head{display:flex;align-items:center;gap:12px;margin-bottom:12px}.head>button{margin-left:auto;padding:4px}.hint{font-size:12px;color:var(--qx-ink,#666);line-height:1.8;margin:8px 0}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:12px 0}.actions button{background:var(--qx-soft,#fafafa);border:1px solid var(--qx-line,#e5e5e5)}.actions button[aria-pressed=true]{background:var(--qx-strong,#171717);color:var(--qx-bg,#fff)}.error{font-size:12px;color:#ba332b;line-height:1.7}.status{font-size:12px;line-height:1.7;color:var(--qx-ink,#666)}.dimensions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-block:1px solid var(--qx-line,#e5e5e5);padding:12px 0;gap:8px}.dimensions span{font-size:11px;display:block;color:var(--qx-ink,#666)}.dimensions b{font-size:16px;font-weight:500}.note{display:block;width:100%;min-height:58px;resize:vertical;border:1px solid var(--qx-line,#ddd);border-radius:5px;background:var(--qx-bg,#fff);color:inherit;padding:8px;margin:10px 0}.profile-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.profile-bar>button{border:1px solid var(--qx-line,#e5e5e5);font-size:12px}.profile-bar .pop button{font-size:12px}`;
let owner='',profile=null,generation=0,lastURL=location.href,timer,profileHost=null,profileHandle='',navHost=null;
const states=new Map(),mentioned=new Set();
function removeProfile(){profileHost?.cleanup?.();profileHost?.remove();profileHost=null;profileHandle='';}
function theme(host){const rgb=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number),dark=rgb&&rgb.reduce((a,b)=>a+b,0)<350;for(const[k,v]of Object.entries({bg:dark?'#0a0a0a':'#fff',soft:dark?'#171717':'#fafafa',ink:dark?'#a1a1a1':'#536471',strong:dark?'#ededed':'#171717',line:dark?'#333':'#e5e5e5'}))host.style.setProperty('--qx-'+k,v);}
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
function itemFor(article){const item=extractArticle(article,location.href);return item&&item.kind!=='unknown'?item:item?{...item,kind:'reply'}:null;}
function live(article,id,boundOwner){return article.isConnected&&currentOwner()===boundOwner&&itemFor(article)?.id===id;}
function mountInterest(article,item){
  const old=states.get(article);if(old?.id===item.id&&old.owner===owner&&old.host.isConnected){old.item=item;authorWidget(old,article);return old;}
  old?.panel.destroy();old?.authorPanel?.destroy();old?.host.remove();const stamp=[...article.querySelectorAll('time')].find(n=>n.closest(ARTICLE)===article&&n.closest('a')?.getAttribute('href')?.includes('/status/'+item.id));if(!stamp)return null;
  const h=host('span','qx-interest-host'),state={host:h,id:item.id,owner,item,busy:false,result:null,label:null};h.style.marginLeft='4px';
  const save=button('',MessageSquarePlus,async()=>{
    if(!live(article,item.id,state.owner))throw Error('账号或帖子已变化。');
    if(state.queueStatus==='pending'){await send({type:'options',page:'workspace/inbox'});return;}
    await send({type:'inbox-add',owner:state.owner,item:state.item});if(live(article,item.id,state.owner))queueButton(state,'pending');
  },'trigger');state.save=save;queueButton(state,null);h.shadowRoot.append(save);
  void refreshQueue(state);
  const trigger=button('',Sparkles,async()=>{state.panel.open();},'trigger');trigger.title='兴趣偏好与判断';trigger.setAttribute('aria-label','兴趣偏好与判断');trigger.setAttribute('aria-expanded','false');h.shadowRoot.append(trigger);state.trigger=trigger;
  const panel=popover(h,trigger,'合不合你的口味？');state.panel=panel;const score=el('p','点击判断，看看它是否符合你的阅读偏好。','hint'),status=el('p','','status'),actions=el('div',null,'actions');panel.box.append(score,actions,status);state.score=score;state.status=status;
  const reasonLabel=el('label','补充原因（可选）','hint'),reason=el('select');reason.setAttribute('aria-label','兴趣反馈原因');reason.style.cssText='display:block;max-width:100%;margin-top:6px;padding:6px 8px;font:inherit;color:inherit;background:var(--qx-bg);border:1px solid var(--qx-line);border-radius:5px';for(const value of INTEREST_REASONS){const option=el('option',value||'不填写');option.value=value;reason.append(option);}reasonLabel.append(reason);panel.box.insertBefore(reasonLabel,actions);state.reason=reason;
  reason.onchange=async()=>{if(!state.label)return;try{if(!live(article,item.id,state.owner))throw Error('账号或帖子已变化，请重新操作。');await send({type:'interest-label',owner:state.owner,item:state.item,label:state.label,reason:reason.value});status.textContent='原因已保存。';}catch(e){status.textContent=e.message;}};
  for(const [label,name,icon]of[['yes','感兴趣',ThumbsUp],['no','不感兴趣',ThumbsDown]]){const control=button(name,icon,async()=>{if(!live(article,item.id,state.owner))throw Error('账号或帖子已变化，请重新操作。');const next=state.label===label?null:label;await send({type:'interest-label',owner:state.owner,item:state.item,label:next,reason:reason.value});if(!live(article,item.id,state.owner))return;state.label=next;for(const b of actions.querySelectorAll('[data-label]'))b.setAttribute('aria-pressed',String(b.dataset.label===next));status.textContent=next?'反馈已保存，后续判断会参考。':'反馈已撤销。';});control.dataset.label=label;control.setAttribute('aria-pressed','false');actions.append(control);}
  actions.append(button('稍后回复',MessageSquarePlus,async b=>{if(!live(article,item.id,state.owner))throw Error('账号或帖子已变化。');await send({type:'inbox-add',owner:state.owner,item:state.item});b.textContent='已加入待回复';}),button('重新判断',Sparkles,()=>loadInterest(state,article,true)),button('设置兴趣',null,()=>send({type:'options',page:'workspace/interests'})),button('查看待回复',null,()=>send({type:'options',page:'workspace/inbox'})));
  const anchor=stamp.closest('a');(anchor.parentElement.querySelector('.qb-hot-host')||anchor).after(h);states.set(article,state);authorWidget(state,article);observer.observe(article);return state;
}
function queueButton(state,status){state.queueStatus=status;state.save.replaceChildren(glyph(status==='pending'?MessageSquareCheck:MessageSquarePlus));const label=status==='pending'?'已加入待回复 · 打开列表':status?'重新加入待回复':'加入待回复';state.save.title=label;state.save.setAttribute('aria-label',label);state.save.setAttribute('aria-pressed',String(status==='pending'));}
async function refreshQueue(state){try{const rows=await send({type:'inbox-status',owner:state.owner,ids:[state.id]});if(state.owner===owner)queueButton(state,rows[0]?.status);}catch{}}
function authorWidget(state,article){
  const a=state.item.author;if(!a)return;
  const key=JSON.stringify([a.userId,a.followers,a.followsYou,a.youFollow,a.posts,a.joinedAt]);if(state.authorKey===key)return;
  state.authorPanel?.destroy();state.authorPanel?.box.remove();state.authorButton?.remove();state.relationship?.remove();state.authorKey=key;
  const n=formatFollowers(a.followers);if(!n)return;
  const b=button(n+' 关注',null,async()=>{
    card.open();const [stats,contacts]=await Promise.all([send({type:'author-evidence',item:state.item}),send({type:'contacts-page',owner:state.owner,query:state.item.handle}).catch(()=>({items:[]}))]);
    if(!live(article,state.id,state.owner))return;
    summary.textContent=`本机近 ${stats.sampleLimit} 条标注：AI ${stats.ai} · 非 AI ${stats.human}`;
    if(stats.community)summary.textContent+=`\n社区：${stats.community.contributors} 人 · ${stats.community.posts} 帖 · AI ${stats.community.ai} / 非 AI ${stats.community.human}${stats.community.conflictingPosts?' · 存在分歧':''}`;
    const contact=contacts.items?.find(c=>c.handle===state.item.handle);if(contact?.note)summary.textContent+='\n我的备注：'+contact.note;
  },'trigger');b.title=`${a.followers.toLocaleString()} 位关注者 · 查看账号信息`;b.setAttribute('aria-expanded','false');state.authorButton=b;
  const card=popover(state.host,b,'账号信息');state.authorPanel=card;
  const facts=[a.joinedAt?'注册于 '+new Date(a.joinedAt).toLocaleDateString('zh-CN'):'注册时间未知',a.posts===null?'发帖数未知':a.posts.toLocaleString()+' 条帖子',a.following===null?'关注中数量未知':'关注中 '+formatFollowers(a.following)];
  const summary=el('p','人工标注读取中…','hint');summary.style.whiteSpace='pre-line';
  card.box.append(el('p',facts.join(' · '),'hint'),summary,el('p','公开页面已加载的数据。标注是文本参考，不是机器人认证。','hint'));
  const relationship=a.followsYou?(a.youFollow?'互相关注':'关注了你'):'';
  state.host.shadowRoot.insertBefore(b,state.save);
  if(relationship){const label=el('span',relationship);label.style.cssText='font-size:11px;white-space:nowrap;padding:0 4px;color:var(--qx-ink)';state.relationship=label;state.host.shadowRoot.insertBefore(label,state.save);}
}
async function loadInterest(state,article,manual=false){
  if(state.busy||!live(article,state.id,state.owner)||(!manual&&state.result))return;state.busy=true;const gen=generation;
  try{if(manual){const saved=await send({type:'interest-status',owner:state.owner,id:state.id});if(!live(article,state.id,state.owner))return;state.label=saved.label;state.reason.value=saved.reason||'';for(const b of state.panel.box.querySelectorAll('[data-label]'))b.setAttribute('aria-pressed',String(b.dataset.label===saved.label));}
    state.score.textContent='正在判断…';const result=await send({type:'interest-analyze',owner:state.owner,item:state.item});if(gen!==generation||!live(article,state.id,state.owner))return;state.result=result;
    const interest=result.interest===null?'先设置兴趣，才能估计阅读偏好':`兴趣估计 ${Math.round(result.interest*100)}%`;
    state.score.textContent=interest+` · 值得回复 ${Math.round(result.worthReply*100)}%`;
    state.trigger.replaceChildren(glyph(Sparkles));if(result.interest!==null)state.trigger.append(document.createTextNode(Math.round(result.interest*100)+'%'));
    state.status.textContent=`${result.model} · 模型参考，不会自动回复或改变 X 推荐。`;
  }catch(e){if(live(article,state.id,state.owner)){state.score.textContent=e.message;state.result=null;}}
  finally{state.busy=false;}
}
const observer=new IntersectionObserver(entries=>{for(const e of entries){const state=states.get(e.target);if(e.isIntersecting&&state&&profile?.enabled)void loadInterest(state,e.target);}}, {rootMargin:'0px',threshold:.05});
function profileTarget(){const match=location.pathname.match(/^\/([\w]{1,15})(?:\/with_replies)?\/?$/);return match?contactHandle(match[1]):'';}
function profileWidget(){
  const handle=profileTarget(),header=document.querySelector('[data-testid="primaryColumn"] [data-testid="UserDescription"]')||document.querySelector('[data-testid="primaryColumn"] [data-testid="UserName"]');
  if(!handle||!header||!owner){removeProfile();return;}
  if(profileHost?.isConnected&&profileHandle===handle)return;removeProfile();profileHandle=handle;profileHost=host('div','qx-profile-host');profileHost.style.cssText='display:block;margin:12px 0';const bar=el('div',null,'profile-bar'),boundOwner=owner,h=profileHost;
  const analyze=button('分析值得关注',UsersRound,async b=>{if(currentOwner()!==boundOwner||profileTarget()!==handle)throw Error('账号或页面已变化。');
    const items=[...document.querySelectorAll(ARTICLE)].map(itemFor).filter(p=>p?.handle===handle);
    const row=await send({type:'kol-analyze',owner:boundOwner,handle,items});if(!h.isConnected||currentOwner()!==boundOwner||profileTarget()!==handle)return;
    b.textContent='值得关注 '+row.overall+'/100';panel.box.querySelector('.dimensions')?.remove();panel.box.querySelector('.hint')?.remove();const d=el('div',null,'dimensions');for(const[key,name]of[['content','内容质量'],['originality','独立表达'],['interaction','互动质量']]){const cell=el('div');cell.append(el('span',name),el('b',row.dimensions[key]===null?'样本不足':Math.round(row.dimensions[key]*100)+'/100'));d.append(cell);}panel.box.append(d,el('p',`已读 ${row.postCount} 条主帖、${row.replyCount} 条回复。${row.coverage==='partial'?'互动样本不足，当前只计已有维度。':''} ${row.model} · 有限样本的模型参考。`,'hint'),button('查看记录与依据',null,()=>send({type:'options',page:'workspace/ratings'})));panel.open();});
  const panel=popover(h,analyze,'值得关注 · 样本评估');h.cleanup=panel.destroy;bar.append(analyze);
  void send({type:'kol-get',owner:boundOwner,handle}).then(row=>{if(row&&h.isConnected&&currentOwner()===boundOwner&&profileTarget()===handle){analyze.textContent='重新分析 · '+row.overall+'/100';analyze.title='上次样本评分，点击用当前已加载帖子重新分析';}}).catch(()=>{});
  const note=button('账号备注',NotebookPen,async()=>{if(currentOwner()!==boundOwner||profileTarget()!==handle)throw Error('账号或页面已变化。');let box=h.shadowRoot.querySelector('.note-form');if(box){box.remove();return;}const data=await send({type:'contacts-page',owner:boundOwner,query:handle});if(currentOwner()!==boundOwner||!h.isConnected)return;box=el('form',null,'note-form');const input=el('textarea',null,'note');input.maxLength=160;input.placeholder='只在本机保存，也可在常用 @ 中用拼音搜索';input.setAttribute('aria-label','账号备注');input.value=data.items.find(c=>c.handle===handle)?.note||'';const save=button('保存备注',null,async()=>{if(currentOwner()!==boundOwner||profileTarget()!==handle)throw Error('账号已变化。');await send({type:'profile-note',owner:boundOwner,handle,displayName:document.querySelector('[data-testid="UserName"]')?.textContent?.split('@')[0]||'',note:input.value});box.remove();});box.append(input,save);bar.append(box);input.focus();});if(handle!==owner)bar.append(note);h.shadowRoot.append(bar);header.after(h);
}
function searchEntry(){const explore=document.querySelector('[data-testid="AppTabBar_Explore_Link"]');if(!explore||navHost?.isConnected)return;navHost=host('span','qx-search-entry');navHost.style.display='block';const css=el('style');css.textContent='.nav-button{height:50px;max-width:100%;padding:12px;gap:20px;border-radius:999px;font-size:20px;color:var(--qx-strong)}.nav-button svg{width:26px;height:26px}.nav-button span{white-space:nowrap}@media(max-width:1265px){.nav-button span{display:none}}';const b=button('',Search,()=>send({type:'options',page:'workspace/search'}),'nav-button');b.append(el('span','高级搜索'));b.title='高级搜索';b.setAttribute('aria-label','乔木 X 助手高级搜索');const inbox=button('',MessageSquarePlus,()=>send({type:'options',page:'workspace/inbox'}),'nav-button');inbox.append(el('span','待回复'));inbox.title='待回复';inbox.setAttribute('aria-label','待回复');inbox.dataset.inboxNav='';navHost.shadowRoot.append(css,inbox,b);explore.after(navHost);}
function scan(){
  searchEntry();profileWidget();if(!owner||bookmarkPath(location.pathname))return;
  for(const[a,state]of states)if(!a.isConnected){observer.unobserve(a);state.panel.destroy();state.authorPanel?.destroy();state.host.remove();states.delete(a);}
  for(const article of document.querySelectorAll(ARTICLE)){
    const item=itemFor(article);if(!item?.text)continue;const state=mountInterest(article,item);if(!state)continue;
    const key=owner+'/'+item.id,mention=/^\/notifications(?:\/mentions)?\/?$/.test(location.pathname)&&new RegExp('@'+owner+'(?:\\b|$)','i').test(item.text);
    if(profile?.collectMentions!==false&&mention&&!mentioned.has(key)){mentioned.add(key);send({type:'inbox-add',owner,item,source:'mention'}).catch(()=>mentioned.delete(key));}
  }
}
function schedule(){clearTimeout(timer);timer=setTimeout(scan,150);}
async function refresh(){const gen=++generation;owner=currentOwner();profile=null;for(const s of states.values()){s.panel.destroy();s.authorPanel?.destroy();s.host.remove();}states.clear();observer.disconnect();removeProfile();if(owner){try{const value=await send({type:'workspace-state',owner});if(gen!==generation||currentOwner()!==owner)return;profile=value;}catch{}}if(gen===generation)scan();}
async function refreshPreferences(){const boundOwner=owner,gen=++generation;try{const value=await send({type:'workspace-state',owner:boundOwner});if(gen!==generation||currentOwner()!==boundOwner)return;profile=value;for(const[article,state]of states){state.result=null;if(!state.panel.box.hidden){const saved=await send({type:'interest-status',owner:boundOwner,id:state.id});if(gen!==generation||!live(article,state.id,boundOwner))return;state.label=saved.label;state.reason.value=saved.reason||'';for(const b of state.panel.box.querySelectorAll('[data-label]'))b.setAttribute('aria-pressed',String(b.dataset.label===saved.label));}const r=article.getBoundingClientRect();if(profile.enabled&&r.bottom>0&&r.top<innerHeight)void loadInterest(state,article);}}catch{}}
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',()=>{lastURL=location.href;void refresh();});
setInterval(()=>{if(location.href!==lastURL||currentOwner()!==owner){lastURL=location.href;void refresh();}},700);
chrome.runtime.onMessage.addListener(m=>{if(m.type==='refresh')void refresh();else if(m.type==='interest-changed'&&m.owner===owner)void refreshPreferences();else if(m.type==='inbox-changed'&&m.owner===owner){for(const s of states.values())if(s.id===m.id)void refreshQueue(s);}});
window.addEventListener('qx-evidence-updated',schedule);
void refresh();
