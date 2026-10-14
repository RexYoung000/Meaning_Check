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
interface Reading {
  key:string;article:HTMLElement;post:Post;selection:boolean;trigger:HTMLButtonElement;
  card:ResultCard;port?:Port;heartbeat?:ReturnType<typeof setInterval>;busy:boolean;bundle?:ContextBundle;
}
export function startReader(ctx:ContentScriptContext,selectionOnly=false):void {
  if(window.__meaningCheckReader)return;window.__meaningCheckReader=true;
  const adapter=location.hostname==='x.com'?x:reddit;
  const selector=location.hostname==='x.com'?x.ARTICLE_SELECTOR:reddit.ITEM_SELECTOR;
  const token=new URL(location.href).searchParams.get(COLLECTOR_PARAM);
  if(token&&!selectionOnly){
    const expanded=new Map<string,number>();
    const originals=new WeakMap<HTMLElement,number>();
    const listener=(message:any,sender:Browser.runtime.MessageSender,sendResponse:(value?:unknown)=>void)=>{
      if(sender.id!==browser.runtime.id||sender.tab||message?.type!=='collect-snapshot'||message.token!==token)return;
      const target=threadRef(message.url??'');if(!target||threadRef(location.href)?.id!==target.id)return;
      if(location.hostname==='x.com'){
        let restoring=false;
        for(const article of document.querySelectorAll(x.ARTICLE_SELECTOR)){
          const toggle=x.originalToggle(article);if(!toggle)continue;
          const attempted=originals.get(toggle);
          if(attempted===undefined){originals.set(toggle,Date.now());toggle.click();}
          restoring=true;
        }
        if(restoring)return;
      }
      const article=[...document.querySelectorAll(selector)].find(a=>adapter.readPost(a)?.id===target.id);
      const more=location.hostname==='x.com'&&article?x.showMoreElement(article):undefined;
      if(more&&!more.hasAttribute('href')){
        const attempted=expanded.get(target.id);
        if(attempted===undefined){expanded.set(target.id,Date.now());more.click();return;}
        if(Date.now()-attempted<750)return;
      }
      sendResponse(adapter.readPageSnapshot(document,target.url));return false;
    };
    browser.runtime.onMessage.addListener(listener);ctx.addEventListener(window,'pagehide',()=>browser.runtime.onMessage.removeListener(listener));ctx.onInvalidated(()=>browser.runtime.onMessage.removeListener(listener));return;
  }
  let config:PublicConfig|undefined,lastUrl=location.href;
  let selectionHost:HTMLElement|undefined,selectionText='',selectionAnchor:HTMLElement|undefined;
  const readings=new Map<string,Reading>(),entries=new Map<HTMLElement,HTMLElement>();
  const lang=()=>config?.uiLanguage??'en';
  const allowed=()=>!!config&&!!siteFor(location.href,config.preferences);
  const settings=()=>{void browser.runtime.sendMessage({type:'open-settings'});};
  const stopHeartbeat=(job:Reading)=>{clearInterval(job.heartbeat);job.heartbeat=undefined;};
  const close=(job:Reading,focus=true)=>{
    readings.delete(job.key);const active=job.port;job.port=undefined;stopHeartbeat(job);
    try{active?.postMessage({type:'cancel'});active?.disconnect();}catch{}
    job.busy=false;job.card.remove();
    if(focus&&job.trigger.isConnected)job.trigger.focus({preventScroll:true});
  };
  const closeAll=()=>{for(const job of readings.values())close(job,false);};
  const send=(job:Reading,prepare:()=>ClientCommand)=>{
    if(job.busy)return;
    job.card.phase('preparing');
    let command:ClientCommand;
    try{command=prepare();}catch{job.card.error('page-read','',job.bundle);return;}
    if(!job.port&&!connect(job))return;
    job.busy=true;stopHeartbeat(job);
    job.heartbeat=setInterval(()=>{try{job.port?.postMessage({type:'heartbeat'});}catch{stopHeartbeat(job);}},HEARTBEAT_MS);
    try{job.port!.postMessage(command);}catch{job.busy=false;stopHeartbeat(job);job.card.error('background-restarted','连接已断开。');}
  };
  function connect(job:Reading):boolean {
    try{job.port=browser.runtime.connect({name:PORT_PREFIX+crypto.randomUUID()});}catch{job.card.error('background-restarted','扩展连接不可用。');return false;}
    const connected=job.port;
    connected.onMessage.addListener((event:JobEvent)=>{
      if(job.port!==connected||readings.get(job.key)!==job)return;
      if(event.type==='queued')job.card.queued(event.position,event.queuedAt);
      else if(event.type==='phase')job.card.phase(event.phase,event.startedAt);
      else{
        job.busy=false;stopHeartbeat(job);
        if(event.type==='context'){job.bundle=event.bundle;job.card.context(event.bundle,event.reason);}
        if(event.type==='result'){job.bundle=event.bundle;job.card.result(event.bundle,event.response);}
        if(event.type==='error'){if(event.bundle)job.bundle=event.bundle;job.card.error(event.code,event.message,event.bundle);}
      }
    });
    connected.onDisconnect.addListener(()=>{if(job.port===connected){job.port=undefined;const wasBusy=job.busy;job.busy=false;stopHeartbeat(job);if(wasBusy)job.card.error('background-restarted','后台连接已断开。');}});return true;
  }
  const start=(article:HTMLElement,trigger:HTMLButtonElement,selection?:string)=>{
    if(!allowed())return;
    if(!selection&&location.hostname==='x.com'){const more=x.showMoreElement(article);if(more&&!more.hasAttribute('href'))more.click();}
    const post:Post|undefined=selection?{id:'selection',url:location.href,text:selection,hasMedia:false,truncated:false,origin:'web'}:adapter.readPost(article);
    if(!post)return;
    const key=selection?'selection:'+selection:post.url;
    const existing=readings.get(key);
    if(existing){existing.card.toggleCollapsed();return;}
    const mount=selection?article:entries.get(article)??article;
    const job={} as Reading;
    Object.assign(job,{key,article,post,selection:!!selection,trigger,busy:false});
    job.card=new ResultCard(mount,styles,{
      close:()=>close(job),retryContext:()=>send(job,()=>{
        const fresh=job.selection?job.post:adapter.readPost(job.article);if(fresh?.id===job.post.id)job.post=fresh;
        return {type:'start',post:job.post,...(job.selection?{selection:true}:{snapshot:adapter.readPageSnapshot(document,job.post.url)})};
      }),
      analyze:manual=>send(job,()=>{
        // Refresh only the already-selected sources; never override a manual edit.
        if(job.bundle&&!job.selection){
          const visible=[...document.querySelectorAll(selector)].map(el=>adapter.readPost(el)).filter((p):p is Post=>!!p);
          job.bundle={...job.bundle,posts:job.bundle.posts.map(p=>p.origin==='manual'?p:visible.find(latest=>latest.id===p.id&&!latest.sourceIssue)??p)};
          const fresh=visible.find(p=>p.id===job.post.id);if(fresh)job.post=fresh;
        }
        return {type:'analyze',bundle:job.bundle,manual};
      }),settings,
    },lang());
    readings.set(key,job);
    send(job,()=>({type:'start',post,...(selection?{selection:true}:{snapshot:adapter.readPageSnapshot(document,post.url)})}));
    if(selection){selectionHost?.remove();selectionHost=undefined;}
  };
  const attach=(article:HTMLElement)=>{
    const existing=entries.get(article);if(existing?.isConnected)return;if(existing)entries.delete(article);if(!article.isConnected)return;
    if(!adapter.readPost(article))return;const text=location.hostname==='x.com'?x.entryAnchor(article):adapter.textElement(article);if(!text)return;
    const host=node('meaning-check-entry');host.dataset.mcOwned='true';host.dataset.theme=darkTheme()?'dark':'light';
    const root=host.attachShadow({mode:'open'}),row=node('div',undefined,'entry-row');
    const trigger=button(t(lang(),'check'),()=>start(article,trigger),'entry-button');trigger.prepend(icon());
    const shortcut=button(t(lang(),'settings'),settings,'entry-settings');
    row.append(trigger,shortcut);root.append(node('style',styles),row);
    host.addEventListener('click',e=>e.stopPropagation());host.addEventListener('keydown',e=>{if(e.key!=='Escape')e.stopPropagation();});host.addEventListener('keyup',e=>e.stopPropagation());text.after(host);entries.set(article,host);
  };
  let scanQueued=false;
  const scan=()=>{
    if(!allowed()){for(const host of entries.values())host.remove();entries.clear();selectionHost?.remove();selectionHost=undefined;closeAll();return;}
    if(!selectionOnly)for(const article of document.querySelectorAll<HTMLElement>(selector))attach(article);
    if(selectionHost){
      selectionHost.dataset.theme=darkTheme()?'dark':'light';
      const trigger=selectionHost.shadowRoot?.querySelector('button');
      if(trigger?.lastChild?.nodeType===Node.TEXT_NODE)trigger.lastChild.textContent=t(lang(),'check');
    }
    for(const [article,host]of entries){
      if(!article.isConnected){host.remove();entries.delete(article);}
      else{
        host.dataset.theme=darkTheme()?'dark':'light';const buttons=host.shadowRoot?.querySelectorAll('button');
        const trigger=buttons?.[0];if(trigger?.lastChild?.nodeType===Node.TEXT_NODE)trigger.lastChild.textContent=t(lang(),'check');
        if(buttons?.[1])buttons[1].textContent=t(lang(),'settings');
      }
    }
    for(const job of readings.values()){
      if(!job.article.isConnected||!job.card.host.isConnected||(!job.selection&&adapter.readPost(job.article)?.id!==job.post.id))close(job,false);
      else job.card.position();
    }
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
  if(selectionOnly){ctx.addEventListener(document,'pointerup',updateSelection);ctx.addEventListener(document,'keyup',updateSelection);ctx.addEventListener(document,'selectionchange',updateSelection);}
  ctx.addEventListener(document,'keydown',e=>{
    if(e.key!=='Escape')return;
    const job=[...readings.values()].find(job=>e.composedPath().includes(job.card.host)||e.composedPath().includes(job.trigger));
    if(job){e.preventDefault();e.stopPropagation();close(job);}selectionHost?.remove();selectionHost=undefined;
  },{capture:true});
  const navigate=()=>{lastUrl=location.href;closeAll();selectionHost?.remove();selectionHost=undefined;scan();};
  ctx.addEventListener(window,'pagehide',closeAll);
  const observer=new MutationObserver(records=>{
    if(records.every(r=>(r.target instanceof Element?r.target:r.target.parentElement)?.closest('[data-mc-owned]')))return;
    if(location.href!==lastUrl){navigate();return;}schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','data-theme']});
  for(const event of ['wxt:locationchange','popstate'] as const)ctx.addEventListener(window,event,navigate);
  ctx.addEventListener(window,'pagehide',()=>observer.disconnect());
  ctx.onInvalidated(()=>{closeAll();observer.disconnect();browser.runtime.onMessage.removeListener(settingsListener);for(const host of entries.values())host.remove();entries.clear();selectionHost?.remove();window.__meaningCheckReader=false;});
  void reloadConfig();
}
