import {describe,it,expect} from 'vitest';
import {PROVIDERS,modelName,normalizeBase,permissionOrigin} from '../src/shared/models';
import {DEFAULT_SITES,pathMatches,siteFor,validateSite} from '../src/shared/sites';
import {errorText,t,roleLabel} from '../src/shared/i18n';
import {systemPrompt} from '../src/analysis/prompt';
const preferences={enabled:true,uiLanguage:'auto' as const,outputLanguage:'auto',sites:DEFAULT_SITES};
describe('厂商、路径与本地化边界',()=>{
  it('九家官方预置及用户确认的两类型号保留',()=>{expect(PROVIDERS.filter(p=>p.id!=='custom')).toHaveLength(9);expect(modelName('deepseek','deepseek-flash')).toBe('DeepSeek V4.1 Flash');expect(modelName('xai','grok-4.6')).toBe('Grok 4.6');expect(PROVIDERS.every(p=>p.id==='custom'||p.models.length>0)).toBe(true);});
  it('基础地址不允许凭据或远端 HTTP；允许用户本机服务',()=>{expect(normalizeBase('https://api.example.com/v1/chat/completions/')).toBe('https://api.example.com/v1');expect(permissionOrigin('http://127.0.0.1:8080/v1')).toBe('http://127.0.0.1:8080/*');for(const v of ['http://api.example.com','https://name:secret@example.com','https://example.com/v1?token=a','https://example.com/#a'])expect(()=>normalizeBase(v)).toThrow();});
  it('通配符路径转义正则符号，多个路径任一匹配',()=>{expect(pathMatches('/r/*/comments/*','/r/test/comments/abc')).toBe(true);expect(pathMatches('/foo.bar/*','/fooXbar/b')).toBe(false);const site=validateSite({id:'test',name:'Test',origin:'https://example.com',paths:['/one/*','/two/*'],enabled:true,adapter:'selection'});expect(siteFor('https://example.com/two/ok',{...preferences,sites:[site]})?.id).toBe('test');expect(siteFor('https://example.com/three/',{...preferences,sites:[site]})).toBeUndefined();expect(siteFor('https://x.com/abc',{...preferences,enabled:false})).toBeUndefined();});
  it('私信和编辑路径即使包含通配也不启用',()=>{expect(siteFor('https://x.com/messages/123',preferences)).toBeUndefined();expect(siteFor('https://www.reddit.com/message/inbox',preferences)).toBeUndefined();});
  it('网站来源必须明确，不接受带路径、查询、凭据的来源',()=>{for(const origin of ['http://example.com','https://example.com/path','https://example.com/?a=1','https://u:p@example.com'])expect(()=>validateSite({...DEFAULT_SITES[0]!,origin})).toThrow();});
  it('英文界面错误不泄露中文 / 原始厂商响应，输出单独使用日语',()=>{expect(t('en','check')).toBe('Check meaning');expect(errorText('en','provider-auth','sensitive')).not.toContain('sensitive');expect(systemPrompt('ja')).toContain('locale ja');expect(systemPrompt('zh-TW')).toContain('繁體中文');expect(roleLabel('en','root',true)).toBe('Background (optional)');});
});
