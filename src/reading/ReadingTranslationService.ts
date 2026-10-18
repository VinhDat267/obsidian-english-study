import { GoogleTranslate } from "../services/provider/GoogleTranslate";
import { GeminiService } from "../services/provider/GeminiService";
import { LRUCache } from "../utils/lruCache";
import { formatMultipleChoiceText } from "../utils/textCleaner";
import { hasValidReadingTokens } from "./blockExtractor";
import type { ReadingTranslationConfig, ReadingTranslationJob, ReadingTranslationResult, ReadingTranslationSession } from "./types";

interface SessionState {
  config: ReadingTranslationConfig;
  active: boolean;
  items: Set<Pending>;
}
interface Pending {
  session: SessionState;
  job: ReadingTranslationJob;
  key: string;
  epoch: number;
  settled: boolean;
  resolve: (result: ReadingTranslationResult) => void;
}

export class ReadingTranslationService {
  private google: Pick<GoogleTranslate, "translateWithMeta">;
  private gemini: Pick<GeminiService, "translateBatch">;
  private cache = new LRUCache<string>(200);
  private sessions = new Set<SessionState>();
  private queue: Pending[] = [];
  private activeGoogle = 0;
  private activeGemini = 0;
  private scheduled = false;
  private disposed = false;
  private epoch = 0;

  constructor(providers: { google?: Pick<GoogleTranslate, "translateWithMeta">; gemini?: Pick<GeminiService, "translateBatch"> } = {}) {
    this.google = providers.google ?? new GoogleTranslate();
    this.gemini = providers.gemini ?? new GeminiService();
  }

  createSession(config: ReadingTranslationConfig): ReadingTranslationSession {
    const state: SessionState = { config: { ...config }, active: !this.disposed, items: new Set() };
    if (state.active) this.sessions.add(state);
    return {
      enqueue: job => {
        if (!state.active || this.disposed) return Promise.resolve({ status: "cancelled" });
        if (state.config.engine === "gemini" && !state.config.apiKey.trim()) return Promise.resolve({ status: "error", code: "missing-key" });
        const context = job.context ? { ...job.context, tags: job.context.tags?.slice() } : undefined;
        const snapshot = { ...job, protectedTokens: job.protectedTokens.slice(), context };
        const cfg = state.config;
        const key = JSON.stringify([cfg.engine, cfg.sourceLang, cfg.targetLang, cfg.endpointUrl, cfg.model,
          job.cacheSeed, job.text, cfg.engine === "gemini" ? context : null]);
        const cached = this.cache.get(key);
        if (cached !== undefined) return Promise.resolve({ status: "success", text: cached });
        return new Promise<ReadingTranslationResult>(resolve => {
          const item: Pending = { session: state, job: snapshot, key, epoch: this.epoch, settled: false, resolve };
          state.items.add(item); this.queue.push(item); this.schedule();
        });
      },
      cancel: () => this.cancel(state),
    };
  }

  clearCache(): void { this.epoch++; this.cache.clear(); }

  dispose(): void {
    this.disposed = true;
    for (const state of Array.from(this.sessions)) this.cancel(state);
    this.queue = [];
    this.clearCache();
  }

  private cancel(state: SessionState): void {
    state.active = false;
    for (const item of Array.from(state.items)) this.settle(item, { status: "cancelled" });
    this.sessions.delete(state);
    this.schedule();
  }

  private settle(item: Pending, result: ReadingTranslationResult): void {
    if (item.settled) return;
    item.settled = true;
    item.session.items.delete(item);
    item.resolve(result);
  }

  private schedule(): void {
    if (this.scheduled || this.disposed) return;
    this.scheduled = true;
    void Promise.resolve().then(() => { this.scheduled = false; this.pump(); });
  }

  private pump(): void {
    this.queue = this.queue.filter(item => !item.settled && item.session.active);
    if (this.disposed) return;
    while (this.activeGoogle < 2) {
      const index = this.queue.findIndex(item => item.session.config.engine === "google");
      if (index < 0) break;
      const [item] = this.queue.splice(index, 1);
      this.activeGoogle++;
      void this.runGoogle(item);
    }
    if (this.activeGemini < 1) {
      const first = this.queue.find(item => item.session.config.engine === "gemini");
      if (first) {
        const context = JSON.stringify(first.job.context);
        const batch = this.queue.filter(item => item.session === first.session && JSON.stringify(item.job.context) === context).slice(0, 8);
        const selected = new Set(batch);
        this.queue = this.queue.filter(item => !selected.has(item));
        this.activeGemini++;
        void this.runGemini(batch);
      }
    }
  }

  private complete(item: Pending, text: string | null | undefined): void {
    if (item.settled) return;
    if (!item.session.active || this.disposed) { this.settle(item, { status: "cancelled" }); return; }
    if (typeof text !== "string" || !text.trim()) { this.settle(item, { status: "error", code: "empty" }); return; }
    const choice = /(?:^|\n)\s*(?:[A-Z][.)]|\([A-Z]\))\s/.test(item.job.text);
    const translated = choice ? formatMultipleChoiceText(text.trim()) : text.trim();
    if (!hasValidReadingTokens(translated, item.job.protectedTokens)) {
      this.settle(item, { status: "error", code: "invalid-tokens" }); return;
    }
    if (item.epoch === this.epoch) this.cache.set(item.key, translated);
    this.settle(item, { status: "success", text: translated });
  }

  private async runGoogle(item: Pending): Promise<void> {
    try {
      const cfg = item.session.config;
      const result = await this.google.translateWithMeta(item.job.text, cfg.sourceLang, cfg.targetLang, cfg.endpointUrl);
      this.complete(item, result?.translation);
    } catch {
      this.settle(item, item.session.active ? { status: "error", code: "provider" } : { status: "cancelled" });
    } finally {
      this.activeGoogle--; this.schedule();
    }
  }

  private async runGemini(batch: Pending[]): Promise<void> {
    try {
      const cfg = batch[0].session.config;
      const result = await this.gemini.translateBatch(
        batch.map((item, id) => ({ id, text: item.job.text })), cfg.apiKey,
        batch[0].job.context, cfg.targetLang, cfg.model, cfg.sourceLang
      );
      batch.forEach((item, id) => this.complete(item, result?.get(id)));
    } catch {
      batch.forEach(item => this.settle(item, item.session.active ? { status: "error", code: "provider" } : { status: "cancelled" }));
    } finally {
      this.activeGemini--; this.schedule();
    }
  }
}
