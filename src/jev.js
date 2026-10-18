import { resolveConnection } from './connection.js';
import { buildRequest, parseResponse } from './core.js';
export async function analyze(item, settings, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error('请先在模型设置中保存 API Key');
  const payload = buildRequest(item, settings);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(resolveConnection(settings).endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload), signal: controller.signal, credentials: 'omit', redirect: 'error',
    });
    if (!response.ok) {
      const error = new Error(response.status === 401 || response.status === 403 ? '模型服务拒绝认证，请检查 API Key 与服务商' : response.status === 429 ? '模型服务限流，已暂停 60 秒' : `模型服务 HTTP ${response.status}，稍后重试`);
      error.status = response.status;
      throw error;
    }
    return parseResponse(await response.json(), Object.keys(payload.questions));
  } catch (error) {
    if (controller.signal.aborted) throw new Error('模型请求超过 20 秒，已保留原文');
    if (error instanceof SyntaxError) throw new Error('模型返回的内容不是有效 JSON，已保留原文');
    if (error instanceof TypeError) throw new Error('无法连接模型服务，请检查网络与服务访问权限');
    throw error;
  } finally { clearTimeout(timer); }
}
