import { MarkdownBlock, BilingualTranslationOptions, BilingualProgressMeta } from "../../types";
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
      const batchSize = Math.max(1, options.batchSize || 8);
      const chunks: number[][] = [];
      for (let i = 0; i < translatableIndices.length; i += batchSize) {
        chunks.push(translatableIndices.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        if (options.signal?.aborted) {
          throw new Error("Translation aborted by user");
        }

        const items = chunk.map((blockIdx, localIdx) => ({
          id: localIdx,
          text: targetBlocks[blockIdx].translatableText!,
        }));

        let resultMap: Map<number, string> | null = null;
        if (options.apiKey) {
          try {
            resultMap = await this.geminiService.translateBatch(
              items,
              options.apiKey,
              options.docContext,
              options.targetLang || "vi",
              options.customModel
            );
          } catch {
            resultMap = null;
          }
        }

        for (let localIdx = 0; localIdx < chunk.length; localIdx++) {
          const blockIdx = chunk[localIdx];
          const block = targetBlocks[blockIdx];
          const translated = resultMap?.get(localIdx);

          if (translated) {
            block.translatedText = translated;
          } else {
            // Tự phục hồi: Giữ nguyên văn bản gốc nếu không dịch được
            block.translatedText = block.translatableText;
          }

          completed++;
          reportProgress(block.translatableText || "");
        }

        if (delay > 0) {
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    } else {
      // Mặc định: Google Translate engine
      for (const idx of translatableIndices) {
        if (options.signal?.aborted) {
          throw new Error("Translation aborted by user");
        }

        const block = targetBlocks[idx];
        const textToTranslate = block.translatableText!;

        try {
          const res = await this.googleTranslate.translate(
            textToTranslate,
            options.targetLang || "vi",
            options.customEndpointUrl
          );
          block.translatedText = res || textToTranslate;
        } catch {
          // Phục hồi khi lỗi: Giữ text gốc
          block.translatedText = textToTranslate;
        }

        completed++;
        reportProgress(textToTranslate);

        if (delay > 0) {
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }

    return targetBlocks;
  }
}
