import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { icons } from './icons.mjs';
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'dist/chrome');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await cp(path.join(root, 'public'), output, { recursive: true });
await cp(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
await cp(path.join(root, 'node_modules/lucide/LICENSE'), path.join(output, 'LICENSE.lucide'));
await cp(path.join(root, 'node_modules/pinyin-pro/LICENSE'), path.join(output, 'LICENSE.pinyin-pro'));
await icons(output);
await Promise.all(['background', 'content', 'mentions', 'bookmark-content', 'ui'].map(name => build({ entryPoints: [path.join(root, `src/${name}.js`)], bundle: true, outfile: path.join(output, `${name}.js`), format: name === 'background' ? 'esm' : 'iife', target: 'chrome120', minify: false, legalComments: 'eof' })));
const manifest = {
  manifest_version: 3, name: '乔木 X 助手 · Qiaomu X Helper', version: pkg.version,
  description: '用 Jev 整理 X 回复，记录常用 @ 联系人，追踪你看好的帖子，导出本机书签。', minimum_chrome_version: '120',
  permissions: ['storage'], host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'],
  optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_icon: {16:'icons/icon-16.png',32:'icons/icon-32.png'}, default_popup: 'ui.html?popup=1', default_title: '乔木 X 助手' },
  options_page: 'ui.html',
  icons: { 16: 'icons/icon-16.png', 32:'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  content_scripts: [{ matches: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'], js: ['content.js','mentions.js','bookmark-content.js'], css: ['content.css'], run_at: 'document_idle', all_frames: false }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
};
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Chrome MV3 ${pkg.version}: ${output} (${(await readdir(output)).length} files)`);
