import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { JSDOM } from 'jsdom';
import { Bookmarks, cleanBookmark, bookmarkPath } from '../src/bookmarks.js';
import { extractBookmark } from '../src/bookmark-dom.js';
globalThis.IDBKeyRange=IDBKeyRange;
const item=(id='1',text='第一行\n第二行')=>({id,handle:'alice',displayName:'艾丽丝',text,publishedAt:1720000000000,partial:false,links:['https://example.com/a?q=x'],images:[]});
test('bookmark inputs validate identity, bounded text and links; only supported bookmark routes match',()=>{
  for(const path of ['/i/bookmarks','/i/bookmarks/123','/i/history'])assert.equal(bookmarkPath(path),true);
  for(const path of ['/home','/i/history/likes','/i/bookmarks/fake','/someone/status/1'])assert.equal(bookmarkPath(path),false);
  for(const input of [{...item(),id:'../../1'},{...item(),handle:'bad?'}])assert.throws(()=>cleanBookmark(input));
  const c=cleanBookmark({...item(),url:'javascript:bad',text:'x'.repeat(50001),links:['javascript:evil','https://user:secret@x.com','https://example.com/a?q=x','https://example.com/a?q=x'],images:['https://pbs.twimg.com/media/image.jpg','https://evil.test/pixel.png']});
  assert.equal(c.partial,true);assert.equal(c.text.length,50000);assert.equal(c.url,'https://x.com/alice/status/1');assert.deepEqual(c.links,['https://example.com/a?q=x']);assert.equal(c.images.length,1);assert.equal(cleanBookmark({...item(),publishedAt:1e20}).publishedAt,null);
});
test('concurrent captures deduplicate, isolate accounts and preserve richer text and user notes',async()=>{
  const store=new Bookmarks(new IDBFactory());await Promise.all([store.capture('me',[item()],{at:10}),store.capture('me',[item()],{at:20})]);
  let page=await store.page({owner:'me'});assert.equal(page.count,1);assert.equal(page.items[0].collectedAt,10);
  await assert.rejects(store.edit('me','1',{tags:Array.from({length:13},(_,n)=>String(n))}),/12 个标签/);
  await store.edit('me','1',{note:'自己的想法',tags:['开源','开源','工具']});
  await store.capture('me',[{...item('1','第一…'),partial:true}],{at:30});page=await store.page({owner:'me',query:'想法'});
  assert.equal(page.items[0].text,'第一行\n第二行');assert.deepEqual(page.items[0].tags,['开源','工具']);assert.equal(page.items[0].collectedAt,10);
  await store.capture('other',[item()]);assert.equal((await store.page({owner:'other'})).count,1);assert.equal((await store.page({owner:'other'})).items[0].note,'');
  await store.remove('me','1');assert.equal((await store.page({owner:'me'})).count,0);assert.equal((await store.page({owner:'other'})).count,1);
  await store.capture('me',[item()],{at:40});assert.equal((await store.page({owner:'me'})).items[0].collectedAt,40,'removing a local copy is not an X unbookmark');
  (await store.db).close();
});
test('expanded text replaces a partial snapshot, duplicates in a batch do not inflate the total',async()=>{
  const factory=new IDBFactory(),store=new Bookmarks(factory,'expanded');
  await store.capture('me',[{...item('1','片段…'),partial:true},item('2'),item('2')]);assert.equal((await store.page({owner:'me'})).count,2);
  await store.capture('me',[item('1','展开后的全文')]);assert.equal((await store.page({owner:'me',query:'全文'})).items[0].partial,false);
  await assert.rejects(store.capture('me',[item('3'),{...item('4'),id:'invalid'}]));assert.equal((await store.page({owner:'me'})).count,2,'whole invalid batch rejected');
  (await store.db).close();const reopened=new Bookmarks(factory,'expanded');assert.equal((await reopened.page({owner:'me'})).count,2);(await reopened.db).close();
});
test('500 bookmarks paginate by index without getAll, searches match body/author/notes/tags',async()=>{
  const store=new Bookmarks(new IDBFactory(),'pages');for(let i=0;i<500;i+=40)await store.capture('me',Array.from({length:Math.min(40,500-i)},(_,n)=>item(String(i+n+1),'正文 '+(i+n))),{at:100});
  const db=await store.db,proto=Object.getPrototypeOf(db.transaction('bookmarks').objectStore('bookmarks')),original=proto.getAll;proto.getAll=()=>{throw Error('unbounded library read');};
  try{const a=await store.page({owner:'me'}),b=await store.page({owner:'me',before:a.next});assert.equal(a.items.length,20);assert.equal(new Set([...a.items,...b.items].map(c=>c.id)).size,40);assert.equal(a.count,500);assert.equal((await store.page({owner:'me',query:'正文 399'})).items.length,1);assert.equal((await store.page({owner:'other',before:a.next})).items.length,0);await store.edit('me','400',{note:'搜索备注',tags:['技巧']});for(const query of ['搜索备注','技巧','艾丽丝','alice'])assert.ok((await store.page({owner:'me',query})).items.length>0);}
  finally{proto.getAll=original;db.close();}
});
test('Markdown export contains all matched pages and correct times; keeps text inert and never includes other accounts',async()=>{
  const store=new Bookmarks(new IDBFactory(),'export');await store.capture('me',Array.from({length:25},(_,n)=>({...item(String(n+1),`正文 ${n}\n![恶意](javascript:alert(1)) <script>bad</script> [[私密]]`),partial:n===0,translated:n===1,images:['https://pbs.twimg.com/media/test.jpg'],hasVideo:true})),{at:1720000001000});
  await store.capture('other',[item('999','OTHER PRIVATE')]);await store.edit('me','1',{note:'备注 **完整**',tags:['导出']});
  const result=await store.exportMarkdown({owner:'me',at:1720000002000}),md=await result.blob.text();assert.equal(result.count,25);assert.equal(result.filename,'x-bookmarks-me-2024-07-03.md');assert.ok(md.includes('本次导出：25 条'));assert.ok(md.includes('X 收藏时间未知'));assert.ok(md.includes('首次收集：2024-07-03T09:46:41.000Z'));assert.ok(md.includes('发布时间：2024-07-03T09:46:40.000Z'));assert.ok(md.includes('正文未展开'));assert.ok(md.includes('X 显示的译文'));
  assert.ok(!md.includes('OTHER PRIVATE'));assert.ok(!md.includes('<script>'));assert.ok(!md.includes('[[私密]]'));assert.ok(!md.includes('![恶意]'));assert.ok(md.includes('https://x.com/alice/status/1'));assert.ok(md.includes('[图片 1](https://pbs.twimg.com/media/test.jpg)'));assert.ok(md.includes('备注 \\*\\*完整\\*\\*'));
  assert.equal((await store.exportMarkdown({owner:'me',query:'导出'})).count,1);await assert.rejects(store.exportMarkdown({owner:'me',query:'没有'}),/没有可导出/);(await store.db).close();
});
test('export uses one consistent transaction while a later capture waits',async()=>{
  const store=new Bookmarks(new IDBFactory(),'snapshot');await store.capture('me',[item()]);const exported=store.exportMarkdown({owner:'me'});const adding=store.capture('me',[item('2')]);assert.equal((await exported).count,1);await adding;assert.equal((await store.exportMarkdown({owner:'me'})).count,2);(await store.db).close();
});
test('DOM collection excludes unsaved posts, quotes and promotions, preserves emoji, lines, media and partial status',()=>{
  const dom=new JSDOM(`<article data-testid="tweet"><div data-testid="User-Name"><a href="/alice">艾丽丝</a><a href="/alice">@alice</a></div><a href="/alice/status/123"><time datetime="2026-10-18T10:00:00Z"></time></a><div data-testid="tweetText">你好<img alt="🌳"><br>第二行 <a href="https://example.com">例子</a></div><button data-testid="tweet-text-show-more-link">显示更多</button><button aria-label="显示原文"></button><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/a.jpg"></div><video></video><div data-testid="quoteTweet"><a href="/wrong/status/999"><time></time></a><div data-testid="tweetText">不应混入</div><button data-testid="removeBookmark"></button></div><button id="saved" data-testid="removeBookmark"></button></article>`,{url:'https://x.com/i/history'});
  const a=dom.window.document.querySelector('article'),c=extractBookmark(a);assert.equal(c.id,'123');assert.equal(c.text,'你好🌳\n第二行 例子');assert.equal(c.displayName,'艾丽丝');assert.equal(c.partial,true);assert.equal(c.translated,true);assert.equal(c.images.length,1);assert.equal(c.hasVideo,true);assert.equal(c.hasQuote,true);
  dom.window.document.querySelector('#saved').remove();assert.equal(extractBookmark(a),null,'quoted saved-state is not the parent saved-state');dom.window.close();
});
