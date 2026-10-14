import { browser } from 'wxt/browser';
import { UserError } from './errors';
import { normalizeBase, preset, PROVIDERS } from './models';
import { DEFAULT_SITES, validateSite } from './sites';
import type { ModelProfile, Preferences, PublicConfig, SiteConfig } from './types';
let restriction:Promise<void>|undefined;
let initialization:Promise<void>|undefined;
let writes=Promise.resolve();
export function restrictStorage():Promise<void> { restriction ??= browser.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});return restriction; }
export function initializeSettings():Promise<void> {
  initialization ??= (async()=>{
    await restrictStorage();
    const old=await browser.storage.local.get(['deepseekApiKey','profiles','preferences','activeProfileId']);
    const prefs:Preferences=(old.preferences as Preferences|undefined)??{enabled:true,uiLanguage:'auto',outputLanguage:'auto',sites:structuredClone(DEFAULT_SITES)};
    const profiles:ModelProfile[]=Array.isArray(old.profiles)?old.profiles:[];
    if (!profiles.length && typeof old.deepseekApiKey==='string' && old.deepseekApiKey.trim()) {
      profiles.push({id:'legacy-deepseek',name:'DeepSeek',provider:'deepseek',format:'chat',baseUrl:preset('deepseek').baseUrl,model:'deepseek-flash',key:old.deepseekApiKey});
    }
    await browser.storage.local.set({preferences:prefs,profiles,activeProfileId:profiles.some(p=>p.id===old.activeProfileId)?old.activeProfileId:profiles[0]?.id??''});
    if (old.deepseekApiKey!==undefined) await browser.storage.local.remove('deepseekApiKey');
  })();return initialization;
}
function uiLocale():string { return browser.i18n.getUILanguage()||'en'; }
export async function publicConfig():Promise<PublicConfig> {
  await initializeSettings();const data=await browser.storage.local.get(['profiles','activeProfileId','preferences']);
  const profiles=(data.profiles as ModelProfile[]).map(({key,...p})=>({...p,configured:!!key}));
  const preferences=data.preferences as Preferences;
  const active=profiles.find(p=>p.id===data.activeProfileId);
  return {preferences,profiles,activeProfileId:data.activeProfileId as string,configured:!!active?.configured,uiLanguage:preferences.uiLanguage==='auto'?(uiLocale().toLowerCase().startsWith('zh')?'zh':'en'):preferences.uiLanguage,outputLanguage:preferences.outputLanguage==='auto'?uiLocale():preferences.outputLanguage};
}
export async function activeConnection():Promise<ModelProfile> {
  await initializeSettings();const data=await browser.storage.local.get(['profiles','activeProfileId']);
  const p=(data.profiles as ModelProfile[]).find(p=>p.id===data.activeProfileId);
  if (!p?.key) throw new UserError('missing-key','请先在扩展设置中保存模型连接和密钥。');return p;
}
export async function connection(id:string):Promise<ModelProfile> {
  await initializeSettings();const {profiles}=await browser.storage.local.get('profiles');const p=(profiles as ModelProfile[]).find(p=>p.id===id);
  if (!p?.key) throw new UserError('missing-key','请先保存模型连接和密钥。');return p;
}
function mutate(task:()=>Promise<void>):Promise<void> { const result=writes.then(task);writes=result.catch(()=>{});return result; }
export async function saveProfile(raw:Omit<ModelProfile,'key'> & {key?:string}):Promise<string> {
  await initializeSettings();let savedId='';
  await mutate(async()=>{
    const {profiles,activeProfileId}=await browser.storage.local.get(['profiles','activeProfileId']);const list=profiles as ModelProfile[];
    const old=list.find(p=>p.id===raw.id);let baseUrl:string;
    try { baseUrl=normalizeBase(raw.baseUrl); } catch { throw new UserError('base-url','接口地址必须是 HTTPS，或本机 HTTP 地址；不能包含凭据、查询或片段。'); }
    if (!PROVIDERS.some(p=>p.id===raw.provider)||!['chat','responses','messages'].includes(raw.format)||!raw.name?.trim()||raw.name.length>80||!raw.model?.trim()||raw.model.length>150||/[\s\x00-\x1f]/.test(raw.model)) throw new UserError('profile-format','请检查连接名称、厂商、协议和模型 ID。');
    if (old && old.baseUrl!==baseUrl && !raw.key?.trim()) throw new UserError('new-key-required','更换接口地址后，请重新输入对应密钥。');
    const key=raw.key?.trim()||old?.key||'';
    if (!key||key.length>4096||/\s/.test(key)) throw new UserError('key-format','请填写完整密钥，不要包含空格或换行。');
    if (!await browser.permissions.contains({origins:[new URL(baseUrl).origin+'/*']})) throw new UserError('permission','请先允许访问这个 API 地址。');
    savedId=old?.id||crypto.randomUUID();
    const changed=!old||old.baseUrl!==baseUrl||old.model!==raw.model||old.key!==key||old.format!==raw.format||old.provider!==raw.provider;
    const p:ModelProfile={id:savedId,name:raw.name.trim(),provider:raw.provider,format:raw.format,baseUrl,model:raw.model.trim(),key,...(!changed&&old?.testedAt?{testedAt:old.testedAt}:{})};
    await browser.storage.local.set({profiles:[...list.filter(x=>x.id!==savedId),p],activeProfileId:activeProfileId||savedId});
  });return savedId;
}
export async function setActive(id:string):Promise<void> { await connection(id);await mutate(()=>browser.storage.local.set({activeProfileId:id})); }
export async function deleteProfile(id:string):Promise<void> {
  await initializeSettings();await mutate(async()=>{const d=await browser.storage.local.get(['profiles','activeProfileId']);const list=(d.profiles as ModelProfile[]).filter(p=>p.id!==id);await browser.storage.local.set({profiles:list,activeProfileId:d.activeProfileId===id?(list[0]?.id??''):d.activeProfileId});});
}
export async function markTested(id:string, snapshot:ModelProfile):Promise<void> {
  await mutate(async()=>{const {profiles}=await browser.storage.local.get('profiles');const list=profiles as ModelProfile[];const p=list.find(p=>p.id===id);if(p&&p.key===snapshot.key&&p.baseUrl===snapshot.baseUrl&&p.model===snapshot.model&&p.format===snapshot.format&&p.provider===snapshot.provider) {p.testedAt=Date.now();await browser.storage.local.set({profiles:list});}});
}
export async function updatePreferences(patch:Partial<Preferences>):Promise<void> {
  await initializeSettings();await mutate(async()=>{
    const {preferences}=await browser.storage.local.get('preferences');const next={...(preferences as Preferences),...patch} as Preferences;
    if(typeof next.enabled!=='boolean'||!['auto','zh','en'].includes(next.uiLanguage)) throw new UserError('settings-format','设置格式不完整。');
    if(next.outputLanguage!=='auto')try { next.outputLanguage=Intl.getCanonicalLocales(next.outputLanguage)[0]!;if(!next.outputLanguage)throw new Error(); }catch { throw new UserError('language-format','请填写有效语言代码，如 zh-CN、en 或 ja。'); }
    if(!Array.isArray(next.sites)||next.sites.length>50)throw new UserError('site-format','网站数量超过上限。');
    try { next.sites=next.sites.map(validateSite); }catch { throw new UserError('site-format','网站需要完整 HTTPS 来源及至少一个以 / 开头的路径。'); }
    if(new Set(next.sites.map(s=>s.origin)).size!==next.sites.length)throw new UserError('site-duplicate','同一来源只保留一个网站，将多个路径放在同一项中。');
    for(const s of next.sites.filter(s=>s.enabled))if(!await browser.permissions.contains({origins:[s.origin+'/*']}))throw new UserError('permission','请先允许访问启用的网站。');
    await browser.storage.local.set({preferences:next});
  });
}
export async function configured():Promise<boolean> {return (await publicConfig()).configured;}
export async function loadKey():Promise<string> {return (await activeConnection()).key;}
export async function saveKey(key:string):Promise<void> {const p=preset('deepseek');const c=await publicConfig();const old=c.profiles.find(p=>p.provider==='deepseek');const id=await saveProfile({id:old?.id??'',name:'DeepSeek',provider:'deepseek',format:'chat',baseUrl:p.baseUrl,model:'deepseek-flash',key});await setActive(id);}
export async function deleteKey():Promise<void> {const c=await publicConfig();if(c.activeProfileId)await deleteProfile(c.activeProfileId);}
