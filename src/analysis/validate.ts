import type { ContextBundle, Evidence, InterpretationResult } from '../shared/types';
import { UserError } from '../shared/errors';
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
function failure(): never { throw new UserError('invalid-result', '这次结果的结构或原文依据未通过检查，暂不展示结论。可以重新分析。'); }
function bounded(value: unknown, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max) failure(); return value.trim(); }
export function validateResult(content: string, bundle: ContextBundle): InterpretationResult {
  let value: any;
  try { value = JSON.parse(content); } catch { failure(); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['ready', 'needs_context'].includes(value.status)) failure();
  const allowed = new Set(['status', 'summary', 'tone', 'function', 'evidence', 'uncertainty']);
  if (Object.keys(value).some(k => !allowed.has(k))) failure();
  if (!Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 2) failure();
  const evidence: Evidence[] = value.evidence.map((item: any) => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(k => !['sourceId', 'quote', 'explanation'].includes(k))) failure();
    const sourceId = bounded(item.sourceId, 60);
    const source = bundle.posts.find(p => p.id === sourceId);
    const quote = bounded(item.quote, 180);
    if (!source || !normalize(source.text).includes(normalize(quote))) failure();
    return { sourceId, quote, explanation: bounded(item.explanation, 280) };
  });
  return { status: value.status, summary: bounded(value.summary, 180), tone: bounded(value.tone, 80), function: bounded(value.function, 80), evidence, ...(value.uncertainty !== undefined ? { uncertainty: bounded(value.uncertainty, 500) } : {}) };
}
