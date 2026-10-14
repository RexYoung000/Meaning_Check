import { describe, it, expect, vi } from 'vitest';
import { applyManual, assertInputSize, bundleOf, resolveContext, validateBundle, validatePost, validateSnapshot } from '../src/analysis/context';
import { post, reply, parent, root } from './fixtures/posts';

describe('上下文范围与补齐', () => {
  it('父帖就是原帖时只发送两份文本', () => { const b = bundleOf(reply, root, root); expect(b.posts).toHaveLength(2); expect(b.roles.parent).toBe(b.roles.root); expect(b.missing).toEqual([]); });
  it('默认只存在当前回复时明确缺两项', () => { expect(bundleOf(reply).missing).toEqual(['parent','root']); });
  it('只保留三个角色，不发送追溯途中其他帖子', async () => {
    const read = vi.fn(async (url: string) => {
      const id = url.split('/').at(-1)!;
      return { current: post(id), ...(id !== '1' ? { parent: post(String(Number(id) - 1)) } : {}), parentState: id === '1' ? 'none' as const : 'known' as const };
    });
    const r = await resolveContext(post('5'), undefined, read, new AbortController().signal);
    expect(r.bundle.posts.map(p => p.id)).toEqual(['5','4','1']); expect(r.bundle.missing).toEqual([]); expect(read).toHaveBeenCalledTimes(5);
  });
  it('第一条父帖经详情展开后使用完整文本', async () => {
    const initial = { current: reply, parent: { ...root, text: 'If you hate', truncated: true }, parentState: 'known' as const };
    const r = await resolveContext(reply, initial, async () => ({ current: root, parentState:'none' }), new AbortController().signal);
    expect(r.bundle.posts.find(p => p.id === '1')?.text).toBe(root.text); expect(r.bundle.posts.some(p => p.truncated)).toBe(false);
  });
  it('原帖必须被确认，不能将最早可见帖子直接当根', async () => {
    const r = await resolveContext(reply, { current: reply, parent, parentState:'known' }, async () => ({ current: parent, parentState:'unknown' }), new AbortController().signal);
    expect(r.bundle.roles.parent).toBe('2'); expect(r.bundle.roles.root).toBeUndefined(); expect(r.bundle.missing).toEqual(['root']);
  });
  it('追溯有界，达到上限保留父帖并提示缺根', async () => {
    const read = vi.fn(async () => ({ current: post('4'), parent: post('3'), parentState:'known' as const }));
    const r = await resolveContext(post('4'), undefined, read, new AbortController().signal, {max:0});
    expect(read).toHaveBeenCalledTimes(1); expect(r.bundle.roles.parent).toBe('3'); expect(r.bundle.missing).toEqual(['root']);
  });
  it('读帖失败不吞掉已有父帖', async () => {
    const r = await resolveContext(reply, {current:reply,parent,parentState:'known'}, async () => { throw new Error('offline'); }, new AbortController().signal);
    expect(r.bundle.missing).toEqual(['root']); expect(r.reason).toBeTruthy();
  });
  it('循环不会反复打开标签页', async () => {
    const r = await resolveContext(reply, undefined, async url => ({current:post(url.endsWith('/3')?'3':'2'),parent:post(url.endsWith('/3')?'2':'3'),parentState:'known'}),new AbortController().signal);
    expect(r.bundle.roles.root).toBeUndefined(); expect(r.reason).toContain('循环');
  });
  it('取消向调用方传播，不偷偷做部分分析', async () => {
    const c = new AbortController(); c.abort(); await expect(resolveContext(reply,undefined,vi.fn(),c.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it('选中原帖时引导选择回复，不调用模型', async () => {
    const r = await resolveContext(root, {current:root,parentState:'none'},vi.fn(),new AbortController().signal); expect(r.original).toBe(true);
  });
  it('手动文字明确标注来源并可补齐缺项', () => {
    const b = applyManual(bundleOf(reply), {parent:'直接回应的文字',root:'完整原帖'}); expect(b.missing).toEqual([]); expect(b.posts.filter(p=>p.origin==='manual')).toHaveLength(2); expect(b.posts.every(p=>p.origin==='x'||!p.url)).toBe(true);
  });
  it('缩减当前文字时不继续发送被替换的原文', () => {
    const b = applyManual(bundleOf(post('3','x'.repeat(20_000)),root,root),{current:'相关的一小段'}); expect(b.posts.map(p=>p.id)).toEqual(['1','manual-current']); expect(()=>assertInputSize(b)).not.toThrow();
  });
  it('超限与截断输入不会静默裁切', () => {
    expect(()=>assertInputSize(bundleOf(post('3','a'.repeat(12_001))))).toThrow('12,000'); expect(()=>assertInputSize(bundleOf({...reply,truncated:true}))).toThrow('展开');
  });
  it('重连材料仍需校验，不能加入第四种来源或伪造角色', () => {
    expect(validateBundle(bundleOf(reply,root,root)).posts).toHaveLength(2);
    expect(()=>validateBundle({...bundleOf(reply),roles:{current:'wrong'}})).toThrow();
    expect(()=>validateBundle({...bundleOf(reply),posts:[reply,reply]})).toThrow();
  });
  it('再次补充同一角色时替换旧文本而非重复追加', () => {
    const b=applyManual(applyManual(bundleOf(reply),{parent:'old words'}),{parent:'new words'});
    expect(b.posts.filter(p=>p.id==='manual-parent')).toHaveLength(1);expect(b.posts.find(p=>p.id==='manual-parent')?.text).toBe('new words');
  });
  it('拒绝外站链接或身份不一致', () => {
    expect(()=>validatePost({...reply,url:'https://evil.example/person/status/3'})).toThrow(); expect(()=>validatePost({...reply,id:'4'})).toThrow(); expect(validateSnapshot({current:reply,parentState:'none'},'4')).toBeUndefined();
  });
});

describe('不适用的上下文与未确认关系',()=>{
 it('独立原帖直接返回 post 模式，没有虚构缺项',async()=>{
  const read=vi.fn();const resolved=await resolveContext(root,{current:root,parentState:'none'},read,new AbortController().signal);
  expect(resolved.bundle).toMatchObject({mode:'post',relation:'standalone',roles:{current:root.id},missing:[]});expect(read).not.toHaveBeenCalled();
 });
 it('时间线只读本条保留未确认关系，重连和手动背景不丢模式',async()=>{
  const resolved=await resolveContext(reply,{current:reply,parentState:'unlinked'},vi.fn(),new AbortController().signal);
  const manual=applyManual(resolved.bundle,{root:'Optional background'}),validated=validateBundle(manual);
  expect(validated).toMatchObject({mode:'post',relation:'unconfirmed',missing:[],roles:{root:'manual-root'}});
 });
 it('未知关系不同于已确认回复缺父帖',async()=>{
  const unknown=await resolveContext(reply,{current:reply,parentState:'unknown',replyKnown:false},vi.fn(),new AbortController().signal);
  const actualReply=await resolveContext(reply,{current:reply,parentState:'unknown',replyKnown:true},vi.fn(),new AbortController().signal);
  expect(unknown.bundle.contextIssue).toBe('unconfirmed-relation');expect(actualReply.bundle.contextIssue).toBeUndefined();expect(actualReply.bundle.missing).toEqual(['parent','root']);
 });
 it('无法展开的文字保留可取得的父链，不能全部伪装成上下文缺失',async()=>{
  const incomplete={...reply,truncated:true};const resolved=await resolveContext(incomplete,{current:incomplete,parent:root,parentState:'known'},async()=>({current:root,parentState:'none'}),new AbortController().signal);
  expect(resolved.bundle.missing).toEqual([]);expect(resolved.bundle.posts[0]?.truncated).toBe(true);expect(()=>assertInputSize(resolved.bundle)).toThrow('展开');
 });
 it('独立帖模式不接受网页伪造的自动父帖和原帖角色',()=>{
  expect(()=>validateBundle({...bundleOf(reply,root,root),mode:'post',relation:'standalone'})).toThrow();
 });
});
