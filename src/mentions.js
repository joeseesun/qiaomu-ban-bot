import { createElement, AtSign, Search, Pin, X, ArrowUpRight } from 'lucide';
import { EDITOR, currentOwner, articlePerson, composerScope, saveCaret, insertMention, ReplyReceipt } from './composer.js';
const send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'扩展已更新，请刷新 X 页面');return r.data;};
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
const icon=i=>createElement(i,{width:16,height:16,'stroke-width':1.7,'aria-hidden':'true'});
const css=`
:host{display:inline-flex;flex:none;align-self:center;width:var(--qm-button-size,36px);height:var(--qm-button-size,36px);margin:0;color:var(--qm-accent,#1d9bf0);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
*{box-sizing:border-box}[hidden]{display:none!important}button,input{font:inherit;color:inherit}button{cursor:pointer}button:focus-visible,input:focus-visible{outline:1px solid #888;outline-offset:2px}
.launch,.close{border:0;background:transparent;border-radius:50%;width:32px;height:32px;display:grid;place-items:center;padding:7px;color:inherit}.close:hover{background:var(--qm-hover,#f2f2f2)}.launch{width:100%;height:100%;padding:0;color:var(--qm-accent,#1d9bf0);transition:background-color .2s}.launch:hover,.launch[aria-expanded=true]{background:color-mix(in srgb,currentColor 10%,transparent)}.launch:active{background:color-mix(in srgb,currentColor 18%,transparent)}.launch:focus-visible{outline-color:currentColor}.launch svg{width:var(--qm-icon-size,20px);height:var(--qm-icon-size,20px);stroke-width:2}@media(prefers-reduced-motion:reduce){.launch{transition:none}}
.picker{display:flex;flex-direction:column;position:fixed;inset:auto;margin:0;width:min(330px,calc(100vw - 24px));max-height:440px;overflow:hidden;padding:0;background:var(--qm-bg,#fff);color:var(--qm-ink,#171717);border:1px solid var(--qm-line,#e5e5e5);border-radius:10px;box-shadow:0 8px 30px #0002;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
.head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:10px 12px 2px;font-weight:600}.search{flex:none;display:flex;align-items:center;gap:8px;border:1px solid var(--qm-line,#e5e5e5);border-radius:6px;margin:8px 12px;padding:8px 10px;color:var(--qm-muted,#666)}.search:focus-within{border-color:#888}.search input{background:transparent;border:0;outline:0!important;width:100%;min-width:0;padding:0;font-size:12px;color:var(--qm-ink,#171717)}
.list{min-height:0;flex:1;padding:0 6px;overflow:auto;max-height:280px;overscroll-behavior:contain}.option{width:100%;display:flex;align-items:center;gap:10px;border:0;border-radius:6px;padding:9px 7px;text-align:left;background:transparent}.option[aria-selected=true],.option:hover{background:var(--qm-hover,#f2f2f2)}.avatar{width:32px;height:32px;border-radius:50%;background:var(--qm-hover,#f2f2f2);position:relative;overflow:hidden;display:grid;place-items:center;flex:none}.avatar img{position:absolute;width:100%;height:100%;object-fit:cover}.info{display:grid;gap:1px;min-width:0;flex:1}.info b{font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.info small{font-size:11px;color:var(--qm-muted,#666);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.option>svg{width:13px;color:var(--qm-muted,#666)}
.empty{padding:22px 15px;text-align:center;color:var(--qm-muted,#666);font-size:12px}.foot{flex:none;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--qm-line,#e5e5e5);font-size:11px;color:var(--qm-muted,#666)}.manage{display:inline-flex;align-items:center;gap:3px;background:transparent;border:0;padding:2px;color:inherit;font-size:11px}.manage:hover{text-decoration:underline}.error{margin:0 12px 8px;font-size:11px;color:#b45325}
`;
const states=new Map(),receipt=new ReplyReceipt();let observedOwner='',pendingEditor=null,replyIntent=null,scheduled=false,metadata=new Map(),openState=null;
const dialogTargets=new WeakMap();
function people(){return [...document.querySelectorAll('article[data-testid="tweet"]')].map(articlePerson).filter(Boolean);}
function toasts(owner){return [...document.querySelectorAll('[data-testid="toast"] a[href]')].map(a=>a.getAttribute('href')?.match(new RegExp(`^/${owner}/status/(\\d+)`))?.[1]).filter(Boolean);}
function targetFor(editor){
  const dialog=editor.closest('[role="dialog"]');
  if(dialog){
    // Bind only a newly opened reply composer to the exact native reply click.
    const s=states.get(editor);return s?.target||null;
  }
  const match=location.pathname.match(/^\/\w+\/status\/(\d+)/);return match?people().find(p=>p.id===match[1]):null;
}
function attempt(editor){
  if(!editor)return;const owner=currentOwner();pendingEditor=editor;
  receipt.start({owner,target:targetFor(editor),text:editor.innerText||editor.textContent,existing:[...people().map(p=>p.id),...toasts(owner)]});
}
function setup(editor,scope){
  const toolbar=scope.querySelector('[data-testid="toolBar"]');if(!toolbar)return;
  const host=el('span','qm-mentions-host');host.attachShadow({mode:'open'});const root=host.shadowRoot;
  const style=el('style');style.textContent=css;root.append(style);
  const launcher=el('button','launch');launcher.type='button';launcher.title='常用 @';launcher.setAttribute('aria-label','常用 @');launcher.setAttribute('aria-haspopup','dialog');launcher.setAttribute('aria-expanded','false');launcher.append(icon(AtSign));
  const pop=el('section','picker');pop.setAttribute('popover','manual');pop.setAttribute('role','dialog');pop.setAttribute('aria-label','常用 @');pop.hidden=true;
  const head=el('div','head','常用 @'),close=el('button','close');close.type='button';close.title='关闭';close.setAttribute('aria-label','关闭常用 @');close.append(icon(X));head.append(close);
  const search=el('div','search'),input=el('input');input.placeholder='昵称、拼音、账号或备注';input.setAttribute('aria-label','搜索常用联系人');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','true');input.setAttribute('aria-controls','qm-options');input.maxLength=160;search.append(icon(Search),input);
  const list=el('div','list');list.id='qm-options';list.setAttribute('role','listbox');list.setAttribute('aria-label','常用联系人');
  const error=el('p','error');error.setAttribute('role','status');error.hidden=true;
  const foot=el('div','foot'),hint=el('span',null,'置顶优先 · ↑↓ 选择'),manage=el('button','manage','管理联系人');manage.type='button';manage.append(icon(ArrowUpRight));foot.append(hint,manage);pop.append(head,search,list,error,foot);root.append(launcher,pop);
  const syncAppearance=()=>{
    const row=toolbar.querySelector('[data-testid="ScrollSnap-List"],[role="tablist"]')||toolbar.querySelector('nav');
    if(row){if(host.parentElement!==row)row.append(host);}else if(host.parentElement!==toolbar)toolbar.insertBefore(host,toolbar.lastElementChild);
    const reference=toolbar.querySelector('[data-testid="gifSearchButton"],[data-testid="createPollButton"],[data-testid="scheduleOption"]')||[...(row?.querySelectorAll('button')||[])].find(b=>b.querySelector('svg')&&!b.disabled&&!b.closest('[data-testid="ScrollSnap-prevButtonWrapper"],[data-testid="ScrollSnap-nextButtonWrapper"]'));
    const glyph=reference?.querySelector('svg');if(!glyph)return;
    const buttonStyle=getComputedStyle(reference),glyphStyle=getComputedStyle(glyph);
    const size=Math.min(48,Math.max(28,parseFloat(buttonStyle.width)||reference.getBoundingClientRect().width||36));
    const iconSize=Math.min(28,Math.max(16,parseFloat(glyphStyle.width)||glyph.getBoundingClientRect().width||20));
    for(const [key,value] of Object.entries({'--qm-accent':glyphStyle.color,'--qm-button-size':size+'px','--qm-icon-size':iconSize+'px'}))if(host.style.getPropertyValue(key)!==value)host.style.setProperty(key,value);
  };
  syncAppearance();
  const state={host,editor,scope,pop,saved:null,owner:'',items:[],index:0,generation:0,timer:null,target:dialogTargets.get(editor.closest('[role="dialog"]'))||null};states.set(editor,state);
  state.syncAppearance=syncAppearance;
  const appearanceObserver=new MutationObserver(records=>{if(records.some(r=>r.target!==host&&!host.contains(r.target)))schedule();});
  appearanceObserver.observe(toolbar,{attributes:true,subtree:true,attributeFilter:['style','class']});
  const remember=()=>{const c=saveCaret(editor);if(c)state.saved=c;};
  const selected=()=>{[...list.querySelectorAll('.option')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===state.index)));const b=list.querySelectorAll('.option')[state.index];if(b){input.setAttribute('aria-activedescendant',b.id);b.scrollIntoView({block:'nearest'});}else input.removeAttribute('aria-activedescendant');};
  const hide=(restore=false)=>{if(pop.hidden)return;pop.hidePopover();pop.hidden=true;state.generation++;clearTimeout(state.timer);launcher.setAttribute('aria-expanded','false');if(openState===state)openState=null;if(restore&&editor.isConnected){editor.focus({preventScroll:true});if(state.saved&&editor.contains(state.saved.range.commonAncestorContainer)){const s=document.getSelection();s.removeAllRanges();s.addRange(state.saved.range);}}};state.hide=hide;
  const position=()=>{const r=launcher.getBoundingClientRect(),w=pop.getBoundingClientRect().width;pop.style.left=Math.max(12,Math.min(r.left,innerWidth-w-12))+'px';pop.style.maxHeight=Math.max(170,Math.min(440,innerHeight-24))+'px';const h=pop.getBoundingClientRect().height;pop.style.top=Math.max(12,Math.min(r.bottom+8+h<innerHeight-12?r.bottom+8:r.top-h-8,innerHeight-h-12))+'px';};state.position=position;
  const choose=async c=>{if(!c||state.inserting)return;state.inserting=true;try{if(currentOwner()!==state.owner)throw Error('登录账号已切换，请重新打开常用 @。');await insertMention(editor,state.saved,c.handle,c.displayName);hide();void send({type:'contacts-use',owner:state.owner,handle:c.handle}).catch(()=>{});}catch(e){error.textContent=e.message;error.hidden=false;position();}finally{state.inserting=false;}};
  async function searchNow(){
    const gen=++state.generation;list.setAttribute('aria-busy','true');input.removeAttribute('aria-activedescendant');state.items=[];
    try{const page=await send({type:'contacts-page',owner:state.owner,query:input.value,limit:8});if(gen!==state.generation||pop.hidden)return;state.items=page.items;state.index=0;list.replaceChildren();
      if(!page.items.length)list.append(el('p','empty',input.value?'没有找到，换个关键词试试。':'还没有常用联系人。点下方「管理联系人」添加。'));
      page.items.forEach((c,i)=>{const b=el('button','option');b.type='button';b.id='qm-option-'+i;b.tabIndex=-1;b.setAttribute('role','option');const avatar=el('span','avatar',(c.displayName||c.handle).slice(0,1).toUpperCase());if(c.avatar){const img=el('img');img.src=c.avatar;img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();avatar.append(img);}const info=el('span','info');info.append(el('b',null,c.displayName||'@'+c.handle),el('small',null,`@${c.handle}${c.note?' · '+c.note:''}`));b.append(avatar,info);if(c.pinned)b.append(icon(Pin));b.onmousedown=e=>e.preventDefault();b.onclick=()=>choose(c);list.append(b);});selected();position();
    }catch(e){if(gen===state.generation){list.replaceChildren(el('p','empty',e.message));}}finally{if(gen===state.generation)list.removeAttribute('aria-busy');}
  }
  launcher.onmousedown=e=>{e.preventDefault();remember();};launcher.onclick=e=>{e.preventDefault();e.stopPropagation();if(!pop.hidden){hide(true);return;}if(openState)openState.hide();
    const owner=currentOwner();if(!owner)return;remember();state.owner=owner;
    if(!state.saved){editor.focus({preventScroll:true});remember();}
    const rgb=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number),dark=rgb&&rgb.reduce((a,b)=>a+b,0)<350;
    for(const [k,v] of Object.entries(dark?{bg:'#111',ink:'#ededed',line:'#333',muted:'#a1a1a1',hover:'#222'}:{bg:'#fff',ink:'#171717',line:'#e5e5e5',muted:'#666',hover:'#f2f2f2'}))host.style.setProperty('--qm-'+k,v);
    input.value='';error.hidden=true;list.replaceChildren(el('p','empty','正在读取…'));pop.hidden=false;pop.showPopover();openState=state;launcher.setAttribute('aria-expanded','true');position();input.focus({preventScroll:true});void searchNow();};
  close.onclick=()=>hide(true);manage.onclick=()=>{void send({type:'options',page:'contacts'}).then(()=>hide(true)).catch(e=>{error.textContent=e.message;error.hidden=false;});};
  input.oninput=()=>{state.generation++;state.items=[];list.replaceChildren(el('p','empty','正在查找…'));input.removeAttribute('aria-activedescendant');clearTimeout(state.timer);state.timer=setTimeout(searchNow,150);};
  pop.onkeydown=e=>{if(e.isComposing)return;if(e.key==='Escape'||(e.target===input&&['ArrowDown','ArrowUp','Enter'].includes(e.key))){e.preventDefault();e.stopPropagation();if(e.key==='Escape')hide(true);else if(e.key==='Enter')choose(state.items[state.index]);else if(e.key.startsWith('Arrow')&&state.items.length){state.index=(state.index+(e.key==='ArrowDown'?1:-1)+state.items.length)%state.items.length;selected();}}};
  root.addEventListener('click',e=>e.stopPropagation());editor.addEventListener('keyup',remember);editor.addEventListener('mouseup',remember);editor.addEventListener('input',remember);state.dispose=()=>{hide();appearanceObserver.disconnect();host.remove();editor.removeEventListener('keyup',remember);editor.removeEventListener('mouseup',remember);editor.removeEventListener('input',remember);};
}
async function scan(){
  scheduled=false;const owner=currentOwner();
  if(owner!==observedOwner){observedOwner=owner;metadata.clear();receipt.pending=null;pendingEditor=null;openState?.hide();if(owner)void send({type:'contacts-observe',owner}).catch(()=>{});}
  for(const [e,s] of states)if(!e.isConnected||!s.host.isConnected||!owner){s.dispose();states.delete(e);}
  if(!owner)return;
  if(replyIntent?.person&&Date.now()-replyIntent.at<8000){
    const person=replyIntent.person;
    for(const dialog of document.querySelectorAll('[role="dialog"]')){
      const original=dialog.querySelector('article');
      if(original&&[...original.querySelectorAll('a[href]')].some(a=>a.getAttribute('href')?.toLowerCase()===`/${person.handle}`)&&person.text&&original.querySelector('[data-testid="tweetText"]')?.textContent.trim().startsWith(person.text)){dialogTargets.set(dialog,person);replyIntent=null;break;}
    }
  }
  for(const e of document.querySelectorAll(EDITOR)){if(!states.has(e)){const scope=composerScope(e);if(scope)setup(e,scope);}}
  for(const state of states.values())state.syncAppearance();
  const posts=people(),updates=[];
  for(const p of posts){const stamp=p.displayName+'|'+p.avatar;if(metadata.get(p.handle)!==stamp){metadata.set(p.handle,stamp);updates.push(p);}}
  while(metadata.size>500)metadata.delete(metadata.keys().next().value);
  for(let i=0;i<updates.length;i+=40)void send({type:'contacts-refresh',owner,items:updates.slice(i,i+40).map(({handle,displayName,avatar})=>({handle,displayName,avatar}))}).catch(()=>{});
  const cleared=pendingEditor&&(!pendingEditor.isConnected||!(pendingEditor.innerText||pendingEditor.textContent).trim());
  const confirmed=receipt.confirm({owner,cleared,posts,toastIds:toasts(owner)});
  if(confirmed){pendingEditor=null;void send({type:'contacts-reply',...confirmed}).catch(()=>{});}
}
const schedule=()=>{if(!scheduled){scheduled=true;setTimeout(()=>void scan(),180);}};
document.addEventListener('click',e=>{
  if(!e.isTrusted)return;const target=e.target instanceof Element?e.target:null;
  if(target?.closest('[data-testid="app-bar-close"]')){replyIntent=null;receipt.pending=null;}
  const reply=target?.closest('[data-testid="reply"]');if(reply){const article=reply.closest('article');replyIntent=article?{person:articlePerson(article),at:Date.now()}:null;}
  const submit=target?.closest('[data-testid="tweetButton"],[data-testid="tweetButtonInline"]');
  if(submit&&!submit.disabled&&submit.getAttribute('aria-disabled')!=='true'){
    const candidates=[...states.values()].filter(s=>s.scope.contains(submit));attempt(candidates.length===1?candidates[0].editor:null);
  }
},true);
document.addEventListener('keydown',e=>{if(e.isTrusted&&!e.isComposing&&(e.metaKey||e.ctrlKey)&&e.key==='Enter'&&e.target.matches?.(EDITOR))attempt(e.target);},true);
document.addEventListener('pointerdown',e=>{if(openState&&!e.composedPath().includes(openState.host))openState.hide();},true);
window.addEventListener('resize',()=>openState?.position());window.addEventListener('scroll',()=>openState?.hide(),{passive:true});
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,characterData:true});
const themeObserver=new MutationObserver(schedule);
for(const node of [document.documentElement,document.body])themeObserver.observe(node,{attributes:true,attributeFilter:['style','class']});
void scan();
