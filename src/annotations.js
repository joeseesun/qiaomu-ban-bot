const clone=value=>structuredClone(value);
const order=(a,b)=>b.at-a.at || b.key.localeCompare(a.key);
export class MemoryAnnotations {
  constructor(){this.rows=new Map();this.revision=0;this.migrated=false;}
  async migrate(rows=[]){if(this.migrated)return;for(const row of rows)if(row.key)this.rows.set(row.key,clone(row));this.migrated=true;this.revision++;}
  async get(key){return clone(this.rows.get(key));}
  async rememberName(key,displayName,author){const row=this.rows.get(key);if(row){row.displayName=displayName;row.nameAt=Date.now();if(author?.userId&&!row.author?.userId)row.author=clone(author);}}
  async put(row){this.rows.set(row.key,clone(row));this.revision++;}
  async remove(key){this.rows.delete(key);this.revision++;}
  async clear(){this.rows.clear();this.revision++;}
  async stats(){const rows=[...this.rows.values()];return{total:rows.length,ai:rows.filter(e=>e.label==='ai').length,human:rows.filter(e=>e.label==='human').length,revision:this.revision};}
  async page({label='all',before=null,limit=20}={}){
    const rows=[...this.rows.values()].filter(e=>(label==='all'||e.label===label)&&(!before||e.at<before.at||e.at===before.at&&e.key<before.key)).sort(order);
    const items=rows.slice(0,limit),last=items.at(-1);
    return clone({items,next:rows.length>limit?{at:last.at,key:last.key}:null});
  }
  async mergeMissing(rows){const added=[];for(const row of rows)if(!await this.get(row.key)&&!await this.post(row.id)){await this.put(row);added.push(row.key);}return added;}
  async removeMany(keys){for(const key of keys)await this.remove(key);}
  async recent(limit=40){return(await this.page({limit})).items;}
  async post(id){return clone([...this.rows.values()].filter(r=>r.id===id).sort(order)[0]);}
  async byAuthor(item,limit=40){return clone([...this.rows.values()].filter(r=>r.id!==item.id&&(item.author?.userId?r.author?.userId===item.author.userId:r.handle===item.handle)).sort(order).slice(0,limit));}
}

// Full history is kept outside the frequently-written Chrome settings/cache.
// Index cursors fetch one page; no getAll() or full history sort in production.
export class IndexedAnnotations {
  constructor(factory=globalThis.indexedDB,ranges=globalThis.IDBKeyRange,name='qiaomu-banbot-labels'){
    this.ranges=ranges;
    this.ready=new Promise((resolve,reject)=>{
      const req=factory.open(name,4);
      req.onupgradeneeded=e=>{
        const db=req.result;
        if(e.oldVersion<1){
          const rows=db.createObjectStore('annotations',{keyPath:'key'});
          rows.createIndex('time',['at','key']);rows.createIndex('labelTime',['label','at','key']);rows.createIndex('label','label');db.createObjectStore('meta');
        }
        if(e.oldVersion<3){
        const rows=req.transaction.objectStore('annotations');
        rows.createIndex('post','id');rows.createIndex('authorTime',['author.userId','at','key']);rows.createIndex('handleTime',['handle','at','key']);
        const latest=new Map();let deduped=false;
        rows.openCursor().onsuccess=event=>{
          const cursor=event.target.result;
          if(!cursor){if(deduped){const meta=req.transaction.objectStore('meta');meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');}return;}
          const row=cursor.value,previous=latest.get(row.id);
          if(/^\d{1,25}$/.test(row.id||'')){
            if(previous){deduped=true;if(order(row,previous)<0){rows.delete(previous.key);latest.set(row.id,row);}else rows.delete(row.key);}
            else latest.set(row.id,row);
          }cursor.continue();
        };
        }
        if(db.objectStoreNames.contains('authors'))db.deleteObjectStore('authors');
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
    return this.transaction('readwrite',(store,meta,done)=>{
      const req=meta.get('migrated');req.onsuccess=()=>{
        if(req.result)return;
        for(const e of rows)if(e.key&&['ai','human'].includes(e.label))store.put(e);
        meta.put(true,'migrated');meta.put(1,'revision');
      };
    });
  }
  async get(key){return this.transaction('readonly',(store,meta,done)=>{store.get(key).onsuccess=e=>done(e.target.result);});}
  rememberName(key,displayName,author){return this.transaction('readwrite',(store,meta,done)=>{
    store.get(key).onsuccess=e=>{const row=e.target.result;if(!row||row.displayName===displayName&&(!author?.userId||row.author?.userId))return;
      if(author?.userId&&!row.author?.userId)row.author=clone(author);
      row.displayName=displayName;row.nameAt=Date.now();store.put(row);
    };
  });}
  async change(key,row){return this.transaction('readwrite',(store,meta,done)=>{
    if(row)store.put(row);else store.delete(key);
    meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');
  });}
  put(row){return this.change(row.key,row);}
  remove(key){return this.change(key,null);}
  clear(){return this.transaction('readwrite',(store,meta,done)=>{store.clear();meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');});}
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
  mergeMissing(rows){return this.transaction('readwrite',(store,meta,done)=>{
    const added=[],seenKeys=new Set(),seenPosts=new Set();done(added);
    for(const row of rows){if(seenKeys.has(row.key)||seenPosts.has(row.id))continue;seenKeys.add(row.key);seenPosts.add(row.id);
      store.get(row.key).onsuccess=e=>{if(e.target.result)return;store.index('post').get(row.id).onsuccess=e=>{if(!e.target.result){store.put(row);added.push(row.key);}};};
    }
    meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');
  });}
  removeMany(keys){return this.transaction('readwrite',(store,meta)=>{for(const key of keys)store.delete(key);meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');});}
  async recent(limit=40){return(await this.page({limit})).items;}
  post(id){return this.transaction('readonly',(store,meta,done)=>{const rows=[];store.index('post').openCursor(this.ranges.only(id)).onsuccess=e=>{const c=e.target.result;if(!c){done(rows.sort(order)[0]);return;}rows.push(c.value);c.continue();};});}
  byAuthor(item,limit=40){return this.transaction('readonly',(store,meta,done)=>{
    const rows=[];done(rows);const id=item.author?.userId||item.handle,index=item.author?.userId?'authorTime':'handleTime';
    store.index(index).openCursor(this.ranges.bound([id,0,''],[id,Number.MAX_SAFE_INTEGER,'\uffff']),'prev').onsuccess=e=>{
      const c=e.target.result;if(!c||rows.length>=limit)return;if(c.value.id!==item.id)rows.push(c.value);c.continue();
    };
  });}
}
