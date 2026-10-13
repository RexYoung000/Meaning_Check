import { describe, it, expect } from 'vitest';
import { validateResult } from '../src/analysis/validate';
import { bundleOf } from '../src/analysis/context';
import { reply, root, result } from './fixtures/posts';
const bundle = bundleOf(reply,root,root);
describe('结构与依据校验', () => {
  it('接受完整的结论及可回看的引用',()=>expect(validateResult(JSON.stringify(result),bundle).summary).toBe(result.summary));
  it.each(['{broken','{}','[]','null'])('拒绝损坏或错误 JSON %s',text=>expect(()=>validateResult(text,bundle)).toThrow());
  it('拒绝引用未发送的来源',()=>expect(()=>validateResult(JSON.stringify({...result,evidence:[{...result.evidence[0],sourceId:'profile'}]}),bundle)).toThrow());
  it('拒绝不存在的引用',()=>expect(()=>validateResult(JSON.stringify({...result,evidence:[{...result.evidence[0],quote:'you are evil'}]}),bundle)).toThrow());
  it('不接受拼接省略的引文',()=>expect(()=>validateResult(JSON.stringify({...result,evidence:[{...result.evidence[0],quote:'Haha ... try'}]}),bundle)).toThrow());
  it('不接受置信数字或其他多余字段',()=>expect(()=>validateResult(JSON.stringify({...result,confidence:0.99}),bundle)).toThrow());
  it('最少一条、最多两条依据',()=>{expect(()=>validateResult(JSON.stringify({...result,evidence:[]}),bundle)).toThrow();expect(()=>validateResult(JSON.stringify({...result,evidence:[...result.evidence,...result.evidence,...result.evidence]}),bundle)).toThrow();});
  it('只规范空白，不改写原文',()=>expect(validateResult(JSON.stringify({...result,evidence:[{sourceId:'1',quote:'Gemini like me Lets connect',explanation:'邀请他人联系'}]}),bundle).evidence).toHaveLength(1));
  it('需要上下文也是有契约的结果',()=>expect(validateResult(JSON.stringify({...result,status:'needs_context',summary:'还缺父帖，无法确认主方向。'}),bundle).status).toBe('needs_context'));
});
