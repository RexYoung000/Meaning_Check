import type { PageSnapshot, Post } from '../shared/types';
import { MAX_ANCESTORS } from '../shared/constants';
import { redditRef } from './urls';
export const COMMENT_SELECTOR='shreddit-comment[thingid], [data-testid="comment"][data-fullname]';
export const ROOT_SELECTOR='shreddit-post[post-type], shreddit-post[thingid], shreddit-post[id^="t3_"], [data-testid="post-container"][data-fullname]';
export const ITEM_SELECTOR=COMMENT_SELECTOR+','+ROOT_SELECTOR;
function idOf(el:Element):string|undefined {const id=el.getAttribute('thingid')??el.getAttribute('data-fullname')??el.id;return /^t[13]_[a-z0-9]+$/i.test(id)?id.toLowerCase():undefined;}
function parentIdOf(el:Element):string|undefined {
  const nested=el.parentElement?.closest(COMMENT_SELECTOR);
  const root=!nested&&el.matches('shreddit-comment[depth="0"]')?el.getAttribute('postid'):undefined;
  const id=el.getAttribute('parentid')??el.getAttribute('parent-id')??el.getAttribute('data-parent-id')??(nested?idOf(nested):root);
  return id&&/^t[13]_[a-z0-9]+$/i.test(id)?id.toLowerCase():undefined;
}
function own(el:Element,selector:string):HTMLElement|undefined {return [...el.querySelectorAll<HTMLElement>(selector)].find(n=>n.closest(COMMENT_SELECTOR)=== (el.matches(COMMENT_SELECTOR)?el:null)&&!n.closest('[data-mc-owned]'));}
export function textElement(el:Element):HTMLElement|undefined {return el.matches(COMMENT_SELECTOR)?own(el,'[slot="comment"], [id$="-comment-rtjson-content"], [data-testid="comment-body"]'):own(el,'[slot="text-body"], [data-testid="post-text-container"]')??el.querySelector<HTMLElement>('h1')??undefined;}
function clean(el:Element):string {const clone=el.cloneNode(true) as Element;clone.querySelectorAll('img[alt]').forEach(i=>i.replaceWith(i.getAttribute('alt')??''));clone.querySelectorAll('[data-mc-owned],script,style,.immersive-translate-target-inner,[class*="immersive-translate-target-translation"]').forEach(n=>n.remove());return clone.textContent?.trim()??'';}
export function readPost(el:Element):Post|undefined {
  const comment=el.matches(COMMENT_SELECTOR);const id=idOf(el);if(!id||!id.startsWith(comment?'t1_':'t3_'))return;
  const body=textElement(el);const text=body?clean(body):'';const title=comment?'':el.getAttribute('post-title')??el.querySelector('h1')?.textContent?.trim()??'';
  const full=comment?text:[title,text!==title?text:''].filter(Boolean).join('\n');if(!full)return;
  const permalink=el.getAttribute('permalink')??el.getAttribute('data-permalink')??el.querySelector<HTMLAnchorElement>('a[slot="comment-header"],a[href*="/comments/"]')?.getAttribute('href');
  const page=redditRef(el.ownerDocument.location.href);
  let ref=permalink?redditRef(new URL(permalink,el.ownerDocument.location.origin).href):undefined;
  if(!ref&&!permalink&&page){const root=redditRef(page.rootUrl);const base=page.rootUrl.replace(/(\/comments\/[a-z0-9]+)\/.*$/i,'$1/');ref=comment?redditRef(base+'comment/'+id.slice(3)+'/'):root;}
  if(!ref||ref.id!==id.toLowerCase())return;
  return {id:ref.id,url:ref.url,text:full,origin:'reddit',truncated:!!own(el,'[data-testid="show-more"],button[slot="read-more"]'),hasMedia:comment?!!body?.querySelector('video,img:not([class*="emoji"]),iframe'):!!own(el,'[slot="post-media-container"],[slot="post-media"],[data-testid="post-image"],shreddit-player,video')};
}
export function readPageSnapshot(doc:Document,url:string):PageSnapshot|undefined {
  const ref=redditRef(url);if(!ref||redditRef(doc.location.href)?.postId!==ref.postId)return;
  const candidates=[...doc.querySelectorAll(ITEM_SELECTOR)].filter(n=>!n.closest('[data-mc-owned]'));
  const find=(id:string)=>candidates.find(n=>idOf(n)===id);
  const el=find(ref.id);
  const current=el?readPost(el):undefined;if(!current||!el)return;
  if(ref.id.startsWith('t3_'))return {current,parentState:'none'};
  const parentId=parentIdOf(el);
  if(!parentId)return {current,parentState:'unknown',replyKnown:true};
  const parentEl=find(parentId);
  const parent=parentEl?readPost(parentEl):undefined;
  if(!parent||parent.id===current.id||redditRef(parent.url)?.postId!==ref.postId)return {current,parentState:'unknown',replyKnown:true};
  const snapshot:PageSnapshot={current,parent,parentState:'known'};
  // Follow only explicit parent links or native nesting; do not pick a visible
  // root from an unrelated branch. Intermediate bodies are never retained.
  const seen=new Set([current.id]);let ancestor=parentEl;
  for(let depth=1;ancestor&&depth<=MAX_ANCESTORS;depth++){
    const id=idOf(ancestor);if(!id||seen.has(id))break;seen.add(id);
    const permalink=ancestor.getAttribute('permalink')??ancestor.getAttribute('data-permalink');
    if(permalink&&redditRef(new URL(permalink,doc.location.origin).href)?.postId!==ref.postId)break;
    if(id===ref.postId){const root=id===parent.id?parent:readPost(ancestor);if(root&&redditRef(root.url)?.postId===ref.postId){snapshot.root=root;snapshot.rootDepth=depth;}break;}
    if(id.startsWith('t3_'))break;
    const next=parentIdOf(ancestor);ancestor=next?find(next):undefined;
  }
  return snapshot;
}
