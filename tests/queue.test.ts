import {describe,it,expect,vi} from 'vitest';
import {AnalysisQueue} from '../src/analysis/queue';

describe('解读并发与取消',()=>{
  it('两条占满后第三条等待，释放后按点击顺序执行',async()=>{
    const queue=new AnalysisQueue(2),signal=new AbortController().signal;
    const first=await queue.acquire(signal,vi.fn()),second=await queue.acquire(signal,vi.fn());
    const p3=vi.fn(),p4=vi.fn();let thirdStarted=false,fourthStarted=false;
    const third=queue.acquire(signal,p3).then(release=>{thirdStarted=true;return release;});
    const fourth=queue.acquire(signal,p4).then(release=>{fourthStarted=true;return release;});
    await Promise.resolve();expect(thirdStarted).toBe(false);expect(fourthStarted).toBe(false);
    expect(p3).toHaveBeenLastCalledWith(1);expect(p4).toHaveBeenLastCalledWith(2);
    first();const endThird=await third;expect(fourthStarted).toBe(false);expect(p4).toHaveBeenLastCalledWith(1);
    second();const endFourth=await fourth;endThird();endFourth();
  });
  it('取消排队项不会占用槽位或执行，后续位置立即更新',async()=>{
    const queue=new AnalysisQueue(1),signal=new AbortController().signal;
    const first=await queue.acquire(signal,vi.fn()),cancel=new AbortController(),position=vi.fn();
    const discarded=queue.acquire(cancel.signal,vi.fn());const rejected=expect(discarded).rejects.toMatchObject({name:'AbortError'});
    const next=queue.acquire(signal,position);cancel.abort();await rejected;
    expect(position).toHaveBeenLastCalledWith(1);first();(await next)();
  });
  it('已取消的请求不能开始；活动项须完成清理才释放，重复释放不会越过上限',async()=>{
    const queue=new AnalysisQueue(1),cancel=new AbortController();cancel.abort();
    await expect(queue.acquire(cancel.signal,vi.fn())).rejects.toMatchObject({name:'AbortError'});
    const active=new AbortController(),end=await queue.acquire(active.signal,vi.fn());let started=false;
    const waiting=queue.acquire(new AbortController().signal,vi.fn()).then(release=>{started=true;return release;});
    active.abort();await Promise.resolve();expect(started).toBe(false);end();end();const endWaiting=await waiting;
    let extraStarted=false;const extra=queue.acquire(new AbortController().signal,vi.fn()).then(release=>{extraStarted=true;return release;});
    await Promise.resolve();expect(extraStarted).toBe(false);endWaiting();(await extra)();
  });
});
