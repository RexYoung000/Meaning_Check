import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const test = base.extend<{ context: BrowserContext; extensionId: string; worker: Worker }>({
  context: async ({}, use) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'meaning-check-e2e-'));
    const extension = path.resolve('.output/chrome-mv3');
    const context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium', executablePath: process.env.MEANING_CHECK_CHROMIUM || undefined,
      headless: true, viewport: {width:1280,height:860},
      args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
    });
    try { await use(context); } finally { await context.close(); await rm(dir, {recursive:true,force:true}); }
  },
  worker: async ({context}, use) => { const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker'); await use(worker); },
  extensionId: async ({worker}, use) => { await use(worker.url().split('/')[2]!); },
});
export const expect = test.expect;
