import { createElement, BookmarkCheck, ArrowUpRight } from 'lucide';
import { bookmarkPath } from './bookmarks.js';
import { extractBookmark } from './bookmark-dom.js';
import { currentOwner } from './composer.js';
const send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'扩展已更新，请刷新 X。');return r.data;};
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
let host,title,status,toggle,open,active=false,owner='',route='',generation=0,busy=false,dirty=false,timer=null,total=null;
let mode='loading',error='',configuring=false,headers=[],positionFrame=0,accountChanged=false;
const seen=new Map();
function stop(){active=false;generation++;}
function render(){
  if(!host)return;
  title.textContent=total===null?(mode==='account'?'已停止保存':mode==='login'?'自动保存书签':mode==='error'?'暂时无法保存':'正在读取书签…'):`已保存 ${total.toLocaleString()} 条`;
  status.textContent=error||(mode==='loading'?'正在读取保存进度…':mode==='paused'?'已暂停 · 点击继续保存':mode==='account'?'账号已切换，刷新页面后继续。':mode==='login'?'登录 X 后，自动保存浏览到的书签。':'继续向下浏览，自动保存更多。');
  toggle.textContent=mode==='error'?'重试':active?'暂停':'继续保存';
  toggle.setAttribute('aria-pressed',String(active));toggle.setAttribute('aria-label',active?'暂停自动保存书签':mode==='error'?'重试保存书签':'继续自动保存书签');
  toggle.disabled=configuring||['loading','account','login'].includes(mode);
}
function appearance(){if(!host)return;const rgb=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number),dark=rgb&&rgb.reduce((a,b)=>a+b,0)<350;host.setAttribute('data-theme',dark?'dark':'light');}
function discoverHeaders(main){
  const found=new Set();
  for(const anchor of main.querySelectorAll('nav,[role=navigation],[role=tablist],h1,h2,[role=heading]')){
    if(anchor.closest('article')||!(anchor.compareDocumentPosition(host)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
    for(let n=anchor;n&&n!==main;n=n.parentElement)if(['sticky','fixed'].includes(getComputedStyle(n).position))found.add(n);
  }
  headers=[...found];position();
}
function position(){
  if(positionFrame)return;
  positionFrame=requestAnimationFrame(()=>{positionFrame=0;if(!host?.isConnected)return;
    const bottom=Math.max(0,...headers.filter(n=>n.isConnected).map(n=>{const r=n.getBoundingClientRect();return r.top<innerHeight/2&&r.height<innerHeight/2?r.bottom:0;}));
    const value=`${Math.max(0,Math.ceil(bottom))}px`;
    if(host.style.getPropertyValue('--qb-top')!==value)host.style.setProperty('--qb-top',value);
  });
}
function mount(region){
  if(host?.isConnected)return;
  host=el('div');host.className='qm-bookmarks-host';const root=host.attachShadow({mode:'open'});
  const style=el('style');style.textContent=`:host{display:block;container-type:inline-size;position:sticky;top:var(--qb-top,0px);z-index:2;flex:none;min-width:0;--bg:#fff;--ink:#171717;--muted:#666;--line:#eaeaea;--soft:#f5f5f5;color:var(--ink);background:var(--bg);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}:host([data-theme=dark]){--bg:#111;--ink:#ededed;--muted:#aaa;--line:#333;--soft:#222}*{box-sizing:border-box}section{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;background:var(--bg)}.info{flex:1;min-width:120px}.headline{display:flex;align-items:center;gap:7px}b{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}p{margin:3px 0 0;color:var(--muted);font-size:12px}button{appearance:none;border:0;border-radius:6px;padding:8px 10px;color:var(--ink);background:var(--soft);cursor:pointer;font:inherit;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:34px}button:hover{filter:brightness(.94)}button:active{filter:brightness(.88)}button:focus-visible{outline:1px solid var(--muted);outline-offset:2px}.toggle{min-width:68px;background:transparent}.toggle:hover{background:var(--soft)}.actions{display:flex;gap:6px;flex:none}svg{width:15px;height:15px;flex:none}button:disabled{opacity:.5;cursor:default}@container(max-width:420px){p{min-height:36px}}`;
  const section=el('section'),info=el('div');info.className='info';const headline=el('div');headline.className='headline';title=el('b');headline.append(createElement(BookmarkCheck,{'aria-hidden':'true','stroke-width':1.7}),title);status=el('p');info.append(headline,status);info.setAttribute('role','status');info.setAttribute('aria-live','polite');
  const actions=el('div');actions.className='actions';toggle=el('button');toggle.className='toggle';toggle.type='button';
  open=el('button','查看 / 导出');open.type='button';open.append(createElement(ArrowUpRight,{'aria-hidden':'true','stroke-width':1.7}));actions.append(toggle,open);section.append(info,actions);root.append(style,section);region.before(host);appearance();render();discoverHeaders(region.closest('[data-testid=primaryColumn]'));
  toggle.onclick=()=>void configure(!active);
  open.onclick=async()=>{open.disabled=true;try{await send({type:'options',page:'bookmarks'});}catch(e){error=e.message;render();}finally{open.disabled=false;}};
}
async function initialize(){
  stop();mode=owner?'loading':'login';error='';total=null;render();if(!owner)return;
  const gen=generation,who=owner,path=route;
  try{const result=await send({type:'bookmarks-status',owner:who});if(gen!==generation||currentOwner()!==who||location.pathname!==path)return;
    total=result.count;active=result.automatic;mode=active?'active':'paused';render();if(active)void collect();
  }catch(e){if(gen===generation){mode='error';error=`无法读取进度：${e.message}`;render();}}
}
async function configure(automatic){
  if(configuring||!owner)return;stop();configuring=true;error='';render();const gen=generation,who=owner,path=route;
  try{const result=await send({type:'bookmarks-configure',owner:who,automatic});if(gen!==generation||currentOwner()!==who||location.pathname!==path)return;
    total=result.count;active=result.automatic;mode=active?'active':'paused';
  }catch(e){if(gen===generation){mode='error';error=`未能保存设置：${e.message}`;}}
  finally{configuring=false;render();if(active)void collect();}
}
async function collect(){
  if(!active)return;if(busy){dirty=true;return;}busy=true;dirty=false;const gen=generation,who=owner;
  try{
    const main=document.querySelector('[data-testid="primaryColumn"]');
    const entries=[...(main?.querySelectorAll('article[data-testid="tweet"]')||[])].map(extractBookmark).filter(Boolean).map(item=>({item,stamp:JSON.stringify(item)})).filter(({item,stamp})=>seen.get(item.id)!==stamp);
    for(let i=0;i<entries.length;i+=40){
      if(!active||gen!==generation||currentOwner()!==who||location.pathname!==route||!bookmarkPath(location.pathname))return;
      const batch=entries.slice(i,i+40),r=await send({type:'bookmarks-capture',owner:who,items:batch.map(v=>v.item)});
      if(gen!==generation||currentOwner()!==who||location.pathname!==route)return;
      total=r.count;if(r.automatic===false){stop();mode='paused';render();return;}
      batch.forEach(({item,stamp})=>seen.set(item.id,stamp));while(seen.size>1000)seen.delete(seen.keys().next().value);
      render();
    }
  }catch(e){if(gen===generation){stop();mode='error';error=`保存失败：${e.message}`;render();}}finally{busy=false;if(dirty&&active)schedule();}
}
function scan(){
  timer=null;const path=location.pathname,current=currentOwner();
  if(!bookmarkPath(path)){stop();host?.remove();host=null;seen.clear();owner='';route=path;accountChanged=false;return;}
  const region=document.querySelector('[data-testid="primaryColumn"] [role="region"]');if(!region)return;
  const changedRoute=route!==path,changedOwner=owner!==current;
  // On an in-place account switch the visible tweets can still belong to the
  // previous account. Wait for a fresh page instead of copying those across.
  if(owner&&changedOwner&&!changedRoute){stop();accountChanged=true;mode='account';error='';total=null;owner=current;seen.clear();}
  const start=!accountChanged&&(changedRoute||changedOwner||!route);route=path;owner=current;
  mount(region);appearance();if(!headers.length||headers.some(n=>!n.isConnected))discoverHeaders(region.closest('[data-testid=primaryColumn]'));else position();
  if(start)void initialize();else if(active)void collect();else render();
}
function schedule(){if(globalThis.location&&(bookmarkPath(location.pathname)||host)&&!timer)timer=setTimeout(scan,250);}
new MutationObserver(records=>{if(records.some(r=>!host?.contains(r.target)))schedule();}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','data-testid','aria-selected']});
const theme=new MutationObserver(schedule);for(const n of [document.body,document.documentElement])theme.observe(n,{attributes:true,attributeFilter:['style','class']});
chrome.runtime.onMessage?.addListener(message=>{
  if(message.type!=='bookmarks-preference'||message.owner!==owner||configuring||accountChanged||!host?.isConnected)return;
  stop();total=message.count;active=message.automatic;mode=active?'active':'paused';error='';render();if(active)void collect();
});
window.addEventListener('popstate',schedule);window.addEventListener('scroll',()=>{position();schedule();},{passive:true});window.addEventListener('resize',()=>{if(host)discoverHeaders(host.closest('[data-testid=primaryColumn]'));});
setInterval(()=>{if(location.pathname!==route)scan();else if(bookmarkPath(location.pathname)&&!host?.isConnected)schedule();},1000);
scan();
