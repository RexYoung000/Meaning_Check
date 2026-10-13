import type { Post } from '../../src/shared/types';
export function post(id = '3', text = 'Hahaha))) nice try'): Post { return { id, url: 'https://x.com/person/status/' + id, text, hasMedia: false, truncated: false, origin: 'x' }; }
export const root = post('1', 'If you hate Gemini like me\n\nLets connect');
export const parent = post('2', 'I am trying something different.');
export const reply = post('3');
export const result = { status: 'ready', summary: '这句更像带笑的质疑：哈哈，这招我看出来了。', tone: '调侃，略带怀疑', function: '质疑对方的尝试', evidence: [{ sourceId: '3', quote: 'nice try', explanation: '接在笑声后，更像识破尝试的调侃。' }], uncertainty: '不能仅凭这句话断定对方怀有敌意。' };
