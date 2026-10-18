import { createElement, Bookmark, ArrowUpRight } from 'lucide';
import { bookmarkPath } from './bookmarks.js';
import { extractBookmark } from './bookmark-dom.js';
import { currentOwner } from './composer.js';
const send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'扩展已更新，请刷新 X。');return r.data;};
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
let host,root,status,toggle,open,active=false,owner='',route='',generation=0,busy=false,dirty=false,timer=null,total=0;
const seen=new Map(),sessionIds=new Set();
function stop(){active=false;generation++;if(toggle){toggle.textContent='继续收集';toggle.setAttribute('aria-pressed','false');}}
function appearance(){if(!host)return;const rgb=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number),dark=rgb&&rgb.reduce((a,b)=>a+b,0)<350;host.setAttribute('data-theme',dark?'dark':'light');}
function mount(region){
  if(host?.isConnected)return;
  host=el('div');host.className='qm-bookmarks-host';root=host.attachShadow({mode:'open'});
  const style=el('style');style.textContent=`:host{display:block;flex:none;min-width:0;--bg:#fff;--ink:#171717;--muted:#666;--line:#eaeaea;--soft:#f5f5f5;color:var(--ink);background:var(--bg);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}:host([data-theme=dark]){--bg:#111;--ink:#ededed;--muted:#aaa;--line:#333;--soft:#222}*{box-sizing:border-box}section{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px;flex-wrap:wrap}.info{flex:1;min-width:140px}b{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600}p{margin:4px 0 0;color:var(--muted);font-size:12px}button{appearance:none;border:0;border-radius:6px;padding:8px 10px;color:var(--ink);background:var(--soft);cursor:pointer;font:inherit;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:4px}button:hover{filter:brightness(.94)}button:active{filter:brightness(.88)}button:focus-visible{outline:1px solid var(--muted);outline-offset:2px}button[aria-pressed=true]{background:var(--ink);color:var(--bg)}.actions{display:flex;gap:6px;flex-wrap:wrap}svg{width:15px;height:15px;flex:none}button:disabled{opacity:.5;cursor:wait}`;
  const section=el('section'),info=el('div');info.className='info';const title=el('b','书签，留一份在本机');title.prepend(createElement(Bookmark,{'aria-hidden':'true','stroke-width':1.7}));status=el('p','点击开始，向下浏览时收集已加载的书签。');status.setAttribute('role','status');info.append(title,status);
  const actions=el('div');actions.className='actions';toggle=el('button','开始收集');toggle.type='button';toggle.setAttribute('aria-pressed','false');
  open=el('button','查看 / 导出');open.type='button';open.append(createElement(ArrowUpRight,{'aria-hidden':'true','stroke-width':1.7}));if(active){toggle.textContent='暂停收集';toggle.setAttribute('aria-pressed','true');}actions.append(toggle,open);section.append(info,actions);root.append(style,section);region.before(host);appearance();
  toggle.onclick=()=>{if(active){stop();status.textContent=`已暂停 · 本次读取 ${sessionIds.size} 条 · 本机 ${total} 条`;return;}const current=currentOwner();if(!current){status.textContent='先登录 X，再开始收集。';return;}if(current!==owner){seen.clear();sessionIds.clear();total=0;}owner=current;route=location.pathname;active=true;generation++;toggle.textContent='暂停收集';toggle.setAttribute('aria-pressed','true');status.textContent='正在收集。继续向下浏览即可。';void collect();};
  open.onclick=async()=>{open.disabled=true;try{await send({type:'options',page:'bookmarks'});}catch(e){status.textContent=e.message;}finally{open.disabled=false;}};
}
async function collect(){
  if(!active)return;if(busy){dirty=true;return;}busy=true;dirty=false;const gen=generation,who=owner;
  try{
    const main=document.querySelector('[data-testid="primaryColumn"]');
    const entries=[...(main?.querySelectorAll('article[data-testid="tweet"]')||[])].map(extractBookmark).filter(Boolean).map(item=>({item,stamp:JSON.stringify(item)})).filter(({item,stamp})=>seen.get(item.id)!==stamp);
    for(let i=0;i<entries.length;i+=40){
      if(!active||gen!==generation||currentOwner()!==who||location.pathname!==route||!bookmarkPath(location.pathname))return;
      const batch=entries.slice(i,i+40),r=await send({type:'bookmarks-capture',owner:who,items:batch.map(v=>v.item)});
      if(gen!==generation)return;
      batch.forEach(({item,stamp})=>{seen.set(item.id,stamp);sessionIds.add(item.id);});while(seen.size>1000)seen.delete(seen.keys().next().value);
      total=r.count;
    }
    if(active&&gen===generation)status.textContent=`本次读取 ${sessionIds.size} 条 · 本机 ${total} 条 · 向下浏览继续收集`;
  }catch(e){if(gen===generation){stop();status.textContent=e.message+' 点击继续可重试。';}}finally{busy=false;if(dirty&&active)schedule();}
}
function scan(){
  timer=null;const path=location.pathname,current=currentOwner();
  if(!bookmarkPath(path)){stop();host?.remove();host=null;seen.clear();sessionIds.clear();owner='';return;}
  if(active&&(owner!==current||route!==path)){stop();seen.clear();sessionIds.clear();status.textContent='页面或账号已切换，点击继续收集。';}
  const region=document.querySelector('[data-testid="primaryColumn"] [role="region"]');if(region)mount(region);appearance();if(active)void collect();
}
function schedule(){if(!timer)timer=setTimeout(scan,250);}
new MutationObserver(records=>{if(records.some(r=>!host?.contains(r.target)))schedule();}).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','data-testid','aria-selected']});
const theme=new MutationObserver(schedule);for(const n of [document.body,document.documentElement])theme.observe(n,{attributes:true,attributeFilter:['style','class']});
window.addEventListener('popstate',schedule);window.addEventListener('scroll',schedule,{passive:true});
// X changes SPA routes without popstate; a light route guard stops collection
// immediately on navigation even when no relevant DOM node changed.
setInterval(()=>{if(location.pathname!==route&&active)scan();else if(bookmarkPath(location.pathname)&&!host?.isConnected)schedule();},1000);
scan();
