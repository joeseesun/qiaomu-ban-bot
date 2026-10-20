// Local lure detection for sex-service and traffic-diversion accounts, the
// "同城上门 / 线下选妃 / 我福不黑不信你看" pattern. No model call. Each public cue
// adds a capped weight; a reply folds only when the sum reaches THRESHOLD and at
// least one cue is about the words themselves, so no account trait or single
// innocent word hides anything. Folding is reversible and never touches the X
// account (no block, no report); it judges this reply's lure text, not whether
// the account is a bot.
export const THRESHOLD = 4;
// Word cues alone must carry at least this much: a name with only service words
// (同城线下读书会) never folds, however small or new the account is.
const WORDS_MIN = 2.5;
const norm = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s​-‏⁠-⁯]+/g, '');
// Text with emoji, punctuation and symbols removed: lure templates rotate emoji.
export const skeleton = s => norm(s).replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️\p{P}\p{S}]/gu, '');

// Display-name words with no common innocent reading.
const EXPLICIT = ['选妃', '约炮', '约p', '外围', '楼凤', '包夜', '福利姬', '全套', '私约', '裸聊', '一夜情', '炮友', '莞式', '大保健', '上门服务', '援交'];
// Service words that also have innocent uses (同城快递, 线下活动, 品茶).
const SERVICE = ['同城', '上门', '线下', '空降', '兼职', '学生妹', '可约', '陪玩', '视频聊', '小姐姐', '品茶', '喝茶', '会所', '按摩', '足疗', '修车', '看主页', '主页有', '点主页', '资源'];
// Reply and bio template phrases seen across lure accounts.
const PHRASE = ['福不黑', '不信你看', '玩的开', '玩得开', '看我主页', '主页有惊喜', '主页有福利', '主页看', '点我头像', '看我简介', '简介有', '看置顶', '置顶有', '私我', '滴滴我', '懂的来', '你懂的', '约吗', '可以约', '同城约', '来找我', '寂寞了', '想要的来', '带你飞', '免费看', '一对一', '加v', '加微', '加我v', 'vx', '薇信', '飞机号', '有偿'];

const hits = (text, list) => list.filter(w => text.includes(w));
const add = (out, weight, reason) => { if (weight > 0) out.push({ weight, reason }); };

/**
 * @param item  extracted reply: displayName, handle, text, author.{followers,bio}
 * @param twins other authors on this page whose reply has the same skeleton
 *              (same words, different emoji), counted by the content script
 */
export function spamSignals(item, twins = item?.templateTwins || 0) {
  const name = norm(item?.displayName), text = norm(item?.text), bio = norm(item?.author?.bio);
  const explicit = hits(name, EXPLICIT);
  const service = hits(name, SERVICE).filter(w => !explicit.some(e => e.includes(w)));
  const phrases = hits(text, PHRASE), bioPhrases = hits(bio, PHRASE).filter(w => !phrases.includes(w));
  const followers = item?.author?.followers;
  const words = [], traits = [];
  add(words, Math.min(explicit.length * 3, 4), `名字含「${explicit.slice(0, 2).join('、')}」`);
  add(words, Math.min(service.length * 1.5, 2), `名字含「${service.slice(0, 2).join('、')}」`);
  add(words, Math.min(phrases.length * 2, 4), `正文含「${phrases.slice(0, 2).join('、')}」`);
  add(words, Math.min(bioPhrases.length * 1.5, 2), `简介含「${bioPhrases[0]}」`);
  const sk = skeleton(item?.text);
  add(words, sk.length >= 8 && twins > 0 ? Math.min(1 + twins, 3) : 0, `${twins + 1} 个账号发同一模板`);
  // Account traits only support word cues; together they stay below 4.
  if (typeof followers === 'number') add(traits, followers <= 10 ? 1.5 : followers <= 50 ? 1 : 0, `关注者 ${followers}`);
  add(traits, /\p{Script=Han}/u.test(item?.displayName || '') && /^[a-z]{7,}$/i.test(item?.handle || '') ? .5 : 0, '中文名配纯字母账号');
  add(traits, item?.text && !sk ? 1 : 0, '只有表情');
  const parts = [...words, ...traits].sort((a, b) => b.weight - a.weight);
  const score = +parts.reduce((s, p) => s + p.weight, 0).toFixed(1);
  return {
    score, fold: score >= THRESHOLD && words.reduce((n, p) => n + p.weight, 0) >= WORDS_MIN,
    reasons: parts.map(p => p.reason),
    terms: [...explicit, ...service, ...phrases].slice(0, 4),
  };
}
