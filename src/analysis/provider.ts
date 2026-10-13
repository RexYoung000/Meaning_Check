import type { AnalysisResponse, ContextBundle, Usage } from '../shared/types';
import { API_URL, MODEL, ANALYSIS_TIMEOUT_MS, HEADERS_TIMEOUT_MS } from '../shared/constants';
import { UserError, composeSignals, throwIfAborted } from '../shared/errors';
import { assertInputSize } from './context';
import { SYSTEM_PROMPT, userPrompt } from './prompt';
import { validateResult } from './validate';

export async function analyze(bundle: ContextBundle, apiKey: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<AnalysisResponse> {
  assertInputSize(bundle);
  const started = Date.now();
  const controller = new AbortController();
  const linked = composeSignals([signal, controller.signal]);
  const combined = linked.signal;
  const totalTimer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
  const headerTimer = setTimeout(() => controller.abort(), HEADERS_TIMEOUT_MS);
  try {
    throwIfAborted(combined);
    const response = await fetcher(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey }, signal: combined,
      body: JSON.stringify({ model: MODEL, thinking: { type: 'enabled' }, reasoning_effort: 'low', stream: true, response_format: { type: 'json_object' }, max_tokens: 4096, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt(bundle) }] }),
    });
    clearTimeout(headerTimer);
    if (!response.ok) {
      const descriptions: Record<number, string> = { 401: '密钥未被接受，请到设置页检查。', 402: '模型账户余额不足，请检查账户。', 429: '模型服务暂时限流，稍后手动重试。', 403: '模型服务拒绝访问，请检查账户与网络。' };
      throw new UserError('provider-http', descriptions[response.status] ?? '模型服务这次没有完成请求，请稍后重试。');
    }
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new UserError('provider-format', '模型服务没有返回预期的数据流。');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    let done = false;
    let finish: string | undefined;
    let usage: Usage | undefined;
    const processEvent = (event: string) => {
      const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
      if (!data) return;
      if (data === '[DONE]') { done = true; return; }
      let chunk: any;
      try { chunk = JSON.parse(data); } catch { throw new UserError('provider-format', '模型数据流不完整，请重新分析。'); }
      if (chunk.error) throw new UserError('provider-format', '模型数据流中断，请稍后重新分析。');
      const choice = chunk.choices?.[0];
      if (typeof choice?.delta?.content === 'string') content += choice.delta.content;
      if (choice?.delta?.tool_calls) throw new UserError('provider-format', '模型返回了不支持的结果。');
      if (choice?.finish_reason) finish = choice.finish_reason;
      const u = chunk.usage;
      if (u && [u.prompt_tokens, u.completion_tokens, u.total_tokens].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)) {
        usage = { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens };
      }
      if (content.length > 30_000) throw new UserError('provider-format', '模型输出过长，暂不展示。');
    };
    try {
      while (!done) {
        throwIfAborted(combined);
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        if (buffer.length > 200_000) throw new UserError('provider-format', '模型数据格式异常。');
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) { processEvent(buffer.slice(0, boundary.index)); buffer = buffer.slice(boundary.index + boundary[0].length); }
      }
      buffer += decoder.decode();
      if (buffer.trim()) processEvent(buffer);
      if (!done || finish !== 'stop') throw new UserError('incomplete-result', '模型结果未完整生成，暂不展示结论。可以重新分析。');
      return { result: validateResult(content, bundle), elapsedMs: Date.now() - started, ...(usage ? { usage } : {}) };
    } finally { await reader.cancel().catch(() => {}); }
  } catch (error) {
    if (signal.aborted) throw error;
    if (controller.signal.aborted) throw new UserError('analysis-timeout', '分析超过等待时间。可以重新点击分析。');
    if (error instanceof UserError) throw error;
    throw new UserError('provider-network', '无法连接模型服务，请检查网络后重试。');
  } finally { clearTimeout(headerTimer); clearTimeout(totalTimer); linked.dispose(); }
}
