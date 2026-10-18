import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { saveCaret,insertMention,ReplyReceipt,currentOwner,articlePerson,composerScope } from '../src/composer.js';
function replaceSelection(d,value){const s=d.getSelection(),r=s.getRangeAt(0);r.deleteContents();const n=d.createTextNode(value);r.insertNode(n);r.setStartAfter(n);r.collapse(true);s.removeAllRanges();s.addRange(r);}
function caret(d,e,offset){const r=d.createRange();r.setStart(e.firstChild.firstChild,offset);r.collapse(true);d.getSelection().removeAllRanges();d.getSelection().addRange(r);return saveCaret(e);}
function clipboardMocks(view){view.DataTransfer=class{data={};setData(type,text){this.data[type]=text;}getData(type){return this.data[type]||'';}get types(){return Object.keys(this.data);}};view.ClipboardEvent=class extends view.Event{constructor(type,opts){super(type,opts);this.clipboardData=opts.clipboardData;}};}
test('native mention edit replaces only a partial @ token, preserves surrounding text, refuses stale/wrong editors',async()=>{
  const dom=new JSDOM('<div id="one" contenteditable="true"><div data-block="true">请教 @ali 后面的文字</div></div><div id="two" contenteditable="true">另一个草稿</div>'),d=dom.window.document,e=d.getElementById('one'),node=e.firstChild.firstChild;
  const r=d.createRange();r.setStart(node,7);r.collapse(true);d.getSelection().addRange(r);const saved=saveCaret(e);let insertion;
  let controlledSelection='',pendingFocus=false;
  e.addEventListener('focus',()=>{pendingFocus=true;setTimeout(()=>{const block=e.firstChild;block.replaceChildren(d.createTextNode(block.textContent));pendingFocus=false;},0);});
  e.addEventListener('keyup',()=>{if(!pendingFocus)controlledSelection=d.getSelection().toString();});
  d.execCommand=(cmd,ui,value)=>{assert.equal(controlledSelection,'@ali');insertion={cmd,selected:d.getSelection().toString(),value};replaceSelection(d,value);return true;};
  await insertMention(e,saved,'alice');assert.deepEqual(insertion,{cmd:'insertText',selected:'@ali',value:'@alice'});
  await assert.rejects(insertMention(d.getElementById('two'),saved,'alice'),/光标/);
  e.firstChild.append('变了');await assert.rejects(insertMention(e,saved,'alice'),/变化/);dom.window.close();
});
test('mention insertion includes the readable name, keeps @ identity, and avoids extra mentions',async()=>{
  const dom=new JSDOM('<div contenteditable="true"><div data-block="true">请教 @ali 后文</div></div>'),d=dom.window.document,e=d.querySelector('[contenteditable]'),n=e.firstChild.firstChild;
  const r=d.createRange();r.setStart(n,7);r.collapse(true);d.getSelection().addRange(r);let saved=saveCaret(e),inserted;const reset=()=>{e.firstChild.textContent='请教 @ali 后文';saved=caret(d,e,7);};
  d.execCommand=(cmd,ui,value)=>{inserted={selected:d.getSelection().toString(),value};replaceSelection(d,value);return true;};
  await insertMention(e,saved,'alice','艾丽丝');assert.deepEqual(inserted,{selected:'@ali',value:'艾丽丝 @alice'});
  reset();await insertMention(e,saved,'alice','  艾丽丝\n开发者 @someone  ');assert.equal(inserted.value,'艾丽丝 开发者 ＠someone @alice');
  for(const name of ['',null,'@ALICE','alice']){reset();await insertMention(e,saved,'alice',name);assert.equal(inserted.value,'@alice');}
  dom.window.close();
});
test('controlled editor receives one plain-text paste, never a duplicate native command',async()=>{
  const dom=new JSDOM('<div contenteditable="true"><div data-contents="true"><div data-block="true">请教 @ali 后文</div></div></div>'),d=dom.window.document,e=d.querySelector('[contenteditable]');clipboardMocks(dom.window);
  const r=d.createRange();r.setStart(e.querySelector('[data-block]').firstChild,7);r.collapse(true);d.getSelection().addRange(r);const saved=saveCaret(e);let pastes=0;
  d.execCommand=()=>{throw Error('must not fallback');};
  e.addEventListener('paste',event=>{pastes++;assert.deepEqual(event.clipboardData.types,['text/plain']);assert.equal(d.getSelection().toString(),'@ali');event.preventDefault();setTimeout(()=>replaceSelection(d,event.clipboardData.getData('text/plain')),0);});
  await insertMention(e,saved,'alice','艾丽丝');assert.equal(pastes,1);assert.equal(e.textContent,'请教 艾丽丝 @alice 后文');dom.window.close();
});
test('controlled editor refuses unhandled or swallowed paste without an unsafe fallback',async()=>{
  for(const prevent of [false,true]){
    const dom=new JSDOM('<div contenteditable="true"><div data-block="true" data-editor="draft">@ali</div></div>'),d=dom.window.document,e=d.querySelector('[contenteditable]');clipboardMocks(dom.window);
    const saved=caret(d,e,4);d.execCommand=()=>{throw Error('must not fallback');};if(prevent)e.addEventListener('paste',event=>event.preventDefault());
    await assert.rejects(insertMention(e,saved,'alice','艾丽丝'),/未能完成/);assert.equal(e.textContent,'@ali');dom.window.close();
  }
});
test('insertion aborts if text changes while focus commits',async()=>{
  const dom=new JSDOM('<div contenteditable="true"><div data-block="true">@ali</div></div>'),d=dom.window.document,e=d.querySelector('[contenteditable]');const saved=caret(d,e,4);
  e.addEventListener('focus',()=>setTimeout(()=>{e.firstChild.textContent='用户的新输入';},0));d.execCommand=()=>{throw Error('must not edit');};
  await assert.rejects(insertMention(e,saved,'alice'),/变化/);assert.equal(e.textContent,'用户的新输入');dom.window.close();
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
