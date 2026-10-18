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
await icons(output);
await Promise.all(['background', 'content', 'ui'].map(name => build({ entryPoints: [path.join(root, `src/${name}.js`)], bundle: true, outfile: path.join(output, `${name}.js`), format: name === 'background' ? 'esm' : 'iife', target: 'chrome120', minify: false, legalComments: 'eof' })));
const manifest = {
  manifest_version: 3, name: '乔木净评 · Qiaomu Banbot', version: pkg.version,
  description: '用 Jev 折叠 X 上疑似 AI 与低质量回复，保留优质讨论，并估计主帖热度。', minimum_chrome_version: '120',
  permissions: ['storage'], host_permissions: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'],
  optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  background: { service_worker: 'background.js', type: 'module' },
  action: { default_icon: {16:'icons/icon-16.png',32:'icons/icon-32.png'}, default_popup: 'ui.html?popup=1', default_title: '乔木净评' },
  options_page: 'ui.html',
  icons: { 16: 'icons/icon-16.png', 32:'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  content_scripts: [{ matches: ['https://x.com/*', 'https://twitter.com/*', 'https://www.x.com/*', 'https://www.twitter.com/*'], js: ['content.js'], css: ['content.css'], run_at: 'document_idle', all_frames: false }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
};
await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Chrome MV3 ${pkg.version}: ${output} (${(await readdir(output)).length} files)`);
