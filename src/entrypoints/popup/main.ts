import {browser} from 'wxt/browser';
import '../../ui/page.css';
import {button,node} from '../../ui/elements';
import {brand,input,label,languageSwitch,openGuide} from '../../ui/page';
import {rpc} from '../../ui/rpc';
import {t,errorText} from '../../shared/i18n';
import {modelName} from '../../shared/models';
import {siteFor} from '../../shared/sites';
import type {PublicConfig} from '../../shared/types';
const app=document.querySelector<HTMLElement>('#app')!;let config:PublicConfig,currentUrl='';
async function render():Promise<void>{
  document.documentElement.lang=config.uiLanguage==='zh'?'zh-CN':'en';const text=(key:Parameters<typeof t>[1])=>t(config.uiLanguage,key);
  const top=node('div',undefined,'toolbar');top.append(brand(),languageSwitch(config,c=>{config=c;void render();}));
  const enabled=input('','checkbox');enabled.checked=config.preferences.enabled;const toggle=label(text(config.preferences.enabled?'enabled':'paused'),enabled);toggle.className='check';const status=node('p',undefined,'status');status.setAttribute('role','status');
  async function update(patch:Record<string,unknown>):Promise<void>{try{config=await rpc<PublicConfig>({type:'preferences',patch});await render();}catch(e){status.textContent=errorText(config.uiLanguage,(e as any).code);}}
  enabled.addEventListener('change',()=>{void update({enabled:enabled.checked});});
  const site=config.preferences.sites.find(s=>{try{return new URL(currentUrl).origin===s.origin;}catch{return false;}});
  const siteBox=node('section',undefined,'box');siteBox.append(node('h2',site?.name??text('unsupported')));
  if(site){const on=input('','checkbox');on.checked=site.enabled;const field=label(text('enableSite'),on);field.className='check';on.addEventListener('change',()=>{const granted=on.checked?browser.permissions.request({origins:[site.origin+'/*']}):Promise.resolve(true);void granted.then(ok=>{if(ok)void update({sites:config.preferences.sites.map(s=>s.id===site.id?{...s,enabled:on.checked}:s)});else{on.checked=false;status.textContent=text('permissionDenied');}});});siteBox.append(field);if(site.enabled&&!siteFor(currentUrl,{...config.preferences,enabled:true}))siteBox.append(node('p',config.uiLanguage==='zh'?'当前路径不在配置中。':'This path is outside the configured paths.','muted'));}
  const model=config.profiles.find(p=>p.id===config.activeProfileId),modelBox=node('section',undefined,'box');modelBox.append(node('small',text('activeModel')),node('p',model?modelName(model.provider,model.model):text('noConnection')));if(model)modelBox.append(node('span',text(model.testedAt?'tested':'configured'),'badge'));
  const actions=node('div',undefined,'actions');actions.append(button(text('settings'),()=>{void browser.runtime.openOptionsPage();},'button primary'),button(text('guide'),openGuide,'button'));
  app.replaceChildren(top,toggle,siteBox,modelBox,status,actions);
}
void Promise.all([rpc<PublicConfig>({type:'config'}),browser.tabs.query({active:true,currentWindow:true})]).then(([c,tabs])=>{config=c;currentUrl=tabs[0]?.url??'';void render();}).catch(()=>{app.textContent='Reload extension / 请重新加载扩展';});
