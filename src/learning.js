// Examples personalize a request; they do not train Jev's weights. Keep them
// diverse and exclude the evaluated text, even when it has a different X ID.
const normalized = text => String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
function tokens(text) {
  const parts = normalized(text).match(/[a-z0-9]{2,}|[\p{Script=Han}]+/gu) || [];
  return new Set(parts.flatMap(p => /\p{Script=Han}/u.test(p) ? Array.from({length:Math.max(0,p.length-1)},(_,i)=>p.slice(i,i+2)) : [p]));
}
function similarity(a,b) {
  const overlap = [...a].filter(t=>b.has(t)).length;
  return overlap / Math.max(1,a.size+b.size-overlap);
}
export function examplesFor(learning, item) {
  const groups = new Map(), target = normalized(item.text);
  for (const e of learning) {
    const key = normalized(e.text);
    if (!key || !['ai','human'].includes(e.label)) continue;
    const group = groups.get(key) || {entry:e,labels:new Set(),self:false};
    group.labels.add(e.label); group.self ||= e.id === item.id || key === target;
    if (e.at > group.entry.at) group.entry = e;
    groups.set(key,group);
  }
  const textTokens=tokens(item.text), parentTokens=tokens(item.parent);
  const ranked=[...groups.values()].filter(g=>!g.self && g.labels.size===1).map(({entry:e})=>({e,
    score:similarity(textTokens,tokens(e.text)) + .35*similarity(parentTokens,tokens(e.parent)),
  })).sort((a,b)=>b.score-a.score || b.e.at-a.e.at);
  // At most three of either label; a one-sided history is never padded with
  // made-up labels. Text and parent, never author identity, enter the prompt.
  return ['ai','human'].flatMap(label=>ranked.filter(v=>v.e.label===label).slice(0,3).map(({e})=>({
    text:e.text.slice(0,400), parent:(e.parent||'').slice(0,200), label:e.label,
  })));
}
