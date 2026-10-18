// Synthetic fixture only. Never reads or writes the installed extension store.
history.replaceState(null,'','/i/bookmarks');
const region=document.querySelector('[role=region]');
for(let i=1;i<=24;i++){
  const a=document.createElement('article');a.dataset.testid='tweet';
  a.innerHTML=`<div class="avatar">${i%2?'夏':'木'}</div><div class="body"><div data-testid="User-Name"><a href="/demo_author_${i}">${i%2?'小夏同学':'开源观察站'}</a></div><div class="meta">@demo_author_${i} · <a href="/demo_author_${i}/status/${i}"><time datetime="2026-10-18T10:00:00Z">2 小时</time></a></div><p data-testid="tweetText">${i%2?'好工具应该少一步操作，多一点确定感。打开书签页就自动保存，往下浏览就能留下更多。':'把值得留住的内容整理好，下一次需要时，能迅速找到。'}</p><div class="media">示例内容 ${i} · 仅用于界面验证</div><div class="tools"><span>回复</span><span>转发</span><span>喜欢</span><button data-testid="removeBookmark">已收藏</button></div></div>`;region.append(a);
}
const rows=new Map();let automatic=true;
window.chrome={runtime:{onMessage:{addListener(){}},sendMessage:async m=>{
  if(m.type==='bookmarks-status')return{ok:true,data:{count:rows.size,automatic}};
  if(m.type==='bookmarks-configure'){automatic=m.automatic;return{ok:true,data:{count:rows.size,automatic}};}
  if(m.type==='bookmarks-capture'){if(automatic)m.items.forEach(row=>rows.set(row.id,row));return{ok:true,data:{count:rows.size,automatic}};}
  return{ok:true,data:{}};
}}};
