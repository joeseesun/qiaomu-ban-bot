import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
const code=(await build({entryPoints:['src/mentions.js'],bundle:true,write:false,format:'iife',target:'chrome120'})).outputFiles[0].text;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('mention launcher joins the native icon row and follows its appearance without touching the draft',async()=>{
  const dom=new JSDOM('<a data-testid="AppTabBar_Profile_Link" href="/me"></a><section><div contenteditable="true" data-testid="tweetTextarea_0">已有草稿</div><div data-testid="toolBar"><nav><div role="tablist"><div><button data-testid="gifSearchButton" style="width:36px;height:36px"><svg style="color:rgb(130,154,171);width:23px;height:23px"></svg></button></div></div></nav><div id="submit"><button data-testid="tweetButtonInline">发帖</button></div></div></section>',{url:'https://x.com/home',runScripts:'outside-only',pretendToBeVisual:true});
  const d=dom.window.document;dom.window.chrome={runtime:{sendMessage:async()=>({ok:true,data:{items:[]}})}};
  try{
    dom.window.eval(code);await pause(30);
    const row=d.querySelector('[role="tablist"]'),host=d.querySelector('.qm-mentions-host');
    assert.equal(host.parentElement,row);assert.equal(d.querySelector('[data-testid="toolBar"]').children.length,2);
    assert.equal(host.style.getPropertyValue('--qm-accent'),'rgb(130, 154, 171)');
    assert.equal(host.style.getPropertyValue('--qm-button-size'),'36px');assert.equal(host.style.getPropertyValue('--qm-icon-size'),'23px');
    d.querySelector('svg').style.color='rgb(29,155,240)';d.body.className='dark';await pause(250);
    assert.equal(d.querySelector('.qm-mentions-host'),host);assert.equal(host.style.getPropertyValue('--qm-accent'),'rgb(29, 155, 240)');
    assert.equal(d.querySelector('[contenteditable]').textContent,'已有草稿');
  }finally{dom.window.close();}
});
test('observing posts for contacts never sends retired forecast collection requests',async()=>{
 const dom=new JSDOM('<a data-testid="AppTabBar_Profile_Link" href="/me"></a><article data-testid="tweet"><div data-testid="User-Name"><a href="/alice">Alice</a></div><a href="/alice/status/123"><time></time></a><div data-testid="tweetText">保留可见联系人</div><div role="group" aria-label="100 views"></div></article>',{url:'https://x.com/home',runScripts:'outside-only',pretendToBeVisual:true});const calls=[];dom.window.chrome={runtime:{sendMessage:async m=>{calls.push(m);return{ok:true,data:{items:[]}};}}};
 try{dom.window.eval(code);await pause(220);assert.ok(calls.some(m=>m.type==='contacts-refresh'));assert.equal(calls.some(m=>m.type.startsWith('forecast-')),false);}finally{dom.window.close();}
});
test('a like counts only after X flips the button to unlike; the picker groups related people first',async()=>{
  const dom=new JSDOM(`<a data-testid="AppTabBar_Profile_Link" href="/me"></a>
  <article data-testid="tweet"><div data-testid="User-Name"><a href="/alice">Alice</a></div><a href="/alice/status/123"><time></time></a><div data-testid="tweetText">原帖</div><div role="group"><button data-testid="like" aria-label="3 Likes"></button><button data-testid="retweet"></button></div></article>
  <article data-testid="tweet"><div data-testid="User-Name"><a href="/bob">Bob</a></div><a href="/bob/status/124"><time></time></a><div data-testid="tweetText">没点</div><div role="group"><button data-testid="like"></button></div></article>
  <section><div contenteditable="true" data-testid="tweetTextarea_0"></div><div data-testid="toolBar"><nav><div role="tablist"></div></nav><div></div></div></section>`,{url:'https://x.com/alice/status/123',runScripts:'outside-only',pretendToBeVisual:true});
  const d=dom.window.document,calls=[];
  dom.window.HTMLElement.prototype.showPopover=function(){};dom.window.HTMLElement.prototype.hidePopover=function(){};
  dom.window.chrome={runtime:{sendMessage:async m=>{calls.push(m);return{ok:true,data:m.type==='contacts-page'?{items:[{handle:'pinned1',displayName:'置顶的人',pinned:true},{handle:'carol',displayName:'Carol',likeCount:2,lastInteractionAt:Date.now()},{handle:'old',displayName:'Old'},{handle:'alice',displayName:'Alice'}]}:{}};}}};
  try{
    dom.window.eval(code);await pause(250);
    const like=d.querySelector('[data-testid="like"]');like.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));await pause(200);
    assert.equal(calls.some(m=>m.type==='contacts-interact'),false,'untrusted clicks are ignored');
    const launcher=d.querySelector('.qm-mentions-host').shadowRoot.querySelector('.launch');
    launcher.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true}));launcher.click();await pause(80);
    const root=d.querySelector('.qm-mentions-host').shadowRoot,groups=[...root.querySelectorAll('.group')].map(n=>n.textContent);
    assert.deepEqual(groups,['本帖相关','置顶','最近互动','全部联系人']);
    const handles=[...root.querySelectorAll('.option')].map(b=>b.dataset.handle);
    assert.equal(handles[0],'alice');assert.equal(handles.filter(h=>h==='alice').length,1,'related people are not repeated');
    assert.ok(root.textContent.includes('赞 2'));
  }finally{dom.window.close();}
});
test('interaction receipts wait for the undo button on the same post, not a quoted one',async()=>{
  const {awaitFlip}=await import('../src/composer.js');
  const dom=new JSDOM('<article id="a"><button data-testid="like"></button><article id="q"><button data-testid="unlike"></button></article></article>');
  const a=dom.window.document.getElementById('a');
  assert.equal(await awaitFlip(a,'[data-testid="unlike"]',{tries:3,step:5}),false);
  setTimeout(()=>a.querySelector('[data-testid="like"]').setAttribute('data-testid','unlike'),10);
  assert.equal(await awaitFlip(a,'[data-testid="unlike"]',{tries:10,step:5}),true);
  dom.window.close();
});
