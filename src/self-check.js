// Pre-send self-check: score the user's own reply draft with the same Jev
// request the reply filter uses. Pure helpers only; the content script owns the
// DOM and the service worker owns the API key. Nothing here sends, edits or
// blocks a post, and drafts are never cached or stored.
import { aiScore, normalizeSettings } from './core.js';
import { threadCues, farmPrior } from './thread.js';

// A draft has no X ID yet. '0' satisfies validateItem and can never collide
// with a real post ID in the 7-day decision cache (drafts skip that cache anyway).
export const DRAFT_ID = '0';
export const DRAFT_MAX = 4000;
export const MOVE_LABELS = {
  reaction: '套话表态', addendum: '「补一句」式开头', takeaway: '泛化结论', contrast: '「不是…而是」',
  persona: '人设 / 经历', engage: '结尾抛问题', dash: '破折号',
};

// Draft.js renders each paragraph as a [data-block] element; innerText would
// also pick up placeholder and decorator chrome in some layouts.
export function draftText(editor) {
  if (!editor) return '';
  const blocks = [...editor.querySelectorAll('[data-block="true"]')];
  const raw = blocks.length ? blocks.map(b => b.textContent).join('\n') : (editor.innerText ?? editor.textContent ?? '');
  return raw.replace(/\u200b/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
// The draft is shaped like a reply the filter would see on someone else's
// screen: no author evidence about yourself, no labels, no custom rule.
export function draftItem({ text, parent = '', handle = '', siblings = [] } = {}) {
  const body = clean(text, DRAFT_MAX);
  if (!body) throw Error('先写点内容再检测。');
  const own = /^\w{1,15}$/.test(handle || '') ? handle.toLowerCase() : 'draft';
  const context = clean(parent, 3000);
  const item = { id: DRAFT_ID, handle: own, kind: 'reply', text: body, parent: context, metrics: {} };
  item.thread = context ? threadCues({ id: DRAFT_ID, handle: own, text: body }, { text: context },
    (Array.isArray(siblings) ? siblings : []).filter(s => s && typeof s.text === 'string' && s.handle?.toLowerCase() !== own).slice(0, 300)) : null;
  return item;
}

// Settings for a viewer of this draft: the user's own provider/model/threshold,
// but none of their personal rules, labels or examples.
export function draftSettings(settings) {
  const s = normalizeSettings(settings);
  return { ...s, customRule: '', wordRules: [], allowlist: [], blocklist: [], accountRules: [], examples: [] };
}

const pct = n => typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : null;
export function formatSelfCheck(item, result, settings) {
  const s = normalizeSettings(settings);
  const scores = result?.scores || {};
  const final = aiScore(item, result);
  const threshold = s.threshold, conservative = Math.max(.9, threshold);
  const aiOver = typeof final === 'number' && final > threshold;
  const promoOver = typeof scores.spam === 'number' && scores.spam >= conservative;
  const useful = typeof scores.useful === 'number' && scores.useful >= .85;
  const t = item.thread;
  const patterns = [
    ...(t?.opensByRestatingRoot ? ['开头复述原帖'] : []),
    ...(t?.echoedRootFigures?.length ? [`沿用原帖数字 ${t.echoedRootFigures.join(' ')}`] : []),
    ...(t?.stockMoves || []).map(m => MOVE_LABELS[m] || m),
  ];
  const prior = farmPrior(t);
  return {
    ai: pct(final), modelAi: pct(scores.ai_written), boosted: typeof final === 'number' && final !== scores.ai_written,
    threshold: pct(threshold), aiOver, promo: pct(scores.spam), promoOver, value: pct(scores.useful), useful,
    // filterMode 'label' only labels; 'ai' folds. Either way the user decides whether to send.
    outcome: aiOver || promoOver ? (s.filterMode === 'ai' ? 'fold' : 'label') : 'show',
    reason: promoOver ? '疑似引流推广' : aiOver ? '疑似 AI 回复' : '',
    patterns, prior, hasParent: !!item.parent, model: typeof result?.model === 'string' ? result.model : '',
  };
}

export function summaryLine(v) {
  if (v.outcome === 'fold') return `按你的阈值（>${v.threshold}%）会被折叠：${v.reason}`;
  if (v.outcome === 'label') return `按你的阈值（>${v.threshold}%）会被标注：${v.reason}`;
  return `按你的阈值（>${v.threshold}%）不会被折叠`;
}
