import type { PageSnapshot, Post } from '../shared/types';
import { postRef } from './urls';

export const ARTICLE_SELECTOR = 'article';
function owned<T extends Element>(article: Element, selector: string): T[] {
  return [...article.querySelectorAll<T>(selector)].filter(el => el.closest('article') === article && !el.closest('[data-testid="quoteTweet"], [data-quoted-post]'));
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
  return owned<HTMLElement>(article, '[data-testid="tweet-text-show-more-link"]')[0] ?? owned<HTMLElement>(article, 'button, a').find(el => /^(show more|显示更多|展开|查看更多)$/i.test((el.textContent ?? '').trim()));
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
  return owned<HTMLElement>(article, '[aria-hidden="true"]').some(el => el.className.includes('-top-') && (el.className.includes('w-0.5') || el.className.includes('left-1/2')));
}
function hasBottomConnector(article: Element): boolean {
  return owned<HTMLElement>(article, '[aria-hidden="true"]').some(el => el.className.includes('-bottom-') && (el.className.includes('w-0.5') || el.className.includes('left-1/2')));
}
function hasReplyMarker(article: Element): boolean {
  return owned<HTMLElement>(article, '[data-testid="replyingTo"], [data-testid="socialContext"]').some(el => /replying|回复|回应/i.test(el.textContent ?? '')) || /(?:Replying to|回复 @|回复给)/i.test(article.textContent ?? '');
}
export function readPageSnapshot(doc: Document, requestedUrl: string): PageSnapshot | undefined {
  const ref = postRef(requestedUrl);
  if (!ref || postRef(doc.location?.href ?? requestedUrl)?.id !== ref.id) return;
  const articles = [...doc.querySelectorAll(ARTICLE_SELECTOR)].filter(el => !el.closest('[data-mc-owned]'));
  const index = articles.findIndex(a => readPost(a)?.id === ref.id);
  const article = articles[index];
  const current = article ? readPost(article) : undefined;
  if (!article || !current) return;
  const area = article.closest('[data-testid="primaryColumn"],main') ?? article.parentElement?.parentElement ?? doc.body;
  const loadingText = [...area.querySelectorAll('div,span,p')].some(el => !el.children.length && !el.closest('article') && /^(正在加载帖子|Loading posts?|Loading thread)[.…]*$/i.test((el.textContent ?? '').trim()));
  if (loadingText || area.querySelector('[role="progressbar"],[aria-busy="true"]')) return;
  const previous = articles[index - 1];
  const parent = previous ? readPost(previous) : undefined;
  const modern = !!article.closest('[data-timeline-entry]');
  if (modern) {
    if (hasTopConnector(article)) {
      if (previous && parent && hasBottomConnector(previous) && previous.parentElement?.parentElement === article.parentElement?.parentElement) return { current, parent, parentState: 'known' };
      return { current, parentState: 'unknown' };
    }
    // The focal entry has a distinct non-link wrapper; feed entries cannot establish a root.
    const focal = article.closest('[data-timeline-entry]');
    if (focal?.getAttribute('tabindex') === '-1' && !hasReplyMarker(article) && !doc.querySelector('[role="progressbar"]')) return { current, parentState: 'none' };
    return { current, parentState: 'unknown' };
  }
  // Classic X: only the focal detail article in the primary column has tabindex=-1.
  const primary = article.closest('[data-testid="primaryColumn"]');
  const focal = article.getAttribute('tabindex') === '-1';
  if (primary && focal) {
    const entries = [...primary.querySelectorAll('article[data-testid="tweet"]')];
    const at = entries.indexOf(article);
    const prev = entries[at - 1];
    const candidate = prev ? readPost(prev) : undefined;
    const before = [...primary.querySelectorAll('[data-testid="cellInnerDiv"]')];
    const cell = article.closest('[data-testid="cellInnerDiv"]');
    const pos = cell ? before.indexOf(cell) : -1;
    const gap = pos > 0 ? before[pos - 1] : undefined;
    if (candidate && prev && gap?.contains(prev) && !/promoted|推广|广告/i.test(prev.textContent ?? '')) return { current, parent: candidate, parentState: 'known' };
    if (at === 0 && !hasReplyMarker(article) && !primary.querySelector('[role="progressbar"]') && !/show this thread|显示此帖串|帖子不可用/i.test(primary.textContent ?? '')) return { current, parentState: 'none' };
  }
  return { current, parentState: 'unknown' };
}
