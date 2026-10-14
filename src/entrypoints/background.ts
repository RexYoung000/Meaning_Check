import {browser,type Browser} from 'wxt/browser';
import {PORT_PREFIX,ANALYSIS_TIMEOUT_MS} from '../shared/constants';
import type {ClientCommand,ContextBundle,JobEvent,PageSnapshot,Post} from '../shared/types';
import {safeError,UserError} from '../shared/errors';
import {activeConnection,connection,deleteProfile,initializeSettings,markTested,publicConfig,saveProfile,setActive,updatePreferences} from '../shared/settings';
import {siteFor} from '../shared/sites';
import {Collector,cleanupOrphans} from '../x/collector';
import {applyManual,assertInputSize,bundleOf,resolveContext,selectionBundle,validateBundle,validatePost,validateSnapshot} from '../analysis/context';
import {analyze,listModels} from '../analysis/provider';
import {errorText} from '../shared/i18n';
import {AnalysisQueue} from '../analysis/queue';
import {openSettings} from '../shared/navigation';

type Port=Browser.runtime.Port;
export default defineBackground(()=>{
  const jobs=new Map<Port,{cancel():void}>();
  const queue=new AnalysisQueue(2);
  const ready=initializeSettings().then(cleanupOrphans).then(syncScripts);ready.catch(()=>{});
  async function syncScripts():Promise<void> {
    const config=await publicConfig();const all=await browser.scripting.getRegisteredContentScripts();
    const existing=all.filter(s=>s.id.startsWith('mc-site-'));
    const candidates=config.preferences.enabled?config.preferences.sites.filter(s=>s.enabled&&s.adapter==='selection'):[];
    const sites:typeof candidates=[];
    for(const site of candidates)if(await browser.permissions.contains({origins:[site.origin+'/*']}))sites.push(site);
    const retained=new Set(existing.filter(s=>sites.some(site=>s.id==='mc-site-'+site.id&&s.matches?.length===1&&s.matches[0]===site.origin+'/*'&&s.js?.length===1&&s.js[0]==='content-scripts/selection.js'&&s.runAt==='document_idle')).map(s=>s.id));
    const removed=existing.filter(s=>!retained.has(s.id));
    if(removed.length)await browser.scripting.unregisterContentScripts({ids:removed.map(s=>s.id)});
    for(const site of sites)if(!retained.has('mc-site-'+site.id)) {
      await browser.scripting.registerContentScripts([{id:'mc-site-'+site.id,matches:[site.origin+'/*'],js:['content-scripts/selection.js'],runAt:'document_idle',persistAcrossSessions:true}]);
      const tabs=await browser.tabs.query({url:site.origin+'/*'});
      for(const tab of tabs)if(tab.id!==undefined)try {await browser.scripting.executeScript({target:{tabId:tab.id},files:['/content-scripts/selection.js']});}catch{}
    }
  }
  async function changed():Promise<void> {
    const config=await publicConfig();
    for(const [port,job] of jobs)if(!siteFor(port.sender?.url,config.preferences)){job.cancel();jobs.delete(port);}
    await syncScripts();
    const tabs=await browser.tabs.query({});
    for(const tab of tabs)if(tab.id!==undefined)void browser.tabs.sendMessage(tab.id,{type:'settings-changed'}).catch(()=>{});
  }
  browser.runtime.onInstalled.addListener(()=>{
    void ready.then(async()=>{
      const version='0.2';const {onboardedVersion}=await browser.storage.local.get('onboardedVersion');
      if(onboardedVersion!==version){await browser.storage.local.set({onboardedVersion:version});await browser.tabs.create({url:browser.runtime.getURL('/welcome.html')});}
    }).catch(()=>{});
  });
  const trusted=(sender?:Browser.runtime.MessageSender)=>sender?.id===browser.runtime.id&&!!sender.url?.startsWith(browser.runtime.getURL('/'));
  browser.runtime.onMessage.addListener((message,sender,sendResponse)=>{
    if(sender.id!==browser.runtime.id)return;
    if(message?.type==='public-config'||message?.type==='config-status'){
      void ready.then(publicConfig).then(config=>sendResponse(message.type==='config-status'?{configured:config.configured}:{...config})).catch(()=>sendResponse({configured:false}));return true;
    }
    if(message?.type==='open-settings'||message?.type==='open-guide'){
      void ready.then(async()=>{
        const config=await publicConfig();if(!trusted(sender)&&!siteFor(sender.url,config.preferences))return {ok:false};
        if(message.type==='open-settings')await openSettings();else await browser.tabs.create({url:browser.runtime.getURL('/welcome.html')});return {ok:true};
      }).then(sendResponse).catch(()=>sendResponse({ok:false}));return true;
    }
  });
  async function settingsCommand(raw:any,signal:AbortSignal):Promise<unknown> {
    await ready;
    switch(raw.type){
      case 'config':return publicConfig();
      case 'save-profile':return {id:await saveProfile(raw.profile)};
      case 'set-active':await setActive(raw.id);return publicConfig();
      case 'delete-profile':await deleteProfile(raw.id);return publicConfig();
      case 'preferences':await updatePreferences(raw.patch);await changed();return publicConfig();
      case 'test-connection':{
        const p=await connection(raw.id);const config=await publicConfig();const example:Post={id:'manual-current',url:'',text:'Thanks, that helped!',hasMedia:false,truncated:false,origin:'manual'};
        const b=bundleOf(example);b.mode='selection';b.missing=[];
        const response=await analyze(b,p,signal,fetch,config.outputLanguage);await markTested(p.id,p);return response;
      }
      case 'list-models':return listModels(await connection(raw.id),signal);
      default:throw new UserError('bad-input','无效的设置操作。');
    }
  }
  browser.runtime.onConnect.addListener(port=>{
    if(port.name.startsWith('mc-settings:')){
      if(!trusted(port.sender)){port.disconnect();return;}
      const controller=new AbortController();let running=false;
      port.onDisconnect.addListener(()=>controller.abort());
      port.onMessage.addListener(raw=>{
        if(raw?.type==='heartbeat'||running)return;running=true;
        void settingsCommand(raw,controller.signal).then(data=>{if(!controller.signal.aborted)port.postMessage({ok:true,data});}).catch(error=>{if(!controller.signal.aborted)port.postMessage({ok:false,...safeError(error)});});
      });return;
    }
    const tabId=port.sender?.tab?.id;
    if(!port.name.startsWith(PORT_PREFIX)||port.sender?.id!==browser.runtime.id||tabId===undefined){port.disconnect();return;}
    let disconnected=false,busy=false,current:Post|undefined,initial:PageSnapshot|undefined,bundle:ContextBundle|undefined,controller:AbortController|undefined,startedAt=0;
    const collector=new Collector(crypto.randomUUID());
    const emit=(event:JobEvent)=>{if(!disconnected)try{port.postMessage(event);}catch{}};
    const stop=()=>{controller?.abort();void collector.close().catch(()=>{});};
    jobs.set(port,{cancel:()=>{disconnected=true;stop();port.disconnect();}});
    port.onDisconnect.addListener(()=>{disconnected=true;stop();jobs.delete(port);});
    const runAnalysis=async(manual?:Parameters<typeof applyManual>[1]):Promise<JobEvent|undefined>=>{
      if(!bundle||!controller)return;bundle=applyManual(bundle,manual);const config=await publicConfig();if(!siteFor(port.sender?.url,config.preferences))throw new UserError('disabled','当前网站已关闭。');const p=await activeConnection();assertInputSize(bundle);
      emit({type:'phase',phase:'analysis',startedAt});const response=await analyze(bundle,p,controller.signal,fetch,config.outputLanguage);
      if(!controller.signal.aborted)return {type:'result',bundle,response};
    };
    const runContext=async():Promise<JobEvent|undefined>=>{
      if(!current||!controller)return;await activeConnection();if(!initial||!['none','unlinked'].includes(initial.parentState))emit({type:'phase',phase:'context',startedAt});
      const resolved=await resolveContext(current,initial,(url,signal)=>collector.read(url,signal),controller.signal);await collector.close();bundle=resolved.bundle;
      if(controller.signal.aborted)return;
      if(bundle.missing.length||bundle.posts.some(p=>p.truncated))return {type:'context',bundle,reason:resolved.reason};return runAnalysis();
    };
    port.onMessage.addListener((raw:ClientCommand)=>{
      if(raw?.type==='heartbeat')return;if(raw?.type==='cancel'){stop();return;}if(busy||disconnected)return;
      busy=true;controller=new AbortController();const operation=controller;let timedOut=false;
      let timer:ReturnType<typeof setTimeout>|undefined,release:(()=>void)|undefined;
      const queuedAt=Date.now();
      const task=async():Promise<JobEvent|undefined>=>{
        await ready;if(disconnected||operation.signal.aborted)return;
        const config=await publicConfig();const site=siteFor(port.sender?.url,config.preferences);if(!site)throw new UserError('disabled','当前网站已关闭。');
        if(raw?.type==='start'&&raw.selection){
          if(site.adapter!=='selection')throw new UserError('bad-input','选区来源不对应。');bundle=selectionBundle(raw.post,port.sender!.url!);await activeConnection();return {type:'context',bundle};
        }
        if(!['start','retry-context','analyze'].includes(raw?.type))throw new UserError('bad-input','无效操作。');
        release=await queue.acquire(operation.signal,position=>emit({type:'queued',position,queuedAt}));
        if(disconnected||operation.signal.aborted)return;
        startedAt=Date.now();emit({type:'phase',phase:'preparing',startedAt});
        timer=setTimeout(()=>{timedOut=true;operation.abort();void collector.close().catch(()=>{});},ANALYSIS_TIMEOUT_MS);
        if(raw?.type==='start'){
          current=validatePost(raw.post,true);if(new URL(current.url).origin!==new URL(site.origin).origin)throw new UserError('bad-input','帖子来源不对应。');
          initial=validateSnapshot(raw.snapshot,current.id,true);if(initial?.parent&&new URL(initial.parent.url).origin!==new URL(current.url).origin)initial=undefined;
          if(current.truncated||initial?.parentState==='unknown')initial=undefined;return runContext();
        }else if(raw?.type==='retry-context'){initial=undefined;return runContext();}
        else if(raw?.type==='analyze'){
          if(raw.bundle){bundle=validateBundle(raw.bundle);for(const post of bundle.posts)if(post.origin!=='manual'&&new URL(post.url).origin!==new URL(site.origin).origin)throw new UserError('bad-input','材料来源不对应。');}
          return runAnalysis(raw.manual);
        }
      };
      void (async()=>{
        let terminal:JobEvent|undefined;
        try{terminal=await task();}
        catch(error){if(!operation.signal.aborted){const lang=(await publicConfig()).uiLanguage;const safe=safeError(error);terminal={type:'error',code:safe.code,message:errorText(lang,safe.code,safe.message),...(bundle?{bundle}:{})};}}
        finally{clearTimeout(timer);await collector.close().catch(()=>{});release?.();busy=false;}
        if(timedOut)terminal={type:'error',code:'analysis-timeout',message:'分析超过等待时间。',...(bundle?{bundle}:{})};
        if(terminal&&(!operation.signal.aborted||timedOut))emit(terminal);
      })();
    });
  });
});
