import type { PageSnapshot, Post } from '../shared/types';
import { redditRef } from './urls';
export const COMMENT_SELECTOR='shreddit-comment[thingid], [data-testid="comment"][data-fullname]';
export const ROOT_SELECTOR='shreddit-post[post-type], shreddit-post[thingid], [data-testid="post-container"][data-fullname]';
export const ITEM_SELECTOR=COMMENT_SELECTOR+','+ROOT_SELECTOR;
function own(el:Element,selector:string):HTMLElement|undefined {return [...el.querySelectorAll<HTMLElement>(selector)].find(n=>n.closest(COMMENT_SELECTOR)=== (el.matches(COMMENT_SELECTOR)?el:null)&&!n.closest('[data-mc-owned]'));}
export function textElement(el:Element):HTMLElement|undefined {return el.matches(COMMENT_SELECTOR)?own(el,'[slot="comment"], [id$="-comment-rtjson-content"], [data-testid="comment-body"]'):own(el,'[slot="text-body"], [data-testid="post-text-container"]')??el.querySelector<HTMLElement>('h1')??undefined;}
function clean(el:Element):string {const clone=el.cloneNode(true) as Element;clone.querySelectorAll('img[alt]').forEach(i=>i.replaceWith(i.getAttribute('alt')??''));clone.querySelectorAll('[data-mc-owned],script,style,.immersive-translate-target-inner,[class*="immersive-translate-target-translation"]').forEach(n=>n.remove());return clone.textContent?.trim()??'';}
export function readPost(el:Element):Post|undefined {
  const comment=el.matches(COMMENT_SELECTOR);const id=el.getAttribute('thingid')??el.getAttribute('data-fullname');if(!id||!/^t[13]_[a-z0-9]+$/i.test(id))return;
  const body=textElement(el);const text=body?clean(body):'';const title=comment?'':el.getAttribute('post-title')??el.querySelector('h1')?.textContent?.trim()??'';
  const full=comment?text:[title,text!==title?text:''].filter(Boolean).join('\n');if(!full)return;
  const permalink=el.getAttribute('permalink')??el.getAttribute('data-permalink')??el.querySelector<HTMLAnchorElement>('a[slot="comment-header"],a[href*="/comments/"]')?.getAttribute('href');
  let ref=permalink?redditRef(new URL(permalink,location.origin).href):undefined;
  if(!ref){const page=redditRef(location.href);if(page){const root=redditRef(page.rootUrl);ref=comment?redditRef(page.rootUrl+id.slice(3)+'/'):root;}}
  if(!ref||ref.id!==id.toLowerCase())return;
  return {id:ref.id,url:ref.url,text:full,origin:'reddit',truncated:!!own(el,'[data-testid="show-more"],button[slot="read-more"]'),hasMedia:comment?!!body?.querySelector('video,img:not([class*="emoji"]),iframe'):!!own(el,'[slot="post-media-container"],[slot="post-media"],[data-testid="post-image"],shreddit-player,video')};
}
export function readPageSnapshot(doc:Document,url:string):PageSnapshot|undefined {
  const ref=redditRef(url);if(!ref||redditRef(doc.location.href)?.postId!==ref.postId)return;
  const candidates=[...doc.querySelectorAll(COMMENT_SELECTOR+','+ROOT_SELECTOR)];
  const el=candidates.find(n=>(n.getAttribute('thingid')??n.getAttribute('data-fullname'))?.toLowerCase()===ref.id);
  const current=el?readPost(el):undefined;if(!current||!el)return;
  if(ref.id.startsWith('t3_'))return {current,parentState:'none'};
  const parentId=(el.getAttribute('parentid')??el.getAttribute('parent-id')??el.getAttribute('data-parent-id')??el.parentElement?.closest(COMMENT_SELECTOR)?.getAttribute('thingid'))?.toLowerCase();
  if(!parentId)return {current,parentState:'unknown',replyKnown:true};
  const parentEl=candidates.find(n=>(n.getAttribute('thingid')??n.getAttribute('data-fullname'))?.toLowerCase()===parentId);
  const parent=parentEl?readPost(parentEl):undefined;return parent?{current,parent,parentState:'known'}:{current,parentState:'unknown',replyKnown:true};
}
