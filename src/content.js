import { DEFAULTS, decide, duplicateKey } from './core.js';
import { ARTICLE, extractArticle } from './dom.js';
const CSS = `:host{font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;color:var(--qb-text,#536471);display:block;color-scheme:light dark}.bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 0}.bar.folded{padding:12px;background:var(--qb-bg,#fafafa);border-radius:6px;border:1px solid var(--qb-border,#eaeaea)}.label{flex:1;min-width:120px}.good{color:inherit;font-weight:600}.muted{font-size:12px;opacity:.8}button,a{font:inherit;font-size:12px;cursor:pointer;border:0;background:transparent;color:inherit;padding:5px 8px;border-radius:5px;text-decoration:none;white-space:nowrap}button:hover,a:hover{background:rgba(127,127,127,.13)}button:active{background:rgba(127,127,127,.22)}button:focus-visible,a:focus-visible{outline:1px solid currentColor;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}details{width:100%;font-size:12px}summary{cursor:pointer}p{margin:7px 0}.actions{display:flex;gap:4px;flex-wrap:wrap}.prob{font-variant-numeric:tabular-nums;font-weight:600}.err{color:#b45325}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}`;
const send = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || '扩展连接中断，请刷新 X 页面'); return r.data; };
let settings = DEFAULTS, configured = false, epoch = 0, lastUrl = location.href, scheduled = false;
let conversation = { replyIds: new Set() };
const states = new Map(), shown = new Set(), seenText = new Map();
function el(tag, text, className) { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; }
function button(text, run) {
  const b = el('button', text); b.type = 'button';
  b.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation(); b.disabled = true;
    try { await run(); } catch (error) { const p = el('p', error.message, 'err'); b.parentElement?.append(p); } finally { b.disabled = false; }
  }); return b;
}
function restore(article) { article.classList.remove('qb-collapsed'); }
function hostFor(article) {
  let host = article.querySelector(':scope > .qb-host');
  if (!host) { host = document.createElement('div'); host.className = 'qb-host'; host.attachShadow({ mode: 'open' }); article.append(host); }
  return host;
}
function resetArticle(article) { restore(article); article.querySelector(':scope > .qb-host')?.remove(); states.delete(article); }
function detailLine(text) { return el('p', text, 'muted'); }
async function openXBlock(article, item) {
  // User initiated; only opens X's native confirmation. Never presses the final confirm button.
  if ([...document.querySelectorAll('[role="dialog"]')].some(n => n.getClientRects().length && n.getAttribute('aria-hidden') !== 'true')) throw new Error('请先关闭 X 当前弹窗，再重试');
  const current = extractArticle(article, location.href, conversation);
  if (current?.id !== item.id || current.handle !== item.handle) throw new Error('帖子已变化，请重新操作');
  const caret = article.querySelector('[data-testid="caret"]');
  if (!caret) throw new Error('找不到 X 菜单，请在原帖菜单中手动屏蔽');
  caret.click();
  const find = () => [...document.querySelectorAll('[role="menuitem"]')].find(n => {
    const text = n.textContent || '';
    return text.toLowerCase().includes(`@${item.handle}`) && /^(屏蔽|封鎖|封锁|Block)\s/i.test(text.trim()) && !/取消|解除|Unblock/i.test(text);
  });
  const choice = await new Promise(resolve => {
    let done = false;
    const finish = value => { if (done) return; done = true; observer.disconnect(); clearTimeout(timer); resolve(value); };
    const observer = new MutationObserver(() => { const n = find(); if (n) finish(n); });
    const timer = setTimeout(() => finish(null), 2500);
    observer.observe(document.body, { childList: true, subtree: true });
    const n = find(); if (n) finish(n);
  });
  if (!choice) throw new Error('X 菜单结构已变化，请在菜单中手动选择屏蔽');
  choice.click();
}
function render(article, state) {
  if (!article.isConnected || states.get(article) !== state) return;
  const { item, result } = state;
  restore(article);
  if (!settings.enabled) { article.querySelector(':scope > .qb-host')?.remove(); return; }
  const host = hostFor(article), root = host.shadowRoot;
  root.replaceChildren();
  const style = el('style'); style.textContent = CSS; root.append(style);
  const background = getComputedStyle(document.body).backgroundColor;
  const rgb = background.match(/\d+/g)?.slice(0, 3).map(Number);
  const dark = rgb && rgb.reduce((a, b) => a + b, 0) < 350;
  host.style.setProperty('--qb-bg', dark ? '#171717' : '#fafafa');
  host.style.setProperty('--qb-text', dark ? '#a1a1a1' : '#666');
  host.style.setProperty('--qb-border', dark ? '#333' : '#eaeaea');
  const bar = el('div', null, 'bar'); root.append(bar);
  if (state.error) {
    bar.append(el('span', state.error, 'label muted'));
    bar.append(button('重试', () => { state.error = ''; state.started = false; return processArticle(article, state, true); })); return;
  }
  const isLocal = settings.blocklist.includes(item.handle) && !settings.allowlist.includes(item.handle);
  if (!configured && !isLocal) { bar.append(el('span', '乔木净评 · 连接 Jev 后自动判断', 'label muted'), button('连接模型', () => send({ type: 'options' }))); return; }
  if (item.kind === 'post' && !isLocal) {
    if (!settings.radar) return;
    if (!result) { bar.append(el('span', state.started ? '正在判断热帖潜力…' : '乔木热帖雷达', 'label muted'), button('判断热帖潜力', () => processArticle(article, state, true))); return; }
    const hot = result.hot;
    if (hot?.status !== 'forecast') { bar.append(el('span', hot?.label || '暂不预测', 'label muted'), button('更新判断', () => processArticle(article, state, true))); return; }
    if (!result.scores) return;
    bar.append(el('span', `热帖概率 ${Math.round(result.scores.hot * 100)}%`, 'label prob'));
    bar.append(el('span', `${Math.round(hot.velocity).toLocaleString()} 浏览/小时`, 'muted'));
    const details = el('details'); details.append(el('summary', '模型估计 · 未校准'));
    details.append(detailLine(`目标：发布 24 小时内达到 ${settings.hotViews.toLocaleString()} 浏览。依据当前可见文字、发布时间和互动量估计；缺少粉丝基线、推荐曝光和完整传播轨迹。`));
    details.append(detailLine(`模型 ${result.model} · ${new Date(result.analyzedAt).toLocaleTimeString()}${result.cached ? ' · 缓存结果' : ''}`));
    if (result.scores.discussion >= 0.85) details.append(detailLine('模型认为这条主帖适合展开具体讨论。'));
    details.append(button('更新判断', () => { state.started = false; return processArticle(article, state, true); }));
    bar.append(details); return;
  }
  if (item.kind === 'unknown' && !isLocal) {
    bar.append(button('分析这条主帖', () => { state.item = { ...item, kind: 'post' }; state.started = false; return processArticle(article, state, true); }));
    bar.append(button('分析这条回复', () => { state.item = { ...item, kind: 'reply' }; state.started = false; return processArticle(article, state, true); })); return;
  }
  let decision = decide(item, result, settings);
  if (result?.override) decision = { collapse: result.override === 'hide', label: result.override === 'hide' ? '你已选择折叠此条' : '你已保留此条' };
  if (!decision.collapse && !result?.override && state.duplicate && settings.duplicates && settings.filterMode !== 'label' && !settings.allowlist.includes(item.handle)) decision = { collapse: true, label: '与已读回复文字重复' };
  const expanded = shown.has(item.id);
  const collapsed = decision.collapse && !expanded;
  if (collapsed) { article.classList.add('qb-collapsed'); bar.classList.add('folded'); }
  const title = decision.label || (state.started && !result ? '正在判断回复…' : '乔木净评');
  bar.append(el('span', `${title}${collapsed ? ` · @${item.handle}` : ''}`, `label${decision.useful && !decision.collapse ? ' good' : ''}`));
  if (decision.collapse) bar.append(button(collapsed ? '展开' : '收起', () => { collapsed ? shown.add(item.id) : shown.delete(item.id); render(article, state); }));
  if (collapsed) bar.append(button('误判，保留', () => send({ type: 'feedback', item, label: 'keep' })));
  const details = el('details'); details.append(el('summary', '判断与操作'));
  if (result?.scores) {
    const s = result.scores;
    details.append(detailLine(`疑似 AI ${Math.round(s.ai_written * 100)}% · 低信息量 ${Math.round(s.low_value * 100)}% · 引流 ${Math.round(s.spam * 100)}%`));
    details.append(detailLine('这些是模型判断，不能证明作者身份；中文短回复尤其需要复核。'));
    details.append(detailLine(`${result.model} · ${result.cached ? '本地缓存' : '本次判断'}`));
  }
  const actions = el('div', null, 'actions');
  actions.append(button('始终保留作者', () => send({ type: 'list', handle: item.handle, action: 'allow' })));
  actions.append(button(isLocal ? '取消本地屏蔽' : '本地屏蔽作者', () => send({ type: 'list', handle: item.handle, action: isLocal ? 'remove' : 'block' })));
  actions.append(button('在 X 拉黑…', () => openXBlock(article, item)));
  if (!collapsed && item.kind === 'reply') actions.append(button('折叠此条', () => send({ type: 'feedback', item, label: 'hide' })));
  if (!result && !state.started && item.kind !== 'unknown') actions.append(button('重新判断', () => processArticle(article, state, true)));
  details.append(actions, detailLine('本地屏蔽只影响此浏览器；在 X 拉黑需要你完成 X 的确认。')); bar.append(details);
}
async function processArticle(article, state, manual = false) {
  if (state.started && !manual) return;
  if (manual) {
    const latest = extractArticle(article, location.href, conversation);
    if (!latest || latest.id !== state.item.id) return;
    state.item = { ...latest, kind: state.item.kind };
  }
  if (state.item.kind === 'unknown') { render(article, state); return; }
  if (!settings.enabled || !configured || (state.item.kind === 'post' && !settings.radar)) { render(article, state); return; }
  if (settings.allowlist.includes(state.item.handle) || settings.blocklist.includes(state.item.handle)) { render(article, state); return; }
  state.started = true; state.error = ''; render(article, state);
  const generation = epoch, fingerprint = state.fingerprint;
  try {
    const duplicateOnly = state.duplicate && settings.duplicates && settings.filterMode !== 'label' && !manual;
    const result = await send({ type: duplicateOnly ? 'local-decision' : 'classify', item: state.item });
    const current = extractArticle(article, location.href, conversation);
    if (generation !== epoch || states.get(article) !== state || state.fingerprint !== fingerprint || current?.id !== state.item.id || current.text !== state.item.text || current.parent !== state.item.parent) return;
    state.result = result;
  } catch (error) { if (generation === epoch && states.get(article) === state) state.error = error.message; }
  if (generation === epoch) render(article, state);
}
const intersection = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { const state = states.get(entry.target); if (state) void processArticle(entry.target, state); }
}, { rootMargin: '40px', threshold: 0.05 });
function scan() {
  scheduled = false;
  if (location.href !== lastUrl) { lastUrl = location.href; epoch++; for (const a of states.keys()) { intersection.unobserve(a); resetArticle(a); } seenText.clear(); shown.clear(); conversation = { replyIds: new Set() }; }
  for (const [article] of states) if (!article.isConnected) { intersection.unobserve(article); states.delete(article); }
  if (!settings.enabled) return;
  for (const article of document.querySelectorAll(ARTICLE)) {
    const item = extractArticle(article, location.href, conversation); if (!item) continue;
    const rootId = location.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
    if (item.id === rootId) { conversation.rootId = rootId; conversation.parent = item.text; conversation.passedRoot = true; }
    if (item.kind === 'reply' && rootId) conversation.replyIds.add(item.id);
    if (conversation.replyIds.size > 2000) conversation.replyIds.delete(conversation.replyIds.values().next().value);
    const fingerprint = JSON.stringify([item.id, item.text, item.kind, item.parent]);
    const existing = states.get(article);
    if (existing?.fingerprint === fingerprint) continue;
    if (existing) { intersection.unobserve(article); resetArticle(article); }
    const key = item.kind === 'reply' ? duplicateKey(item.text) : '';
    const first = key && seenText.get(key);
    const state = { item, fingerprint, duplicate: Boolean(first && first !== item.id), started: false, result: null };
    if (key && !first) { seenText.set(key, item.id); if (seenText.size > 1000) seenText.delete(seenText.keys().next().value); }
    states.set(article, state); intersection.observe(article);
  }
  if (conversation.passedRoot && [...document.querySelectorAll('[data-testid="primaryColumn"] h2')].some(n => !n.closest(ARTICLE) && /发现更多|探索更多|Discover more|More posts/i.test(n.textContent))) conversation.ended = true;
}
function schedule() { if (!scheduled) { scheduled = true; setTimeout(scan, 120); } }
async function refresh() {
  try {
    const data = await send({ type: 'snapshot' }); settings = data.settings; configured = data.configured; epoch++;
    for (const article of states.keys()) { intersection.unobserve(article); resetArticle(article); }
    schedule();
  } catch { /* An unloaded extension must not disturb X. */ }
}
const observer = new MutationObserver(records => {
  if (records.some(r => !(r.target instanceof Element && r.target.closest('.qb-host')) && [...r.addedNodes, ...r.removedNodes].some(n => !(n instanceof Element && n.matches('.qb-host'))))) schedule();
});
observer.observe(document.body, { childList: true, subtree: true });
chrome.runtime.onMessage.addListener(message => { if (message.type === 'refresh') void refresh(); });
window.addEventListener('popstate', schedule);
// Also catches X's pushState navigation when no tweet has mounted yet.
setInterval(() => { if (location.href !== lastUrl) schedule(); }, 1000);
void refresh();
