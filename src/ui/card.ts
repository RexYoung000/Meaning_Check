import type { AnalysisResponse, ContextBundle, ContextRole, Post } from '../shared/types';
import { INPUT_LIMIT, ROLE_LABELS } from '../shared/constants';
import { button, darkTheme, node, safeLink } from './elements';

export interface CardActions { close(): void; retryContext(): void; analyze(manual?: Partial<Record<ContextRole, string>>): void; settings(): void }
export class ResultCard {
  readonly host = node('meaning-check-card');
  private panel = node('section', undefined, 'card');
  private content = node('div', undefined, 'content');
  private root: ShadowRoot;
  private bundle?: ContextBundle;
  constructor(private anchor: HTMLElement, styles: string, private actions: CardActions) {
    this.host.dataset.mcOwned = 'true';
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = node('style', styles);
    const header = node('header', undefined, 'card-header');
    const title = node('h2', '确认这条回复');
    title.id = 'mc-title';
    const close = button('×', () => actions.close(), 'icon-button');
    close.setAttribute('aria-label', '关闭解读');
    header.append(title, close);
    this.content.setAttribute('aria-live', 'polite');
    this.content.setAttribute('aria-atomic', 'false');
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'false');
    this.panel.setAttribute('aria-labelledby', title.id);
    this.panel.append(header, this.content);
    this.root.append(style, this.panel);
    this.host.addEventListener('click', event => event.stopPropagation());
    document.body.append(this.host);
    this.position();
    close.focus({ preventScroll: true });
  }
  position(): void {
    this.host.dataset.theme = darkTheme() ? 'dark' : 'light';
    const rect = this.anchor.getBoundingClientRect();
    const width = Math.max(1, Math.min(360, window.innerWidth - 24));
    this.panel.style.width = width + 'px';
    this.panel.style.maxHeight = Math.max(1, window.innerHeight - 24) + 'px';
    const height = Math.min(this.panel.offsetHeight, window.innerHeight - 24);
    const left = rect.right + 12 + width <= window.innerWidth - 12 ? rect.right + 12 : Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const beside = rect.right + 12 + width <= window.innerWidth - 12;
    const preferredTop = beside ? rect.top : rect.bottom + 8;
    const top = Math.max(12, Math.min(preferredTop, window.innerHeight - height - 12));
    this.host.style.left = left + 'px';
    this.host.style.top = top + 'px';
  }
  remove(): void { this.host.remove(); }
  private reset(): void { this.content.replaceChildren(); }
  phase(phase: 'context' | 'analysis'): void {
    this.reset();
    const status = node('p', phase === 'context' ? '正在补齐上下文…' : '正在分析意思…', 'progress');
    status.setAttribute('role', 'status');
    this.content.append(status, node('p', phase === 'context' ? '读取当前回复、直接父帖和原帖。' : '结合原文判断语气和表达，再检查引用依据。', 'muted'));
    this.position();
  }
  private coverage(bundle: ContextBundle): void {
    if (bundle.missing.length) this.content.append(node('p', '未取得' + bundle.missing.map(r => ROLE_LABELS[r]).join('、') + '，这次解读仅依据现有内容。', 'notice'));
    if (bundle.posts.some(p => p.hasMedia)) this.content.append(node('p', '这次仅分析文字，未读取图片或 GIF 的内容。', 'notice'));
    for (const warning of new Set(bundle.warnings)) this.content.append(node('p', warning, 'notice'));
  }
  private sources(bundle: ContextBundle): void {
    const details = node('details', undefined, 'sources');
    details.append(node('summary', '查看使用的上下文'));
    for (const post of bundle.posts) {
      const section = node('div', undefined, 'source');
      const labels = (Object.entries(bundle.roles) as [ContextRole, string][]).filter(([, id]) => id === post.id).map(([role]) => ROLE_LABELS[role]).join(' / ');
      const label = post.origin === 'manual' ? labels + ' · 你补充的文字' : labels;
      section.append(post.url ? safeLink(label, post.url) : node('strong', label), node('p', post.text, 'source-text'));
      details.append(section);
    }
    this.content.append(details);
  }
  context(bundle: ContextBundle, reason?: string): void {
    this.bundle = bundle;
    this.reset();
    this.content.append(node('p', '还缺一些上下文', 'summary-text'), node('p', reason ?? '没有取得足够的完整文字。', 'muted'));
    this.coverage(bundle);
    const row = node('div', undefined, 'actions');
    row.append(button('用现有内容分析', () => this.actions.analyze(), 'button primary'), button('重试补齐', () => this.actions.retryContext(), 'button secondary'));
    this.content.append(row);
    this.manual(bundle);
    this.sources(bundle);
    this.position();
  }
  result(bundle: ContextBundle, response: AnalysisResponse): void {
    this.bundle = bundle;
    this.reset();
    if (response.result.status === 'needs_context') this.content.append(node('p', '需要更多上下文', 'notice'));
    this.content.append(node('p', response.result.summary, 'summary-text'));
    const traits = node('dl', undefined, 'traits');
    for (const [label, value] of [['语气', response.result.tone], ['在做什么', response.result.function]]) {
      traits.append(node('dt', label), node('dd', value));
    }
    this.content.append(traits);
    const evidenceTitle = node('h3', '判断依据');
    this.content.append(evidenceTitle);
    for (const evidence of response.result.evidence) {
      const source = bundle.posts.find(p => p.id === evidence.sourceId)!;
      const labels = (Object.entries(bundle.roles) as [ContextRole, string][]).filter(([, id]) => id === source.id).map(([role]) => ROLE_LABELS[role]).join(' / ');
      const block = node('div', undefined, 'evidence');
      block.append(node('blockquote', evidence.quote), source.url ? safeLink(labels, source.url) : node('span', labels + ' · 你补充的文字', 'muted'), node('p', evidence.explanation));
      this.content.append(block);
    }
    if (response.result.uncertainty) this.content.append(node('p', response.result.uncertainty, 'uncertainty'));
    this.coverage(bundle);
    this.sources(bundle);
    const meta = node('p', '耗时 ' + (response.elapsedMs / 1000).toFixed(1) + ' 秒' + (response.usage ? ' · 用量 ' + response.usage.totalTokens + ' token' : ''), 'meta');
    this.content.append(meta);
    if (bundle.missing.length || response.result.status === 'needs_context') this.manual(bundle);
    this.position();
  }
  error(code: string, message: string, bundle?: ContextBundle): void {
    if (bundle) this.bundle = bundle;
    this.reset();
    this.content.append(node('p', '这次还没有解读结果', 'summary-text'), node('p', message, 'error-message'));
    if (code === 'missing-key') this.content.append(button('打开扩展设置', () => this.actions.settings(), 'button primary'));
    else if (this.bundle && code !== 'original-post') {
      if (code !== 'input-limit' && code !== 'truncated-input') this.content.append(button('重新分析', () => this.actions.analyze(), 'button primary'));
      this.manual(this.bundle);
      this.sources(this.bundle);
    } else if (code !== 'original-post') this.content.append(button('重试补齐', () => this.actions.retryContext(), 'button primary'));
    this.position();
  }
  private manual(bundle: ContextBundle): void {
    const details = node('details', undefined, 'manual');
    details.append(node('summary', '手动补充或缩减文字'));
    const form = node('form');
    const values = new Map<ContextRole, HTMLTextAreaElement>();
    const original = new Map<ContextRole, string>();
    for (const role of ['current', 'parent', 'root'] as const) {
      const post = bundle.posts.find(p => p.id === bundle.roles[role]);
      original.set(role, post?.text ?? '');
      const label = node('label', ROLE_LABELS[role]);
      const input = node('textarea');
      input.value = post?.text ?? '';
      input.rows = 3;
      input.maxLength = INPUT_LIMIT;
      input.placeholder = '粘贴与这条回复相关的文字';
      input.setAttribute('aria-label', '补充' + ROLE_LABELS[role]);
      label.append(input);
      values.set(role, input);
      form.append(label);
    }
    const help = node('p', '修改后的内容会标为「你补充的文字」。留空保留现有内容。', 'muted');
    const error = node('p', undefined, 'error-message');
    error.setAttribute('role', 'status');
    const submit = node('button', '用这些内容分析', 'button primary');
    submit.type = 'submit';
    form.append(help, error, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const manual: Partial<Record<ContextRole, string>> = {};
      for (const [role, input] of values) if (input.value.trim() && input.value.trim() !== original.get(role)?.trim()) manual[role] = input.value.trim();
      const texts = Object.values(bundle.roles).map(id => bundle.posts.find(p => p.id === id)?.text ?? '');
      const total = [...values.entries()].reduce((n, [role, input]) => n + (input.value.trim() || original.get(role) || '').length, 0);
      // The backend also checks de-duplicated sources; never truncate an entered value.
      if (total > INPUT_LIMIT && new Set(texts).size === texts.length) { error.textContent = '总文字超过 12,000 字符，请再缩减一些。'; return; }
      this.actions.analyze(manual);
    });
    details.append(form);
    this.content.append(details);
  }
}
