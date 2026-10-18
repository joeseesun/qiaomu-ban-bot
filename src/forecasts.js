import { contactHandle } from './contacts.js';
import { postReview } from './review.js';
const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const done=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});
const metrics=v=>Object.fromEntries(['views','likes','replies','reposts'].map(k=>[k,Number.isFinite(v?.[k])&&v[k]>=0?v[k]:null]));
const ownerOf=v=>{const h=contactHandle(v);if(!h)throw Error('请先登录 X，再记录你的看好判断');return h;};
export class Forecasts{
  constructor(factory=globalThis.indexedDB,name='qiaomu-banbot-forecasts'){
    this.db=new Promise((resolve,reject)=>{const r=factory.open(name,1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('watches',{keyPath:['owner','id']});s.createIndex('recent',['owner','at','id']);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async watch(owner,item,result,target,at=Date.now()){
    owner=ownerOf(owner);const handle=contactHandle(item?.handle),id=String(item?.id||'');
    if(!handle||!/^\d{1,25}$/.test(id)||!Number.isFinite(result?.scores?.hot)||result.scores.hot<0||result.scores.hot>1)throw Error('预测尚未就绪');
    const db=await this.db,tx=db.transaction('watches','readwrite'),end=done(tx),s=tx.objectStore('watches'),old=await req(s.get([owner,id]));
    if(old){await end;return old;}
    const createdAt=Number.isFinite(item.createdAt)?item.createdAt:Date.parse(item.createdAt),targetViews=Math.max(1000,Math.min(1e7,Number(target)||30000));
    const initial={at,metrics:metrics(item.metrics)};
    const row={owner,id,handle,displayName:String(item.displayName||'').slice(0,80),text:String(item.text||'').slice(0,6000),at,reviewAt:at+3*86400000,createdAt:Number.isFinite(createdAt)?createdAt:null,targetViews,probability:result.scores.hot,model:String(result.model||'').slice(0,100),predictedAt:Number(result.analyzedAt)||at,initial,latest:initial,samples:[initial],reachedWithin24h:Number.isFinite(createdAt)&&at<=createdAt+86400000&&initial.metrics.views>=targetViews};
    s.put(row);await end;return row;
  }
  async observe(owner,items,at=Date.now()){
    owner=ownerOf(owner);const db=await this.db,tx=db.transaction('watches','readwrite'),end=done(tx),s=tx.objectStore('watches');
    await Promise.all((Array.isArray(items)?items:[]).slice(0,40).map(async item=>{if(!/^\d{1,25}$/.test(item?.id))return;const row=await req(s.get([owner,item.id]));if(!row||row.handle!==contactHandle(item.handle)||at<=row.latest.at)return;const m=metrics(item.metrics);if(m.views===null)return;const sample={at,metrics:m},history=row.samples||[row.initial];const samples=[row.initial,...history.filter(p=>p.at!==row.initial.at).slice(-58),sample];s.put({...row,latest:sample,samples,reachedWithin24h:row.reachedWithin24h||(row.createdAt!==null&&at<=row.createdAt+86400000&&m.views>=row.targetViews)});}));await end;return{};
  }
  async page({owner,before=null,query=''}={}){
    owner=ownerOf(owner);const valid=Array.isArray(before)&&before.length===3&&before[0]===owner&&Number.isFinite(before[1])&&/^\d+$/.test(before[2]);
    const range=IDBKeyRange.bound([owner,0,''],valid?before:[owner,Number.MAX_SAFE_INTEGER,'\uffff'],false,!!valid),db=await this.db;
    const q=String(query).toLowerCase().slice(0,160);
    return new Promise((resolve,reject)=>{const rows=[],r=db.transaction('watches').objectStore('watches').index('recent').openCursor(range,'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c||rows.length===21){const more=rows.length>20;rows.length=Math.min(20,rows.length);const last=rows.at(-1);resolve({items:rows,next:more?[owner,last.at,last.id]:null});return;}const v=c.value;if(!q||[v.text,v.handle,v.displayName].join(' ').toLowerCase().includes(q))rows.push(v);c.continue();};});
  }
  async summary(owner,now=Date.now()){
    owner=ownerOf(owner);const db=await this.db,range=IDBKeyRange.bound([owner,0,''],[owner,Number.MAX_SAFE_INTEGER,'\uffff']);
    return new Promise((resolve,reject)=>{const counts={total:0,confirmed:0,open:0,unknown:0,due:0,withUpdates:0},r=db.transaction('watches').objectStore('watches').index('recent').openCursor(range);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c){resolve(counts);return;}const v=c.value;counts.total++;counts[postReview(v,now).outcome]++;if(now>=v.reviewAt&&v.latest.at<v.reviewAt)counts.due++;if(v.latest.at>v.initial.at)counts.withUpdates++;c.continue();};});
  }
  async remove(owner,id){owner=ownerOf(owner);const db=await this.db,tx=db.transaction('watches','readwrite'),end=done(tx);tx.objectStore('watches').delete([owner,String(id)]);await end;return{};}
}
export function reviewState(row,now=Date.now()){
  if(row.latest.at>=row.reviewAt)return'已有复盘数据';
  if(now>=row.reviewAt)return'待复盘 · 打开原帖更新';
  return `${new Date(row.reviewAt).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})} 可复盘`;
}
