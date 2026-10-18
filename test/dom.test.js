import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractArticle,parseCount } from '../src/dom.js';
const tweet = (id, extra='',text='hello') => `<article data-testid="tweet"><div><div data-testid="User-Name"><a href="/alice">Alice</a><a href="/alice/status/${id}"><time datetime="2026-10-18T10:00:00Z">1h</time></a></div>${extra}<div data-testid="tweetText">${text}</div><div role="group" aria-label="3 回复、4 喜欢、1.2万 次观看"><button data-testid="like" aria-label="4 喜欢"></button></div></div></article>`;
const doc = html=>new JSDOM(html).window.document;
test('correct own author, status, metrics; quoted content excluded',()=>{
  const d=doc(tweet('123','<div data-testid="quoteTweet"><a href="/bob/status/999"><time>2h</time></a><div data-testid="tweetText">quoted</div></div>'));
  const item=extractArticle(d.querySelector('article'),'https://x.com/alice/status/123');
  assert.equal(item.id,'123');assert.equal(item.handle,'alice');assert.equal(item.displayName,'Alice');assert.equal(item.kind,'post');assert.equal(item.text,'hello');assert.equal(item.metrics.views,12000);
});
test('conversation chain identifies the original post and a reply opened as the focal status',()=>{
  const d=doc(`<div data-testid="primaryColumn">${tweet('100')}${tweet('123')}${tweet('124')}<h2>发现更多</h2>${tweet('125')}</div>`);
  assert.deepEqual([...d.querySelectorAll('article')].map(a=>extractArticle(a,'https://x.com/alice/status/123').kind),['post','reply','reply','unknown']);
});
test('reply permalink retains earlier context and does not forecast a reply as a main post',()=>{
  const d=doc(`<div data-testid="primaryColumn">${tweet('100','','original question')}${tweet('101','','first answer')}${tweet('102','','follow-up')}</div>`);
  const items=[...d.querySelectorAll('article')].map(a=>extractArticle(a,'https://x.com/alice/status/102'));
  assert.deepEqual(items.map(i=>i.kind),['post','reply','reply']);
  assert.equal(items[2].parent,'first answer');
});
test('timeline reply markers work without detail route; other posts go to radar',()=>{
  const d=doc(tweet('123','<div dir="auto">Replying to @bob</div>')+tweet('124'));
  const [a,b]=d.querySelectorAll('article');assert.equal(extractArticle(a,'https://x.com/home').kind,'reply');assert.equal(extractArticle(b,'https://x.com/home').kind,'post');
});
test('localized numbers and missing analytics remain distinct from zero views',()=>{
  assert.equal(parseCount('1.2K Views'),1200);assert.equal(parseCount('1,234'),1234);assert.equal(parseCount('2万'),20000);assert.equal(parseCount('Views'),null);
  const a=doc(tweet('1')).querySelector('article');a.querySelector('[role=group]').remove();assert.equal(extractArticle(a,'https://x.com/home').metrics.views,null);
});
test('virtualized conversation retains parent and reply classification after root leaves DOM',()=>{
  const d=doc(`<div data-testid="primaryColumn">${tweet('124')}${tweet('125')}<h2>发现更多</h2>${tweet('126')}</div>`);
  const context={rootId:'123',parent:'original context',passedRoot:true,replyIds:new Set()};
  const items=[...d.querySelectorAll('article')].map(a=>extractArticle(a,'https://x.com/alice/status/123',context));
  assert.deepEqual(items.map(i=>i.kind),['reply','reply','unknown']);assert.equal(items[0].parent,'original context');
  context.ended=true;assert.equal(extractArticle(d.querySelectorAll('article')[2],'https://x.com/alice/status/123',context).kind,'unknown');
});
test('quoted or authored Replying to text is not an actual reply marker',()=>{
  const d=doc(tweet('123','<div data-testid="quoteTweet"><div dir="auto">Replying to @bob</div></div>','<span dir="auto">Replying to is a label on X.</span>'));
  assert.equal(extractArticle(d.querySelector('article'),'https://x.com/home').kind,'post');
});
test('own timestamp anchor with role=link and tabindex is not excluded as a quote',()=>{
  const a=doc(tweet('123')).querySelector('article');const link=a.querySelector('time').closest('a');link.setAttribute('role','link');link.setAttribute('tabindex','0');
  assert.equal(extractArticle(a,'https://x.com/alice/status/123').id,'123');
});
