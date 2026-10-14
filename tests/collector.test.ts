import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake=vi.hoisted(()=>({store:{} as Record<string,any>,tabs:{create:vi.fn(),update:vi.fn(),get:vi.fn(),remove:vi.fn(),sendMessage:vi.fn()},session:{get:vi.fn(),set:vi.fn(),remove:vi.fn()}}));
vi.mock('wxt/browser',()=>({browser:{tabs:fake.tabs,storage:{session:fake.session}}}));
import { Collector,cleanupOrphans } from '../src/x/collector';
import { post } from './fixtures/posts';
beforeEach(()=>{
  vi.useRealTimers();vi.clearAllMocks();fake.store={};
  fake.session.get.mockImplementation(async (key:string)=>({[key]:fake.store[key]}));
  fake.session.set.mockImplementation(async(value:any)=>{Object.assign(fake.store,value);});
  fake.session.remove.mockImplementation(async(key:string)=>{delete fake.store[key];});
  fake.tabs.create.mockResolvedValue({id:12});fake.tabs.update.mockResolvedValue({id:12});fake.tabs.get.mockResolvedValue({url:'https://x.com/person/status/1?mc-collector=token'});fake.tabs.remove.mockResolvedValue(undefined);
  fake.tabs.sendMessage.mockResolvedValue({current:post('1'),parentState:'none'});
});
describe('临时页 ownership 与清理',()=>{
  it('等待稳定正文，只开一个非活动页，登记后导航',async()=>{
    vi.useFakeTimers();const collector=new Collector('token');const task=collector.read(post('1').url,new AbortController().signal);await vi.advanceTimersByTimeAsync(1001);await expect(task).resolves.toMatchObject({parentState:'none'});expect(fake.tabs.create).toHaveBeenCalledWith({url:'about:blank',active:false});expect(fake.tabs.update).toHaveBeenCalledWith(12,{url:'https://x.com/person/status/1?mc-collector=token',active:false});expect(fake.store.collectorTabs[0]).toMatchObject({id:12,token:'token'});await collector.close();expect(fake.tabs.remove).toHaveBeenCalledWith(12);expect(fake.store.collectorTabs).toEqual([]);vi.useRealTimers();
  });
  it('重启只关闭带同一标记的自建页，保留用户已导航的页',async()=>{
    fake.store.collectorTabs=[{id:12,token:'token',expires:0},{id:13,token:'other',expires:0}];fake.tabs.get.mockImplementation(async(id:number)=>({url:id===12?'https://x.com/person/status/1?mc-collector=token':'https://x.com/person/status/55'}));await cleanupOrphans();expect(fake.tabs.remove).toHaveBeenCalledTimes(1);expect(fake.tabs.remove).toHaveBeenCalledWith(12);expect(fake.store.collectorTabs).toBeUndefined();
  });
  it('无法读取已导航外站的 URL 时不删除',async()=>{fake.store.collectorTabs=[{id:12,token:'token',expires:0,pending:false}];fake.tabs.get.mockResolvedValue({});await cleanupOrphans();expect(fake.tabs.remove).not.toHaveBeenCalled();});
  it('取消创建中的任务仍清理登记的页',async()=>{
    const controller=new AbortController();fake.tabs.create.mockImplementation(async()=>{controller.abort();return {id:12};});fake.tabs.get.mockResolvedValue({url:'about:blank'});const collector=new Collector('token');await expect(collector.read(post('1').url,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(fake.tabs.remove).toHaveBeenCalledWith(12);expect(fake.store.collectorTabs).toEqual([]);expect(fake.tabs.update).not.toHaveBeenCalled();
  });
  it('导航尚未提交时通过 pendingUrl 清理，避免暂停遗留空白页',async()=>{fake.store.collectorTabs=[{id:12,token:'token',expires:0,pending:false}];fake.tabs.get.mockResolvedValue({url:'about:blank',pendingUrl:'https://x.com/person/status/1?mc-collector=token'});await cleanupOrphans();expect(fake.tabs.remove).toHaveBeenCalledWith(12);});
  it('用户已有新的待提交导航时保留页面，即使旧 URL 仍带插件标记',async()=>{fake.store.collectorTabs=[{id:12,token:'token',expires:0,pending:false}];fake.tabs.get.mockResolvedValue({url:'https://x.com/person/status/1?mc-collector=token',pendingUrl:'https://x.com/person/status/55'});await cleanupOrphans();expect(fake.tabs.remove).not.toHaveBeenCalled();});
  it('会话记录不包含帖子正文或模型结果',async()=>{
    vi.useFakeTimers();const collector=new Collector('token');const task=collector.read(post('1').url,new AbortController().signal);await vi.advanceTimersByTimeAsync(1001);await task;expect(Object.keys(fake.store.collectorTabs[0]).sort()).toEqual(['expires','id','pending','token']);await collector.close();vi.useRealTimers();
  });
});
