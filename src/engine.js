import { mergeSettings, sameCredentialTarget, resolveConnection, connectionIdentity, connectionFields } from './connection.js';
import { normalizeSettings, validateItem, cacheKey, annotationKey, textKey, hotStatus, handleOf } from './core.js';
import { analyze, analyzeDecision } from './jev.js';
import { examplesFor } from './learning.js';
import { MemoryAnnotations } from './annotations.js';
import { accountRule, sameAccount, setAccountRule } from './account-rules.js';

const day = () => new Date().toLocaleDateString('en-CA');
const emptyStats = () => ({ day: day(), requests: 0, cacheHits: 0, inputTokens: 0, errors: 0 });
const CACHE_VERSION = 4;
const connectionSample = { id: '0', handle: 'connection_test', kind: 'reply', text: '我实际测试了三个例子，第二个需要补充上下文才能判断。', parent: '你测试这个方法时发现了什么？', metrics: {} };
export class Engine {
  constructor(storage, request = analyze, annotations = new MemoryAnnotations(), decisionRequest = analyzeDecision) {
    this.decisionRequest=decisionRequest;
    this.annotations=annotations;
    this.storage = storage; this.request = request; this.active = 0; this.queue = []; this.inflight = new Map(); this.revision = 0; this.cooldown = 0; this.writes = Promise.resolve(); this.mutations = Promise.resolve();
    this.ready = this.load();
  }
  async load() {
    const saved = (await this.storage.get('banbot')).banbot || {};
    await this.annotations.migrate(Array.isArray(saved.learning)?saved.learning:[]);
    this.annotationStats=await this.annotations.stats();
    const learning=await this.annotations.recent(40);
    const settings = normalizeSettings(saved.settings);
    // Upgrade all historical manual labels, not just the 40 few-shot examples.
    // The most recent explicit choice wins; old labels never reapply after restore.
    if (!saved.accountRulesVersion) {
      let before=null;
      do {
        const page=await this.annotations.page({before,limit:200});
        for(const row of page.items) if(!settings.accountRules.some(r=>sameAccount(r,row)))
          settings.accountRules=setAccountRule(settings.accountRules,row,row.label,row.key,row.at);
        before=page.next;
      } while(before);
    }
    if (!saved.dailyLimitVersion && saved.settings?.dailyLimit === 300) settings.dailyLimit=10000;
    if (!saved.thresholdVersion && saved.settings?.threshold === .9) settings.threshold=.5;
    this.data = { dailyLimitVersion:1, thresholdVersion:1, settings, apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : '', annotationRevision:this.annotationStats.revision, cache: saved.cacheVersion === CACHE_VERSION && saved.annotationRevision===this.annotationStats.revision ? saved.cache || {} : {}, cacheVersion: CACHE_VERSION, overrides: Object.fromEntries(Object.entries(saved.overrides||{}).filter(([,v])=>v.source!=='learning')), stats: saved.stats || emptyStats(), feedback: Array.isArray(saved.feedback) ? saved.feedback.slice(0, 100) : [], learning, connection: saved.connection || null, lastError: saved.lastError || '', lastModel: saved.lastModel || '' };
    this.data.accountRulesVersion=1;
    if(!saved.accountRulesVersion)await this.save();
  }
  save() {
    const {learning,...persistent}=this.data;
    const snapshot = structuredClone(persistent);
    const write = this.writes.then(() => this.storage.set({ banbot: snapshot }));
    this.writes = write.catch(() => {});
    return write;
  }
  resetDay() { if (this.data.stats.day !== day()) this.data.stats = emptyStats(); }
  async snapshot(admin = false) {
    await this.ready; this.resetDay();
    const value = { settings: this.data.settings, configured: Boolean(this.data.apiKey), stats: this.data.stats, connection: this.data.connection, learningCount: this.annotationStats.total, annotationStats:this.annotationStats, lastError: this.data.lastError, lastModel: this.data.lastModel, revision: this.revision };
    if(admin)value.activeOwners=[...new Set([...(this.activeOwners?.values()||[])].filter(Boolean))];
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
      const settings = normalizeSettings(mergeSettings(this.data.settings,patch));
      resolveConnection(settings);
      const key = typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim().replace(/^Bearer\s+/i, '') : sameCredentialTarget(settings,this.data.settings) ? this.data.apiKey : '';
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
  async syncAnnotations() {
    this.data.learning=await this.annotations.recent(40);
    this.annotationStats=await this.annotations.stats();
    this.data.annotationRevision=this.annotationStats.revision;
  }
  async annotationPage(options={}) {
    await this.ready;
    const label=['ai','human'].includes(options.label)?options.label:'all';
    const before=options.before && Number.isFinite(options.before.at) && typeof options.before.key==='string' ? options.before : null;
    const page=await this.annotations.page({label,before,limit:20});
    return {...page,counts:await this.annotations.stats()};
  }
  async authorPage(options={}) {
    await this.ready;
    const label=options.label==='human'?'human':'ai';
    const before=Number.isSafeInteger(options.before?.count)&&options.before.count>=1&&handleOf(options.before.handle) ? {count:options.before.count,handle:handleOf(options.before.handle)} : null;
    return this.annotations.authorPage({label,before,limit:20});
  }
  learn(input, label) {
    return this.mutate(async () => {
      const item = validateItem(input);
      if (item.kind !== 'reply' || !['ai','human',null].includes(label) || !item.text.trim()) throw new Error('请选择有效的回复标签');
      const key = (await this.annotations.post(item.id))?.key || await annotationKey(item);
      return this.changeAnnotation(key,item,label);
    });
  }
  async changeAnnotation(key,item,label) {
    const previous=await this.annotations.get(key);
    const before={settings:structuredClone(this.data.settings),learning:this.data.learning,overrides:structuredClone(this.data.overrides),cache:this.data.cache};
    if(label) {
      const modelKey=item.key===key&&previous?.modelKey?previous.modelKey:await cacheKey(item,this.data.settings);
      const textDigest=await textKey(item.text);
      const modelResult=this.data.cache[modelKey]?.result || Object.values(this.data.cache).find(c=>c.postId===item.id&&c.textDigest===textDigest)?.result || previous?.modelResult;
      const {observedReplies,...record}=item;
      await this.annotations.put({...record,text:item.text.slice(0,1000),parent:item.parent.slice(0,500),key,label,at:Date.now(),modelKey,modelResult});
      delete this.data.overrides[key];
    } else await this.annotations.remove(key);
    const s=this.data.settings;
    if(label) {
      s.accountRules=setAccountRule(s.accountRules,item,label,key);
      s.allowlist=s.allowlist.filter(h=>h!==item.handle);
      s.blocklist=s.blocklist.filter(h=>h!==item.handle);
    } else s.accountRules=s.accountRules.filter(r=>r.key!==key);
    this.data.cache={};this.revision++;
    try {await this.syncAnnotations();await this.save();}
    catch {
      if(previous)await this.annotations.put(previous);else await this.annotations.remove(key);
      Object.assign(this.data,before);await this.syncAnnotations();this.revision++;
      throw new Error('标注未保存，请重试');
    }
    return {learningCount:this.annotationStats.total,id:item.id,handle:item.handle};
  }
  editAnnotation(key,label) {
    return this.mutate(async()=>{
      if(typeof key!=='string'||!['ai','human',null].includes(label))throw new Error('请选择有效的标注');
      const item=await this.annotations.get(key);
      if(!item)throw new Error('这条标注已移除，请刷新列表');
      // Use its original key: archived text can be truncated for storage.
      return this.changeAnnotation(key,item,label);
    });
  }
  removeExample(key) {return this.editAnnotation(key,null);}
  async applySettings(settings, apiKey, forgetKey = false) {
    await this.ready;
    const next = normalizeSettings(mergeSettings(this.data.settings,settings));
    const changedProvider = !sameCredentialTarget(next,this.data.settings);
    const changedModel = JSON.stringify(connectionIdentity(next))!==JSON.stringify(connectionIdentity(this.data.settings));
    const key = typeof apiKey === 'string' ? apiKey.trim().replace(/^Bearer\s+/i, '') : '';
    if (key.length > 4096 || /[\r\n]/.test(key)) throw new Error('API Key 格式无效');
    const before = { settings: this.data.settings, apiKey: this.data.apiKey, connection: this.data.connection };
    this.data.settings = next;
    if (changedProvider || forgetKey) { this.data.apiKey = ''; this.data.connection = null; }
    if (changedModel || key && key !== this.data.apiKey) this.data.connection = null;
    if (key) this.data.apiKey = key;
    this.data.lastError = ''; this.revision++;
    try { await this.save(); } catch (error) { Object.assign(this.data, before); this.revision++; throw new Error('设置保存失败，请重试'); }
    return this.snapshot(true);
  }
  listAction(handle, action, userId='') {
    return this.mutate(() => {
    handle = handleOf(handle);
    if (!handle || !['allow', 'block', 'remove'].includes(action)) throw new Error('无效的账号操作');
    const s = this.data.settings;
    const allowlist = s.allowlist.filter(h => h !== handle), blocklist = s.blocklist.filter(h => h !== handle);
    const matching=s.accountRules.filter(r=>sameAccount(r,{handle,userId}));
    if (action === 'allow' && !matching.length) allowlist.push(handle);
    if (action === 'block' && !matching.length) blocklist.push(handle);
    const accountRules=s.accountRules.filter(r=>!matching.includes(r));
    if(action!=='remove')accountRules.push(...matching.map(r=>({...r,handle,label:action==='allow'?'human':'ai',key:'',at:Date.now()})));
    return this.applySettings({ allowlist, blocklist, accountRules });
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
    await this.ready; this.revision++; this.data.cache = {}; this.data.overrides = {}; this.data.feedback = []; this.data.learning = []; this.data.lastError = ''; await this.annotations.clear(); await this.syncAnnotations(); await this.save();
    return this.snapshot(true);
  }); }
  async localDecision(input, owner='') {
    await this.ready;
    const item = validateItem(input);
    const policy=accountRule(item,this.data.settings,owner);
    if(policy==='self')return {account:'self',override:'keep'};
    const key=await annotationKey(item), modelKey=await cacheKey(item,this.data.settings);
    let override = this.data.overrides[key] || this.data.overrides[modelKey];
    const sample=await this.annotations.get(key)||await this.annotations.post(item.id);
    // Backfill names from an already visible post; never fetch profiles or alter labels.
    if(sample&&(item.displayName&&sample.displayName!==item.displayName||item.author?.userId&&!sample.author?.userId))await this.mutate(()=>this.annotations.rememberName(sample.key,item.displayName||sample.displayName,item.author));
    if(policy)override={label:policy==='ai'?'hide':'keep',source:'learning'};
    return { ...(sample?.modelResult || {}),
      ...(policy ? {account:policy} : {}),
      ...(override ? {override:override.label,...(override.source==='learning'?{learned:true}:{})} : {}),
      ...(sample && policy ? {annotation:policy} : {}),
    };
  }
  async classify(input, manual = false, owner='') {
    await this.ready;
    const revision=this.revision;
    const item = validateItem(input), settings = structuredClone(this.data.settings);
    if(accountRule(item,settings,owner))return this.localDecision(item,owner);
    if(item.kind==='reply'){
      const history=await this.annotations.byAuthor(item);
      const distinct=[...new Map(history.map(r=>[r.id,r])).values()];
      settings.authorLabels={source:'your manual labels on other posts',identityCoverage:item.author?.userId?'matching stable user IDs; unverified legacy labels excluded':'handle only; account renames or reassignment are unknown',ai:distinct.filter(r=>r.label==='ai').length,human:distinct.filter(r=>r.label==='human').length,posts:distinct.length,sampleLimit:40};
      if(this.communityEvidence&&item.author?.userId)settings.communityLabels=await this.communityEvidence(item.author.userId).catch(()=>null);
    }
    if (!manual && !settings.enabled) return { skipped: 'disabled' };
    if (!manual && (settings.allowlist.includes(item.handle) || settings.blocklist.includes(item.handle))) return { local: true };
    const hot = item.kind === 'post' ? hotStatus(item, settings) : null;
    if (hot && hot.status !== 'forecast') return { hot };
    if (!item.text.trim()) return { skipped: 'no-text' };
    const key = await cacheKey(item, settings);
    const local = await this.localDecision(item);
    if (local.override) return local;
    const cached = this.data.cache[key];
    this.resetDay();
    if (!manual && cached && cached.expires > Date.now()) { this.data.stats.cacheHits++; await this.save(); return { ...cached.result, cached: true, hot }; }
    if (this.inflight.has(key)) return this.inflight.get(key);
    if (this.queue.length >= 24) throw new Error('待判断的帖子较多，请稍后重试');
    const promise = this.enqueue(async () => {
      if (revision !== this.revision) return { skipped: 'changed' };
      this.resetDay();
      if (Date.now() < this.cooldown) throw new Error('模型服务冷却中，稍后重试');
      if (!this.data.apiKey) throw new Error('请先在模型设置中保存 API Key');
      if (this.data.stats.requests >= settings.dailyLimit) throw new Error('已达到今日请求上限，可在设置中调整');
      const apiKey=this.data.apiKey;
      this.data.stats.requests++; await this.save();
      if (revision !== this.revision) return { skipped: 'changed' };
      try {
        const result = await this.request(item, { ...settings, examples: item.kind === 'reply' ? examplesFor(this.data.learning,item) : [] }, apiKey);
        if (revision !== this.revision) return { skipped: 'changed' };
        this.data.stats.inputTokens += result.inputTokens;
        this.data.lastError = ''; this.data.lastModel = result.model;
        this.data.cache[key] = { result, postId:item.id,textDigest:await textKey(item.text), expires: Date.now() + (item.kind === 'reply' ? 7 * 86400000 : 300000) };
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
  async evaluate(state,questions,namespace='workspace') {
    await this.ready;
    const settings=structuredClone(this.data.settings),revision=this.revision;
    const payload={model:connectionFields(settings).model,state,questions};
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([namespace,connectionIdentity(settings),payload])));
    const key='feature-'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
    const cached=this.data.cache[key];this.resetDay();
    if(cached?.expires>Date.now()){this.data.stats.cacheHits++;await this.save();return{...cached.result,cached:true};}
    if(this.inflight.has(key))return this.inflight.get(key);
    if(this.queue.length>=24)throw Error('待判断内容较多，请稍后重试。');
    const promise=this.enqueue(async()=>{
      if(revision!==this.revision)return{skipped:'changed'};
      this.resetDay();if(Date.now()<this.cooldown)throw Error('模型服务冷却中，稍后重试。');
      if(!this.data.apiKey)throw Error('请先在「连接」中保存模型密钥。');
      if(this.data.stats.requests>=settings.dailyLimit)throw Error('已达到今日请求上限，可在连接设置中调整。');
      const apiKey=this.data.apiKey;this.data.stats.requests++;await this.save();
      if(revision!==this.revision)return{skipped:'changed'};
      try{
        const result=await this.decisionRequest(payload,settings,apiKey);
        if(revision!==this.revision)return{skipped:'changed'};
        this.data.stats.inputTokens+=result.inputTokens||0;this.data.lastModel=result.model;this.data.lastError='';
        this.data.cache[key]={result,expires:Date.now()+900000};
        this.data.cache=Object.fromEntries(Object.entries(this.data.cache).filter(([,v])=>v.expires>Date.now()).sort((a,b)=>(b[1].result.analyzedAt||0)-(a[1].result.analyzedAt||0)).slice(0,1000));
        await this.save();return result;
      }catch(error){if([401,403,429].includes(error.status))this.cooldown=Date.now()+60000;this.data.stats.errors++;this.data.lastError=error.message;await this.save();throw error;}
    }).finally(()=>this.inflight.delete(key));this.inflight.set(key,promise);return promise;
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
