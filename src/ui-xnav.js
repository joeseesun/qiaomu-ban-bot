import { createElement,ArrowUp,ArrowDown,Pencil,Trash2,MessageSquarePlus,Link,Globe,Star,Heart,Bookmark,BookOpen,Newspaper,List,ListChecks,Users,User,Hash,AtSign,Bell,Mail,MessageCircle,Send,FileText,Image,Video,Music,Calendar,Clock,Search,Compass,Flame,TrendingUp,ChartColumn,Lightbulb,Sparkles,Bot,Code,Rss,Zap,Coffee,House,Briefcase,Folder } from 'lucide';
import { NAV_ICONS,PLUGIN_PAGES,MAX_CUSTOM,MAX_IMAGE,customItem,navRows } from './x-nav.js';

const ICONS={MessageSquarePlus,Link,Globe,Star,Heart,Bookmark,BookOpen,Newspaper,List,ListChecks,Users,User,Hash,AtSign,Bell,Mail,MessageCircle,Send,Pencil,FileText,Image,Video,Music,Calendar,Clock,Search,Compass,Flame,TrendingUp,ChartColumn,Lightbulb,Sparkles,Bot,Code,Rss,Zap,Coffee,House,Briefcase,Folder};
const PRESETS=[['posts','Send'],['write','Pencil'],['bookmarks','Bookmark'],['workspace/search','Search'],['contacts','AtSign']];
const SVG='http://www.w3.org/2000/svg';
const KIND={x:'X 自带',plugin:'乔木 X 助手',custom:'我的链接'};

export function initXNavUI({send,notice}){
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  const lucide=(node,size=20)=>createElement(node||Link,{width:size,height:size,'stroke-width':1.8,'aria-hidden':'true',focusable:'false'});
  let state={hidden:[],order:[],custom:[],seen:[]},editing=null,icon={type:'lucide',value:'Link'},saving=Promise.resolve();

  function nativeIcon(shape){
    const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox',shape.viewBox);svg.setAttribute('width','20');svg.setAttribute('height','20');svg.setAttribute('fill','currentColor');svg.setAttribute('aria-hidden','true');
    for(const d of shape.paths){const p=document.createElementNS(SVG,'path');p.setAttribute('d',d);svg.append(p);}return svg;
  }
  function iconFor(row){
    const box=el('span',null,'xnav-icon');box.setAttribute('aria-hidden','true');
    const c=row.item?.icon||(row.kind==='plugin'?{type:'lucide',value:'MessageSquarePlus'}:null);
    if(row.kind==='x'){if(row.icon)box.append(nativeIcon(row.icon));else box.textContent=row.label.slice(0,1);}
    else if(c.type==='image'){const img=el('img');img.alt='';img.src=c.value;box.append(img);}
    else if(c.type==='emoji'){box.textContent=c.value;box.classList.add('emoji');}
    else box.append(lucide(ICONS[c.value]));
    return box;
  }
  const iconButton=(label,node,run)=>{const b=el('button',null,'icon-control');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(lucide(node,17));b.onclick=run;return b;};

  async function save(next,focus){
    const run=saving.then(async()=>{state=await send({type:'x-nav-save',config:{hidden:next.hidden,order:next.order,custom:next.custom}});render(focus);});
    saving=run.catch(()=>{});
    try{await run;}catch(e){notice(e.message,true);render();}
  }
  function render(focus){
    const rows=navRows(state,state.seen),list=$('xnav-list');list.replaceChildren();
    $('xnav-empty').hidden=state.seen.length>0;
    rows.forEach((row,n)=>{
      const li=el('li',null,'xnav-row');li.dataset.key=row.key;li.classList.toggle('off',row.hidden);
      const text=el('span',null,'xnav-text');text.append(el('b',row.label),el('small',row.kind==='custom'?row.item.url.replace(/^qiaomu:/,'插件 · ').replace(/^https:\/\//,''):KIND[row.kind]));
      const actions=el('span',null,'xnav-actions');
      const move=(delta,label,node)=>{const b=iconButton(label,node,()=>{const keys=rows.map(r=>r.key);[keys[n],keys[n+delta]]=[keys[n+delta],keys[n]];void save({...state,order:keys},{key:row.key,action:label});});b.dataset.action=label;b.disabled=n+delta<0||n+delta>=rows.length;return b;};
      actions.append(move(-1,'上移',ArrowUp),move(1,'下移',ArrowDown));
      if(row.kind==='custom'){
        actions.append(iconButton(`编辑「${row.label}」`,Pencil,()=>openEditor(row.item)));
        actions.append(iconButton(`删除「${row.label}」`,Trash2,()=>{const key='custom:'+row.item.id;void save({...state,custom:state.custom.filter(c=>c.id!==row.item.id),order:state.order.filter(k=>k!==key),hidden:state.hidden.filter(k=>k!==key)});notice(`已删除「${row.label}」`);}));
      }
      const sw=el('label',null,'switch small');const input=el('input');input.type='checkbox';input.setAttribute('role','switch');input.checked=!row.hidden;input.setAttribute('aria-label',`在 X 侧栏显示「${row.label}」`);sw.append(input,el('span'));
      input.onchange=()=>void save({...state,hidden:input.checked?state.hidden.filter(k=>k!==row.key):[...state.hidden,row.key]},{key:row.key,action:'switch'});
      li.append(iconFor(row),text,actions,sw);list.append(li);
    });
    $('xnav-add').disabled=state.custom.length>=MAX_CUSTOM;$('xnav-add').title=state.custom.length>=MAX_CUSTOM?`最多 ${MAX_CUSTOM} 个自定义入口`:'';
    if(focus){const li=[...list.children].find(n=>n.dataset.key===focus.key);const target=focus.action==='switch'?li?.querySelector('input'):li?.querySelector(`[data-action="${focus.action}"]`);(target&&!target.disabled?target:li?.querySelector('input'))?.focus({preventScroll:true});}
  }

  function renderIconPicker(){
    for(const b of document.querySelectorAll('[data-icon-type]'))b.setAttribute('aria-pressed',String(b.dataset.iconType===icon.type));
    $('xnav-icon-grid').hidden=icon.type!=='lucide';$('xnav-emoji-field').hidden=icon.type!=='emoji';$('xnav-image-field').hidden=icon.type!=='image';
    for(const b of $('xnav-icon-grid').children){const on=icon.type==='lucide'&&b.dataset.name===icon.value;b.setAttribute('aria-checked',String(on));b.tabIndex=on||(!NAV_ICONS.includes(icon.value)&&b===$('xnav-icon-grid').firstElementChild)?0:-1;}
    const preview=$('xnav-image-preview');preview.replaceChildren();if(icon.type==='image'&&icon.value.startsWith('data:')){const img=el('img');img.alt='已选择的图片';img.src=icon.value;preview.append(img);}
  }
  function openEditor(item=null){
    editing=item;$('xnav-editor').hidden=false;$('xnav-editor-title').textContent=item?'编辑入口':'添加入口';error('');
    $('xnav-name').value=item?.name||'';$('xnav-url').value=item?.url||'';$('xnav-newtab').checked=item?.newTab===true;
    icon=item?{...item.icon}:{type:'lucide',value:'Link'};$('xnav-emoji').value=icon.type==='emoji'?icon.value:'';
    renderIconPicker();$('xnav-name').focus();
  }
  function closeEditor(){editing=null;$('xnav-editor').hidden=true;$('xnav-add').focus();}
  const error=msg=>{$('xnav-error').textContent=msg;$('xnav-error').hidden=!msg;};

  async function pickImage(file){
    if(!file)return;if(file.size>2*1024*1024)throw Error('图片太大，请选 2MB 以内的。');
    const url=URL.createObjectURL(file);
    try{
      const img=await new Promise((resolve,reject)=>{const i=new window.Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('读不出这张图片。'));i.src=url;});
      // Re-encode into a small PNG: strips scripts from SVGs and keeps storage tiny.
      const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
      const side=Math.min(img.naturalWidth||64,img.naturalHeight||64),sx=((img.naturalWidth||64)-side)/2,sy=((img.naturalHeight||64)-side)/2;
      ctx.drawImage(img,sx,sy,side,side,0,0,64,64);const data=canvas.toDataURL('image/png');
      if(data.length>MAX_IMAGE)throw Error('图片处理后仍然太大，换一张简单些的。');
      icon={type:'image',value:data};renderIconPicker();
    }finally{URL.revokeObjectURL(url);}
  }

  // Static parts of the editor.
  for(const name of NAV_ICONS){const b=el('button',null,'xnav-pick');b.type='button';b.dataset.name=name;b.setAttribute('role','radio');b.setAttribute('aria-label',name);b.title=name;b.append(lucide(ICONS[name],18));b.onclick=()=>{icon={type:'lucide',value:name};renderIconPicker();};$('xnav-icon-grid').append(b);}
  $('xnav-icon-grid').addEventListener('keydown',e=>{
    const items=[...$('xnav-icon-grid').children],i=items.indexOf(document.activeElement);if(i<0)return;
    const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!step)return;e.preventDefault();
    const next=items[(i+step+items.length)%items.length];next.click();next.focus();
  });
  for(const[page,iconName]of PRESETS){const b=el('button',PLUGIN_PAGES[page],'xnav-chip');b.type='button';b.onclick=()=>{$('xnav-name').value=PLUGIN_PAGES[page];$('xnav-url').value='qiaomu:'+page;icon={type:'lucide',value:iconName};renderIconPicker();};$('xnav-presets').append(b);}
  for(const b of document.querySelectorAll('[data-icon-type]'))b.onclick=()=>{const type=b.dataset.iconType;if(type===icon.type)return;icon=type==='lucide'?{type,value:'Link'}:type==='emoji'?{type,value:$('xnav-emoji').value.trim()}:{type,value:''};renderIconPicker();if(type==='emoji')$('xnav-emoji').focus();};
  $('xnav-emoji').oninput=()=>{icon={type:'emoji',value:$('xnav-emoji').value.trim()};};
  $('xnav-image-pick').onclick=()=>$('xnav-image-file').click();
  $('xnav-image-file').onchange=()=>{const file=$('xnav-image-file').files[0];$('xnav-image-file').value='';void pickImage(file).then(()=>error('')).catch(e=>error(e.message));};
  $('xnav-add').onclick=()=>openEditor();
  $('xnav-cancel').onclick=closeEditor;
  $('xnav-form').onsubmit=async e=>{
    e.preventDefault();
    if(icon.type==='image'&&!icon.value)return error('请选择一张图片，或换成图标 / Emoji。');
    let item;try{item=customItem({id:editing?.id,name:$('xnav-name').value,url:$('xnav-url').value,icon,newTab:$('xnav-newtab').checked});}catch(err){return error(err.message);}
    const custom=editing?state.custom.map(c=>c.id===editing.id?item:c):[...state.custom,item];
    const order=!editing&&state.order.length?[...state.order,'custom:'+item.id]:state.order;
    await save({...state,custom,order});notice(editing?`已更新「${item.name}」`:`已添加「${item.name}」，打开的 X 页面会立即显示`);closeEditor();
  };
  $('xnav-reset').onclick=async()=>{if(!confirm('恢复默认会显示 X 自带的全部入口、恢复原始顺序，并删除你添加的链接。继续吗？'))return;await save({hidden:[],order:[],custom:[]});notice('已恢复默认侧栏');};

  return{async open(){state=await send({type:'x-nav-state'});render();}};
}
