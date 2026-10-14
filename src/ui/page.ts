import {browser} from 'wxt/browser';
import type {PublicConfig,UiLanguage} from '../shared/types';
import {t} from '../shared/i18n';
import {button,node} from './elements';
import {icon} from './icon';
import {rpc} from './rpc';
export function languageSwitch(config:PublicConfig,onChange:(config:PublicConfig)=>void):HTMLElement {
  const group=node('div',undefined,'languages');group.setAttribute('aria-label',t(config.uiLanguage,'uiLanguage'));
  for(const [lang,label] of [['zh','中文'],['en','English']] as [UiLanguage,string][]){const b=button(label,()=>{group.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);void rpc<PublicConfig>({type:'preferences',patch:{uiLanguage:lang}}).then(onChange).catch(()=>{group.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false);});},'button');b.setAttribute('aria-pressed',String(config.uiLanguage===lang));group.append(b);}return group;
}
export function brand():HTMLElement {const el=node('div',undefined,'brand');el.append(icon(36),node('strong','Meaning Check'));return el;}
export function label(text:string,input:HTMLElement,hint?:string):HTMLLabelElement {
  const el=node('label'),caption=node('span',text,'label-text');caption.id=(input.id||crypto.randomUUID())+'-label';input.setAttribute('aria-labelledby',caption.id);el.append(caption,input);
  if(hint){const help=node('span',hint,'hint');help.id=caption.id+'-help';input.setAttribute('aria-describedby',help.id);el.append(help);}return el;
}
export function select(options:[string,string][],value:string):HTMLSelectElement {const el=node('select');for(const [v,text] of options){const o=node('option',text);o.value=v;el.append(o);}el.value=value;return el;}
export function input(value='',type='text',id?:string):HTMLInputElement {const el=node('input');el.type=type;el.value=value;if(id)el.id=id;return el;}
export function link(text:string,url:string):HTMLAnchorElement {const a=node('a',text);a.href=url;return a;}
export function openGuide():void {void browser.tabs.create({url:browser.runtime.getURL('/welcome.html')});}
