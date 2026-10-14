import type { ApiFormat, ProviderId, UiLanguage } from './types';
export interface ModelPreset { id: string; name: string; note?: string }
export interface ProviderPreset { id: ProviderId; name: string; baseUrl: string; format: ApiFormat; models: ModelPreset[]; refresh: boolean; docs: string }
const m = (id: string, name: string, note?: string): ModelPreset => ({ id, name, ...(note ? { note } : {}) });
export const CATALOG_DATE = '2026-10-14';
export const PROVIDERS: ProviderPreset[] = [
  { id:'deepseek', name:'DeepSeek', baseUrl:'https://api.deepseek.com', format:'chat', refresh:true, docs:'https://api-docs.deepseek.com', models:[m('deepseek-flash','DeepSeek V4.1 Flash'),m('deepseek-v4-pro','DeepSeek V4 Pro')] },
  { id:'xai', name:'xAI · Grok', baseUrl:'https://api.x.ai/v1', format:'chat', refresh:true, docs:'https://docs.x.ai/developers/models', models:[m('grok-4.7','Grok 4.7'),m('grok-4.6','Grok 4.6')] },
  { id:'openai', name:'OpenAI · GPT', baseUrl:'https://api.openai.com/v1', format:'chat', refresh:true, docs:'https://developers.openai.com/api/docs/models/all', models:[m('gpt-6.1-sol','GPT 6.1 Sol'),m('gpt-6-luna','GPT 6 Luna'),m('gpt-6-astra','GPT 6 Astra')] },
  { id:'anthropic', name:'Anthropic · Claude', baseUrl:'https://api.anthropic.com/v1', format:'messages', refresh:true, docs:'https://platform.claude.com/docs/en/models/overview', models:[m('claude-sonnet-5-5','Claude Sonnet 5.5'),m('claude-haiku-5-5','Claude Haiku 5.5'),m('claude-opus-5-5','Claude Opus 5.5'),m('claude-fable-5-1','Claude Fable 5.1')] },
  { id:'google', name:'Google · Gemini', baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai', format:'chat', refresh:true, docs:'https://ai.google.dev/gemini-api/docs/openai', models:[m('gemini-3.8-flash','Gemini 3.8 Flash'),m('gemini-4-argon','Gemini 4 Argon'),m('gemini-3.5-flash-lite','Gemini 3.5 Flash Lite'),m('gemini-3.1-pro-preview','Gemini 3.1 Pro Preview','preview')] },
  { id:'glm', name:'智谱 · GLM', baseUrl:'https://open.bigmodel.cn/api/paas/v4', format:'chat', refresh:false, docs:'https://docs.bigmodel.cn', models:[m('glm-5.3-flash','GLM 5.3 Flash'),m('glm-5.3','GLM 5.3'),m('glm-5.3-flashx','GLM 5.3 FlashX')] },
  { id:'qwen', name:'通义千问 · Qwen', baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1', format:'chat', refresh:false, docs:'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope', models:[m('qwen3.8-flash','Qwen 3.8 Flash'),m('qwen3.7-plus','Qwen 3.7 Plus'),m('qwen3.8-max','Qwen 3.8 Max')] },
  { id:'kimi', name:'月之暗面 · Kimi', baseUrl:'https://api.moonshot.cn/v1', format:'chat', refresh:true, docs:'https://platform.kimi.com/docs/models', models:[m('kimi-k3','Kimi K3'),m('kimi-k2.6','Kimi K2.6'),m('kimi-k2.7-code','Kimi K2.7 Code'),m('kimi-k2.7-code-highspeed','Kimi K2.7 Code Highspeed')] },
  { id:'minimax', name:'MiniMax', baseUrl:'https://api.minimax.cn/v1', format:'chat', refresh:false, docs:'https://platform.minimax.io/docs/guides/text-generation', models:[m('MiniMax-M3','MiniMax M3'),m('MiniMax-M2.7','MiniMax M2.7'),m('MiniMax-M2.7-highspeed','MiniMax M2.7 Highspeed'),m('MiniMax-M3.1-Flash-Preview','MiniMax M3.1 Flash Preview','M Plan · preview')] },
  { id:'custom', name:'Custom API', baseUrl:'', format:'chat', refresh:true, docs:'', models:[] },
];
export function preset(id: string): ProviderPreset { return PROVIDERS.find(p => p.id === id) ?? PROVIDERS[0]!; }
export function modelName(provider: string, id: string): string { return preset(provider).models.find(m => m.id === id)?.name ?? id; }
export function normalizeBase(value: string): string {
  const url = new URL(value.trim());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash) throw new Error('base-url');
  return url.href.replace(/\/+$/, '').replace(/\/(chat\/completions|responses|messages)$/, '');
}
export function permissionOrigin(value: string): string { return new URL(normalizeBase(value)).origin + '/*'; }

export function providerName(id:string,language:UiLanguage):string {
  if(id==='custom')return language==='zh'?'自定义 API':'Custom API';
  const english:Record<string,string>={glm:'Zhipu · GLM',qwen:'Alibaba · Qwen',kimi:'Moonshot · Kimi'};
  return language==='en'?(english[id]??preset(id).name):preset(id).name;
}
