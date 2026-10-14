import {browser,type Browser} from 'wxt/browser';
import {PORT_PREFIX,ANALYSIS_TIMEOUT_MS} from '../shared/constants';
import type {ClientCommand,ContextBundle,JobEvent,PageSnapshot,Post} from '../shared/types';
import {safeError,UserError} from '../shared/errors';
import {activeConnection,connection,deleteProfile,initializeSettings,markTested,publicConfig,saveProfile,setActive,updatePreferences} from '../shared/settings';
import {siteFor} from '../shared/sites';
import {Collector,cleanupOrphans} from '../x/collector';
import {applyManual,bundleOf,resolveContext,selectionBundle,validateBundle,validatePost,validateSnapshot} from '../analysis/context';
import {analyze,listModels} from '../analysis/provider';
import {errorText} from '../shared/i18n';

type Port=Browser.runtime.Port;
export default defineBackground(()=>{
  const activeByTab=new Map<number,{port:Port;cancel():void}>();
  const ready=initializeSettings().then(cleanupOrphans).then(syncScripts);ready.catch(()=>{});
  async function syncScripts():Promise<void> {
    const config=await publicConfig();const all=await browser.scripting.getRegisteredContentScripts();
    const existing=all.filter(s=>s.id.startsWith('mc-site-'));
    if(existing.length)await browser.scripting.unregisterContentScripts({ids:existing.map(s=>s.id)});
    const sites=config.preferences.enabled?config.preferences.sites.filter(s=>s.enabled&&s.adapter==='selection'):[];
    for(const site of sites)if(await browser.permissions.contains({origins:[site.origin+'/*']})) {
      await browser.scripting.registerContentScripts([{id:'mc-site-'+site.id,matches:[site.origin+'/*'],js:['content-scripts/selection.js'],runAt:'document_idle',persistAcrossSessions:true}]);
      const tabs=await browser.tabs.query({url:site.origin+'/*'});
      for(const tab of tabs)if(tab.id!==undefined)try {await browser.scripting.executeScript({target:{tabId:tab.id},files:['/content-scripts/selection.js']});}catch{}
    }
  }
  async function changed():Promise<void> {
    const config=await publicConfig();
    for(const [id,job] of activeByTab)if(!siteFor(job.port.sender?.url,config.preferences)){job.cancel();activeByTab.delete(id);}
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
        if(message.type==='open-settings')await browser.runtime.openOptionsPage();else await browser.tabs.create({url:browser.runtime.getURL('/welcome.html')});return {ok:true};
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
    const old=activeByTab.get(tabId);old?.cancel();
    let disconnected=false,busy=false,current:Post|undefined,initial:PageSnapshot|undefined,bundle:ContextBundle|undefined,controller:AbortController|undefined;
    const collector=new Collector(crypto.randomUUID());
    const emit=(event:JobEvent)=>{if(!disconnected)try{port.postMessage(event);}catch{}};
    const stop=()=>{controller?.abort();void collector.close().catch(()=>{});};
    activeByTab.set(tabId,{port,cancel:()=>{disconnected=true;stop();port.disconnect();}});
    port.onDisconnect.addListener(()=>{disconnected=true;stop();if(activeByTab.get(tabId)?.port===port)activeByTab.delete(tabId);});
    const runAnalysis=async(manual?:Parameters<typeof applyManual>[1])=>{
      if(!bundle||!controller)return;bundle=applyManual(bundle,manual);const config=await publicConfig();if(!siteFor(port.sender?.url,config.preferences))throw new UserError('disabled','当前网站已关闭。');const p=await activeConnection();
      emit({type:'phase',phase:'analysis'});const response=await analyze(bundle,p,controller.signal,fetch,config.outputLanguage);
      if(!controller.signal.aborted)emit({type:'result',bundle,response});
    };
    const runContext=async()=>{
      if(!current||!controller)return;await activeConnection();emit({type:'phase',phase:'context'});
      const resolved=await resolveContext(current,initial,(url,signal)=>collector.read(url,signal),controller.signal);await collector.close();bundle=resolved.bundle;
      if(controller.signal.aborted)return;
      if(resolved.original)throw new UserError('original-post','这条是原帖。请对它下面的回复使用「帮我确认意思」。');
      if(bundle.missing.length||bundle.posts.some(p=>p.truncated))emit({type:'context',bundle,reason:resolved.reason});else await runAnalysis();
    };
    port.onMessage.addListener((raw:ClientCommand)=>{
      if(raw?.type==='heartbeat')return;if(raw?.type==='cancel'){stop();return;}if(busy||disconnected)return;
      busy=true;controller=new AbortController();const operation=controller;let timedOut=false;
      const timer=setTimeout(()=>{timedOut=true;operation.abort();void collector.close();emit({type:'error',code:'analysis-timeout',message:'分析超过等待时间。',...(bundle?{bundle}:{})});},ANALYSIS_TIMEOUT_MS);
      const task=async()=>{
        await ready;if(disconnected||operation.signal.aborted)return;
        const config=await publicConfig();const site=siteFor(port.sender?.url,config.preferences);if(!site)throw new UserError('disabled','当前网站已关闭。');
        if(raw?.type==='start'){
          if(raw.selection){if(site.adapter!=='selection')throw new UserError('bad-input','选区来源不对应。');bundle=selectionBundle(raw.post,port.sender!.url!);await activeConnection();emit({type:'context',bundle});return;}
          current=validatePost(raw.post);if(new URL(current.url).origin!==new URL(site.origin).origin)throw new UserError('bad-input','帖子来源不对应。');
          initial=validateSnapshot(raw.snapshot,current.id);if(initial?.parent&&new URL(initial.parent.url).origin!==new URL(current.url).origin)initial=undefined;
          if(current.truncated||initial?.parentState==='unknown')initial=undefined;await runContext();
        }else if(raw?.type==='retry-context'){initial=undefined;await runContext();}
        else if(raw?.type==='analyze'){
          if(raw.bundle){bundle=validateBundle(raw.bundle);for(const post of bundle.posts)if(post.origin!=='manual'&&new URL(post.url).origin!==new URL(site.origin).origin)throw new UserError('bad-input','材料来源不对应。');}
          await runAnalysis(raw.manual);
        }
      };
      void task().catch(async error=>{if(!operation.signal.aborted&&!timedOut){const lang=(await publicConfig()).uiLanguage;const safe=safeError(error);emit({type:'error',code:safe.code,message:errorText(lang,safe.code,safe.message),...(bundle?{bundle}:{})});}}).finally(()=>{clearTimeout(timer);busy=false;void collector.close().catch(()=>{});});
    });
  });
});
