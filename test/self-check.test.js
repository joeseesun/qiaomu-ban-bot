import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { draftText, draftItem, draftSettings, formatSelfCheck, summaryLine, DRAFT_ID } from '../src/self-check.js';
import { buildRequest, validateItem, normalizeSettings } from '../src/core.js';
import { Engine } from '../src/engine.js';
const pause = ms => new Promise(r => setTimeout(r, ms));
const dom = html => new JSDOM(html, { url: 'https://x.com/home' }).window.document;

test('draft text joins Draft.js blocks and ignores zero-width placeholders', () => {
  const d = dom('<div id="e" contenteditable="true" data-testid="tweetTextarea_0"><div data-contents="true"><div data-block="true"><span>第一行 </span><span>@alice</span></div><div data-block="true"><span>\u200b</span></div><div data-block="true">第三行 </div></div></div>');
  assert.equal(draftText(d.getElementById('e')), '第一行 @alice\n\n第三行');
  assert.equal(draftText(dom('<div id="e" contenteditable="true">  plain  </div>').getElementById('e')), 'plain');
  assert.equal(draftText(null), '');
});

test('draft becomes a reply item that validates and builds the exact filter request', () => {
  const item = draftItem({ text: '  太真实了，说明护城河才是关键，你觉得呢？ ', parent: '这家公司今年利润涨了 35%，护城河在哪里？', handle: 'Me_Here', siblings: [{ id: '9', handle: 'me_here', text: 'own earlier reply' }] });
  assert.equal(item.id, DRAFT_ID); assert.equal(item.kind, 'reply'); assert.equal(item.handle, 'me_here');
  assert.equal(item.text, '太真实了，说明护城河才是关键，你觉得呢？');
  assert.deepEqual(item.thread.stockMoves, ['reaction', 'takeaway', 'engage']);
  assert.equal(item.thread.observedThreadReplies, 0, 'own replies are not siblings');
  const valid = validateItem(item);
  const request = buildRequest(valid, draftSettings({ customRule: '我的私人规则', wordRules: [{ term: 'x' }], allowlist: ['me_here'], examples: [{ text: 'x', label: 'ai' }] }));
  assert.equal(request.model, 'jev-latest');
  assert.equal(request.state.text, item.text); assert.equal(request.state.parent, item.parent);
  assert.deepEqual(Object.keys(request.questions), ['ai_written', 'useful', 'spam']);
  assert.equal(request.state.user_labelled_examples, undefined);
  assert.equal(request.state.evidence.author, null);
  assert.throws(() => draftItem({ text: '   ' }), /先写点内容/);
  assert.equal(draftItem({ text: 'hi' }).thread, null);
  assert.equal(draftItem({ text: 'hi', handle: 'bad handle!' }).handle, 'draft');
});

test('result formatting follows decide(): strict AI threshold, conservative promo cut, useful at 85%', () => {
  const item = draftItem({ text: '不是工具的问题，而是人。', parent: '工具不好用' });
  const fmt = (scores, s = {}) => formatSelfCheck(item, { model: 'jev-x', scores }, s);
  let v = fmt({ ai_written: .5, useful: .85, spam: .89 });
  assert.equal(v.ai, 50); assert.equal(v.aiOver, false, 'exactly at threshold stays visible');
  assert.equal(v.useful, true); assert.equal(v.promoOver, false); assert.equal(v.outcome, 'show');
  assert.match(summaryLine(v), /不会被折叠/);
  assert.ok(v.patterns.includes('「不是…而是」'));
  v = fmt({ ai_written: .51, useful: .2, spam: .1 });
  assert.equal(v.outcome, 'fold'); assert.equal(v.reason, '疑似 AI 回复'); assert.match(summaryLine(v), /会被折叠/);
  v = fmt({ ai_written: .51, useful: .2, spam: .1 }, { filterMode: 'label' });
  assert.equal(v.outcome, 'label');
  v = fmt({ ai_written: .4, useful: .2, spam: .9 }, { threshold: .35 });
  assert.equal(v.reason, '疑似引流推广'); assert.equal(v.threshold, 35);
});

test('thread-template prior lifts an AI-leaning draft exactly like aiScore', () => {
  const root = '报告说 72% 的团队已经在用 AI 写代码，效率提升 3 倍。';
  const siblings = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((h, i) => ({ id: String(i + 10), handle: h, text: '72% 的团队已经在用 AI，太真实了，说明工具才是护城河。' }));
  const item = draftItem({ text: '72% 的团队都在用 AI 写代码，太真实了，说明工程能力才是护城河，你身边呢？', parent: root, siblings, handle: 'me' });
  const v = formatSelfCheck(item, { model: 'm', scores: { ai_written: .4, useful: .1, spam: 0 } }, {});
  assert.ok(v.prior >= .4); assert.equal(v.boosted, true); assert.ok(v.ai > 40); assert.equal(v.modelAi, 40);
  assert.ok(v.patterns.includes('开头复述原帖'));
});

function engineWith(request, patch = {}) {
  let saved = { banbot: { apiKey: 'fixture', settings: { dailyLimit: 2, ...patch } } };
  const storage = { get: async () => structuredClone(saved), set: async d => { saved = structuredClone(d); } };
  return { engine: new Engine(storage, request), saved: () => saved };
}
test('engine self-check never caches drafts, strips personal context and respects the daily cap', async () => {
  const seen = [];
  const { engine, saved } = engineWith(async (item, s) => { seen.push({ item, s }); return { model: 'm', scores: { ai_written: .2, useful: .9, spam: 0 }, inputTokens: 5, analyzedAt: Date.now() }; }, { customRule: '隐藏广告' });
  const item = draftItem({ text: '我实际跑了 172 条，只有两条接近阈值。', parent: '你测过吗？' });
  const out = await engine.selfCheck(item);
  assert.equal(out.result.scores.useful, .9);
  await engine.selfCheck(item);
  assert.equal(seen.length, 2, 'identical drafts are re-scored, not cached');
  assert.deepEqual(saved().banbot.cache, {});
  assert.equal(seen[0].s.customRule, ''); assert.deepEqual(seen[0].s.examples, []);
  assert.equal(saved().banbot.stats.requests, 2);
  await assert.rejects(engine.selfCheck(item), /今日请求上限/);
  assert.equal(seen.length, 2);
});
test('engine self-check fails clearly without a key, when disabled, and cools down after auth errors', async () => {
  const noKey = new Engine({ get: async () => ({ banbot: { settings: {} } }), set: async () => {} }, async () => { throw Error('no'); });
  await assert.rejects(noKey.selfCheck(draftItem({ text: 'hi' })), /API Key/);
  const off = engineWith(async () => { throw Error('no'); }, { selfCheck: false }).engine;
  await assert.rejects(off.selfCheck(draftItem({ text: 'hi' })), /已关闭/);
  let calls = 0;
  const auth = engineWith(async () => { calls++; const e = Error('模型服务拒绝认证'); e.status = 401; throw e; }, { dailyLimit: 10 }).engine;
  await assert.rejects(auth.selfCheck(draftItem({ text: 'hi' })), /拒绝认证/);
  await assert.rejects(auth.selfCheck(draftItem({ text: 'hi' })), /冷却/);
  assert.equal(calls, 1);
  assert.equal(normalizeSettings({}).selfCheck, true); assert.equal(normalizeSettings({ selfCheck: false }).selfCheck, false);
});

const code = (await build({ entryPoints: ['src/self-check-content.js'], bundle: true, write: false, format: 'iife', target: 'chrome120' })).outputFiles[0].text;
test('content script adds a check button to reply modals, reads draft and replied post, never edits the draft', async () => {
  const html = `<a data-testid="AppTabBar_Profile_Link" href="/me"></a>
  <div role="dialog"><article data-testid="tweet"><a href="/bob"><img src="https://pbs.twimg.com/a.jpg"></a><div data-testid="User-Name"><a href="/bob">Bob</a></div><a href="/bob/status/123"><time datetime="2026-10-23T00:00:00Z"></time></a><div data-testid="tweetText">原帖：你们怎么看 AI 回复？</div></article>
  <section><div contenteditable="true" data-testid="tweetTextarea_0"><div data-contents="true"><div data-block="true"><span>我觉得要看上下文</span></div></div></div>
  <div data-testid="toolBar"><nav><div role="tablist"><button data-testid="gifSearchButton"><svg style="color:rgb(29,155,240)"></svg></button></div></nav><button data-testid="tweetButton">回复</button></div></section></div>`;
  const win = new JSDOM(html, { url: 'https://x.com/home', runScripts: 'outside-only', pretendToBeVisual: true }).window;
  const messages = [];
  win.chrome = { runtime: { onMessage: { addListener() {} }, sendMessage: async m => { messages.push(m); if (m.type === 'snapshot') return { ok: true, data: { settings: { enabled: true, selfCheck: true, threshold: .5 }, configured: true } }; return { ok: true, data: formatSelfCheck(m.item, { model: 'jev', scores: { ai_written: .12, useful: .9, spam: .02 } }, { threshold: .5 }) }; } } };
  try {
    win.eval(code); await pause(260);
    const d = win.document, host = d.querySelector('.qs-selfcheck-host');
    assert.ok(host, 'button injected'); assert.equal(host.parentElement, d.querySelector('[role="tablist"]'));
    host.shadowRoot.querySelector('.launch').click(); await pause(30);
    const req = messages.find(m => m.type === 'self-check');
    assert.equal(req.item.text, '我觉得要看上下文'); assert.equal(req.item.parent, '原帖：你们怎么看 AI 回复？'); assert.equal(req.item.handle, 'me');
    const panel = host.shadowRoot.querySelector('.panel').textContent;
    assert.match(panel, /不会被折叠/); assert.match(panel, /12%/); assert.match(panel, /是 · 90%/); assert.match(panel, /不会修改或阻止发送/);
    assert.equal(d.querySelector('[data-testid="tweetTextarea_0"]').textContent, '我觉得要看上下文');
  } finally { win.close(); }
});
test('content script stays out of the composer when the model is not connected or the toggle is off', async () => {
  for (const data of [{ settings: { enabled: true, selfCheck: true }, configured: false }, { settings: { enabled: true, selfCheck: false }, configured: true }]) {
    const win = new JSDOM('<section><div contenteditable="true" data-testid="tweetTextarea_0">x</div><div data-testid="toolBar"><nav></nav></div></section>', { url: 'https://x.com/home', runScripts: 'outside-only' }).window;
    win.chrome = { runtime: { onMessage: { addListener() {} }, sendMessage: async () => ({ ok: true, data }) } };
    try { win.eval(code); await pause(260); assert.equal(win.document.querySelector('.qs-selfcheck-host'), null); } finally { win.close(); }
  }
});
