import { reviewState } from './forecasts.js';
export function initForecastsUI({send,notice}){
  const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
  let owner='',index=0,cursors=[null],next=null,epoch=0;
  const date=t=>new Date(t).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}),count=v=>v===null?'—':v.toLocaleString();
  async function load(reset=false){
    if(reset){index=0;cursors=[null];}const gen=++epoch,list=$('forecast-list');list.setAttribute('aria-busy','true');$('forecasts-prev').disabled=$('forecasts-next').disabled=true;
    try{const page=owner?await send({type:'forecast-page',owner,before:cursors[index]}):{items:[],next:null};if(gen!==epoch)return;next=page.next;list.replaceChildren();
      if(!page.items.length&&index){index--;return load();}
      if(!page.items.length)list.append(el('p','看到有潜力的帖子，点火焰图标，再选「我感觉能爆」。这里会记住你的判断。','empty-state'));
      for(const c of page.items){const row=el('article',null,'forecast-row');const head=el('div',null,'annotation-head');head.append(el('b',c.displayName||'@'+c.handle),el('time',date(c.at)+' 看好'));row.append(head,el('p',c.text,'annotation-text'));
        const scores=el('div',null,'forecast-metrics');for(const [title,value] of [['当时模型概率',Math.round(c.probability*100)+'%'],['当时浏览',count(c.initial.metrics.views)],['最近浏览',count(c.latest.metrics.views)]]){const box=el('div');box.append(el('small',title),el('b',value));scores.append(box);}row.append(scores);
        const status=el('p',reviewState(c),'forecast-status');row.append(status,el('p',`最近采样：${date(c.latest.at)} · 24 小时目标：${c.targetViews.toLocaleString()} 浏览`,'hint'));
        if(c.reachedWithin24h)row.append(el('p','期限内已观察到达到目标。','hint'));else row.append(el('p','尚无期限内达标证据，后续数据不能还原第 24 小时的浏览量。','hint'));
        const actions=el('div',null,'forecast-actions'),link=el('a','打开原帖更新 ↗','secondary');link.href=`https://x.com/${c.handle}/status/${c.id}`;link.target='_blank';link.rel='noopener noreferrer';const remove=el('button','移除追踪','quiet');remove.onclick=async()=>{remove.disabled=true;try{if(!confirm('移除这条看好记录？'))return;await send({type:'forecast-remove',owner,id:c.id});await load();}catch(e){notice(e.message,true);}finally{remove.disabled=false;}};actions.append(link,remove);row.append(actions);list.append(row);
      }
      $('forecasts-page').textContent=`第 ${index+1} 页 · 每页 20 条`;$('forecasts-prev').disabled=index===0;$('forecasts-next').disabled=!next;
    }finally{if(gen===epoch)list.removeAttribute('aria-busy');}
  }
  async function open(){const s=await send({type:'contacts-state',owner});owner=s.owner;$('forecast-owner').replaceChildren();for(const o of s.owners){const option=el('option','@'+o.handle);option.value=o.handle;$('forecast-owner').append(option);}$('forecast-owner').value=owner;await load(true);}
  $('forecast-owner').onchange=()=>{owner=$('forecast-owner').value;void load(true).catch(e=>notice(e.message,true));};
  $('forecasts-prev').onclick=()=>{if(index){index--;void load().catch(e=>notice(e.message,true));}};
  $('forecasts-next').onclick=()=>{if(next){cursors[++index]=next;void load().catch(e=>notice(e.message,true));}};
  $('refresh-forecasts').onclick=()=>load(true).catch(e=>notice(e.message,true));
  return{open};
}
