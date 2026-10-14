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
  it('选区只包含明确选中文字，背景可选且标手动来源',()=>{const p={id:'selection',url:'https://example.com/topic',text:'nice try',hasMedia:false,truncated:false,origin:'web' as const};const b=selectionBundle(p,p.url);expect(b.missing).toEqual([]);expect(b.posts).toHaveLength(1);const manual=applyManual(b,{root:'A public invitation'});expect(manual.missing).toEqual([]);expect(manual.posts[1]?.origin).toBe('manual');expect(()=>selectionBundle(p,'https://other.example/')).toThrow();});
});
