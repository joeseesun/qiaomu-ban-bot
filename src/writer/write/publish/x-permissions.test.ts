// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import browser from '../../utils/browser-polyfill';
import { authorizeRemoteMedia, remoteMediaOrigins } from '../media-permissions';
import { BUILTIN_MEDIA_HOST_PERMISSIONS, isBuiltinMediaOrigin } from '../../../media-hosts.js';
import { authorizeXMedia, publishToX } from './x';
import type { PublishRequest } from './types';

const driver = vi.hoisted(() => ({ open: vi.fn(), inject: vi.fn(), connect: vi.fn() }));
vi.mock('../../x-publish/driver', () => ({ openComposeTab: driver.open, injectEngine: driver.inject, connect: driver.connect }));
vi.mock('../articles', () => ({ recordPublish: vi.fn() }));
const article = (markdown: string) => ({ id: 'fixture', title: 'Fixture', markdown, coverImageId: '' });
const request = (markdown: string) => ({ article: article(markdown), markdown, onRecorded: vi.fn() } as unknown as PublishRequest);

beforeEach(() => {
	document.body.innerHTML = '';
	HTMLDialogElement.prototype.showModal = function() { this.open = true; };
	HTMLDialogElement.prototype.close = function() { this.open = false; };
	vi.spyOn(browser.permissions, 'request').mockResolvedValue(true);
	vi.spyOn(browser.permissions, 'contains').mockResolvedValue(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('requests only distinct article media hosts immediately and excludes local, generated and data assets', async () => {
	const task = authorizeXMedia(article('![a](https://images.example/a.png#imgIndex=1)\n![b](https://images.example/b.gif)\n![local](qm-image://img_local)\n![inline](data:image/png;base64,YQ==)\n```mermaid\ngraph TD; A-->B;\n```\nhttps://video.example/clip.mp4\n[ordinary link](https://other.example)'));
	expect(browser.permissions.request).toHaveBeenCalledWith({ origins: ['https://images.example/*', 'https://video.example/*'] });
	await task;
	expect(remoteMediaOrigins(['http://images.example:8080/a.png', 'https://IMAGES.example/b.png'])).toEqual(['http://images.example/*', 'https://images.example/*']);
});

it('built-in public CDNs need no runtime request, while unknown hosts are still detected automatically', async () => {
	await authorizeXMedia(article('![wechat](https://mmbiz.qpic.cn/a.gif)\n![x](https://pbs.twimg.com/media/a.jpg)\n![zhihu](https://pic4.zhimg.com/a.jpg)\n![stock](https://images.unsplash.com/a.jpg)'));
	expect(browser.permissions.request).not.toHaveBeenCalled();
	await authorizeXMedia(article('![known](https://mmbiz.qpic.cn/a.gif)\n![custom](https://my-blog.example/a.png)'));
	expect(browser.permissions.request).toHaveBeenCalledWith({ origins: ['https://my-blog.example/*'] });
	expect(isBuiltinMediaOrigin('https://pic4.zhimg.com/*')).toBe(true);
	for (const origin of ['https://evilzhimg.com/*', 'https://zhimg.com.evil.example/*', 'http://mmbiz.qpic.cn/*', 'https://x.com/*']) expect(isBuiltinMediaOrigin(origin)).toBe(false);
	expect(BUILTIN_MEDIA_HOST_PERMISSIONS).not.toContain('https://*/*');
});

it('keeps media URL credentials out of permission requests and handles denial', async () => {
	await expect(authorizeRemoteMedia(['https://user:secret@images.example/a.png'])).rejects.toThrow('账号或密码');
	expect(browser.permissions.request).not.toHaveBeenCalled();
	vi.mocked(browser.permissions.request).mockResolvedValue(false);
	await expect(authorizeRemoteMedia(['https://images.example/a.png'])).rejects.toThrow('尚未允许');
});

it('stops before downloading or opening X when a media host is not granted', async () => {
	vi.mocked(browser.permissions.contains).mockResolvedValue(false);
	const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
	await publishToX(request('![a](https://images.example/a.png)'));
	expect(fetch).not.toHaveBeenCalled();
	expect(driver.open).not.toHaveBeenCalled();
	expect(document.querySelector('dialog')?.textContent).toContain('源站尚未授权');
	expect(document.querySelector('dialog')?.textContent).toContain('尚未打开 X');
	expect(document.querySelector('dialog')?.textContent).not.toContain('当前草稿');
});

it('does not contact X when any of 25 granted media downloads fails', async () => {
	const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')); vi.stubGlobal('fetch', fetch);
	await publishToX(request(Array.from({ length: 25 }, (_, i) => `![${i}](https://mmbiz.qpic.cn/${i}.png)`).join('\n')));
	expect(fetch).toHaveBeenCalledTimes(25);
	expect(driver.open).not.toHaveBeenCalled();
	expect(driver.connect).not.toHaveBeenCalled();
	expect(document.querySelector('dialog')?.textContent).toContain('25 项媒体');
});
