// Optional maintainer smoke test. live.py supplies credentials over stdin.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const { apiKey, baseUrl } = JSON.parse(input);
const origin = new URL(baseUrl).origin;
const modelId = 'deepseek/deepseek-flash';
const output = path.resolve('artifacts/writer-live/client.mjs');
await mkdir(path.dirname(output), { recursive: true });
await build({
  stdin: { contents: "export {streamChat} from './src/writer/utils/chat-llm';export {generalSettings} from './src/writer/utils/storage-utils';", resolveDir: process.cwd() },
  bundle: true, platform: 'node', format: 'esm', outfile: output, define: { DEBUG_MODE: 'false' },
  plugins: [{ name: 'isolated-test-browser', setup(b) {
    b.onResolve({ filter: /^webextension-polyfill$/ }, () => ({ path: 'browser', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: "export const permissions={contains:async()=>true};export const storage={local:{get:async()=>({}),set:async()=>{throw Error('Live credentials must not be persisted')}}};export const runtime={getURL:p=>p};" }));
  }}],
});
const { streamChat, generalSettings } = await import(output);
generalSettings.providers = [{ id: 'live', name: 'Magpie', baseUrl, apiKey, apiKeyRequired: true }];
const originalFetch = globalThis.fetch;
let calls = 0, deltas = 0;
globalThis.fetch = (url, init) => {
  if (new URL(url).origin !== origin) throw Error('Unexpected destination');
  const body = JSON.parse(init.body);
  if (body.model !== modelId || body.stream !== true || ++calls > 1) throw Error('Unexpected request');
  return originalFetch(url, { ...init, body: JSON.stringify({ ...body, max_tokens: 256 }) });
};
try {
  const content = await streamChat({
    model: { id: 'flash', providerId: 'live', providerModelId: modelId, name: 'Flash', enabled: true },
    system: '用中文回答，最多一句话，不用工具。',
    messages: [{ role: 'user', content: '请为一篇关于做好阅读笔记的文章写一个不超过15字的标题。' }],
    signal: AbortSignal.timeout(45000), reasoningEffort: 'none', onDelta: () => { deltas++; },
  });
  if (!content.trim() || !deltas) throw Error('No streamed content');
  const report = { model: modelId, calls, deltas, content, at: new Date().toISOString() };
  await writeFile(path.join(path.dirname(output), 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch {
  console.error('Writer live smoke failed; credentials and raw error were not logged.');
  process.exitCode = 1;
}
