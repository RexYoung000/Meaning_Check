import { describe, it, expect, vi } from 'vitest';
import { analyze } from '../src/analysis/provider';
import { bundleOf } from '../src/analysis/context';
import { reply,root,result } from './fixtures/posts';
const b = bundleOf(reply,root,root);
function streamed(content: string, finish='stop', done=true, chunkSize=13) {
  const events = [ {choices:[{delta:{reasoning_content:'不展示的内部思考'}}]}, {choices:[{delta:{content}}]}, {choices:[{delta:{},finish_reason:finish}],usage:{prompt_tokens:111,completion_tokens:222,total_tokens:333}} ];
  const bytes = new TextEncoder().encode(events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('')+(done?'data: [DONE]\r\n\r\n':''));
  const body = new ReadableStream<Uint8Array>({ start(controller) { for(let i=0;i<bytes.length;i+=chunkSize) controller.enqueue(bytes.slice(i,i+chunkSize)); controller.close(); } });
  return new Response(body,{headers:{'Content-Type':'text/event-stream'}});
}
describe('DeepSeek 适配与请求约束',()=>{
  it('使用官方模型和 JSON 输出，仅发送三个角色的材料',async()=>{
    const fetcher=vi.fn(async()=>streamed(JSON.stringify(result)));
    const r=await analyze(b,'test-only-not-a-credential',new AbortController().signal,fetcher);
    const request=fetcher.mock.calls[0] as unknown as [string,RequestInit];
    const payload=JSON.parse(request[1].body as string);
    expect(request[0]).toBe('https://api.deepseek.com/chat/completions'); expect(payload.model).toBe('deepseek-flash'); expect(payload.stream).toBe(true); expect(payload.max_tokens).toBe(4096);expect(payload.reasoning_effort).toBe('low'); expect(payload.tools).toBeUndefined();
    expect(r.result).toEqual(result);expect(r.usage?.totalTokens).toBe(333);expect(JSON.stringify(r)).not.toContain('内部思考');
  });
  it('支持 UTF-8 与 CRLF 拆到单字节块',async()=>expect((await analyze(b,'test-only-not-a-credential',new AbortController().signal,async()=>streamed(JSON.stringify(result),'stop',true,1))).result.summary).toBe(result.summary));
  it.each(['length','content_filter','aborted'])('拒绝未正常结束 %s',async reason=>{const f=vi.fn(async()=>streamed(JSON.stringify(result),reason));await expect(analyze(b,'test-only-not-a-credential',new AbortController().signal,f)).rejects.toThrow('完整');expect(f).toHaveBeenCalledTimes(1);});
  it('丢失 DONE 标记不当作完成',async()=>expect(analyze(b,'test-only-not-a-credential',new AbortController().signal,async()=>streamed(JSON.stringify(result),'stop',false))).rejects.toThrow('完整'));
  it('不记录或展示服务返回的凭据错误正文，不自动重试',async()=>{const f=vi.fn(async()=>new Response('raw-sensitive-error',{status:401}));await expect(analyze(b,'test-only-not-a-credential',new AbortController().signal,f)).rejects.toThrow('密钥');expect(f).toHaveBeenCalledTimes(1);});
  it('超限在发出付费请求前拒绝',async()=>{const f=vi.fn();await expect(analyze(bundleOf({...reply,text:'a'.repeat(12001)}),'test-only-not-a-credential',new AbortController().signal,f)).rejects.toThrow('12,000');expect(f).not.toHaveBeenCalled();});
  it('预先取消不会发送请求',async()=>{const f=vi.fn();const c=new AbortController();c.abort();await expect(analyze(b,'test-only-not-a-credential',c.signal,f)).rejects.toMatchObject({name:'AbortError'});expect(f).not.toHaveBeenCalled();});
  it('响应头超时会取消，不自动重试',async()=>{
    vi.useFakeTimers();
    const f=vi.fn((_url:any,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')))));
    const task=analyze(b,'test-only-not-a-credential',new AbortController().signal,f);const check=expect(task).rejects.toThrow('等待');await vi.advanceTimersByTimeAsync(25001);await check;expect(f).toHaveBeenCalledTimes(1);vi.useRealTimers();
  });
});
