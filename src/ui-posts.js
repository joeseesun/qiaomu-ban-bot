import { Posts, xLength, POST_LIMIT, checkMedia, mediaKind, normalizeSlots } from './posts.js';
import { attachHandleSuggest } from './contact-picker.js';
const DAYS=['日','一','二','三','四','五','六'];
export function initPostsUI({send,notice,glyph,demo=false,store:given=null}){
  // Opened lazily: the settings page should load even where IndexedDB is unavailable.
  let db=given;const store=new Proxy({},{get:(_,k)=>{db??=new Posts();const v=db[k];return typeof v==='function'?v.bind(db):v;}});
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n;};
  let current=null,media=[],filter='upcoming',saveTimer=null,saving=Promise.resolve(),owner='',slots={times:[],days:[]},urls=new Map(),opened=false;
  const when=t=>{const d=new Date(t),today=new Date();const day=new Date(d.getFullYear(),d.getMonth(),d.getDate()),base=new Date(today.getFullYear(),today.getMonth(),today.getDate());const diff=Math.round((day-base)/86400000);const hm=d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});return(diff===0?'今天':diff===1?'明天':diff===-1?'昨天':`${d.getMonth()+1}月${d.getDate()}日 周${DAYS[d.getDay()]}`)+' '+hm;};
  const local=t=>{const d=new Date(t-new Date(t).getTimezoneOffset()*60000);return d.toISOString().slice(0,16);};
  const iconButton=(name,icon,run)=>{const b=el('button',null,'icon-control');b.type='button';b.title=name;b.setAttribute('aria-label',name);b.append(glyph(icon));b.onclick=async e=>{e.stopPropagation();b.disabled=true;try{await run();}catch(err){notice(err.message,true);}finally{b.disabled=false;}};return b;};
  const error=msg=>{$('post-error').textContent=msg||'';$('post-error').hidden=!msg;};
  function counter(){
    const n=xLength($('post-text').value),c=$('post-count');
    c.textContent=n>POST_LIMIT?`${n} / ${POST_LIMIT} · 超出部分需要 X Premium`:`${n} / ${POST_LIMIT}`;c.classList.toggle('over',n>POST_LIMIT);
  }
  function thumbURL(m){if(!urls.has(m.id)&&m.blob)urls.set(m.id,URL.createObjectURL(m.blob));return urls.get(m.id)||'';}
  function renderMedia(){
    const box=$('post-media');box.replaceChildren();box.hidden=!media.length;
    for(const m of media){
      const item=el('figure',null,'post-thumb'),kind=mediaKind(m.type);
      const view=kind==='video'?el('video'):el('img');view.src=thumbURL(m);if(kind==='video'){view.muted=true;view.preload='metadata';}else view.alt=m.name;
      const remove=iconButton(`移除 ${m.name}`,'X',async()=>{media=media.filter(x=>x.id!==m.id);renderMedia();schedule(0);});remove.classList.add('post-thumb-remove');
      const cap=el('figcaption',kind==='video'?'视频':kind==='gif'?'GIF':'');item.append(view,remove);if(cap.textContent)item.append(cap);box.append(item);
    }
    $('post-add-media').disabled=media.length>=4||media.some(m=>mediaKind(m.type)!=='image');
  }
  async function addFiles(files){
    error('');
    for(const file of files){
      try{checkMedia(media,file);const meta=await store.addMedia(file,media);media.push({...meta,blob:file});}
      catch(e){error(e.message);break;}
    }
    renderMedia();schedule(0);
  }
  async function scheduledAt(){
    const mode=$('post-when').value;
    if(mode==='custom'){const v=$('post-at').value;if(!v)return 0;const t=new Date(v).getTime();return Number.isFinite(t)?t:0;}
    if(mode==='slot'){if(current?.scheduledAt&&current.whenMode==='slot')return current.scheduledAt;return store.nextFree(Date.now(),current?.id||'');}
    return 0;
  }
  async function whenHint(){
    const mode=$('post-when').value;$('post-at-field').hidden=mode!=='custom';$('post-options').hidden=mode==='none';
    const at=await scheduledAt();
    $('post-when-hint').textContent=mode==='none'?'不排时间，随时可以填入 X。':at?`${when(at)}。可以现在填入 X，用 X 自带的定时发送（关掉电脑也会准时发）；也可以到点收到提醒再填入。`:mode==='slot'?'还没有设置发布时间，在下方「每周发布时间」里添加。':'选一个时间。';
    if(at&&at<Date.now())$('post-when-hint').textContent='这个时间已经过去了。';
  }
  async function persist(){
    const text=$('post-text').value;
    if(!text.trim()&&!media.length&&!current)return null;
    const at=await scheduledAt();const keep=['filled','posted'].includes(current?.status);
    const row=await store.save({id:current?.id,text,mediaIds:media.map(m=>m.id),scheduledAt:at,status:keep?current.status:at?'queued':'draft',remind:$('post-remind').checked,nativeSchedule:$('post-native').checked});
    current={...row,whenMode:$('post-when').value};$('post-saved').textContent='已保存在本机';
    void send({type:'posts-sync'}).catch(()=>{});
    return row;
  }
  function schedule(delay=600){
    clearTimeout(saveTimer);$('post-saved').textContent='';
    saveTimer=setTimeout(()=>{saving=saving.then(persist).then(()=>load()).catch(e=>error(e.message));},delay);
  }
  async function flush(){clearTimeout(saveTimer);saving=saving.catch(()=>{}).then(persist);const row=await saving;await load();return row;}
  async function edit(row){
    await flush().catch(()=>{});
    current=row?{...row,whenMode:row.scheduledAt?'custom':'none'}:null;
    $('post-text').value=row?.text||'';media=[];
    for(const id of row?.mediaIds||[]){const m=await store.media(id);if(m)media.push(m);}
    $('post-when').value=row?.scheduledAt?'custom':'none';$('post-at').value=row?.scheduledAt?local(row.scheduledAt):'';
    $('post-remind').checked=row?.remind??true;$('post-native').checked=row?.nativeSchedule??true;
    $('post-saved').textContent='';error('');counter();renderMedia();await whenHint();await load();
    $('post-text').focus();
  }
  async function fill(row){
    if(demo)throw Error('当前为界面预览；已安装扩展会打开 X 发帖框并填入。');
    const id=row?.id||(await flush())?.id;if(!id)throw Error('先写点内容，或者加一张图片。');
    await send({type:'posts-fill',id});notice('已打开 X 发帖框，正在填入。检查无误后由你点「发帖」。');
  }
  function row(p){
    const card=el('article',null,'post-row');card.dataset.id=p.id;if(current?.id===p.id)card.setAttribute('aria-current','true');
    const meta=el('div',null,'post-row-meta');
    meta.append(el('b',p.scheduledAt?when(p.scheduledAt):'草稿'));
    const tag={queued:p.scheduledAt<Date.now()?'到点了':'',filled:'已填入 X',posted:'已发出'}[p.status];if(tag)meta.append(el('span',tag,'tag'+(p.status==='queued'?' due':'')));
    if(p.mediaIds.length)meta.append(el('span',`${p.mediaIds.length} 个附件`,'hint'));
    const body=el('p',p.text||'（只有附件）','post-row-text');
    const actions=el('div',null,'workspace-actions');
    const go=el('button',null,'secondary');go.type='button';go.append(glyph('Send'),document.createTextNode(p.status==='filled'?'再填一次':'填入 X'));go.onclick=async e=>{e.stopPropagation();go.disabled=true;try{await fill(p);}catch(err){notice(err.message,true);}finally{go.disabled=false;}};
    actions.append(go,iconButton('编辑','Pencil',()=>edit(p)));
    if(p.status==='filled')actions.append(iconButton('标记为已发出','Check',async()=>{await store.update(p.id,{status:'posted',postedAt:Date.now()});await load();void send({type:'posts-sync'}).catch(()=>{});}));
    if(p.postedUrl){const a=el('a','查看 ↗','quiet');a.href=p.postedUrl;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}
    actions.append(iconButton('删除','Trash2',async()=>{
      if(!confirm('删除这条帖子和它的附件？只删除本机记录。'))return;
      const active=current?.id===p.id;
      if(active){clearTimeout(saveTimer);await saving.catch(()=>{});}
      await store.remove(p.id);
      if(active){current=null;media=[];$('post-text').value='';await edit(null);}
      await load();void send({type:'posts-sync'}).catch(()=>{});
    }));
    card.append(meta,body,actions);card.onclick=e=>{if(!e.target.closest('button,a'))void edit(p);};
    return card;
  }
  async function load(){
    const all=await store.all(),groups={upcoming:all.filter(p=>p.status==='queued'),draft:all.filter(p=>p.status==='draft'),done:all.filter(p=>['filled','posted'].includes(p.status)).sort((a,b)=>(b.postedAt||b.filledAt)-(a.postedAt||a.filledAt))};
    for(const b of document.querySelectorAll('[data-post-filter]')){b.setAttribute('aria-pressed',String(b.dataset.postFilter===filter));b.querySelector('small').textContent=groups[b.dataset.postFilter].length;}
    const list=$('post-list');list.replaceChildren();
    const rows=groups[filter];
    if(!rows.length)list.append(el('p',{upcoming:'还没有排期。写好后选「下一个空档」，就会排进队列。',draft:'没有草稿。',done:'填入 X 的帖子会出现在这里。'}[filter],'empty-state'));
    let day='';for(const p of rows){if(filter==='upcoming'){const d=new Date(p.scheduledAt).toDateString();if(d!==day){day=d;list.append(el('h4',when(p.scheduledAt).split(' ')[0],'post-day'));}}list.append(row(p));}
  }
  async function renderSlots(){
    $('post-days').replaceChildren(...DAYS.map((d,i)=>{const b=el('button','周'+d);b.type='button';b.setAttribute('aria-pressed',String(slots.days.includes(i)));b.onclick=async()=>{slots=await store.setSlots({...slots,days:slots.days.includes(i)?slots.days.filter(x=>x!==i):[...slots.days,i]});await renderSlots();await whenHint();};return b;}));
    $('post-times').replaceChildren(...(slots.times.length?slots.times.map(t=>{const chip=el('span',null,'post-time');chip.append(el('span',t),iconButton(`删除 ${t}`,'X',async()=>{slots=await store.setSlots({...slots,times:slots.times.filter(x=>x!==t)});await renderSlots();await whenHint();}));return chip;}):[el('span','还没有时间','hint')]));
  }
  $('post-text').addEventListener('input',()=>{counter();schedule();});
  $('post-text').addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();void addFiles(files);}});
  const drop=$('post-form');
  drop.addEventListener('dragover',e=>{if([...(e.dataTransfer?.types||[])].includes('Files')){e.preventDefault();drop.classList.add('dragging');}});
  drop.addEventListener('dragleave',e=>{if(!drop.contains(e.relatedTarget))drop.classList.remove('dragging');});
  drop.addEventListener('drop',e=>{drop.classList.remove('dragging');const files=[...(e.dataTransfer?.files||[])];if(files.length){e.preventDefault();void addFiles(files);}});
  $('post-add-media').onclick=()=>$('post-file').click();
  $('post-file').onchange=()=>{const files=[...$('post-file').files];$('post-file').value='';void addFiles(files);};
  $('post-when').onchange=async()=>{if(current)current.whenMode=$('post-when').value;if($('post-when').value==='custom'&&!$('post-at').value){const next=await store.nextFree();$('post-at').value=local(next||Date.now()+3600000);}await whenHint();schedule(0);};
  $('post-at').onchange=async()=>{await whenHint();schedule(0);};
  $('post-native').onchange=()=>schedule(0);
  $('post-remind').onchange=async()=>{
    if($('post-remind').checked&&!demo&&globalThis.chrome?.permissions){
      try{const ok=await chrome.permissions.request({permissions:['notifications']});if(!ok)notice('没有允许通知。到点后只在扩展图标上显示数字。');}catch{}
    }
    schedule(0);
  };
  $('post-form').onsubmit=async e=>{e.preventDefault();try{const r=await flush();if(r)notice(r.status==='queued'?`已排进队列：${when(r.scheduledAt)}。`:'已存为草稿。');}catch(err){error(err.message);}};
  $('post-fill-now').onclick=async()=>{const b=$('post-fill-now');b.disabled=true;try{await fill(null);}catch(e){error(e.message);}finally{b.disabled=false;}};
  $('post-new').onclick=()=>edit(null);
  for(const b of document.querySelectorAll('[data-post-filter]'))b.onclick=()=>{filter=b.dataset.postFilter;void load();};
  $('post-time-form').onsubmit=async e=>{e.preventDefault();const v=$('post-time-new').value;if(!v)return;slots=await store.setSlots({...slots,times:[...slots.times,v]});$('post-time-new').value='';await renderSlots();await whenHint();};
  attachHandleSuggest($('post-text'),{send,getOwner:()=>owner,requireAt:true});
  globalThis.chrome?.runtime?.onMessage?.addListener?.(m=>{if(m?.type==='posts-changed')void load();});
  async function open(){
    if(!opened){opened=true;slots=normalizeSlots(await store.slots());void navigator.storage?.persist?.().catch(()=>{});void store.pruneMedia().catch(()=>{});}
    try{owner=(await send({type:'contacts-state'})).owner||'';}catch{owner='';}
    await renderSlots();counter();renderMedia();await whenHint();await load();
  }
  return{open};
}
