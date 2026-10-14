import {test,expect} from './fixtures';
import {configure,entry,mockNetwork,type NetworkState} from './pages';
import {result} from '../fixtures/posts';

const timeline='<!doctype html><meta charset="UTF-8"><title>X timeline fixture</title><style>body{font:15px/1.6 system-ui;margin:0}main{max-width:570px;margin:40px auto}article{padding:16px}button{cursor:pointer}</style><main data-testid="primaryColumn"><article data-testid="tweet" tabindex="0"><a href="/person/status/21"><time>Today</time></a><button aria-label="More"><svg aria-hidden="true" class="absolute -top-1 left-1/2" width="16" height="16" viewBox="0 0 24 24"><path d="M4 12h16"></path></svg></button><div data-testid="tweetText">TAKE THIS WITH A GRAIN OF SALT. I am skeptical but optimistic.</div></article></main>';
const interpretation={...result,summary:'发布者在转述未核实的消息，并提醒读者保持怀疑。',tone:'谨慎，带期待',function:'分享传闻并提醒不要轻信',evidence:[{sourceId:'21',quote:'TAKE THIS WITH A GRAIN OF SALT',explanation:'提醒不要把消息当作确定事实。'}]};

test('真实类型 SVG 图标的时间线卡片立即加载，正常得到结果且不重复请求',async({context,page,extensionId})=>{
 let release!:()=>void;
 const state:NetworkState={requests:[],collectorUrls:[],reply:interpretation,holdApi:new Promise<void>(r=>release=r)};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await mockNetwork(context,state);await context.route('https://x.com/home',route=>route.fulfill({contentType:'text/html',body:timeline}));await configure(context,extensionId);await page.goto('https://x.com/home');
 await (await entry(page,'21')).click();const card=page.getByRole('region',{name:'这句话想表达什么',exact:true});
 await expect(card.getByText('正在识别意图…',{exact:true})).toBeVisible();await expect(card.locator('.spinner')).toBeVisible();await expect.poll(()=>card.locator('.loading-time').textContent()).toMatch(/已等 [1-9]\d* 秒/);
 await expect.poll(()=>state.requests.length).toBe(1);expect(state.collectorUrls).toHaveLength(0);expect(errors).toEqual([]);
 await page.screenshot({path:'documentation/evidence/timeline-loading.png'});release();await expect(card.getByText(interpretation.summary,{exact:true})).toBeVisible();
 await (await entry(page,'21')).click();await expect(card.getByRole('button',{name:'展开',exact:true})).toBeVisible();await (await entry(page,'21')).click();await expect(card.getByText(interpretation.summary,{exact:true})).toBeVisible();expect(state.requests).toHaveLength(1);
});

test('页面读取异常显示可重试错误且未调用模型，主动重试后恢复加载',async({context,page,extensionId,worker})=>{
 let release!:()=>void;
 const state:NetworkState={requests:[],collectorUrls:[],reply:interpretation,holdApi:new Promise<void>(r=>release=r)};
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await mockNetwork(context,state);await context.route('https://x.com/home',route=>route.fulfill({contentType:'text/html',body:timeline}));await configure(context,extensionId);await page.goto('https://x.com/home');const trigger=await entry(page,'21');await expect(trigger).toBeVisible();
 // Inject one snapshot-read failure in the isolated test extension world.
 // No production test hooks, personal profile or live API are involved.
 await worker.evaluate(async()=>{
  const chrome=(globalThis as any).chrome;const [tab]=await chrome.tabs.query({url:'https://x.com/home'});
  await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>{
   const original=Document.prototype.querySelectorAll;
   Document.prototype.querySelectorAll=function(selector:string){
    if(selector==='article'){Document.prototype.querySelectorAll=original;throw new Error('fixture snapshot interruption');}
    return original.call(this,selector);
   };
  }});
 });
 await trigger.click();const card=page.getByRole('region',{name:'这句话想表达什么',exact:true});
 await expect(card.getByText('页面文字或帖子关系读取中断，请点击重试。',{exact:true})).toBeVisible();await expect(card.getByText('尚未调用模型。请先处理上面的文字或配置问题。',{exact:true})).toBeVisible();await expect(card.locator('.spinner')).toHaveCount(0);expect(state.requests).toHaveLength(0);expect(errors).toEqual([]);
 await page.screenshot({path:'documentation/evidence/page-read-error.png'});await card.getByRole('button',{name:'重试补齐',exact:true}).click();await expect(card.getByText('正在识别意图…',{exact:true})).toBeVisible();await expect(card.locator('.spinner')).toBeVisible();await expect.poll(()=>state.requests.length).toBe(1);
 release();await expect(card.getByText(interpretation.summary,{exact:true})).toBeVisible();expect(errors).toEqual([]);
});
