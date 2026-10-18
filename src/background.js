import { Engine } from './engine.js';
import { resolveConnection, mergeSettings } from './connection.js';
import { senderContext } from './context.js';
import { IndexedAnnotations } from './annotations.js';
import { Contacts } from './contacts.js';
import { Forecasts } from './forecasts.js';
const contacts = new Contacts();
const forecasts = new Forecasts();
const secure = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
const engine = new Engine({
  get: async key => { await secure; return chrome.storage.local.get(key); },
  set: async value => { await secure; return chrome.storage.local.set(value); },
}, undefined, new IndexedAnnotations());
async function broadcast(message = {type:'refresh'}) {
  const tabs = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'] });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, message)));
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  (async () => {
    const who = senderContext(sender, chrome.runtime);
    if (who === 'none' || !message || typeof message.type !== 'string') throw new Error('消息来源无效');
    if (message.type === 'snapshot') return engine.snapshot(who === 'admin');
    if (message.type === 'classify') return engine.classify(message.item,message.force===true);
    if (message.type === 'local-decision') return engine.localDecision(message.item);
    if (message.type === 'list') { const result = await engine.listAction(message.handle, message.action); await broadcast(); return result; }
    if (message.type === 'feedback') { const result = await engine.feedback(message.item, message.label); await broadcast({type:'annotation-changed',id:message.item.id}); return result; }
    if (message.type === 'learn') { const result = await engine.learn(message.item, message.label); await broadcast({type:'annotation-changed',id:message.item.id}); return result; }
    if (message.type === 'options') { if(['contacts','forecasts'].includes(message.page))await chrome.tabs.create({url:chrome.runtime.getURL('ui.html#'+message.page)});else await chrome.runtime.openOptionsPage(); return {}; }
    if(message.type==='forecast-watch'&&who==='content'){await contacts.observe(message.owner);return forecasts.watch(message.owner,message.item,message.result,message.target);}
    if(message.type==='forecast-observe'&&who==='content')return forecasts.observe(message.owner,message.items);
    if(message.type==='contacts-page')return contacts.page(message);
    if(message.type==='contacts-observe'&&who==='content')return contacts.observe(message.owner);
    if(message.type==='contacts-reply'&&who==='content'){if(!/^\d{1,25}$/.test(message.replyId||''))throw Error('缺少回复成功凭据');return contacts.put(message.owner,message.contact,{replyId:message.replyId});}
    if(message.type==='contacts-refresh'&&who==='content')return contacts.refresh(message.owner,message.items);
    if(message.type==='contacts-use')return contacts.use(message.owner,message.handle);
    if (who !== 'admin') throw new Error('只能在扩展设置中执行此操作');
    if(message.type==='forecast-page')return forecasts.page(message);
    if(message.type==='forecast-remove')return forecasts.remove(message.owner,message.id);
    if(message.type==='contacts-state')return contacts.state(message.owner);
    if(message.type==='contacts-save')return contacts.put(message.owner,message.contact);
    if(message.type==='contacts-configure')return contacts.configure(message.owner,message.automatic);
    if(message.type==='contacts-remove')return contacts.remove(message.owner,message.handle);
    if(message.type==='authors')return engine.authorPage(message);
    if(message.type==='annotations')return engine.annotationPage(message);
    if(message.type==='reveal-key'){await engine.ready;return {apiKey:engine.data.apiKey};}
    if (message.type === 'remove-example' || message.type==='edit-annotation') {
      const result=await engine.editAnnotation(message.key,message.type==='remove-example'?null:message.label);
      await broadcast({type:'annotation-changed',id:result.id});return result;
    }
    if (message.type === 'connect') {
      const connection = resolveConnection(mergeSettings((await engine.snapshot()).settings,message.settings));
      if (!await chrome.permissions.contains({ origins:[connection.origin] })) throw new Error('尚未授予模型服务访问权限');
      const result = await engine.connect(message.settings,message.apiKey); await broadcast(); return result;
    }
    if (message.type === 'save') {
      if (message.apiKey) throw new Error('请使用“连接并保存”验证新的模型密钥');
      const result = await engine.updateSettings(message.settings, message.apiKey, message.forgetKey); await broadcast(); return result;
    }
    if (message.type === 'test') return engine.classify(message.item, true);
    if (message.type === 'clear') { const result = await engine.clearHistory(); await broadcast(); return result; }
    throw new Error('未知操作');
  })().then(data => reply({ ok: true, data }), error => reply({ ok: false, error: error.message || '操作失败，请重试' }));
  return true;
});
