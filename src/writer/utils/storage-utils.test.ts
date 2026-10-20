import { afterEach, expect, it, vi } from 'vitest';
import browser from './browser-polyfill';
import { generalSettings, loadSettings, saveSettings, WRITING_SETTINGS_KEY } from './storage-utils';
afterEach(() => vi.restoreAllMocks());
it('keeps writing model credentials in a separate local namespace from Jev', async () => {
  const set = vi.spyOn(browser.storage.local, 'set').mockResolvedValue();
  await saveSettings({ providers: [{ id: 'fixture', baseUrl: 'https://writing.example/v1', apiKey: 'test-only' }], models: [], jev: { apiKey: 'must-not-copy' } });
  expect(Object.keys(set.mock.calls[0][0])).toEqual([WRITING_SETTINGS_KEY]);
  expect(JSON.stringify(set.mock.calls)).not.toContain('must-not-copy');
});
it('does not change live settings on failed persistence and recovers for the next save', async () => {
  generalSettings.providers = [];
  const set = vi.spyOn(browser.storage.local, 'set').mockRejectedValueOnce(new Error('quota')).mockResolvedValue();
  await expect(saveSettings({ providers: [{ id: 'failed' }], models: [] })).rejects.toThrow('quota');
  expect(generalSettings.providers).toEqual([]);
  await saveSettings({ providers: [{ id: 'ok' }], models: [] });
  expect(generalSettings.providers).toEqual([{ id: 'ok' }]);expect(set).toHaveBeenCalledTimes(2);
});
it('restores the selected model without consulting sync storage', async () => {
  vi.spyOn(browser.storage.local, 'get').mockResolvedValue({ [WRITING_SETTINGS_KEY]: { providers: [{ id: 'p' }], models: [{ id: 'm' }], interpreterModel: 'm' } });
  const sync = vi.spyOn(browser.storage.sync, 'get');
  await loadSettings();expect(generalSettings.interpreterModel).toBe('m');expect(sync).not.toHaveBeenCalled();
});
