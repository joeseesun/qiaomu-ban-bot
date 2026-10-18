// Bookmarks stay in a separate local database. No model or X API calls.
import { contactHandle } from './contacts.js';
export const BOOKMARK_DB='qiaomu-banbot-bookmarks';
export function bookmarkPath(path){return /^\/i\/(?:bookmarks(?:\/\d+)?|history)\/?$/.test(path);}
const ownerOf=v=>{const owner=contactHandle(v);if(!owner)throw Error('先在 X 登录，再打开书签页。');return owner;};
const text=(v,n)=>typeof v==='string'?v.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').trim().slice(0,n):'';
const idOf=v=>typeof v==='string'&&/^\d{1,25}$/.test(v)?v:'';
export function safeLink(value){try{const u=new URL(value);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}return'';}
export function cleanBookmark(input){
  const id=idOf(input?.id),handle=contactHandle(input?.handle);if(!id||!handle)throw Error('书签缺少有效的帖子链接。');
  const links=[...new Set((Array.isArray(input.links)?input.links:[]).map(safeLink).filter(Boolean))].slice(0,30);
  const images=[...new Set((Array.isArray(input.images)?input.images:[]).map(safeLink).filter(u=>{const v=new URL(u);return v.protocol==='https:'&&v.hostname==='pbs.twimg.com'&&v.pathname.startsWith('/media/');}))].slice(0,8);
  const raw=typeof input.text==='string'?input.text:'';
  return{id,handle,displayName:text(input.displayName,100),text:text(raw,50000),publishedAt:Number.isFinite(input.publishedAt)&&input.publishedAt>0&&Number.isFinite(new Date(input.publishedAt).getTime())?input.publishedAt:null,partial:input.partial===true||raw.length>50000,translated:input.translated===true,hasVideo:input.hasVideo===true,hasQuote:input.hasQuote===true,links,images,url:`https://x.com/${handle}/status/${id}`};
}
const queryOf=v=>text(v,160).toLowerCase();
const matches=(row,q)=>!q||[row.text,row.handle,row.displayName,row.note,...row.tags].join('\n').toLowerCase().includes(q);
const rangeFor=(owner,before)=>IDBKeyRange.bound([owner,0,''],before||[owner,Number.MAX_SAFE_INTEGER,'\uffff'],false,!!before);
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const finished=tx=>{const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('书签未保存，请重试。'));});done.catch(()=>{});return done;};
// Escape Markdown and raw HTML, including Obsidian wiki embeds. Exported content
// remains readable text; URLs only appear in explicitly validated destinations.
export const markdownText=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_{}\[\]()#+.!|~\-])/g,'\\$1');
const destination=v=>safeLink(v).replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/</g,'%3C').replace(/>/g,'%3E');
const date=v=>v?new Date(v).toISOString():'未知';
export function bookmarkMarkdown(row){
  const out=[`## ${markdownText(row.text.split('\n')[0].slice(0,70)||row.displayName||'图片 / 视频书签')}`,`作者：${markdownText(row.displayName||row.handle)} (@${row.handle})  \n原帖：[在 X 查看](${destination(row.url)})  \n发布时间：${date(row.publishedAt)}  \n首次收集：${date(row.collectedAt)}`];
  if(row.tags.length)out.push(`标签：${row.tags.map(markdownText).join('、')}`);
  if(row.note)out.push(`### 我的备注\n\n${markdownText(row.note)}`);
  if(row.partial)out.push('> 正文未展开或超出保存长度，仅导出已收集的片段，请查看原帖。');
  if(row.translated)out.push('> 此段为收集时 X 显示的译文。');
  out.push(row.text?markdownText(row.text).replace(/\n/g,'  \n'):'（该帖未采集到文字正文）');
  if(row.links.length)out.push('### 正文链接\n\n'+row.links.map((u,i)=>`- [链接 ${i+1}](${destination(u)})`).join('\n'));
  // Links instead of embeds avoid silently loading remote media in note readers.
  if(row.images.length)out.push('### 图片\n\n'+row.images.map((u,i)=>`- [图片 ${i+1}](${destination(u)})`).join('\n'));
  if(row.hasQuote)out.push('引用帖：请在原帖查看，未合并引用正文。');
  if(row.hasVideo)out.push('视频：请在原帖查看，未下载媒体文件。');
  return out.join('\n\n')+'\n\n---\n\n';
}
export class Bookmarks{
  constructor(factory=globalThis.indexedDB,name=BOOKMARK_DB){
    this.db=new Promise((resolve,reject)=>{const r=factory.open(name,1);r.onupgradeneeded=()=>{const d=r.result,s=d.createObjectStore('bookmarks',{keyPath:['owner','id']});s.createIndex('recent',['owner','collectedAt','id']);d.createObjectStore('owners',{keyPath:'owner'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  }
  async capture(owner,inputs,{at=Date.now()}={}){
    owner=ownerOf(owner);if(!Array.isArray(inputs)||inputs.length>40)throw Error('一次最多收集 40 条书签。');
    // Validate the entire batch before opening a write transaction.
    const items=[...new Map(inputs.map(v=>{const c=cleanBookmark(v);return[c.id,c];})).values()];
    const db=await this.db,tx=db.transaction(['bookmarks','owners'],'readwrite'),done=finished(tx),s=tx.objectStore('bookmarks'),o=tx.objectStore('owners');
    let added=0;const profile=await request(o.get(owner));
    if(profile?.automatic===false){await done;return{added:0,count:profile.count||0,automatic:false};}
    for(const c of items){const old=await request(s.get([owner,c.id]));if(!old)added++;
      // A shorter/truncated revisit must not overwrite previously expanded text.
      const content=old&&((!old.partial&&c.partial)||(old.partial===c.partial&&old.text.length>c.text.length))?{...c,text:old.text,partial:old.partial,translated:old.translated,links:[...new Set([...old.links,...c.links])].slice(0,30),images:[...new Set([...old.images,...c.images])].slice(0,8),hasVideo:old.hasVideo||c.hasVideo}:c;
      s.put({...content,displayName:content.displayName||old?.displayName||'',publishedAt:content.publishedAt||old?.publishedAt||null,owner,collectedAt:old?.collectedAt||at,lastSeenAt:at,note:old?.note||'',tags:old?.tags||[]});
    }
    o.put({...profile,owner,count:(profile?.count||0)+added,updatedAt:at});await done;return{added,count:(profile?.count||0)+added,automatic:true};
  }
  async status(owner){owner=ownerOf(owner);const db=await this.db,tx=db.transaction('owners'),profile=await request(tx.objectStore('owners').get(owner));return{count:profile?.count||0,automatic:profile?.automatic!==false};}
  async configure(owner,automatic){
    owner=ownerOf(owner);if(typeof automatic!=='boolean')throw Error('请选择是否自动保存书签。');
    const db=await this.db,tx=db.transaction('owners','readwrite'),done=finished(tx),s=tx.objectStore('owners'),profile=await request(s.get(owner));
    s.put({...profile,owner,count:profile?.count||0,updatedAt:profile?.updatedAt||Date.now(),automatic});await done;return{count:profile?.count||0,automatic};
  }
  async state(){const db=await this.db,tx=db.transaction('owners');const owners=await request(tx.objectStore('owners').getAll());owners.sort((a,b)=>b.updatedAt-a.updatedAt);return{owners};}
  async page({owner,query='',before=null,limit=20}={}){
    owner=ownerOf(owner);const q=queryOf(query);limit=Math.max(1,Math.min(20,Number(limit)||20));
    const valid=Array.isArray(before)&&before.length===3&&before[0]===owner&&Number.isFinite(before[1])&&idOf(before[2]);
    const db=await this.db,tx=db.transaction(['bookmarks','owners']),profile=await request(tx.objectStore('owners').get(owner));
    const items=await new Promise((resolve,reject)=>{const rows=[],r=tx.objectStore('bookmarks').index('recent').openCursor(rangeFor(owner,valid?before:null),'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c||rows.length>limit){resolve(rows);return;}if(matches(c.value,q))rows.push(c.value);c.continue();};});
    const more=items.length>limit;items.length=Math.min(items.length,limit);const last=items.at(-1);return{items,count:profile?.count||0,next:more?[owner,last.collectedAt,last.id]:null};
  }
  async edit(owner,id,{note,tags}){
    owner=ownerOf(owner);if(!idOf(id))throw Error('帖子编号无效。');
    const cleanedTags=[...new Set((Array.isArray(tags)?tags:[]).map(v=>text(v,400)).filter(Boolean))];
    if(cleanedTags.length>12||cleanedTags.some(v=>v.length>32))throw Error('最多添加 12 个标签，每个不超过 32 字。');
    const db=await this.db,tx=db.transaction('bookmarks','readwrite'),done=finished(tx),s=tx.objectStore('bookmarks'),row=await request(s.get([owner,id]));
    if(row)s.put({...row,note:text(note,2000),tags:cleanedTags});
    await done;if(!row)throw Error('这条书签已移除，请刷新列表。');return{};
  }
  async remove(owner,id){
    owner=ownerOf(owner);if(!idOf(id))throw Error('帖子编号无效。');const db=await this.db,tx=db.transaction(['bookmarks','owners'],'readwrite'),done=finished(tx),s=tx.objectStore('bookmarks'),o=tx.objectStore('owners');
    const [row,profile]=await Promise.all([request(s.get([owner,id])),request(o.get(owner))]);if(row){s.delete([owner,id]);o.put({...profile,owner,count:Math.max(0,(profile?.count||1)-1)});}await done;return{};
  }
  async exportMarkdown({owner,query='',at=Date.now()}={}){
    owner=ownerOf(owner);const q=queryOf(query),db=await this.db,tx=db.transaction('bookmarks','readonly'),done=finished(tx),chunks=[];let count=0,bytes=0;
    // One readonly transaction gives a consistent export even during collection.
    // Build chunks in the extension page, never send the whole archive over IPC.
    await new Promise((resolve,reject)=>{const r=tx.objectStore('bookmarks').index('recent').openCursor(rangeFor(owner),'prev');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const c=r.result;if(!c){resolve();return;}if(matches(c.value,q)){const chunk=bookmarkMarkdown(c.value);bytes+=new TextEncoder().encode(chunk).byteLength;if(bytes>40*1024*1024){reject(Error('内容超过 40 MB。请用关键词缩小范围后分批导出。'));return;}chunks.push(chunk);count++;}c.continue();};});await done;
    if(!count)throw Error('没有可导出的书签。先去 X 收集，或换个搜索词。');
    const heading=`# X 书签 · @${owner}\n\n导出时间：${date(at)}  \n本次导出：${count} 条${q?'（搜索：'+markdownText(queryOf(query))+'）':''}\n\n仅包含本机已收集内容，不代表全部 X 书签。X 收藏时间未知；首次收集时间不等于收藏时间。图片和视频保留链接，不包含媒体文件。\n\n---\n\n`;
    return{count,filename:`x-bookmarks-${owner}-${new Date(at).toISOString().slice(0,10)}.md`,blob:new Blob([heading,...chunks],{type:'text/markdown;charset=utf-8'})};
  }
}
