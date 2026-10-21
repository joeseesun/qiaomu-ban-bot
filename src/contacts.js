// Local address book. Deliberately separate from labels, model prompts and keys.
import { pinyin } from 'pinyin-pro';
function searchText(c){const parts=[c.displayName,c.note].map(s=>pinyin(s||'',{toneType:'none',type:'array'}));return [c.handle,c.displayName,c.note,...parts.flatMap(a=>[a.join(''),a.map(s=>s[0]||'').join('')])].join(' ').toLowerCase();}
export function contactHandle(value) {
  let text=String(value||'').trim();
  if(/^https?:/i.test(text)){
    try{const u=new URL(text);if(!['x.com','www.x.com','twitter.com','www.twitter.com'].includes(u.hostname)||u.username||u.password)return'';text=u.pathname.replace(/^\//,'').replace(/\/$/,'');}catch{return'';}
  }
  text=text.replace(/^@/,'');
  return /^[a-zA-Z0-9_]{1,15}$/.test(text)&&!['home','explore','notifications','messages','settings','compose','i','search'].includes(text.toLowerCase())?text.toLowerCase():'';
}
export function avatarURL(value){
  try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password&&((u.hostname==='pbs.twimg.com'&&u.pathname.startsWith('/profile_images/'))||(u.hostname==='abs.twimg.com'&&u.pathname.startsWith('/sticky/default_profile_images/'))))return u.href;}catch{}
  return'';
}
const clean=(v,n)=>String(v||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,n);
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const finished=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('联系人未保存，请重试'));});
const ownerOf=v=>{const h=contactHandle(v);if(!h)throw Error('先选择你的 X 账号');return h;};
const order=c=>[c.owner,c.pinned?1:0,c.activity,c.handle];
export class Contacts {
  constructor(factory=globalThis.indexedDB,name='qiaomu-banbot-contacts'){
    this.defaultsReady=new Set();
    this.db=new Promise((resolve,reject)=>{
      const r=factory.open(name,1);
      r.onupgradeneeded=()=>{
        const d=r.result,c=d.createObjectStore('contacts',{keyPath:['owner','handle']});c.createIndex('recent',['owner','pinnedOrder','activity','handle']);
        d.createObjectStore('owners',{keyPath:'handle'});
        d.createObjectStore('receipts',{keyPath:['owner','id']});
        d.createObjectStore('removed',{keyPath:['owner','handle']});
      };r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
  }
  async ensureDefaults(owner){
    if(this.defaultsReady.has(owner))return;
    const db=await this.db,tx=db.transaction(['contacts','owners','removed'],'readwrite'),done=finished(tx),o=tx.objectStore('owners');
    const profile=await request(o.get(owner));
    if(!profile){await done;return;}
    if(!profile.feedbackContactInitialized){
      const s=tx.objectStore('contacts'),key=[owner,'vista8'];
      const [existing,removed]=await Promise.all([request(s.get(key)),request(tx.objectStore('removed').get(key))]);
      if(owner!=='vista8'&&!existing&&!removed){
        const contact={owner,handle:'vista8',displayName:'向阳乔木',avatar:'',note:'插件作者 · 问题反馈',pinned:false,pinnedOrder:0,replyCount:0,lastReplyAt:0,activity:0};
        contact.search=searchText(contact);s.put(contact);
      }
      o.put({...profile,feedbackContactInitialized:true});
    }
    await done;this.defaultsReady.add(owner);
  }
  async observe(owner){
    owner=ownerOf(owner);const db=await this.db,tx=db.transaction('owners','readwrite'),done=finished(tx),s=tx.objectStore('owners');
    const old=await request(s.get(owner));s.put({...old,handle:owner,automatic:old?.automatic!==false,seenAt:Date.now()});await done;return this.state(owner);
  }
  async state(owner){
    const db=await this.db,tx=db.transaction('owners','readonly');
    const owners=await request(tx.objectStore('owners').getAll());owners.sort((a,b)=>b.seenAt-a.seenAt);
    await Promise.all(owners.filter(o=>!o.feedbackContactInitialized).map(o=>this.ensureDefaults(o.handle)));
    return{owners,owner:contactHandle(owner)||owners[0]?.handle||''};
  }
  async configure(owner,automatic){
    owner=ownerOf(owner);if(typeof automatic!=='boolean')throw Error('设置无效');
    const db=await this.db,tx=db.transaction('owners','readwrite'),done=finished(tx),s=tx.objectStore('owners'),old=await request(s.get(owner));
    s.put({...old,handle:owner,seenAt:old?.seenAt||Date.now(),automatic});await done;return{};
  }
  async put(owner,input,{replyId,at=Date.now()}={}){
    owner=ownerOf(owner);const handle=contactHandle(input?.handle);if(!handle||handle===owner)throw Error('请添加其他人的 @账号或 X 主页链接');
    if(replyId&&!/^\d{1,25}$/.test(replyId))throw Error('回复编号无效');
    const db=await this.db,tx=db.transaction(['contacts','owners','receipts','removed'],'readwrite'),done=finished(tx);
    const s=tx.objectStore('contacts'),o=tx.objectStore('owners'),r=tx.objectStore('receipts'),removed=tx.objectStore('removed');
    const [old,profile,receipt,excluded]=await Promise.all([request(s.get([owner,handle])),request(o.get(owner)),replyId?request(r.get([owner,replyId])):null,replyId?request(removed.get([owner,handle])):null]);
    if(replyId&&(profile?.automatic===false||receipt||excluded)){await done;return{recorded:false};}
    if(replyId)r.put({owner,id:replyId});else removed.delete([owner,handle]);
    const next={...old,owner,handle,displayName:clean(input.displayName,80)||old?.displayName||'',avatar:avatarURL(input.avatar)||old?.avatar||'',note:replyId?old?.note||'':clean(input.note??old?.note,160),pinned:replyId?!!old?.pinned:typeof input.pinned==='boolean'?input.pinned:!!old?.pinned,replyCount:(old?.replyCount||0)+(replyId?1:0),lastReplyAt:replyId?at:old?.lastReplyAt||0,activity:at};
    if(replyId){next.lastKind='reply';next.lastInteractionAt=at;}
    next.pinnedOrder=next.pinned?1:0;next.search=searchText(next);s.put(next);
    o.put({...profile,handle:owner,automatic:profile?.automatic!==false,seenAt:profile?.seenAt||at});await done;return{recorded:true,contact:next};
  }
  // A confirmed like or repost of someone else's post. Same opt-out and removal
  // rules as replies; one receipt per post and kind, so re-liking never inflates.
  async interact(owner,input,{kind,postId,at=Date.now()}={}){
    owner=ownerOf(owner);const handle=contactHandle(input?.handle);
    if(!['like','repost'].includes(kind))throw Error('互动类型无效');
    if(!/^\d{1,25}$/.test(postId||''))throw Error('帖子编号无效');
    if(!handle||handle===owner)return{recorded:false};
    const db=await this.db,tx=db.transaction(['contacts','owners','receipts','removed'],'readwrite'),done=finished(tx);
    const s=tx.objectStore('contacts'),o=tx.objectStore('owners'),r=tx.objectStore('receipts'),key=[owner,kind+':'+postId];
    const [old,profile,receipt,excluded]=await Promise.all([request(s.get([owner,handle])),request(o.get(owner)),request(r.get(key)),request(tx.objectStore('removed').get([owner,handle]))]);
    if(profile?.automatic===false||receipt||excluded){await done;return{recorded:false};}
    r.put({owner,id:kind+':'+postId});
    const count=kind==='like'?'likeCount':'repostCount';
    const next={...old,owner,handle,displayName:clean(input.displayName,80)||old?.displayName||'',avatar:avatarURL(input.avatar)||old?.avatar||'',note:old?.note||'',pinned:!!old?.pinned,replyCount:old?.replyCount||0,lastReplyAt:old?.lastReplyAt||0,[count]:(old?.[count]||0)+1,lastKind:kind,lastInteractionAt:at,activity:at};
    next.pinnedOrder=next.pinned?1:0;next.search=searchText(next);s.put(next);
    o.put({...profile,handle:owner,automatic:true,seenAt:profile?.seenAt||at});await done;return{recorded:true,contact:next};
  }
  async refresh(owner,items){
    owner=ownerOf(owner);const db=await this.db,tx=db.transaction('contacts','readwrite'),done=finished(tx),s=tx.objectStore('contacts');
    await Promise.all((Array.isArray(items)?items:[]).slice(0,40).map(async item=>{
      const h=contactHandle(item?.handle);if(!h)return;const c=await request(s.get([owner,h]));if(!c)return;
      const name=clean(item.displayName,80),avatar=avatarURL(item.avatar);
      if((name&&name!==c.displayName)||(avatar&&avatar!==c.avatar)){const next={...c,displayName:name||c.displayName,avatar:avatar||c.avatar};next.search=searchText(next);s.put(next);}
    }));await done;return{};
  }
  async use(owner,handle){
    owner=ownerOf(owner);handle=contactHandle(handle);const db=await this.db,tx=db.transaction('contacts','readwrite'),done=finished(tx),s=tx.objectStore('contacts'),c=await request(s.get([owner,handle]));
    if(c)s.put({...c,activity:Date.now()});await done;return{};
  }
  async remove(owner,handle){
    owner=ownerOf(owner);handle=contactHandle(handle);if(!handle)throw Error('账号无效');
    const db=await this.db,tx=db.transaction(['contacts','removed'],'readwrite'),done=finished(tx);tx.objectStore('contacts').delete([owner,handle]);tx.objectStore('removed').put({owner,handle});await done;return{};
  }
  async page({owner,query='',before=null,limit=20,pinned=false}={}){
    owner=ownerOf(owner);query=clean(query,160).toLowerCase().replace(/^@/,'');limit=Math.min(20,Math.max(1,Number(limit)||20));
    await this.ensureDefaults(owner);
    const valid=Array.isArray(before)&&before.length===4&&before[0]===owner&&(pinned?before[1]===1:[0,1].includes(before[1]))&&Number.isFinite(before[2])&&contactHandle(before[3])===before[3];
    const range=IDBKeyRange.bound([owner,pinned?1:0,0,''],valid?before:[owner,1,Number.MAX_SAFE_INTEGER,'\uffff'],false,!!valid);
    const db=await this.db,tx=db.transaction('contacts','readonly'),index=tx.objectStore('contacts').index('recent');
    const items=await new Promise((resolve,reject)=>{const rows=[],r=index.openCursor(range,'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c||rows.length>limit){resolve(rows);return;}const v=c.value;if(!query||(v.search||searchText(v)).includes(query))rows.push(v);c.continue();};});
    const more=items.length>limit;items.length=Math.min(items.length,limit);return{items,next:more?order(items.at(-1)):null};
  }
}
