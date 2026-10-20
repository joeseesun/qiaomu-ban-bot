import { COMMUNITY_ORIGIN } from './community.js';
import { normalizeRules,RULE_PRESETS,ruleMatches } from './rules.js';
import { annotationExport } from './annotation-export.js';
export function initCommunityUI({send,notice,demo}){
  const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  let rules=[];
  function preview(){const hits=ruleMatches({displayName:$('rule-preview-text').value,handle:'preview',text:''},{enabled:true,allowlist:[],wordRules:rules,symbolHint:$('symbol-hint').checked});$('rule-preview-result').textContent=hits.length?hits.map(r=>`${r.action==='fold'?'折叠':'提示'}：${r.term}`).join(' · '):'未命中昵称规则。';}
  function render(){
    $('word-rule-list').replaceChildren();
    for(const [i,r]of rules.entries()){
      const row=el('div');row.className='rule-row';const enabled=el('input');enabled.type='checkbox';enabled.checked=r.enabled;enabled.setAttribute('aria-label','启用规则 '+r.term);enabled.onchange=()=>{r.enabled=enabled.checked;preview();};
      const remove=el('button','移除');remove.className='quiet';remove.type='button';remove.setAttribute('aria-label','移除规则 '+r.term);remove.onclick=()=>{rules.splice(i,1);render();};
      row.append(enabled,el('span',r.term),el('small',`${{name:'昵称',bio:'简介',text:'正文',all:'全部'}[r.scope]} · ${r.action==='fold'?'折叠':'提示'}`),remove);$('word-rule-list').append(row);
    }preview();
  }
  $('word-rule-add').onclick=()=>{const term=$('word-rule-term').value.trim();if(!term)return;if(rules.length>=100){notice('最多保存 100 条规则。',true);return;}rules.push({term,scope:$('word-rule-scope').value,action:$('word-rule-action').value,enabled:true});$('word-rule-term').value='';render();};
  $('word-rule-presets').onclick=()=>{for(const rule of RULE_PRESETS)if(!rules.some(r=>r.term===rule.term&&r.scope===rule.scope))rules.push({...rule,enabled:true});render();};
  $('rule-preview-text').oninput=preview;$('symbol-hint').onchange=preview;
  for(const format of ['markdown','json'])$('annotations-'+format).onclick=async()=>{
    const b=$('annotations-'+format);b.disabled=true;try{
      let before=null,rows=[],bytes=0;
      do{const page=await send({type:'annotations',before,label:'all'});bytes+=JSON.stringify(page.items).length;if(bytes>20e6)throw Error('记录超过 20 MB，请分批整理后导出。');rows.push(...page.items);before=page.next;}while(before);
      const latest=[...new Map(rows.slice().reverse().map(r=>[r.id,r])).values()];
      const text=annotationExport(latest,format),url=URL.createObjectURL(new Blob([text],{type:format==='json'?'application/json':'text/markdown;charset=utf-8'})),a=el('a');a.href=url;a.download=`x-annotations-${new Date().toISOString().slice(0,10)}.${format==='json'?'json':'md'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice(`已导出 ${latest.length} 条标注。`);
    }catch(e){notice(e.message,true);}finally{b.disabled=false;}
  };
  async function community(state){
    state ||= await send({type:'community-state'});
    $('community-connect').hidden=state.connected;
    for(const key of ['subscribe','contribute']){$('community-'+key).checked=state[key];$('community-'+key).disabled=!state.connected||(key==='contribute'&&state.scope!=='contribute');}
    $('community-status').textContent=!state.connected?'尚未连接 · 仍可使用全部本机功能':`${state.scope==='read'?'订阅身份':'共建身份'} · ${state.pending} 条待同步${state.lastSync?' · 最近同步 '+new Date(state.lastSync).toLocaleString('zh-CN'):''}${state.lastError?' · '+state.lastError:''}`;
    $('community-sync').disabled=!state.connected;$('community-withdraw').disabled=!state.connected;
  }
  $('community-settings').ontoggle=()=>{if($('community-settings').open)void community().catch(e=>notice(e.message,true));};
  $('community-connect').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{if(!demo&&!await chrome.permissions.request({origins:[COMMUNITY_ORIGIN+'/*']}))throw Error('需要允许访问社区服务。');await community(await send({type:'community-connect',invite:$('community-invite').value}));$('community-invite').value='';notice('已连接。按需开启订阅或贡献。');}catch(error){notice(error.message,true);}finally{b.disabled=false;}};
  for(const key of ['subscribe','contribute'])$('community-'+key).onchange=async()=>{try{await community(await send({type:'community-configure',[key]:$('community-'+key).checked}));}catch(e){notice(e.message,true);await community();}};
  $('community-sync').onclick=async()=>{const b=$('community-sync');b.disabled=true;try{await community(await send({type:'community-sync'}));}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
  $('community-withdraw').onclick=async()=>{if(!confirm('撤回你共享的全部社区标注并关闭贡献？本机记录会保留。'))return;const b=$('community-withdraw');b.disabled=true;try{await community(await send({type:'community-withdraw'}));notice('已撤回共享标注，本机记录保留。');}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
  return{set(settings){rules=normalizeRules(settings.wordRules);$('symbol-hint').checked=!!settings.symbolHint;render();},get(){return{wordRules:rules,symbolHint:$('symbol-hint').checked};}};
}
