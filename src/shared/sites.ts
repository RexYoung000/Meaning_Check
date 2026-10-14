import type { Preferences, SiteConfig } from './types';
export const DEFAULT_SITES: SiteConfig[] = [
  { id:'x',name:'X',origin:'https://x.com',paths:['/*'],enabled:true,adapter:'x' },
  { id:'reddit',name:'Reddit',origin:'https://www.reddit.com',paths:['/*'],enabled:true,adapter:'reddit' },
  { id:'reddit-root',name:'Reddit (reddit.com)',origin:'https://reddit.com',paths:['/*'],enabled:true,adapter:'reddit' },
];
export function pathMatches(pattern:string, path:string):boolean {
  return new RegExp('^' + pattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*') + '$').test(path);
}
export function siteFor(url:string|undefined, preferences:Preferences):SiteConfig|undefined {
  if (!url || !preferences.enabled) return;
  try { const u=new URL(url); if ((u.hostname==='x.com' && /^\/(messages|i\/chat|compose)(\/|$)/.test(u.pathname)) || (['reddit.com','www.reddit.com'].includes(u.hostname) && /^\/(message|chat|settings)(\/|$)/.test(u.pathname))) return; return preferences.sites.find(s => s.enabled && s.origin===u.origin && s.paths.some(p => pathMatches(p,u.pathname))); } catch { return; }
}
export function validateSite(value:SiteConfig):SiteConfig {
  let u:URL;try { u=new URL(value.origin); } catch { throw new Error('site-format'); }
  if (u.protocol!=='https:' || u.username || u.password || u.search || u.hash || u.pathname!=='/' || (value.id && !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)) || !value.name?.trim() || value.name.length>80 || !Array.isArray(value.paths) || !value.paths.length || value.paths.length>30 || value.paths.some(p=>typeof p!=='string'||!p.startsWith('/')||p.length>300||/[\r\n?#]/.test(p))) throw new Error('site-format');
  const origin=u.origin;
  const adapter=origin==='https://x.com'?'x':['https://www.reddit.com','https://reddit.com'].includes(origin)?'reddit':'selection';
  return {id:value.id||crypto.randomUUID(),name:value.name.trim(),origin,paths:[...new Set(value.paths.map(p=>p.trim()))],enabled:!!value.enabled,adapter};
}
