// Thread-level cues for reply farms. A single reply rarely reveals generation;
// a burst of replies that restate the root's headline figures, add a stock
// reaction and a generic takeaway does. These are cues for the model, never a
// verdict by themselves, and every input is public text already on the page.
const norm = text => String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const bigrams = text => {
  const out = new Set();
  for (const run of norm(text).match(/[\p{Script=Han}]+|[a-z0-9.%]+/gu) || []) {
    if (/\p{Script=Han}/u.test(run)) for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2));
    else if (run.length > 1) out.add(run);
  }
  return out;
};
const overlap = (a, b) => { let n = 0; for (const t of a) if (b.has(t)) n++; return n; };
// Figures worth echoing: percentages, decimals and multi-digit numbers. Single
// digits and list markers are too common to mean anything.
export const figures = text => [...new Set((norm(text).match(/\d+(?:\.\d+)?%|\d+\.\d+|\d{2,}/g) || []))];
const sentences = text => norm(text).split(/[\n。！？!?；;]+/u).map(s => s.replace(/^[①-⑳\d.、)\s]+/u, '').trim()).filter(s => Array.from(s).length >= 6);

// Stock reactions and moves that reply farms reuse across accounts. Human
// writers use them too, which is why only co-occurrence with echo matters.
const STOCK = [
  ['reaction', /太真实了|这个我信|我也不意外|一点不意外|倒不意外|也不意外|对得上|对上了|很反直觉|太反直觉|挺有意思|挺扎心|扎心|挺实|真没想到|出乎意料|太正常了|挺好理解/u],
  ['addendum', /^(补一句|补充一个|补个|另外|最反直觉的是|最实用的是|最值得)/u],
  ['takeaway', /说明|侧面说明|本质|护城河|终局|才是真|拼的(真)?不是|谁就|的竞争|的均衡|命门/u],
  ['contrast', /不是.{1,24}?(而是|，是|是)|未必是|与其说/u],
  ['persona', /我这边|身边(的|人|朋友|不)|我自己|做.{1,10}\d+\s*年|对给.{1,12}的人|工厂里|外贸|律师|科研/u],
  ['engage', /(想问下|想追问|好奇|你觉得|你身边|大家|有没有人).{0,60}[?？]?\s*$|[?？]\s*$/u],
  ['dash', /——|--/u],
];

export function threadCues(reply, root, siblings = []) {
  const text = String(reply?.text || ''), rootText = String(root?.text || '');
  const rootFigures = new Set(figures(rootText)), rootSentences = sentences(rootText).map(s => ({ s, g: bigrams(s) }));
  const echoedFigures = figures(text).filter(f => rootFigures.has(f));
  const opening = norm(text).slice(0, 28), openingGrams = bigrams(opening);
  let claim = -1, best = 0;
  rootSentences.forEach(({ g }, i) => { const n = overlap(openingGrams, g); if (n > best) { best = n; claim = i; } });
  const openingFigure = figures(opening).find(f => rootFigures.has(f));
  const opensWithEcho = Boolean(openingFigure) || best >= 4;
  const key = openingFigure || (best >= 4 ? 'claim:' + claim : '');
  const stock = STOCK.filter(([, re]) => re.test(norm(text))).map(([name]) => name);
  // Other authors who open on the same root figure or claim.
  const handle = String(reply?.handle || '').toLowerCase();
  const sameOpening = new Set();
  if (key) for (const s of siblings) {
    const author = String(s?.handle || '').toLowerCase();
    if (!author || author === handle || s.id === reply.id) continue;
    const o = norm(s.text).slice(0, 28), of = figures(o).find(f => rootFigures.has(f));
    let k = of || '';
    if (!k) { const g = bigrams(o); let b = 0, c = -1; rootSentences.forEach((r, i) => { const n = overlap(g, r.g); if (n > b) { b = n; c = i; } }); if (b >= 4) k = 'claim:' + c; }
    if (k === key) sameOpening.add(author);
  }
  return {
    echoedRootFigures: echoedFigures.slice(0, 6),
    opensByRestatingRoot: opensWithEcho,
    otherAuthorsOpeningTheSameWay: sameOpening.size,
    observedThreadReplies: siblings.length,
    stockMoves: stock,
    characters: Array.from(text).length,
  };
}

// A conservative local prior for when several independent cues line up. It
// never fires on a single trait and stays well below certainty.
export function farmPrior(c) {
  if (!c || !c.opensByRestatingRoot) return 0;
  const moves = new Set(c.stockMoves);
  const content = ['takeaway', 'contrast', 'persona', 'engage', 'addendum'].filter(m => moves.has(m)).length;
  const cluster = c.observedThreadReplies >= 8 && c.otherAuthorsOpeningTheSameWay >= 3;
  let p = 0;
  if (cluster) p += .35;
  if (moves.has('reaction')) p += .15;
  p += Math.min(content, 3) * .12;
  if (c.characters >= 40) p += .05;
  return Math.min(.85, +p.toFixed(2));
}
