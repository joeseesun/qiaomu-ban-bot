export const ARTICLE = 'article[data-testid="tweet"]';
function ownElements(article, selector) {
  return [...article.querySelectorAll(selector)].filter(node => node.closest(ARTICLE) === article && !node.closest('[data-testid="quoteTweet"], [data-testid="card.wrapper"]') && !node.closest('div[role="link"][tabindex="0"]'));
}
export function parseCount(text) {
  const match = String(text || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([kmb万萬千亿億])?/i);
  if (!match) return null;
  const n = Number(match[1]) * ({ k: 1e3, m: 1e6, b: 1e9, 万: 1e4, 萬: 1e4, 千: 1e3, 亿: 1e8, 億: 1e8 }[match[2]?.toLowerCase()] || 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}
export function extractArticle(article, href = location.href, conversation = {}) {
  if (article.closest('[data-testid="placementTracking"]')) return null;
  const times = ownElements(article, 'time');
  const timestamp = times.find(t => /\/status\/\d+/.test(t.closest('a')?.getAttribute('href') || ''));
  const path = timestamp?.closest('a')?.getAttribute('href');
  const match = path?.match(/\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/);
  if (!match) return null;
  const id = match[2], handle = match[1].toLowerCase();
  const nameLink=ownElements(article, '[data-testid="User-Name"] a').find(n=>n.getAttribute('href')?.toLowerCase()===`/${handle}` && !n.textContent.trim().startsWith('@'));
  const displayName=nameLink?.textContent.trim().slice(0,100) || '';
  const texts = ownElements(article, '[data-testid="tweetText"]');
  const text = texts.map(el => [...el.childNodes].map(node => node.nodeType === 1 ? node.textContent : node.textContent).join('')).join('\n').trim().slice(0, 6000);
  // Only use an explicit reply marker. Other timeline posts stay untouched until manually analyzed.
  const rootID = new URL(href).pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
  const visible = ownElements(article, '[dir]').filter(el => !el.closest('[data-testid="tweetText"], .qb-host') && !el.querySelector('[data-testid="tweetText"]')).map(el => el.textContent).join('\n');
  const explicitReply = /(?:Replying to\s|回复\s*@|回覆\s*@|返信先:|En respuesta a)/i.test(visible);
  let kind = id === rootID ? 'post' : explicitReply ? 'reply' : !rootID ? 'post' : 'unknown';
  let parentArticle = null;
  // A permalink can focus a reply. Earlier conversation cells are its ancestor chain,
  // not unknown posts; the focal URL does not by itself prove original authorship.
  if (rootID) {
    const timeline = article.closest('[aria-label][role="region"]') || article.closest('[data-testid="primaryColumn"]') || article.parentElement;
    if (timeline) {
      const all = [...timeline.querySelectorAll(`${ARTICLE}, h2`)].filter(n => n.matches(ARTICLE) || !n.closest(ARTICLE));
      const rootIndex = all.findIndex(n => n.matches(ARTICLE) && ownElements(n, 'time').some(t => new RegExp(`/status/${rootID}(?:$|[/?])`).test(t.closest('a')?.getAttribute('href') || '')));
      const rootPresent = rootIndex >= 0, index = all.indexOf(article);
      const chainStart = rootPresent ? all.slice(0, rootIndex).findLastIndex(n => n.matches('h2')) + 1 : 0;
      if (rootPresent && index >= chainStart && index <= rootIndex) {
        kind = explicitReply || index > chainStart ? 'reply' : 'post';
        if (index > chainStart) parentArticle = all[index - 1];
      }
      let afterRoot = !rootPresent && conversation.rootId === rootID && conversation.passedRoot;
      for (const node of all) {
        if (node === article) { if (afterRoot && !conversation.otherIds?.has(id)) { kind = 'reply'; parentArticle = all[rootIndex] || null; } break; }
        if (node.matches('h2')) { afterRoot = false; continue; }
        const links = ownElements(node, 'time').map(t => t.closest('a')?.getAttribute('href') || '');
        const nodeId=links.map(h=>h.match(/\/status\/(\d+)/)?.[1]).find(Boolean);
        if (conversation.otherIds?.has(nodeId)) afterRoot=false;
        if (conversation.replyIds?.has(nodeId)) afterRoot=true;
        if (links.some(h => new RegExp(`/status/${rootID}(?:$|[/?])`).test(h))) afterRoot = true;
      }
      if (conversation.rootId === rootID && conversation.replyIds?.has(id)) kind = 'reply';
    }
  }
  const metrics = { views: null, likes: null, reposts: null, replies: null };
  for (const [name, selector] of Object.entries({ likes: '[data-testid="like"], [data-testid="unlike"]', reposts: '[data-testid="retweet"], [data-testid="unretweet"]', replies: '[data-testid="reply"]' })) {
    const node = ownElements(article, selector)[0];
    metrics[name] = node ? parseCount(node.getAttribute('aria-label') || node.textContent || '0') ?? 0 : null;
  }
  const analytics = ownElements(article, `a[href*="/status/${id}/analytics"]`)[0];
  if (analytics) metrics.views = parseCount(analytics.getAttribute('aria-label') || analytics.textContent);
  if (metrics.views === null) {
    for (const group of ownElements(article, '[role="group"][aria-label]')) {
      const views = group.getAttribute('aria-label').match(/([\d,.]+\s*[KMBkmb万萬千亿億]?)\s*(?:views?|次观看|次查看|次浏览|次瀏覽|次觀看)/i);
      if (views) metrics.views = parseCount(views[1]);
    }
  }
  const createdAt = Date.parse(timestamp.getAttribute('datetime') || '');
  let parent = '';
  if (kind === 'reply' && rootID) {
    if (parentArticle) parent = ownElements(parentArticle, '[data-testid="tweetText"]').map(e => e.textContent).join('\n').slice(0, 3000);
    const primary = article.closest('[data-testid="primaryColumn"]') || article.parentElement;
    for (const candidate of parent ? [] : primary.querySelectorAll(ARTICLE)) {
      if (candidate === article) continue;
      if (ownElements(candidate, 'time').some(t => t.closest('a')?.getAttribute('href')?.includes(`/status/${rootID}`))) {
        parent = ownElements(candidate, '[data-testid="tweetText"]').map(e => e.textContent).join('\n').slice(0, 3000); break;
      }
    }
    if (!parent && conversation.rootId === rootID) parent = conversation.parents?.get(id) || (id !== rootID ? conversation.parent || '' : '');
  }
  return { id, handle, displayName, text, kind, parent, metrics, createdAt: Number.isFinite(createdAt) ? createdAt : null };
}
