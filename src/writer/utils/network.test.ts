import { afterEach, expect, it, vi } from 'vitest';
import browser from './browser-polyfill';
import { authorizeServices, serviceFetch, serviceOrigin } from './network';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('requests only selected service origins and rejects credential URLs or insecure remote hosts', async () => {
  const request = vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
  await authorizeServices(['https://gateway.example/v1/models', 'https://gateway.example/v1/chat/completions', 'http://localhost:11434/api/tags']);
  expect(request).toHaveBeenCalledWith({ origins: ['https://gateway.example/*', 'http://localhost:11434/*'] });
  for (const url of ['http://remote.example/v1', 'https://user:secret@remote.example/v1', 'file:///tmp/a', 'https://remote.example/#key']) expect(() => serviceOrigin(url)).toThrow();
});
it('does not send a key before permission and disables cookies and credential redirects', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('ok')); vi.stubGlobal('fetch', fetch);
  const contains = vi.spyOn(browser.permissions, 'contains').mockResolvedValue(false);
  await expect(serviceFetch('https://a.example/v1', { headers: { Authorization: 'Bearer fixture' } })).rejects.toThrow('授权');
  expect(fetch).not.toHaveBeenCalled();
  contains.mockResolvedValue(true);
  await serviceFetch('https://a.example/v1', { credentials: 'include', redirect: 'follow', headers: { Authorization: 'Bearer fixture' } });
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' });
});
it('denied permission can be retried without saving anything', async () => {
  vi.spyOn(browser.permissions, 'request').mockResolvedValue(false);
  await expect(authorizeServices(['https://a.example'])).rejects.toThrow('未允许');
});
it('offscreen requests check authorization through runtime before sending any credential', async () => {
  const check = vi.spyOn(browser.permissions, 'contains').mockImplementation(undefined as any);
  const message = vi.spyOn(browser.runtime, 'sendMessage').mockResolvedValue({allowed:false});
  const fetch = vi.fn().mockResolvedValue(new Response('ok')); vi.stubGlobal('fetch',fetch);
  // MV3 offscreen pages do not expose the permissions namespace.
  const saved = browser.permissions.contains;
  (browser.permissions as any).contains = undefined;
  try {
    await expect(serviceFetch('https://images.example/v1',{headers:{Authorization:'Bearer fixture'}})).rejects.toThrow('授权');
    expect(fetch).not.toHaveBeenCalled();
    message.mockResolvedValue({allowed:true});
    await serviceFetch('https://images.example/v1');
    expect(message).toHaveBeenLastCalledWith({action:'writerServicePermission',url:'https://images.example/v1'});
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { browser.permissions.contains = saved; check.mockRestore(); }
});
