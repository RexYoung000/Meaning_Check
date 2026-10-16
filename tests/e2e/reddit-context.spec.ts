import {test,expect} from './fixtures';
import {configure,mockNetwork,type NetworkState} from './pages';
import {result} from '../fixtures/posts';

// The native root uses id, not thingid, as observed on the two live Reddit
// pages. Mocked content/API here test collection; live quality is separate.
for(const nested of [false,true])test(`Reddit 新版${nested?'多层回复':'直接回复主题帖'}一键读取完整范围，只发送三个角色`,async({context,page,extensionId})=>{
 const root='<shreddit-post id="t3_abc" post-type="text" post-title="The topic" permalink="/r/test/comments/abc/the_topic/"><div slot="text-body">Root public text</div></shreddit-post>';
 const current=`<shreddit-comment thingid="t1_def" ${nested?'depth="2"':'depth="0"'} postid="t3_abc" permalink="/r/test/comments/abc/comment/def/"><div slot="comment">oh sweet summer child</div></shreddit-comment>`;
 const chain=nested?'<shreddit-comment thingid="t1_middle" depth="0" postid="t3_abc" permalink="/r/test/comments/abc/comment/middle/"><div slot="comment">Intermediate excluded</div><shreddit-comment thingid="t1_parent" depth="1" postid="t3_abc" permalink="/r/test/comments/abc/comment/parent/"><div slot="comment">Direct public parent</div>'+current+'</shreddit-comment></shreddit-comment>':current;
 const body='<!doctype html><meta charset="utf-8"><style>body{font:16px/1.5 sans-serif}shreddit-post,shreddit-comment{display:block;padding:12px;max-width:650px}</style>'+root+chain+'<shreddit-comment thingid="t1_other" parentid="t3_abc" permalink="/r/test/comments/abc/comment/other/"><div slot="comment">Other branch excluded</div></shreddit-comment><textarea>Draft excluded</textarea>';
 const state:NetworkState={requests:[],collectorUrls:[],reply:{...result,evidence:[{sourceId:'t1_def',quote:'oh sweet summer child',explanation:'The wording teases naive confidence.'}]}};
 await mockNetwork(context,state);
 await context.route('https://www.reddit.com/**',async route=>{if(new URL(route.request().url()).searchParams.has('mc-collector'))state.collectorUrls.push(route.request().url());await route.fulfill({contentType:'text/html',body});});
 await configure(context,extensionId);await page.goto('https://www.reddit.com/r/test/comments/abc/comment/def/');
 await page.locator('shreddit-comment[thingid="t1_def"]').getByRole('button',{name:'帮我意图识别',exact:true}).click();
 await expect(page.getByText(result.summary,{exact:true})).toBeVisible();
 expect(state.requests).toHaveLength(1);expect(state.collectorUrls).toHaveLength(0);
 const sent=JSON.parse(state.requests[0].messages[1].content);
 expect(sent.roles).toEqual({current:'t1_def',parent:nested?'t1_parent':'t3_abc',root:'t3_abc'});
 expect(sent.missing).toEqual([]);expect(sent.sources).toHaveLength(nested?3:2);
 const texts=sent.sources.map((s:{text:string})=>s.text);expect(texts).toContain('The topic\nRoot public text');
 if(nested)expect(texts).toContain('Direct public parent');
 expect(JSON.stringify(sent)).not.toMatch(/Intermediate excluded|Other branch excluded|Draft excluded/);
 await page.getByText('原文和背景',{exact:true}).click();await expect(page.locator('.source-text').filter({hasText:'The topic\nRoot public text'})).toBeVisible();
});
