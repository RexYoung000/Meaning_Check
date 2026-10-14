import type { AnalysisResponse, ContextBundle, ContextRole, Post, UiLanguage } from '../shared/types';
import { INPUT_LIMIT } from '../shared/constants';
import {t, roleLabel, errorText, type CopyKey} from '../shared/i18n';
import { button, darkTheme, node, safeLink } from './elements';

export interface CardActions { close(): void; retryContext(): void; analyze(manual?: Partial<Record<ContextRole, string>>): void; settings(): void }
export class ResultCard {
  readonly host = node('meaning-check-card');
  private panel = node('section', undefined, 'card');
  private content = node('div', undefined, 'content');
  private root: ShadowRoot;
  private bundle?: ContextBundle;
  constructor(private anchor: HTMLElement, styles: string, private actions: CardActions, private language:UiLanguage = 'zh') {
    this.host.dataset.mcOwned = 'true';
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = node('style', styles);
    const header = node('header', undefined, 'card-header');
    const title = node('h2', this.copy('title'));
    title.id = 'mc-title';
    const close = button('×', () => actions.close(), 'icon-button');
    close.setAttribute('aria-label', this.copy('close'));
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
  private copy(key:CopyKey,...args:(string|number)[]):string{return t(this.language,key,...args);}
  private role(role:ContextRole,bundle:ContextBundle):string{return roleLabel(this.language,role,bundle.mode==='selection');}
  private reset(): void { this.content.replaceChildren(); }
  phase(phase: 'context' | 'analysis'): void {
    this.reset();
    const status = node('p', phase === 'context' ? this.copy('contextPhase') : this.copy('analysisPhase'), 'progress');
    status.setAttribute('role', 'status');
    this.content.append(status, node('p', phase === 'context' ? this.copy('contextHelp') : this.copy('analysisHelp'), 'muted'));
    this.position();
  }
  private coverage(bundle: ContextBundle): void {
    if (bundle.missing.length) this.content.append(node('p', this.copy('missing',bundle.missing.map(r => this.role(r, bundle)).join(this.language==='zh'?'、':' / ')), 'notice'));
    if (bundle.posts.some(p => p.hasMedia)) this.content.append(node('p', this.copy('media'), 'notice'));
    for (const warning of new Set(bundle.warnings)) this.content.append(node('p', this.copy('truncated'), 'notice'));
  }
  private sources(bundle: ContextBundle): void {
    const details = node('details', undefined, 'sources');
    details.append(node('summary', this.copy('sources')));
    for (const post of bundle.posts) {
      const section = node('div', undefined, 'source');
      const labels = (Object.entries(bundle.roles) as [ContextRole, string][]).filter(([, id]) => id === post.id).map(([role]) => this.role(role, bundle)).join(' / ');
      const label = post.origin === 'manual' ? labels + ' · ' + this.copy('manualSource') : labels;
      section.append(post.url ? safeLink(label, post.url) : node('strong', label), node('p', post.text, 'source-text'));
      details.append(section);
    }
    this.content.append(details);
  }
  context(bundle: ContextBundle, reason?: string): void {
    this.bundle = bundle;
    this.reset();
    this.content.append(node('p', bundle.mode==='selection' ? this.copy('selection') : this.copy('needContext'), 'summary-text'), node('p', bundle.mode==='selection' ? this.copy('background') : this.language === 'zh' ? (reason ?? this.copy('contextReason')) : this.copy('contextReason'), 'muted'));
    this.coverage(bundle);
    const row = node('div', undefined, 'actions');
    row.append(button(this.copy('partial'), () => this.actions.analyze(), 'button primary'));
    if(bundle.mode!=='selection')row.append(button(this.copy('retryContext'), () => this.actions.retryContext(), 'button secondary'));
    this.content.append(row);
    this.manual(bundle);
    this.sources(bundle);
    this.position();
  }
  result(bundle: ContextBundle, response: AnalysisResponse): void {
    this.bundle = bundle;
    this.reset();
    if (response.result.status === 'needs_context') this.content.append(node('p', this.copy('needMore'), 'notice'));
    this.content.append(node('p', response.result.summary, 'summary-text'));
    const traits = node('dl', undefined, 'traits');
    for (const [label, value] of [[this.copy('tone'), response.result.tone], [this.copy('function'), response.result.function]]) {
      traits.append(node('dt', label), node('dd', value));
    }
    this.content.append(traits);
    const evidenceTitle = node('h3', this.copy('evidence'));
    this.content.append(evidenceTitle);
    for (const evidence of response.result.evidence) {
      const source = bundle.posts.find(p => p.id === evidence.sourceId)!;
      const labels = (Object.entries(bundle.roles) as [ContextRole, string][]).filter(([, id]) => id === source.id).map(([role]) => this.role(role, bundle)).join(' / ');
      const block = node('div', undefined, 'evidence');
      block.append(node('blockquote', evidence.quote), source.url ? safeLink(labels, source.url) : node('span', labels + ' · ' + this.copy('manualSource'), 'muted'), node('p', evidence.explanation));
      this.content.append(block);
    }
    if (response.result.uncertainty) this.content.append(node('p', response.result.uncertainty, 'uncertainty'));
    this.coverage(bundle);
    this.sources(bundle);
    const meta = node('p', this.copy('elapsed',(response.elapsedMs / 1000).toFixed(1)) + (response.usage ? ' · ' + this.copy('usage',response.usage.totalTokens) : '') + (response.model ? ' · ' + response.model : '') + (response.language ? ' · ' + response.language : ''), 'meta');
    this.content.append(meta);
    if (bundle.mode==='selection' || bundle.missing.length || response.result.status === 'needs_context') this.manual(bundle);
    this.position();
  }
  error(code: string, message: string, bundle?: ContextBundle): void {
    if (bundle) this.bundle = bundle;
    this.reset();
    this.content.append(node('p', this.copy('noResult'), 'summary-text'), node('p', errorText(this.language,code,message), 'error-message'));
    if (code === 'missing-key') this.content.append(button(this.copy('openSettings'), () => this.actions.settings(), 'button primary'));
    else if (this.bundle && code !== 'original-post') {
      if (code !== 'input-limit' && code !== 'truncated-input') this.content.append(button(this.copy('reanalyze'), () => this.actions.analyze(), 'button primary'));
      this.manual(this.bundle);
      this.sources(this.bundle);
    } else if (code !== 'original-post') this.content.append(button(this.copy('retryContext'), () => this.actions.retryContext(), 'button primary'));
    this.position();
  }
  private manual(bundle: ContextBundle): void {
    const details = node('details', undefined, 'manual');
    details.append(node('summary', this.copy('manual')));
    const form = node('form');
    const values = new Map<ContextRole, HTMLTextAreaElement>();
    const original = new Map<ContextRole, string>();
    for (const role of (bundle.mode === 'selection' ? ['current','root'] : ['current','parent','root']) as ContextRole[]) {
      const post = bundle.posts.find(p => p.id === bundle.roles[role]);
      original.set(role, post?.text ?? '');
      const label = node('label', this.role(role, bundle));
      const input = node('textarea');
      input.value = post?.text ?? '';
      input.rows = 3;
      input.maxLength = INPUT_LIMIT;
      input.placeholder = this.copy('paste');
      input.setAttribute('aria-label', this.copy('supplement',this.role(role,bundle)));
      label.append(input);
      values.set(role, input);
      form.append(label);
    }
    const help = node('p', this.copy('manualHelp'), 'muted');
    const error = node('p', undefined, 'error-message');
    error.setAttribute('role', 'status');
    const submit = node('button', this.copy('withText'), 'button primary');
    submit.type = 'submit';
    form.append(help, error, submit);
    let submitFromUser = false;
    submit.addEventListener('click', event => { submitFromUser=event.isTrusted; if(!submitFromUser)event.preventDefault(); setTimeout(()=>{submitFromUser=false;},0); });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if(!submitFromUser)return;submitFromUser=false;
      const manual: Partial<Record<ContextRole, string>> = {};
      for (const [role, input] of values) if (input.value.trim() && input.value.trim() !== original.get(role)?.trim()) manual[role] = input.value.trim();
      const texts = Object.values(bundle.roles).map(id => bundle.posts.find(p => p.id === id)?.text ?? '');
      const total = [...values.entries()].reduce((n, [role, input]) => n + (input.value.trim() || original.get(role) || '').length, 0);
      // The backend also checks de-duplicated sources; never truncate an entered value.
      if (total > INPUT_LIMIT && new Set(texts).size === texts.length) { error.textContent = this.copy('inputLimit'); return; }
      this.actions.analyze(manual);
    });
    details.append(form);
    this.content.append(details);
  }
}
