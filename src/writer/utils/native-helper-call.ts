import browser from './browser-polyfill';

// The background restricts this bridge to Codex image actions.
export async function callHelper(payload: unknown): Promise<any> {
  if (!await browser.permissions.contains({permissions:['nativeMessaging']})) throw new Error('请先在配图设置中允许连接本机 Codex。');
  try {
    return await browser.runtime.sendNativeMessage('ai.qiaomu.clipper', payload);
  } catch (error) {
    const reason = String((error as Error)?.message || error);
    if (/forbidden|not allowed/i.test(reason)) throw new Error(`本地助手尚未允许 X 助手连接。请给已安装的乔木助手注册扩展 ID：${browser.runtime.id}`);
    if (/not found|not exist/i.test(reason)) throw new Error('尚未安装乔木本地助手。请先安装支持 Codex 生图的最新版助手。');
    throw new Error('本地助手连接失败。请检查 Codex 登录状态并更新乔木本地助手。');
  }
}
