import { browser } from 'wxt/browser';
import { UserError } from './errors';
const KEY = 'deepseekApiKey';
let restriction: Promise<void> | undefined;
export function restrictStorage(): Promise<void> {
  restriction ??= browser.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  return restriction;
}
export async function configured(): Promise<boolean> { await restrictStorage(); return typeof (await browser.storage.local.get(KEY))[KEY] === 'string'; }
export async function loadKey(): Promise<string> {
  await restrictStorage();
  const key = (await browser.storage.local.get(KEY))[KEY];
  if (typeof key !== 'string' || !key.trim()) throw new UserError('missing-key', '请先在扩展设置中填写 DeepSeek 密钥。');
  return key;
}
export async function saveKey(value: string): Promise<void> {
  await restrictStorage();
  const key = value.trim();
  if (!key || key.length > 512 || /\s/.test(key)) throw new UserError('key-format', '请填写完整的密钥，不要包含空格或换行。');
  await browser.storage.local.set({ [KEY]: key });
}
export async function deleteKey(): Promise<void> { await restrictStorage(); await browser.storage.local.remove(KEY); }
