import {browser} from 'wxt/browser';
import './style.css';
import {button,node} from '../../ui/elements';
import {brand,input,label,languageSwitch,link,openGuide,select} from '../../ui/page';
import {rpc} from '../../ui/rpc';
import {errorText,t,type CopyKey} from '../../shared/i18n';
import {CATALOG_DATE,modelName,permissionOrigin,preset,PROVIDERS,providerName} from '../../shared/models';
import type {ApiFormat,ModelProfile,Preferences,ProviderId,PublicConfig,PublicProfile,SiteConfig} from '../../shared/types';
const app=document.querySelector<HTMLElement>('#app')!;
let config:PublicConfig,section=location.hash.slice(1)||'start',editing:PublicProfile|undefined,siteEditing:SiteConfig|undefined,showForm=false,showSiteForm=false,busy=false;
let accountModels:string[]=[];
let formDraft:{name:string;provider:string;model:string;key:string;baseUrl:string;format:string}|undefined;
function captureDraft():void {const f=app.querySelector<HTMLFormElement>('#settings-form');if(!f)return;const value=(id:string)=>(f.querySelector<HTMLInputElement>('#'+id)?.value??'');formDraft={name:value('profile-name'),provider:value('provider'),model:value('model-id'),key:value('api-key'),baseUrl:value('base-url'),format:value('api-format')};}
const status=node('p',undefined,'status');status.id='status';status.setAttribute('role','status');
const text=(key:CopyKey,...args:(string|number)[])=>t(config.uiLanguage,key,...args);
function notify(error:unknown):void {const e=error as {code?:string;message?:string};status.textContent=errorText(config.uiLanguage,e.code??'unavailable',e.message);status.classList.add('error');}
async function task(fn:()=>Promise<void>):Promise<void> {if(busy)return;busy=true;app.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);status.textContent='';status.classList.remove('error');try{await fn();}catch(e){notify(e);}finally{busy=false;app.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=b.dataset.dirtySaved==='true');}}
async function reload():Promise<void> {config=await rpc<PublicConfig>({type:'config'});}
function render():void {
  document.documentElement.lang=config.uiLanguage==='zh'?'zh-CN':'en';document.title='Meaning Check · '+text('settings');
  const header=node('header',undefined,'page-header'),toolbar=node('div',undefined,'toolbar');toolbar.append(brand(),languageSwitch(config,c=>{captureDraft();status.textContent='';config=c;render();}));header.append(toolbar);
  const shell=node('div',undefined,'shell'),nav=node('nav',undefined,'sidebar');nav.setAttribute('aria-label',text('settings'));
  for(const key of ['start','models','languages','sites'] as const){const a=link(text(key),'#'+key);a.className=section===key?'current':'';if(section===key)a.setAttribute('aria-current','page');nav.append(a);}
  nav.append(node('p',text('byok')));const main=node('main'),title=node('div',undefined,'page-title');title.append(node('h1',text(section as CopyKey)),node('p',text('intro'),'muted'),status);main.append(title);
  if(section==='models')renderModels(main);else if(section==='languages')renderLanguages(main);else if(section==='sites')renderSites(main);else renderStart(main);
  shell.append(nav,main);app.replaceChildren(header,shell);
}
function renderStart(main:HTMLElement):void {
  const box=node('section',undefined,'box stack');
  const enabled=input('','checkbox');enabled.checked=config.preferences.enabled;enabled.addEventListener('change',()=>{void task(async()=>{config=await rpc<PublicConfig>({type:'preferences',patch:{enabled:enabled.checked}});render();});});
  const toggle=label(text(config.preferences.enabled?'enabled':'paused'),enabled);toggle.className='check';box.append(toggle);
  const active=config.profiles.find(p=>p.id===config.activeProfileId);box.append(node('p',active?text('activeModel')+' · '+modelName(active.provider,active.model):text('noConnection')));
  const row=node('div',undefined,'actions');row.append(button(text('setup'),()=>{location.hash='models';},'button primary'),button(text('guide'),openGuide,'button'));box.append(node('p',text('connectedHelp'),'muted'),row);main.append(box);
  const how=node('section',undefined,'box section-space');how.append(node('h2',text('step3')),node('p',text('useHelp')),node('p',text('pinHelp'),'muted'),node('p',text('installHelp'),'muted'));main.append(how);
}
function renderModels(main:HTMLElement):void {
  const list=node('div',undefined,'stack');
  if(!config.profiles.length)list.append(node('p',text('noConnection'),'empty'));
  for(const p of config.profiles){const row=node('section',undefined,'box profile-row'),desc=node('div',undefined,'description'),actions=node('div',undefined,'actions');
    desc.append(node('h3',p.name),node('p',modelName(p.provider,p.model)),node('p',p.model,'muted mono'),node('span',text(p.testedAt?'tested':'configured'),'badge'));
    if(p.id===config.activeProfileId)desc.append(node('span',text('active'),'badge active'));
    else actions.append(button(text('use'),()=>{void task(async()=>{await rpc({type:'set-active',id:p.id});await reload();render();});},'button'));
    actions.append(button(text('edit'),()=>{formDraft=undefined;editing=p;accountModels=[];showForm=true;render();},'button quiet'),button(text('remove'),()=>{void task(async()=>{await rpc({type:'delete-profile',id:p.id});if(editing?.id===p.id){editing=undefined;showForm=false;}await reload();render();});},'button quiet'));row.append(desc,actions);list.append(row);
  }
  main.append(list,button(text('addConnection'),()=>{formDraft=undefined;editing=undefined;accountModels=[];showForm=true;render();},'button section-space'));
  if(showForm||!config.profiles.length)renderProfileForm(main);
  main.append(node('p',text('catalog',CATALOG_DATE),'hint section-space'));
}
function renderProfileForm(main:HTMLElement):void {
  const form=node('form',undefined,'box section-space');form.id='settings-form';const title=node('div',undefined,'form-title');title.append(node('h2',text(editing?'edit':'addConnection')),button(text('cancel'),()=>{formDraft=undefined;showForm=false;editing=undefined;render();},'button quiet'));form.append(title);
  const provider=select(PROVIDERS.map(p=>[p.id,providerName(p.id,config.uiLanguage)]),formDraft?.provider??editing?.provider??'deepseek');provider.id='provider';
  const name=input(formDraft?.name??editing?.name??'DeepSeek','text','profile-name');name.maxLength=80;name.required=true;
  const model=select([],formDraft?.model??editing?.model??preset(provider.value).models[0]?.id??'');model.id='model';const modelId=input(formDraft?.model??editing?.model??preset(provider.value).models[0]?.id??'','text','model-id');modelId.maxLength=150;modelId.required=true;modelId.setAttribute('aria-label',text('modelId'));
  const key=input(formDraft?.key??'','password','api-key');key.maxLength=4096;key.autocomplete='off';key.spellcheck=false;key.placeholder=editing?text('keepKey'):'';key.required=!editing;
  const base=input(formDraft?.baseUrl??editing?.baseUrl??preset(provider.value).baseUrl,'url','base-url');base.required=true;
  const format=select([['chat','Chat Completions'],['responses','Responses'],['messages','Messages']],formDraft?.format??editing?.format??preset(provider.value).format);format.id='api-format';
  const populateModels=(id= modelId.value)=>{const presets=preset(provider.value).models;const options:[string,string][]=presets.map(m=>[m.id,m.name+(m.note?' · '+m.note:'')]);for(const id of accountModels)if(!options.some(o=>o[0]===id))options.push([id,id]);options.push(['__manual',text('manualModel')]);model.replaceChildren(...options.map(([id,name])=>{const o=node('option',name);o.value=id;return o;}));model.value=options.some(o=>o[0]===id)?id:'__manual';modelId.hidden=model.value!=='__manual';};populateModels();
  const modelField=label(text('model'),model);const idHint=node('span',modelId.value,'hint mono');modelField.append(modelId,idHint);modelId.addEventListener('input',()=>idHint.textContent=modelId.value);
  model.addEventListener('change',()=>{modelId.hidden=model.value!=='__manual';if(model.value!=='__manual')modelId.value=model.value;idHint.textContent=modelId.value;});
  provider.addEventListener('change',()=>{const p=preset(provider.value);if(base.value!==p.baseUrl)key.value='';base.value=p.baseUrl;format.value=p.format;modelId.value=p.models[0]?.id??'';name.value=providerName(p.id,config.uiLanguage);accountModels=[];populateModels();idHint.textContent=modelId.value;regionBox.hidden=!['qwen','minimax'].includes(p.id);workspaceLabel.hidden=p.id!=='qwen';setRegionOptions();advanced.open=p.id==='custom';docs.href=p.docs||'#';docs.hidden=!p.docs;});
  const grid=node('div',undefined,'field-grid');grid.append(label(text('name'),name),label(text('provider'),provider));form.append(grid,modelField,label(text('apiKey'),key,text('keyHelp')));
  base.addEventListener('input',()=>{key.value='';});
  const advanced=node('details');advanced.open=provider.value==='custom';advanced.append(node('summary',text('advanced')));
  const regionBox=node('div');regionBox.hidden=!['qwen','minimax'].includes(provider.value);
  const region=select([],'');
  const setRegionOptions=()=>{const opts:[string,string][]=provider.value==='minimax'?[['cn-beijing',config.uiLanguage==='zh'?'中国':'China'],['intl',config.uiLanguage==='zh'?'海外':'International']]:[['cn-beijing',config.uiLanguage==='zh'?'北京':'Beijing'],['ap-southeast-1','Singapore'],['us-east-1','US'],['ap-northeast-1','Tokyo']];region.replaceChildren(...opts.map(([v,n])=>{const o=node('option',n);o.value=v;return o;}));region.value=provider.value==='minimax'?(base.value.includes('minimax.io')?'intl':'cn-beijing'):base.value.includes('dashscope-intl')||base.value.includes('ap-southeast-1')?'ap-southeast-1':base.value.includes('dashscope-us')||base.value.includes('us-east-1')?'us-east-1':base.value.includes('ap-northeast-1')?'ap-northeast-1':'cn-beijing';};setRegionOptions();
  const workspace=input();workspace.placeholder='ws-...';workspace.maxLength=100;
  const changeRegion=()=>{key.value='';if(provider.value==='minimax')base.value=region.value==='intl'?'https://api.minimax.io/v1':'https://api.minimax.cn/v1';else if(workspace.value.trim())base.value='https://'+workspace.value.trim()+'.'+(region.value==='intl'?'ap-southeast-1':region.value)+'.maas.aliyuncs.com/compatible-mode/v1';else base.value=region.value==='ap-southeast-1'?'https://dashscope-intl.aliyuncs.com/compatible-mode/v1':['us-east-1','ap-northeast-1'].includes(region.value)?'':'https://dashscope.aliyuncs.com/compatible-mode/v1';};
  region.addEventListener('change',changeRegion);workspace.addEventListener('input',changeRegion);const workspaceLabel=label(text('workspace'),workspace);workspaceLabel.hidden=provider.value!=='qwen';regionBox.append(label(text('region'),region),workspaceLabel,node('p',text('regionHelp'),'muted'));
  advanced.append(regionBox,label(text('baseUrl'),base,text('addressHelp')),label(text('format'),format));const docs=link(text('officialDocs'),preset(provider.value).docs||'#');docs.target='_blank';docs.rel='noopener noreferrer';docs.hidden=!preset(provider.value).docs;advanced.append(docs);form.append(advanced);
  const actions=node('div',undefined,'actions'),save=node('button',text('save'),'button primary');save.type='submit';actions.append(save);
  if(editing){actions.append(button(text('test'),()=>{void task(async()=>{status.textContent=text('testing');const response=await rpc<{elapsedMs:number;usage?:{totalTokens:number}}>({type:'test-connection',id:editing!.id});await reload();status.textContent=text('tested')+' · '+text('elapsed',(response.elapsedMs/1000).toFixed(1))+(response.usage?' · '+text('usage',response.usage.totalTokens):'');render();});},'button'),button(text('refresh'),()=>{void task(async()=>{status.textContent=text('refreshing');if(!preset(editing!.provider).refresh){status.textContent=text('refreshUnsupported');return;}accountModels=await rpc<string[]>({type:'list-models',id:editing!.id});populateModels();status.textContent=text('refreshed',accountModels.length);});},'button'));}
  form.append(actions,node('p',text('testFee'),'hint'));
  if(editing){for(const b of actions.querySelectorAll<HTMLButtonElement>('button'))if(b!==save)b.dataset.requiresSaved='true';
    const dirty=()=>{const changed=!!key.value||name.value!==editing!.name||provider.value!==editing!.provider||modelId.value!==editing!.model||base.value!==editing!.baseUrl||format.value!==editing!.format;for(const b of actions.querySelectorAll<HTMLButtonElement>('[data-requires-saved]')){b.disabled=changed;b.dataset.dirtySaved=String(changed);}};form.addEventListener('input',dirty);form.addEventListener('change',dirty);if(formDraft)dirty();}
  form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;
    let origin:string;try{origin=permissionOrigin(base.value);}catch{notify({code:'base-url'});return;}
    // Permission request runs directly from the user's save gesture.
    const granted=browser.permissions.request({origins:[origin]});
    void task(async()=>{if(!await granted){status.textContent=text('permissionDenied');return;}
      const res=await rpc<{id:string}>({type:'save-profile',profile:{id:editing?.id??'',name:name.value,provider:provider.value as ProviderId,format:format.value as ApiFormat,baseUrl:base.value,model:modelId.value,key:key.value}});key.value='';formDraft=undefined;await reload();editing=config.profiles.find(p=>p.id===res.id);showForm=true;status.textContent=text('saved');render();
    });
  });main.append(form);
}
function renderLanguages(main:HTMLElement):void {
  const form=node('form',undefined,'box');const ui=select([['auto',text('auto')],['zh','中文'],['en','English']],config.preferences.uiLanguage);
  const choices:[string,string][]=[['auto',text('auto')],['zh-CN','简体中文'],['zh-TW','繁體中文'],['en','English'],['ja','日本語'],['ko','한국어'],['fr','Français'],['de','Deutsch'],['es','Español'],['pt','Português'],['it','Italiano'],['ar','العربية'],['hi','हिन्दी'],['ru','Русский'],['custom',text('customLanguage')]];
  const output=select(choices,choices.some(c=>c[0]===config.preferences.outputLanguage)?config.preferences.outputLanguage:'custom'),custom=input(config.preferences.outputLanguage==='auto'?'':config.preferences.outputLanguage);custom.placeholder='ja / en-GB / zh-TW';const customLabel=label(text('localeId'),custom);customLabel.hidden=output.value!=='custom';output.addEventListener('change',()=>customLabel.hidden=output.value!=='custom');
  form.append(label(text('uiLanguage'),ui),label(text('outputLanguage'),output),customLabel,node('p',text('localeHelp',browser.i18n.getUILanguage()),'muted'));
  const save=node('button',text('save'),'button primary');save.type='submit';form.append(save);form.addEventListener('submit',e=>{e.preventDefault();void task(async()=>{config=await rpc<PublicConfig>({type:'preferences',patch:{uiLanguage:ui.value,outputLanguage:output.value==='custom'?custom.value.trim():output.value}});status.textContent=text('saved');render();});});main.append(form);
}
function renderSites(main:HTMLElement):void {
  main.append(node('p',text('siteHelp'),'muted'));const list=node('div',undefined,'stack');
  for(const site of config.preferences.sites){const row=node('section',undefined,'box site-row'),desc=node('div',undefined,'description'),actions=node('div',undefined,'actions');desc.append(node('h3',site.name),node('p',site.origin,'muted mono'),node('p',site.paths.join(' · '),'muted mono'),node('span',text(site.adapter==='selection'?'selectionAdapter':'threadAdapter'),'badge'));
    const toggle=input('','checkbox');toggle.checked=site.enabled;toggle.setAttribute('aria-label',site.name+' · '+text('on'));toggle.addEventListener('change',()=>{const granted=toggle.checked?browser.permissions.request({origins:[site.origin+'/*']}):Promise.resolve(true);void task(async()=>{if(!await granted){toggle.checked=false;status.textContent=text('permissionDenied');return;}config=await rpc<PublicConfig>({type:'preferences',patch:{sites:config.preferences.sites.map(s=>s.id===site.id?{...s,enabled:toggle.checked}:s)}});render();});});const toggleLabel=label(text(site.enabled?'on':'off'),toggle);toggleLabel.className='check';actions.append(toggleLabel,button(text('edit'),()=>{siteEditing=site;showSiteForm=true;render();},'button quiet'),button(text('remove'),()=>{void task(async()=>{config=await rpc<PublicConfig>({type:'preferences',patch:{sites:config.preferences.sites.filter(s=>s.id!==site.id)}});render();});},'button quiet'));row.append(desc,actions);list.append(row);
  }main.append(list,button(text('addSite'),()=>{siteEditing=undefined;showSiteForm=true;render();},'button section-space'));
  if(!showSiteForm)return;const form=node('form',undefined,'box section-space'),name=input(siteEditing?.name??''),origin=input(siteEditing?.origin??'','url'),paths=node('textarea');name.required=true;name.maxLength=80;origin.required=true;origin.placeholder='https://example.com';paths.required=true;paths.value=siteEditing?.paths.join('\n')??'/*';
  form.append(label(text('name'),name),label(text('origin'),origin),label(text('paths'),paths,text('pathHelp')));const actions=node('div',undefined,'actions'),save=node('button',text('save'),'button primary');save.type='submit';actions.append(save,button(text('cancel'),()=>{showSiteForm=false;render();},'button'));form.append(actions);
  form.addEventListener('submit',e=>{e.preventDefault();let permission:string;try{const u=new URL(origin.value.trim());if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw new Error();permission=u.origin+'/*';}catch{notify({code:'site-format'});return;}const granted=browser.permissions.request({origins:[permission]});void task(async()=>{if(!await granted){status.textContent=text('permissionDenied');return;}const value={id:siteEditing?.id??crypto.randomUUID(),name:name.value,origin:origin.value.trim().replace(/\/$/,''),paths:paths.value.split('\n').map(s=>s.trim()).filter(Boolean),enabled:siteEditing?.enabled??true,adapter:'selection'};config=await rpc<PublicConfig>({type:'preferences',patch:{sites:[...config.preferences.sites.filter(s=>s.id!==siteEditing?.id),value]}});showSiteForm=false;status.textContent=text('saved');render();});});main.append(form);
}
window.addEventListener('hashchange',()=>{section=location.hash.slice(1);if(!['start','models','languages','sites'].includes(section))section='start';status.textContent='';render();});
void reload().then(render).catch(()=>{app.textContent='Meaning Check: reload the extension and reopen Settings. / 请重新加载扩展并打开设置。';});
