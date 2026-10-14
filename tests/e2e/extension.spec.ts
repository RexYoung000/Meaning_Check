import { test,expect } from './fixtures';
import { mockNetwork,configure,entry,item,type NetworkState } from './pages';
import { result } from '../fixtures/posts';
import { mkdir } from 'node:fs/promises';

test('未配置时引导设置；悬停不调用、不打开补齐页',async({context,page,extensionId})=>{
  const setup=await context.newPage();await setup.goto('chrome-extension://'+extensionId+'/options.html');await setup.getByRole('button',{name:'中文',exact:true}).click();await expect(setup.getByRole('heading',{name:'开始使用',exact:true})).toBeVisible();await setup.close();
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);await page.goto('https://x.com/person/status/3');
  const trigger=await entry(page);await expect(trigger).toBeVisible();expect(state.requests).toHaveLength(0);expect(state.collectorUrls).toHaveLength(0);
  await trigger.click();await expect(page.getByText('请先在扩展设置中保存模型连接和密钥。')).toBeVisible();expect(state.requests).toHaveLength(0);expect(state.collectorUrls).toHaveLength(0);
  const opened=context.waitForEvent('page');await page.getByRole('button',{name:'打开扩展设置'}).click();const options=await opened;await expect(options).toHaveURL('chrome-extension://'+extensionId+'/options.html');
});
test('补齐原帖、父根去重、结果有真实引文，原 X 操作保留',async({context,page,extensionId,worker})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');
  await (await entry(page)).waitFor();await page.evaluate(()=>document.querySelectorAll('meaning-check-entry')[1]?.shadowRoot?.querySelector<HTMLButtonElement>('button')?.click());await expect(page.getByRole('region',{name:'确认这条回复',exact:true})).toHaveCount(0);expect(state.requests).toHaveLength(0);expect(state.collectorUrls).toHaveLength(0);
  await (await entry(page)).click();await expect(page.getByText(result.summary)).toBeVisible();expect(state.requests).toHaveLength(1);expect(state.collectorUrls).toHaveLength(1);
  const sent=JSON.parse(state.requests[0].messages[1].content);expect(sent.sources.map((s:any)=>s.id).sort()).toEqual(['1','3']);expect(sent.roles.parent).toBe(sent.roles.root);expect(JSON.stringify(sent)).not.toContain('Unrelated branch');
  await expect(page.getByText('这次仅分析文字，未读取图片或 GIF 的内容。')).toBeVisible();await page.getByText('查看使用的上下文').click();await expect(page.getByRole('link',{name:'直接父帖 / 原帖',exact:true})).toHaveAttribute('href','https://x.com/person/status/1');
  await expect.poll(()=>context.pages().filter(p=>p.url().includes('mc-collector')).length).toBe(0);
  const keys=await worker.evaluate(async()=>({local:Object.keys(await (globalThis as any).chrome.storage.local.get(null)),session:await (globalThis as any).chrome.storage.session.get(null)}));expect(keys.local.sort()).toEqual(['activeProfileId','onboardedVersion','preferences','profiles']);expect(keys.session.collectorTabs??[]).toEqual([]);
  await page.getByRole('button',{name:'关闭解读'}).click();const like=page.locator('article').nth(1).getByRole('button',{name:'喜欢'});await like.click();await expect(like).toHaveAttribute('data-clicked','true');
});
test('缺上下文须用户选择后才分析，可明确手动补齐',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{...result.evidence[0],sourceId:'9',quote:'are you serious'}]}};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/9');await (await entry(page,'9')).click();
  await expect(page.getByText('还缺一些上下文')).toBeVisible();expect(state.requests).toHaveLength(0);await page.getByText('手动补充或缩减文字').click();
  await page.getByLabel('补充直接父帖').fill('nice try is a joke here');await page.getByLabel('补充原帖').fill('We are joking about an invitation.');await page.getByRole('button',{name:'用这些内容分析'}).click();
  await expect(page.getByText(result.summary)).toBeVisible();const sent=JSON.parse(state.requests[0].messages[1].content);expect(sent.missing).toEqual([]);expect(sent.sources.filter((s:any)=>s.origin==='manual')).toHaveLength(2);
});
test('缺上下文可选择部分分析，缺失提示保留',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{...result.evidence[0],sourceId:'9',quote:'are you serious'}]}};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/9');await (await entry(page,'9')).click();
  await expect(page.getByText('还缺一些上下文')).toBeVisible();expect(state.requests).toHaveLength(0);await page.getByRole('button',{name:'用现有内容分析'}).click();await expect(page.getByText(result.summary)).toBeVisible();await expect(page.getByText('未取得直接父帖、原帖，这次解读仅依据现有内容。')).toBeVisible();
});
test('动态新增与导航、窄窗与键盘关闭',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');
  await page.evaluate(html=>document.querySelector('main')!.insertAdjacentHTML('beforeend',html),item('6','Another English reply','feed'));await (await entry(page,'6')).press('Tab');
  await page.setViewportSize({width:390,height:700});const trigger=await entry(page);await trigger.focus();await trigger.press('Enter');await expect(page.getByText(result.summary)).toBeVisible();const box=await page.getByRole('region',{name:'确认这条回复',exact:true}).boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(390);await page.setViewportSize({width:220,height:300});const small=await page.getByRole('region',{name:'确认这条回复',exact:true}).boundingBox();expect(small!.x+small!.width).toBeLessThanOrEqual(220);expect(small!.height).toBeGreaterThan(300);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Escape');await expect(page.getByRole('region',{name:'确认这条回复',exact:true})).toHaveCount(0);
  await (await entry(page)).click();await expect(page.getByRole('region',{name:'确认这条回复',exact:true})).toBeVisible();await page.evaluate(()=>history.pushState({},'', '/person/status/4'));await expect(page.getByRole('region',{name:'确认这条回复',exact:true})).toHaveCount(0);
});
test('模型无效依据不展示结论、不自动重试',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{...result.evidence[0],quote:'fabricated evidence'}]}};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await (await entry(page)).click();await expect(page.getByText('模型结果未通过来源和引用校验，请重新分析。')).toBeVisible();await expect(page.getByText(result.summary)).toHaveCount(0);expect(state.requests).toHaveLength(1);
});
test('结果文字不能成为可执行 HTML',async({context,page,extensionId})=>{
  const unsafe='<img src=x onerror="window.mcExecuted=true">';const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,summary:unsafe}};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await (await entry(page)).click();await expect(page.getByText(unsafe,{exact:true})).toBeVisible();expect(await page.evaluate(()=>({executed:(window as any).mcExecuted,images:document.querySelector('meaning-check-card')?.shadowRoot?.querySelectorAll('img').length}))).toEqual({executed:undefined,images:0});
});
test('双击只发一次，关闭分析后没有过期结果',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdApi:new Promise<void>(resolve=>release=resolve)};await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await (await entry(page)).dblclick();await expect.poll(()=>state.requests.length).toBe(1);await page.getByRole('button',{name:'关闭解读'}).click();release();await expect(page.getByRole('region',{name:'确认这条回复',exact:true})).toHaveCount(0);expect(state.requests).toHaveLength(1);
});
test('取消补齐清理自建页，用户页面继续保留',async({context,page,extensionId})=>{
  let release!:()=>void;const state:NetworkState={requests:[],collectorUrls:[],holdContext:new Promise<void>(resolve=>release=resolve)};await mockNetwork(context,state);const options=await configure(context,extensionId);await page.goto('https://x.com/person/status/3');await (await entry(page)).click();await expect.poll(()=>state.collectorUrls.length).toBe(1);await page.getByRole('button',{name:'关闭解读'}).click();release();await expect.poll(()=>context.pages().filter(p=>p.url().includes('mc-collector')).length).toBe(0);expect(options.isClosed()).toBe(false);expect(page.isClosed()).toBe(false);expect(state.requests).toHaveLength(0);
});
test('明暗主题使用真实插件内嵌卡片并保存验收截图',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);const options=await configure(context,extensionId);await mkdir('documentation/evidence',{recursive:true});await options.screenshot({path:'documentation/evidence/options.png'});await page.goto('https://x.com/person/status/3');await (await entry(page)).click();await expect(page.getByText(result.summary)).toBeVisible();await page.screenshot({path:'documentation/evidence/result-light.png'});await page.evaluate(()=>document.documentElement.classList.add('dark'));await expect(page.locator('meaning-check-card')).toHaveAttribute('data-theme','dark');await expect(page.locator('meaning-check-entry').first()).toHaveAttribute('data-theme','dark');await page.screenshot({path:'documentation/evidence/result-dark.png'});await page.setViewportSize({width:390,height:700});await page.screenshot({path:'documentation/evidence/result-narrow.png'});
});
test('本地保存不回显、内容脚本无密钥访问权、删除后停止请求',async({context,page,extensionId,worker})=>{
  const state:NetworkState={requests:[],collectorUrls:[]};await mockNetwork(context,state);const options=await configure(context,extensionId);await expect(options.locator('#api-key')).toHaveValue('');
  const cdp=await context.newCDPSession(page);const worlds:any[]=[];cdp.on('Runtime.executionContextCreated',event=>worlds.push(event.context));await cdp.send('Runtime.enable');await page.goto('https://x.com/person/status/3');await (await entry(page)).waitFor();
  const isolated=worlds.find(w=>w.name===extensionId || (w.origin==='chrome-extension://'+extensionId&&w.auxData?.isDefault===false));expect(isolated).toBeTruthy();
  const access=await cdp.send('Runtime.evaluate',{contextId:isolated.id,expression:'chrome.storage.local.get(null).then(v=>({allowed:true,keys:Object.keys(v)})).catch(()=>({allowed:false}))',awaitPromise:true,returnByValue:true});expect(access.result.value).toEqual({allowed:false});
  await options.getByRole('button',{name:'删除',exact:true}).click();await expect(options.getByText('尚未配置模型',{exact:true})).toBeVisible();await (await entry(page)).click();await expect(page.getByText('请先在扩展设置中保存模型连接和密钥。')).toBeVisible();expect(state.requests).toHaveLength(0);expect(await worker.evaluate(async()=>(await (globalThis as any).chrome.storage.local.get('profiles')).profiles.length)).toBe(0);
});

test('后台重启不会丢失待补充文字，也不自动调用模型',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{...result.evidence[0],sourceId:'9',quote:'are you serious'}]}};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/9');await (await entry(page,'9')).click();await expect(page.getByText('还缺一些上下文')).toBeVisible();await page.getByText('手动补充或缩减文字').click();await page.getByLabel('补充直接父帖').fill('A serious question about nice try.');
  const cdp=await context.newCDPSession(page);const targets=await cdp.send('Target.getTargets');const sw=targets.targetInfos.find(t=>t.type==='service_worker'&&t.url.startsWith('chrome-extension://'+extensionId));expect(sw).toBeTruthy();await cdp.send('Target.closeTarget',{targetId:sw!.targetId});
  await expect(page.getByLabel('补充直接父帖')).toHaveValue('A serious question about nice try.');expect(state.requests).toHaveLength(0);await page.getByRole('button',{name:'用这些内容分析'}).click();await expect(page.getByText(result.summary)).toBeVisible();expect(state.requests).toHaveLength(1);
});
test('超长输入先拒绝，用户缩减后才调用模型',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{...result.evidence[0],sourceId:'manual-current',quote:'nice try'}]}};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/10');await (await entry(page,'10')).click();await expect(page.getByText('上下文超过 12,000 字符，请缩减相关文字后分析。')).toBeVisible();expect(state.requests).toHaveLength(0);await page.getByText('手动补充或缩减文字').click();await page.getByLabel('补充当前回复').fill('Hahaha))) nice try');await page.getByRole('button',{name:'用这些内容分析'}).click();await expect(page.getByText(result.summary)).toBeVisible();expect(state.requests).toHaveLength(1);
});

test('纯 emoji 回复也有入口并保留原文依据',async({context,page,extensionId})=>{
  const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{...result.evidence[0],sourceId:'11',quote:'😂😂'}]}};
  await mockNetwork(context,state);await configure(context,extensionId);await page.goto('https://x.com/person/status/11');await (await entry(page,'11')).click();await expect(page.getByText(result.summary)).toBeVisible();expect(JSON.parse(state.requests[0].messages[1].content).sources.find((s:any)=>s.id==='11').text).toBe('😂😂');
});
