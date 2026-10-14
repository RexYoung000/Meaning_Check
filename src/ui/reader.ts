import {browser,type Browser} from 'wxt/browser';
import type {ContentScriptContext} from 'wxt/utils/content-script-context';
import styles from '../entrypoints/x.content/style.css?inline';
import * as x from '../x/dom';
import * as reddit from '../reddit/dom';
import {COLLECTOR_PARAM,HEARTBEAT_MS,PORT_PREFIX} from '../shared/constants';
import {threadRef} from '../shared/thread';
import {siteFor} from '../shared/sites';
import {t} from '../shared/i18n';
import type {ClientCommand,ContextBundle,JobEvent,Post,PublicConfig} from '../shared/types';
import {ResultCard} from './card';
import {button,darkTheme,node} from './elements';
import {icon} from './icon';

declare global {interface Window {__meaningCheckReader?:boolean}}
type Port=Browser.runtime.Port;
export function startReader(ctx:ContentScriptContext,selectionOnly=false):void {
  if(window.__meaningCheckReader)return;window.__meaningCheckReader=true;
  const adapter=location.hostname==='x.com'?x:reddit;
  const selector=location.hostname==='x.com'?x.ARTICLE_SELECTOR:reddit.COMMENT_SELECTOR;
  const token=new URL(location.href).searchParams.get(COLLECTOR_PARAM);
  if(token&&!selectionOnly){
    const listener=(message:any,sender:Browser.runtime.MessageSender,sendResponse:(value?:unknown)=>void)=>{
      if(sender.id!==browser.runtime.id||sender.tab||message?.type!=='collect-snapshot'||message.token!==token)return;
      const target=threadRef(message.url??'');if(!target||threadRef(location.href)?.id!==target.id)return;
      const article=[...document.querySelectorAll(selector)].find(a=>adapter.readPost(a)?.id===target.id);
      const more=location.hostname==='x.com'&&article?x.showMoreElement(article):undefined;if(more){more.click();return;}
      sendResponse(adapter.readPageSnapshot(document,target.url));return false;
    };
    browser.runtime.onMessage.addListener(listener);ctx.addEventListener(window,'pagehide',()=>browser.runtime.onMessage.removeListener(listener));ctx.onInvalidated(()=>browser.runtime.onMessage.removeListener(listener));return;
  }
  let config:PublicConfig|undefined,card:ResultCard|undefined,port:Port|undefined,heartbeat:ReturnType<typeof setInterval>|undefined;
  let currentArticle:HTMLElement|undefined,returnFocus:HTMLButtonElement|undefined,busy=false,currentPostId:string|undefined,lastUrl=location.href,lastBundle:ContextBundle|undefined,selectedPost:Post|undefined;
  let selectionHost:HTMLElement|undefined,selectionText='',selectionAnchor:HTMLElement|undefined;
  const entries=new Map<HTMLElement,HTMLElement>();
  const lang=()=>config?.uiLanguage??'en';
  const allowed=()=>!!config&&!!siteFor(location.href,config.preferences);
  const stopHeartbeat=()=>{if(heartbeat)clearInterval(heartbeat);heartbeat=undefined;};
  const close=(focus=true)=>{
    const active=port;port=undefined;stopHeartbeat();try{active?.postMessage({type:'cancel'});active?.disconnect();}catch{}
    lastBundle=undefined;selectedPost=undefined;card?.remove();card=undefined;currentArticle=undefined;currentPostId=undefined;busy=false;
    if(focus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
  };
  const send=(command:ClientCommand)=>{
    if(busy)return;if(!port&&!connect())return;busy=true;stopHeartbeat();heartbeat=setInterval(()=>{try{port?.postMessage({type:'heartbeat'});}catch{stopHeartbeat();}},HEARTBEAT_MS);
    try{port!.postMessage(command);}catch{busy=false;stopHeartbeat();card?.error('background-restarted','连接已断开。');}
  };
  function connect():boolean {
    try{port=browser.runtime.connect({name:PORT_PREFIX+crypto.randomUUID()});}catch{card?.error('background-restarted','扩展连接不可用。');return false;}
    const connected=port;
    connected.onMessage.addListener((event:JobEvent)=>{
      if(port!==connected||!card)return;
      if(event.type==='phase')card.phase(event.phase);else{busy=false;stopHeartbeat();if(event.type==='context'){lastBundle=event.bundle;card.context(event.bundle,event.reason);}if(event.type==='result'){lastBundle=event.bundle;card.result(event.bundle,event.response);}if(event.type==='error'){if(event.bundle)lastBundle=event.bundle;card.error(event.code,event.message,event.bundle);}}
    });
    connected.onDisconnect.addListener(()=>{if(port===connected){port=undefined;const wasBusy=busy;busy=false;stopHeartbeat();if(wasBusy)card?.error('background-restarted','后台连接已断开。');}});return true;
  }
  const start=(article:HTMLElement,trigger:HTMLButtonElement,selection?:string)=>{
    if(!allowed()||(busy&&currentArticle===article))return;close(false);returnFocus=trigger;currentArticle=article;
    card=new ResultCard(article,styles,{close:()=>close(),retryContext:()=>{if(selectedPost)send({type:'start',post:selectedPost});},analyze:manual=>send({type:'analyze',bundle:lastBundle,manual}),settings:()=>{void browser.runtime.sendMessage({type:'open-settings'});}},lang());
    if(!selection&&location.hostname==='x.com')x.showMoreElement(article)?.click();
    const post:Post|undefined=selection?{id:'selection',url:location.href,text:selection,hasMedia:false,truncated:false,origin:'web'}:adapter.readPost(article);
    if(!post){card.error('bad-input','没有读到正文。');return;}currentPostId=post.id;selectedPost=post;
    card.phase(selection?'analysis':'context');send({type:'start',post,...(selection?{selection:true}:{snapshot:adapter.readPageSnapshot(document,post.url)})});
  };
  const attach=(article:HTMLElement)=>{
    const existing=entries.get(article);if(existing?.isConnected)return;if(existing)entries.delete(article);if(!article.isConnected)return;
    const post=adapter.readPost(article);if(!post)return;const text=adapter.textElement(article);if(!text)return;
    const host=node('meaning-check-entry');host.dataset.mcOwned='true';host.dataset.theme=darkTheme()?'dark':'light';
    const root=host.attachShadow({mode:'open'});const trigger=button(t(lang(),'check'),()=>start(article,trigger),'entry-button');trigger.prepend(icon());root.append(node('style',styles),trigger);
    host.addEventListener('click',e=>e.stopPropagation());text.after(host);entries.set(article,host);
  };
  let scanQueued=false;
  const scan=()=>{
    if(!allowed()){for(const host of entries.values())host.remove();entries.clear();selectionHost?.remove();selectionHost=undefined;close(false);return;}
    if(!selectionOnly)for(const article of document.querySelectorAll<HTMLElement>(selector))attach(article);
    for(const [article,host]of entries){if(!article.isConnected){host.remove();entries.delete(article);}else{host.dataset.theme=darkTheme()?'dark':'light';const b=host.shadowRoot?.querySelector('button');if(b?.lastChild?.nodeType===Node.TEXT_NODE)b.lastChild.textContent=t(lang(),'check');}}
    card?.position();
  };
  const schedule=()=>{if(scanQueued)return;scanQueued=true;queueMicrotask(()=>{scanQueued=false;scan();});};
  const reloadConfig=async()=>{try{config=await browser.runtime.sendMessage({type:'public-config'});scan();}catch{}};
  const settingsListener=(message:any,sender:Browser.runtime.MessageSender)=>{if(sender.id===browser.runtime.id&&!sender.tab&&message?.type==='settings-changed')void reloadConfig();};browser.runtime.onMessage.addListener(settingsListener);
  function updateSelection():void {
    if(!selectionOnly||!allowed())return;
    const selection=window.getSelection();const text=selection?.toString().trim()??'';
    const range=selection?.rangeCount?selection.getRangeAt(0):undefined;
    const anchor=range?(range.commonAncestorContainer instanceof Element?range.commonAncestorContainer:range.commonAncestorContainer.parentElement):undefined;
    if(!text||!range||!anchor||anchor.closest('input,textarea,[contenteditable],[role="textbox"],[data-mc-owned]')||[...anchor.querySelectorAll('input,textarea,[contenteditable],[role="textbox"]')].some(el=>range.intersectsNode(el))){selectionHost?.remove();selectionHost=undefined;return;}
    selectionText=text;selectionAnchor=anchor as HTMLElement;selectionHost?.remove();const host=node('meaning-check-selection');host.dataset.mcOwned='true';host.dataset.theme=darkTheme()?'dark':'light';
    const root=host.attachShadow({mode:'open'});const trigger=button(t(lang(),'check'),()=>{if(selectionAnchor)start(selectionAnchor,trigger,selectionText);},'entry-button');trigger.prepend(icon());root.append(node('style',styles),trigger);
    host.addEventListener('pointerdown',e=>e.preventDefault());host.addEventListener('pointerup',e=>e.stopPropagation());host.addEventListener('keyup',e=>e.stopPropagation());host.addEventListener('click',e=>e.stopPropagation());
    const rect=range.getBoundingClientRect();host.style.left=Math.max(12,Math.min(rect.left,innerWidth-200))+'px';host.style.top=Math.max(12,Math.min(rect.bottom+6,innerHeight-44))+'px';document.body.append(host);selectionHost=host;
  }
  if(selectionOnly){ctx.addEventListener(document,'pointerup',updateSelection);ctx.addEventListener(document,'keyup',updateSelection);ctx.addEventListener(document,'selectionchange',()=>{if(!card)updateSelection();});}
  ctx.addEventListener(document,'keydown',e=>{if(e.key==='Escape'){if(card){e.preventDefault();close();}selectionHost?.remove();selectionHost=undefined;}});
  ctx.addEventListener(document,'pointerdown',e=>{if(card&&!e.composedPath().includes(card.host)&&!e.composedPath().some(el=>el instanceof HTMLElement&&['MEANING-CHECK-ENTRY','MEANING-CHECK-SELECTION'].includes(el.tagName)))close(false);});
  ctx.addEventListener(window,'pagehide',()=>close(false));ctx.addEventListener(window,'resize',()=>card?.position());ctx.addEventListener(document,'scroll',()=>card?.position(),{capture:true,passive:true});
  const observer=new MutationObserver(records=>{
    if(records.every(r=>(r.target instanceof Element?r.target:r.target.parentElement)?.closest('[data-mc-owned]')))return;
    if(location.href!==lastUrl){lastUrl=location.href;close(false);selectionHost?.remove();selectionHost=undefined;}
    if(currentArticle&&(!currentArticle.isConnected||(!selectionOnly&&adapter.readPost(currentArticle)?.id!==currentPostId)))close(false);schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-theme']});
  for(const event of ['wxt:locationchange','popstate'] as const)ctx.addEventListener(window,event,()=>{lastUrl=location.href;close(false);selectionHost?.remove();selectionHost=undefined;scan();});
  ctx.addEventListener(window,'pagehide',()=>observer.disconnect());
  ctx.onInvalidated(()=>{close(false);observer.disconnect();browser.runtime.onMessage.removeListener(settingsListener);for(const host of entries.values())host.remove();entries.clear();selectionHost?.remove();window.__meaningCheckReader=false;});
  void reloadConfig();
}
