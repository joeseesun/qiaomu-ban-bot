export function initBookmarksUI({send,notice,glyph,getStore}){
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  let owner='',index=0,cursors=[null],next=null,epoch=0,timer,editing=null,exporting=false;
  const date=t=>new Date(t).toLocaleString('zh-CN',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const action=(title,icon,fn)=>{const b=el('button',null,'icon-control');b.type='button';b.title=title;b.setAttribute('aria-label',title);b.append(glyph(icon));b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};return b;};
  function closeEditor(){$('bookmark-editor').hidden=true;editing=null;}
  function edit(row){editing={owner,id:row.id};$('bookmark-note').value=row.note;$('bookmark-tags').value=row.tags.join('，');$('bookmark-editor').hidden=false;$('bookmark-note').focus();}
  async function load(reset=false){
    if(reset){index=0;cursors=[null];}const gen=++epoch,list=$('bookmark-list');list.setAttribute('aria-busy','true');$('bookmarks-prev').disabled=$('bookmarks-next').disabled=true;$('bookmarks-export').disabled=true;
    try{const page=owner?await send({type:'bookmarks-page',owner,query:$('bookmark-search').value,before:cursors[index]}):{items:[],count:0,next:null};
      if(gen!==epoch)return;next=page.next;list.replaceChildren();if(!page.items.length&&index){index--;return load();}
      $('bookmarks-count').textContent=`已保存 ${page.count.toLocaleString()} 条`;
      if(!page.items.length)list.append(el('p',!owner||!page.count?'打开 X 书签页，浏览过的书签会自动保存到这里。继续向下浏览，就能保存更多。':$('bookmark-search').value?'没有找到。试试正文、作者、标签或备注。':'还没有保存书签。','empty-state'));
      for(const row of page.items){
        const card=el('article',null,'bookmark-row');card.dataset.id=row.id;
        const head=el('div',null,'bookmark-head'),person=el('div');person.append(el('b',row.displayName||'@'+row.handle),el('span','@'+row.handle));
        const actions=el('div',null,'bookmark-actions'),url=el('a',null,'icon-control');url.href=row.url;url.target='_blank';url.rel='noopener noreferrer';url.title='打开原帖';url.setAttribute('aria-label','打开原帖');url.append(glyph('ArrowUpRight'));
        const boundOwner=owner;actions.append(url,action('添加备注与标签','Pencil',()=>edit(row)),action('移除本机副本','Trash2',async()=>{if(!confirm('移除这条本机副本？X 上的书签会保留，再次浏览时会重新保存。'))return;await send({type:'bookmarks-remove',owner:boundOwner,id:row.id});await load();}));head.append(person,actions);
        const body=el('p',row.text||'图片 / 视频帖子，打开原帖查看。','bookmark-text');card.append(head,body);
        if(row.partial||row.translated)card.append(el('p',[row.partial?'正文未展开':null,row.translated?'X 显示的译文':null].filter(Boolean).join(' · '),'bookmark-state'));
        if(row.tags.length){const tags=el('div',null,'bookmark-tags');for(const t of row.tags)tags.append(el('span',t));card.append(tags);}
        if(row.note)card.append(el('p',row.note,'bookmark-note'));
        card.append(el('p',`${date(row.collectedAt)} 保存${row.images.length?' · '+row.images.length+' 张图片':''}${row.hasVideo?' · 含视频':''}`,'bookmark-meta'));list.append(card);
      }
      $('bookmarks-page').textContent=`第 ${index+1} 页 · 每页 20 条`;$('bookmarks-prev').disabled=index===0;$('bookmarks-next').disabled=!next;
      $('bookmarks-export').disabled=exporting||!page.items.length;$('bookmarks-export-label').textContent=$('bookmark-search').value.trim()?'导出搜索结果':'导出 Markdown';
    }finally{if(gen===epoch)list.removeAttribute('aria-busy');}
  }
  async function open(){
    closeEditor();const state=await send({type:'bookmarks-state'});if(!state.owners.some(o=>o.owner===owner))owner=state.owners[0]?.owner||'';
    $('bookmark-owner').replaceChildren();for(const o of state.owners){const option=el('option','@'+o.owner);option.value=o.owner;$('bookmark-owner').append(option);}$('bookmark-owner').value=owner;await load(true);
  }
  $('bookmark-owner').onchange=()=>{owner=$('bookmark-owner').value;closeEditor();void load(true).catch(e=>notice(e.message,true));};
  $('bookmark-search').oninput=()=>{epoch++;$('bookmarks-export').disabled=true;clearTimeout(timer);timer=setTimeout(()=>void load(true).catch(e=>notice(e.message,true)),180);};
  $('bookmarks-refresh').onclick=()=>open().catch(e=>notice(e.message,true));
  $('bookmarks-prev').onclick=()=>{if(index){index--;void load().catch(e=>notice(e.message,true));}};
  $('bookmarks-next').onclick=()=>{if(next){cursors[++index]=next;void load().catch(e=>notice(e.message,true));}};
  $('bookmark-edit-cancel').onclick=closeEditor;
  $('bookmark-edit-form').onsubmit=async e=>{e.preventDefault();if(!editing)return;const target={...editing},save=$('bookmark-edit-save');save.disabled=true;try{await send({type:'bookmarks-edit',...target,note:$('bookmark-note').value,tags:$('bookmark-tags').value.split(/[,，\n]/)});if(editing?.owner===target.owner&&editing?.id===target.id)closeEditor();await load();notice('备注与标签已保存。');}catch(e){notice(e.message,true);}finally{save.disabled=false;}};
  $('bookmarks-export').onclick=async()=>{
    if(exporting||!owner)return;exporting=true;$('bookmarks-export').disabled=true;const selectedOwner=owner,query=$('bookmark-search').value;
    notice('正在整理导出内容…');
    try{const result=await getStore().exportMarkdown({owner:selectedOwner,query});const url=URL.createObjectURL(result.blob),a=el('a');a.href=url;a.download=result.filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notice(`已生成 ${result.count} 条书签的 Markdown，下载已开始。`);}
    catch(e){notice(e.message,true);}finally{exporting=false;await load().catch(e=>notice(e.message,true));}
  };
  return{open};
}
