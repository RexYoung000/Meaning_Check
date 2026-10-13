import { browser, type Browser } from 'wxt/browser';
import { PORT_PREFIX } from '../shared/constants';
import type { ClientCommand, ContextBundle, JobEvent, PageSnapshot, Post } from '../shared/types';
import { safeError, UserError } from '../shared/errors';
import { configured, loadKey, restrictStorage } from '../shared/settings';
import { isXPage } from '../x/urls';
import { Collector, cleanupOrphans } from '../x/collector';
import { applyManual, resolveContext, validateBundle, validatePost, validateSnapshot } from '../analysis/context';
import { analyze } from '../analysis/provider';

type Port = Browser.runtime.Port;
export default defineBackground(() => {
  const ready = restrictStorage().then(cleanupOrphans);
  ready.catch(() => {});
  browser.action.onClicked.addListener(() => { void browser.runtime.openOptionsPage(); });
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== browser.runtime.id) return;
    if (message?.type === 'config-status' && (!sender.tab || isXPage(sender.url))) {
      void ready.then(configured).then(value => sendResponse({ configured: value })).catch(() => sendResponse({ configured: false }));
      return true;
    }
    if (message?.type === 'open-settings' && isXPage(sender.url)) {
      void browser.runtime.openOptionsPage().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
      return true;
    }
  });
  const activeByTab = new Map<number, Port>();
  browser.runtime.onConnect.addListener(port => {
    const tabId = port.sender?.tab?.id;
    if (!port.name.startsWith(PORT_PREFIX) || port.sender?.id !== browser.runtime.id || tabId === undefined || !isXPage(port.sender.url)) { port.disconnect(); return; }
    const old = activeByTab.get(tabId);
    old?.disconnect();
    activeByTab.set(tabId, port);
    let disconnected = false;
    let busy = false;
    let current: Post | undefined;
    let initial: PageSnapshot | undefined;
    let bundle: ContextBundle | undefined;
    let controller: AbortController | undefined;
    const collector = new Collector(crypto.randomUUID());
    const emit = (event: JobEvent) => { if (!disconnected) try { port.postMessage(event); } catch {} };
    const stop = () => { controller?.abort(); void collector.close().catch(() => {}); };
    port.onDisconnect.addListener(() => { disconnected = true; stop(); if (activeByTab.get(tabId) === port) activeByTab.delete(tabId); });
    const runAnalysis = async (manual?: Parameters<typeof applyManual>[1]) => {
      if (!bundle || !controller) return;
      const resolved = applyManual(bundle, manual);
      // Keep the exact confirmed or manually amended bundle for a deliberate retry.
      bundle = resolved;
      const key = await loadKey();
      emit({ type: 'phase', phase: 'analysis' });
      const response = await analyze(resolved, key, controller.signal);
      if (!controller.signal.aborted) emit({ type: 'result', bundle: resolved, response });
    };
    const runContext = async () => {
      if (!current || !controller) return;
      await loadKey();
      emit({ type: 'phase', phase: 'context' });
      const resolved = await resolveContext(current, initial, (url, signal) => collector.read(url, signal), controller.signal);
      await collector.close();
      bundle = resolved.bundle;
      if (controller.signal.aborted) return;
      if (resolved.original) throw new UserError('original-post', '这条是原帖。请对它下面的英文回复使用「帮我确认意思」。');
      if (bundle.missing.length || bundle.posts.some(p => p.truncated)) emit({ type: 'context', bundle, reason: resolved.reason });
      else await runAnalysis();
    };
    port.onMessage.addListener((raw: ClientCommand) => {
      if (raw?.type === 'heartbeat') return;
      if (raw?.type === 'cancel') { stop(); return; }
      if (busy || disconnected) return;
      busy = true;
      controller = new AbortController();
      const task = async () => {
        await ready;
        if (disconnected) return;
        if (raw?.type === 'start') {
          current = validatePost(raw.post);
          initial = validateSnapshot(raw.snapshot, current.id);
          if (current.truncated || initial?.parentState === 'unknown') initial = undefined;
          await runContext();
        } else if (raw?.type === 'retry-context') { initial = undefined; await runContext(); }
        else if (raw?.type === 'analyze') { if (raw.bundle) bundle = validateBundle(raw.bundle); await runAnalysis(raw.manual); }
      };
      void task().catch(error => {
        if (!controller?.signal.aborted) emit({ type: 'error', ...safeError(error), ...(bundle ? { bundle } : {}) });
      }).finally(() => { busy = false; });
    });
  });
});
