import { DEFAULTS, normalizeSettings, validateItem, cacheKey, hotStatus, handleOf } from './core.js';
import { analyze } from './jev.js';

const day = () => new Date().toLocaleDateString('en-CA');
const emptyStats = () => ({ day: day(), requests: 0, cacheHits: 0, inputTokens: 0, errors: 0 });
export class Engine {
  constructor(storage, request = analyze) {
    this.storage = storage; this.request = request; this.active = 0; this.queue = []; this.inflight = new Map(); this.revision = 0; this.cooldown = 0; this.writes = Promise.resolve(); this.mutations = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    const saved = (await this.storage.get('banbot')).banbot || {};
    this.data = { settings: normalizeSettings(saved.settings), apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '', cache: saved.cache || {}, overrides: saved.overrides || {}, stats: saved.stats || emptyStats(), feedback: Array.isArray(saved.feedback) ? saved.feedback.slice(0, 100) : [], lastError: saved.lastError || '', lastModel: saved.lastModel || '' };
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
    const value = { settings: this.data.settings, configured: Boolean(this.data.apiKey), stats: this.data.stats, lastError: this.data.lastError, lastModel: this.data.lastModel, revision: this.revision };
    if (admin) Object.assign(value, { feedback: this.data.feedback, cacheSize: Object.keys(this.data.cache).length });
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
  async applySettings(settings, apiKey, forgetKey = false) {
    await this.ready;
    const next = normalizeSettings({ ...this.data.settings, ...settings });
    const changedProvider = next.provider !== this.data.settings.provider;
    const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^Bearer\s+/i, '') : '';
    if (key.length > 4096 || /[\r\n]/.test(key)) throw new Error('API Key 格式无效');
    const before = { settings: this.data.settings, apiKey: this.data.apiKey };
    this.data.settings = next;
    if (changedProvider || forgetKey) this.data.apiKey = '';
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
  async feedback(itemInput, label) {
    await this.ready;
    const item = validateItem(itemInput);
    if (!['keep', 'hide'].includes(label)) throw new Error('无效反馈');
    const key = await cacheKey(item, this.data.settings);
    this.data.overrides[key] = { label, at: Date.now() };
    const entries = Object.entries(this.data.overrides).sort((a, b) => b[1].at - a[1].at).slice(0, 1000);
    this.data.overrides = Object.fromEntries(entries);
    this.data.feedback.unshift({ id: item.id, handle: item.handle, label, at: Date.now(), excerpt: item.text.slice(0, 140) });
    this.data.feedback = this.data.feedback.slice(0, 100);
    this.revision++; await this.save();
    return { ok: true };
  }
  async clearHistory() {
    await this.ready; this.revision++; this.data.cache = {}; this.data.overrides = {}; this.data.feedback = []; this.data.lastError = ''; await this.save();
    return this.snapshot(true);
  }
  async localDecision(input) {
    await this.ready;
    const key = await cacheKey(validateItem(input), this.data.settings);
    return this.data.overrides[key] ? { override: this.data.overrides[key].label } : {};
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
    const override = this.data.overrides[key];
    if (override) return { override: override.label };
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
        const result = await this.request(item, settings, this.data.apiKey);
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
