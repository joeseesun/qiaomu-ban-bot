import { safeLink } from './bookmarks.js';
const excluded='[data-testid="quoteTweet"],[data-testid="card.wrapper"],div[role="link"][tabindex="0"]';
export function extractBookmark(article){
  const own=s=>[...article.querySelectorAll(s)].filter(n=>n.closest('article')===article&&!n.closest(excluded));
  // The native saved-state button distinguishes bookmarks from recommendations.
  if(!own('[data-testid="removeBookmark"]').length||article.closest('[data-testid="placementTracking"]'))return null;
  const time=own('time').find(t=>/^\/\w{1,15}\/status\/\d+/.test(t.closest('a')?.getAttribute('href')||''));
  const match=time?.closest('a').getAttribute('href').match(/^\/(\w{1,15})\/status\/(\d+)(?:$|[/?])/);if(!match)return null;
  const handle=match[1].toLowerCase();
  const name=own('[data-testid="User-Name"] a').find(n=>n.getAttribute('href')?.toLowerCase()===`/${handle}`&&!n.textContent.trim().startsWith('@'));
  const read=n=>n.nodeType===3?n.textContent:n.nodeType!==1?'':n.tagName==='IMG'?n.getAttribute('alt')||'':n.tagName==='BR'?'\n':[...n.childNodes].map(read).join('');
  const nodes=own('[data-testid="tweetText"]');
  return{id:match[2],handle,displayName:name?read(name).trim():'',text:nodes.map(read).join('\n').trim(),publishedAt:Date.parse(time.getAttribute('datetime'))||null,
    partial:!!own('[data-testid="tweet-text-show-more-link"]').length,
    translated:own('button').some(n=>/^(显示原文|顯示原文|Show original)$/i.test(n.getAttribute('aria-label')||n.textContent.trim())),
    links:[...new Set(nodes.flatMap(n=>[...n.querySelectorAll('a[href]')].map(a=>safeLink(a.href))).filter(Boolean))],
    images:own('[data-testid="tweetPhoto"] img').map(n=>n.src),hasVideo:!!own('video,[data-testid="videoPlayer"]').length,hasQuote:!!article.querySelector('[data-testid="quoteTweet"],div[role="link"][tabindex="0"]')};
}
