// Fills X's own composer with a post from the local queue. It never presses
// Post or confirms a schedule: the user finishes in X's UI.
import { EDITOR, currentOwner } from './composer.js';
import { chunkBytes } from './posts.js';
const send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'扩展已更新，请刷新 X 页面');return r.data;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,timeout=15000,step=150){const end=Date.now()+timeout;for(;;){const v=fn();if(v)return v;if(Date.now()>end)return null;await pause(step);}}
const norm=s=>String(s||'').replace(/\s+/g,'');
function composer(){
  const editors=[...document.querySelectorAll(EDITOR)];
  const inDialog=editors.find(e=>e.closest('[role="dialog"]'));
  return inDialog||editors[0]||null;
}
function scopeOf(editor){return editor.closest('[role="dialog"]')||editor.closest('[data-testid="primaryColumn"]')||document;}
export async function pasteText(editor,text){
  const view=editor.ownerDocument.defaultView;
  editor.focus({preventScroll:true});await pause(0);
  const data=new view.DataTransfer();data.setData('text/plain',text);
  const paste=new view.ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
  editor.dispatchEvent(paste);await pause(50);
  if(!paste.defaultPrevented&&!norm(editor.textContent).includes(norm(text).slice(0,40)))editor.ownerDocument.execCommand?.('insertText',false,text);
  await pause(50);
  return norm(editor.textContent).includes(norm(text).slice(0,200));
}
async function fetchFile(postId,meta){
  const parts=[];let offset=0;
  for(;;){const r=await send({type:'posts-media-chunk',postId,mediaId:meta.id,offset});parts.push(chunkBytes(r.data));offset=r.next;if(r.done)break;}
  return new File(parts,meta.name||'media',{type:meta.type});
}
export async function attachFiles(scope,files){
  const input=scope.querySelector('input[data-testid="fileInput"]')||document.querySelector('input[data-testid="fileInput"]');
  if(!input)throw Error('没有找到 X 的添加媒体按钮。');
  const view=input.ownerDocument.defaultView,data=new view.DataTransfer();for(const f of files)data.items.add(f);
  input.files=data.files;input.dispatchEvent(new view.Event('change',{bubbles:true}));
  return until(()=>scope.querySelectorAll('[data-testid="attachments"] img,[data-testid="attachments"] video,[data-testid="attachments"] [role="progressbar"]').length,12000);
}
// X's schedule panel is a set of native <select>s labelled by date part.
const PARTS=[['month',/month|月/i],['day',/^day|日|天/i],['year',/year|年/i],['hour',/hour|时/i],['minute',/minute|分/i],['ampm',/am\s*\/\s*pm|上午|下午/i]];
function labelOf(select){
  const ids=(select.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
  const text=[...ids.map(id=>select.ownerDocument.getElementById(id)?.textContent||''),select.getAttribute('aria-label')||'',select.id?[...select.ownerDocument.querySelectorAll('label[for]')].find(l=>l.htmlFor===select.id)?.textContent||'':''].join(' ');
  return text.trim();
}
function choose(select,values){
  const vs=values.map(v=>String(v).toLowerCase()),opts=[...select.options];
  const hit=opts.find(o=>vs.includes(o.value.toLowerCase()))||opts.find(o=>vs.includes(o.textContent.trim().toLowerCase()));
  if(!hit)return false;
  select.value=hit.value;select.dispatchEvent(new select.ownerDocument.defaultView.Event('change',{bubbles:true}));return select.value===hit.value;
}
export async function presetSchedule(at){
  const button=document.querySelector('[data-testid="scheduleOption"]');if(!button)return false;
  button.click();
  const selects=await until(()=>{const all=[...document.querySelectorAll('[role="dialog"] select')];return all.length>=4?all:null;},6000);
  if(!selects)return false;
  const d=new Date(at),h=d.getHours(),twelve=selects.some(s=>PARTS[5][1].test(labelOf(s)));
  const want={month:[String(d.getMonth()+1)],day:[String(d.getDate())],year:[String(d.getFullYear())],minute:[String(d.getMinutes()),String(d.getMinutes()).padStart(2,'0')],
    hour:twelve?[String(h%12||12)]:[String(h),String(h).padStart(2,'0')],ampm:h<12?['am','上午']:['pm','下午']};
  let ok=0,found=0;
  for(const s of selects){const part=PARTS.find(([,re])=>re.test(labelOf(s)));if(!part)continue;found++;if(choose(s,want[part[0]]))ok++;}
  return found>=5&&ok===found;
}
let note=null;
function toast(text,error=false){
  note?.remove();note=document.createElement('div');note.setAttribute('role','status');note.textContent=text;
  note.style.cssText=`position:fixed;z-index:2147483647;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(520px,calc(100vw - 32px));padding:10px 14px;border-radius:10px;font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:${error?'#7a2e12':'#0f1419'};color:#fff;box-shadow:0 8px 24px #0003`;
  document.body.append(note);setTimeout(()=>note?.remove(),9000);
}
const when=t=>new Date(t).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
async function fill(){
  let job;try{job=await send({type:'posts-fill-pending'});}catch{return;}
  if(!job?.post)return;
  const{post,media}=job;
  try{
    const editor=await until(composer);if(!editor)throw Error('没有等到 X 的发帖框，请重新点「填入 X」。');
    if(norm(editor.textContent))throw Error('X 的发帖框里已经有内容，为避免覆盖，没有填入。');
    const scope=scopeOf(editor);
    if(post.text&&!await pasteText(editor,post.text))throw Error('正文没有填进去，请复制后手动粘贴。');
    if(media.length){
      toast(`正在添加 ${media.length} 个附件…`);
      const files=[];for(const m of media)files.push(await fetchFile(post.id,m));
      if(!await attachFiles(scope,files))throw Error('附件没有出现在发帖框里，请手动添加。');
    }
    let scheduled=false;
    if(post.nativeSchedule&&post.scheduledAt>Date.now()+5*60000)scheduled=await presetSchedule(post.scheduledAt);
    await send({type:'posts-filled',id:post.id,owner:currentOwner()});
    toast(scheduled?`已填入并预选 ${when(post.scheduledAt)}。请在 X 的定时面板点「确认」，再点「定时」。`:post.nativeSchedule&&post.scheduledAt>Date.now()+5*60000?`已填入。请点 X 的日历图标，选择 ${when(post.scheduledAt)} 定时发送。`:'已填入。检查无误后点「发帖」。');
    watchPosted(post.id);
  }catch(e){toast(e.message,true);void send({type:'posts-filled',id:post.id,error:e.message}).catch(()=>{});}
}
// Marks the queue item as posted when X shows its "sent" toast with a link.
function watchPosted(id){
  const owner=currentOwner();if(!owner)return;
  const seen=new Set([...document.querySelectorAll('[data-testid="toast"] a[href*="/status/"]')].map(a=>a.getAttribute('href')));
  const end=Date.now()+10*60000;
  const timer=setInterval(()=>{
    if(Date.now()>end){clearInterval(timer);return;}
    const link=[...document.querySelectorAll('[data-testid="toast"] a[href]')].map(a=>a.getAttribute('href')).find(h=>!seen.has(h)&&new RegExp(`^/${owner}/status/\\d+`,'i').test(h||''));
    if(link){clearInterval(timer);void send({type:'posts-posted',id,url:'https://x.com'+link}).catch(()=>{});}
  },700);
}
let last='';
function check(){const href=globalThis.location?.href;if(href&&href!==last){last=href;if(/^\/compose\/(post|tweet)/.test(location.pathname))void fill();}}
check();
chrome.runtime.onMessage.addListener(m=>{if(m?.type==='posts-fill-ready')void fill();});
new MutationObserver(check).observe(document.documentElement,{childList:true,subtree:true});
