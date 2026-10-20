import { SEARCH_TEMPLATES,templateSearch,searchURL } from './search.js';
import { createElement,Plus,SlidersHorizontal } from 'lucide';

export function createSearchSidebar({send,getOwner}){
  let host,owner='',version=0;
  const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  function control(label,icon,run){const b=el('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(createElement(icon,{width:17,height:17,'stroke-width':1.7}));b.onclick=run;return b;}
  async function populate(){
    if(!host?.isConnected)return;
    const h=host,bound=getOwner(),generation=++version;owner=bound;
    const list=h.shadowRoot.querySelector('.links');list.replaceChildren();
    const add=(name,filters)=>{const a=el('a',name);a.href=searchURL(filters);a.onclick=()=>{a.href=searchURL(filters);};list.append(a);};
    for(const i of [0,1,4,5])if(!SEARCH_TEMPLATES[i].ownerField||bound)add(SEARCH_TEMPLATES[i].name,templateSearch(i,bound));
    if(!bound)return;
    try{
      const data=await send({type:'sidebar-searches',owner:bound});
      if(generation!==version||h!==host||!h.isConnected||getOwner()!==bound)return;
      if(data.items.length)list.append(el('p','我的搜索'));
      for(const row of data.items)add(row.name,row.filters);
    }catch(error){h.shadowRoot.querySelector('[role=status]').textContent=error.message;}
  }
  function mount(){
    if(host?.isConnected){if(owner!==getOwner())void populate();return;}
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
      button:focus-visible,a:focus-visible,input:focus-visible{outline:1px solid #1d9bf0;outline-offset:-2px}
      .links{padding:2px 0 8px}.links a{display:block;padding:8px 14px;color:inherit;text-decoration:none;overflow-wrap:anywhere}.links p{font-size:11px;color:#71767b;margin:8px 14px 2px}
      form{padding:12px 14px;border-top:1px solid var(--qx-search-line,#eff3f4)}label{display:block;font-size:12px;margin-bottom:10px}input{display:block;width:100%;margin-top:5px;border:1px solid var(--qx-search-line,#eff3f4);border-radius:6px;font:inherit;padding:8px;background:transparent;color:inherit}
      form button{border-radius:999px;background:var(--qx-search-ink,#0f1419);color:var(--qx-search-bg,#fff);padding:5px 14px;font:inherit}form button:hover{opacity:.85}.status{margin:0 14px 8px;font-size:12px;color:#71767b}.status:empty{display:none}`;
    const dark=getComputedStyle(document.body).backgroundColor.match(/\d+/g)?.slice(0,3).map(Number).reduce((a,b)=>a+b,0)<350;
    if(dark)for(const[k,v]of Object.entries({ink:'#e7e9ea',line:'#2f3336',bg:'#000',soft:'#16181c'}))host.style.setProperty('--qx-search-'+k,v);
    const card=el('div');card.className='card';const head=el('header');head.append(el('h2','快捷搜索'));
    const formAdd=el('form');formAdd.hidden=true;
    const name=el('input');name.required=true;name.maxLength=80;const nl=el('label','名称');nl.append(name);
    const query=el('input');query.required=true;query.maxLength=2000;query.placeholder='例如：from:vista8 min_faves:100';const ql=el('label','X 搜索语句');ql.append(query);
    const save=el('button','保存到侧栏');save.type='submit';formAdd.append(nl,ql,save);
    const status=el('p');status.className='status';status.setAttribute('role','status');
    head.append(control('添加自定义搜索',Plus,()=>{formAdd.hidden=!formAdd.hidden;if(!formAdd.hidden){query.value=new URL(location.href).searchParams.get('q')||'';name.focus();}}),control('高级搜索与管理',SlidersHorizontal,()=>send({type:'options',page:'workspace/search'}).catch(e=>status.textContent=e.message)));
    formAdd.onsubmit=async e=>{
      e.preventDefault();const bound=getOwner();if(!bound){status.textContent='先登录 X，再保存自己的搜索。';return;}save.disabled=true;
      try{await send({type:'sidebar-search-save',owner:bound,name:name.value,query:query.value});if(getOwner()!==bound)return;formAdd.reset();formAdd.hidden=true;status.textContent='已保存到侧栏';await populate();}
      catch(error){status.textContent=error.message;}finally{save.disabled=false;}
    };
    const list=el('div');list.className='links';card.append(head,list,formAdd,status);root.append(style,card);anchor.after(host);void populate();
  }
  return{mount,refresh:populate};
}
