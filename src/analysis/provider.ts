import type { AnalysisResponse, ContextBundle, ModelProfile, Usage } from '../shared/types';
import { MODEL, ANALYSIS_TIMEOUT_MS, HEADERS_TIMEOUT_MS } from '../shared/constants';
import { UserError, composeSignals, throwIfAborted } from '../shared/errors';
import { preset, normalizeBase, modelName } from '../shared/models';
import { assertInputSize } from './context';
import { systemPrompt, userPrompt, RESULT_SCHEMA } from './prompt';
import { validateResult } from './validate';

export function requestFor(p:ModelProfile,bundle:ContextBundle,language:string):{url:string;headers:Record<string,string>;payload:Record<string,unknown>} {
  const base=normalizeBase(p.baseUrl), system=systemPrompt(language), user=userPrompt(bundle);
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(p.format==='messages') {
    headers['x-api-key']=p.key;headers['anthropic-version']='2023-06-01';
    return {url:base+'/messages',headers,payload:{model:p.model,stream:true,max_tokens:4096,system,messages:[{role:'user',content:user}],...(p.provider==='anthropic'?{output_config:{format:{type:'json_schema',schema:RESULT_SCHEMA}}}:{})}};
  }
  headers.Authorization='Bearer '+p.key;
  if(p.format==='responses')return {url:base+'/responses',headers,payload:{model:p.model,stream:true,store:false,max_output_tokens:4096,instructions:system,input:user,text:{format:{type:'json_object'}},...(p.provider==='openai'?{reasoning:{effort:'low'}}:{})}};
  const payload:Record<string,unknown>={model:p.model,stream:true,messages:[{role:'system',content:system},{role:'user',content:user}],max_tokens:4096,...(p.provider==='minimax'?{}:{response_format:{type:'json_object'}})};
  if(p.provider==='deepseek'){payload.thinking={type:'enabled'};payload.reasoning_effort='low';}
  if(p.provider==='openai') {delete payload.max_tokens;payload.max_completion_tokens=4096;if(/^gpt-[56]/.test(p.model))payload.reasoning_effort='low';payload.stream_options={include_usage:true};}
  return {url:base+'/chat/completions',headers,payload};
}
function httpError(status:number):UserError {return new UserError(status===401?'provider-auth':status===402?'provider-balance':status===429?'provider-limit':'provider-http',status===401?'密钥未被接受，请到设置页检查。':status===402?'模型账户余额不足。':status===429?'模型服务暂时限流。':'模型服务拒绝或未完成请求，请检查模型权限与接口配置。');}
function numeric(v:unknown):v is number{return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
export async function analyze(bundle:ContextBundle,connection:ModelProfile|string,signal:AbortSignal,fetcher:typeof fetch=fetch,language='zh-CN'):Promise<AnalysisResponse> {
  assertInputSize(bundle);
  const p:ModelProfile=typeof connection==='string'?{id:'legacy',name:'DeepSeek',provider:'deepseek',format:'chat',baseUrl:preset('deepseek').baseUrl,model:MODEL,key:connection}:connection;
  const started=Date.now(),controller=new AbortController(),linked=composeSignals([signal,controller.signal]),combined=linked.signal;
  const totalTimer=setTimeout(()=>controller.abort(),ANALYSIS_TIMEOUT_MS),headerTimer=setTimeout(()=>controller.abort(),HEADERS_TIMEOUT_MS);
  try {
    throwIfAborted(combined);const req=requestFor(p,bundle,language);
    const response=await fetcher(req.url,{method:'POST',headers:req.headers,signal:combined,body:JSON.stringify(req.payload)});
    clearTimeout(headerTimer);if(!response.ok)throw httpError(response.status);
    if(!response.body||!response.headers.get('content-type')?.includes('text/event-stream'))throw new UserError('provider-format','模型服务没有返回预期数据流。');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',content='',done=false,finish='',usage:Usage|undefined,inputTokens=0;
    const processEvent=(event:string)=>{
      const data=event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n').trim();if(!data)return;
      if(data==='[DONE]'){if(p.format==='chat')done=true;return;}
      let chunk:any;try {chunk=JSON.parse(data);}catch {throw new UserError('provider-format','模型数据流不完整。');}
      if(chunk.error||chunk.type==='error'||chunk.type==='response.failed'||chunk.type==='response.incomplete')throw new UserError('provider-format','模型数据流中断。');
      if(p.format==='chat'){
        const choice=chunk.choices?.[0];if(typeof choice?.delta?.content==='string')content+=choice.delta.content;
        if(choice?.delta?.tool_calls||choice?.delta?.function_call)throw new UserError('provider-format','不支持工具调用结果。');
        if(choice?.finish_reason)finish=choice.finish_reason;
        const u=chunk.usage;if(u&&[u.prompt_tokens,u.completion_tokens,u.total_tokens].every(numeric))usage={promptTokens:u.prompt_tokens,completionTokens:u.completion_tokens,totalTokens:u.total_tokens};
      }else if(p.format==='messages'){
        if(chunk.type==='content_block_start'&&['tool_use','server_tool_use'].includes(chunk.content_block?.type))throw new UserError('provider-format','不支持工具调用结果。');
        if(chunk.type==='content_block_delta'&&chunk.delta?.type==='text_delta'&&typeof chunk.delta.text==='string')content+=chunk.delta.text;
        if(chunk.type==='message_start'&&numeric(chunk.message?.usage?.input_tokens))inputTokens=chunk.message.usage.input_tokens;
        if(chunk.type==='message_delta'){finish=chunk.delta?.stop_reason??finish;const out=chunk.usage?.output_tokens;if(numeric(out))usage={promptTokens:inputTokens,completionTokens:out,totalTokens:inputTokens+out};}
        if(chunk.type==='message_stop')done=true;
      }else{
        if(chunk.type==='response.output_text.delta'&&typeof chunk.delta==='string')content+=chunk.delta;
        if(chunk.type==='response.output_item.added'&&chunk.item?.type!=='message'&&chunk.item?.type!=='reasoning')throw new UserError('provider-format','不支持工具调用结果。');
        if(chunk.type==='response.completed'){
          finish=chunk.response?.status??'';done=true;
          if(chunk.response?.output?.some((i:any)=>!['message','reasoning'].includes(i.type)))throw new UserError('provider-format','不支持工具调用结果。');
          const u=chunk.response?.usage;if(u&&[u.input_tokens,u.output_tokens,u.total_tokens].every(numeric))usage={promptTokens:u.input_tokens,completionTokens:u.output_tokens,totalTokens:u.total_tokens};
        }
      }
      if(content.length>30_000)throw new UserError('provider-format','模型输出过长。');
    };
    try {
      while(!done){throwIfAborted(combined);const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});if(buffer.length>200_000)throw new UserError('provider-format','模型数据格式异常。');let boundary:RegExpExecArray|null;
        while((boundary=/\r?\n\r?\n/.exec(buffer))){processEvent(buffer.slice(0,boundary.index));buffer=buffer.slice(boundary.index+boundary[0].length);}
      }
      buffer+=decoder.decode();if(buffer.trim())processEvent(buffer);
      const expected=p.format==='chat'?'stop':p.format==='messages'?'end_turn':'completed';
      if(!done||finish!==expected)throw new UserError('incomplete-result','模型结果未完整生成，暂不展示结论。可以重新分析。');
      return {result:validateResult(content,bundle),elapsedMs:Date.now()-started,...(usage?{usage}:{}),model:modelName(p.provider,p.model),language};
    }finally{await reader.cancel().catch(()=>{});}
  }catch(error){if(signal.aborted)throw error;if(controller.signal.aborted)throw new UserError('analysis-timeout','分析超过等待时间。可以重新点击分析。');if(error instanceof UserError)throw error;throw new UserError('provider-network','无法连接模型服务，请检查网络后重试。');}
  finally{clearTimeout(headerTimer);clearTimeout(totalTimer);linked.dispose();}
}
export async function listModels(p:ModelProfile,signal:AbortSignal):Promise<string[]> {
  if(!preset(p.provider).refresh)throw new UserError('models-unavailable','请使用预置或手填模型 ID。');
  const headers:Record<string,string>=p.format==='messages'?{'x-api-key':p.key,'anthropic-version':'2023-06-01'}:{Authorization:'Bearer '+p.key};
  const timer=new AbortController(),linked=composeSignals([signal,timer.signal]);const timeout=setTimeout(()=>timer.abort(),15000);
  try {
    const res=await fetch(normalizeBase(p.baseUrl)+'/models',{headers,signal:linked.signal});if(!res.ok)throw httpError(res.status);
    const text=await res.text();if(text.length>500_000)throw new Error();const data=JSON.parse(text);
    const ids=(data.data??data.models)?.map((m:any)=>m.id??m.name?.replace(/^models\//,''));
    if(!Array.isArray(ids))throw new Error();return [...new Set<string>(ids.filter((id:any)=>typeof id==='string'&&id.length>0&&id.length<=150&&!/\s/.test(id)).slice(0,1000))];
  }catch(e){if(e instanceof UserError)throw e;throw new UserError('models-unavailable','未能获取型号，请使用预置或手填模型 ID。');}finally{clearTimeout(timeout);linked.dispose();}
}
