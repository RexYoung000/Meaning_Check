import { browser } from 'wxt/browser';
import { COLLECTOR_PARAM } from '../shared/constants';
import { UserError, wait, throwIfAborted } from '../shared/errors';
import type { PageSnapshot } from '../shared/types';
import { validateSnapshot } from '../analysis/context';
import { postRef } from './urls';

interface OwnedTab { id: number; token: string; expires: number; pending?: boolean }
const REGISTRY = 'collectorTabs';
let registryLock: Promise<unknown> = Promise.resolve();
async function mutateRegistry(fn: (tabs: OwnedTab[]) => OwnedTab[]): Promise<void> {
  const next = registryLock.then(async () => {
    const value = (await browser.storage.session.get(REGISTRY))[REGISTRY];
    await browser.storage.session.set({ [REGISTRY]: fn(Array.isArray(value) ? value : []) });
  });
  registryLock = next.catch(() => {});
  await next;
}
async function removeOwned(tab: OwnedTab): Promise<void> {
  try {
    const live = await browser.tabs.get(tab.id);
    if ((tab.pending && (!live.url || live.url === 'about:blank')) || (live.url && new URL(live.url).searchParams.get(COLLECTOR_PARAM) === tab.token)) await browser.tabs.remove(tab.id);
  } catch { /* Closed or navigated tabs are not ours to remove. */ }
}
export async function cleanupOrphans(): Promise<void> {
  const value = (await browser.storage.session.get(REGISTRY))[REGISTRY];
  if (Array.isArray(value)) for (const tab of value) if (Number.isInteger(tab.id) && typeof tab.token === 'string') await removeOwned(tab);
  await browser.storage.session.remove(REGISTRY);
}
export class Collector {
  private tab?: OwnedTab;
  constructor(private token: string) {}
  async read(url: string, signal: AbortSignal): Promise<PageSnapshot> {
    const ref = postRef(url);
    if (!ref) throw new UserError('context-url', '无法确认需要补齐的帖子地址。');
    throwIfAborted(signal);
    const target = new URL(ref.url);
    target.searchParams.set(COLLECTOR_PARAM, this.token);
    if (!this.tab) {
      const created = await browser.tabs.create({ url: 'about:blank', active: false });
      if (created.id === undefined) throw new UserError('context-tab', '无法打开补齐页面。');
      this.tab = { id: created.id, token: this.token, expires: Date.now() + 30_000, pending: true };
      try {
        await mutateRegistry(tabs => [...tabs, this.tab!]);
        throwIfAborted(signal);
        const owned = this.tab;
        await browser.tabs.update(owned.id, { url: target.href, active: false });
        owned.pending = false;
        await mutateRegistry(tabs => tabs.map(t => t.id === owned.id && t.token === owned.token ? owned : t));
      } catch (error) { await this.close(); throw error; }
    } else {
      await browser.tabs.update(this.tab.id, { url: target.href, active: false });
    }
    let stable = '';
    let since = 0;
    try {
      while (true) {
        throwIfAborted(signal);
        try {
          const value = await browser.tabs.sendMessage(this.tab.id, { type: 'collect-snapshot', token: this.token, url: ref.url });
          const snapshot = validateSnapshot(value, ref.id);
          if (snapshot && !snapshot.current.truncated) {
            const signature = JSON.stringify(snapshot);
            if (signature !== stable) { stable = signature; since = Date.now(); }
            else if (Date.now() - since >= 750) return snapshot;
          }
        } catch { /* The content script may not have loaded yet. */ }
        await wait(250, signal);
      }
    } finally { if (signal.aborted) await this.close(); }
  }
  async close(): Promise<void> {
    const tab = this.tab;
    if (!tab) return;
    this.tab = undefined;
    await removeOwned(tab);
    await mutateRegistry(tabs => tabs.filter(t => t.id !== tab.id || t.token !== tab.token));
  }
}
