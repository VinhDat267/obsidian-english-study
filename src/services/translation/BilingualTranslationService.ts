import { MarkdownBlock, BilingualTranslationOptions } from "../../types";
import { GoogleTranslate } from "../provider/GoogleTranslate";
import { GeminiService } from "../provider/GeminiService";

export class BilingualTranslationService {
  private googleTranslate: GoogleTranslate;
  private geminiService: GeminiService;

  constructor(googleTranslate?: GoogleTranslate, geminiService?: GeminiService) {
    this.googleTranslate = googleTranslate || new GoogleTranslate();
    this.geminiService = geminiService || new GeminiService();
  }

  /**
   * Dịch các khối nội dung Markdown theo tiến trình hàng đợi
   */
  async translateBlocks(
    blocks: MarkdownBlock[],
    options: BilingualTranslationOptions
  ): Promise<MarkdownBlock[]> {
    const throwIfCancelled = () => {
      if (options.signal?.aborted) {
        throw new Error("Translation aborted by user");
      }
    };
    throwIfCancelled();
    const targetBlocks = blocks.map((b) => ({ ...b }));
    const translatableIndices: number[] = [];

    for (let i = 0; i < targetBlocks.length; i++) {
      if (!targetBlocks[i].skipTranslation && targetBlocks[i].translatableText?.trim()) {
        translatableIndices.push(i);
      }
    }

    const totalTranslatable = translatableIndices.length;
    if (totalTranslatable === 0) {
      if (options.onProgress) {
        options.onProgress({
          current: targetBlocks.length,
          total: targetBlocks.length,
          percent: 100,
          currentText: "Hoàn tất (Không có khối cần dịch)",
        });
      }
      throwIfCancelled();
      return targetBlocks;
    }

    let completed = 0;
    const delay = options.delayMs !== undefined ? options.delayMs : 50;

    const reportProgress = (currentText: string) => {
      if (options.onProgress) {
        const percent = Math.min(100, Math.round((completed / totalTranslatable) * 100));
        options.onProgress({
          current: completed,
          total: totalTranslatable,
          percent,
          currentText,
        });
      }
    };

    if (options.engine === "gemini") {
      if (!options.apiKey?.trim()) {
        throw new Error("Gemini API key is required. Configure it and retry the file translation.");
      }
      const batchSize = Math.max(1, options.batchSize || 8);
      const chunks: number[][] = [];
      for (let i = 0; i < translatableIndices.length; i += batchSize) {
        chunks.push(translatableIndices.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        throwIfCancelled();

        const items = chunk.map((blockIdx, localIdx) => ({
          id: localIdx,
          text: targetBlocks[blockIdx].translatableText!,
        }));

        let resultMap: Map<number, string> | null = null;
        try {
          resultMap = await this.geminiService.translateBatch(
            items,
            options.apiKey,
            options.docContext,
            options.targetLang || "vi",
            options.customModel,
            options.sourceLang || "auto"
          );
        } catch {
          throwIfCancelled();
          throw new Error(`Gemini translation failed for blocks ${chunk[0] + 1}-${chunk[chunk.length - 1] + 1}. Check your API key and connection, then retry the file translation.`);
        }
        throwIfCancelled();

        for (let localIdx = 0; localIdx < chunk.length; localIdx++) {
          throwIfCancelled();
          const blockIdx = chunk[localIdx];
          const block = targetBlocks[blockIdx];
          const translated = resultMap?.get(localIdx);

          if (typeof translated !== "string" || !translated.trim()) {
            throw new Error(`Gemini returned no translation for block ${blockIdx + 1}. Check your API key and connection, then retry the file translation.`);
          }
          block.translatedText = translated;

          completed++;
          reportProgress(block.translatableText || "");
          throwIfCancelled();
        }

        if (delay > 0) {
          await new Promise((res) => setTimeout(res, delay));
          throwIfCancelled();
        }
      }
    } else {
      // Mặc định: Google Translate engine
      for (const idx of translatableIndices) {
        throwIfCancelled();

        const block = targetBlocks[idx];
        const textToTranslate = block.translatableText!;

        let translated: string | undefined;
        try {
          const res = await this.googleTranslate.translateWithMeta(
            textToTranslate,
            options.sourceLang || "auto",
            options.targetLang || "vi",
            options.customEndpointUrl
          );
          translated = res?.translation;
        } catch {
          throwIfCancelled();
          throw new Error(`Google translation failed for block ${idx + 1}. Check your connection and retry the file translation.`);
        }
        throwIfCancelled();
        if (typeof translated !== "string" || !translated.trim()) {
          throw new Error(`Google returned no translation for block ${idx + 1}. Check your connection and retry the file translation.`);
        }
        block.translatedText = translated;

        completed++;
        reportProgress(textToTranslate);
        throwIfCancelled();

        if (delay > 0) {
          await new Promise((res) => setTimeout(res, delay));
          throwIfCancelled();
        }
      }
    }

    throwIfCancelled();
    return targetBlocks;
  }
}
