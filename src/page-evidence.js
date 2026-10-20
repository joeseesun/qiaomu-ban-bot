// MAIN world, read-only. No Chrome APIs, credentials, network requests or full page export.
const ARTICLE='article[data-testid="tweet"]';
function tweetOf(article,id){
  let fiber=article[Object.keys(article).find(k=>k.startsWith('__reactFiber$'))];
  for(let i=0;fiber&&i<40;i++,fiber=fiber.return){
    const tweet=fiber.memoizedProps?.tweet;
    if(String(tweet?.id_str||tweet?.rest_id||'')===id)return tweet;
  }
  return null;
}
const time=v=>{const n=Date.parse(v||'');return Number.isFinite(n)?n:null;};
window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.channel!=='qx-evidence-request')return;
  const {request,ids}=e.data;
  if(typeof request!=='string'||request.length>80||!Array.isArray(ids)||ids.length>50)return;
  const wanted=new Set(ids.filter(v=>/^\d{1,25}$/.test(v))),rows=[];
  for(const article of [...document.querySelectorAll(ARTICLE)].slice(0,100)){
    const stamp=[...article.querySelectorAll('time')].find(n=>n.closest(ARTICLE)===article&&!n.closest('[data-testid="quoteTweet"],div[role="link"][tabindex="0"]'));
    const match=stamp?.closest('a')?.getAttribute('href')?.match(/^\/(\w{1,15})\/status\/(\d+)/);
    if(!match||!wanted.has(match[2]))continue;
    const t=tweetOf(article,match[2]),u=t?.user;
    if(!t||!u||String(u.screen_name).toLowerCase()!==match[1].toLowerCase())continue;
    rows.push({id:match[2],handle:match[1].toLowerCase(),parentId:t.in_reply_to_status_id_str||null,
      author:{userId:String(u.id_str||u.rest_id||''),followers:u.followers_count,following:u.friends_count,posts:u.statuses_count,
        joinedAt:time(u.created_at),bio:String(u.description||'').slice(0,1000),blueVerified:u.is_blue_verified,
        followsYou:u.followed_by,youFollow:u.following,observedAt:Date.now()}});
  }
  window.postMessage({channel:'qx-evidence-response',request,rows},location.origin);
});
