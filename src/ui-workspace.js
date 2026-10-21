import { SEARCH_TEMPLATES,SEARCH_TEMPLATE_CATEGORIES,buildSearch,searchURL,normalizeSearch,templateSearch,describeSearch } from './search.js';
import { attachHandleSuggest } from './contact-picker.js';
import { formatFollowers } from './evidence.js';

export function initWorkspaceUI({send,notice,glyph}){
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;if(cls)n.className=cls;return n;};
  let owner='',view='search',index=0,cursors=[null],next=null,epoch=0,openEpoch=0,editing=null,timer,selectedInbox=null;
  const drafts=new Map(),saveTimers=new Map(),saveChains=new Map();
  const fields=['all','from','any','phrase','exclude','to','mention','period','sort','since','until','lang','media','replies','likes','reposts','repliesMin'];
  const date=t=>new Date(t).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}),count=n=>Number.isFinite(n)?n.toLocaleString():'—';
  const link=(name,url)=>{const a=el('a',name,'secondary');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;};
  const action=(name,run,icon)=>{const b=el('button',icon?null:name,'secondary');b.type='button';if(icon){b.className='icon-control';b.append(glyph(icon));b.setAttribute('aria-label',name);b.title=name;}b.onclick=async()=>{b.disabled=true;try{await run();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};return b;};
  function filters(){const v=Object.fromEntries(fields.map(k=>[k,$('ws-'+k).value]));for(const k of['excludeReposts','follows'])v[k]=$('ws-'+k).checked;v.mode=$('ws-raw-mode').checked?'raw':'builder';v.raw=$('ws-raw').value;return normalizeSearch(v);}
  function setFilters(v){const s=normalizeSearch(v);for(const k of fields)$('ws-'+k).value=s[k]??'';for(const k of['excludeReposts','follows'])$('ws-'+k).checked=s[k];$('ws-raw-mode').checked=s.mode==='raw';$('ws-raw').value=s.raw;preview();}
  function preview(persist=true){$('ws-date-fields').hidden=$('ws-period').value!=='custom';try{const f=filters();$('ws-search-summary').textContent=describeSearch(f);$('ws-query-preview').textContent=buildSearch(f);$('ws-search-error').hidden=true;if(persist&&view==='search'){const params=new URLSearchParams({draft:JSON.stringify(f)});history.replaceState(null,'',location.pathname+location.search+'#workspace/search?'+params);}}catch(e){const empty=/^先填关键词|^先写一点/.test(e.message);$('ws-query-preview').textContent=empty?'填写条件后在这里预览':'';if(!empty)$('ws-search-summary').textContent='请检查搜索条件';$('ws-search-error').textContent=empty?'':e.message;$('ws-search-error').hidden=empty;}}
  function download(name,text,type='application/json'){const blob=new Blob([text],{type}),u=URL.createObjectURL(blob),a=el('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  function searchNow(f){const a=link('',searchURL(f));a.click();}
  const FIELD_NAMES={all:'关键词',from:'谁发的',to:'回复给谁',mention:'提到了谁'};
  const placeholders=Object.fromEntries(Object.keys(FIELD_NAMES).map(k=>[k,$('ws-'+k).placeholder]));
  const restorePlaceholders=()=>{for(const[k,v]of Object.entries(placeholders))$('ws-'+k).placeholder=v;};
  for(const k of['from','to','mention'])attachHandleSuggest($('ws-'+k),{send,getOwner:()=>owner});
  function applyTemplate(t,card){
    setFilters(templateSearch(t.id,owner));editing=null;restorePlaceholders();
    $('ws-search-name').value=t.name;$('ws-search-category').value=t.category;$('ws-save-new').hidden=true;
    for(const n of $('ws-templates').querySelectorAll('.template-card'))n.setAttribute('aria-pressed',String(n===card));
    const target=$('ws-'+(t.focus||'all'));if(t.sample)target.placeholder='例如：'+t.sample;
    const more=target.closest('details');if(more)more.open=true;
    target.focus({preventScroll:true});target.select?.();target.scrollIntoView({block:'center'});
    notice(t.focus?`已套用「${t.name}」，填上${FIELD_NAMES[t.focus]}就能搜。`:'已套用模板，可以继续修改。');
  }
  const tabs=el('div',null,'template-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','模板分类');
  const grid=el('div',null,'template-grid');
  const showCategory=c=>{for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.category===c));for(const n of grid.children)n.hidden=!!c&&n.dataset.category!==c;};
  for(const c of['',...SEARCH_TEMPLATE_CATEGORIES]){const b=el('button',c||'全部');b.type='button';b.dataset.category=c;b.onclick=()=>showCategory(c);tabs.append(b);}
  for(const t of SEARCH_TEMPLATES){
    const card=action(t.name,()=>applyTemplate(t,card));
    let hint=t.desc;if(!hint)try{hint=describeSearch(t.filters);}catch{hint=t.category;}
    card.className='template-card';card.dataset.category=t.category;card.setAttribute('aria-pressed','false');
    const head=el('b',t.name);card.replaceChildren(head,el('small',hint));
    if(t.focus)card.append(el('span','改'+FIELD_NAMES[t.focus],'template-focus'));
    grid.append(card);
  }
  $('ws-templates').replaceChildren(tabs,grid);showCategory('');
  const saveOpen=open=>{$('ws-save-details').open=open;$('ws-save-toggle').setAttribute('aria-expanded',String(open));if(open)$('ws-search-name').focus();};
  $('ws-save-toggle').onclick=()=>{try{buildSearch(filters());saveOpen(!$('ws-save-details').open);}catch(e){notice(e.message,true);}};
  $('ws-search-form').oninput=()=>preview();
  $('ws-search-form').onsubmit=e=>{e.preventDefault();try{searchNow(filters());}catch(error){notice(error.message,true);}};
  $('ws-copy-query').onclick=async()=>{try{await navigator.clipboard.writeText(buildSearch(filters()));notice('搜索语句已复制。');}catch(e){notice(e.message,true);}};
  $('ws-reset').onclick=()=>{setFilters({});restorePlaceholders();editing=null;$('ws-search-name').value='';$('ws-search-category').value='';$('ws-save-new').hidden=true;saveOpen(false);for(const n of $('ws-templates').querySelectorAll('.template-card'))n.setAttribute('aria-pressed','false');};
  async function saveSearch(fresh=false){const expected=owner;await send({type:'search-save',owner:expected,search:{id:fresh?null:editing,name:$('ws-search-name').value,category:$('ws-search-category').value,pinned:$('ws-search-pinned').checked,filters:filters()}});if(owner===expected){editing=null;$('ws-save-new').hidden=true;saveOpen(false);await load(true);notice('已存为常用搜索，在下方列表可以随时再搜。');}}
  $('ws-save-form').onsubmit=e=>{e.preventDefault();void saveSearch().catch(e=>notice(e.message,true));};$('ws-save-new').onclick=()=>saveSearch(true).catch(e=>notice(e.message,true));
  function editSearch(row){editing=row.id;setFilters(row.filters);$('ws-search-name').value=row.name;$('ws-search-category').value=row.category;$('ws-search-pinned').checked=row.pinned;$('ws-save-new').hidden=false;$('ws-search-form').scrollIntoView({block:'start',behavior:'smooth'});saveOpen(true);}
  async function remove(store,row){if(!confirm('移除这条本机记录？原帖不受影响。'))return;await send({type:'workspace-remove',store,owner:row.owner,id:row.id});await load();}
  const headline=row=>{const head=el('div',null,'workspace-row-head');head.append(el('b',row.name||row.displayName||'@'+row.handle));if(row.handle)head.append(el('span','@'+row.handle,'hint'));else if(row.category)head.append(el('span',row.category,'tag'));if(row.pinned&&!row.handle)head.append(el('span','置顶','tag'));return head;};
  function searchRow(row){const card=el('article',null,'workspace-row search-row');const body=el('div',null,'search-row-body');body.append(headline(row));let query,summary;try{query=buildSearch(row.filters);summary=describeSearch(row.filters);}catch{query='';summary='条件需要重新编辑';}body.append(el('p',summary,'search-row-summary'));if(query)body.append(el('code',query,'saved-query'));card.append(body);const go=action('搜索',()=>searchNow(row.filters));go.prepend(glyph('Search'));const buttons=el('div',null,'workspace-actions');buttons.append(go,action('编辑',()=>editSearch(row),'Pencil'),action(row.pinned?'取消置顶':'置顶',async()=>{await send({type:'search-save',owner:row.owner,search:{...row,pinned:!row.pinned}});await load();},'Pin'),action('移除搜索',()=>remove('searches',row),'Trash2'));card.append(buttons);return card;}
  function showInbox(row){
    selectedInbox=row.id;const box=$('ws-inbox-detail');box.hidden=false;
    const top=el('div',null,'inbox-detail-top'),contextLink=link('查看原帖',`https://x.com/${row.handle}/status/${row.id}`);contextLink.className='quiet';
    top.append(headline(row),contextLink);box.replaceChildren(top,el('p',row.text,'annotation-text inbox-original'));
    if(row.parent){const context=el('details',null,'fine-print');context.append(el('summary','对话上下文'),el('p',row.parent,'annotation-text'));box.append(context);}
    const key=row.owner+'/'+row.id,form=el('form',null,'inbox-compose'),label=el('label','你的回复','field'),note=el('textarea');
    note.rows=7;note.maxLength=4000;note.value=drafts.get(key)??row.note??'';note.placeholder='补充一个观点、经验，或继续问一个问题…';note.setAttribute('aria-label','回复草稿');label.append(note);
    const meta=el('div',null,'inbox-draft-meta'),saved=el('span',drafts.has(key)?'尚未保存':'草稿保存在本机'),length=el('span',`${note.value.length} / 4000`);saved.setAttribute('role','status');meta.append(saved,length);
    const persist=async()=>{
      clearTimeout(saveTimers.get(key));const value=note.value;
      const pending=(saveChains.get(key)||Promise.resolve()).catch(()=>{}).then(()=>send({type:'inbox-update',owner:row.owner,id:row.id,note:value}));saveChains.set(key,pending);
      saved.textContent='保存中…';
      try{await pending;row.note=value;if(drafts.get(key)===value)drafts.delete(key);if(note.value===value)saved.textContent='已保存到本机';}
      catch(error){saved.textContent='保存失败，请重试';throw error;}
      finally{if(saveChains.get(key)===pending)saveChains.delete(key);}
    };
    note.oninput=()=>{drafts.set(key,note.value);saved.textContent='尚未保存';length.textContent=`${note.value.length} / 4000`;clearTimeout(saveTimers.get(key));saveTimers.set(key,setTimeout(()=>persist().catch(e=>notice(e.message,true)),600));};
    const controls=el('div',null,'inbox-primary-actions'),fill=action('填入 X 回复框',async()=>{
      await persist();await send({type:'inbox-compose',owner:row.owner,id:row.id,note:note.value});notice('已打开 X 回复框。检查账号和内容后，在 X 点击回复。');
    });fill.className='primary';fill.prepend(glyph('ArrowUpRight'));
    const update=async patch=>{await persist();await send({type:'inbox-update',owner:row.owner,id:row.id,...patch});await load();};
    controls.append(fill,action(row.status==='done'?'恢复待回复':'标为已处理',()=>update({status:row.status==='done'?'pending':'done'})));
    form.append(label,meta,controls,el('p','填入后在 X 确认发送；请核对当前登录账号。发送后再标为已处理。','hint'));form.onsubmit=e=>{e.preventDefault();void persist().catch(e=>notice(e.message,true));};box.append(form);
    const actions=el('div',null,'workspace-actions inbox-secondary-actions');
    actions.append(action('保存草稿',persist,'Download'),action('复制草稿',async()=>{await navigator.clipboard.writeText(note.value);notice('回复草稿已复制。');},'Copy'),action(row.pinned?'取消置顶':'置顶',()=>update({pinned:!row.pinned}),'Pin'),action(row.status==='snoozed'?'恢复待回复':'稍后再看',()=>update({status:row.status==='snoozed'?'pending':'snoozed'})),action('移除记录',()=>remove('inbox',row),'Trash2'));box.append(actions);
    for(const card of $('ws-list').querySelectorAll('[data-inbox-id]')){const selected=card.dataset.inboxId===row.id;card.classList.toggle('selected',selected);card.querySelector('button').setAttribute('aria-pressed',String(selected));}
  }
  function inboxRow(row){
    const card=el('article',null,'workspace-row inbox-row');card.dataset.inboxId=row.id;card.classList.toggle('selected',selectedInbox===row.id);
    const select=el('button',null,'inbox-select');select.type='button';select.setAttribute('aria-pressed',String(selectedInbox===row.id));
    const meta=[row.pinned?'置顶':'',row.source==='mention'?'提及我':'手动加入',date(row.at),row.note?'有草稿':''].filter(Boolean).join(' · ');
    select.append(headline(row),el('p',row.text,'annotation-text'),el('p',meta,'hint'));select.onclick=()=>showInbox(row);card.append(select);return card;
  }
  function queryOptions(){return{query:$('ws-list-query').value,status:view==='inbox'?$('ws-inbox-status').value:'',source:view==='inbox'?$('ws-inbox-source').value:'',sort:view==='inbox'?$('ws-inbox-sort').value:view==='search'?'rank':'recent'};}
  async function load(reset=false){
    if(reset){index=0;cursors=[null];}const generation=++epoch,selectedOwner=owner,selectedView=view,list=$('ws-list');list.setAttribute('aria-busy','true');$('ws-prev').disabled=$('ws-next').disabled=true;
    const store={search:'searches',inbox:'inbox'}[view];
    try{
      const page=!owner?{items:[],next:null}:await send({type:'workspace-page',store,owner,before:cursors[index],...queryOptions()});
      if(generation!==epoch||owner!==selectedOwner||view!==selectedView)return;next=page.next;list.replaceChildren();if(!page.items.length&&index){index--;return load();}
      const render={search:searchRow,inbox:inboxRow}[view];for(const row of page.items)list.append(render(row));
      if(view==='inbox'){
        const row=page.items.find(r=>r.id===selectedInbox)||page.items[0];if(row)showInbox(row);else{$('ws-inbox-detail').hidden=true;selectedInbox=null;}
        if(owner){const counts=await send({type:'inbox-summary',owner:selectedOwner});if(generation!==epoch)return;$('ws-inbox-counts').textContent=`共 ${counts.pending+counts.snoozed+counts.done} 条`;for(const b of document.querySelectorAll('[data-inbox-status]'))b.querySelector('small').textContent=counts[b.dataset.inboxStatus];}
      }
      if(!page.items.length)list.append(el('p',!owner?'添加自己的账号后，就能保存并查看记录。':$('ws-list-query').value?'没有匹配的记录，试试其他词。':({search:'还没有常用搜索。设好条件后点「存为常用」，下次一键再搜。',inbox:'暂时没有待回复。可以从帖子图标中加入。'}[view]),'empty-state'));
      $('ws-page').textContent=`第 ${index+1} 页 · 每页 20 条`;$('ws-prev').disabled=index===0;$('ws-next').disabled=!next;$('ws-pagination').hidden=index===0&&!next;$('ws-list-tools').hidden=view==='search'&&!page.items.length&&!index&&!$('ws-list-query').value;
    }finally{if(generation===epoch)list.removeAttribute('aria-busy');}
  }
  async function configure(){const expected=owner,generation=epoch,s=await send({type:'workspace-state',owner:expected});if(owner!==expected||epoch!==generation)return;$('ws-collect-mentions').checked=s.collectMentions;}
  async function open(route='search',draft=''){
    const opening=++openEpoch;view=['search','inbox'].includes(route)?route:'search';epoch++;const state=await send({type:'contacts-state',owner});if(opening!==openEpoch)return;owner=state.owner;$('ws-owner').replaceChildren();for(const o of state.owners){const n=el('option','@'+o.handle);n.value=o.handle;$('ws-owner').append(n);}$('ws-owner').value=owner;$('ws-owner').closest('label').hidden=state.owners.length<2;$('ws-empty-owner').hidden=!!owner;
    document.body.classList.toggle('inbox-workbench',view==='inbox');$('ws-list-layout').classList.toggle('inbox-layout',view==='inbox');$('ws-inbox-detail').hidden=true;selectedInbox=null;
    for(const n of document.querySelectorAll('.workspace-view'))n.hidden=n.id!==`ws-${view}-view`;for(const n of document.querySelectorAll('[data-ws-view]'))n.setAttribute('aria-pressed',String(n.dataset.wsView===view));$('ws-import').hidden=view!=='search';$('ws-export').textContent='导出';$('ws-list-query').placeholder={search:'名称、关键词或分类',inbox:'正文、账号或昵称'}[view];
    $('ws-list-head').hidden=view==='inbox';
    if(draft){try{setFilters(JSON.parse(draft));}catch{notice('链接中的搜索条件无效，请重新填写。',true);}}else if(view==='search')preview(false);
    if(owner)await configure();if(opening===openEpoch)await load(true);
  }
  for(const b of document.querySelectorAll('[data-ws-view]'))b.onclick=()=>{location.hash='workspace/'+b.dataset.wsView;};
  $('ws-owner').onchange=async()=>{owner=$('ws-owner').value;editing=null;epoch++;openEpoch++;const expected=owner;try{await configure();if(owner===expected)await load(true);}catch(e){notice(e.message,true);}};
  $('ws-collect-mentions').onchange=async()=>{try{await send({type:'workspace-configure',owner,profile:{collectMentions:$('ws-collect-mentions').checked}});}catch(e){notice(e.message,true);await configure();}};
  for(const b of document.querySelectorAll('[data-inbox-status]'))b.onclick=()=>{$('ws-inbox-status').value=b.dataset.inboxStatus;for(const t of document.querySelectorAll('[data-inbox-status]'))t.setAttribute('aria-pressed',String(t===b));void load(true).catch(e=>notice(e.message,true));};
  $('ws-inbox-status').onchange=()=>load(true).catch(e=>notice(e.message,true));$('ws-list-query').oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>load(true).catch(e=>notice(e.message,true)),180);};
  for(const id of ['ws-inbox-sort','ws-inbox-source'])$(id).onchange=()=>load(true).catch(e=>notice(e.message,true));
  $('ws-refresh').onclick=()=>load(true).catch(e=>notice(e.message,true));$('ws-prev').onclick=()=>{if(index){index--;void load().catch(e=>notice(e.message,true));}};$('ws-next').onclick=()=>{if(next){cursors[++index]=next;void load().catch(e=>notice(e.message,true));}};
  $('ws-import').onclick=()=>$('ws-import-file').click();$('ws-import-file').onchange=async()=>{try{const file=$('ws-import-file').files[0];if(!file)return;if(file.size>5*1024*1024)throw Error('导入文件不能超过 5 MB。');const result=await send({type:'search-import',owner,value:JSON.parse(await file.text())});notice(`已导入 ${result.count} 条搜索，原有记录保留。`);await load(true);}catch(e){notice(e.message,true);}finally{$('ws-import-file').value='';}};
  $('ws-export').onclick=async()=>{const expectedOwner=owner,expectedView=view,exportOptions=queryOptions(),button=$('ws-export');button.disabled=true;try{
    if(!owner)throw Error('先选择自己的 X 账号。');let before=null,rows=[],bytes=0;const store={search:'searches',inbox:'inbox'}[view];
    do{const page=await send({type:'workspace-page',store,owner:expectedOwner,before,...exportOptions});if(owner!==expectedOwner||view!==expectedView)throw Error('账号或页面已切换，请重新导出。');bytes+=JSON.stringify(page.items).length;if(bytes>20e6)throw Error('记录超过 20 MB，请先搜索缩小范围后导出。');rows.push(...page.items);before=page.next;}while(before);
    const suffix=new Date().toISOString().slice(0,10);if(view==='search')download(`x-searches-${owner}-${suffix}.json`,JSON.stringify({format:'qiaomu-x-searches',version:1,items:rows.map(({name,category,pinned,filters})=>({name,category,pinned,filters}))},null,2));else download(`x-${view}-${owner}-${suffix}.json`,JSON.stringify({format:'qiaomu-x-'+view,version:1,items:rows},null,2));
  }catch(e){notice(e.message,true);}finally{button.disabled=false;}};
  globalThis.chrome?.runtime?.onMessage?.addListener(m=>{if(m.type==='inbox-changed'&&m.owner===owner&&view==='inbox')void load().catch(e=>notice(e.message,true));});
  window.addEventListener('beforeunload',e=>{if(drafts.size){e.preventDefault();e.returnValue='';}});
  return{open};
}
