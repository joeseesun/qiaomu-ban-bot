// User choices, never model predictions. Prefer stable IDs when both are known.
const handle = value => typeof value === 'string' && /^@?\w{1,15}$/.test(value) ? value.replace(/^@/, '').toLowerCase() : '';
export function sameAccount(rule, item) {
  const id = item.author?.userId || item.userId;
  return rule.userId && id ? rule.userId === id : rule.handle === handle(item.handle);
}
export function normalizeAccountRules(rows) {
  return (Array.isArray(rows) ? rows : []).filter(r => r && handle(r.handle) && ['ai','human'].includes(r.label)).map(r => ({
    handle: handle(r.handle), userId: /^\d{1,25}$/.test(r.userId || '') ? r.userId : '',
    label: r.label, key: typeof r.key === 'string' ? r.key : '', at: Number.isFinite(r.at) ? r.at : 0,
  }));
}
export function accountRule(item, settings, owner = '') {
  if (owner && handle(item.handle) === handle(owner)) return 'self';
  if (settings.allowlist.includes(handle(item.handle))) return 'human';
  if (settings.blocklist.includes(handle(item.handle))) return 'ai';
  return settings.accountRules?.find(r => sameAccount(r, item))?.label || '';
}
export function setAccountRule(rows, item, label, key, at = Date.now()) {
  const next = (rows || []).filter(r => !sameAccount(r, item));
  if (label) next.unshift({handle:handle(item.handle), userId:item.author?.userId || '', label, key, at});
  return next;
}
export function accountHandles(settings, label) {
  const explicit = label === 'human' ? settings.allowlist : settings.blocklist;
  return [...new Set([...explicit, ...(settings.accountRules || [])
    .filter(r => r.label === label && !settings.allowlist.includes(r.handle) && !settings.blocklist.includes(r.handle))
    .map(r => r.handle)])];
}
