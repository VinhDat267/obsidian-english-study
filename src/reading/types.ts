import type { DocumentContextMeta, ReadingEngine } from "../types";

export interface ReadingProtectedFragment { token: string; node: Node }
export interface ReadingBlock {
  id: string;
  kind: "heading" | "paragraph" | "list-item";
  sourceNodes: readonly Node[];
  anchor: { parent: HTMLElement; before: Node | null };
  text: string;
  cacheSeed: string;
  fragments: readonly ReadingProtectedFragment[];
  heading?: string;
}
export interface ReadingTranslationConfig {
  engine: ReadingEngine;
  sourceLang: string;
  targetLang: string;
  endpointUrl: string;
  apiKey: string;
  model: string;
}
export interface ReadingTranslationJob {
  blockId: string;
  text: string;
  cacheSeed: string;
  protectedTokens: readonly string[];
  context?: DocumentContextMeta;
}
export type ReadingTranslationResult =
  | { status: "success"; text: string }
  | { status: "error"; code: "provider" | "empty" | "missing-key" | "invalid-tokens" }
  | { status: "cancelled" };
export interface ReadingTranslationSession {
  enqueue(job: ReadingTranslationJob): Promise<ReadingTranslationResult>;
  cancel(): void;
}
