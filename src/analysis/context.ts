import type { ContextBundle, ContextRole, PageSnapshot, Post } from '../shared/types';
import { INPUT_LIMIT, MAX_ANCESTORS, CONTEXT_TIMEOUT_MS } from '../shared/constants';
import { UserError, composeSignals, throwIfAborted } from '../shared/errors';
import { postRef } from '../x/urls';

export function bundleOf(current: Post, parent?: Post, root?: Post): ContextBundle {
  const byId = new Map<string, Post>();
  for (const post of [current, parent, root]) if (post) byId.set(post.id, post);
  const posts = [...byId.values()];
  return {
    roles: { current: current.id, ...(parent ? { parent: parent.id } : {}), ...(root ? { root: root.id } : {}) },
    posts,
    missing: [...(!parent ? ['parent' as const] : []), ...(!root ? ['root' as const] : [])],
    warnings: posts.flatMap(p => p.truncated ? ['有帖子文字未完全展开，不能将截断文字当成完整上下文。'] : []),
  };
}
export function validatePost(value: unknown): Post {
  const p = value as Partial<Post> | null;
  const ref = typeof p?.url === 'string' ? postRef(p.url) : undefined;
  if (!p || !ref || ref.id !== p.id || p.origin !== 'x' || typeof p.text !== 'string' || !p.text.trim() || p.text.length > 60_000 || typeof p.hasMedia !== 'boolean' || typeof p.truncated !== 'boolean') {
    throw new UserError('bad-input', '没有读到完整的帖子正文，请打开该回复详情再试。');
  }
  return { id: ref.id, url: ref.url, text: p.text.trim(), hasMedia: p.hasMedia, truncated: p.truncated, origin: 'x' };
}
export function validateSnapshot(value: unknown, requested: string): PageSnapshot | undefined {
  try {
    const s = value as PageSnapshot;
    const current = validatePost(s.current);
    if (current.id !== requested || !['known', 'none', 'unknown'].includes(s.parentState)) return;
    const parent = s.parent ? validatePost(s.parent) : undefined;
    if (s.parentState === 'known' && (!parent || parent.id === current.id)) return;
    return { current, parent: s.parentState === 'known' ? parent : undefined, parentState: s.parentState };
  } catch { return; }
}
export function applyManual(bundle: ContextBundle, values?: Partial<Record<ContextRole, string>>): ContextBundle {
  const next: ContextBundle = structuredClone(bundle);
  for (const role of ['current', 'parent', 'root'] as const) {
    const text = values?.[role]?.trim();
    if (!text) continue;
    if (text.length > INPUT_LIMIT) throw new UserError('input-limit', '补充文字过长，请缩减后再分析。');
    const id = 'manual-' + role;
    next.roles[role] = id;
    next.posts = next.posts.filter(p => p.id !== id);
    next.posts.push({ id, url: '', text, hasMedia: false, truncated: false, origin: 'manual' });
  }
  const used = new Set(Object.values(next.roles));
  next.posts = next.posts.filter(p => used.has(p.id));
  next.missing = ['parent', 'root'].filter(role => !next.roles[role as 'parent' | 'root']) as ContextBundle['missing'];
  return next;
}
export function assertInputSize(bundle: ContextBundle): void {
  if (bundle.posts.reduce((size, post) => size + post.text.length, 0) > INPUT_LIMIT) {
    throw new UserError('input-limit', '上下文超过 12,000 字符。请在「手动补充」中提供较短的相关文字，再分析。');
  }
  if (bundle.posts.some(p => p.truncated)) throw new UserError('truncated-input', '有帖子文字尚未完全展开，请打开原帖展开正文，或手动补充完整相关文字。');
}
export interface ContextResolution { bundle: ContextBundle; reason?: string; original?: boolean }
export async function resolveContext(current: Post, initial: PageSnapshot | undefined, read: (url: string, signal: AbortSignal) => Promise<PageSnapshot>, signal: AbortSignal, options: { max?: number; timeout?: number } = {}): Promise<ContextResolution> {
  let parent: Post | undefined;
  let root: Post | undefined;
  let selected = current;
  let cursor = current;
  let snapshot = initial;
  let reason: string | undefined;
  const visited = new Set<string>();
  const deadline = Date.now() + (options.timeout ?? CONTEXT_TIMEOUT_MS);
  const timed = new AbortController();
  const timer = setTimeout(() => timed.abort(), options.timeout ?? CONTEXT_TIMEOUT_MS);
  const linked = composeSignals([signal, timed.signal]);
  const scoped = linked.signal;
  try {
    for (let depth = 0; depth <= (options.max ?? MAX_ANCESTORS); depth++) {
      throwIfAborted(scoped);
      if (visited.has(cursor.id)) { reason = '父链出现循环，未能确认原帖。'; break; }
      visited.add(cursor.id);
      snapshot = snapshot ?? await read(cursor.url, scoped);
      if (snapshot.current.id !== cursor.id) throw new UserError('context-mismatch', '补齐页面与目标回复不一致。');
      if (depth === 0) selected = snapshot.current;
      if (depth === 1) parent = snapshot.current;
      if (snapshot.parentState === 'none') {
        if (depth === 0) return { bundle: bundleOf(selected), original: true };
        root = snapshot.current;
        if (parent?.id === root.id) parent = root;
        break;
      }
      if (snapshot.parentState !== 'known' || !snapshot.parent) { reason = '页面没有足够信息确认父链。'; break; }
      if (depth === 0) parent = snapshot.parent;
      if (depth === (options.max ?? MAX_ANCESTORS) || Date.now() >= deadline) { reason = '已达到补齐上限，未能确认原帖。'; break; }
      cursor = snapshot.parent;
      snapshot = undefined;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    reason = '补齐未完成，可能是页面未加载、内容不可见或网络超时。';
  } finally { clearTimeout(timer); linked.dispose(); }
  return { bundle: bundleOf(selected, parent, root), reason };
}

export function validateBundle(value: unknown): ContextBundle {
  const b = value as ContextBundle;
  if (!b || !b.roles || !Array.isArray(b.posts) || b.posts.length < 1 || b.posts.length > 3 || Object.keys(b.roles).some(r => !['current','parent','root'].includes(r))) throw new UserError('bad-input','上下文材料不完整，请重新选择回复。');
  const posts = b.posts.map(p => {
    if (p?.origin === 'manual') {
      if (!/^manual-(current|parent|root)$/.test(p.id) || p.url !== '' || typeof p.text !== 'string' || !p.text.trim() || p.text.length > 60_000) throw new UserError('bad-input','补充材料不完整，请重新填写。');
      return { id:p.id, url:'', text:p.text.trim(), hasMedia:false, truncated:false, origin:'manual' as const };
    }
    return validatePost(p);
  });
  if (new Set(posts.map(p => p.id)).size !== posts.length || !posts.find(p=>p.id===b.roles.current) || Object.values(b.roles).some(id => typeof id !== 'string' || !posts.find(p=>p.id===id))) throw new UserError('bad-input','上下文来源不一致，请重新选择回复。');
  return bundleOf(posts.find(p=>p.id===b.roles.current)!, posts.find(p=>p.id===b.roles.parent), posts.find(p=>p.id===b.roles.root));
}
