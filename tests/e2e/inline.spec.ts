import {test,expect} from './fixtures';
import {configure,entry,item,mockNetwork,type NetworkState} from './pages';
import {result} from '../fixtures/posts';
import type {Page} from '@playwright/test';

async function addReplies(page:Page):Promise<void>{
  await page.evaluate(html=>document.querySelector('main')!.insertAdjacentHTML('beforeend',html),item('4','Exactly, nice try','feed')+item('6','Another nice try','feed'));
}
const card=(page:Page,id:string)=>page.locator('article').filter({has:page.locator('a[href="/person/status/'+id+'"]')}).locator('meaning-check-card');

test('连续点三条各自在原文下加载，两条并行其余排队，结果不串帖',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdApi:new Promise<void>(r=>release=r)};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await addReplies(page);
  await (await entry(page,'3')).click();await (await entry(page,'4')).click();await (await entry(page,'6')).click();
  await expect(page.locator('meaning-check-card')).toHaveCount(3);await expect(card(page,'6').getByText('排队中 · 第 1 条',{exact:true})).toBeVisible();
  await expect.poll(()=>state.requests.length).toBe(2);
  await expect(card(page,'6').locator('.loading-time')).toContainText('排队不计入执行超时');
  const associations=await page.locator('meaning-check-card').evaluateAll(hosts=>hosts.map(host=>({inline:getComputedStyle(host).position,entry:host.previousElementSibling?.tagName,scroll:getComputedStyle(host.shadowRoot!.querySelector('.card')!).overflowY})));
  expect(associations).toEqual(Array(3).fill({inline:'static',entry:'MEANING-CHECK-ENTRY',scroll:'visible'}));
  expect(context.pages().filter(p=>p.url().includes('mc-collector')).length).toBeLessThanOrEqual(2);
  release();await expect(page.locator('meaning-check-card .summary-text')).toHaveCount(3);
  await expect.poll(()=>state.requests.length).toBe(3);
  const inputIds=state.requests.map(request=>JSON.parse(request.messages[1].content).roles.current);expect(inputIds.sort()).toEqual(['3','4','6']);
  for(const id of ['3','4','6'])await expect(card(page,id).getByText(result.summary,{exact:true})).toBeVisible();
  await expect.poll(()=>context.pages().filter(p=>p.url().includes('mc-collector')).length).toBe(0);
  await page.screenshot({path:'documentation/evidence/inline-multiple.png',fullPage:true});
});

test('排队可单独取消，其他任务与结果保留，不产生第三次请求',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdApi:new Promise<void>(r=>release=r)};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await addReplies(page);
  for(const id of ['3','4','6'])await (await entry(page,id)).click();
  await expect(card(page,'6').getByText('排队中 · 第 1 条',{exact:true})).toBeVisible();await expect.poll(()=>state.requests.length).toBe(2);
  await card(page,'6').getByRole('button',{name:'取消这条任务',exact:true}).click();await expect(page.locator('meaning-check-card')).toHaveCount(2);
  release();await expect(page.locator('meaning-check-card .summary-text')).toHaveCount(2);expect(state.requests).toHaveLength(2);
});

test('取消正在执行的一条释放排队，收起另一条仍继续，重复点击不重复调用',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdApi:new Promise<void>(r=>release=r)};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await addReplies(page);
  for(const id of ['3','4','6'])await (await entry(page,id)).click();
  await expect.poll(()=>state.requests.length).toBe(2);await (await entry(page,'4')).click();await expect(card(page,'4').getByRole('button',{name:'展开',exact:true})).toBeVisible();
  await card(page,'3').getByRole('button',{name:'关闭解读',exact:true}).click();await expect.poll(()=>state.requests.length).toBe(3);
  release();await expect(card(page,'6').getByText(result.summary,{exact:true})).toBeVisible();await expect(card(page,'4').locator('.collapsed-summary')).toHaveText(result.summary);
  await (await entry(page,'4')).click();await expect(card(page,'4').getByText(result.summary,{exact:true})).toBeVisible();expect(state.requests).toHaveLength(3);await expect(card(page,'3')).toHaveCount(0);
});

test('长表单随页面滚动，窄窗无横向溢出，空白点击不会关闭卡片',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/9');await page.setViewportSize({width:390,height:480});await (await entry(page,'9')).click();
  const inline=card(page,'9');await expect(inline.getByText('还缺一些上下文')).toBeVisible();await expect(inline.getByText('未取得直接父帖、原帖。请选择补充背景或用现有内容分析。')).toBeVisible();
  await inline.getByText('手动补充或缩减文字').click();await inline.getByLabel('补充原帖').fill('Background to a public joke');
  await inline.getByRole('button',{name:'用这些内容分析'}).scrollIntoViewIfNeeded();const old=await page.evaluate(()=>scrollY);expect(old).toBeGreaterThan(0);
  await page.mouse.move(190,200);await page.mouse.wheel(0,-250);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeLessThan(old);
  await page.locator('h1').click();await expect(inline).toHaveCount(1);await expect(inline.getByLabel('补充原帖')).toHaveValue('Background to a public joke');
  await page.setViewportSize({width:220,height:300});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await inline.getByRole('button',{name:'用这些内容分析'}).scrollIntoViewIfNeeded();await expect(inline.getByRole('button',{name:'用这些内容分析'})).toBeInViewport();expect(state.requests).toHaveLength(0);
  await page.setViewportSize({width:390,height:760});await inline.scrollIntoViewIfNeeded();await page.screenshot({path:'documentation/evidence/inline-manual.png',fullPage:true});
});

test('加载有阶段、计时和上限，减少动效保留文字状态',async({context,page,extensionId})=>{
  let releaseContext!:()=>void,releaseApi!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdContext:new Promise<void>(r=>releaseContext=r),holdApi:new Promise<void>(r=>releaseApi=r)};
  await mockNetwork(context,state);await configure(context,extensionId);await page.emulateMedia({reducedMotion:'reduce'});await page.goto('https://x.com/person/status/3');const trigger=await entry(page);await trigger.click();const inline=card(page,'3');
  await expect(inline.getByText('正在补齐上下文…',{exact:true})).toBeVisible();await expect(inline.locator('.loading-time')).toContainText('补齐最多 30 秒');
  await expect.poll(()=>inline.locator('.loading-time').textContent()).toMatch(/已执行 [1-9]\d* 秒/);expect(await inline.locator('.spinner').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect(trigger).toBeFocused();await page.screenshot({path:'documentation/evidence/inline-loading.png'});
  releaseContext();await expect(inline.getByText('正在分析意思…',{exact:true})).toBeVisible();await expect(inline.locator('.loading-time')).toContainText('本次执行最多 60 秒');expect(state.requests).toHaveLength(1);releaseApi();await expect(inline.getByText(result.summary,{exact:true})).toBeVisible();await expect(inline.locator('.spinner')).toHaveCount(0);
});

test('回复与卡片直接打开同一设置页，保留未保存内容，无须先分析',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);const options=await configure(context,extensionId);await options.locator('#profile-name').fill('Unsaved name');
  await page.goto('https://x.com/person/status/3');const reply=page.locator('article').nth(1);await reply.getByRole('button',{name:'插件设置',exact:true}).click();await expect(options.locator('#profile-name')).toHaveValue('Unsaved name');expect(context.pages().filter(p=>p.url().includes('/options.html'))).toHaveLength(1);expect(state.requests).toHaveLength(0);
  await page.bringToFront();await (await entry(page)).click();await expect(card(page,'3').getByText(result.summary,{exact:true})).toBeVisible();await card(page,'3').getByRole('button',{name:'插件设置',exact:true}).click();await expect(options.locator('#profile-name')).toHaveValue('Unsaved name');expect(context.pages().filter(p=>p.url().includes('/options.html'))).toHaveLength(1);
  await options.getByRole('link',{name:'开始使用',exact:true}).click();await expect(options.getByText(/这里是 Meaning Check 的插件设置/)).toBeVisible();await expect(options.getByRole('button',{name:'设置解读语言',exact:true})).toBeVisible();await expect(options.getByRole('button',{name:'管理生效网站',exact:true})).toBeVisible();await options.screenshot({path:'documentation/evidence/settings-start.png',fullPage:true});
});

test('页面导航与原帖移除只清理相应卡片，离开页面清理全部任务',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdApi:new Promise<void>(r=>release=r)};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await addReplies(page);
  for(const id of ['3','4','6'])await (await entry(page,id)).click();await expect.poll(()=>state.requests.length).toBe(2);
  await page.locator('article').filter({has:page.locator('a[href="/person/status/3"]')}).evaluate(el=>el.closest('[data-timeline-entry]')!.remove());await expect(card(page,'3')).toHaveCount(0);await expect(card(page,'4')).toHaveCount(1);await expect.poll(()=>state.requests.length).toBe(3);
  await page.evaluate(()=>history.pushState({},'', '/person/status/4'));await expect(page.locator('meaning-check-card')).toHaveCount(0);release();await expect.poll(()=>context.pages().filter(p=>p.url().includes('mc-collector')).length).toBe(0);expect(state.requests).toHaveLength(3);
});

test('多个标签页共用两个执行槽，全局暂停同时清理执行项和排队项',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdContext:new Promise<void>(r=>release=r)};
  await mockNetwork(context,state);const options=await configure(context,extensionId);
  const second=await context.newPage(),third=await context.newPage();
  await page.goto('https://x.com/person/status/3');await second.goto('https://x.com/person/status/4');await third.goto('https://x.com/person/status/6');
  await (await entry(page,'3')).click();await (await entry(second,'4')).click();await (await entry(third,'6')).click();
  await expect(card(third,'6').getByText('排队中 · 第 1 条',{exact:true})).toBeVisible();await expect.poll(()=>state.collectorUrls.length).toBe(2);expect(state.requests).toHaveLength(0);
  await options.getByRole('link',{name:'开始使用',exact:true}).click();await options.getByRole('checkbox').uncheck();
  for(const target of [page,second,third])await expect(target.locator('meaning-check-card')).toHaveCount(0);
  release();await expect.poll(()=>context.pages().filter(p=>p.url().includes('mc-collector')).length).toBe(0);expect(state.requests).toHaveLength(0);expect(state.collectorUrls).toHaveLength(2);
});

test('插件键盘操作不触发原帖快捷键，Escape 只关闭焦点卡片',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await addReplies(page);
  await page.evaluate(()=>{
    (window as any).originalKeys=[];
    document.querySelectorAll('[data-timeline-entry]').forEach(wrapper=>wrapper.addEventListener('keydown',event=>(window as any).originalKeys.push((event as KeyboardEvent).key)));
  });
  await (await entry(page,'3')).press('Enter');await expect(card(page,'3').getByText(result.summary,{exact:true})).toBeVisible();await (await entry(page,'6')).click();await expect(card(page,'6').getByText(result.summary,{exact:true})).toBeVisible();
  await card(page,'3').getByRole('button',{name:'收起',exact:true}).press('Enter');await expect(card(page,'3').getByRole('button',{name:'展开',exact:true})).toBeVisible();
  await card(page,'3').getByRole('button',{name:'展开',exact:true}).press('Escape');await expect(card(page,'3')).toHaveCount(0);await expect(card(page,'6')).toHaveCount(1);expect(await page.evaluate(()=>(window as any).originalKeys)).toEqual([]);
  await page.locator('article').filter({has:page.locator('a[href="/person/status/6"]')}).getByRole('button',{name:'喜欢',exact:true}).press('Enter');expect(await page.evaluate(()=>(window as any).originalKeys)).toEqual(['Enter']);expect(state.requests).toHaveLength(2);
});
