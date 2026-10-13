import { browser, type Browser } from 'wxt/browser';
import styles from './style.css?inline';
import { ARTICLE_SELECTOR, readPageSnapshot, readPost, showMoreElement, textElement } from '../../x/dom';
import { COLLECTOR_PARAM, HEARTBEAT_MS, PORT_PREFIX } from '../../shared/constants';
import { postRef } from '../../x/urls';
import type { ClientCommand, ContextBundle, JobEvent, Post } from '../../shared/types';
import { ResultCard } from '../../ui/card';
import { button, darkTheme, node } from '../../ui/elements';

type Port = Browser.runtime.Port;
export default defineContentScript({
  matches: ['https://x.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    const token = new URL(location.href).searchParams.get(COLLECTOR_PARAM);
    if (token) {
      // Collector tabs never add reading controls or start model requests.
      const collectorListener = (message: any, sender: Browser.runtime.MessageSender, sendResponse: (value?: unknown) => void) => {
        if (sender.id !== browser.runtime.id || sender.tab || message?.type !== 'collect-snapshot' || message.token !== token) return;
        const target = postRef(message.url ?? '');
        if (!target || postRef(location.href)?.id !== target.id) return;
        const article = [...document.querySelectorAll(ARTICLE_SELECTOR)].find(a => readPost(a)?.id === target.id);
        const more = article ? showMoreElement(article) : undefined;
        if (more) { more.click(); return; }
        sendResponse(readPageSnapshot(document, target.url));
        return false;
      };
      browser.runtime.onMessage.addListener(collectorListener);
      ctx.addEventListener(window, 'pagehide', () => browser.runtime.onMessage.removeListener(collectorListener));
      ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(collectorListener));
      return;
    }
    let card: ResultCard | undefined;
    let port: Port | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let currentArticle: HTMLElement | undefined;
    let returnFocus: HTMLButtonElement | undefined;
    let busy = false;
    let currentPostId: string | undefined;
    let lastUrl = location.href;
    let lastBundle: ContextBundle | undefined;
    let selectedPost: Post | undefined;
    const entries = new Map<HTMLElement, HTMLElement>();
    const stopHeartbeat = () => { if (heartbeat) clearInterval(heartbeat); heartbeat = undefined; };
    const close = (focus = true) => {
      const active = port;
      port = undefined;
      stopHeartbeat();
      try { active?.postMessage({ type: 'cancel' }); active?.disconnect(); } catch {}
      lastBundle = undefined; selectedPost = undefined;
      card?.remove(); card = undefined; currentArticle = undefined; currentPostId = undefined; busy = false;
      if (focus && returnFocus?.isConnected) {
        const host = (returnFocus.getRootNode() as ShadowRoot).host as HTMLElement;
        host.dataset.visible = 'true';
        returnFocus.focus({ preventScroll: true });
      }
    };
    const send = (command: ClientCommand) => {
      if (busy) return;
      if (!port && !connect()) return;
      busy = true;
      stopHeartbeat();
      heartbeat = setInterval(() => { try { port?.postMessage({ type: 'heartbeat' }); } catch { stopHeartbeat(); } }, HEARTBEAT_MS);
      try { port!.postMessage(command); } catch { busy = false; stopHeartbeat(); card?.error('background-restarted', '连接已断开。请关闭后重新点击分析。'); }
    };
    function connect(): boolean {
      try { port = browser.runtime.connect({ name: PORT_PREFIX + crypto.randomUUID() }); }
      catch { card?.error('background-restarted', '扩展连接不可用，请刷新页面后再试。'); return false; }
      const connected = port;
      connected.onMessage.addListener((event: JobEvent) => {
        if (port !== connected || !card) return;
        if (event.type === 'phase') card.phase(event.phase);
        else {
          busy = false; stopHeartbeat();
          if (event.type === 'context') { lastBundle = event.bundle; card.context(event.bundle, event.reason); }
          if (event.type === 'result') { lastBundle = event.bundle; card.result(event.bundle, event.response); }
          if (event.type === 'error') { if (event.bundle) lastBundle = event.bundle; card.error(event.code, event.message, event.bundle); }
        }
      });
      connected.onDisconnect.addListener(() => {
        if (port === connected) { port = undefined; const wasBusy = busy; busy = false; stopHeartbeat(); if (wasBusy) card?.error('background-restarted', '扩展后台连接已断开。请关闭后重新点击分析。'); }
      });
      return true;
    }
    const start = async (article: HTMLElement, trigger: HTMLButtonElement) => {
      if (busy && currentArticle === article) return;
      close(false);
      returnFocus = trigger;
      currentArticle = article;
      card = new ResultCard(article, styles, {
        close: () => close(), retryContext: () => { if (selectedPost) send({ type: 'start', post: selectedPost }); }, analyze: manual => send({ type: 'analyze', bundle: lastBundle, manual }),
        settings: () => { void browser.runtime.sendMessage({ type: 'open-settings' }); },
      });
      const more = showMoreElement(article);
      if (more) more.click();
      const post = readPost(article);
      if (!post) { card.error('bad-input', '没有读到正文，请打开回复详情再试。'); return; }
      currentPostId = post.id;
      selectedPost = post;
      if (!connect()) return;
      card.phase('context');
      send({ type: 'start', post, snapshot: readPageSnapshot(document, post.url) });
    };
    const attach = (article: HTMLElement) => {
      const existing = entries.get(article);
      if (existing?.isConnected) { existing.dataset.visible = 'true'; return; }
      if (existing) entries.delete(article);
      if (!article.isConnected) return;
      const post = readPost(article);
      if (!post || !/[a-zA-Z]|\p{Extended_Pictographic}/u.test(post.text)) return;
      const text = textElement(article);
      if (!text) return;
      const host = node('meaning-check-entry');
      host.dataset.mcOwned = 'true';
      host.dataset.visible = 'true';
      host.dataset.theme = darkTheme() ? 'dark' : 'light';
      const root = host.attachShadow({ mode: 'open' });
      const trigger = button('帮我确认意思', () => { void start(article, trigger); }, 'entry-button');
      root.append(node('style', styles), trigger);
      host.addEventListener('click', event => event.stopPropagation());
      text.after(host);
      entries.set(article, host);
    };
    const candidate = (target: EventTarget | null): HTMLElement | undefined => {
      if (!(target instanceof Element)) return;
      return (target.closest(ARTICLE_SELECTOR) ?? target.closest('[data-timeline-entry]')?.querySelector(ARTICLE_SELECTOR)) as HTMLElement | undefined;
    };
    ctx.addEventListener(document, 'pointerover', event => { const article = candidate(event.target); if (article) attach(article); });
    ctx.addEventListener(document, 'pointermove', event => { const article = candidate(event.target); if (article) attach(article); });
    ctx.addEventListener(document, 'focusin', event => { const article = candidate(event.target); if (article) attach(article); });
    for (const type of ['pointerout', 'focusout'] as const) ctx.addEventListener(document, type, event => {
      const article = candidate(event.target);
      if (article && article !== currentArticle && candidate(event.relatedTarget) !== article) { const host = entries.get(article); if (host) host.dataset.visible = 'false'; }
    });
    ctx.addEventListener(document, 'keydown', event => { if (event.key === 'Escape' && card) { event.preventDefault(); close(); } });
    ctx.addEventListener(document, 'pointerdown', event => {
      if (card && !event.composedPath().includes(card.host) && !event.composedPath().some(el => el instanceof HTMLElement && el.tagName === 'MEANING-CHECK-ENTRY')) close(false);
    });
    ctx.addEventListener(window, 'pagehide', () => close(false));
    ctx.addEventListener(window, 'resize', () => card?.position());
    ctx.addEventListener(document, 'scroll', () => card?.position(), { capture: true, passive: true });
    const observer = new MutationObserver(records => {
      if (records.every(r => (r.target instanceof Element ? r.target : r.target.parentElement)?.closest('[data-mc-owned]'))) return;
      if (location.href !== lastUrl) { lastUrl = location.href; close(false); }
      if (currentArticle && (!currentArticle.isConnected || readPost(currentArticle)?.id !== currentPostId)) close(false);
      for (const [article, host] of entries) {
        if (!article.isConnected) entries.delete(article);
        else host.dataset.theme = darkTheme() ? 'dark' : 'light';
      }
      card?.position();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','data-theme'] });
    ctx.addEventListener(window, 'wxt:locationchange', () => { lastUrl = location.href; close(false); });
    ctx.addEventListener(window, 'popstate', () => { lastUrl = location.href; close(false); });
    ctx.addEventListener(window, 'pagehide', () => observer.disconnect());
    ctx.onInvalidated(() => { close(false); observer.disconnect(); for (const host of entries.values()) host.remove(); entries.clear(); });
  },
});
