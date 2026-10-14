import type { BrowserContext, Page, Route } from '@playwright/test';
import { result } from '../fixtures/posts';
const escape = (text: string) => text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function item(id:string,text:string,kind:'root'|'reply'|'feed',focal=false,media=false):string {
  const wrapper = focal ? 'tabindex="-1"' : 'data-href="/person/status/' + id + '" role="link" tabindex="0"';
  const line = kind === 'root' ? 'top-5 -bottom-3' : kind === 'reply' ? '-top-3 h-8' : '';
  return '<div data-timeline-entry ' + wrapper + '><article><div class="avatar"><span aria-hidden="true" class="absolute left-1/2 w-0.5 ' + line + '"></span>R</div><div class="post-body"><div class="author">English community <a class="inline-flex w-fit" href="/person/status/' + id + '">Oct 12</a></div><div class="whitespace-pre-wrap">' + escape(text) + '</div>' + (media?'<div data-testid="tweetPhoto" class="media">图片内容未解析</div>':'') + '<div class="original-actions"><a href="/compose/post?in_reply_to=' + id + '" aria-label="回复">回复</a><button onclick="this.dataset.clicked=\'true\'">喜欢</button><button>分享<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24"><path d="M4 12h16"></path></svg></button></div></div></article></div>';
}
export function html(id:string): string {
  const current = id==='1' ? item('1','If you hate Gemini like me\n\nLets connect','feed',true)
    : id==='11' ? item('1','If you hate Gemini like me\n\nLets connect','root')+item('11','😂😂','reply',true)
    : id==='6' ? item('1','If you hate Gemini like me\n\nLets connect','root')+item('6','Another nice try','reply',true)
    : id==='9' ? item('9','Wait, are you serious?','reply',true)
    : id==='4' ? item('3','Hahaha))) nice try','root')+item('4','Exactly, nice try','reply',true)
    : id==='10' ? item('1','If you hate Gemini like me\n\nLets connect','root')+item('10','a'.repeat(12001),'reply',true)
    : item('1','If you hate Gemini like me\n\nLets connect','root')+item('3','Hahaha))) nice try','reply',true,true)+item('5','Unrelated branch should never be sent','feed');
  return '<!doctype html><html><head><meta charset="UTF-8"><title>X 测试夹具</title><style>body{margin:0;background:#fff;color:#0f1419;font:15px/1.6 -apple-system,sans-serif}main{width:570px;margin:50px 0 0 230px}h1{font-size:20px}article{display:flex;gap:14px;padding:18px 16px;border-bottom:1px solid #cfd9de}.avatar{width:38px;height:38px;flex-shrink:0;border-radius:50%;background:#e7e9ea;display:grid;place-items:center}.post-body{width:100%;min-width:0}.author{font-weight:600;color:#536471}.author a{font-size:12px;font-weight:400;margin-left:10px}.whitespace-pre-wrap{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:8px}.original-actions{display:flex;justify-content:space-between;margin-top:14px}button{cursor:pointer}button,a{color:#536471;border:0;background:none;font:inherit}.media{background:#eff3f4;border:1px solid #cfd9de;height:80px;display:grid;place-items:center;margin-top:10px}aside{position:fixed;left:20px;top:70px;color:#536471}.dark body{background:#15202b;color:#f7f9f9}.dark .avatar{background:#536471}.dark .media{background:#273340;color:#f7f9f9}@media(max-width:800px){main{width:100%;margin:0}}</style></head><body><aside>X 插件自测<br>模拟页面与模型</aside><main><h1>公开英文回复</h1>' + current + '</main></body></html>';
}
export interface NetworkState { requests:any[]; collectorUrls:string[]; reply?:Record<string,unknown>; holdApi?:Promise<void>; holdContext?:Promise<void>; apiStatus?:number }
export async function mockNetwork(context:BrowserContext,state:NetworkState) {
  await context.route('https://api.deepseek.com/**',async route=>{
    const payload=route.request().postDataJSON();state.requests.push(payload);
    if(state.holdApi) await state.holdApi;
    const source=JSON.parse(payload.messages[1].content).roles.current;
    const output=state.reply??{...result,evidence:[{...result.evidence[0],sourceId:source}]};
    const events=[{choices:[{delta:{content:JSON.stringify(output)}}]},{choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:120,completion_tokens:80,total_tokens:200}}];
    await route.fulfill({status:state.apiStatus??200,contentType:'text/event-stream',body:events.map(e=>'data: '+JSON.stringify(e)+'\n\n').join('')+'data: [DONE]\n\n'}).catch(()=>{});
  });
  await context.route('https://x.com/**',async route=>{
    const url=new URL(route.request().url());
    if(route.request().resourceType()!=='document') { await route.abort();return; }
    if(url.searchParams.has('mc-collector')) {state.collectorUrls.push(url.href);if(state.holdContext) await state.holdContext;}
    await route.fulfill({contentType:'text/html',body:html(url.pathname.split('/').at(-1)!)}).catch(()=>{});
  });
}
export async function configure(context:BrowserContext,extensionId:string):Promise<Page> {
  const options=await context.newPage();await options.goto('chrome-extension://'+extensionId+'/options.html#models');
  await options.getByRole('button',{name:'中文',exact:true}).click();
  await options.getByRole('heading',{name:'模型连接',exact:true}).waitFor();
  await options.locator('#api-key').fill('test-only-not-a-credential');
  await options.getByRole('button',{name:'保存',exact:true}).click();
  await options.getByText('已保存。',{exact:true}).waitFor();return options;
}
export async function entry(page:Page,id='3') {
  const article=page.locator('article').filter({has:page.locator('a[href="/person/status/'+id+'"]')});
  await article.hover();
  return article.getByRole('button',{name:'帮我确认意思',exact:true});
}
