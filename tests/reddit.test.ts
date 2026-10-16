import {describe,it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {redditRef} from '../src/reddit/urls';
import {readPageSnapshot} from '../src/reddit/dom';
import {selectionBundle,applyManual,validatePost} from '../src/analysis/context';
const url='https://www.reddit.com/r/test/comments/abc/title/def/';
function page(parent='t3_abc'):Document {const dom=new JSDOM(`<shreddit-post post-type="text" thingid="t3_abc" permalink="/r/test/comments/abc/title/" post-title="Trying a new idea"><div slot="text-body">Does this work?</div></shreddit-post><shreddit-comment thingid="t1_def" parentid="${parent}" permalink="/r/test/comments/abc/title/def/"><div slot="comment">nice try <img alt="🙂"><span class="immersive-translate-target-inner">不应采集</span></div></shreddit-comment>`,{url});Object.defineProperty(globalThis,'location',{value:dom.window.location,configurable:true});return dom.window.document;}
describe('Reddit 和主动选区',()=>{
  it('识别根帖 / 评论的 canonical id 和原帖地址，拒绝其他来源',()=>{const r=redditRef(url)!;expect(r.id).toBe('t1_def');expect(r.rootUrl).toBe('https://www.reddit.com/r/test/comments/abc/title/');expect(redditRef(r.rootUrl)?.id).toBe('t3_abc');expect(redditRef('https://evil.com/r/test/comments/abc/title/def/')).toBeUndefined();});
  it('用明确 parentid 关联父帖，保留原文 emoji，排除外部译文',()=>{const snapshot=readPageSnapshot(page(),url)!;expect(snapshot.parentState).toBe('known');expect(snapshot.parent?.id).toBe('t3_abc');expect(snapshot.current.text).toBe('nice try 🙂');expect(validatePost(snapshot.current).origin).toBe('reddit');});
  it('根帖媒体在正文之外时仍提示未读图片，不能混入 alt 描述',()=>{const doc=page();doc.querySelector('shreddit-post')!.insertAdjacentHTML('beforeend','<div slot="post-media-container"><img alt="Unseen image description"></div>');const snapshot=readPageSnapshot(doc,'https://www.reddit.com/r/test/comments/abc/title/')!;expect(snapshot.current.hasMedia).toBe(true);expect(snapshot.current.text).not.toContain('Unseen image');});
  it('看不到声明的父帖时不使用邻帖或猜根',()=>{expect(readPageSnapshot(page('t1_hidden'),url)?.parentState).toBe('unknown');});
  it('新版 comment 地址解析到正确的主题帖，不把 comment 当作标题',()=>{
    const modern=redditRef('https://www.reddit.com/r/test/comments/abc/comment/def/?context=3')!;
    expect(modern.id).toBe('t1_def');expect(modern.rootUrl).toBe('https://www.reddit.com/r/test/comments/abc/');
    expect(redditRef(modern.rootUrl)?.id).toBe('t3_abc');
  });
  it('根帖使用真实 id 属性，正文和标题都读取，父帖与主题帖是同一来源',()=>{
    const doc=page();const root=doc.querySelector('shreddit-post')!;root.removeAttribute('thingid');root.id='t3_abc';
    const snapshot=readPageSnapshot(doc,url)!;
    expect(snapshot.parentState).toBe('known');expect(snapshot.parent?.text).toBe('Trying a new idea\nDoes this work?');
    expect(snapshot.root?.id).toBe('t3_abc');expect(snapshot.rootDepth).toBe(1);
  });
  it('原生嵌套父链完整时同时取得直接上文和主题帖，不保留中间评论正文',()=>{
    const doc=page('t1_parent');const current=doc.querySelector('shreddit-comment')!;
    const ancestor=doc.createElement('shreddit-comment');ancestor.setAttribute('thingid','t1_middle');ancestor.setAttribute('parentid','t3_abc');ancestor.setAttribute('permalink','/r/test/comments/abc/comment/middle/');ancestor.innerHTML='<div slot="comment">Intermediate body must not enter the bundle</div>';
    const parent=doc.createElement('shreddit-comment');parent.setAttribute('thingid','t1_parent');parent.setAttribute('parentid','t1_middle');parent.setAttribute('permalink','/r/test/comments/abc/comment/parent/');parent.innerHTML='<div slot="comment">No human would write a meaningless comment.</div>';
    doc.body.append(ancestor);ancestor.append(parent);parent.append(current);
    const snapshot=readPageSnapshot(doc,url)!;
    expect(snapshot.parent?.id).toBe('t1_parent');expect(snapshot.parent?.text).toBe('No human would write a meaningless comment.');
    expect(snapshot.root?.id).toBe('t3_abc');expect(snapshot.rootDepth).toBe(3);
    expect(JSON.stringify(snapshot)).not.toContain('Intermediate body');
  });
  it('新版页面缺少评论 permalink 时仍生成无歧义的评论地址',()=>{
    const doc=page();doc.querySelector('shreddit-comment')!.removeAttribute('permalink');
    const modern='https://www.reddit.com/r/test/comments/abc/comment/def/';
    expect(readPageSnapshot(doc,modern)?.current.url).toBe(modern);
  });
  it('不能把推荐的其他主题帖接成当前评论的父帖',()=>{
    const doc=page('t3_other');doc.body.insertAdjacentHTML('beforeend','<shreddit-post id="t3_other" post-type="text" post-title="Other discussion" permalink="/r/test/comments/other/title/"></shreddit-post>');
    const snapshot=readPageSnapshot(doc,url)!;
    expect(snapshot.parentState).toBe('unknown');expect(snapshot.root).toBeUndefined();
  });
  it('原生嵌套可确认直接父帖，但断链或循环不能跳到旁边的主题帖',()=>{
    const doc=page('t1_parent');const current=doc.querySelector('shreddit-comment')!;current.removeAttribute('parentid');
    const parent=doc.createElement('shreddit-comment');parent.setAttribute('thingid','t1_parent');parent.setAttribute('permalink','/r/test/comments/abc/comment/parent/');parent.innerHTML='<div slot="comment">Direct parent</div>';doc.body.append(parent);parent.append(current);
    expect(readPageSnapshot(doc,url)?.parent?.id).toBe('t1_parent');expect(readPageSnapshot(doc,url)?.root).toBeUndefined();
    parent.setAttribute('parentid','t1_def');expect(readPageSnapshot(doc,url)?.root).toBeUndefined();
  });
  it('最上层原生评论由 depth=0 和 postid 确认主题帖，其他层级不能仅凭 postid 猜根',()=>{
    const doc=page();const current=doc.querySelector('shreddit-comment')!;current.removeAttribute('parentid');current.setAttribute('postid','t3_abc');
    expect(readPageSnapshot(doc,url)?.parentState).toBe('unknown');
    current.setAttribute('depth','1');expect(readPageSnapshot(doc,url)?.parentState).toBe('unknown');
    current.setAttribute('depth','0');expect(readPageSnapshot(doc,url)?.root?.id).toBe('t3_abc');
    current.setAttribute('postid','t3_other');expect(readPageSnapshot(doc,url)?.parentState).toBe('unknown');
  });
  it('选区只包含明确选中文字，背景可选且标手动来源',()=>{const p={id:'selection',url:'https://example.com/topic',text:'nice try',hasMedia:false,truncated:false,origin:'web' as const};const b=selectionBundle(p,p.url);expect(b.missing).toEqual([]);expect(b.posts).toHaveLength(1);const manual=applyManual(b,{root:'A public invitation'});expect(manual.missing).toEqual([]);expect(manual.posts[1]?.origin).toBe('manual');expect(()=>selectionBundle(p,'https://other.example/')).toThrow();});
});
