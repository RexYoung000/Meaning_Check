export type ContextRole = 'current' | 'parent' | 'root';
export type MissingRole = 'parent' | 'root';
export type ProviderId = 'deepseek' | 'xai' | 'openai' | 'anthropic' | 'google' | 'glm' | 'qwen' | 'kimi' | 'minimax' | 'custom';
export type ApiFormat = 'chat' | 'responses' | 'messages';
export type UiLanguage = 'zh' | 'en';
export interface ModelProfile { id:string; name:string; provider:ProviderId; format:ApiFormat; baseUrl:string; model:string; key:string; testedAt?:number }
export type PublicProfile = Omit<ModelProfile, 'key'> & { configured:boolean };
export interface SiteConfig { id:string; name:string; origin:string; paths:string[]; enabled:boolean; adapter:'x'|'reddit'|'selection' }
export interface Preferences { enabled:boolean; uiLanguage:'auto'|UiLanguage; outputLanguage:string; sites:SiteConfig[] }
export interface PublicConfig { preferences:Preferences; profiles:PublicProfile[]; activeProfileId:string; configured:boolean; uiLanguage:UiLanguage; outputLanguage:string }
export interface Post { id:string; url:string; text:string; hasMedia:boolean; truncated:boolean; origin:'x'|'reddit'|'web'|'manual' }
export interface ContextBundle { roles:{current:string;parent?:string;root?:string};posts:Post[];missing:MissingRole[];warnings:string[];mode?:'thread'|'selection' }
export interface PageSnapshot { current:Post;parent?:Post;parentState:'known'|'none'|'unknown' }
export interface Evidence { sourceId:string;quote:string;explanation:string }
export interface InterpretationResult { status:'ready'|'needs_context';summary:string;tone:string;function:string;evidence:Evidence[];uncertainty?:string }
export interface Usage { promptTokens:number;completionTokens:number;totalTokens:number }
export interface AnalysisResponse { result:InterpretationResult;elapsedMs:number;usage?:Usage;model?:string;language?:string }
export type ClientCommand = {type:'start';post:Post;snapshot?:PageSnapshot;selection?:boolean} | {type:'retry-context'} | {type:'analyze';bundle?:ContextBundle;manual?:Partial<Record<ContextRole,string>>} | {type:'heartbeat'} | {type:'cancel'};
export type JobEvent = {type:'phase';phase:'context'|'analysis'} | {type:'context';bundle:ContextBundle;reason?:string} | {type:'result';bundle:ContextBundle;response:AnalysisResponse} | {type:'error';code:string;message:string;bundle?:ContextBundle};
