import test from 'node:test';
import assert from 'node:assert/strict';
import { spamSignals, skeleton, THRESHOLD } from '../src/spam.js';
import { decide, normalizeSettings } from '../src/core.js';
import { RULE_PRESETS } from '../src/rules.js';

// Synthetic lure replies in the shape seen on X on 2026-10-20: CJK name with
// service words, generated Latin handle, one template line with swapped emoji.
const lure = [
  { id:'1', kind:'reply', handle:'annafixturexq', displayName:'小晶同城上门线下选妃', text:'应该没人比我玩的开了吧我福不黑不信你看', author:{followers:4} },
  { id:'2', kind:'reply', handle:'bellafixturemj', displayName:'小若同城上门线下选妃', text:'应该没人比我玩的开了吧 🐱🦢 我福不黑不信你看', author:{followers:4} },
];
const human = [
  { id:'3', kind:'reply', handle:'fixture_bai', displayName:'阿白', text:'10分钟填完审批我信 厂里执照也扔文件夹 Codex填完我还得对三遍！！！', author:{followers:1000} },
  { id:'4', kind:'reply', handle:'alice', displayName:'同城咖啡', text:'周末的线下活动在哪里报名？', author:{followers:30} },
  { id:'6', kind:'reply', handle:'readclubfixture', displayName:'同城线下读书会', text:'这周六在南山图书馆，欢迎来。', author:{followers:8} },
  { id:'5', kind:'reply', handle:'fixture_tong', displayName:'阿通', text:'公司福利不错，线下见。', author:{followers:258} },
  { id:'7', kind:'reply', handle:'newcomerfixture', displayName:'新来的', text:'👍👍', author:{followers:2} },
];

test('lure replies score past the threshold with readable reasons', () => {
  for (const item of lure) {
    const s = spamSignals(item);
    assert.equal(s.fold, true, item.handle);
    assert.ok(s.score >= THRESHOLD);
    assert.ok(s.reasons.some(r => r.includes('选妃')) && s.reasons.some(r => r.includes('福不黑')));
  }
  const d = decide(lure[0], null, normalizeSettings({ wordRules: RULE_PRESETS }));
  assert.equal(d.collapse, true);
  assert.match(d.label, /疑似引流 \d+(\.\d)? 分：/);
});
test('a single shared word or account traits alone never hide an ordinary reply', () => {
  for (const item of human) assert.equal(spamSignals(item).fold, false, item.displayName);
});
test('the same template from several authors adds weight even without lure words in the name', () => {
  assert.equal(skeleton('应该没人比我玩的开了吧 🐱🦢 我福不黑不信你看'), skeleton('应该没人比我玩的开了吧😀我福不黑不信你看。'));
  const plain = { kind:'reply', handle:'fixture_plain', displayName:'Plain', text:'应该没人比我玩的开了吧我福不黑不信你看', author:{followers:500} };
  assert.equal(spamSignals(plain, 0).fold, true, 'two template phrases are enough');
  const generic = { kind:'reply', handle:'fixture_plain', displayName:'Plain', text:'这个观点太对了大家都来看看吧', author:{followers:500} };
  assert.equal(spamSignals(generic, 3).fold, false, 'repetition without any lure word stays below threshold');
});
test('allowlist and the off switch both win over the built-in guard', () => {
  const settings = normalizeSettings({});
  assert.equal(decide(lure[0], null, { ...settings, allowlist: ['annafixturexq'] }).collapse, false);
  assert.equal(decide(lure[0], null, { ...settings, spamGuard: false }).collapse, false);
});
test('accounts you follow are never hidden by the built-in guard', () => {
  const followed = { ...lure[0], author: { ...lure[0].author, youFollow: true } };
  assert.equal(decide(followed, null, normalizeSettings({})).collapse, false);
});
