import type { PageSnapshot, Post } from '../shared/types';
import { postRef } from './urls';

export const ARTICLE_SELECTOR = 'article';
function owned<T extends Element>(article: Element, selector: string): T[] {
  return [...article.querySelectorAll<T>(selector)].filter(el => el.closest('article') === article && !el.closest('[data-mc-owned],[data-testid="quoteTweet"], [data-quoted-post]'));
}
export function textElement(article: Element): HTMLElement | undefined {
  return owned<HTMLElement>(article, '[data-testid="tweetText"]')[0] ?? owned<HTMLElement>(article, '.whitespace-pre-wrap')[0];
}
function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('img[alt]').forEach(img => img.replaceWith(img.getAttribute('alt') ?? ''));
  clone.querySelectorAll('[data-mc-owned],script,style,.immersive-translate-target-inner,[class*="immersive-translate-target-translation"],.immersive-translate-loading').forEach(node => node.remove());
  return (clone.textContent ?? '').trim();
}
export function showMoreElement(article: Element): HTMLElement | undefined {
  const text=textElement(article);
  const visible=(el:HTMLElement)=>{
    if(el.closest('[hidden],[aria-hidden="true"],[data-mc-owned],[data-testid="tweetPhoto"],[data-testid="videoPlayer"],.immersive-translate-target-inner,[class*="immersive-translate"]'))return false;
    for(let node:Element|null=el;node&&article.contains(node);node=node.parentElement){const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;}
    return true;
  };
  const explicit=owned<HTMLElement>(article,'[data-testid="tweet-text-show-more-link"]').find(visible);
  if(explicit)return explicit;
  // Generic expand controls are relevant only inside the actual source text.
  return owned<HTMLElement>(article,'button,a,[role="button"]').find(el=>!!text?.contains(el)&&visible(el)&&/^(show more|显示更多|展开|查看更多)$/i.test((el.textContent??'').trim()));
}
export function readPost(article: Element): Post | undefined {
  if (article.parentElement?.closest('article')) return;
  const text = textElement(article);
  if (!text) return;
  const wrapper = article.closest('[data-timeline-entry][data-href]');
  let ref = wrapper ? postRef(wrapper.getAttribute('data-href') ?? '') : undefined;
  if (!ref) {
    const links = owned<HTMLAnchorElement>(article, 'a[href*="/status/"]');
    const link = links.find(a => !!a.querySelector('time')) ?? links.find(a => a.classList.contains('inline-flex') && a.classList.contains('w-fit'));
    ref = link ? postRef(link.href) : undefined;
  }
  if (!ref) return;
  const body = textOf(text);
  if (!body) return;
  const hasMedia = owned(article, '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video, img[src*="pbs.twimg.com/media"], img[src*="tweet_video_thumb"]').length > 0;
  return { ...ref, text: body, hasMedia, truncated: !!showMoreElement(article), origin: 'x' };
}
function hasTopConnector(article: Element): boolean {
  return owned<Element>(article, '[aria-hidden="true"]').some(el => {
    if (!(el instanceof HTMLElement)) return false;
    const classes=el.getAttribute('class') ?? '';
    return classes.includes('-top-') && (classes.includes('w-0.5') || classes.includes('left-1/2'));
  });
}
function hasBottomConnector(article: Element): boolean {
  return owned<Element>(article, '[aria-hidden="true"]').some(el => {
    if (!(el instanceof HTMLElement)) return false;
    const classes=el.getAttribute('class') ?? '';
    return classes.includes('-bottom-') && (classes.includes('w-0.5') || classes.includes('left-1/2'));
  });
}
function hasReplyMarker(article: Element): boolean {
  return owned<HTMLElement>(article, '[data-testid="replyingTo"], [data-testid="socialContext"]').some(el => /replying|回复|回应/i.test(el.textContent ?? '')) || /(?:Replying to|回复 @|回复给)/i.test(article.textContent ?? '');
}
export function readPageSnapshot(doc: Document, requestedUrl: string): PageSnapshot | undefined {
  const ref = postRef(requestedUrl);
  const viewing=postRef(doc.location?.href??requestedUrl);
  if (!ref || (viewing&&viewing.id!==ref.id)) return;
  const articles = [...doc.querySelectorAll(ARTICLE_SELECTOR)].filter(el => !el.closest('[data-mc-owned]'));
  const index = articles.findIndex(a => readPost(a)?.id === ref.id);
  const article = articles[index];
  const current = article ? readPost(article) : undefined;
  if (!article || !current) return;
  if(!viewing){
    if(!hasReplyMarker(article)&&!hasTopConnector(article)&&!hasBottomConnector(article))return {current,parentState:'unlinked'};
    return {current,parentState:'unknown',replyKnown:hasReplyMarker(article)||hasTopConnector(article)};
  }
  const area = article.closest('[data-testid="primaryColumn"],main') ?? article.parentElement?.parentElement ?? doc.body;
  const loadingText = [...area.querySelectorAll('div,span,p')].some(el => !el.children.length && !el.closest('article') && /^(正在加载帖子|Loading posts?|Loading thread)[.…]*$/i.test((el.textContent ?? '').trim()));
  const beforeTarget=(el:Element)=>!!(el.compareDocumentPosition(article)&Node.DOCUMENT_POSITION_FOLLOWING);
  const loading=[...area.querySelectorAll('[role="progressbar"],[aria-busy="true"]')].some(el=>!el.closest('article,[data-mc-owned]')&&beforeTarget(el));
  if (loadingText || loading) return;
  const previous = articles[index - 1];
  const parent = previous ? readPost(previous) : undefined;
  const modern = !!article.closest('[data-timeline-entry]');
  if (modern) {
    if (hasTopConnector(article)) {
      if (previous && parent && hasBottomConnector(previous) && previous.parentElement?.parentElement === article.parentElement?.parentElement) return { current, parent, parentState: 'known' };
      return { current, parentState: 'unknown',replyKnown:true };
    }
    // The focal entry has a distinct non-link wrapper; feed entries cannot establish a root.
    const focal = article.closest('[data-timeline-entry]');
    if (focal && !previous && !hasReplyMarker(article)) return { current, parentState: 'none' };
    return { current, parentState: 'unknown',replyKnown:hasReplyMarker(article) };
  }
  // Classic X: only the focal detail article in the primary column has tabindex=-1.
  const primary = article.closest('[data-testid="primaryColumn"]');
  // The canonical detail URL plus own post identity establishes the focal item;
  // recent X renders do not consistently give it tabindex=-1.
  if (primary) {
    const entries = [...primary.querySelectorAll('article[data-testid="tweet"]')];
    const at = entries.indexOf(article);
    const prev = entries[at - 1];
    const candidate = prev ? readPost(prev) : undefined;
    const before = [...primary.querySelectorAll('[data-testid="cellInnerDiv"]')];
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    const pos = cell ? before.indexOf(cell) : -1;
    const gap = pos > 0 ? before[pos - 1] : undefined;
    if (candidate && prev && gap?.contains(prev) && !/promoted|推广|广告/i.test(prev.textContent ?? '')) return { current, parent: candidate, parentState: 'known' };
    if (at === 0 && !hasReplyMarker(article) && !/show this thread|显示此帖串|帖子不可用|post unavailable|deleted post/i.test(primary.textContent ?? '')) return { current, parentState: 'none' };
  }
  return { current, parentState: 'unknown',replyKnown:hasReplyMarker(article) };
}
