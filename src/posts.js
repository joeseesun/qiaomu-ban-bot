// Local post queue: drafts, planned times and their media blobs live only in
// this extension's IndexedDB. Nothing is posted from here; "fill" hands a post
// to X's own composer, where the user presses Post (or confirms X's schedule).
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const finished=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('没有保存成功，请重试'));});
export const POST_LIMIT=280;
export const MAX_TEXT=25000;
export const STATUSES=['draft','queued','filled','posted'];
const URL_RE=/https?:\/\/[^\s]+|(?:^|\s)(?:[a-z0-9-]+\.)+(?:com|net|org|io|ai|dev|app|co|cn|me|xyz|info)(?:\/[^\s]*)?/gi;
// X's weighted length: Latin and common punctuation weigh 1, everything else
// (CJK, emoji) weighs 2, and each link counts as 23 regardless of its length.
export function xLength(text){
  let n=0,rest=String(text||'').normalize('NFC');
  rest=rest.replace(URL_RE,m=>{n+=23+(/^\s/.test(m)?1:0);return'';});
  for(const ch of rest){const c=ch.codePointAt(0);n+=(c<=4351||(c>=8192&&c<=8205)||(c>=8208&&c<=8223)||(c>=8242&&c<=8247))?1:2;}
  return n;
}
export const MEDIA_RULES={
  image:{types:['image/jpeg','image/png','image/webp'],max:5*1024*1024,label:'图片'},
  gif:{types:['image/gif'],max:15*1024*1024,label:'GIF'},
  video:{types:['video/mp4','video/quicktime'],max:512*1024*1024,label:'视频'},
};
export function mediaKind(type){for(const[k,r]of Object.entries(MEDIA_RULES))if(r.types.includes(type))return k;return'';}
const mb=n=>Math.round(n/1024/1024);
// X allows up to 4 images, or exactly one GIF or one video.
export function checkMedia(existing,file){
  const kind=mediaKind(file.type);
  if(!kind)throw Error(`「${file.name||'文件'}」格式不支持。可以用 JPG、PNG、WebP、GIF、MP4 或 MOV。`);
  const rule=MEDIA_RULES[kind];if(file.size>rule.max)throw Error(`${rule.label}不能超过 ${mb(rule.max)} MB。`);
  if(!file.size)throw Error('文件是空的。');
  const kinds=existing.map(m=>mediaKind(m.type));
  if(kinds.some(k=>k!=='image')||(kind!=='image'&&kinds.length))throw Error('一条帖子只能放 4 张图片，或者 1 个 GIF / 视频。');
  if(kinds.length>=4)throw Error('一条帖子最多 4 张图片。');
  return kind;
}
const clock=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const DEFAULT_SLOTS={times:['09:00','12:30','21:00'],days:[0,1,2,3,4,5,6]};
export function normalizeSlots(v){
  const times=[...new Set((Array.isArray(v?.times)?v.times:[]).filter(clock))].sort().slice(0,12);
  const days=[...new Set((Array.isArray(v?.days)?v.days:[]).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort();
  return{times,days};
}
// The next weekly slot after `after` that no queued post already occupies.
export function nextSlot(slots,taken=[],after=Date.now()){
  const s=normalizeSlots(slots);if(!s.times.length||!s.days.length)return 0;
  const busy=new Set(taken.map(t=>Math.floor(t/60000)));
  const start=new Date(after);
  for(let d=0;d<60;d++){
    const day=new Date(start.getFullYear(),start.getMonth(),start.getDate()+d);
    if(!s.days.includes(day.getDay()))continue;
    for(const t of s.times){const[h,m]=t.split(':').map(Number);const at=new Date(day.getFullYear(),day.getMonth(),day.getDate(),h,m).getTime();if(at>after+60000&&!busy.has(Math.floor(at/60000)))return at;}
  }
  return 0;
}
function clean(post,old){
  const text=String(post.text??old?.text??'').replace(/\r\n?/g,'\n').slice(0,MAX_TEXT);
  const at=Number(post.scheduledAt??old?.scheduledAt??0);
  const scheduledAt=Number.isFinite(at)&&at>0?Math.floor(at/60000)*60000:0;
  const status=STATUSES.includes(post.status)?post.status:old?.status||(scheduledAt?'queued':'draft');
  const mediaIds=Array.isArray(post.mediaIds)?post.mediaIds.filter(id=>typeof id==='string').slice(0,4):old?.mediaIds||[];
  return{id:old?.id||post.id,text,scheduledAt,status,mediaIds,remind:post.remind??old?.remind??true,nativeSchedule:post.nativeSchedule??old?.nativeSchedule??true,createdAt:old?.createdAt||Date.now(),updatedAt:Date.now(),filledAt:post.filledAt??old?.filledAt??0,postedAt:post.postedAt??old?.postedAt??0,postedUrl:String(post.postedUrl??old?.postedUrl??'').slice(0,200)};
}
const uuid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2);
export class Posts {
  constructor(factory=globalThis.indexedDB,name='qiaomu-x-posts'){
    this.db=new Promise((resolve,reject)=>{
      const r=factory.open(name,1);
      r.onupgradeneeded=()=>{const d=r.result;const p=d.createObjectStore('posts',{keyPath:'id'});p.createIndex('updated','updatedAt');d.createObjectStore('media',{keyPath:'id'});d.createObjectStore('settings',{keyPath:'key'});};
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
  }
  async all(){const db=await this.db;const rows=await request(db.transaction('posts').objectStore('posts').getAll());return rows.sort((a,b)=>(a.scheduledAt||Infinity)-(b.scheduledAt||Infinity)||b.updatedAt-a.updatedAt);}
  async get(id){const db=await this.db;return request(db.transaction('posts').objectStore('posts').get(String(id||'')));}
  async save(post){
    const db=await this.db,tx=db.transaction(['posts','media'],'readwrite'),done=finished(tx),s=tx.objectStore('posts'),m=tx.objectStore('media');
    const old=post.id?await request(s.get(post.id)):null;const next=clean({...post,id:post.id||uuid()},old);
    if(!next.text.trim()&&!next.mediaIds.length){tx.abort();await done.catch(()=>{});throw Error('先写点内容，或者加一张图片。');}
    for(const id of next.mediaIds)if(!await request(m.getKey(id))){tx.abort();await done.catch(()=>{});throw Error('有一个附件已丢失，请重新添加。');}
    for(const id of old?.mediaIds||[])if(!next.mediaIds.includes(id))m.delete(id);
    s.put(next);await done;return next;
  }
  async update(id,patch){const old=await this.get(id);if(!old)throw Error('这条帖子已删除。');return this.save({...old,...patch,id});}
  async remove(id){
    const db=await this.db,tx=db.transaction(['posts','media'],'readwrite'),done=finished(tx),s=tx.objectStore('posts'),old=await request(s.get(id));
    for(const m of old?.mediaIds||[])tx.objectStore('media').delete(m);s.delete(id);await done;return{};
  }
  async addMedia(file,existing=[]){
    checkMedia(existing,file);
    const db=await this.db,tx=db.transaction('media','readwrite'),done=finished(tx),id=uuid();
    const row={id,name:String(file.name||'media').slice(0,120),type:file.type,size:file.size,blob:file,createdAt:Date.now()};
    tx.objectStore('media').put(row);await done;return{id,name:row.name,type:row.type,size:row.size};
  }
  async media(id){const db=await this.db;return request(db.transaction('media').objectStore('media').get(id));}
  // Attachments added to an unsaved draft and then abandoned.
  async pruneMedia(keep=[],olderThan=Date.now()-86400000){
    const db=await this.db,posts=await this.all(),used=new Set([...keep,...posts.flatMap(p=>p.mediaIds)]);
    const tx=db.transaction('media','readwrite'),done=finished(tx),s=tx.objectStore('media');
    const keys=await request(s.getAllKeys());let removed=0;
    for(const k of keys)if(!used.has(k)){const row=await request(s.get(k));if(row&&row.createdAt<olderThan){s.delete(k);removed++;}}
    await done;return{removed};
  }
  async slots(){const db=await this.db;const row=await request(db.transaction('settings').objectStore('settings').get('slots'));return row?normalizeSlots(row.value):{...DEFAULT_SLOTS};}
  async setSlots(value){const v=normalizeSlots(value);const db=await this.db,tx=db.transaction('settings','readwrite'),done=finished(tx);tx.objectStore('settings').put({key:'slots',value:v});await done;return v;}
  async nextFree(after=Date.now(),except=''){const posts=await this.all();return nextSlot(await this.slots(),posts.filter(p=>p.id!==except&&p.status==='queued'&&p.scheduledAt).map(p=>p.scheduledAt),after);}
}
// Base64 slices keep runtime messages small enough for long videos.
export const CHUNK=2*1024*1024;
export async function blobChunk(blob,offset){
  const slice=blob.slice(offset,offset+CHUNK),bytes=new Uint8Array(await slice.arrayBuffer());
  let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return{data:btoa(binary),next:offset+bytes.length,done:offset+bytes.length>=blob.size};
}
export function chunkBytes(data){const s=atob(data),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
