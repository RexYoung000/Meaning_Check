// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readPost, readPageSnapshot } from '../src/x/dom';
function article(id:string,text:string,kind:'root'|'reply'|'feed',focal=false){return '<div data-timeline-entry '+(focal?'tabindex="-1"':'data-href="/person/status/'+id+'" tabindex="0"')+'><article><div class="avatar"><span aria-hidden="true" class="absolute left-1/2 w-0.5 '+(kind==='root'?'top-5 -bottom-3':kind==='reply'?'-top-3 h-8':'')+'"></span></div><a class="inline-flex w-fit" href="/person/status/'+id+'">time</a><div class="whitespace-pre-wrap">'+text+'</div><div><a href="/compose/post?in_reply_to='+id+'">回复</a><button>喜欢</button></div></article></div>';}
beforeEach(()=>{history.replaceState({},'', '/person/status/3');document.body.innerHTML='';});
describe('现代 X 与经典 X 正文',()=>{
 it('现代正文只读正文，不读简介和互动数据',()=>{document.body.innerHTML='<main>'+article('3','nice try','reply',true)+'</main><aside>用户简介、浏览量</aside>';expect(readPost(document.querySelector('article')!)?.text).toBe('nice try');});
 it('现代详情通过原生连接线确定直接父帖',()=>{document.body.innerHTML='<main>'+article('2','parent','root')+article('3','nice try','reply',true)+article('4','unrelated reply','feed')+'</main>';expect(readPageSnapshot(document,location.href)?.parent?.id).toBe('2');});
 it('回复线存在但父帖没加载时标缺失，不当原帖',()=>{document.body.innerHTML='<main>'+article('3','nice try','reply',true)+'</main>';expect(readPageSnapshot(document,location.href)?.parentState).toBe('unknown');});
 it('首页相邻帖子不被当作父链',()=>{document.body.innerHTML='<main>'+article('2','irrelevant','feed')+article('3','nice try','feed')+'</main>';expect(readPageSnapshot(document,location.href)?.parentState).toBe('unknown');});
 it('引用帖不能冒充主帖身份和正文',()=>{document.body.innerHTML='<article data-testid="tweet" tabindex="-1"><div data-testid="tweetText">main text</div><div data-testid="quoteTweet"><a href="/quote/status/8"><time>time</time></a><div data-testid="tweetText">quoted text</div></div><a href="/person/status/3"><time>main time</time></a></article>';expect(readPost(document.querySelector('article')!)).toMatchObject({id:'3',text:'main text'});});
 it('emoji img alt 被保留，媒体不被当文字解析',()=>{document.body.innerHTML='<main>'+article('3','nice <img alt="😂" src="emoji.svg"> try','reply',true).replace('</article>','<div data-testid="tweetPhoto"></div></article>')+'</main>';expect(readPost(document.querySelector('article')!)).toMatchObject({text:'nice 😂 try',hasMedia:true});});
 it('已有沉浸式翻译译文不混进原文或引用依据',()=>{document.body.innerHTML='<main>'+article('3','nice try<span class="immersive-translate-target-inner">译文：漂亮的尝试</span>','reply',true)+'</main>';expect(readPost(document.querySelector('article')!)?.text).toBe('nice try');});
 it('祖先仍在加载时不能把初始焦点帖当成原帖',()=>{document.body.innerHTML='<main>'+article('3','reply','feed',true)+'<div>正在加载帖子</div></main>';expect(readPageSnapshot(document,location.href)).toBeUndefined();});
 it('主帖没有父线时可确认原帖',()=>{document.body.innerHTML='<main>'+article('3','root text','feed',true)+'</main>';expect(readPageSnapshot(document,location.href)?.parentState).toBe('none');});
 it('经典详情识别时间链接和直接祖先，忽略引用',()=>{document.body.innerHTML='<div data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article data-testid="tweet"><a href="/person/status/2"><time>time</time></a><div data-testid="tweetText">parent</div></article></div><div data-testid="cellInnerDiv"><article data-testid="tweet" tabindex="-1"><a href="/person/status/3"><time>time</time></a><div data-testid="tweetText">reply</div></article></div></div>';expect(readPageSnapshot(document,location.href)?.parent?.id).toBe('2');});
 it('详情地址不匹配时不复用旧页面上下文',()=>{document.body.innerHTML=article('3','reply','reply',true);expect(readPageSnapshot(document,'https://x.com/person/status/4')).toBeUndefined();});
});

describe('独立帖、经典详情和可靠展开信号',()=>{
 it('时间线中的原生 SVG 图标不会中断上下文读取或充当回复连线',()=>{
  history.replaceState({},'', '/home');
  document.body.innerHTML='<main>'+article('3','A self-contained update','feed').replace('<div class="avatar">','<div class="avatar"><svg aria-hidden="true" class="absolute -top-1 left-1/2" viewBox="0 0 24 24"><path d="M0 0h1v1z"></path></svg>')+'</main>';
  expect(readPageSnapshot(document,'https://x.com/person/status/3')).toMatchObject({parentState:'unlinked',current:{id:'3'}});
 });
 it('回复和父帖含 SVG 图标时仍能识别 HTML 父链',()=>{
  const withIcon=(html:string)=>html.replace('<div class="avatar">','<div class="avatar"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M0 0h1v1z"></path></svg>');
  document.body.innerHTML='<main>'+withIcon(article('2','parent','root'))+withIcon(article('3','reply','reply',true))+'</main>';
  expect(readPageSnapshot(document,location.href)).toMatchObject({parentState:'known',parent:{id:'2'}});
 });
 it('时间线无回复关联时仅选择本条，不声称父帖不存在',()=>{
  history.replaceState({},'', '/home');document.body.innerHTML='<main>'+article('2','Another unrelated post','feed')+article('3','A self-contained update','feed')+'</main>';
  expect(readPageSnapshot(document,'https://x.com/person/status/3')).toMatchObject({parentState:'unlinked',current:{id:'3'}});
 });
 it('时间线有回复线时仍要求补齐，不当独立帖',()=>{
  history.replaceState({},'', '/home');document.body.innerHTML='<main>'+article('3','An actual reply','reply')+'</main>';
  expect(readPageSnapshot(document,'https://x.com/person/status/3')).toMatchObject({parentState:'unknown',replyKnown:true});
 });
 it('经典详情 tabindex=0 仍按规范地址确认主帖，忽略下方和侧栏加载',()=>{
  document.body.innerHTML='<main data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article data-testid="tweet" tabindex="0"><a href="/person/status/3"><time>time</time></a><div data-testid="tweetText">Full standalone text</div></article></div><div role="progressbar">Loading replies</div></main><aside role="progressbar">Loading sidebar</aside>';
  expect(readPageSnapshot(document,location.href)?.parentState).toBe('none');
 });
 it('正文上方加载祖先时仍不能确认没有父帖',()=>{
  document.body.innerHTML='<main data-testid="primaryColumn"><div role="progressbar"></div><div data-testid="cellInnerDiv"><article data-testid="tweet" tabindex="0"><a href="/person/status/3"><time>time</time></a><div data-testid="tweetText">Text</div></article></div></main>';
  expect(readPageSnapshot(document,location.href)).toBeUndefined();
 });
 it('媒体、译文、隐藏和引用展开按钮不误判正文截断',()=>{
  document.body.innerHTML='<main>'+article('3','Complete source text','feed',true).replace('</article>','<div data-testid="tweetPhoto"><button>展开</button></div><button>查看更多</button><div style="display:none"><button data-testid="tweet-text-show-more-link">Show more</button></div><div data-testid="quoteTweet"><button data-testid="tweet-text-show-more-link">Show more</button></div><span class="immersive-translate-target-inner"><button>显示更多</button></span></article>')+'</main>';
  expect(readPost(document.querySelector('article')!)?.truncated).toBe(false);
 });
 it('可见的专用正文按钮仍标记截断，展开后再次读取状态改变',()=>{
  document.body.innerHTML='<main>'+article('3','Short text','feed',true).replace('</article>','<button data-testid="tweet-text-show-more-link">Show more</button></article>')+'</main>';
  const el=document.querySelector('article')!;expect(readPost(el)?.truncated).toBe(true);el.querySelector('[data-testid="tweet-text-show-more-link"]')!.remove();
  expect(readPost(el)?.truncated).toBe(false);
 });
});
