import { handleOf } from './core.js';
const clone=value=>structuredClone(value);
const order=(a,b)=>b.at-a.at || b.key.localeCompare(a.key);
function updateAuthor(author,row,delta) {
  const handle=handleOf(row.handle);
  if(!handle||!['ai','human'].includes(row.label))return author;
  author ||= {handle,displayName:'',nameAt:0,ai:0,human:0};
  author[row.label]+=delta;
  const nameAt=row.nameAt||row.at;
  if(delta>0&&row.displayName&&nameAt>=author.nameAt){author.displayName=String(row.displayName).slice(0,100);author.nameAt=nameAt;}
  return author;
}
function aggregate(rows){const authors=new Map();for(const row of rows){const a=updateAuthor(authors.get(handleOf(row.handle)),row,1);if(a)authors.set(a.handle,a);}return authors;}
// One-time upgrade/migration; later writes adjust just the affected account.
function rebuildAuthors(store,authors){
  const counts=new Map();authors.clear();
  store.openCursor().onsuccess=e=>{const cursor=e.target.result;
    if(!cursor){for(const author of counts.values())authors.put(author);return;}
    const row=cursor.value,a=updateAuthor(counts.get(handleOf(row.handle)),row,1);if(a)counts.set(a.handle,a);cursor.continue();
  };
}
export class MemoryAnnotations {
  constructor(){this.rows=new Map();this.revision=0;this.migrated=false;}
  async migrate(rows=[]){if(this.migrated)return;for(const row of rows)if(row.key)this.rows.set(row.key,clone(row));this.migrated=true;this.revision++;}
  async get(key){return clone(this.rows.get(key));}
  async rememberName(key,displayName){const row=this.rows.get(key);if(row){row.displayName=displayName;row.nameAt=Date.now();}}
  async put(row){this.rows.set(row.key,clone(row));this.revision++;}
  async remove(key){this.rows.delete(key);this.revision++;}
  async clear(){this.rows.clear();this.revision++;}
  async stats(){const rows=[...this.rows.values()];return{total:rows.length,ai:rows.filter(e=>e.label==='ai').length,human:rows.filter(e=>e.label==='human').length,revision:this.revision};}
  async page({label='all',before=null,limit=20}={}){
    const rows=[...this.rows.values()].filter(e=>(label==='all'||e.label===label)&&(!before||e.at<before.at||e.at===before.at&&e.key<before.key)).sort(order);
    const items=rows.slice(0,limit),last=items.at(-1);
    return clone({items,next:rows.length>limit?{at:last.at,key:last.key}:null});
  }
  async authorPage({label='ai',before=null,limit=20}={}){
    const rows=[...aggregate(this.rows.values()).values()].filter(a=>a[label]>0&&(!before||a[label]<before.count||a[label]===before.count&&a.handle<before.handle)).sort((a,b)=>b[label]-a[label]||(a.handle<b.handle?1:-1));
    const items=rows.slice(0,limit),last=items.at(-1);return clone({items,next:rows.length>limit?{count:last[label],handle:last.handle}:null});
  }
  async recent(limit=40){return(await this.page({limit})).items;}
}

// Full history is kept outside the frequently-written Chrome settings/cache.
// Index cursors fetch one page; no getAll() or full history sort in production.
export class IndexedAnnotations {
  constructor(factory=globalThis.indexedDB,ranges=globalThis.IDBKeyRange,name='qiaomu-banbot-labels'){
    this.ranges=ranges;
    this.ready=new Promise((resolve,reject)=>{
      const req=factory.open(name,2);
      req.onupgradeneeded=e=>{
        const db=req.result;
        if(e.oldVersion<1){
          const rows=db.createObjectStore('annotations',{keyPath:'key'});
          rows.createIndex('time',['at','key']);rows.createIndex('labelTime',['label','at','key']);rows.createIndex('label','label');db.createObjectStore('meta');
        }
        const authors=db.createObjectStore('authors',{keyPath:'handle'});
        authors.createIndex('ai',['ai','handle']);authors.createIndex('human',['human','handle']);
        if(e.oldVersion>=1)rebuildAuthors(req.transaction.objectStore('annotations'),authors);
      };
      req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
      req.onerror=()=>reject(new Error('无法打开标注记录，请重新打开扩展'));
    });
  }
  async transaction(mode,fn){
    const db=await this.ready;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['annotations','meta','authors'],mode);let value;
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(new Error('标注未保存。请检查浏览器剩余空间后重试。'));
      tx.onerror=()=>{};
      fn(tx.objectStore('annotations'),tx.objectStore('meta'),v=>{value=v;},tx.objectStore('authors'));
    });
  }
  async migrate(rows=[]){
    return this.transaction('readwrite',(store,meta,done,authors)=>{
      const req=meta.get('migrated');req.onsuccess=()=>{
        if(req.result)return;
        for(const e of rows)if(e.key&&['ai','human'].includes(e.label))store.put(e);
        rebuildAuthors(store,authors);meta.put(true,'migrated');meta.put(1,'revision');
      };
    });
  }
  async get(key){return this.transaction('readonly',(store,meta,done)=>{store.get(key).onsuccess=e=>done(e.target.result);});}
  rememberName(key,displayName){return this.transaction('readwrite',(store,meta,done,authors)=>{
    store.get(key).onsuccess=e=>{const row=e.target.result;if(!row||row.displayName===displayName)return;
      row.displayName=displayName;row.nameAt=Date.now();store.put(row);
      authors.get(handleOf(row.handle)).onsuccess=event=>{const author=event.target.result;if(author){author.displayName=displayName;author.nameAt=row.nameAt;authors.put(author);}};
    };
  });}
  async change(key,row){return this.transaction('readwrite',(store,meta,done,authors)=>{
    store.get(key).onsuccess=e=>{
      const previous=e.target.result;
      if(row)store.put(row);else store.delete(key);
      for(const handle of new Set([previous?.handle,row?.handle].map(handleOf).filter(Boolean))){
        authors.get(handle).onsuccess=event=>{
          let author=event.target.result;
          if(previous&&handleOf(previous.handle)===handle)author=updateAuthor(author,previous,-1);
          if(row&&handleOf(row.handle)===handle)author=updateAuthor(author,row,1);
          if(author&&author.ai+author.human>0)authors.put(author);else authors.delete(handle);
        };
      }
    };
    meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');
  });}
  put(row){return this.change(row.key,row);}
  remove(key){return this.change(key,null);}
  clear(){return this.transaction('readwrite',(store,meta,done,authors)=>{store.clear();authors.clear();meta.get('revision').onsuccess=e=>meta.put((e.target.result||0)+1,'revision');});}
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
  authorPage({label='ai',before=null,limit=20}={}){
    return this.transaction('readonly',(store,meta,done,authors)=>{
      const items=[],result={items,next:null};done(result);
      const range=this.ranges.bound([1,''],before?[before.count,before.handle]:[Number.MAX_SAFE_INTEGER,'\uffff'],false,Boolean(before));
      authors.index(label).openCursor(range,'prev').onsuccess=e=>{
        const cursor=e.target.result;if(!cursor)return;
        if(items.length===limit){const last=items.at(-1);result.next={count:last[label],handle:last.handle};return;}
        items.push(cursor.value);cursor.continue();
      };
    });
  }
  async recent(limit=40){return(await this.page({limit})).items;}
}
