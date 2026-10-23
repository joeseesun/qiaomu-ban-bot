// 发送前自检：在 X 回复 / 发帖编辑器的工具栏加一个「检测」按钮。只在用户点击时
// 读取当前草稿，经后台用同一套 Jev 请求打分；不改写草稿、不拦截发送、不保存草稿。
import { createElement, ScanText, X } from 'lucide';
import { EDITOR, currentOwner, articlePerson, composerScope } from './composer.js';
import { pageMutation } from './page-mutations.js';
import { draftText, draftItem, summaryLine } from './self-check.js';

const send = async m => { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw Error(r?.error || '扩展已更新，请刷新 X 页面'); return r.data; };
const errorText = e => /Extension context invalidated/i.test(e?.message || '') ? '插件已更新，请保存草稿后刷新页面。' : e?.message || '检测失败，请稍后重试。';
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const icon = i => createElement(i, { width: 16, height: 16, 'stroke-width': 1.7, 'aria-hidden': 'true' });
const css = `
:host{display:inline-flex;flex:none;align-self:center;width:var(--qs-size,36px);height:var(--qs-size,36px);color:var(--qs-accent,#1d9bf0);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
*{box-sizing:border-box}[hidden]{display:none!important}button{font:inherit;color:inherit;cursor:pointer}button:focus-visible{outline:1px solid #888;outline-offset:2px}
.launch{width:100%;height:100%;border:0;border-radius:50%;background:transparent;display:grid;place-items:center;padding:0;color:inherit;transition:background-color .2s}.launch:hover,.launch[aria-expanded=true]{background:color-mix(in srgb,currentColor 10%,transparent)}.launch[aria-busy=true]{opacity:.55;cursor:progress}.launch svg{width:var(--qs-icon,20px);height:var(--qs-icon,20px);stroke-width:2}
@media(prefers-reduced-motion:reduce){.launch{transition:none}}
.panel{position:fixed;inset:auto;margin:0;width:min(320px,calc(100vw - 24px));padding:12px 14px;background:var(--qs-bg,#fff);color:var(--qs-ink,#0f1419);border:1px solid var(--qs-line,#e5e5e5);border-radius:12px;box-shadow:0 8px 30px #0002;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
.head{display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:14px;margin-bottom:6px}.close{border:0;background:transparent;border-radius:50%;width:28px;height:28px;display:grid;place-items:center;padding:6px}.close:hover{background:var(--qs-hover,#f2f2f2)}
.summary{margin:0 0 8px;font-weight:600}.summary.warn{color:#b45309}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}dt{color:var(--qs-muted,#536471)}dd{margin:0;font-variant-numeric:tabular-nums;text-align:right}dd.warn{color:#b45309;font-weight:600}
.patterns{margin:8px 0 0;color:var(--qs-muted,#536471);font-size:12px}.note{margin:8px 0 0;color:var(--qs-muted,#536471);font-size:12px}.error{margin:0;color:#b45325}
`;
let settings = null, configured = false, scheduled = false;
const states = new Map();
async function refreshSettings() {
  try { const s = await send({ type: 'snapshot' }); settings = s.settings; configured = !!s.configured; } catch { settings = null; configured = false; }
  schedule();
}
const enabled = () => !!(settings?.enabled !== false && settings?.selfCheck && configured);
// The post being answered: a reply modal shows it as the first article in the
// dialog; an inline reply box answers the post in the /status/ URL.
function replyContext(editor) {
  const dialog = editor.closest('[role="dialog"]');
  if (dialog) {
    const article = dialog.querySelector('article[data-testid="tweet"]') || dialog.querySelector('article');
    const person = article && articlePerson(article);
    const text = person?.text || article?.querySelector('[data-testid="tweetText"]')?.textContent?.trim() || '';
    return { parent: text, siblings: [] };
  }
  const id = location.pathname.match(/^\/\w+\/status\/(\d+)/)?.[1];
  if (!id) return { parent: '', siblings: [] };
  const people = [...document.querySelectorAll('article[data-testid="tweet"]')].map(articlePerson).filter(Boolean);
  const root = people.find(p => p.id === id);
  return { parent: root?.text || '', siblings: people.filter(p => p.id !== id && p.text).map(p => ({ id: p.id, handle: p.handle, text: p.text.slice(0, 600) })) };
}
function render(state, view) {
  const { body } = state; body.replaceChildren();
  if (view.loading) { body.append(el('p', 'note', '正在检测…')); return; }
  if (view.error) { const p = el('p', 'error', view.error); p.setAttribute('role', 'alert'); body.append(p); return; }
  const v = view.result;
  body.append(el('p', 'summary' + (v.outcome !== 'show' ? ' warn' : ''), summaryLine(v)));
  const dl = el('dl');
  const row = (k, val, warn) => { dl.append(el('dt', null, k)); dl.append(el('dd', warn ? 'warn' : null, val)); };
  row('AI 估计', v.ai === null ? '—' : `${v.ai}%` + (v.boosted ? `（模型 ${v.modelAi}% + 套路加成）` : ''), v.aiOver);
  row('值得一读', v.value === null ? '—' : `${v.useful ? '是' : '否'} · ${v.value}%`);
  row('引流推广', v.promo === null ? '—' : `${v.promo}%`, v.promoOver);
  body.append(dl);
  body.append(el('p', 'patterns', v.patterns.length ? '命中套路：' + v.patterns.join('、') : '未命中回复农场套路句式'));
  const notes = [];
  if (!v.hasParent) notes.push('没找到回复对象，按无上下文判断。');
  if (view.stale) notes.push('草稿已修改，结果对应修改前的内容。');
  notes.push('仅供参考，不会修改或阻止发送。');
  body.append(el('p', 'note', notes.join(' ')));
}
function position(state) {
  const r = state.launch.getBoundingClientRect(), p = state.panel, w = p.offsetWidth, h = p.offsetHeight;
  const below = innerHeight - r.bottom - 12, down = h <= below || below >= r.top;
  p.style.left = Math.max(12, Math.min(r.left, innerWidth - w - 12)) + 'px';
  p.style.top = Math.max(12, down ? r.bottom + 6 : r.top - 6 - h) + 'px';
}
function setOpen(state, open) {
  const p = state.panel;
  if (open) { p.hidden = false; if (p.showPopover && !p.matches(':popover-open')) p.showPopover(); position(state); }
  else { if (p.hidePopover && p.matches(':popover-open')) p.hidePopover(); p.hidden = true; }
  state.launch.setAttribute('aria-expanded', String(open));
}
async function check(state) {
  if (state.busy) return;
  const text = draftText(state.editor);
  setOpen(state, true);
  if (!text) { render(state, { error: '先写点内容再检测。' }); position(state); return; }
  state.busy = true; state.launch.setAttribute('aria-busy', 'true'); const generation = ++state.generation;
  render(state, { loading: true });
  try {
    const { parent, siblings } = replyContext(state.editor);
    const item = draftItem({ text, parent, siblings, handle: currentOwner() });
    const result = await send({ type: 'self-check', item });
    if (generation !== state.generation) return;
    render(state, { result, stale: draftText(state.editor) !== text });
  } catch (e) { if (generation === state.generation) render(state, { error: errorText(e) }); }
  finally { state.busy = false; state.launch.removeAttribute('aria-busy'); if (state.panel.hidden === false) position(state); }
}
function setup(editor, scope) {
  const toolbar = scope.querySelector('[data-testid="toolBar"]'); if (!toolbar) return;
  const host = el('span', 'qs-selfcheck-host'); const root = host.attachShadow({ mode: 'open' });
  const style = el('style'); style.textContent = css;
  const launch = el('button', 'launch'); launch.type = 'button'; launch.title = '发送前自检'; launch.setAttribute('aria-label', '发送前自检：用 AI 回复判断检测这条草稿'); launch.setAttribute('aria-haspopup', 'dialog'); launch.setAttribute('aria-expanded', 'false'); launch.dataset.testid = 'qs-selfcheck';
  launch.append(icon(ScanText));
  const panel = el('section', 'panel'); panel.setAttribute('popover', 'manual'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '发送前自检'); panel.hidden = true;
  const head = el('div', 'head', '发送前自检'), close = el('button', 'close'); close.type = 'button'; close.setAttribute('aria-label', '关闭'); close.append(icon(X)); head.append(close);
  const body = el('div', 'body'); body.setAttribute('aria-live', 'polite');
  panel.append(head, body); root.append(style, launch, panel);
  const state = { editor, scope, toolbar, host, launch, panel, body, generation: 0, busy: false };
  const place = () => {
    const row = toolbar.querySelector('[data-testid="ScrollSnap-List"],[role="tablist"]') || toolbar.querySelector('nav');
    if (row) { if (host.parentElement !== row) row.append(host); } else if (host.parentElement !== toolbar) toolbar.insertBefore(host, toolbar.lastElementChild);
    const ref = toolbar.querySelector('[data-testid="gifSearchButton"],[data-testid="createPollButton"],[data-testid="scheduleOption"]');
    const glyph = ref?.querySelector('svg');
    if (glyph) { const c = getComputedStyle(glyph).color; if (c) host.style.setProperty('--qs-accent', c); }
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)') { host.style.setProperty('--qs-bg', bg); const dark = /rgb\((\d+), (\d+), (\d+)\)/.exec(bg); if (dark && (+dark[1] + +dark[2] + +dark[3]) < 200) { host.style.setProperty('--qs-ink', '#e7e9ea'); host.style.setProperty('--qs-line', '#2f3336'); host.style.setProperty('--qs-muted', '#8b98a5'); host.style.setProperty('--qs-hover', '#1d1f23'); } }
  };
  place(); state.place = place;
  launch.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!panel.hidden && !state.busy) { setOpen(state, false); return; } void check(state); });
  close.addEventListener('click', e => { e.stopPropagation(); setOpen(state, false); launch.focus(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { e.stopPropagation(); setOpen(state, false); launch.focus(); } });
  root.addEventListener('click', e => e.stopPropagation());
  state.dispose = () => { setOpen(state, false); host.remove(); };
  states.set(editor, state);
}
function scan() {
  scheduled = false;
  for (const [e, s] of states) if (!e.isConnected || !s.host.isConnected || !enabled()) { s.dispose(); states.delete(e); }
  if (!enabled()) return;
  for (const e of document.querySelectorAll(EDITOR)) { if (!states.has(e)) { const scope = composerScope(e); if (scope) setup(e, scope); } }
  for (const s of states.values()) s.place();
}
function schedule() { if (!scheduled) { scheduled = true; setTimeout(scan, 200); } }
new MutationObserver(records => { if (pageMutation(records, `${EDITOR},[data-testid="toolBar"],[role="dialog"]`)) schedule(); }).observe(document.body, { childList: true, subtree: true });
document.addEventListener('pointerdown', e => { for (const s of states.values()) if (!s.panel.hidden && !e.composedPath().includes(s.host)) setOpen(s, false); }, true);
addEventListener('scroll', () => { for (const s of states.values()) if (!s.panel.hidden) position(s); }, { passive: true });
chrome.runtime.onMessage.addListener(m => { if (m?.type === 'refresh') void refreshSettings(); });
void refreshSettings();
