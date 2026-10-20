import browser from './browser-polyfill';
export function serviceOrigin(input: string | URL): string {
  const url = new URL(String(input));
  if(url.username || url.password || url.hash || !(url.protocol === 'https:' || url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('模型地址只支持 HTTPS 或本机 HTTP，且不能包含账号或密码。');
  return url.origin + '/*';
}
export async function authorizeServices(urls: Array<string | URL>): Promise<void> {
  const origins = [...new Set(urls.filter(Boolean).map(serviceOrigin))];
  if(origins.length && !(await browser.permissions.request({origins}))) throw new Error('未允许访问这个服务，请点击保存并允许连接。');
}
export async function serviceFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  init.signal?.throwIfAborted();
  const origin = serviceOrigin(input);
  // Offscreen documents expose runtime only; the trusted background checks permissions.
  const allowed = browser.permissions?.contains
    ? await browser.permissions.contains({origins:[origin]})
    : (await browser.runtime.sendMessage({action:'writerServicePermission',url:String(input)}))?.allowed;
  if(!allowed) throw new Error('这个服务尚未授权。请到模型设置重新保存并允许连接。');
  init.signal?.throwIfAborted();
  return globalThis.fetch(input,{...init,credentials:'omit',redirect:'error'});
}
export function authorizeAccount(kind: string): Promise<void> {
  const urls: Record<string,string[]> = {
    codex:['https://auth.openai.com','https://chatgpt.com','http://localhost:1455'],
    chatgpt:['https://auth.openai.com','https://api.openai.com','http://127.0.0.1:1455'],
    openrouter:['https://openrouter.ai','http://localhost:1455'],
    tokendance:['https://tokendance.space','http://127.0.0.1:1455'],
  };
  return authorizeServices(urls[kind] || []);
}
export async function authorizeNativeHelper(): Promise<void> {
  if (!await browser.permissions.request({permissions:['nativeMessaging']})) throw new Error('尚未允许连接本机 Codex。请重新保存并允许连接。');
}
export async function authorizeSearch(provider: string): Promise<void> {
  const origins = provider === 'brave' ? ['https://*/*'] : ['https://api.deepseek.com/*'];
  if (!await browser.permissions.request({origins})) throw new Error('未允许访问搜索服务，请重新验证并允许连接。');
}
