import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {backupFile,parseBackup,backupSummary,mergeBackup,restoreBackup,WRITING_KEY,IMAGE_KEY,WEB_KEY,UNSPLASH_KEY} from '../src/backup.js';
import {IndexedAnnotations} from '../src/annotations.js';
import {Engine} from '../src/engine.js';
import {normalizeSettings} from '../src/core.js';
const row={id:'123',key:'original-key',kind:'reply',handle:'alice',text:'具体体验',label:'human',at:123,author:{userId:'888'}};
const data={settings:normalizeSettings({accountRules:[{handle:'alice',userId:'888',label:'human',key:row.key,at:123}]}),apiKey:'test-judgment-secret',connection:null};
const storage={
 [WRITING_KEY]:{providers:[{id:'p',name:'Example',baseUrl:'https://models.example/v1/chat/completions',apiKey:'test-writing-secret',oauth:{access:'test-access-secret',refresh:'test-refresh-secret'}}],models:[{id:'m',name:'Flash',providerId:'p',providerModelId:'deepseek-flash',enabled:true}],interpreterModel:'m'},
 [IMAGE_KEY]:{models:[{id:'i',name:'Images',sourceId:'custom',engine:'api',model:'image',models:['image'],baseUrl:'https://images.example/v1',apiKey:'test-image-secret'}],defaultId:'i'}
};
test('backup whitelists models and manual data, omits keys by default and always excludes OAuth sessions',()=>{
 const plain=backupFile(data,storage,[{...row,oauth:'never-export',modelResult:{apiKey:'never-export'}}]);
 assert.ok(!JSON.stringify(plain).includes('secret'));assert.ok(!JSON.stringify(plain).includes('never-export'));
 assert.equal(plain.writing.models[0].providerModelId,'deepseek-flash');assert.equal(plain.annotations[0].author.userId,'888');
 const full=backupFile(data,storage,[row],true),text=JSON.stringify(full);
 for(const k of ['test-judgment-secret','test-writing-secret','test-image-secret'])assert.ok(text.includes(k));
 assert.ok(!text.includes('test-access-secret'));assert.ok(!text.includes('test-refresh-secret'));
 assert.equal(backupSummary(parseBackup(full)).includesKeys,true);
 assert.throws(()=>parseBackup({...full,version:9}),/版本/);
 assert.throws(()=>parseBackup({...full,annotations:[{...row,id:'not-a-post'}]}));
 full.writing.providers[0].baseUrl='https://user:secret@models.example';assert.throws(()=>parseBackup(full),/地址/);
});
test('merge preserves existing credentials and rules; colliding provider IDs never redirect imported model keys',()=>{
 const incoming=parseBackup(backupFile(data,storage,[row],true));
 const local={settings:normalizeSettings({threshold:.7,accountRules:[{...data.settings.accountRules[0],label:'ai'}]}),apiKey:'current-key',connection:{verifiedAt:1}};
 const localStorage={[WRITING_KEY]:{providers:[{id:'p',baseUrl:'https://other.example',apiKey:'keep-key'}],models:[]}};
 const merged=mergeBackup(local,localStorage,incoming);
 assert.equal(merged.settings.threshold,.7);assert.equal(merged.settings.accountRules[0].label,'ai');assert.equal(merged.apiKey,'current-key');assert.equal(merged.connection.verifiedAt,1);
 assert.equal(merged.writing.providers[0].apiKey,'keep-key');assert.equal(merged.writing.models.length,0);
 assert.equal(mergeBackup(local,localStorage,incoming,true).settings.threshold,.5);
});
test('full backup restores models and 205 annotations, survives restart, skips duplicates and makes zero model calls',async()=>{
 let saved={},calls=0;const factory=new IDBFactory(),labels=new IndexedAnnotations(factory,IDBKeyRange,'backup');
 const adapter={get:async()=>structuredClone(saved),set:async v=>{Object.assign(saved,structuredClone(v));}};
 const engine=new Engine(adapter,async()=>{calls++;throw Error('unexpected model call');},labels);await engine.ready;
 const rows=Array.from({length:205},(_,i)=>({...row,id:String(1000+i),key:'backup-'+i}));
 const file=backupFile(data,storage,rows,true);
 const restored=await restoreBackup(engine,file);assert.equal(restored.added,205);assert.equal((await labels.stats()).total,205);assert.equal(calls,0);
 assert.equal(saved[WRITING_KEY].models[0].id,'m');assert.equal(saved[IMAGE_KEY].defaultId,'i');assert.equal(saved.banbot.apiKey,'test-judgment-secret');assert.equal(saved.banbot.connection,null);
 assert.equal((await restoreBackup(engine,file)).added,0);
 const reboot=new Engine(adapter,async()=>{calls++;},new IndexedAnnotations(factory,IDBKeyRange,'backup'));await reboot.ready;
 assert.equal((await reboot.classify({...row,id:'999'},true)).account,'human');assert.equal(calls,0);
 assert.equal((await reboot.annotationPage()).counts.total,205);
 (await labels.ready).close();(await reboot.annotations.ready).close();
});
test('failed persistence rolls back added annotations while retaining existing records and choices',async()=>{
 let fail=false,saved={};const labels=new IndexedAnnotations(new IDBFactory(),IDBKeyRange,'failed');
 const engine=new Engine({get:async()=>saved,set:async v=>{if(fail)throw Error('disk full');Object.assign(saved,v);}},undefined,labels);await engine.ready;await engine.learn({...row,id:'1'},'ai');const settings=structuredClone(engine.data.settings);
 fail=true;await assert.rejects(restoreBackup(engine,backupFile(data,storage,[row],true)),/disk full/);
 assert.equal((await labels.stats()).total,1);assert.equal(await labels.post('123'),undefined);assert.deepEqual(engine.data.settings,settings);(await labels.ready).close();
});
test('version 3 upgrade removes only derived rankings, preserving history and revision',async()=>{
 const factory=new IDBFactory();await new Promise((resolve,reject)=>{const r=factory.open('v3',3);r.onupgradeneeded=()=>{const db=r.result,s=db.createObjectStore('annotations',{keyPath:'key'});for(const[n,k]of[['time',['at','key']],['labelTime',['label','at','key']],['label','label'],['post','id'],['authorTime',['author.userId','at','key']],['handleTime',['handle','at','key']]])s.createIndex(n,k);s.put(row);const meta=db.createObjectStore('meta');meta.put(true,'migrated');meta.put(12,'revision');db.createObjectStore('authors',{keyPath:'handle'}).put({handle:'alice',human:1});};r.onsuccess=()=>{r.result.close();resolve();};r.onerror=()=>reject(r.error);});
 const labels=new IndexedAnnotations(factory,IDBKeyRange,'v3');assert.equal((await labels.stats()).revision,12);assert.deepEqual(await labels.get(row.key),row);assert.equal((await labels.ready).objectStoreNames.contains('authors'),false);(await labels.ready).close();
});
test('search, gallery and Codex image settings survive backups without crossing credential endpoints',()=>{
 const source={...storage,
  [WEB_KEY]:{enabled:false,provider:'brave',keys:{deepseek:'search-secret',brave:'brave-secret'}},
  [UNSPLASH_KEY]:{key:'photo-secret',proxy:'https://pictures.example/api'},
  [IMAGE_KEY]:{models:[{id:'codex',engine:'codex',sourceId:'codex-local',model:'imagegen',agentModel:'chosen-agent',models:['imagegen']}],defaultId:'codex'},
 };
 const safe=backupFile(data,source,[]);assert.ok(!JSON.stringify(safe).includes('secret'));assert.equal(safe.webSearch.enabled,false);
 const parsed=parseBackup(backupFile(data,source,[],true));
 assert.equal(parsed.images.models[0].agentModel,'chosen-agent');
 assert.ok(backupSummary(parsed).origins.includes('https://*/*'));
 const merged=mergeBackup(data,{[UNSPLASH_KEY]:{key:'',proxy:'https://different.example'}},parsed);
 assert.equal(merged.search.keys.deepseek,'search-secret');assert.equal(merged.pictures.key,'');
 const fresh=mergeBackup(data,{},parsed);assert.equal(fresh.pictures.key,'photo-secret');
 const old=backupFile(data,storage,[]);delete old.webSearch;delete old.unsplash;
 assert.doesNotThrow(()=>parseBackup(old));
});
