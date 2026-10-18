import test from 'node:test';
import assert from 'node:assert/strict';
import { senderContext } from '../src/context.js';
const runtime = { id: 'our-extension', getURL: path => `chrome-extension://our-extension/${path}` };
test('settings retain administrative access after hash navigation in both popup and options', () => {
  for (const suffix of ['', '#overview', '#model', '?popup=1#accounts']) {
    assert.equal(senderContext({ id: runtime.id, url: runtime.getURL('ui.html') + suffix }, runtime), 'admin');
  }
});
test('only this extension and top-level X content can send messages', () => {
  const sender = { id: runtime.id, url: 'https://x.com/joe/status/123', tab: { id: 1 }, frameId: 0 };
  assert.equal(senderContext(sender, runtime), 'content');
  for (const patch of [{id:'other'}, {frameId:1}, {tab:null}, {url:'https://x.com.evil.test'}, {url:'http://x.com'}, {url:'chrome-extension://other/ui.html#model'}, {url:runtime.getURL('other.html')}, {url:'broken'}]) {
    assert.equal(senderContext({...sender,...patch}, runtime), 'none');
  }
});
