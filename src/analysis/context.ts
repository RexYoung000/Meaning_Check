import type { ContextBundle, ContextRole, PageSnapshot, Post } from '../shared/types';
import { INPUT_LIMIT, MAX_ANCESTORS, CONTEXT_TIMEOUT_MS } from '../shared/constants';
import { UserError, composeSignals, throwIfAborted } from '../shared/errors';
import { threadRef } from '../shared/thread';

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
export function postBundle(current:Post,relation:ContextBundle['relation']='standalone'):ContextBundle {
  return {...bundleOf(current),mode:'post',relation,missing:[]};
}
export function validatePost(value: unknown, allowTranslated=false): Post {
  const p = value as Partial<Post> | null;
  const translated=allowTranslated&&p?.origin==='x'&&p.sourceIssue==='translated'&&p.text==='';
  if(p?.sourceIssue&&!translated)throw new UserError('original-text','没有读到原文。请显示原文后重试，不能用译文替代原文。');
  const ref = typeof p?.url === 'string' ? threadRef(p.url) : undefined;
  if (!p || !ref || ref.id !== p.id || !['x','reddit'].includes(p.origin ?? '') || (p.origin === 'x' && !ref.id.match(/^\d+$/)) || (p.origin === 'reddit' && !ref.id.startsWith('t')) || typeof p.text !== 'string' || (!p.text.trim()&&!translated) || p.text.length > 60_000 || typeof p.hasMedia !== 'boolean' || typeof p.truncated !== 'boolean') {
    throw new UserError('bad-input', '没有读到完整的帖子正文，请打开该回复详情再试。');
  }
  return { id: ref.id, url: ref.url, text: p.text.trim(), hasMedia: p.hasMedia, truncated: p.truncated, origin: p.origin as 'x' | 'reddit',...(translated?{sourceIssue:'translated' as const}:{}) };
}
export function validateSnapshot(value: unknown, requested: string, allowTranslated=false): PageSnapshot | undefined {
  try {
    const s = value as PageSnapshot;
    const current = validatePost(s.current,allowTranslated);
    if (current.id !== requested || !['known', 'none', 'unknown', 'unlinked'].includes(s.parentState)) return;
    const parent = s.parent ? validatePost(s.parent,allowTranslated) : undefined;
    if (s.parentState === 'known' && (!parent || parent.id === current.id)) return;
    const root=s.root?validatePost(s.root,allowTranslated):undefined;
    if(root&&(s.parentState!=='known'||root.id===current.id||root.origin!==current.origin||new URL(root.url).origin!==new URL(current.url).origin||!Number.isInteger(s.rootDepth)||s.rootDepth!<1||s.rootDepth!>MAX_ANCESTORS||(s.rootDepth===1&&root.id!==parent?.id)))return;
    return { current, parent: s.parentState === 'known' ? parent : undefined, parentState: s.parentState, ...(typeof s.replyKnown==='boolean'?{replyKnown:s.replyKnown}:{}),...(root?{root,rootDepth:s.rootDepth}:{}) };
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
  next.missing = next.mode === 'selection' || next.mode === 'post' ? [] : ['parent', 'root'].filter(role => !next.roles[role as 'parent' | 'root']) as ContextBundle['missing'];
  if(!next.missing.length)delete next.contextIssue;
  return next;
}
export function assertInputSize(bundle: ContextBundle): void {
  if(bundle.posts.some(p=>p.sourceIssue))throw new UserError('original-text','没有读到原文。请显示原文后重试，不能用译文替代原文。');
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
  let relationshipUnknown=false;
  const visited = new Set<string>();
  const deadline = Date.now() + (options.timeout ?? CONTEXT_TIMEOUT_MS);
  const timed = new AbortController();
  const timer = setTimeout(() => timed.abort(), options.timeout ?? CONTEXT_TIMEOUT_MS);
  const linked = composeSignals([signal, timed.signal]);
  const scoped = linked.signal;
  try {
    // Restore text without discarding relationships already established in the
    // user's detail page. A collector may initially render only its focal post.
    if(snapshot){
      const restored=new Map<string,Post>();
      const visibleRoot=snapshot.rootDepth&&snapshot.rootDepth<=(options.max??MAX_ANCESTORS)?snapshot.root:undefined;
      for(const post of [snapshot.current,snapshot.parent,visibleRoot])if(post?.sourceIssue&&!restored.has(post.id)){
        const fresh=await read(post.url,scoped);
        if(fresh.current.id!==post.id||fresh.current.sourceIssue)throw new UserError('original-text','没有读到原文。请显示原文后重试。');
        const original={...fresh.current,hasMedia:fresh.current.hasMedia||post.hasMedia};
        restored.set(post.id,original);
        if(post.id===current.id)selected=original;
        if(post.id===snapshot.parent?.id)parent=original;
      }
      snapshot={...snapshot,current:restored.get(snapshot.current.id)??snapshot.current,...(snapshot.parent?{parent:restored.get(snapshot.parent.id)??snapshot.parent}:{}),...(snapshot.root?{root:restored.get(snapshot.root.id)??snapshot.root}:{})};
    }
    for (let depth = 0; depth <= (options.max ?? MAX_ANCESTORS); depth++) {
      throwIfAborted(scoped);
      if (visited.has(cursor.id)) { reason = '父链出现循环，未能确认原帖。'; break; }
      visited.add(cursor.id);
      snapshot = snapshot ?? await read(cursor.url, scoped);
      if (snapshot.current.id !== cursor.id) throw new UserError('context-mismatch', '补齐页面与目标回复不一致。');
      if (depth === 0) selected = snapshot.current;
      if (depth === 1) parent = snapshot.current;
      if (depth === 0 && snapshot.parentState === 'unlinked') return {bundle:postBundle(selected,'unconfirmed')};
      if (snapshot.parentState === 'none') {
        if (depth === 0) return { bundle: postBundle(selected), original: true };
        root = snapshot.current;
        if (parent?.id === root.id) parent = root;
        break;
      }
      if (snapshot.parentState !== 'known' || !snapshot.parent) { reason = '页面没有足够信息确认父链。';relationshipUnknown=depth===0&&!snapshot.replyKnown; break; }
      if (depth === 0) parent = snapshot.parent;
      if(snapshot.root&&snapshot.rootDepth&&depth+snapshot.rootDepth<=(options.max??MAX_ANCESTORS)){
        root=snapshot.root;
        break;
      }
      if (depth === (options.max ?? MAX_ANCESTORS) || Date.now() >= deadline) { reason = '已达到补齐上限，未能确认原帖。'; break; }
      cursor = snapshot.parent;
      snapshot = undefined;
    }
  } catch (error) {
    if (signal.aborted) throw error;
    reason = '补齐未完成，可能是页面未加载、内容不可见或网络超时。';
  } finally { clearTimeout(timer); linked.dispose(); }
  if(selected.sourceIssue)throw new UserError('original-text','没有读到原文。请显示原文后重试，不能用译文替代原文。');
  const bundle=bundleOf(selected,parent,root);if(relationshipUnknown)bundle.contextIssue='unconfirmed-relation';
  return { bundle, reason };
}

export function validateBundle(value: unknown): ContextBundle {
  const b = value as ContextBundle;
  if (!b || !b.roles || !Array.isArray(b.posts) || b.posts.length < 1 || b.posts.length > 3 || (b.mode!==undefined&&!['thread','selection','post'].includes(b.mode)) || Object.keys(b.roles).some(r => !['current','parent','root'].includes(r))) throw new UserError('bad-input','上下文材料不完整，请重新选择回复。');
  const posts = b.posts.map(p => {
    if (p?.origin === 'manual') {
      if (!/^manual-(current|parent|root)$/.test(p.id) || p.url !== '' || typeof p.text !== 'string' || !p.text.trim() || p.text.length > 60_000) throw new UserError('bad-input','补充材料不完整，请重新填写。');
      return { id:p.id, url:'', text:p.text.trim(), hasMedia:false, truncated:false, origin:'manual' as const };
    }
    if (b.mode === 'selection' && p?.origin === 'web') {
      let url: URL; try { url = new URL(p.url); } catch { throw new UserError('bad-input','选区来源无效。'); }
      if (url.protocol !== 'https:' || p.id !== 'selection' || typeof p.text !== 'string' || !p.text.trim() || p.text.length > 60_000) throw new UserError('bad-input','选区材料无效。');
      return {id:'selection',url:url.href,text:p.text.trim(),hasMedia:false,truncated:false,origin:'web' as const};
    }
    return validatePost(p);
  });
  if (new Set(posts.map(p => p.id)).size !== posts.length || !posts.find(p=>p.id===b.roles.current) || Object.values(b.roles).some(id => typeof id !== 'string' || !posts.find(p=>p.id===id))) throw new UserError('bad-input','上下文来源不一致，请重新选择回复。');
  const result = bundleOf(posts.find(p=>p.id===b.roles.current)!, posts.find(p=>p.id===b.roles.parent), posts.find(p=>p.id===b.roles.root));
  if (b.mode === 'selection') { result.mode = 'selection'; result.missing = []; }
  if (b.mode === 'post') {
    if(b.roles.parent || (b.roles.root && posts.find(p=>p.id===b.roles.root)?.origin!=='manual') || !['standalone','unconfirmed'].includes(b.relation??''))throw new UserError('bad-input','独立帖材料与背景来源不一致。');
    result.mode='post';result.relation=b.relation;result.missing=[];
  }
  if(b.contextIssue==='unconfirmed-relation'&&result.missing.length)result.contextIssue=b.contextIssue;
  return result;
}

export function selectionBundle(value:Post, pageUrl:string):ContextBundle {
  const bundle=validateBundle({mode:'selection',roles:{current:'selection'},posts:[value],missing:[],warnings:[]});
  if(new URL(bundle.posts[0]!.url).origin!==new URL(pageUrl).origin)throw new UserError('bad-input','选区与页面来源不一致。');
  return bundle;
}
