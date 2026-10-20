export const RULE_PRESETS=[
  {term:'我的福不黑',scope:'name',action:'fold'},
  {term:'互关',scope:'name',action:'fold'},
  {term:'约炮',scope:'name',action:'fold'},
  {term:'同城',scope:'name',action:'hint'},
];
export function normalizeRules(value){
  if(!Array.isArray(value))return [];
  return value.slice(0,100).filter(r=>r&&typeof r.term==='string'&&r.term.trim()).map(r=>({
    term:r.term.trim().slice(0,80),scope:['name','bio','text','all'].includes(r.scope)?r.scope:'name',
    action:r.action==='fold'?'fold':'hint',enabled:r.enabled!==false,
  }));
}
export function ruleMatches(item,settings){
  if(!settings.enabled||settings.allowlist?.includes(item.handle))return [];
  const fields={name:`${item.displayName||''} @${item.handle}`,bio:item.author?.bio||'',text:item.text||''};
  const hits=[];
  for(const r of settings.wordRules||[]){
    if(!r.enabled)continue;
    const text=r.scope==='all'?Object.values(fields).join('\n'):fields[r.scope]||'';
    if(text.normalize('NFKC').toLowerCase().includes(r.term.normalize('NFKC').toLowerCase()))hits.push({term:r.term,action:r.action,scope:r.scope});
  }
  // Only invisible directional/control marks; emoji and non-Latin scripts are valid names.
  if(settings.symbolHint&&/[\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(item.displayName||''))hits.push({term:'名字含不可见方向符',action:'hint',scope:'name'});
  return hits;
}
