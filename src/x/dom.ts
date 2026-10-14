import type { PageSnapshot, Post } from '../shared/types';
import { postRef } from './urls';
import { MAX_ANCESTORS } from '../shared/constants';

export const ARTICLE_SELECTOR = 'article';
// Keep original text, even when a translator hides it. Translation targets are
// excluded as candidates as well as descendants; a cloned target may also have
// tweetText / whitespace-pre-wrap and appear before the original.
const TRANSLATION_SELECTOR='[class*="immersive-translate-target"],.immersive-translate-loading,[data-testid="tweetTranslation"],[data-testid="translationText"]';
function owned<T extends Element>(article: Element, selector: string): T[] {
  return [...article.querySelectorAll<T>(selector)].filter(el => el.closest('article') === article && !el.closest('[data-mc-owned],[data-testid="quoteTweet"], [data-quoted-post]'));
}
export function textElement(article: Element): HTMLElement | undefined {
  return owned<HTMLElement>(article, '[data-testid="tweetText"],.whitespace-pre-wrap').find(el=>!el.closest(TRANSLATION_SELECTOR));
}
export function entryAnchor(article:Element):HTMLElement|undefined {
  let anchor=textElement(article)??owned<HTMLElement>(article,'[data-testid="tweetText"],.whitespace-pre-wrap')[0];
  if(!anchor)return;
  for(let el:HTMLElement|null=anchor;el&&el!==article;el=el.parentElement){
    const style=getComputedStyle(el);
    if(el.hidden||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')anchor=el;
  }
  return anchor;
}
export function originalToggle(article:Element):HTMLElement|undefined {
  return owned<HTMLElement>(article,'button,[role="button"]').find(el=>!el.closest('[class*="immersive-translate"]')&&/^(?:show original|view original|显示原文|查看原文|顯示原文|原文を表示|원문 보기|mostrar original|afficher l.original|original anzeigen)$/i.test((el.textContent??'').trim()));
}
function textOf(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll(TRANSLATION_SELECTOR+', [data-mc-owned],script,style').forEach(node=>node.remove());
  clone.querySelectorAll('img[alt]').forEach(img => img.replaceWith(img.getAttribute('alt') ?? ''));
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
  const anchor=text??owned<HTMLElement>(article,'[data-testid="tweetText"],.whitespace-pre-wrap')[0];
  if (!anchor) return;
  const wrapper = article.closest('[data-timeline-entry][data-href]');
  let ref = wrapper ? postRef(wrapper.getAttribute('data-href') ?? '') : undefined;
  if (!ref) {
    const links = owned<HTMLAnchorElement>(article, 'a[href*="/status/"]');
    const link = links.find(a => !!a.querySelector('time')) ?? links.find(a => a.classList.contains('inline-flex') && a.classList.contains('w-fit'));
    ref = link ? postRef(link.href) : undefined;
  }
  if (!ref) return;
  const translated=!!originalToggle(article);
  const body = translated ? '' : text ? textOf(text) : '';
  const originalUnavailable=!body&&(!!anchor.closest(TRANSLATION_SELECTOR)||!!anchor.querySelector(TRANSLATION_SELECTOR));
  if (!body&&!originalUnavailable&&!translated) return;
  const hasMedia = owned(article, '[data-testid="tweetPhoto"], [data-testid="videoPlayer"], video, img[src*="pbs.twimg.com/media"], img[src*="tweet_video_thumb"]').length > 0;
  return { ...ref, text: body, hasMedia, truncated: !!showMoreElement(article), origin: 'x',...(translated?{sourceIssue:'translated' as const}:originalUnavailable?{sourceIssue:'original-unavailable' as const}:{}) };
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
function connectedThread(articles:Element[],index:number,area:Element,current:Post):PageSnapshot {
  let parent:Post|undefined;
  let cursor=articles[index]!;
  for(let depth=1;depth<=MAX_ANCESTORS;depth++){
    const previous=articles[index-depth];
    if(!previous||!area.contains(previous)||!hasTopConnector(cursor)||!hasBottomConnector(previous))break;
    const candidate=readPost(previous);
    if(!candidate||candidate.sourceIssue||/promoted|推广|广告/i.test(previous.textContent??''))break;
    parent??=candidate;
    // Both ends of every edge must match. A missing top line plus a reply marker
    // does not confirm the root; continue collecting on its own detail page.
    if(!hasTopConnector(previous)&&!hasReplyMarker(previous))return {current,parent,parentState:'known',root:candidate,rootDepth:depth};
    cursor=previous;
  }
  return parent?{current,parent,parentState:'known'}:{current,parentState:'unknown',replyKnown:true};
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
  const modern = !!article.closest('[data-timeline-entry]');
  if (modern) {
    if (hasTopConnector(article)) {
      return connectedThread(articles,index,area,current);
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
    const entries = [...primary.querySelectorAll('article[data-testid="tweet"]')].filter(el=>!el.parentElement?.closest('article'));
    const at = entries.indexOf(article);
    const prev = entries[at - 1];
    const candidate = prev ? readPost(prev) : undefined;
    const before = [...primary.querySelectorAll('[data-testid="cellInnerDiv"]')];
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    const pos = cell ? before.indexOf(cell) : -1;
    const gap = pos > 0 ? before[pos - 1] : undefined;
    if (candidate && prev && gap?.contains(prev) && !/promoted|推广|广告/i.test(prev.textContent ?? '')) {
      const head=entries[0],headPost=head?readPost(head):undefined,headCell=head?.closest('[data-testid="cellInnerDiv"]');
      const zeroOffset=headCell instanceof HTMLElement&&/^translateY\(0(?:\.0+)?px\)$/.test(headCell.style.transform);
      const contiguous=pos===at&&before.slice(0,pos+1).every((cell,i)=>!!entries[i]&&cell.contains(entries[i]!));
      const noGap=!/show this thread|显示此帖串|帖子不可用|post unavailable|deleted post/i.test(before.slice(0,pos+1).map(cell=>cell.textContent).join(' '));
      if(head&&headPost&&zeroOffset&&contiguous&&noGap&&at<=MAX_ANCESTORS&&!hasReplyMarker(head)&&!/promoted|推广|广告/i.test(head.textContent??''))return {current,parent:candidate,parentState:'known',root:headPost,rootDepth:at};
      return { current, parent: candidate, parentState: 'known' };
    }
    if (at === 0 && !hasReplyMarker(article) && !/show this thread|显示此帖串|帖子不可用|post unavailable|deleted post/i.test(primary.textContent ?? '')) return { current, parentState: 'none' };
  }
  return { current, parentState: 'unknown',replyKnown:hasReplyMarker(article) };
}
