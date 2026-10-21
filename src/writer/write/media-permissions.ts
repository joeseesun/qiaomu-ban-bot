import browser from '../utils/browser-polyfill';
import { t } from '../utils/ui-text';
import { isBuiltinMediaOrigin } from '../../media-hosts.js';

// Request only the hosts of this article's media, from the original click handler.
// In particular, do not wait for IndexedDB saves before permissions.request().
export function remoteMediaOrigins(sources: string[]): string[] {
	return [...new Set(sources.filter(source => /^https?:\/\//i.test(source)).map(source => {
		const url = new URL(source);
		if (url.username || url.password) throw new Error(t('图片地址不能包含账号或密码'));
		return `${url.protocol}//${url.hostname}/*`;
	}))];
}

export async function authorizeRemoteMedia(sources: string[]): Promise<void> {
	const origins = remoteMediaOrigins(sources).filter(origin => !isBuiltinMediaOrigin(origin));
	if (origins.length && !await browser.permissions.request({ origins })) {
		throw new Error(t('尚未允许读取文章里的网络图片和视频，请重新点击并允许访问图片源站。'));
	}
}

export async function requireRemoteMediaAccess(sources: string[]): Promise<void> {
	const origins = remoteMediaOrigins(sources);
	if (origins.length && !await browser.permissions.contains({ origins })) {
		throw new Error(t('文章的图片源站尚未授权，请重新点击“发布到 X”并允许访问。'));
	}
}
