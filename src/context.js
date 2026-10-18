export function senderContext(sender, runtime) {
  if (sender.id !== runtime.id) return 'none';
  try {
    const url = new URL(sender.url || '');
    const ui = new URL(runtime.getURL('ui.html'));
    if (url.protocol === ui.protocol && url.host === ui.host && url.pathname === ui.pathname) return 'admin';
    if (url.protocol === 'https:' && ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname) && sender.tab && sender.frameId === 0) return 'content';
  } catch {}
  return 'none';
}
