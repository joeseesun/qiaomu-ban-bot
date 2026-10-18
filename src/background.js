import { Engine } from './engine.js';
import { PROVIDERS } from './core.js';
import { senderContext } from './context.js';
const secure = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const engine = new Engine({
  get: async key => { await secure; return chrome.storage.local.get(key); },
  set: async value => { await secure; return chrome.storage.local.set(value); },
});
async function broadcast() {
  const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'] });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'refresh' })));
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    const who = senderContext(sender, chrome.runtime);
    if (who === 'none' || !message || typeof message.type !== 'string') throw new Error('消息来源无效');
    if (message.type === 'snapshot') return engine.snapshot(who === 'admin');
    if (message.type === 'classify') return engine.classify(message.item);
    if (message.type === 'local-decision') return engine.localDecision(message.item);
    if (message.type === 'list') { const result = await engine.listAction(message.handle, message.action); await broadcast(); return result; }
    if (message.type === 'feedback') { const result = await engine.feedback(message.item, message.label); await broadcast(); return result; }
    if (message.type === 'options') { await chrome.runtime.openOptionsPage(); return {}; }
    if (who !== 'admin') throw new Error('只能在扩展设置中执行此操作');
    if (message.type === 'save') {
      const provider = PROVIDERS[message.settings?.provider ?? (await engine.snapshot()).settings.provider];
      if (!provider) throw new Error('无效的模型服务');
      if (message.apiKey && !await chrome.permissions.contains({ origins: [provider.origin] })) throw new Error('尚未授予模型服务访问权限');
      const result = await engine.updateSettings(message.settings, message.apiKey, message.forgetKey); await broadcast(); return result;
    }
    if (message.type === 'test') return engine.classify(message.item, true);
    if (message.type === 'clear') { const result = await engine.clearHistory(); await broadcast(); return result; }
    throw new Error('未知操作');
  })().then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message || '操作失败，请重试' }));
  return true;
});
