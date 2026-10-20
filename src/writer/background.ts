import { handleImageJobs } from './utils/image-job-background';
import { handleChatToolPort } from './utils/chat-tools-background';
import { serviceOrigin } from './utils/network';

export function writerMessage(message: any): boolean {
  return message?.target === 'image-runner' || message?.action === 'writerServicePermission'
    || /^(?:imageJob(?:Submit|Cancel|Ensure|Changed)|codexImage(?:Status|Start|Poll|Read|Cancel))$/.test(message?.action || '');
}

export function registerWriterBackground(): void {
  chrome.runtime.onConnect.addListener(handleChatToolPort);
  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request?.action === 'writerServicePermission') {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || sender.tab?.incognito) {
        respond({allowed:false}); return;
      }
      void (async () => {
        try { respond({allowed:await chrome.permissions.contains({origins:[serviceOrigin(request.url)]})}); }
        catch { respond({allowed:false}); }
      })();
      return true;
    }
    const result = handleImageJobs(request, sender);
    if (!result) return;
    void result.then(respond, () => respond({ok:false,error:'写作服务连接失败，请重试。'}));
    return true;
  });
}
