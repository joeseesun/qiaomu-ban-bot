import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { saveCaret,insertMention,ReplyReceipt,currentOwner,articlePerson,composerScope } from '../src/composer.js';
test('native mention edit replaces only a partial @ token, preserves surrounding text, refuses stale/wrong editors',()=>{
  const dom=new JSDOM('<div id="one" contenteditable="true"><div data-block="true">请教 @ali 后面的文字</div></div><div id="two" contenteditable="true">另一个草稿</div>'),d=dom.window.document,e=d.getElementById('one'),node=e.firstChild.firstChild;
  const r=d.createRange();r.setStart(node,7);r.collapse(true);d.getSelection().addRange(r);const saved=saveCaret(e);let insertion;
  d.execCommand=(cmd,ui,value)=>{insertion={cmd,selected:d.getSelection().toString(),value};return true;};
  insertMention(e,saved,'alice');assert.deepEqual(insertion,{cmd:'insertText',selected:'@ali',value:'@alice'});
  assert.throws(()=>insertMention(d.getElementById('two'),saved,'alice'),/光标/);
  e.firstChild.append('变了');assert.throws(()=>insertMention(e,saved,'alice'),/变化/);dom.window.close();
});
test('reply receipt requires success evidence AND cleared draft, excludes old receipts, self replies, timeouts and account changes',()=>{
  const r=new ReplyReceipt(),attempt={owner:'me',target:{handle:'alice'},text:'有用的回复',existing:['1'],at:100};
  r.start(attempt);assert.equal(r.confirm({owner:'me',cleared:false,posts:[{handle:'me',id:'2',text:'有用的回复'}],at:200}),null);
  assert.equal(r.confirm({owner:'me',cleared:true,posts:[],at:200}),null,'clearing a cancelled draft is not success');
  assert.equal(r.confirm({owner:'me',cleared:true,toastIds:['1'],at:200}),null);
  assert.equal(r.confirm({owner:'me',cleared:true,posts:[{handle:'other',id:'2',text:'有用的回复'}],at:200}),null);
  assert.equal(r.confirm({owner:'me',cleared:true,posts:[{handle:'me',id:'2',text:'有用的回复'}],at:200}).contact.handle,'alice');
  assert.equal(r.confirm({owner:'me',cleared:true,toastIds:['2'],at:200}),null,'one receipt only');
  r.start(attempt);assert.equal(r.confirm({owner:'different',cleared:true,toastIds:['2'],at:200}),null);
  r.start(attempt);assert.equal(r.confirm({owner:'me',cleared:true,toastIds:['2'],at:50000}),null);
  r.start({...attempt,target:{handle:'me'}});assert.equal(r.pending,null);
  r.start({...attempt,text:' '});assert.equal(r.pending,null);
});
test('person and composer scopes exclude quoted identity and separate multiple editors',()=>{
  const dom=new JSDOM('<a data-testid="AppTabBar_Profile_Link" href="/ME"></a><article data-testid="tweet"><a href="/alice"><img src="https://pbs.twimg.com/profile_images/1/a.png"></a><div data-testid="User-Name"><a href="/alice">艾丽丝</a></div><a href="/alice/status/1"><time></time></a><div data-testid="tweetText">hello</div><div data-testid="quoteTweet"><a href="/wrong/status/2"><time></time></a><div data-testid="tweetText">wrong</div></div></article><section id="scope1"><div contenteditable="true" data-testid="tweetTextarea_0"></div><div data-testid="toolBar"></div></section><section id="scope2"><div contenteditable="true" data-testid="tweetTextarea_1"></div><div data-testid="toolBar"></div></section>',{url:'https://x.com/home'}),d=dom.window.document;
  assert.equal(currentOwner(d),'me');const person=articlePerson(d.querySelector('article'));assert.equal(person.handle,'alice');assert.equal(person.text,'hello');assert.equal(person.displayName,'艾丽丝');assert.ok(person.avatar.includes('pbs.twimg.com'));
  assert.equal(composerScope(d.querySelector('[data-testid=tweetTextarea_1]')).id,'scope2');dom.window.close();
});
