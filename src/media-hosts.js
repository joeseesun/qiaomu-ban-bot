// Public media hosts only. This list is shared by the manifest and writer so
// built-in sources do not request optional permission on every article.
export const BUILTIN_MEDIA_HOSTS = Object.freeze([
  'mmbiz.qpic.cn', 'mmbiz.qlogo.cn',
  'pbs.twimg.com', 'video.twimg.com',
  '*.zhimg.com', '*.sinaimg.cn', '*.hdslb.com', '*.xhscdn.com',
  'images.unsplash.com', 'images.pexels.com', 'i.imgur.com',
  'upload.wikimedia.org', 'raw.githubusercontent.com', 'user-images.githubusercontent.com',
  'miro.medium.com', 'cdn-images-1.medium.com', '*.substackcdn.com', 'cdn.nlark.com', '*.byteimg.com',
]);

export const BUILTIN_MEDIA_HOST_PERMISSIONS = BUILTIN_MEDIA_HOSTS.map(host => `https://${host}/*`);

export function isBuiltinMediaOrigin(origin) {
  const url = new URL(origin);
  return url.protocol === 'https:' && BUILTIN_MEDIA_HOSTS.some(host => host.startsWith('*.')
    ? url.hostname === host.slice(2) || url.hostname.endsWith(`.${host.slice(2)}`)
    : url.hostname === host);
}
