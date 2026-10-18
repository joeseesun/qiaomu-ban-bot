import { DEFAULTS, decide, duplicateKey } from './core.js';
import { ARTICLE, extractArticle } from './dom.js';
import { CSS, icons, icon } from './content-ui.js';
const send = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || '扩展连接中断，请刷新 X 页面'); return r.data; };
let settings = DEFAULTS, configured = false, epoch = 0, lastUrl = location.href, scheduled = false;
let conversation = { replyIds: new Set(), otherIds: new Set(), parents: new Map() };
const states = new Map(), shown = new Set(), seenText = new Map();
function el(tag, text, className) { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; }
function button(text, run, { glyph, iconOnly = false, className = '' } = {}) {
  const b = el('button', iconOnly ? null : text, className); b.type = 'button';
  if (glyph) b.prepend(icon(glyph));
  if (iconOnly) { b.classList.add('icon-button'); b.setAttribute('aria-label', text); b.title = text; }
  b.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    try { const pending = run(); if (pending?.then) { b.disabled = true; await pending; } }
    catch (error) {
      const area=b.getRootNode().querySelector?.('.bar') || b.parentElement;
      area?.querySelector('.err')?.remove();
      const p=el('p',error.message,'err'); p.setAttribute('role','alert'); area?.append(p);
    }
    finally { b.disabled = false; }
  }); return b;
}
function disclosure(bar, toolbar, label = '判断与操作') {
  const panel = el('section', null, 'panel'); panel.id = 'qb-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', label);
  const toggle = button(label, () => {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
  }, { glyph:icons.ChevronDown, iconOnly:true, className:'disclosure' });
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', panel.id);
  const escape = e => { if (e.key === 'Escape') { e.stopPropagation(); panel.hidden = true; toggle.setAttribute('aria-expanded','false'); toggle.focus(); } };
  toggle.addEventListener('keydown', escape); panel.addEventListener('keydown', escape);
  toolbar.append(toggle); bar.append(panel); return panel;
}
function actionSection(panel, title) {
  const section = el('section', null, 'section'), actions = el('div', null, 'actions');
  section.append(el('h3',title,'section-title'),actions); panel.append(section); return { section, actions };
}
// X replaces className on hover. Keep extension state in an attribute it does
// not own, so native React updates cannot reveal text beside the folded bar.
function restore(article) { article.removeAttribute('data-qb-collapsed'); }
function hostFor(article) {
  const state = states.get(article);
  let host = state?.host;
  if (!host) { host = document.createElement('div'); host.className = 'qb-host'; host.attachShadow({ mode: 'open' }); host.addEventListener('click',e=>e.stopPropagation()); state.host = host; }
  // X's article is a flex ROW. Mount in its native vertical content container,
  // otherwise the toolbar competes with the avatar/text for horizontal space.
  const native = [...article.children].find(n => n !== host);
  if (!native) return null;
  if (host.parentElement !== native) native.append(host);
  return host;
}
function resetArticle(article) { restore(article); states.get(article)?.host?.remove(); states.delete(article); }
function detailLine(text) { return el('p', text, 'muted'); }
// Anchor the visible toolbar, not the document's absolute scroll offset: a
// folded reply changes height. Never scroll for an off-screen label update.
function keepReadingPosition(article, state, update, fromTop = false) {
  const host=state.host, active=host?.shadowRoot.activeElement;
  const action=active?.dataset.label, expansion=active?.dataset.action==='expand';
  let anchor=fromTop ? article : host;
  const rect=anchor?.getBoundingClientRect();
  if (!rect || rect.bottom<0 || rect.top>innerHeight) {
    anchor=[...states.keys()].find(a=>a!==article && a.getBoundingClientRect().top>=0 && a.getBoundingClientRect().top<innerHeight);
  }
  const top=anchor?.getBoundingClientRect().top, url=location.href;
  const restorePosition=()=>{
    if (!anchor?.isConnected || location.href!==url || top===undefined) return;
    const delta=anchor.getBoundingClientRect().top-top;
    if(Math.abs(delta)>.5) window.scrollBy({top:delta,behavior:'instant'});
  };
  update(); restorePosition();
  if(action) host?.shadowRoot.querySelector(`[data-label="${action}"]`)?.focus({preventScroll:true});
  else if(expansion) host?.shadowRoot.querySelector('[data-action="expand"]')?.focus({preventScroll:true});
  // X's virtual list can measure after our synchronous mutation. Stop anchoring
  // immediately when the user scrolls or starts another gesture.
  let cancelled=false;
  const cancel=()=>{cancelled=true;};
  const events=['wheel','touchstart','pointerdown','keydown'];
  events.forEach(e=>window.addEventListener(e,cancel,{once:true,passive:true}));
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(!cancelled) restorePosition();
    events.forEach(e=>window.removeEventListener(e,cancel));
  }));
}
async function annotate(item, type, label) {
  const wasExpanded = shown.has(item.id);
  if (label === 'ai' || label === 'hide') shown.delete(item.id);
  try { return await send({ type, item, label }); }
  catch (error) { if (wasExpanded) shown.add(item.id); throw error; }
}
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
  const isLocal = settings.blocklist.includes(item.handle) && !settings.allowlist.includes(item.handle);
  restore(article);
  if (!settings.enabled || (!isLocal && (item.kind === 'unknown' || (item.kind === 'post' && !settings.radar)))) { state.host?.remove(); return; }
  const host = hostFor(article); if (!host) return;
  const root = host.shadowRoot;
  root.replaceChildren();
  const style = el('style'); style.textContent = CSS; root.append(style);
  const background = getComputedStyle(document.body).backgroundColor;
  const rgb = background.match(/\d+/g)?.slice(0, 3).map(Number);
  const dark = rgb && rgb.reduce((a, b) => a + b, 0) < 350;
  host.style.setProperty('--qb-bg', dark ? '#171717' : '#fafafa');
  host.style.setProperty('--qb-text', dark ? '#a1a1a1' : '#666');
  host.style.setProperty('--qb-strong', dark ? '#ededed' : '#171717');
  host.style.setProperty('--qb-button', dark ? '#171717' : '#fff');
  host.style.setProperty('--qb-border', dark ? '#333' : '#eaeaea');
  const bar = el('div', null, 'bar'), toolbar = el('div', null, 'toolbar'); bar.append(toolbar); root.append(bar);
  if (state.error) {
    toolbar.append(el('span', state.error, 'label muted'));
    toolbar.append(button('重试', () => { state.error = ''; state.started = false; return processArticle(article, state, true); })); return;
  }
  if (!configured && !isLocal) { toolbar.append(el('span', '乔木净评 · 连接 Jev 后自动判断', 'label muted'), button('连接模型', () => send({ type: 'options' }))); return; }
  if (item.kind === 'post' && !isLocal) {
    if (!settings.radar) return;
    if (!result) { toolbar.append(el('span', state.started ? '正在判断热帖潜力…' : '乔木热帖雷达', 'label muted'), button('判断热帖潜力', () => processArticle(article, state, true))); return; }
    const hot = result.hot;
    if (hot?.status !== 'forecast') { toolbar.append(el('span', hot?.label || '暂不预测', 'label muted'), button('更新判断', () => processArticle(article, state, true))); return; }
    if (!result.scores) return;
    toolbar.append(el('span', `热帖概率 ${Math.round(result.scores.hot * 100)}%`, 'label prob'));
    toolbar.append(el('span', `${Math.round(hot.velocity).toLocaleString()} 浏览/小时`, 'muted'));
    const details = disclosure(bar, toolbar, '热帖判断详情');
    details.append(el('p','模型估计 · 未校准','section-title'));
    details.append(detailLine(`目标：发布 24 小时内达到 ${settings.hotViews.toLocaleString()} 浏览。依据当前可见文字、发布时间和互动量估计；缺少粉丝基线、推荐曝光和完整传播轨迹。`));
    details.append(detailLine(`模型 ${result.model} · ${new Date(result.analyzedAt).toLocaleTimeString()}${result.cached ? ' · 缓存结果' : ''}`));
    if (result.scores.discussion >= 0.85) details.append(detailLine('模型认为这条主帖适合展开具体讨论。'));
    details.append(button('更新判断', () => { state.started = false; return processArticle(article, state, true); }));
    return;
  }
  let decision = decide(item, result, settings);
  if (result?.override) decision = { collapse: result.override === 'hide', label: result.learned ? result.override === 'hide' ? '已标注 AI' : '已标注真人' : result.override === 'hide' ? '你已选择折叠此条' : '你已保留此条' };
  if (!decision.collapse && !result?.override && state.duplicate && settings.duplicates && settings.filterMode !== 'label' && !settings.allowlist.includes(item.handle)) decision = { collapse: true, label: '与已读回复文字重复' };
  const expanded = shown.has(item.id);
  const collapsed = decision.collapse && !expanded;
  if (collapsed) { article.append(host); article.setAttribute('data-qb-collapsed', ''); bar.classList.add('folded'); }
  else if (expanded && decision.collapse) { host.parentElement.prepend(host); bar.classList.add('expanded'); }
  const hasScore = typeof result?.scores?.ai_written === 'number';
  const title = hasScore ? `AI 概率：${Math.round(result.scores.ai_written * 100)}%` : 'AI 概率：—';
  const signals = el('div', null, 'signals'), label = el('span', title, 'label score');
  label.title=hasScore ? result?.annotation ? '标注前的模型估计；人工标注不会改写这个分数' : '模型估计，不能证明作者身份' : '尚无模型评分';
  const extra = expanded && decision.collapse ? `已展开 · @${item.handle}` : collapsed ? `@${item.handle}${result?.annotation ? ' · '+decision.label : ''}` : result?.annotation ? decision.label : settings.filterMode === 'label' && hasScore ? '仅标记' : decision.label && !decision.useful && !/AI/.test(decision.label) ? decision.label : '';
  if (extra) label.append(el('span', extra, 'status'));
  signals.append(label);
  if (decision.useful && !decision.collapse) {
    const good = el('span', null, 'good'); good.title = '值得一读'; good.setAttribute('role','img'); good.setAttribute('aria-label','值得一读'); good.append(icon(icons.BookOpenCheck)); signals.append(good);
  }
  toolbar.append(signals);
  if (item.kind === 'reply') {
    const choices=el('div',null,'annotation'); choices.setAttribute('role','group'); choices.setAttribute('aria-label','人工标注');
    for(const [value,name,glyph] of [['ai','标记 AI',icons.Bot],['human','标记真人',icons.UserRoundCheck]]) {
      const selected=result?.annotation===value;
      const control=button(name,()=>annotate(item,'learn',selected?null:value),{glyph,iconOnly:true});
      control.dataset.label=value; control.setAttribute('aria-pressed',String(selected));
      control.title=selected ? `已${name}，再次点击撤销` : name;
      choices.append(control);
    }
    toolbar.append(choices);
  }
  toolbar.append(el('span',null,'toolbar-spacer'));
  if (decision.collapse) {
    const toggle=button(collapsed ? '展开' : '收起', () => keepReadingPosition(article,state,()=>{ collapsed ? shown.add(item.id) : shown.delete(item.id); render(article, state); }, true));
    toggle.dataset.action='expand';toggle.setAttribute('aria-expanded',String(!collapsed));toolbar.append(toggle);
  }
  const panel = disclosure(bar, toolbar);
  if (result?.scores) {
    const scores = el('dl', null, 'scores');
    for (const [key,name] of [['ai_written','AI 概率'],['low_value','低信息量'],['spam','引流']]) {
      const cell = el('div'); cell.append(el('dt',name),el('dd',`${Math.round(result.scores[key]*100)}%`)); scores.append(cell);
    }
    panel.append(scores);
  }
  if (item.kind === 'reply') {
    panel.append(el('p','机器人 / 真人：点击标注，再点撤销。标注用于后续判断，不会改写上方模型分数。','hint'));
  }
  const { section, actions } = actionSection(panel, `显示与账号 · @${item.handle}`);
  if (item.kind === 'reply') actions.append(button(collapsed ? '展开原文' : '折叠此条', () => {
    if (collapsed) { keepReadingPosition(article,state,()=>{shown.add(item.id); render(article,state);}, true); return; }
    return annotate(item,'feedback','hide');
  }, {glyph:collapsed ? icons.Eye : icons.EyeOff}));
  if(collapsed) actions.append(button('只保留此条',()=>annotate(item,'feedback','keep'),{glyph:icons.Eye}));
  actions.append(button('始终保留作者', () => send({ type: 'list', handle: item.handle, action: 'allow' }), {glyph:icons.ShieldCheck}));
  actions.append(button(isLocal ? '取消本地屏蔽' : '本地屏蔽作者', () => send({ type: 'list', handle: item.handle, action: isLocal ? 'remove' : 'block' }), {glyph:icons.UserRoundMinus}));
  actions.append(button('在 X 拉黑…', () => openXBlock(article, item), {glyph:icons.ExternalLink}));
  section.append(el('p','本地屏蔽仅影响此浏览器；X 拉黑需再次确认。','hint'));
  panel.append(el('p', `${result?.model ? `${result.model} · ${result.cached ? '缓存' : '本次判断'} · ` : ''}模型估计不代表作者身份`, 'meta'));
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
  const generation = epoch, fingerprint = state.fingerprint, version=state.version;
  try {
    const duplicateOnly = state.duplicate && settings.duplicates && settings.filterMode !== 'label' && !manual;
    const result = await send({ type: duplicateOnly ? 'local-decision' : 'classify', item: state.item });
    const current = extractArticle(article, location.href, conversation);
    if (generation !== epoch || states.get(article) !== state || state.version!==version || state.fingerprint !== fingerprint || current?.id !== state.item.id || current.text !== state.item.text || current.parent !== state.item.parent) return;
    if(result?.skipped==='changed') { state.started=false; intersection.unobserve(article); intersection.observe(article); return; }
    state.result = result;
  } catch (error) { if (generation === epoch && states.get(article) === state && state.version===version) state.error = error.message; }
  if (generation === epoch && state.version===version) render(article, state);
}
const intersection = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { const state = states.get(entry.target); if (state) void processArticle(entry.target, state); }
}, { rootMargin: '40px', threshold: 0.05 });
function scan() {
  scheduled = false;
  if (location.href !== lastUrl) { lastUrl = location.href; epoch++; for (const a of states.keys()) { intersection.unobserve(a); resetArticle(a); } seenText.clear(); shown.clear(); conversation = { replyIds: new Set(), otherIds: new Set(), parents: new Map() }; }
  for (const [article] of states) if (!article.isConnected) { intersection.unobserve(article); resetArticle(article); }
  if (!settings.enabled) return;
  for (const article of document.querySelectorAll(ARTICLE)) {
    const item = extractArticle(article, location.href, conversation); if (!item) continue;
    const rootId = location.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
    if (item.id === rootId) { conversation.rootId = rootId; conversation.parent = item.text; conversation.passedRoot = true; }
    if (item.kind === 'reply' && rootId) conversation.replyIds.add(item.id);
    if (item.kind === 'unknown' && conversation.passedRoot) conversation.otherIds.add(item.id);
    if (conversation.otherIds.size > 2000) conversation.otherIds.delete(conversation.otherIds.values().next().value);
    if (item.kind === 'reply' && item.parent) conversation.parents.set(item.id,item.parent);
    if (conversation.parents.size > 2000) conversation.parents.delete(conversation.parents.keys().next().value);
    if (conversation.replyIds.size > 2000) conversation.replyIds.delete(conversation.replyIds.values().next().value);
    const fingerprint = JSON.stringify([item.id, item.text, item.kind, item.parent]);
    const existing = states.get(article);
    if (existing?.fingerprint === fingerprint) { existing.item.displayName=item.displayName; if (existing.host && !existing.host.isConnected) render(article, existing); continue; }
    if (existing) { intersection.unobserve(article); resetArticle(article); }
    const key = item.kind === 'reply' ? duplicateKey(item.text) : '';
    const first = key && seenText.get(key);
    const state = { item, fingerprint, duplicate: Boolean(first && first !== item.id), started: false, result: null };
    if (key && !first) { seenText.set(key, item.id); if (seenText.size > 1000) seenText.delete(seenText.keys().next().value); }
    states.set(article, state); intersection.observe(article);
  }
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
  if (records.some(r => {
    const target=r.target.nodeType===1 ? r.target : r.target.parentElement;
    if (target?.closest('.qb-host')) return false;
    if (r.type==='characterData') return Boolean(target?.closest('[data-testid="tweetText"], [data-testid="User-Name"]'));
    if (r.type==='attributes') return Boolean(target?.closest(ARTICLE) && (target.matches('a[href*="/status/"]') || target.matches('time')));
    return [...r.addedNodes,...r.removedNodes].some(n=>!(n instanceof Element && n.matches('.qb-host')));
  })) schedule();
});
observer.observe(document.body, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['href','datetime'] });
async function refreshAnnotation(id) {
  for(const [article,state] of states) {
    if(state.item.id!==id) continue;
    const version=state.version=(state.version||0)+1, generation=epoch;
    try {
      const patch=await send({type:'local-decision',item:state.item});
      const current=extractArticle(article,location.href,conversation);
      if(generation!==epoch || states.get(article)!==state || state.version!==version || current?.id!==id || current.text!==state.item.text) continue;
      keepReadingPosition(article,state,()=>{
        const {override,learned,annotation,...previous}=state.result||{};
        state.result={...previous,...patch}; state.error=''; render(article,state);
      });
      if(!state.result.scores && !state.result.override) {
        state.started=false; intersection.unobserve(article); intersection.observe(article);
      }
    } catch { /* A failed notification must leave the current reading state intact. */ }
  }
}
chrome.runtime.onMessage.addListener(message => {
  if (message.type === 'refresh') void refresh();
  if (message.type === 'annotation-changed') void refreshAnnotation(message.id);
});
window.addEventListener('popstate', schedule);
// Also catches X's pushState navigation when no tweet has mounted yet.
setInterval(() => { if (location.href !== lastUrl) schedule(); }, 1000);
void refresh();
