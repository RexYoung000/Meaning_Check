export class UserError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'UserError'; }
}
export function abortError(): DOMException { return new DOMException('任务已取消', 'AbortError'); }
export function throwIfAborted(signal: AbortSignal): void { if (signal.aborted) throw abortError(); }
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof UserError) return { code: error.code, message: error.message };
  if (error instanceof Error && error.name === 'AbortError') return { code: 'cancelled', message: '任务已取消。' };
  return { code: 'unavailable', message: '这次没有完成。可以重新点击尝试；若持续失败，请检查网络或扩展状态。' };
}
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function composeSignals(signals: AbortSignal[]): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const dispose = () => { for (const signal of signals) signal.removeEventListener('abort', abort); };
  const abort = () => { controller.abort(); dispose(); };
  for (const signal of signals) {
    if (signal.aborted) { abort(); break; }
    signal.addEventListener('abort', abort, { once: true });
  }
  return { signal: controller.signal, dispose };
}
