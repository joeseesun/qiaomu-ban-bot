import { SEARCH_TEMPLATES,templateSearch,searchURL,buildSearch,describeSearch } from './search.js';
import { attachHandleSuggest } from './contact-picker.js';
const QUICK_LINKS=['open-source','ai-practice','replies-to-me','follows-links'];
const FORM_TEMPLATES=SEARCH_TEMPLATES.filter(t=>['all','from'].includes(t.focus)).slice(0,9);
import { createElement,Plus,SlidersHorizontal } from 'lucide';

export function createSearchSidebar({send,getOwner}){
  let host,owner='',version=0,resetDraft=()=>{};
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  function control(label,icon,run){const b=el('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(createElement(icon,{width:17,height:17,'stroke-width':1.7}));b.onclick=run;return b;}
  async function populate(){
    if(!host?.isConnected)return;
    const h=host,bound=getOwner(),generation=++version;owner=bound;
    const list=h.shadowRoot.querySelector('.links');list.replaceChildren();
    const add=(name,filters)=>{const a=el('a',name);a.href=searchURL(filters);a.onclick=()=>{a.href=searchURL(filters);};list.append(a);};
    for(const id of QUICK_LINKS){const t=SEARCH_TEMPLATES.find(t=>t.id===id);if(!t.ownerField||bound)add(t.name,templateSearch(id,bound));}
    if(!bound)return;
    try{
      const data=await send({type:'sidebar-searches',owner:bound});
      if(generation!==version||h!==host||!h.isConnected||getOwner()!==bound)return;
      if(data.items.length)list.append(el('p','我的搜索'));
      for(const row of data.items)add(row.name,row.filters);
    }catch(error){h.shadowRoot.querySelector('[role=status]').textContent=error.message;}
  }
  function mount(){
    if(host?.isConnected){if(owner!==getOwner()){resetDraft();void populate();}return;}
    const sidebar=document.querySelector('[data-testid="sidebarColumn"]'),form=sidebar?.querySelector('form[role="search"]');
    if(!form)return;
    let anchor=form;
    for(let n=form.parentElement;n&&n!==sidebar;n=n.parentElement){
      if(getComputedStyle(n).position==='fixed'||getComputedStyle(n).position==='sticky'){
        anchor=n;const spacer=n.nextElementSibling;
        if(spacer&&!spacer.textContent.trim()&&!spacer.querySelector('input,button,a')&&spacer.getBoundingClientRect().height<=100)anchor=spacer;
        break;
      }
      if(n.children.length>1)break;anchor=n;
    }
    host=el('section');host.className='qx-search-sidebar';host.style.cssText='display:block;min-width:0;width:100%;margin:0 0 16px';
    const root=host.attachShadow({mode:'open'}),style=el('style');style.textContent=`
      :host{font:14px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:var(--qx-search-ink,#0f1419)}
      *{box-sizing:border-box}[hidden]{display:none!important}.card{border:1px solid var(--qx-search-line,#eff3f4);border-radius:16px;overflow:hidden;background:var(--qx-search-bg,#fff)}
      header{display:flex;align-items:center;gap:6px;padding:12px 14px 4px}h2{font-size:16px;font-weight:700;margin:0 auto 0 0}
      button{display:inline-flex;align-items:center;justify-content:center;min-width:30px;min-height:30px;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}button:hover,a:hover{background:var(--qx-search-soft,#f7f9f9)}
      button:focus-visible,a:focus-visible,summary:focus-visible{outline:1px solid #1d9bf0;outline-offset:-2px}
      .links{padding:2px 0 8px}.card:has(form:not([hidden])) .links{display:none}.links a{display:block;padding:8px 14px;color:inherit;text-decoration:none;overflow-wrap:anywhere}.links p{font-size:11px;color:#71767b;margin:8px 14px 2px}
      .chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}.chips button{min-height:28px;border-radius:999px;padding:3px 10px;font-size:12px;background:var(--qx-search-soft,#f7f9f9);border:1px solid var(--qx-search-line,#eff3f4)}.chips button[aria-pressed=true]{border-color:var(--qx-search-ink,#0f1419);font-weight:600}
      form{padding:14px;border-top:1px solid var(--qx-search-line,#eff3f4)}label{display:block;font-size:12px;margin-bottom:12px}
      input,select,textarea{display:block;width:100%;min-width:0;margin-top:5px;border:1px solid var(--qx-search-line,#cfd9de);border-radius:6px;font:inherit;padding:9px;background:var(--qx-search-bg,#fff);color:inherit;outline:none;box-shadow:none}input:hover,select:hover,textarea:hover{border-color:var(--qx-search-muted,#536471)}input:focus,select:focus,textarea:focus{border-color:var(--qx-search-muted,#536471)}
      select{appearance:none;padding-right:26px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371767b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 9px center}textarea{resize:vertical;min-height:76px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.help,.summary{font-size:12px;color:var(--qx-search-muted,#536471);margin:0 0 12px;overflow-wrap:anywhere}.summary{padding:10px 0;border-top:1px solid var(--qx-search-line,#eff3f4)}
      form button,form .search-now{border-radius:999px;padding:7px 12px;font:inherit;line-height:1.5;text-decoration:none;text-align:center;min-height:36px;display:inline-flex;align-items:center;justify-content:center}.search-now{background:var(--qx-search-ink,#0f1419);color:var(--qx-search-bg,#fff)}.search-now:hover{background:var(--qx-search-ink,#0f1419);opacity:.85}.search-now[aria-disabled=true]{opacity:.4;cursor:default}form button{background:var(--qx-search-soft,#f7f9f9);color:inherit}button:active,.search-now:active{opacity:.7}button:disabled{opacity:.5;cursor:wait}.actions{display:flex;gap:8px;flex-wrap:wrap}details{font-size:12px;margin:0 0 12px}summary{cursor:pointer;color:var(--qx-search-muted,#536471);padding:6px 0}details[open]>summary{margin-bottom:8px}code{display:block;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--qx-search-muted,#536471);font:11px/1.6 monospace;margin-bottom:10px}.raw-toggle{display:flex;align-items:center;gap:7px}.raw-toggle input{width:14px;height:14px;margin:0;accent-color:var(--qx-search-ink,#0f1419)}.status{margin:0 14px 10px;font-size:12px;color:var(--qx-search-muted,#536471);overflow-wrap:anywhere}.status:empty{display:none}`;
    const dark=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number).reduce((a,b)=>a+b,0)<350;
    if(dark)for(const[k,v]of Object.entries({ink:'#e7e9ea',line:'#2f3336',bg:'#000',soft:'#16181c',muted:'#8b98a5'})){host.style.setProperty('--qx-search-'+k,v);host.style.setProperty('--qx-suggest-'+k,k==='bg'?'#16181c':k==='soft'?'#22262b':v);}
    const card=el('div');card.className='card';const head=el('header');head.append(el('h2','快捷搜索'));
    const formAdd=el('form');formAdd.hidden=true;
    const help=el('p','填条件就能搜索，不用记语法。常用条件可保存到侧栏。');help.className='help';
    const field=(key,label,options)=>{const wrap=el('label',label),input=el(options?'select':'input');input.name=key;input.setAttribute('aria-label',label);if(options)for(const[value,text]of options){const o=el('option',text);o.value=value;input.append(o);}else input.maxLength=400;wrap.append(input);return{wrap,input};};
    const keyword=field('all','关键词');keyword.input.placeholder='例如：开源 工具';
    const author=field('from','作者（选填）');author.input.placeholder='例如：@vista8';author.input.maxLength=160;
    const period=field('period','时间范围',[['all','不限时间'],['today','今天'],['7d','近 7 天'],['30d','近 30 天'],['90d','近 90 天']]);
    const likes=field('likes','至少点赞');likes.input.type='number';likes.input.min='0';likes.input.max='1000000000';likes.input.step='1';likes.input.placeholder='不限';
    const grid=el('div');grid.className='grid';grid.append(period.wrap,likes.wrap);
    const builder=el('div');builder.append(keyword.wrap,author.wrap,grid);
    // Template chips preset the hidden conditions and leave one field to edit.
    let base={};const chips=el('div');chips.className='chips';chips.setAttribute('role','group');chips.setAttribute('aria-label','从模板开始');
    const keywordHint=keyword.input.placeholder,authorHint='例如：@vista8';
    for(const t of FORM_TEMPLATES){const chip=el('button',t.name);chip.type='button';chip.title=t.desc;chip.setAttribute('aria-pressed','false');chip.onclick=()=>{
      const on=chip.getAttribute('aria-pressed')!=='true';for(const c of chips.children)c.setAttribute('aria-pressed',String(on&&c===chip));
      const f=on?templateSearch(t.id,getOwner()):{};const{all='',from='',period:p='all',likes:l=null,...rest}=f;
      base=on?Object.fromEntries(Object.entries(rest).filter(([,v])=>v!==''&&v!==null&&v!==false&&v!=='all')):{};
      if(all)keyword.input.value=all;if(from)author.input.value=from;period.input.value=on?p:'all';likes.input.value=on&&l?String(l):'';
      keyword.input.placeholder=on&&t.focus==='all'&&t.sample?'例如：'+t.sample:keywordHint;author.input.placeholder=on&&t.focus==='from'&&t.sample?'例如：'+t.sample:authorHint;
      if(FORM_TEMPLATES.some(x=>x.name===name.input.value)||!name.input.value)name.input.value=on?t.name:'';update();(t.focus==='from'?author:keyword).input.focus();
    };chips.append(chip);}
    const advanced=el('details');advanced.append(el('summary','搜索语法（可选）'));
    const generated=el('code'),rawLabel=el('label','自己编辑语句'),rawMode=el('input');rawLabel.className='raw-toggle';rawMode.type='checkbox';rawMode.name='rawMode';rawLabel.prepend(rawMode);
    const raw=el('textarea');raw.name='raw';raw.maxLength=2000;raw.hidden=true;raw.setAttribute('aria-label','自定义搜索语句');
    advanced.append(generated,rawLabel,raw);
    const current=new URL(location.href).searchParams.get('q');
    if(current){const use=el('button','使用当前页面的搜索');use.type='button';use.onclick=()=>{raw.value=current;rawMode.checked=true;update();};advanced.append(use);}
    const summary=el('p');summary.className='summary';summary.setAttribute('aria-live','polite');
    const name=field('name','名称（选填）');name.input.maxLength=80;name.input.placeholder='留空时按条件命名';
    const actions=el('div');actions.className='actions';const search=el('a','在 X 搜索');search.className='search-now';
    const save=el('button','保存到侧栏');save.type='submit';const cancel=el('button','取消');cancel.type='button';
    actions.append(search,save,cancel);formAdd.append(help,chips,builder,summary,advanced,name.wrap,actions);
    let savingSearch=false;const status=el('p');status.className='status';status.setAttribute('role','status');
    const filters=()=>({...base,all:keyword.input.value,from:author.input.value,period:period.input.value,likes:likes.input.value,mode:rawMode.checked?'raw':'builder',raw:raw.value});
    function update(){builder.hidden=rawMode.checked;raw.hidden=!rawMode.checked;status.textContent='';try{const f=filters();summary.textContent=describeSearch(f);generated.textContent=buildSearch(f);search.href=searchURL(f);search.setAttribute('aria-disabled','false');save.disabled=savingSearch;}catch(e){summary.textContent=e.message;generated.textContent='';search.removeAttribute('href');search.setAttribute('aria-disabled','true');save.disabled=true;}}
    rawMode.oninput=()=>{if(rawMode.checked&&!raw.value)raw.value=generated.textContent;};formAdd.oninput=update;formAdd.onchange=update;
    search.onclick=e=>{try{search.href=searchURL(filters());}catch(error){e.preventDefault();status.textContent=error.message;}};
    const addButton=control('添加自定义搜索',Plus,()=>{formAdd.hidden=!formAdd.hidden;addButton.setAttribute('aria-expanded',String(!formAdd.hidden));if(!formAdd.hidden){update();keyword.input.focus();}});addButton.setAttribute('aria-expanded','false');
    function close(){formAdd.hidden=true;addButton.setAttribute('aria-expanded','false');addButton.focus();}
    cancel.onclick=close;formAdd.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();close();}};
    resetDraft=()=>{formAdd.reset();base={};for(const c of chips.children)c.setAttribute('aria-pressed','false');keyword.input.placeholder=keywordHint;author.input.placeholder=authorHint;advanced.open=false;formAdd.hidden=true;addButton.setAttribute('aria-expanded','false');update();};
    head.append(addButton,control('高级搜索与管理',SlidersHorizontal,()=>send({type:'options',page:'workspace/search',...(!formAdd.hidden?{searchDraft:filters()}:{})}).catch(e=>status.textContent=e.message)));
    formAdd.onsubmit=async e=>{
      e.preventDefault();if(savingSearch)return;const bound=getOwner();if(!bound){status.textContent='先登录 X，再保存自己的搜索。';return;}savingSearch=true;save.disabled=true;
      try{const f=filters();buildSearch(f);await send({type:'sidebar-search-save',owner:bound,name:name.input.value.trim()||describeSearch(f).split(' · ').slice(0,2).join(' · ').slice(0,48),filters:f});if(getOwner()!==bound)return;resetDraft();status.textContent='已保存到侧栏';addButton.focus();await populate();}
      catch(error){if(getOwner()===bound)status.textContent=error.message;}finally{savingSearch=false;try{buildSearch(filters());save.disabled=false;}catch{save.disabled=true;}}
    };
    const list=el('div');list.className='links';card.append(head,list,formAdd,status);root.append(style,card);anchor.after(host);
    attachHandleSuggest(author.input,{send,getOwner,root});void populate();
  }
  return{mount,refresh:populate};
}
