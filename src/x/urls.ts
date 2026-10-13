export function postRef(value: string): { id: string; url: string } | undefined {
  try {
    const url = new URL(value, 'https://x.com');
    if (url.origin !== 'https://x.com') return;
    const match = /^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)(?:\/.*)?$/.exec(url.pathname);
    if (!match?.[1] || !match[2]) return;
    return { id: match[2], url: 'https://x.com/' + match[1] + '/status/' + match[2] };
  } catch { return; }
}
export function isXPage(value?: string): boolean {
  try { return !!value && new URL(value).origin === 'https://x.com'; } catch { return false; }
}
