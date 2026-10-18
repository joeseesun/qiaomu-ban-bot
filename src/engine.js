import { normalizeSettings, validateItem, cacheKey, annotationKey, hotStatus, handleOf } from './core.js';
import { analyze } from './jev.js';

const day = () => new Date().toLocaleDateString('en-CA');
const emptyStats = () => ({ day: day(), requests: 0, cacheHits: 0, inputTokens: 0, errors: 0 });
const CACHE_VERSION = 2;
const connectionSample = { id: '0', handle: 'connection_test', kind: 'reply', text: '我实际测试了三个例子，第二个需要补充上下文才能判断。', parent: '你测试这个方法时发现了什么？', metrics: {} };
function examplesFor(learning, item) {
  const tokens = text => new Set(text.toLowerCase().match(/[a-z]{2,}|[\p{Script=Han}]{2}/gu) || []);
  const target = tokens(item.text);
  const ranked = learning.filter(e => e.id !== item.id).map(e => ({ e, score: [...tokens(e.text)].filter(t => target.has(t)).length })).sort((a,b) => b.score-a.score || b.e.at-a.e.at);
  // Up to three positive and three negative examples, bounded independently of history size.
  return ['ai','human'].flatMap(label => ranked.filter(v => v.e.label === label).slice(0,3).map(({e}) => ({ text:e.text.slice(0,400), parent:e.parent.slice(0,200), label:e.label })));
}
export class Engine {
  constructor(storage, request = analyze) {
    this.storage = storage; this.request = request; this.active = 0; this.queue = []; this.inflight = new Map(); this.revision = 0; this.cooldown = 0; this.writes = Promise.resolve(); this.mutations = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    const saved = (await this.storage.get('banbot')).banbot || {};
    this.data = { settings: normalizeSettings(saved.settings), apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '', cache: saved.cacheVersion === CACHE_VERSION ? saved.cache || {} : {}, cacheVersion: CACHE_VERSION, overrides: saved.overrides || {}, stats: saved.stats || emptyStats(), feedback: Array.isArray(saved.feedback) ? saved.feedback.slice(0, 100) : [], learning: Array.isArray(saved.learning) ? saved.learning.slice(0,40) : [], connection: saved.connection || null, lastError: saved.lastError || '', lastModel: saved.lastModel || '' };
  }
  save() {
    const snapshot = structuredClone(this.data);
    const write = this.writes.then(() => this.storage.set({ banbot: snapshot }));
    this.writes = write.catch(() => {});
    return write;
  }
  resetDay() { if (this.data.stats.day !== day()) this.data.stats = emptyStats(); }
  async snapshot(admin = false) {
    await this.ready; this.resetDay();
    const value = { settings: this.data.settings, configured: Boolean(this.data.apiKey), stats: this.data.stats, connection: this.data.connection, learningCount: this.data.learning.length, lastError: this.data.lastError, lastModel: this.data.lastModel, revision: this.revision };
    if (admin) Object.assign(value, { feedback: this.data.feedback, learning: this.data.learning, cacheSize: Object.keys(this.data.cache).length });
    return structuredClone(value);
  }
  mutate(fn) {
    const operation = this.mutations.then(() => this.ready).then(fn);
    this.mutations = operation.catch(() => {});
    return operation;
  }
  updateSettings(settings, apiKey, forgetKey = false) {
    return this.mutate(() => this.applySettings(settings, apiKey, forgetKey));
  }
  connect(patch, apiKey) {
    return this.mutate(async () => {
      const settings = normalizeSettings({ ...this.data.settings, ...patch });
      const key = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim().replace(/^Bearer\s+/i, '') : settings.provider === this.data.settings.provider ? this.data.apiKey : '';
      if (!key || key.length > 4096 || /[\r\n]/.test(key)) throw new Error('请输入有效的模型 API Key');
      const result = await this.enqueue(async () => {
        this.resetDay();
        if (this.data.stats.requests >= settings.dailyLimit) throw new Error('已达到今日请求上限，请提高上限后再测试');
        this.data.stats.requests++; await this.save();
        try { return await this.request(connectionSample, { ...settings, customRule: '' }, key); }
        catch (error) { this.data.stats.errors++; await this.save(); throw error; }
      });
      // The production adapter rejects incomplete responses. No successful state is
      // persisted until a complete model decision has actually returned.
      if (!result?.scores || !result.model) throw new Error('未获得有效模型判断，原配置已保留');
      const before = { settings: this.data.settings, apiKey: this.data.apiKey, connection: this.data.connection, lastModel: this.data.lastModel };
      Object.assign(this.data, { settings, apiKey:key, connection:{ verifiedAt:Date.now(), model:result.model, provider:settings.provider }, lastModel:result.model, lastError:'' });
      this.data.stats.inputTokens += result.inputTokens || 0; this.revision++; this.cooldown = 0;
      try { await this.save(); } catch { Object.assign(this.data,before); this.revision++; throw new Error('连接测试通过，但保存失败，请重试'); }
      return this.snapshot(true);
    });
  }
  learn(input, label) {
    return this.mutate(async () => {
      const item = validateItem(input);
      if (item.kind !== 'reply' || !['ai','human'].includes(label) || !item.text.trim()) throw new Error('请选择有效的回复标签');
      const key = await annotationKey(item);
      const before = {learning:this.data.learning, overrides:structuredClone(this.data.overrides), cache:this.data.cache};
      const entry = { ...item, text:item.text.slice(0,1000), parent:item.parent.slice(0,500), key, label, at:Date.now() };
      const all = [entry,...this.data.learning.filter(e=>e.key!==key)];
      this.data.learning = all.slice(0,40);
      for (const e of all.slice(40)) if (this.data.overrides[e.key]?.source==='learning') delete this.data.overrides[e.key];
      this.data.overrides[key] = { label:label==='ai'?'hide':'keep', source:'learning', at:Date.now() };
      this.data.overrides = Object.fromEntries(Object.entries(this.data.overrides).sort((a,b)=>b[1].at-a[1].at).slice(0,1000));
      this.data.cache = {}; this.revision++;
      try { await this.save(); } catch { Object.assign(this.data,before); this.revision++; throw new Error('标记保存失败，请重试'); }
      return {learningCount:this.data.learning.length};
    });
  }
  removeExample(key) {
    return this.mutate(async () => {
      if (typeof key !== 'string' || !this.data.learning.some(e=>e.key===key)) throw new Error('找不到这条学习样本');
      const before = {learning:this.data.learning, overrides:structuredClone(this.data.overrides), cache:this.data.cache};
      this.data.learning = this.data.learning.filter(e=>e.key!==key);
      if (this.data.overrides[key]?.source==='learning') delete this.data.overrides[key];
      this.data.cache={}; this.revision++;
      try { await this.save(); } catch { Object.assign(this.data,before); this.revision++; throw new Error('样本删除失败，请重试'); }
      return this.snapshot(true);
    });
  }
  async applySettings(settings, apiKey, forgetKey = false) {
    await this.ready;
    const next = normalizeSettings({ ...this.data.settings, ...settings });
    const changedProvider = next.provider !== this.data.settings.provider;
    const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^Bearer\s+/i, '') : '';
    if (key.length > 4096 || /[\r\n]/.test(key)) throw new Error('API Key 格式无效');
    const before = { settings: this.data.settings, apiKey: this.data.apiKey, connection: this.data.connection };
    this.data.settings = next;
    if (changedProvider || forgetKey) { this.data.apiKey = ''; this.data.connection = null; }
    if (key && key !== this.data.apiKey) this.data.connection = null;
    if (key) this.data.apiKey = key;
    this.data.lastError = ''; this.revision++;
    try { await this.save(); } catch (error) { Object.assign(this.data, before); this.revision++; throw new Error('设置保存失败，请重试'); }
    return this.snapshot(true);
  }
  listAction(handle, action) {
    return this.mutate(() => {
    handle = handleOf(handle);
    if (!handle || !['allow', 'block', 'remove'].includes(action)) throw new Error('无效的账号操作');
    const s = this.data.settings;
    const allowlist = s.allowlist.filter(h => h !== handle), blocklist = s.blocklist.filter(h => h !== handle);
    if (action === 'allow') allowlist.push(handle);
    if (action === 'block') blocklist.push(handle);
    return this.applySettings({ allowlist, blocklist });
    });
  }
  feedback(itemInput, label) { return this.mutate(async () => {
    await this.ready;
    const item = validateItem(itemInput);
    if (!['keep', 'hide'].includes(label)) throw new Error('无效反馈');
    const key = await annotationKey(item);
    this.data.overrides[key] = { label, at: Date.now() };
    const entries = Object.entries(this.data.overrides).sort((a, b) => b[1].at - a[1].at).slice(0, 1000);
    this.data.overrides = Object.fromEntries(entries);
    this.data.feedback.unshift({ id: item.id, handle: item.handle, label, at: Date.now(), excerpt: item.text.slice(0, 140) });
    this.data.feedback = this.data.feedback.slice(0, 100);
    this.revision++; await this.save();
    return { ok: true };
  }); }
  clearHistory() { return this.mutate(async () => {
    await this.ready; this.revision++; this.data.cache = {}; this.data.overrides = {}; this.data.feedback = []; this.data.learning = []; this.data.lastError = ''; await this.save();
    return this.snapshot(true);
  }); }
  async localDecision(input) {
    await this.ready;
    const item = validateItem(input);
    const override = this.data.overrides[await annotationKey(item)] || this.data.overrides[await cacheKey(item,this.data.settings)];
    return override ? { override:override.label, ...(override.source==='learning'?{learned:true}:{}) } : {};
  }
  async classify(input, manual = false) {
    await this.ready;
    const item = validateItem(input), settings = structuredClone(this.data.settings);
    if (!manual && !settings.enabled) return { skipped: 'disabled' };
    if (!manual && (settings.allowlist.includes(item.handle) || settings.blocklist.includes(item.handle))) return { local: true };
    const hot = item.kind === 'post' ? hotStatus(item, settings) : null;
    if (hot && hot.status !== 'forecast') return { hot };
    if (!item.text.trim()) return { skipped: 'no-text' };
    const key = await cacheKey(item, settings);
    const override = this.data.overrides[await annotationKey(item)] || this.data.overrides[key];
    if (override) return { override: override.label, ...(override.source==='learning'?{learned:true}:{}) };
    const cached = this.data.cache[key];
    this.resetDay();
    if (cached && cached.expires > Date.now()) { this.data.stats.cacheHits++; await this.save(); return { ...cached.result, cached: true, hot }; }
    if (this.inflight.has(key)) return this.inflight.get(key);
    if (this.queue.length >= 24) throw new Error('待判断的帖子较多，请稍后重试');
    const revision = this.revision;
    const promise = this.enqueue(async () => {
      if (revision !== this.revision) return { skipped: 'changed' };
      this.resetDay();
      if (Date.now() < this.cooldown) throw new Error('模型服务冷却中，稍后重试');
      if (!this.data.apiKey) throw new Error('请先在模型设置中保存 API Key');
      if (this.data.stats.requests >= settings.dailyLimit) throw new Error('已达到今日请求上限，可在设置中调整');
      this.data.stats.requests++; await this.save();
      try {
        const result = await this.request(item, { ...settings, examples: item.kind === 'reply' ? examplesFor(this.data.learning,item) : [] }, this.data.apiKey);
        if (revision !== this.revision) return { skipped: 'changed' };
        this.data.stats.inputTokens += result.inputTokens;
        this.data.lastError = ''; this.data.lastModel = result.model;
        this.data.cache[key] = { result, expires: Date.now() + (item.kind === 'reply' ? 7 * 86400000 : 300000) };
        this.data.cache = Object.fromEntries(Object.entries(this.data.cache).filter(([, c]) => c.expires > Date.now()).sort((a, b) => b[1].result.analyzedAt - a[1].result.analyzedAt).slice(0, 1000));
        await this.save();
        return { ...result, hot };
      } catch (error) {
        if (error.status === 429) this.cooldown = Date.now() + 60000;
        if ([401, 403].includes(error.status)) this.cooldown = Date.now() + 60000;
        this.data.stats.errors++; this.data.lastError = error.message; await this.save(); throw error;
      }
    }).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
  enqueue(fn) {
    return new Promise((resolve, reject) => { this.queue.push({ fn, resolve, reject }); this.pump(); });
  }
  pump() {
    while (this.active < 3 && this.queue.length) {
      const job = this.queue.shift(); this.active++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { this.active--; this.pump(); });
    }
  }
}
