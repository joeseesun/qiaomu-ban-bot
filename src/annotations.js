const clone=value=>structuredClone(value);
const order=(a,b)=>b.at-a.at || b.key.localeCompare(a.key);
export class MemoryAnnotations {
  constructor(){this.rows=new Map();this.revision=0;this.migrated=false;}
  async migrate(rows=[]){if(this.migrated)return;for(const row of rows)if(row.key)this.rows.set(row.key,clone(row));this.migrated=true;this.revision++;}
  async get(key){return clone(this.rows.get(key));}
  async put(row){this.rows.set(row.key,clone(row));this.revision++;}
  async remove(key){this.rows.delete(key);this.revision++;}
  async clear(){this.rows.clear();this.revision++;}
  async stats(){const rows=[...this.rows.values()];return{total:rows.length,ai:rows.filter(e=>e.label==='ai').length,human:rows.filter(e=>e.label==='human').length,revision:this.revision};}
  async page({label='all',before=null,limit=20}={}){
    const rows=[...this.rows.values()].filter(e=>(label==='all'||e.label===label)&&(!before||e.at<before.at||e.at===before.at&&e.key<before.key)).sort(order);
    const items=rows.slice(0,limit),last=items.at(-1);
    return clone({items,next:rows.length>limit?{at:last.at,key:last.key}:null});
  }
  async recent(limit=40){return(await this.page({limit})).items;}
}

// Full history is kept outside the frequently-written Chrome settings/cache.
// Index cursors fetch one page; no getAll() or full history sort in production.
export class IndexedAnnotations {
  constructor(factory=globalThis.indexedDB,ranges=globalThis.IDBKeyRange,name='qiaomu-banbot-labels'){
    this.ranges=ranges;
    this.ready=new Promise((resolve,reject)=>{
      const req=factory.open(name,1);
      req.onupgradeneeded=()=>{
        const db=req.result,rows=db.createObjectStore('annotations',{keyPath:'key'});
        rows.createIndex('time',['at','key']);rows.createIndex('labelTime',['label','at','key']);rows.createIndex('label','label');
        db.createObjectStore('meta');
      };
      req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
      req.onerror=()=>reject(new Error('无法打开标注记录，请重新打开扩展'));
    });
  }
  async transaction(mode,fn){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['annotations','meta'],mode);let value;
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(new Error('标注未保存。请检查浏览器剩余空间后重试。'));
      tx.onerror=()=>{};
      fn(tx.objectStore('annotations'),tx.objectStore('meta'),v=>{value=v;});
    });
  }
  async migrate(rows=[]){
    return this.transaction('readwrite',(store,meta)=>{
      const req=meta.get('migrated');req.onsuccess=()=>{
        if(req.result)return;
        for(const e of rows)if(e.key&&['ai','human'].includes(e.label))store.put(e);
        meta.put(true,'migrated');meta.put(1,'revision');
      };
    });
  }
  async get(key){return this.transaction('readonly',(store,meta,done)=>{store.get(key).onsuccess=e=>done(e.target.result);});}
  async change(fn){return this.transaction('readwrite',(store,meta)=>{fn(store);meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');});}
  put(row){return this.change(store=>store.put(row));}
  remove(key){return this.change(store=>store.delete(key));}
  clear(){return this.change(store=>store.clear());}
  stats(){return this.transaction('readonly',(store,meta,done)=>{
    const result={};done(result);
    store.count().onsuccess=e=>{result.total=e.target.result;};
    for(const label of ['ai','human'])store.index('label').count(label).onsuccess=e=>{result[label]=e.target.result;};
    meta.get('revision').onsuccess=e=>{result.revision=e.target.result||0;};
  });}
  page({label='all',before=null,limit=20}={}){
    return this.transaction('readonly',(store,meta,done)=>{
      const items=[],result={items,next:null};done(result);
      const index=store.index(label==='all'?'time':'labelTime');
      const upper=before?[before.at,before.key]:[Number.MAX_SAFE_INTEGER,'\uffff'];
      const range=label==='all'?(before?this.ranges.upperBound(upper,true):null):this.ranges.bound([label,0,''],[label,...upper],false,Boolean(before));
      index.openCursor(range,'prev').onsuccess=e=>{
        const cursor=e.target.result;if(!cursor)return;
        if(items.length===limit){const last=items.at(-1);result.next={at:last.at,key:last.key};return;}
        items.push(cursor.value);cursor.continue();
      };
    });
  }
  async recent(limit=40){return(await this.page({limit})).items;}
}
