import { DEFAULTS, decide, duplicateKey, aiScore } from './core.js';
import { threadCues, farmPrior } from './thread.js';
import { ARTICLE, extractArticle } from './dom.js';
import { CSS, icons, icon } from './content-ui.js';
import { tip } from './tooltip.js';
import { skeleton } from './spam.js';
import { MomentumTracker, compactRate } from './momentum.js';
import { bookmarkPath } from './bookmarks.js';
import { ruleMatches } from './rules.js';
const send = async message => { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw new Error(r?.error || '扩展连接中断，请刷新 X 页面'); return r.data; };
let settings = DEFAULTS, configured = false, epoch = 0, lastUrl = location.href, scheduled = false;
let conversation = { replyIds: new Set(), otherIds: new Set(), parents: new Map(), texts: new Map() };
const states = new Map(), shown = new Set(), seenText = new Map();
const momentum = new MomentumTracker();
// Reply skeleton (text without emoji) -> authors. Lure accounts post one
// template and rotate the emoji, so exact duplicate detection misses them.
const templates = new Map();
function el(tag, text, className) { const n = document.createElement(tag); if (text) n.textContent = text; if (className) n.className = className; return n; }
function button(text, run, { glyph, iconOnly = false, className = '' } = {}) {
  const b = el('button', iconOnly ? null : text, className); b.type = 'button';
  if (glyph) b.prepend(icon(glyph));
  if (iconOnly) { b.classList.add('icon-button'); b.setAttribute('aria-label', text); tip(b, text); }
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
function disclosure(bar, toolbar, label = '判断与操作', { glyph = icons.ChevronDown, text = '', className = '', popover = false } = {}) {
  const panel = el('section', null, 'panel'); panel.id = 'qb-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', label);
  // Inline triggers sit inside X's action row, which clips overflow. A top-layer
  // popover keeps the menu above X's own layers without reflowing the reply.
  const pop = popover && typeof panel.showPopover === 'function';
  if (pop) { panel.setAttribute('popover', 'auto'); panel.classList.add('pop'); }
  const toggle = button(label, () => setOpen(panel.hidden), { glyph, iconOnly:true, className:`disclosure ${className}`.trim() });
  if (text) toggle.append(el('span', text, 'trigger-text'));
  const place = () => {
    // Open toward the roomier side and never cover the trigger itself.
    panel.style.maxHeight = '';
    const r = toggle.getBoundingClientRect(), w = panel.offsetWidth, h = panel.offsetHeight;
    const below = innerHeight - r.bottom - 16, above = r.top - 16, down = h <= below || below >= above;
    const room = down ? below : above;
    if (h > room) panel.style.maxHeight = Math.max(160, room) + 'px';
    const height = Math.min(h, Math.max(160, room));
    panel.style.left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) + 'px';
    panel.style.top = (down ? r.bottom + 4 : r.top - 4 - height) + 'px';
  };
  const dismiss = () => setOpen(false);
  function setOpen(open) {
    if (pop) {
      if (open) { panel.hidden = false; if (!panel.matches(':popover-open')) panel.showPopover(); place(); addEventListener('scroll', dismiss, { passive:true, once:true }); }
      else if (panel.matches(':popover-open')) panel.hidePopover();
    }
    panel.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
    if (!open) removeEventListener('scroll', dismiss);
  }
  if (pop) panel.addEventListener('toggle', e => { if (e.newState === 'closed' && !panel.hidden) setOpen(false); });
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', panel.id);
  const escape = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); toggle.focus(); } };
  toggle.addEventListener('keydown', escape); panel.addEventListener('keydown', escape);
  panel.open = () => setOpen(true);
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
  // Replies have a native body column to the right of the avatar. Mount there
  // so the annotation row aligns with the text at every avatar/viewport size.
  const text=[...article.querySelectorAll('[data-testid="tweetText"]')].find(n=>n.closest(ARTICLE)===article&&!n.closest('[data-testid="quoteTweet"],div[role="link"][tabindex="0"]'));
  let column=text?.parentElement;
  while(column&&column!==native&&!column.querySelector('[role="group"]'))column=column.parentElement;
  if(!column||!native.contains(column))column=native;
  // render() may have placed the host in the native action row or on the
  // folded article; it decides the final slot, so do not bounce it here.
  const placed = host.parentElement && host.parentElement !== article && article.contains(host.parentElement);
  if (!placed) column.append(host);
  return host;
}
// X's action row: reply · repost · like · views · [bookmark share]. Extension
// controls join it as peers before the bookmark cluster, so no extra row.
function actionGroup(article) {
  return [...article.querySelectorAll('[role="group"]')].find(g => g.closest(ARTICLE) === article && !g.closest('[data-testid="quoteTweet"]'));
}
// Replies leave the avatar column empty below the picture. The estimate sits
// there, beside the name, without competing with X's action row.
function avatarColumn(article) {
  const own = n => n.closest(ARTICLE) === article && !n.closest('[data-testid="quoteTweet"]');
  const avatar = [...article.querySelectorAll('[data-testid="Tweet-User-Avatar"]')].find(own);
  const text = [...article.querySelectorAll('[data-testid="tweetText"]')].find(own);
  if (!avatar || !text) return null;
  let node = avatar;
  while (node.parentElement && node.parentElement !== article && !node.parentElement.contains(text)) node = node.parentElement;
  // A focal reply uses a full-width horizontal header containing the avatar,
  // name and menu. A 100%-wide host there squeezes the author's name to zero.
  // Only a dedicated avatar column is eligible; otherwise use the action row.
  if (node.querySelector('[data-testid="User-Name"], [role="group"]')) return null;
  return node !== avatar && node.parentElement?.contains(text) && !node.contains(text) ? node : null;
}
function mountInline(group, host) {
  const own = n => n.matches('.qb-host, .qx-interest-host');
  const bookmark = [...group.children].find(n => !own(n) && n.querySelector('[data-testid="bookmark"], [data-testid="removeBookmark"]'));
  const before = group.querySelector(':scope > .qx-interest-host') || bookmark || null;
  if (host.parentElement !== group || host.nextElementSibling !== before) group.insertBefore(host, before);
}
function resetArticle(article) { restore(article); states.get(article)?.hotHost?.remove(); states.get(article)?.host?.remove(); states.delete(article); }
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
  state.hotHost?.remove(); state.hotHost=null;
  const isLocal = settings.blocklist.includes(item.handle) && !settings.allowlist.includes(item.handle) || ruleMatches(item,settings).length>0;
  restore(article);
  if (!settings.enabled || (!isLocal && (item.kind === 'unknown' || (item.kind === 'post' && !settings.radar)))) { state.host?.remove(); return; }
  const host = hostFor(article); if (!host) return;
  const root = host.shadowRoot;
  const detailsOpen=root.querySelector('.panel')?.hidden===false;
  root.replaceChildren();
  const style = el('style'); style.textContent = CSS; root.append(style);
  const background = getComputedStyle(document.body).backgroundColor;
  const rgb = background.match(/\d+/g)?.slice(0, 3).map(Number);
  const dark = rgb && rgb.reduce((a, b) => a + b, 0) < 350;
  // Borrow X's own secondary/primary text colors so the controls read as native.
  const nativeGrey = article.querySelector('time') && getComputedStyle(article.querySelector('time')).color;
  const nativeInk = article.querySelector('[data-testid="tweetText"]') && getComputedStyle(article.querySelector('[data-testid="tweetText"]')).color;
  host.style.setProperty('--qb-bg', dark ? '#16181c' : '#f7f9f9');
  host.style.setProperty('--qb-text', nativeGrey || (dark ? '#71767b' : '#536471'));
  host.style.setProperty('--qb-strong', nativeInk || (dark ? '#e7e9ea' : '#0f1419'));
  host.style.setProperty('--qb-button', rgb && background !== 'rgba(0, 0, 0, 0)' ? background : dark ? '#000' : '#fff');
  host.style.setProperty('--qb-border', dark ? '#2f3336' : '#eff3f4');
  host.style.setProperty('--qb-amber', dark ? '#e9bd7c' : '#8a5300');
  host.style.setProperty('--qb-amber-bg', dark ? '#e9bd7c1f' : '#fff4e0');
  const bar = el('div', null, 'bar'), toolbar = el('div', null, 'toolbar'); bar.append(toolbar); root.append(bar);
  if (state.error && item.kind==='post') {
    toolbar.append(el('span', state.error, 'label muted'));
    toolbar.append(button('重试', () => { state.error = ''; state.started = false; return processArticle(article, state, true); })); return;
  }
  if (item.kind === 'post' && !isLocal) {
    if (!settings.radar) return;
    const measured=momentum.observe(item),speed=measured.recentViewsPerHour??measured.viewsPerHour;
    const label=compactRate(speed);
    toolbar.append(el('span',`传播表现 · ${label}`,'label prob'));
    const details=disclosure(bar,toolbar,'传播表现详情');
    details.classList.add('momentum-panel');
    details.append(el('h3','传播表现','momentum-title'));
    details.append(el('p',measured.percentile==null?'暂无足够对比':`同龄参考分 · ${measured.percentile}/100`,'momentum-verdict'));
    const velocity=el('div',null,'momentum-speed');
    velocity.append(el('strong',speed==null?'暂无法计算':label),el('span',measured.recentViewsPerHour!=null?`近 ${measured.windowMinutes} 分钟新增 ${measured.recentViews.toLocaleString()} 次浏览`:'发布以来平均浏览速度'));
    details.append(velocity);
    const metrics=el('dl',null,'scores');
    for(const[key,name]of[['views','浏览'],['reposts','转发'],['replies','评论'],['likes','赞']]){
      const cell=el('div'),n=measured.metrics[key],rate=measured.rates[key];
      cell.append(el('dt',name),el('dd',n==null?'—':n.toLocaleString()));
      if(rate!=null)cell.append(el('small',`${(rate*100).toFixed(2)}%`));metrics.append(cell);
    }
    details.append(metrics);
    const explanation=el('details',null,'momentum-help');explanation.append(el('summary','数据说明'));
    explanation.append(el('p',`本次浏览有 ${measured.peerCount} 条同龄参考；至少 20 条且互动数据足够时才比较。按速度与互动率的相对位置计算，不是爆款概率。`));
    explanation.append(el('p',measured.status==='insufficient'?'满 10 分钟且页面提供浏览数后可计算速度。':'相隔至少 5 分钟再次观察此帖，可显示最近增长。'));
    explanation.append(el('p','互动百分比以浏览数为分母；浏览并非人数，参考范围仅限本次浏览。'));
    details.append(explanation,button('更新数据',()=>processArticle(article,state,true)));
    const time=[...article.querySelectorAll('time')].find(t=>t.closest('a')?.getAttribute('href')?.match(new RegExp(`/status/${item.id}(?:$|[/?])`))&&t.closest(ARTICLE)===article&&!t.closest('[data-testid="quoteTweet"]'));
    const anchor=time?.closest('a');
    // Inline timeline headers have a timestamp. Detail pages keep their native
    // full date below the post; there the compact footer remains the fallback.
    if(anchor?.closest('[data-testid="User-Name"]')){
      const badge=el('span',null,'qb-hot-host');badge.attachShadow({mode:'open'});badge.style.cssText='display:inline-flex;flex:none;align-self:center;margin-left:6px;line-height:1';
      for(const prop of ['bg','text','strong','button','border'])badge.style.setProperty('--qb-'+prop,host.style.getPropertyValue('--qb-'+prop));
      const style=el('style');style.textContent=CSS+`:host{font:12px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;color:${dark?'#a1a1a1':'#65717d'}}.hot-toggle{display:inline-flex;min-height:20px;align-items:center;gap:3px;padding:2px 3px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;cursor:pointer;white-space:nowrap}.hot-toggle:hover{background:#8882}.hot-toggle svg{width:13px;height:13px;flex:none}.forecast-pop{position:fixed;inset:auto;width:min(350px,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;margin:0;padding:0;background:var(--qb-button);color:var(--qb-text);border:1px solid var(--qb-border);border-radius:8px;box-shadow:0 8px 30px #0002}.forecast-pop .panel{border:0;margin:0;padding:16px;background:transparent}.forecast-pop .muted{line-height:1.7}`;
      const hasPopover=typeof bar.showPopover==='function';
      const setOpen=open=>{state.hotOpen=open;details.hidden=!open;hotButton.setAttribute('aria-expanded',String(open));
        if(hasPopover){bar.hidden=false;if(open){bar.showPopover();const r=hotButton.getBoundingClientRect(),box=bar.getBoundingClientRect();bar.style.left=Math.max(12,Math.min(r.left,innerWidth-box.width-12))+'px';bar.style.top=Math.max(12,Math.min(r.bottom+8,innerHeight-box.height-12))+'px';}else bar.hidePopover();}else bar.hidden=!open;
      };
      const hotButton=button('',()=>setOpen(!state.hotOpen),{glyph:icons.Flame,className:'hot-toggle'});
      hotButton.title='传播表现';hotButton.setAttribute('aria-label',`传播表现 ${label}，查看详情`);hotButton.setAttribute('aria-expanded',String(!!state.hotOpen));
      hotButton.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);}};
      badge.shadowRoot.append(style,hotButton);badge.addEventListener('click',e=>e.stopPropagation());anchor.after(badge);state.hotHost=badge;
      toolbar.hidden=true;
      if(hasPopover){bar.classList.add('forecast-pop');bar.setAttribute('popover','auto');badge.shadowRoot.append(bar);bar.addEventListener('toggle',()=>{if(state.hotHost!==badge)return;state.hotOpen=bar.matches(':popover-open');hotButton.setAttribute('aria-expanded',String(state.hotOpen));});}
      setOpen(!!state.hotOpen);
    }
    return;
  }
  // Replies from accounts you follow show nothing unless you acted on them.
  if (item.kind === 'reply' && item.author?.youFollow === true && !result?.override && !result?.annotation && !isLocal) { host.remove(); return; }
  let decision = decide(item, result, settings);
  if (result?.override) decision = { collapse: result.override === 'hide', label: result.learned ? result.override === 'hide' ? '已标注 AI' : '已标注真人' : result.override === 'hide' ? '你已选择折叠此条' : '你已保留此条' };
  if (!decision.collapse && !result?.override && state.duplicate && settings.duplicates && settings.filterMode !== 'label' && !settings.allowlist.includes(item.handle)) decision = { collapse: true, label: '与已读回复文字重复' };
  const expanded = shown.has(item.id);
  const collapsed = decision.collapse && !expanded;
  const reopened = expanded && decision.collapse;
  const hasScore = typeof result?.scores?.ai_written === 'number';
  const percent = hasScore ? Math.round(aiScore(item, result) * 100) : null;
  const high = hasScore && aiScore(item, result) > settings.threshold;
  const side = !collapsed && !reopened && item.kind === 'reply' && avatarColumn(article);
  const group = !collapsed && !reopened && !side && actionGroup(article);
  if (collapsed) { article.append(host); article.setAttribute('data-qb-collapsed', ''); bar.classList.add('folded'); host.dataset.qbPlace = 'fold'; }
  else if (reopened) { host.parentElement.prepend(host); bar.classList.add('expanded'); host.dataset.qbPlace = 'top'; }
  else if (side) { if (host.parentElement !== side) side.append(host); bar.classList.add('side'); host.dataset.qbPlace = 'avatar'; }
  else if (group) { mountInline(group, host); bar.classList.add('inline'); host.dataset.qbPlace = 'inline'; }
  else host.dataset.qbPlace = 'column';
  const reason = decision.label || (high ? `AI 估计 ${percent}%` : '');
  let panel;
  if (collapsed || reopened) {
    // A hidden reply is one quiet line, like X's own "this post is hidden".
    if (collapsed) toolbar.append(icon(icons.EyeOff));
    const line = el('span', null, 'label');
    line.append(el('b', collapsed ? '已隐藏' : `已展开 · @${item.handle}`));
    if (reason) line.append(document.createTextNode(` · ${reason}`));
    if (collapsed) line.append(el('span', ` · @${item.handle}`, 'handle'));
    toolbar.append(line);
    const toggle = button(collapsed ? '展开' : '收起', () => keepReadingPosition(article,state,()=>{ collapsed ? shown.add(item.id) : shown.delete(item.id); render(article, state); }, true), { className:'link' });
    toggle.dataset.action = 'expand'; toggle.setAttribute('aria-expanded', String(!collapsed)); toolbar.append(toggle);
    panel = disclosure(bar, toolbar, '判断与操作', { glyph:icons.Ellipsis, popover:true });
  } else {
    // One trigger. Beside the avatar it always shows the estimate (amber when
    // high); in the action row fallback, only a high estimate shows a number.
    const marked = result?.annotation === 'ai' ? 'AI' : result?.annotation === 'human' ? '真人' : '';
    const glyph = marked === '真人' ? icons.UserRoundCheck : icons.Bot;
    // Once you mark a reply human, the model's number is no longer shown.
    const human = marked === '真人';
    panel = disclosure(bar, toolbar, '判断与操作', { glyph, text: !human && hasScore && (side || high) ? `${percent}%` : '', className: `trigger${high && !human ? ' high' : ''}${marked ? ' marked' : ''}`, popover:true });
    const trigger = toolbar.querySelector('.disclosure');
    tip(trigger, human ? '你标为真人 · 再点可撤销' : hasScore ? `AI 写作估计 ${percent}%${marked ? ` · 你标为${marked}` : ''} · 模型估计，不能证明作者身份` : '判断与操作');
  }
  const head = el('div', null, 'pop-head');
  const markedHuman = result?.annotation === 'human';
  head.append(el('strong', markedHuman ? '你标为真人' : hasScore ? `AI 写作估计 ${percent}%` : '尚无模型评分', high && !markedHuman ? 'warn' : ''));
  const status = result?.annotation || result?.override ? decision.label : '';
  if (markedHuman) head.append(el('small', [status, '不再显示 AI 估计，撤销标注后恢复'].filter(Boolean).join(' · ')));
  else head.append(el('small', [status, hasScore ? (result?.annotation ? '标注前的模型估计；人工标注不改写这个分数' : '模型估计，不能证明作者身份') : ''].filter(Boolean).join(' · ')));

  panel.append(head);
  if(!configured)panel.append(button('连接 Jev，开启文本判断',()=>send({type:'options'})));
  if(state.error)panel.append(detailLine(state.error),button('重试判断',()=>{state.error='';state.started=false;return processArticle(article,state,true);}));
  if (result?.scores && !markedHuman) {
    const scores = el('dl', null, 'scores');
    for (const [key,name] of [['ai_written','AI 概率'],['spam','引流']]) {
      const cell = el('div'); cell.append(el('dt',name),el('dd',`${Math.round((key==='ai_written'?aiScore(item,result):result.scores[key])*100)}%`)); scores.append(cell);
    }
    panel.append(scores);
  }
  if (item.kind === 'reply') {
    const choices=el('div',null,'annotation'); choices.setAttribute('role','group'); choices.setAttribute('aria-label','人工标注');
    for(const [value,name,glyph] of [['ai','标记 AI',icons.Bot],['human','标记真人',icons.UserRoundCheck]]) {
      const selected=result?.annotation===value;
      const control=button(name,()=>annotate(item,'learn',selected?null:value),{glyph});
      control.setAttribute('aria-label',name);
      control.dataset.label=value; control.setAttribute('aria-pressed',String(selected));
      choices.append(control);
    }
    panel.append(el('p','你的判断（只记在本机，再点撤销）','hint'),choices);
  }
  const { section, actions } = actionSection(panel, `显示与账号 · @${item.handle}`);
  if (item.kind === 'reply') actions.append(button(collapsed ? '展开原文' : '隐藏这条回复', () => {
    if (collapsed) { keepReadingPosition(article,state,()=>{shown.add(item.id); render(article,state);}, true); return; }
    return annotate(item,'feedback','hide');
  }, {glyph:collapsed ? icons.Eye : icons.EyeOff}));
  if(collapsed) actions.append(button('只保留此条',()=>annotate(item,'feedback','keep'),{glyph:icons.Eye}));
  actions.append(button('始终显示此作者', () => send({ type: 'list', handle: item.handle, action: 'allow' }), {glyph:icons.ShieldCheck}));
  actions.append(button(isLocal ? '取消本地屏蔽' : '本地屏蔽作者', () => send({ type: 'list', handle: item.handle, action: isLocal ? 'remove' : 'block' }), {glyph:icons.UserRoundMinus}));
  actions.append(button('在 X 拉黑…', () => openXBlock(article, item), {glyph:icons.UserRoundX}));
  section.append(el('p','单条回复不能证明账号是机器人。本地屏蔽只影响此浏览器；X 拉黑需在 X 里再次确认。','hint'));
  panel.append(el('p', `${result?.model ? `${result.model} · ${result.cached ? '缓存' : '本次判断'}` : '尚未调用模型'}`, 'meta'));
  if (detailsOpen) panel.open();
}
async function processArticle(article, state, manual = false) {
  if (bookmarkPath(location.pathname)) return;
  if (state.started && !manual) return;
  if (manual) {
    const latest = extractArticle(article, location.href, conversation);
    if (!latest || latest.id !== state.item.id) return;
    state.item = { ...latest, kind: state.item.kind };
  }
  if (state.item.kind === 'unknown') { render(article, state); return; }
  if (!settings.enabled || (state.item.kind === 'post' && !settings.radar)) { render(article, state); return; }
  if (state.item.kind==='post' && !ruleMatches(state.item,settings).length) { state.started=true;render(article,state);return; }
  if(!configured){state.started=true;try{state.result=await send({type:'local-decision',item:state.item});}catch{}render(article,state);return;}
  if(ruleMatches(state.item,settings).some(r=>r.action==='fold')){state.started=true;state.result=await send({type:'local-decision',item:state.item}).catch(()=>null);render(article,state);return;}
  if (settings.allowlist.includes(state.item.handle) || settings.blocklist.includes(state.item.handle)) { render(article, state); return; }
  // Someone you follow is trusted: no model call, no estimate, no auto-hide.
  if (state.item.kind === 'reply' && state.item.author?.youFollow === true && !state.result?.override) { render(article, state); return; }
  if (state.item.kind === 'reply') state.item.thread = cuesFor(state.item);
  state.started = true; state.error = ''; render(article, state);
  const generation = epoch, fingerprint = state.fingerprint, version=state.version;
  try {
    const duplicateOnly = state.duplicate && settings.duplicates && settings.filterMode !== 'label' && !manual;
    const result = await send({ type: duplicateOnly ? 'local-decision' : 'classify', item: state.item, force:manual });
    const current = extractArticle(article, location.href, conversation);
    if (generation !== epoch || states.get(article) !== state || state.version!==version || state.fingerprint !== fingerprint || current?.id !== state.item.id || current.text !== state.item.text || current.parent !== state.item.parent) return;
    if(result?.skipped==='changed') { state.started=false; intersection.unobserve(article); intersection.observe(article); return; }
    state.result = result;
  } catch (error) { if (generation === epoch && states.get(article) === state && state.version===version) state.error = error.message; }
  if (generation === epoch && state.version===version) render(article, state);
}
// Replies loaded in this conversation, so a reply can be compared with how
// other authors answered the same root post.
function cuesFor(item) {
  if (!conversation.parent || item.kind !== 'reply') return null;
  return threadCues(item, { text: conversation.parent }, [...conversation.texts.values()]);
}
// A reply judged before its siblings loaded is judged once more when the
// thread later shows a reply-farm pattern around it.
function recheckThread(article, state) {
  if (state.threadRechecked || state.item.kind !== 'reply' || !state.result?.scores || state.result.override) return;
  if (farmPrior(state.item.thread) >= .4 || farmPrior(cuesFor(state.item)) < .4) return;
  state.threadRechecked = true; state.started = false; intersection.unobserve(article); intersection.observe(article);
}
const intersection = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { const state = states.get(entry.target); if (state) void processArticle(entry.target, state); }
}, { rootMargin: '40px', threshold: 0.05 });
function scan() {
  scheduled = false;
  if (location.href !== lastUrl) { lastUrl = location.href; epoch++; for (const a of states.keys()) { intersection.unobserve(a); resetArticle(a); } seenText.clear(); shown.clear(); templates.clear(); conversation = { replyIds: new Set(), otherIds: new Set(), parents: new Map(), texts: new Map() }; }
  for (const [article] of states) if (!article.isConnected) { intersection.unobserve(article); resetArticle(article); }
  if (!settings.enabled || bookmarkPath(location.pathname)) return;
  for (const article of document.querySelectorAll(ARTICLE)) {
    const item = extractArticle(article, location.href, conversation); if (!item) continue;
    const sk = item.kind === 'reply' ? skeleton(item.text) : '';
    if (sk.length >= 8) {
      const authors = templates.get(sk) || new Set(); authors.add(item.handle); templates.set(sk, authors);
      if (templates.size > 1000) templates.delete(templates.keys().next().value);
      item.templateTwins = authors.size - 1;
    }
    const rootId = location.pathname.match(/^\/[^/]+\/status\/(\d+)/)?.[1];
    if (item.id === rootId) { conversation.rootId = rootId; conversation.parent = item.text; conversation.passedRoot = true; }
    if (item.kind === 'reply' && rootId) conversation.replyIds.add(item.id);
    if (item.kind === 'unknown' && conversation.passedRoot) conversation.otherIds.add(item.id);
    if (conversation.otherIds.size > 2000) conversation.otherIds.delete(conversation.otherIds.values().next().value);
    if (item.kind === 'reply' && item.parent) conversation.parents.set(item.id,item.parent);
    if (item.kind === 'reply' && rootId && item.text) conversation.texts.set(item.id,{ id:item.id, handle:item.handle, text:item.text.slice(0,600) });
    if (conversation.texts.size > 300) conversation.texts.delete(conversation.texts.keys().next().value);
    if (conversation.parents.size > 2000) conversation.parents.delete(conversation.parents.keys().next().value);
    if (conversation.replyIds.size > 2000) conversation.replyIds.delete(conversation.replyIds.values().next().value);
    const fingerprint = JSON.stringify([item.id, item.text, item.kind, item.parent,item.author?.userId,item.directParent?.id,item.root?.id]);
    const existing = states.get(article);
    if (existing?.fingerprint === fingerprint) {
      const changed=JSON.stringify(existing.item.metrics)!==JSON.stringify(item.metrics);
      existing.item={...existing.item,...item};
      if (changed&&item.kind==='post'||(existing.host&&!existing.host.isConnected)||(existing.hotHost&&!existing.hotHost.isConnected)) render(article,existing);
      recheckThread(article,existing);continue;
    }
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
    if (target?.closest('.qb-host, .qb-hot-host')) return false;
    if (r.type==='characterData') return Boolean(target?.closest('[data-testid="tweetText"], [data-testid="User-Name"]'));
    if (r.type==='attributes') return Boolean(target?.closest(ARTICLE) && (target.matches('a[href*="/status/"]') || target.matches('time')));
    return [...r.addedNodes,...r.removedNodes].some(n=>!(n instanceof Element && n.matches('.qb-host, .qb-hot-host')));
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
window.addEventListener('qx-evidence-updated', schedule);
// Also catches X's pushState navigation when no tweet has mounted yet.
setInterval(() => { if (location.href !== lastUrl) schedule(); }, 1000);
void refresh();
