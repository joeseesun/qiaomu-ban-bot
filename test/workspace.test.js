import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {buildSearch,searchURL,normalizeSearch,importSearches,templateSearch} from '../src/search.js';
import {Workspace} from '../src/workspace.js';
const item=(id=1,handle='alice',kind='post')=>({id:String(id),handle,displayName:'艾丽丝',kind,text:'缓存行为的实际测试：清理缓存后恢复正常。'+id,parent:kind==='reply'?'如何排查这个问题？':'',metrics:{views:300,likes:8,replies:2,reposts:1}});
const store=()=>new Workspace(new IDBFactory(),IDBKeyRange);
test('query builder preserves word semantics, quotes injection-like text and includes the selected final date',()=>{
 const q=buildSearch({all:'open source',any:'工具 产品',phrase:'hello world',exclude:'广告',from:'@Alice bob',period:'custom',since:'2026-10-01',until:'2026-10-18',likes:100,media:'links',excludeReposts:true});
 assert.match(q,/^"open" "source"/);assert.match(q,/\("工具" OR "产品"\)/);assert.match(q,/\(from:alice OR from:bob\)/);assert.match(q,/until:2026-10-19/);assert.match(q,/min_faves:100/);
 assert.equal(new URL(searchURL({phrase:'from:admin & q=evil'})).searchParams.get('q'),'"from:admin & q=evil"');
 assert.match(buildSearch({all:'AI',period:'7d'},new Date(2026,9,19,13)),/since:2026-10-13 until:2026-10-20/);
 assert.match(buildSearch({all:'AI',period:'7d'},new Date(2026,9,20,13)),/since:2026-10-14 until:2026-10-21/);
 assert.equal(buildSearch(templateSearch(2,'me')),'from:me -filter:nativeretweets min_faves:50');
 for(const f of [{from:'bad handle!'},{likes:-1},{reposts:1.5},{since:'2026-02-31'},{since:'2026-10-20',until:'2026-10-10'},{}])assert.throws(()=>buildSearch(f));
});
test('saved search import validates the entire batch and excludes arbitrary fields',async()=>{
 const w=store(),values={format:'qiaomu-x-searches',version:1,items:[{name:'开源',filters:{all:'开源',period:'7d'},apiKey:'never-import',owner:'other'}]};
 const rows=importSearches(values);assert.equal(rows[0].apiKey,undefined);assert.equal(rows[0].owner,undefined);
 await w.importSearches('me',rows);assert.equal((await w.page('searches','me')).items.length,1);assert.equal((await w.page('searches','other')).items.length,0);
 assert.throws(()=>importSearches({...values,items:[...values.items,{name:'bad',filters:{likes:-1}}]}));
 assert.equal((await w.page('searches','me')).items.length,1);
});
test('cursor paging, pinned order and owner isolation remain correct across 65 records and restart',async()=>{
 const factory=new IDBFactory(),w=new Workspace(factory,IDBKeyRange);
 for(let i=0;i<65;i++)await w.queue('me',item(i),{score:i/100,pinned:i===1});
 await w.queue('other',item(99),{pinned:true});
 const seen=[],first=await w.page('inbox','me',{status:'pending',sort:'rank'});assert.equal(first.items[0].id,'1');seen.push(...first.items.map(r=>r.id));let before=first.next;
 while(before){const page=await w.page('inbox','me',{status:'pending',sort:'rank',before});seen.push(...page.items.map(r=>r.id));before=page.next;}
 assert.equal(seen.length,65);assert.equal(new Set(seen).size,65);
 await w.remove('inbox','me','1');const restarted=new Workspace(factory,IDBKeyRange);
 assert.ok((await restarted.queue('me',item(1),{source:'mention'})).skipped);assert.equal(await restarted.get('inbox','me','1'),undefined);
 await restarted.queue('me',item(1));assert.ok(await restarted.get('inbox','me','1'));
 await restarted.profile('me',{collectMentions:false});assert.ok((await restarted.queue('me',item(100),{source:'mention'})).skipped);
});
test('concurrent queue updates preserve completed state, pins and model score',async()=>{
 const w=store();await w.queue('me',item());await Promise.all([w.queue('me',item(),{status:'done'}),w.queue('me',item(),{pinned:true}),w.queue('me',item(),{score:.8})]);
 const row=await w.get('inbox','me','1');assert.equal(row.status,'done');assert.equal(row.pinned,true);assert.equal(row.score,.8);
});
