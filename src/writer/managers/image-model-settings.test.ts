// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { initializeImageModelSettings } from './image-model-settings';
import { loadImageModels, saveImageModels } from '../write/image-models';
vi.mock('../write/image-models', async importOriginal => ({
  ...await importOriginal<any>(),
  loadImageModels: vi.fn(), saveImageModels: vi.fn(),
}));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text)!;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveImageModels).mockReset().mockResolvedValue();
  vi.mocked(loadImageModels).mockResolvedValue({ models: [{ id: 'one', name: 'Fixture', sourceId: 'custom', engine: 'api', baseUrl: 'https://first.example/v1', apiKey: 'first-key', model: 'image-model', models: ['image-model'] }], defaultId: 'one' });
  document.body.innerHTML = '<div id="image-models-home"></div>';
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
it('clears the old service credential when its endpoint changes', async () => {
  await initializeImageModelSettings();
  document.querySelector<HTMLButtonElement>('[aria-label="编辑"]')!.click();
  const address=document.querySelector<HTMLInputElement>('input[placeholder="https://…/v1"]')!;
  address.value='https://second.example/v1';address.dispatchEvent(new Event('input'));
  expect(document.querySelector<HTMLInputElement>('input[type=password]')!.value).toBe('');
  button('保存').click();await tick();
  expect(saveImageModels).not.toHaveBeenCalled();
});
it('keeps the dialog and existing settings after a failed save and permits retry', async () => {
  vi.mocked(saveImageModels).mockRejectedValueOnce(new Error('quota')).mockResolvedValue();
  await initializeImageModelSettings();document.querySelector<HTMLButtonElement>('[aria-label="编辑"]')!.click();
  button('保存').click();await tick();
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect(document.querySelector('[role=alert]')?.textContent).toContain('quota');
  button('保存').click();await tick();
  expect(saveImageModels).toHaveBeenCalledTimes(2);expect(document.querySelector('dialog')).toBeNull();
});
it('ignores repeated save clicks until persistence completes', async () => {
  let finish!: () => void;vi.mocked(saveImageModels).mockImplementation(()=>new Promise(resolve=>finish=resolve));
  await initializeImageModelSettings();document.querySelector<HTMLButtonElement>('[aria-label="编辑"]')!.click();
  const save=button('保存');save.click();save.click();await tick();
  expect(saveImageModels).toHaveBeenCalledTimes(1);expect(save.disabled).toBe(true);
  finish();await tick();expect(document.querySelector('dialog')).toBeNull();
});
