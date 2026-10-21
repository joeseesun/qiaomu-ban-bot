import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { Contacts, contactHandle, avatarURL } from '../src/contacts.js';
globalThis.IDBKeyRange=IDBKeyRange;
test('contact input validates handles, profile links and safe avatar origins',()=>{
  assert.equal(contactHandle('https://x.com/Someone_1?x=1'),'someone_1');assert.equal(contactHandle('@Alice'),'alice');
  for(const value of ['https://evil.test/alice','https://x.com/alice/status/1','https://evil@x.com/alice','@bad-name','home','a'.repeat(16)])assert.equal(contactHandle(value),'');
  assert.equal(avatarURL('https://pbs.twimg.com/profile_images/123/a.jpg'),'https://pbs.twimg.com/profile_images/123/a.jpg');
  for(const v of ['javascript:alert(1)','https://evil.test/a','https://pbs.twimg.com/other/a','https://pbs.twimg.com.evil.test/profile_images/a'])assert.equal(avatarURL(v),'');
});
test('confirmed replies deduplicate across concurrent receipts and remain account-specific',async()=>{
  const factory=new IDBFactory(),store=new Contacts(factory,'replies');await store.observe('me');
  await Promise.all([store.put('me',{handle:'alice',displayName:'艾丽丝'},{replyId:'123'}),store.put('me',{handle:'alice'},{replyId:'123'})]);
  let rows=await store.page({owner:'me'});assert.equal(rows.items[0].replyCount,1);assert.equal(rows.items[0].displayName,'艾丽丝');
  assert.equal((await store.page({owner:'other'})).items.length,0);
  await store.put('other',{handle:'alice'},{replyId:'123'});assert.equal((await store.page({owner:'other'})).items[0].replyCount,1);
  await store.configure('me',false);assert.equal((await store.put('me',{handle:'bob'},{replyId:'124'})).recorded,false);
  await store.put('me',{handle:'manual',note:'手动联系人',pinned:true});assert.equal((await store.page({owner:'me'})).items[0].handle,'manual');
  await store.configure('me',true);await store.remove('me','alice');
  assert.equal((await store.put('me',{handle:'alice'},{replyId:'125'})).recorded,false,'removed contacts must not reappear automatically');
  await store.refresh('me',[{handle:'alice',displayName:'不能复活'}]);assert.equal((await store.page({owner:'me'})).items.length,2);
  await store.put('me',{handle:'alice',note:'手动恢复'});await store.put('me',{handle:'alice'},{replyId:'126'});assert.equal((await store.page({owner:'me',query:'恢复'})).items[0].replyCount,1);
  (await store.db).close();const reopened=new Contacts(factory,'replies');assert.equal((await reopened.page({owner:'me'})).items.length,3);(await reopened.db).close();
});
test('search matches nickname, pinyin, initials and note; visible metadata preserves pin and note',async()=>{
  const store=new Contacts(new IDBFactory(),'search');await store.put('me',{handle:'qiaomu',displayName:'向阳乔木',note:'开源朋友',pinned:true},{at:10});
  for(const query of ['向阳','xiangyang','xyqm','开源','kaiyuan','@qiaomu'])assert.equal((await store.page({owner:'me',query})).items[0].handle,'qiaomu');
  await store.refresh('me',[{handle:'qiaomu',displayName:'乔木新名字',avatar:'https://pbs.twimg.com/profile_images/1/test.png'},{handle:'stranger',displayName:'不应收录'}]);
  const c=(await store.page({owner:'me',query:'qiaomuxin'})).items[0];assert.equal(c.note,'开源朋友');assert.equal(c.pinned,true);assert.equal(c.replyCount,0);assert.equal(c.activity,10);
  assert.equal((await store.page({owner:'me'})).items.length,2);(await store.db).close();
});
test('500 contacts page by indexed cursor, without getAll or cross-account records',async()=>{
  const store=new Contacts(new IDBFactory(),'large'),db=await store.db,tx=db.transaction('contacts','readwrite');
  for(let i=0;i<500;i++)tx.objectStore('contacts').put({owner:'me',handle:'person_'+i,displayName:'读者'+i,note:'',search:'读者'+i,activity:1000+i,pinned:i<2,pinnedOrder:i<2?1:0});
  await new Promise(resolve=>tx.oncomplete=resolve);
  const proto=Object.getPrototypeOf(db.transaction('contacts').objectStore('contacts')),old=proto.getAll;proto.getAll=()=>{throw Error('unbounded read');};
  try{const a=await store.page({owner:'me'}),b=await store.page({owner:'me',before:a.next});assert.equal(a.items.length,20);assert.equal(b.items.length,20);assert.equal(new Set([...a.items,...b.items].map(c=>c.handle)).size,40);assert.equal(a.items[0].handle,'person_1');assert.equal((await store.page({owner:'me',pinned:true})).items.length,2);assert.equal((await store.page({owner:'me',query:'读者255'})).items[0].handle,'person_255');}
  finally{proto.getAll=old;db.close();}
});

test('new address books include the author for feedback without fabricating interaction history',async()=>{
  const store=new Contacts(new IDBFactory(),'defaults');await store.observe('reader');
  const [c]=(await store.page({owner:'reader'})).items;assert.equal(c?.handle,'vista8');assert.equal(c.displayName,'向阳乔木');assert.equal(c.note,'插件作者 · 问题反馈');assert.equal(c.replyCount,0);assert.equal(c.lastReplyAt,0);assert.equal(c.pinned,false);
  for(const query of ['vista8','反馈','xiangyang','xyqm'])assert.equal((await store.page({owner:'reader',query})).items[0]?.handle,'vista8');
});

test('existing address books seed once, preserve custom author data and respect prior removal',async()=>{
  const factory=new IDBFactory(),store=new Contacts(factory,'upgrade'),db=await store.db;
  const tx=db.transaction(['owners','contacts','removed'],'readwrite');
  for(const owner of ['fresh','custom','deleted','vista8'])tx.objectStore('owners').put({handle:owner,automatic:false,seenAt:123});
  const original={owner:'custom',handle:'vista8',displayName:'我认识的乔木',avatar:'',note:'我自己的备注',pinned:true,pinnedOrder:1,replyCount:7,lastReplyAt:123,activity:456,search:'vista8'};
  tx.objectStore('contacts').put(original);tx.objectStore('removed').put({owner:'deleted',handle:'vista8'});await new Promise(resolve=>tx.oncomplete=resolve);
  await Promise.all([store.state(),store.page({owner:'fresh'}),store.observe('fresh')]);
  assert.equal((await store.page({owner:'fresh'})).items.length,1);
  assert.deepEqual((await store.page({owner:'custom'})).items,[original]);
  for(const owner of ['deleted','vista8'])assert.equal((await store.page({owner})).items.length,0);
  assert.equal((await store.state('fresh')).owners.find(o=>o.handle==='fresh').automatic,false);
  await store.remove('fresh','vista8');db.close();
  const reopened=new Contacts(factory,'upgrade');await reopened.observe('fresh');assert.equal((await reopened.page({owner:'fresh'})).items.length,0);
  await reopened.put('fresh',{handle:'vista8',displayName:'手动恢复',note:'新的备注'});assert.equal((await reopened.page({owner:'fresh'})).items[0].note,'新的备注');(await reopened.db).close();
});
test('confirmed likes and reposts are recorded once per post and honour opt-out and removal',async()=>{
  const store=new Contacts(new IDBFactory(),'interact');await store.observe('me');
  await Promise.all([store.interact('me',{handle:'alice',displayName:'Alice'},{kind:'like',postId:'1'}),store.interact('me',{handle:'alice'},{kind:'like',postId:'1'})]);
  await store.interact('me',{handle:'alice'},{kind:'repost',postId:'1'});await store.interact('me',{handle:'alice'},{kind:'like',postId:'2'});
  let c=(await store.page({owner:'me'})).items[0];assert.equal(c.likeCount,2);assert.equal(c.repostCount,1);assert.equal(c.lastKind,'like');assert.equal(c.replyCount,0);
  assert.equal((await store.interact('me',{handle:'me'},{kind:'like',postId:'3'})).recorded,false,'own posts never become contacts');
  await assert.rejects(store.interact('me',{handle:'bob'},{kind:'follow',postId:'3'}),/互动类型/);
  await assert.rejects(store.interact('me',{handle:'bob'},{kind:'like',postId:'x'}),/帖子编号/);
  await store.remove('me','alice');assert.equal((await store.interact('me',{handle:'alice'},{kind:'like',postId:'9'})).recorded,false);
  await store.configure('me',false);assert.equal((await store.interact('me',{handle:'carol'},{kind:'like',postId:'4'})).recorded,false);
  await store.configure('me',true);await store.put('me',{handle:'dave'},{replyId:'5'});
  c=(await store.page({owner:'me',query:'dave'})).items[0];assert.equal(c.lastKind,'reply');assert.ok(c.lastInteractionAt>0);
});
