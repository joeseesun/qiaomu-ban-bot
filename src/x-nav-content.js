import { createElement,MessageSquarePlus,Link,Globe,Star,Heart,Bookmark,BookOpen,Newspaper,List,ListChecks,Users,User,Hash,AtSign,Bell,Mail,MessageCircle,Send,Pencil,FileText,Image,Video,Music,Calendar,Clock,Search,Compass,Flame,TrendingUp,ChartColumn,Lightbulb,Sparkles,Bot,Code,Rss,Zap,Coffee,House,Briefcase,Folder } from 'lucide';
import { DEFAULT_NAV,INBOX_KEY,navCSS,normalizeNav,readNav } from './x-nav.js';

const ICONS={MessageSquarePlus,Link,Globe,Star,Heart,Bookmark,BookOpen,Newspaper,List,ListChecks,Users,User,Hash,AtSign,Bell,Mail,MessageCircle,Send,Pencil,FileText,Image,Video,Music,Calendar,Clock,Search,Compass,Flame,TrendingUp,ChartColumn,Lightbulb,Sparkles,Bot,Code,Rss,Zap,Coffee,House,Briefcase,Folder};
const NAV='header[role="banner"] nav';
const CSS=':host{display:flex;width:100%;min-width:0;container-type:inline-size}*{box-sizing:border-box}.item{display:inline-flex;align-items:center;height:calc(1.75rem + 24px);max-width:100%;padding:12px;gap:20px;border:0;border-radius:999px;background:transparent;font:20px/24px TwitterChirp,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif;color:var(--qx-strong);text-decoration:none;cursor:pointer}.item:hover{background:var(--qx-hover)}.item:active{background:var(--qx-press)}.item:focus-visible{outline:2px solid var(--qx-focus);outline-offset:-2px}.icon{width:1.75rem;height:1.75rem;flex:none;display:inline-flex;align-items:center;justify-content:center}.icon svg{width:1.75rem;height:1.75rem;stroke-width:2.1}.icon img{width:1.6rem;height:1.6rem;border-radius:5px;object-fit:cover}.emoji{font-size:1.45rem;line-height:1}.label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item[aria-current=page] .label{font-weight:700}.item[aria-current=page] svg{stroke-width:2.8}@container(max-width:80px){.item{width:calc(1.75rem + 24px);margin-inline:auto;justify-content:center;gap:0}.label{display:none}}';

let config={...DEFAULT_NAV},style=null,nav=null,navWatch=null,reported='',hosts=new Map(),queued=false,lastPath=location.pathname,ready=false;
const send=async message=>{const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw Error(r?.error||'扩展连接中断，请刷新 X。');return r.data;};

function palette(h){
  const rgb=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number),dark=rgb&&rgb.reduce((a,b)=>a+b,0)<350;
  for(const[k,v]of Object.entries({strong:dark?'#e7e9ea':'#0f1419',hover:dark?'rgba(231,233,234,.1)':'rgba(15,20,25,.1)',press:dark?'rgba(231,233,234,.18)':'rgba(15,20,25,.18)',focus:dark?'#8ecdf8':'#1d9bf0'}))h.style.setProperty('--qx-'+k,v);
}
function applyCSS(){
  style??=Object.assign(document.createElement('style'),{id:'qx-nav-style'});
  style.textContent=navCSS(config);if(!style.isConnected)(document.head||document.documentElement).append(style);
}
function iconFor(item){
  const box=document.createElement('span');box.className='icon';box.setAttribute('aria-hidden','true');
  if(item.icon.type==='image'){const img=document.createElement('img');img.alt='';img.src=item.icon.value;box.append(img);}
  else if(item.icon.type==='emoji'){box.classList.add('emoji');box.textContent=item.icon.value;}
  else box.append(createElement(ICONS[item.icon.value]||Link,{'aria-hidden':'true',focusable:'false'}));
  return box;
}
function internal(url){return url.startsWith('/')?url:null;}
function go(item,event){
  if(item.url.startsWith('qiaomu:')){event.preventDefault();void send({type:'options',page:item.url.slice(7)}).catch(()=>{});return;}
  const path=internal(item.url);if(!path||item.newTab||event.metaKey||event.ctrlKey||event.shiftKey||event.button)return;
  // Stay inside X's single-page app instead of reloading the whole timeline.
  event.preventDefault();if(location.pathname+location.search===path)return;
  history.pushState(null,'',path);dispatchEvent(new PopStateEvent('popstate',{state:null}));
}
function entry(key,item){
  const h=document.createElement('span');h.dataset.qxNav=key;h.className='qx-nav-host';h.attachShadow({mode:'open'});
  const css=document.createElement('style');css.textContent=CSS;const a=document.createElement('a');a.className='item';
  a.href=item.url.startsWith('qiaomu:')?'#':item.url;if(item.newTab||(!internal(item.url)&&!item.url.startsWith('qiaomu:'))){a.target='_blank';a.rel='noopener noreferrer';}
  const label=document.createElement('span');label.className='label';label.textContent=item.name;a.append(iconFor(item),label);a.title=item.name;a.setAttribute('aria-label',item.name);
  a.addEventListener('click',e=>go(item,e));h.addEventListener('pointerdown',e=>e.stopPropagation());
  h.shadowRoot.append(css,a);palette(h);h._item=item;return h;
}
function wanted(){
  const list=[];if(!config.hidden.includes(INBOX_KEY))list.push([INBOX_KEY,{name:'待回复',url:'qiaomu:workspace/inbox',icon:{type:'lucide',value:'MessageSquarePlus'}}]);
  for(const c of config.custom)if(!config.hidden.includes('custom:'+c.id))list.push(['custom:'+c.id,c]);
  return list;
}
function markCurrent(){
  for(const h of hosts.values()){const a=h.shadowRoot.querySelector('a'),url=h._item.url;const on=url.startsWith('/')&&new URL(url,location.origin).pathname===location.pathname;if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
}
function mount(){
  if(!nav?.isConnected)return;
  const list=wanted(),keys=new Set(list.map(([k])=>k)),order=new Map(config.order.map((k,n)=>[k,n]));
  for(const[k,h]of hosts)if(!keys.has(k)||!h.isConnected||h.parentElement!==nav){h.remove();hosts.delete(k);}
  const more=[...nav.children].find(c=>c.matches('[data-testid="AppTabBar_More_Menu"]')||c.querySelector('[data-testid="AppTabBar_More_Menu"]'))||null;
  for(const[k,item]of list){
    let h=hosts.get(k);if(h&&JSON.stringify(h._item)!==JSON.stringify(item)){h.remove();h=null;}
    if(!h){h=entry(k,item);hosts.set(k,h);}
    // Without a custom order, keep the inbox right after Explore and the
    // user's links just above X's "More" button.
    const explore=[...nav.children].find(c=>c.matches('[data-testid="AppTabBar_Explore_Link"]'));
    const before=k===INBOX_KEY&&explore?explore.nextSibling:more;
    if(h.parentElement!==nav||(k===INBOX_KEY&&explore&&h.previousElementSibling!==explore))nav.insertBefore(h,before&&before!==h?before:null);
    h.style.order=config.order.length?String(order.get(k)??1000):'';palette(h);
  }
  markCurrent();
}
function report(){
  if(!ready||!nav?.isConnected)return;const items=readNav(nav),key=JSON.stringify(items);if(!items.length||key===reported)return;
  reported=key;void send({type:'x-nav-seen',items}).catch(()=>{reported='';});
}
function check(){
  queued=false;if(location.pathname!==lastPath){lastPath=location.pathname;markCurrent();}
  const found=document.querySelector(NAV);
  if(found!==nav){nav=found;navWatch?.disconnect();if(nav){navWatch=new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>!n.dataset?.qxNav)))schedule();});navWatch.observe(nav,{childList:true});}}
  if(!nav)return;mount();report();
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(check);}}
async function load(){
  try{config=normalizeNav(await send({type:'x-nav-state'}));}catch{config={...DEFAULT_NAV};}
  ready=true;applyCSS();for(const h of hosts.values())h.remove();hosts.clear();schedule();
}
chrome.runtime.onMessage?.addListener(message=>{if(message?.type==='x-nav-changed')void load();});
// The style goes in before X renders its sidebar, so hidden entries never flash.
void load();
const start=()=>{new MutationObserver(()=>{if(!nav?.isConnected||location.pathname!==lastPath)schedule();}).observe(document.body,{childList:true,subtree:true});schedule();};
if(document.body)start();else document.addEventListener('DOMContentLoaded',start,{once:true});
