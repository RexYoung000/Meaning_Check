import { browser } from 'wxt/browser';

export async function openSettings(section?: 'models' | 'languages' | 'sites'): Promise<void> {
  const url = browser.runtime.getURL('/options.html');
  const tabs = await browser.tabs.query({ url });
  const existing = tabs.find(tab => tab.id !== undefined);
  if (existing?.id !== undefined) {
    // Keep unsaved drafts and the current section when using the general entry.
    await browser.tabs.update(existing.id, { active: true, ...(section ? { url: url + '#' + section } : {}) });
    if (existing.windowId !== undefined) await browser.windows.update(existing.windowId, { focused: true });
  } else await browser.tabs.create({ url: url + (section ? '#' + section : '') });
}
