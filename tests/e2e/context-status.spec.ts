import {test,expect} from './fixtures';
import {configure,entry,html,item,mockNetwork,type NetworkState} from './pages';
import {result} from '../fixtures/posts';
import type {BrowserContext} from '@playwright/test';
const classic=(more=false)=>'<!doctype html><title>Standalone fixture</title><style>body{font:15px/1.6 system-ui;margin:0}main{max-width:570px;margin:40px auto}article{padding:16px}.post-body{min-width:0}a{color:#536471}button{cursor:pointer}</style><main data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article data-testid="tweet" tabindex="0"><div class="post-body"><a href="/person/status/12"><time>Today</time></a><div data-testid="tweetText">A reported claim about a film.</div>'+(more?'<button data-testid="tweet-text-show-more-link">Show more</button>':'')+'<div data-testid="tweetPhoto"><button>展开</button></div><button>查看更多</button><div style="display:none"><button data-testid="tweet-text-show-more-link">Show more</button></div></div></article></div><div role="progressbar">Loading replies</div></main><aside role="progressbar">Loading sidebar</aside>';
async function pageFor(context:BrowserContext,body:string,path='12'):Promise<void>{await context.route('https://x.com/person/status/'+path+'*',route=>route.fulfill({contentType:'text/html',body}));}
const replyFor=(sourceId:string,quote:string)=>({...result,summary:'这条在转述一个消息，reported 表示尚未证实。',evidence:[{sourceId,quote,explanation:'The wording reports a claim.'}]});

test('独立原帖和时间线内容直接解读，缺项不适用，媒体展开不误判',async({context,page,extensionId})=>{
 const state:NetworkState={requests:[],collectorUrls:[],reply:replyFor('12','reported claim')};await mockNetwork(context,state);await pageFor(context,classic());await context.route('https://x.com/home',route=>route.fulfill({contentType:'text/html',body:classic()}));await configure(context,extensionId);
 await page.goto('https://x.com/person/status/12');await (await entry(page,'12')).click();await expect(page.getByText(state.reply!.summary as string,{exact:true})).toBeVisible();await expect(page.getByText('这是独立帖子，本次只依据这条文字解读；父帖不适用。')).toBeVisible();
 expect(state.collectorUrls).toHaveLength(0);const sent=JSON.parse(state.requests[0].messages[1].content);expect(sent.mode).toBe('post');expect(sent.relation).toBe('standalone');expect(sent.missing).toEqual([]);expect(sent.sources).toHaveLength(1);expect(sent.roles).toEqual({current:'12'});
 await page.goto('https://x.com/home');await (await entry(page,'12')).click();await expect(page.getByText(state.reply!.summary as string,{exact:true})).toBeVisible();await expect(page.getByText(/未发现可见的回复关联/)).toBeVisible();expect(JSON.parse(state.requests[1].messages[1].content).relation).toBe('unconfirmed');expect(state.collectorUrls).toHaveLength(0);await page.screenshot({path:'documentation/evidence/standalone-post.png',fullPage:true});
});

test('真正未展开先提示正文问题，展开后重试使用新文字并显示等待反馈',async({context,page,extensionId})=>{
 let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],reply:replyFor('12','reported claim'),holdApi:new Promise<void>(r=>release=r)};await mockNetwork(context,state);await pageFor(context,classic(true));await configure(context,extensionId);await page.goto('https://x.com/person/status/12');await (await entry(page,'12')).click();
 await expect(page.getByText('正文还没完整展开',{exact:true})).toBeVisible();await expect(page.getByText('还缺一些上下文',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'用现有内容分析',exact:true})).toHaveCount(0);expect(state.requests).toHaveLength(0);
 await page.locator('article').evaluate(el=>{el.querySelectorAll('[data-testid="tweet-text-show-more-link"]').forEach(n=>n.remove());el.querySelector('[data-testid="tweetText"]')!.textContent='The full reported claim is now visible.';});
 await page.getByRole('button',{name:'重试补齐',exact:true}).click();await expect(page.getByText('正在分析意思…',{exact:true})).toBeVisible();await expect.poll(()=>page.locator('.loading-time').textContent()).toMatch(/已执行 [1-9]\d* 秒/);await expect(page.locator('.spinner')).toBeVisible();
 expect(JSON.parse(state.requests[0].messages[1].content).sources[0].text).toBe('The full reported claim is now visible.');await page.screenshot({path:'documentation/evidence/retry-loading.png'});release();await expect(page.getByText(state.reply!.summary as string,{exact:true})).toBeVisible();await expect(page.locator('.spinner')).toHaveCount(0);
});

test('缺父帖后第二次确认显示动效和新计时，使用页面最新正文',async({context,page,extensionId})=>{
 let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],reply:replyFor('9','reported claim'),holdApi:new Promise<void>(r=>release=r)};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/9');await (await entry(page,'9')).click();await expect(page.getByText('还缺一些上下文',{exact:true})).toBeVisible();expect(state.requests).toHaveLength(0);
 await page.locator('article .whitespace-pre-wrap').evaluate(el=>el.textContent='This is a reported claim now.');await page.getByRole('button',{name:'用现有内容分析',exact:true}).click();await expect(page.getByText('正在分析意思…',{exact:true})).toBeVisible();await expect(page.locator('.spinner')).toBeVisible();await expect.poll(()=>page.locator('.loading-time').textContent()).toMatch(/已执行 [1-9]\d* 秒/);
 const sent=JSON.parse(state.requests[0].messages[1].content);expect(sent.sources[0].text).toBe('This is a reported claim now.');expect(sent.missing).toEqual(['parent','root']);release();await expect(page.getByText(state.reply!.summary as string,{exact:true})).toBeVisible();
});

test('失败后主动重新分析也保留阶段、计时，不自动发第二次请求',async({context,page,extensionId})=>{
 const state:NetworkState={requests:[],collectorUrls:[],reply:replyFor('12','reported claim'),apiStatus:503};await mockNetwork(context,state);await pageFor(context,classic());await configure(context,extensionId);await page.goto('https://x.com/person/status/12');await (await entry(page,'12')).click();await expect(page.getByRole('button',{name:'重新分析',exact:true})).toBeVisible();expect(state.requests).toHaveLength(1);
 let release!:()=>void;state.apiStatus=200;state.holdApi=new Promise<void>(r=>release=r);await page.getByRole('button',{name:'重新分析',exact:true}).click();await expect(page.getByText('正在分析意思…',{exact:true})).toBeVisible();await expect(page.locator('.loading-time')).toContainText('本次执行最多 60 秒');await expect(page.locator('.spinner')).toBeVisible();await expect.poll(()=>state.requests.length).toBe(2);release();await expect(page.getByText(state.reply!.summary as string,{exact:true})).toBeVisible();
});

test('未确认回复关系与已知回复缺父帖分别提示，均不自动请求',async({context,page,extensionId})=>{
 const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);await pageFor(context,html('3').replace(/<main>[\s\S]*<\/main>/,'<main>'+item('2','Unrelated entry','feed')+item('13','Unclear relationship','feed',true)+'</main>'),'13');await configure(context,extensionId);
 await page.goto('https://x.com/person/status/13');await (await entry(page,'13')).click();await expect(page.getByText('还没确认回复关系',{exact:true})).toBeVisible();await expect(page.getByText(/页面没有足够信息判断这条内容是否有父帖/)).toBeVisible();expect(state.requests).toHaveLength(0);
 await page.goto('https://x.com/person/status/9');await (await entry(page,'9')).click();await expect(page.getByText('还缺一些上下文',{exact:true})).toBeVisible();expect(state.requests).toHaveLength(0);
});

test('Reddit 独立主帖也能直接解读，不要求评论父链',async({context,page,extensionId})=>{
 const state:NetworkState={requests:[],collectorUrls:[],reply:replyFor('t3_abc','reported claim')};await mockNetwork(context,state);await context.route('https://www.reddit.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Reddit standalone</title><shreddit-post thingid="t3_abc" post-type="text" post-title="A reported claim" permalink="/r/test/comments/abc/title/"><div slot="text-body">What does reported mean here?</div></shreddit-post>'}));await configure(context,extensionId);await page.goto('https://www.reddit.com/r/test/comments/abc/title/');await page.getByRole('button',{name:'帮我确认意思',exact:true}).click();await expect(page.getByText(state.reply!.summary as string,{exact:true})).toBeVisible();
 const sent=JSON.parse(state.requests[0].messages[1].content);expect(sent.mode).toBe('post');expect(sent.missing).toEqual([]);expect(sent.sources).toHaveLength(1);
});
