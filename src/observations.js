import { authorEvidence,numericID,contextEvidence } from './evidence.js';
const facts=new Map(),posts=new Map(),pending=new Map(),attempts=new Map();
const queued=new Map();
let evidenceTimer=null;
function flushEvidence(){
  evidenceTimer=null;
  const rows=[...queued];queued.clear();
  for(let i=0;i<rows.length;i+=50){
    const batch=new Map(rows.slice(i,i+50)),request=crypto.randomUUID();
    pending.set(request,batch);
    window.postMessage({channel:'qx-evidence-request',request,ids:[...batch.keys()]},location.origin);
    setTimeout(()=>pending.delete(request),2500);
  }
}
let active=false;
function listen(){
  if(active||typeof window==='undefined')return;active=true;
  window.addEventListener('message',e=>{
    if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='qx-evidence-response')return;
    const ids=pending.get(e.data.request);if(!ids)return;pending.delete(e.data.request);
    for(const row of (Array.isArray(e.data.rows)?e.data.rows:[]).slice(0,50)){
      const expected=ids.get(row.id);if(!expected||row.handle!==expected)continue;
      const author=authorEvidence(row.author);if(!author)continue;
      facts.set(row.id,{handle:row.handle,author,parentId:numericID(row.parentId)});
    }
    while(facts.size>500)facts.delete(facts.keys().next().value);
    window.dispatchEvent(new Event('qx-evidence-updated'));
  });
}
export function enrichItem(item){
  listen();
  const row=facts.get(item.id);
  if(row?.handle===item.handle){
    item.author=row.author;
    if(row.parentId)item.kind='reply';
    const parent=posts.get(row.parentId);
    if(parent){item.directParent=contextEvidence(parent);item.parent=parent.text;}
    let root=parent,seen=new Set([item.id]);
    while(root&&!seen.has(root.id)){
      seen.add(root.id);const fact=facts.get(root.id);
      if(!fact)break;
      if(!fact.parentId){item.root=contextEvidence(root);break;}
      root=posts.get(fact.parentId);
    }
    item.observedReplies=[...posts.values()].filter(p=>p.id!==item.id&&p.kind==='reply'&&p.author?.userId&&p.author.userId===item.author.userId).slice(-8).map(contextEvidence);
  }
  posts.set(item.id,item);while(posts.size>500)posts.delete(posts.keys().next().value);
  if((!row||Date.now()-(row.author.observedAt||0)>60000)&&typeof window!=='undefined'&&Date.now()-(attempts.get(item.id)||0)>3000){
    attempts.set(item.id,Date.now());while(attempts.size>500)attempts.delete(attempts.keys().next().value);
    queued.set(item.id,item.handle);
    if(evidenceTimer===null)evidenceTimer=setTimeout(flushEvidence,0);
  }
  return item;
}
