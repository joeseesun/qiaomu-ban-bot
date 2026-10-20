import browser from './browser-polyfill';
import type { ModelConfig, Provider } from '../types/types';
export type { ModelConfig, Provider };
export const WRITING_SETTINGS_KEY = 'qiaomuXWritingModels';
export let generalSettings: any = { providers: [], models: [], interpreterEnabled: true, interpreterAutoRun: false, interpreterModel: '', defaultPromptContext: '' };
let writes: Promise<void> = Promise.resolve();
export async function loadSettings(): Promise<any> {
  const saved = await getLocalStorage(WRITING_SETTINGS_KEY);
  if (saved && typeof saved === 'object') generalSettings = { ...generalSettings, ...saved, providers: Array.isArray(saved.providers) ? saved.providers : [], models: Array.isArray(saved.models) ? saved.models : [] };
  return generalSettings;
}
export async function saveSettings(value = generalSettings): Promise<void> {
  const next = structuredClone({ providers: value.providers, models: value.models, interpreterModel: value.interpreterModel || '', interpreterEnabled: true, interpreterAutoRun: false, defaultPromptContext: value.defaultPromptContext || '' });
  const pending = writes.catch(() => {}).then(() => setLocalStorage(WRITING_SETTINGS_KEY, next));
  writes = pending; await pending;
  if (value !== generalSettings) Object.assign(generalSettings, next);
}
export async function setLocalStorage(key: string, value: any): Promise<void> { await browser.storage.local.set({[key]: value}); }
export async function getLocalStorage(key: string): Promise<any> { return (await browser.storage.local.get(key))[key]; }
