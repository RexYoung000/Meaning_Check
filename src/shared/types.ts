export type ContextRole = 'current' | 'parent' | 'root';
export type MissingRole = 'parent' | 'root';
export interface Post {
  id: string;
  url: string;
  text: string;
  hasMedia: boolean;
  truncated: boolean;
  origin: 'x' | 'manual';
}
export interface ContextBundle {
  roles: { current: string; parent?: string; root?: string };
  posts: Post[];
  missing: MissingRole[];
  warnings: string[];
}
export interface PageSnapshot {
  current: Post;
  parent?: Post;
  parentState: 'known' | 'none' | 'unknown';
}
export interface Evidence { sourceId: string; quote: string; explanation: string }
export interface InterpretationResult {
  status: 'ready' | 'needs_context';
  summary: string;
  tone: string;
  function: string;
  evidence: Evidence[];
  uncertainty?: string;
}
export interface Usage { promptTokens: number; completionTokens: number; totalTokens: number }
export interface AnalysisResponse { result: InterpretationResult; elapsedMs: number; usage?: Usage }
export type ClientCommand =
  | { type: 'start'; post: Post; snapshot?: PageSnapshot }
  | { type: 'retry-context' }
  | { type: 'analyze'; bundle?: ContextBundle; manual?: Partial<Record<ContextRole, string>> }
  | { type: 'heartbeat' }
  | { type: 'cancel' };
export type JobEvent =
  | { type: 'phase'; phase: 'context' | 'analysis' }
  | { type: 'context'; bundle: ContextBundle; reason?: string }
  | { type: 'result'; bundle: ContextBundle; response: AnalysisResponse }
  | { type: 'error'; code: string; message: string; bundle?: ContextBundle };
