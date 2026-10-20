import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

it('loads MathJax CommonJS chunks from the same split ESM format used by the extension', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'qx-mathjax-'));
  try {
    await build({
      stdin: { contents: "export {latexToSvg} from './src/writer/write/render-assets';", resolveDir: process.cwd() },
      bundle: true, format: 'esm', splitting: true, outdir: out, outExtension: { '.js': '.mjs' },
      minify: true, target: 'chrome120', define: { PACKAGE_VERSION: JSON.stringify('3.2.1') },
    });
    const module = await import(/* @vite-ignore */ pathToFileURL(path.join(out, 'stdin.mjs')).href);
    const svg = await module.latexToSvg('E=mc^2', true);
    expect(svg).toContain('<svg');expect(svg).toContain('<path');expect(svg).not.toContain('merror');
  } finally { await rm(out, { recursive: true, force: true }); }
});
