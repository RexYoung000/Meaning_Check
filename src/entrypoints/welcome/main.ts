import {browser} from 'wxt/browser';
import '../../ui/page.css';
import {button,node} from '../../ui/elements';
import {brand,languageSwitch} from '../../ui/page';
import {rpc} from '../../ui/rpc';
import {t,type CopyKey} from '../../shared/i18n';
import type {PublicConfig} from '../../shared/types';
import {openSettings} from '../../shared/navigation';
const app=document.querySelector<HTMLElement>('#app')!;let config:PublicConfig;
function render():void{
  document.documentElement.lang=config.uiLanguage==='zh'?'zh-CN':'en';const text=(key:CopyKey)=>t(config.uiLanguage,key);const shell=node('main',undefined,'guide-shell'),top=node('header',undefined,'toolbar');top.append(brand(),languageSwitch(config,c=>{config=c;render();}));shell.append(top);
  const title=node('div',undefined,'page-title');title.append(node('h1',text('welcome')),node('p',text('byok'),'muted'));shell.append(title);
  const steps=node('div',undefined,'stack');for(const [key,help,buttonKey,hash] of [['step1','connectedHelp','setup','models'],['step2','localeHelp','configureLanguages','languages']] as const){const box=node('section',undefined,'box');box.append(node('h2',text(key)),node('p',help==='localeHelp'?t(config.uiLanguage,help,config.outputLanguage):text(help),'muted'),button(text(buttonKey),()=>{void openSettings(hash);},'button'));steps.append(box);}
  const usage=node('section',undefined,'box');usage.append(node('h2',text('step3')),node('p',text('useHelp')),node('p',text('inlineHelp'),'muted'),node('p',text('settingsRoute'),'muted'),node('p',text('pinHelp'),'muted'));steps.append(usage);
  const demo=node('section',undefined,'box demo');demo.append(node('span',text('demo'),'badge'),node('blockquote',text('demoSource')),node('h2',text('demoSummary')),node('p',text('demoTone'),'muted'),node('p',text('demoEvidence')));steps.append(demo);shell.append(steps,node('p',text('installHelp'),'muted guide-foot'),button(text('ready'),()=>{void openSettings();},'button primary'));app.replaceChildren(shell);
}
void rpc<PublicConfig>({type:'config'}).then(c=>{config=c;render();}).catch(()=>{app.textContent='Reload extension / 请重新加载扩展';});
