import { handleOf, validateItem } from './core.js';
import { normalizeSearch, buildSearch } from './search.js';
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
const trim=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
export function workspaceOwner(v){const h=handleOf(v);if(!h)throw Error('先登录 X，或在常用 @ 中添加自己的账号。');return h;}
export const INTEREST_REASONS=['','话题不合适','重复信息','已经了解','具体有用','想继续关注'];
export class Workspace{
  constructor(factory=globalThis.indexedDB,ranges=globalThis.IDBKeyRange,name='qiaomu-x-helper-workspace'){
    this.ranges=ranges;this.db=new Promise((resolve,reject)=>{const r=factory.open(name,1);r.onupgradeneeded=()=>{const db=r.result;db.createObjectStore('profiles',{keyPath:'owner'});db.createObjectStore('removed',{keyPath:['owner','id']});for(const name of['searches','ratings','feedback','inbox']){const s=db.createObjectStore(name,{keyPath:['owner','id']});s.createIndex('recent',['owner','at','id']);s.createIndex('rank',['owner','rank','at','id']);}};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async profile(owner,patch){
    owner=workspaceOwner(owner);const db=await this.db,tx=db.transaction('profiles',patch?'readwrite':'readonly'),end=done(tx),s=tx.objectStore('profiles');
    const old=await req(s.get(owner))||{owner,enabled:false,topics:'',avoid:'',collectMentions:true,revision:0};
    if(!patch){await end;return old;}
    const next={...old,revision:old.revision+1};
    for(const k of['enabled','collectMentions'])if(typeof patch[k]==='boolean')next[k]=patch[k];
    for(const k of['topics','avoid'])if(typeof patch[k]==='string')next[k]=trim(patch[k],1000);
    s.put(next);await end;return next;
  }
  async get(store,owner,id){owner=workspaceOwner(owner);const db=await this.db;return req(db.transaction(store).objectStore(store).get([owner,String(id)]));}
  async put(store,row){const db=await this.db,tx=db.transaction(store,'readwrite'),end=done(tx);tx.objectStore(store).put(row);await end;return row;}
  async remove(store,owner,id){owner=workspaceOwner(owner);const db=await this.db,tx=db.transaction(store==='inbox'?['inbox','removed']:store,'readwrite'),end=done(tx);tx.objectStore(store).delete([owner,String(id)]);if(store==='inbox')tx.objectStore('removed').put({owner,id:String(id)});await end;return{};}
  async saveSearch(owner,input){
    owner=workspaceOwner(owner);const name=trim(input?.name,80);if(!name)throw Error('给这次搜索起个名字。');
    const filters=normalizeSearch(input.filters);buildSearch(filters);
    const id=/^[a-zA-Z0-9_-]{1,80}$/.test(input.id||'')?input.id:crypto.randomUUID(),old=await this.get('searches',owner,id);
    return this.put('searches',{owner,id,name,category:trim(input.category,40),pinned:input.pinned===true,rank:input.pinned===true?1:0,filters,at:old?.at||Date.now()});
  }
  async saveFeedback(owner,input,label,reason=''){
    owner=workspaceOwner(owner);const item=validateItem(input);if(!['yes','no',null].includes(label))throw Error('请选择感兴趣或不感兴趣。');
    if(label===null){await this.remove('feedback',owner,item.id);}else await this.put('feedback',{owner,id:item.id,handle:item.handle,displayName:item.displayName,kind:item.kind,metrics:item.metrics,text:item.text.slice(0,1000),parent:item.parent.slice(0,500),label,reason:INTEREST_REASONS.includes(reason)?reason:'',at:Date.now(),rank:0});
    await this.profile(owner,{});return{label};
  }
  async queue(owner,input,patch={},at=Date.now()){
    owner=workspaceOwner(owner);const item=validateItem(input),db=await this.db,tx=db.transaction(['inbox','profiles','removed'],'readwrite'),end=done(tx),s=tx.objectStore('inbox');
    const [old,profile,removed]=await Promise.all([req(s.get([owner,item.id])),req(tx.objectStore('profiles').get(owner)),req(tx.objectStore('removed').get([owner,item.id]))]);
    if(patch.source==='mention'&&(profile?.collectMentions===false||removed)){await end;return{skipped:'paused-or-removed'};}
    if(patch.source!=='mention')tx.objectStore('removed').delete([owner,item.id]);
    const status=['pending','done','snoozed'].includes(patch.status)?patch.status:old?.status||'pending';
    const pinned=typeof patch.pinned==='boolean'?patch.pinned:old?.pinned||false;
    const score=Number.isFinite(patch.score)&&patch.score>=0&&patch.score<=1?patch.score:old?.score??null;
    const row={...item,owner,id:item.id,at:old?.at||at,updatedAt:at,status,pinned,score,rank:(pinned?3:0)+(score??-1),source:old?.source||(patch.source==='mention'?'mention':'manual'),model:trim(patch.model,100)||old?.model||''};s.put(row);await end;return row;
  }
  async rate(owner,handle,input){owner=workspaceOwner(owner);handle=handleOf(handle);if(!handle)throw Error('无法确认账号。');return this.put('ratings',{...input,owner,id:handle,handle,rank:input.overall??-1,at:Date.now()});}
  async page(store,owner,{before=null,query='',status='',sort='recent',limit=20,label=''}={}){
    if(!['searches','ratings','feedback','inbox'].includes(store))throw Error('未知记录类型。');owner=workspaceOwner(owner);limit=Math.floor(Math.min(2000,Math.max(1,Number(limit)||20)));
    const index=sort==='rank'?'rank':'recent',size=index==='rank'?4:3;
    const valid=Array.isArray(before)&&before.length===size&&before[0]===owner&&typeof before.at(-1)==='string'&&before.slice(1,-1).every(Number.isFinite);
    const low=index==='rank'?[owner,-Number.MAX_SAFE_INTEGER,0,'']:[owner,0,''];
    const high=valid?before:index==='rank'?[owner,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,'\uffff']:[owner,Number.MAX_SAFE_INTEGER,'\uffff'];
    const range=this.ranges.bound(low,high,false,valid),db=await this.db,q=trim(query,160).toLowerCase();
    return new Promise((resolve,reject)=>{const rows=[],r=db.transaction(store).objectStore(store).index(index).openCursor(range,'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c){resolve({items:rows,next:null});return;}const v=c.value;
      if((!status||v.status===status)&&(!label||v.label===label)&&(!q||[v.name,v.category,v.handle,v.displayName,v.text,v.reason,JSON.stringify(v.filters)].filter(Boolean).join(' ').toLowerCase().includes(q))){
        if(rows.length===limit){const last=rows.at(-1);resolve({items:rows,next:index==='rank'?[owner,last.rank,last.at,last.id]:[owner,last.at,last.id]});return;}rows.push(v);
      }c.continue();};});
  }
  async interestContext(owner){const profile=await this.profile(owner),feedback=(await this.page('feedback',owner,{limit:40})).items;return{profile,feedback};}
  async importSearches(owner,rows){owner=workspaceOwner(owner);const now=Date.now(),items=rows.map((r,i)=>({...r,filters:normalizeSearch(r.filters),owner,id:crypto.randomUUID(),rank:r.pinned?1:0,at:now+i}));for(const r of items)buildSearch(r.filters);const db=await this.db,tx=db.transaction('searches','readwrite'),end=done(tx),s=tx.objectStore('searches');for(const row of items)s.put(row);await end;return{count:items.length};}
}
