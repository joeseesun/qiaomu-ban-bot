import { DEFAULTS, PROVIDERS, handleOf } from './core.js';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const demo = location.protocol !== 'chrome-extension:' && params.has('demo');
if (params.has('popup')) document.body.classList.add('popup');
let snapshot, demoState = { settings: { ...DEFAULTS, allowlist: ['vista8'], blocklist: [] }, configured: true, stats: { requests: 38, cacheHits: 126, inputTokens: 18420 }, feedback: [], learning:[], connection:{model:'jev-1.13.0',verifiedAt:Date.now()}, lastModel: 'jev-1.13.0', lastError: '' };
async function send(message) {
  if (demo) {
    $('demo-note').hidden = false;
    if (message.type === 'save') demoState.settings = { ...demoState.settings, ...message.settings };
    if (message.type === 'connect') { demoState.settings = { ...demoState.settings,...message.settings }; demoState.connection={model:'演示模型',verifiedAt:Date.now()};demoState.configured=true; }
    if (message.type === 'list') {
      const h = handleOf(message.handle); if (!h) throw new Error('请输入有效的 X 用户名');
      for (const k of ['allowlist', 'blocklist']) demoState.settings[k] = demoState.settings[k].filter(v => v !== h);
      if (message.action !== 'remove') demoState.settings[message.action === 'allow' ? 'allowlist' : 'blocklist'].push(h);
    }
    if (message.type === 'test') return { scores: { ai_written: .94, low_value: .89, useful: .08, spam: .02 }, model: '演示数据', cached: false };
    return structuredClone(demoState);
  }
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || '扩展未响应，请重新打开设置');
  return response.data;
}
function notice(text, error = false) { $('notice').textContent = text; $('notice').className = error ? 'error' : ''; $('notice').hidden = !text; }
function bind(id, fn) {
  $(id).addEventListener('click', async () => {
    const button = $(id); button.disabled = true; notice('');
    try { await fn(); } catch (error) { notice(error.message, true); } finally { button.disabled = false; }
  });
}
function tab(name) {
  if (!['overview', 'rules', 'accounts', 'model'].includes(name)) name = 'overview';
  for (const n of document.querySelectorAll('.panel')) n.hidden = n.id !== name;
  for (const n of document.querySelectorAll('nav button')) { n.classList.toggle('selected', n.dataset.tab === name); n.setAttribute('aria-current', n.dataset.tab === name ? 'page' : 'false'); }
  history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
}
for (const button of document.querySelectorAll('nav button')) button.addEventListener('click', async () => {
  tab(button.dataset.tab);
  if (button.dataset.tab === 'accounts') try { snapshot=await send({type:'snapshot'});renderAccounts(); } catch(error) { notice(error.message,true); }
});
function providerDetails() {
  const p = PROVIDERS[$('provider').value]; $('provider-details').textContent = `${p.model}\n${p.endpoint}`;
  if (snapshot && $('provider').value !== snapshot.settings.provider) { $('api-key').placeholder = '切换服务商后，请输入对应密钥'; $('key-status').textContent = '旧服务商密钥不会被发送给新服务商。'; }
}
function renderAccounts() {
  for (const kind of ['allowlist', 'blocklist']) {
    const container = $(kind); container.replaceChildren();
    if (!snapshot.settings[kind].length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = '还没有添加账号'; container.append(p); }
    for (const handle of snapshot.settings[kind]) {
      const row = document.createElement('div'); row.className = 'account-row';
      const name = document.createElement('span'); name.textContent = '@' + handle;
      const remove = document.createElement('button'); remove.className = 'quiet'; remove.textContent = '移除'; remove.setAttribute('aria-label', `移除 @${handle}`);
      remove.addEventListener('click', async () => { remove.disabled = true; try { snapshot = await send({ type: 'list', handle, action: 'remove' }); renderAccounts(); } catch (e) { notice(e.message, true); remove.disabled = false; } });
      row.append(name, remove); container.append(row);
    }
  }
  $('feedback').replaceChildren();
  for (const f of (snapshot.feedback || []).slice(0, 10)) {
    const row = document.createElement('div'); row.className = 'feedback-row';
    const title = document.createElement('span'); title.textContent = `@${f.handle} · ${f.label === 'keep' ? '保留' : '折叠'}`;
    const text = document.createElement('p'); text.textContent = f.excerpt;
    row.append(title, text); $('feedback').append(row);
  }
  if (!snapshot.feedback?.length) $('feedback').textContent = '暂无反馈';
  $('learning-count').textContent = `${snapshot.learning?.length || 0} / 40`;
  $('learning').replaceChildren();
  for (const e of snapshot.learning || []) {
    const row=document.createElement('div');row.className='feedback-row';
    const head=document.createElement('div');head.className='account-row';
    const title=document.createElement('b');title.textContent=e.label==='ai'?'你标记为 AI':'你标记为非 AI';
    const remove=document.createElement('button');remove.className='quiet';remove.textContent='删除样本';
    remove.addEventListener('click',async()=>{remove.disabled=true;try{snapshot=await send({type:'remove-example',key:e.key});renderAccounts();notice('样本已删除，后续判断不再参考它');}catch(error){notice(error.message,true);remove.disabled=false;}});
    const text=document.createElement('p');text.textContent=e.text;
    head.append(title,remove);row.append(head,text);$('learning').append(row);
  }
  if (!snapshot.learning?.length) $('learning').textContent='在回复下标记 AI 或非 AI，样本会出现在这里。';
}
function render() {
  const s = snapshot.settings;
  for (const k of ['enabled', 'radar', 'duplicates', 'highlightUseful']) $(k).checked = s[k];
  for (const k of ['customRule', 'hotViews', 'dailyLimit', 'provider']) $(k).value = s[k];
  $('threshold').value = Math.round(s.threshold * 100); $('threshold-value').value = `${Math.round(s.threshold * 100)}%`;
  document.querySelector(`input[name="filterMode"][value="${s.filterMode}"]`).checked = true;
  $('status-title').textContent = !s.enabled ? '已暂停自动判断' : snapshot.configured ? '为你的注意力把关' : '先连接你的 Jev';
  const mode = s.filterMode === 'label' ? '仅标记 · 不自动折叠' : `${s.filterMode === 'ai' ? '疑似 AI 自动折叠' : '低信息量自动折叠'} · 阈值 ${Math.round(s.threshold * 100)}%`;
  $('status-subtitle').textContent = !s.enabled ? '原文全部保留，随时可以继续' : snapshot.configured ? mode : '填入密钥，测试通过后自动生效';
  $('stat-requests').textContent = snapshot.stats.requests.toLocaleString(); $('stat-cache').textContent = snapshot.stats.cacheHits.toLocaleString(); $('stat-tokens').textContent = snapshot.stats.inputTokens >= 1000 ? `${(snapshot.stats.inputTokens / 1000).toFixed(1)}k` : snapshot.stats.inputTokens;
  $('model-state').textContent = !snapshot.configured ? '尚未连接模型' : snapshot.connection ? `连接已验证 · ${snapshot.connection.model}` : snapshot.lastModel || '模型已配置';
  $('api-key').value = ''; $('api-key').placeholder = snapshot.configured ? '已保存，留空继续使用' : '输入 API Key';
  $('key-status').textContent = snapshot.configured ? '已保存于本机，页面不会回显密钥。' : '密钥仅保存在本机扩展存储，不参与同步。';
  if (snapshot.lastError) notice(snapshot.lastError, true);
  providerDetails(); renderAccounts();
}
async function save(patch, apiKey, forgetKey = false) {
  snapshot = await send({ type: 'save', settings: patch, apiKey, forgetKey }); render();
}
for (const name of ['enabled', 'radar']) $(name).addEventListener('change', async () => {
  try { await save({ [name]: $(name).checked }); notice(name === 'enabled' ? '设置已保存，X 页面将同步更新' : '热帖雷达设置已保存'); } catch (e) { $(name).checked = snapshot.settings[name]; notice(e.message, true); }
});
$('threshold').addEventListener('input', () => { $('threshold-value').value = `${$('threshold').value}%`; });
$('provider').addEventListener('change', providerDetails);
bind('preview-expand', () => { $('preview-text').hidden = !$('preview-text').hidden; $('preview-expand').textContent = $('preview-text').hidden ? '展开' : '收起'; });
bind('open-options', () => demo ? tab('rules') : chrome.runtime.openOptionsPage());
bind('save-rules', async () => {
  if (!$('hotViews').reportValidity()) return;
  await save({ filterMode: document.querySelector('input[name="filterMode"]:checked').value, threshold: Number($('threshold').value) / 100, duplicates: $('duplicates').checked, highlightUseful: $('highlightUseful').checked, hotViews: Number($('hotViews').value), customRule: $('customRule').value }); notice('规则已保存，已打开的 X 页面会重新判断');
});
bind('save-model', async () => {
  if (!$('dailyLimit').reportValidity()) return;
  const provider = $('provider').value, apiKey = $('api-key').value.trim();
  if (!apiKey && (!snapshot.configured || provider !== snapshot.settings.provider)) throw new Error('请输入这个服务商的 API Key');
  $('save-model').textContent='正在测试连接…';
  for (const id of ['provider','api-key','dailyLimit','forget-key']) $(id).disabled=true;
  try {
    if (!demo && !await chrome.permissions.request({ origins: [PROVIDERS[provider].origin] })) throw new Error('未授予访问权限，配置尚未保存');
    notice('正在用内置样例测试 Jev，成功后自动保存…');
    snapshot=await send({type:'connect',settings:{provider,dailyLimit:Number($('dailyLimit').value)},apiKey});
    render();notice(`${demo?'演示：':''}连接测试通过，配置已保存。X 页面会自动开始判断。`);
  } finally {
    $('save-model').textContent='测试并保存';
    for (const id of ['provider','api-key','dailyLimit','forget-key']) $(id).disabled=false;
  }
});
bind('forget-key', async () => { await save({}, '', true); notice('密钥已移除'); });
bind('clear-history', async () => {
  if (!confirm('清空模型缓存、手动反馈和学习样本？账号名单与 API Key 会保留。')) return;
  snapshot = await send({ type: 'clear' }); render(); notice('记录和缓存已清空');
});
$('account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const handle = handleOf($('account-handle').value); if (!handle) return notice('请输入 1–15 位字母、数字或下划线组成的 X 用户名', true);
  try { snapshot = await send({ type: 'list', handle, action: event.submitter.value }); $('account-handle').value = ''; renderAccounts(); notice('账号名单已更新'); } catch (error) { notice(error.message, true); }
});
bind('test-model', async () => {
  const text = $('test-text').value.trim(); if (!text) throw new Error('先粘贴一条待判断的回复');
  $('test-result').hidden = false; $('test-result').textContent = '正在调用 Jev…';
  try {
    const result = await send({ type: 'test', item: { id: '0', handle: 'sandbox', kind: 'reply', text, parent: $('test-parent').value, metrics: {} } });
    if (!result.scores) throw new Error('设置已变化，请重新测试');
    $('test-result').replaceChildren();
    for (const [key, title] of Object.entries({ ai_written: '疑似 AI', low_value: '低信息量', useful: '有内容的回复', spam: '引流推广', rule_match: '自定义规则' })) if (key in result.scores) {
      const row = document.createElement('div'); row.className = 'score-row'; const label = document.createElement('span'); label.textContent = title; const value = document.createElement('b'); value.textContent = `${Math.round(result.scores[key] * 100)}%`; row.append(label, value); $('test-result').append(row);
    }
    const p = document.createElement('p'); p.className = 'hint'; p.textContent = `${result.model}${demo ? ' · 模拟判断' : result.cached ? ' · 缓存结果' : ' · 已收到实际判断'}。百分比是模型估计，不是准确率。`; $('test-result').append(p);
    snapshot = await send({ type: 'snapshot' });
    $('stat-requests').textContent = snapshot.stats.requests; $('model-state').textContent = snapshot.lastModel || result.model;
  } catch (e) { $('test-result').textContent = '未获得有效判断。'; throw e; }
});
send({ type: 'snapshot' }).then(data => { snapshot = data; render(); tab(location.hash.slice(1)); }, error => notice(error.message, true));
