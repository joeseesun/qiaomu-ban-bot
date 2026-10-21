// X left-sidebar customisation: which native entries show, their order, and
// user-added links. Pure data helpers shared by the background, the settings
// page and the X content script.

export const NAV_KEY='xNav',SEEN_KEY='xNavSeen';
export const INBOX_KEY='qiaomu:inbox';
export const MAX_CUSTOM=12,MAX_SEEN=30,MAX_NAME=20,MAX_IMAGE=60000;
// Entries X keeps as the escape hatch: never listed, never hidden.
const PINNED=new Set(['AppTabBar_More_Menu']);
// Extension pages a custom entry may open ("qiaomu:<page>").
export const PLUGIN_PAGES={'workspace/inbox':'待回复','posts':'发帖','write':'写作','bookmarks':'书签','workspace/search':'搜索','contacts':'常用 @'};
export const NAV_ICONS=['Link','Globe','Star','Heart','Bookmark','BookOpen','Newspaper','List','ListChecks','Users','User','Hash','AtSign','Bell','Mail','MessageCircle','Send','Pencil','FileText','Image','Video','Music','Calendar','Clock','Search','Compass','Flame','TrendingUp','ChartColumn','Lightbulb','Sparkles','Bot','Code','Rss','Zap','Coffee','House','Briefcase','Folder','MessageSquarePlus'];
export const DEFAULT_NAV=Object.freeze({hidden:[],order:[],custom:[]});

const KEY=/^(?:testid:[\w-]{1,80}|href:\/[\w\-./]{0,120}|qiaomu:inbox|custom:[\w-]{1,40})$/;
const PATH=/^[\d\s.,eE+\-MmLlHhVvCcSsQqTtAaZz]{1,4000}$/,VIEWBOX=/^[\d\s.,\-]{1,40}$/;
const text=(v,max)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);

export function navKey(node){
  if(!node?.matches)return '';
  const target=node.matches('a[href],button[data-testid]')?node:node.querySelector('a[href],button[data-testid]');if(!target)return '';
  const id=target.getAttribute('data-testid')||'';if(PINNED.has(id))return '';
  if(id&&/^[\w-]{1,80}$/.test(id))return 'testid:'+id;
  const href=target.getAttribute('href')||'';if(!href.startsWith('/')||href.startsWith('//'))return '';
  const path=href.split(/[?#]/)[0].replace(/\/+$/,'')||'/';return /^\/[\w\-./]{0,120}$/.test(path)?'href:'+path:'';
}

// Rebuild a native icon from its path data only, so nothing from the page is
// ever parsed as markup on the settings page.
export function iconShape(svg){
  if(!svg)return null;const viewBox=svg.getAttribute('viewBox')||'0 0 24 24';if(!VIEWBOX.test(viewBox))return null;
  const paths=[...svg.querySelectorAll('path')].map(p=>p.getAttribute('d')||'').filter(d=>PATH.test(d)).slice(0,6);
  return paths.length?{viewBox,paths}:null;
}

export function readNav(nav){
  const items=[];
  for(const child of nav?.children||[]){
    if(child.hasAttribute('data-qx-nav'))continue;const key=navKey(child);if(!key||items.some(i=>i.key===key))continue;
    const target=child.matches('a,button')?child:child.querySelector('a[href],button[data-testid]');
    const label=text(target.querySelector('[dir] span')?.textContent||target.getAttribute('aria-label')||target.textContent,40);
    items.push({key,label:label||key.split(/[:_/]/).filter(Boolean).at(-1),icon:iconShape(target.querySelector('svg'))});
  }
  return items;
}

export function mergeSeen(previous,current){
  const clean=(Array.isArray(current)?current:[]).map(seenItem).filter(Boolean);
  const keys=new Set(clean.map(i=>i.key));
  return[...clean,...(Array.isArray(previous)?previous:[]).map(seenItem).filter(i=>i&&!keys.has(i.key))].slice(0,MAX_SEEN);
}
function seenItem(i){
  if(!i||!KEY.test(i.key)||!/^(?:testid|href):/.test(i.key))return null;
  const icon=i.icon&&VIEWBOX.test(i.icon.viewBox)&&Array.isArray(i.icon.paths)?{viewBox:i.icon.viewBox,paths:i.icon.paths.filter(d=>typeof d==='string'&&PATH.test(d)).slice(0,6)}:null;
  return{key:i.key,label:text(i.label,40)||i.key,icon:icon?.paths.length?icon:null};
}

export function linkTarget(raw){
  const value=text(raw,500);if(!value)throw Error('请填写链接。');
  if(value.startsWith('qiaomu:')){const page=value.slice(7);if(Object.hasOwn(PLUGIN_PAGES,page))return value;throw Error('不认识这个插件页面。');}
  if(value.startsWith('/')&&!value.startsWith('//'))return new URL(value,'https://x.com').pathname+new URL(value,'https://x.com').search;
  if(value.startsWith('//'))throw Error('链接格式不对，例如 https://example.com 或 /i/lists。');
  let url;try{url=new URL(/^[a-z][\w+.-]*:/i.test(value)?value:'https://'+value);}catch{throw Error('链接格式不对，例如 https://example.com 或 /i/lists。');}
  if(url.protocol!=='https:')throw Error('只支持 https:// 链接。');
  if(['x.com','www.x.com','twitter.com','www.twitter.com'].includes(url.hostname))return (url.pathname||'/')+url.search;
  return url.href;
}

export function customItem(raw){
  const name=text(raw?.name,MAX_NAME);if(!name)throw Error('请填写名称。');
  const url=linkTarget(raw?.url);
  const id=/^[\w-]{1,40}$/.test(raw?.id||'')?raw.id:'c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const icon=raw?.icon||{},type=icon.type;let value;
  if(type==='emoji'){value=text(icon.value,16);if(!value)throw Error('请填写一个 Emoji。');}
  else if(type==='image'){value=String(icon.value||'');if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)||value.length>MAX_IMAGE)throw Error('图片无效，请重新选择。');}
  else{value=NAV_ICONS.includes(icon.value)?icon.value:'Link';}
  return{id,name,url,icon:{type:type==='emoji'||type==='image'?type:'lucide',value},newTab:raw?.newTab===true&&!url.startsWith('qiaomu:')};
}

export function normalizeNav(raw){
  const custom=[];for(const c of Array.isArray(raw?.custom)?raw.custom:[]){if(custom.length>=MAX_CUSTOM)break;try{const item=customItem(c);if(!custom.some(x=>x.id===item.id))custom.push(item);}catch{}}
  const keys=list=>[...new Set((Array.isArray(list)?list:[]).filter(k=>typeof k==='string'&&KEY.test(k)))].slice(0,80);
  const live=k=>!k.startsWith('custom:')||custom.some(c=>'custom:'+c.id===k);
  return{hidden:keys(raw?.hidden).filter(live),order:keys(raw?.order).filter(live),custom};
}

// Rows shown on the settings page: X's own entries, the plugin entry and the
// user's links, in the order they will appear on X.
export function navRows(config,seen){
  const rows=[];const hidden=new Set(config.hidden);
  for(const i of seen||[])rows.push({key:i.key,label:i.label,kind:'x',icon:i.icon});
  const explore=rows.findIndex(r=>r.key==='testid:AppTabBar_Explore_Link');
  rows.splice(explore<0?rows.length:explore+1,0,{key:INBOX_KEY,label:'待回复',kind:'plugin'});
  for(const c of config.custom)rows.push({key:'custom:'+c.id,label:c.name,kind:'custom',item:c});
  if(config.order.length){const rank=new Map(config.order.map((k,n)=>[k,n]));rows.sort((a,b)=>(rank.get(a.key)??1e3)-(rank.get(b.key)??1e3));}
  return rows.map(r=>({...r,hidden:hidden.has(r.key)}));
}

const selectorFor=key=>{
  const value=key.slice(key.indexOf(':')+1).replace(/["\\]/g,'');
  const attr=key.startsWith('testid:')?`[data-testid="${value}"]`:key.startsWith('href:')?`a[href="${value}"]`:`[data-qx-nav="${value.replace(/^custom:/,'')}"]`;
  return`header[role="banner"] nav > :is(${attr},:has(${attr}))`;
};
export function navCSS(config){
  const rules=[];
  for(const key of config.hidden)if(!key.startsWith('custom:')&&key!==INBOX_KEY)rules.push(`${selectorFor(key)}{display:none!important}`);
  if(config.order.length){
    rules.push('header[role="banner"] nav > *{order:1000}');
    config.order.forEach((key,n)=>{if(key.startsWith('testid:')||key.startsWith('href:'))rules.push(`${selectorFor(key)}{order:${n}}`);});
  }
  return rules.join('\n');
}
