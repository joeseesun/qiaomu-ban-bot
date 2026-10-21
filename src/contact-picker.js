// Shared contact list pieces: the composer @ picker and every search "account"
// field read the same per-owner address book through `contacts-page`.
import { avatarURL } from './contacts.js';
const DAY=86400000;
export const RECENT_DAYS=14;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
export function interactionLabel(c){
  const parts=[];
  if(c.replyCount)parts.push(`回复 ${c.replyCount}`);
  if(c.likeCount)parts.push(`赞 ${c.likeCount}`);
  if(c.repostCount)parts.push(`转 ${c.repostCount}`);
  return parts.join(' · ');
}
export function contactGroup(c,now=Date.now()){
  if(c.related)return'本帖相关';
  if(c.pinned)return'置顶';
  return(c.lastInteractionAt||c.lastReplyAt||0)>now-RECENT_DAYS*DAY?'最近互动':'全部联系人';
}
// Related people first, then the stored order (pinned → recent activity).
export function mergeRelated(related,items,query=''){
  const q=String(query||'').toLowerCase().replace(/^@/,''),seen=new Set(),out=[];
  for(const p of related)if(!q||p.handle.includes(q)||(p.displayName||'').toLowerCase().includes(q)){if(!seen.has(p.handle)){seen.add(p.handle);out.push({...p,related:true});}}
  for(const c of items)if(!seen.has(c.handle)){seen.add(c.handle);out.push(c);}
  return out;
}
export function contactRow(c,{id,doc=document}={}){
  const b=doc.createElement('button');b.type='button';b.className='option';if(id)b.id=id;b.tabIndex=-1;b.setAttribute('role','option');b.dataset.handle=c.handle;
  const avatar=el('span','avatar',(c.displayName||c.handle).slice(0,1).toUpperCase());
  if(avatarURL(c.avatar)){const img=el('img');img.src=c.avatar;img.alt='';img.referrerPolicy='no-referrer';img.onerror=()=>img.remove();avatar.append(img);}
  const info=el('span','info'),meta=[`@${c.handle}`];
  const detail=c.note||interactionLabel(c);if(detail)meta.push(detail);
  info.append(el('b',null,c.displayName||'@'+c.handle),el('small',null,meta.join(' · ')));
  b.append(avatar,info);
  if(c.pinned)b.append(el('span','badge','置顶'));
  return b;
}
// Renders rows with group headings; returns the option buttons in order.
export function renderGroups(list,items,{idPrefix='qm-option-',now=Date.now(),doc=document}={}){
  list.replaceChildren();const buttons=[];let last='';
  const grouped=items.length>3;
  items.forEach((c,i)=>{
    const g=contactGroup(c,now);
    if(grouped&&g!==last){const h=el('p','group',g);h.setAttribute('role','presentation');list.append(h);last=g;}
    const b=contactRow(c,{id:idPrefix+i,doc});list.append(b);buttons.push(b);
  });
  return buttons;
}
export const SUGGEST_CSS=`
.qx-suggest{position:absolute;z-index:20;left:0;right:0;top:100%;margin-top:4px;max-height:280px;overflow:auto;padding:4px;background:var(--qx-suggest-bg,#fff);color:var(--qx-suggest-ink,#0f1419);border:1px solid var(--qx-suggest-line,#cfd9de);border-radius:8px;box-shadow:0 8px 24px #0002;font-size:13px;line-height:1.4}
.qx-suggest[hidden]{display:none!important}
.qx-suggest .group{margin:6px 8px 2px;font-size:11px;color:var(--qx-suggest-muted,#71767b)}
.qx-suggest .option{width:100%;display:flex;align-items:center;gap:8px;border:0;border-radius:6px;padding:6px;text-align:left;background:transparent;color:inherit;font:inherit;cursor:pointer;min-height:0}
.qx-suggest .option[aria-selected=true],.qx-suggest .option:hover{background:var(--qx-suggest-soft,#f2f4f5)}
.qx-suggest .avatar{width:26px;height:26px;border-radius:50%;background:var(--qx-suggest-soft,#f2f4f5);position:relative;overflow:hidden;display:grid;place-items:center;flex:none;font-size:11px}
.qx-suggest .avatar img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.qx-suggest .info{display:grid;min-width:0;flex:1}.qx-suggest .info b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.qx-suggest .info small{font-size:11px;color:var(--qx-suggest-muted,#71767b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qx-suggest .badge{font-size:10px;color:var(--qx-suggest-muted,#71767b)}
.qx-suggest .empty{margin:8px;font-size:12px;color:var(--qx-suggest-muted,#71767b)}
@media (prefers-color-scheme:dark){:root{--qx-suggest-bg:#16181c;--qx-suggest-ink:#e7e9ea;--qx-suggest-line:#2f3336;--qx-suggest-soft:#22262b;--qx-suggest-muted:#8b98a5}}
`;
// Turns a "@a @b" text field into a combobox over the owner's contacts.
// The field stays a plain text input, so typing a new handle still works.
let uid=0;
export function attachHandleSuggest(input,{send,getOwner,root=input.ownerDocument,requireAt=false}){
  const doc=input.ownerDocument;
  const styleHost=root.head||root;
  if(!styleHost.querySelector?.('style[data-qx-suggest]')){const s=doc.createElement('style');s.dataset.qxSuggest='';s.textContent=SUGGEST_CSS;styleHost.append(s);}
  const wrap=input.parentElement;if(doc.defaultView.getComputedStyle(wrap).position==='static')wrap.style.position='relative';
  const list=doc.createElement('div');list.className='qx-suggest';list.id='qx-suggest-'+(++uid);list.setAttribute('role','listbox');list.setAttribute('aria-label','常用联系人');list.hidden=true;
  input.after(list);input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',list.id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
  let items=[],buttons=[],index=0,gen=0,timer=null,picking=false;
  const token=()=>{const before=input.value.slice(0,input.selectionStart??input.value.length);const m=before.match(requireAt?/(?:^|\s)@([a-zA-Z0-9_]{0,15})$/u:/(?:^|[\s,，])@?([a-zA-Z0-9_\u3400-\u9fff]{0,30})$/u);return m?{text:m[1],start:before.length-m[0].replace(/^[\s,，]/,'').length,end:before.length}:null;};
  const close=()=>{list.hidden=true;gen++;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');};
  const mark=()=>{buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===index)));const b=buttons[index];if(b){input.setAttribute('aria-activedescendant',b.id);if(b.offsetTop<list.scrollTop)list.scrollTop=b.offsetTop;else if(b.offsetTop+b.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=b.offsetTop+b.offsetHeight-list.clientHeight;}};
  function pick(c){
    const t=token()||{start:input.value.length,end:input.value.length};
    const after=input.value.slice(t.end).replace(/^\S*/,'');
    const head=input.value.slice(0,t.start);
    input.value=head+'@'+c.handle+' '+after.replace(/^\s+/,'');
    const caret=(head+'@'+c.handle+' ').length;input.setSelectionRange?.(caret,caret);
    close();picking=true;try{input.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));}finally{picking=false;}input.focus();
    void send({type:'contacts-use',owner:getOwner(),handle:c.handle}).catch(()=>{});
  }
  async function load(){
    const owner=getOwner(),t=token();if(!owner||!t){close();return;}
    const g=++gen;
    try{
      const page=await send({type:'contacts-page',owner,query:t.text,limit:8});
      if(g!==gen||doc.activeElement!==input&&root.activeElement!==input)return;
      const chosen=new Set(input.value.toLowerCase().match(/@?[a-z0-9_]{1,15}/g)?.map(v=>v.replace('@',''))||[]);
      items=page.items.filter(c=>!chosen.has(c.handle)||c.handle===t.text.toLowerCase());
      if(!items.length){if(t.text){close();return;}list.replaceChildren(Object.assign(doc.createElement('p'),{className:'empty',textContent:'还没有常用联系人。回复或点赞后会自动收录。'}));buttons=[];}
      else{buttons=renderGroups(list,items,{idPrefix:list.id+'-',doc});buttons.forEach((b,i)=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>pick(items[i]);});}
      index=0;list.hidden=false;input.setAttribute('aria-expanded','true');mark();
    }catch{close();}
  }
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(load,120);};
  input.addEventListener('focus',()=>{if(!picking)schedule();});
  input.addEventListener('input',()=>{if(!picking)schedule();});
  input.addEventListener('blur',()=>setTimeout(close,120));
  input.addEventListener('keydown',e=>{
    if(e.isComposing||list.hidden)return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}
    if(!buttons.length)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();index=(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;mark();}
    else if(e.key==='Enter'||(e.key==='Tab'&&token()?.text)){e.preventDefault();pick(items[index]);}
  });
  return{close,refresh:load};
}
