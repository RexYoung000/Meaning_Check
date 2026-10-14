export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K];
export function node(tag: string, text?: string, className?: string): HTMLElement;
export function node(tag: string, text?: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
export function button(text: string, action: () => void, className = 'button'): HTMLButtonElement {
  const el = node('button', text, className);
  el.type = 'button';
  el.addEventListener('click', event => { if (event.isTrusted) action(); });
  return el;
}
export function safeLink(text: string, url: string): HTMLAnchorElement {
  const a = node('a', text);
  try { const u = new URL(url); if (u.protocol === 'https:') { a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; } } catch { /* Invalid sources are never navigable. */ }
  return a;
}
export function darkTheme(): boolean {
  const html = document.documentElement;
  if (html.classList.contains('dark') || html.dataset.theme === 'dark') return true;
  const color = getComputedStyle(document.body).backgroundColor;
  const rgb = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (rgb?.length === 3 && color !== 'rgba(0, 0, 0, 0)') return (rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722) < 115;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
