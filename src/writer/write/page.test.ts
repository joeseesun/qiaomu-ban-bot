// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, expect, it, vi } from 'vitest';

const { publish, saveFailure } = vi.hoisted(() => ({ publish: vi.fn(), saveFailure: { value: false } }));
vi.mock('./publish/x', () => ({ publishToX: publish }));
vi.mock('./articles', async original => {
	const actual = await original<typeof import('./articles')>();
	return { ...actual, saveArticle: (...args: Parameters<typeof actual.saveArticle>) => {
		if (saveFailure.value) throw new Error('storage unavailable');
		return actual.saveArticle(...args);
	} };
});
vi.mock('../utils/storage-utils', () => ({
	loadSettings: async () => {}, generalSettings: { providers: [], models: [] },
	getLocalStorage: async () => undefined, setLocalStorage: async () => {},
}));
vi.mock('./ai/chat-panel', () => ({ mountChatPanel: () => ({ toggle: async () => {}, isOpen: () => false }) }));
import { resetDbConnection } from './db';
import { getArticle } from './articles';
import { startWritePage } from './page';

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory(); resetDbConnection();
	publish.mockReset(); saveFailure.value = false;
	document.body.innerHTML = '<main id="root"></main>';
	history.replaceState(null, '', '/write.html');
	HTMLElement.prototype.scrollIntoView = () => {};
	(globalThis as any).ResizeObserver = class { observe() {} disconnect() {} };
});
const button = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === '发布到 X')!;
async function prepare() {
	await startWritePage(document.getElementById('root')!);
	const title = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="标题"]')!;
	title.value = '最新标题'; title.dispatchEvent(new Event('input'));
	document.querySelector<HTMLButtonElement>('button[aria-label="Markdown 源码"]')!.click();
	const body = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown 源码"]')!;
	body.value = '刚改好的正文。'; body.dispatchEvent(new Event('input'));
	return button();
}

it('one click saves the latest text and goes directly to X without a platform menu or duplicate request', async () => {
	let finish!: () => void;
	publish.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
	const send = await prepare();
	expect(send.hasAttribute('aria-haspopup')).toBe(false);
	send.click(); send.click();
	await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
	expect(document.querySelector('[role="menu"]')).toBeNull();
	expect(send.disabled).toBe(true);
	const request = publish.mock.calls[0][0];
	expect(request).toMatchObject({ article: { title: '最新标题' }, markdown: '刚改好的正文。' });
	expect(await getArticle(request.article.id)).toMatchObject({ title: '最新标题', markdown: '刚改好的正文。' });
	finish();
	await vi.waitFor(() => expect(send.disabled).toBe(false));
});

it('keeps the article here if saving fails, then allows retry', async () => {
	const send = await prepare();
	saveFailure.value = true;
	send.click();
	await vi.waitFor(() => expect(document.querySelector('.qw-toast')?.textContent).toContain('保存问题'));
	expect(publish).not.toHaveBeenCalled();
	expect(send.disabled).toBe(false);
	saveFailure.value = false;
	send.click();
	await vi.waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
});
