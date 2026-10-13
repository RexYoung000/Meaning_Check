import './style.css';
import { configured, deleteKey, saveKey } from '../../shared/settings';
import { safeError } from '../../shared/errors';
const form = document.querySelector<HTMLFormElement>('#settings-form')!;
const input = document.querySelector<HTMLInputElement>('#api-key')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;
const status = document.querySelector<HTMLParagraphElement>('#config-status')!;
const remove = document.querySelector<HTMLButtonElement>('#delete-key')!;
const save = document.querySelector<HTMLButtonElement>('#save-key')!;
let busy = false;
async function refresh() {
  const exists = await configured();
  status.textContent = exists ? '已保存密钥。保存仅代表本地配置完成，连接是否可用会在分析时确认。' : '还没有连接。填写密钥后即可开始。';
  remove.disabled = !exists;
}
async function perform(action: () => Promise<void>, success: string) {
  if (busy) return;
  busy = true; save.disabled = true; remove.disabled = true;
  try { await action(); input.value = ''; message.textContent = success; await refresh(); }
  catch (error) { message.textContent = safeError(error).message; }
  finally { busy = false; save.disabled = false; await refresh().catch(() => {}); }
}
form.addEventListener('submit', event => { event.preventDefault(); void perform(() => saveKey(input.value), '密钥已保存。现在可以到 X 回复旁使用。'); });
remove.addEventListener('click', () => { void perform(deleteKey, '已删除密钥。之后分析需要重新配置。'); });
void refresh().catch(() => { message.textContent = '无法读取插件设置，请重新加载扩展后再试。'; save.disabled = true; });
