import {
  LookupResult,
  PluginSettings,
  LookupType,
  DictDefinition,
  DEFAULT_SETTINGS,
} from "../../types";
import { LRUCache } from "../../utils/lruCache";
import { cleanSelection } from "../../utils/textCleaner";
import { extractContextSentence } from "../../utils/textParser";
import { FreeDictService, FreeDictResult } from "./FreeDictService";
import { GoogleTranslate } from "./GoogleTranslate";
import { GeminiService } from "./GeminiService";

export class ProviderManager {
  private freeDict: FreeDictService;
  private googleTranslate: GoogleTranslate;
  private geminiService: GeminiService;
  private cache: LRUCache<LookupResult>;
  private activeController: AbortController | null = null;
  private settings: PluginSettings;

  constructor(settings?: PluginSettings, cache?: LRUCache<LookupResult>) {
    this.settings = settings ? { ...settings } : { ...DEFAULT_SETTINGS };
    this.cache = cache ?? new LRUCache<LookupResult>(200);
    this.freeDict = new FreeDictService(this.settings.preferredAccent);
    this.googleTranslate = new GoogleTranslate();
    this.geminiService = new GeminiService();
  }

  getCache(): LRUCache<LookupResult> {
    return this.cache;
  }

  /**
   * Phân loại 3 mức theo thiết kế spec:
   * - cleanText có 1 từ: 'word'
   * - cleanText có <= 4 từ và không có dấu kết thúc câu (. ! ?): 'phrase'
   * - cleanText > 4 từ hoặc có dấu kết thúc câu: 'sentence'
   */
  classify(cleanText: string): LookupType {
    const trimmed = cleanText ? cleanText.trim() : "";
    if (!trimmed) {
      return "word";
    }

    // Có dấu kết thúc câu (. ! ?)
    const hasSentencePunctuation = /[.!?]/.test(trimmed);

    // Đếm số từ theo khoảng trắng
    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    // cleanText > 4 từ hoặc có dấu kết thúc câu: 'sentence'
    if (wordCount > 4 || hasSentencePunctuation) {
      return "sentence";
    }

    // cleanText có 1 từ: 'word'
    if (wordCount === 1) {
      return "word";
    }

    // cleanText có <= 4 từ và không có dấu kết thúc câu: 'phrase'
    return "phrase";
  }

  /**
   * Hủy bỏ request đang chạy (khi người dùng thao tác mới)
   */
  cancelPending(): void {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
  }

  /**
   * Pipeline tra cứu trung tâm:
   * 1. Hủy request đang chạy trước đó nếu có (activeController?.abort()).
   * 2. Làm sạch text bằng cleanSelection(rawText).
   * 3. Trích xuất câu ngữ cảnh bằng extractContextSentence(rawContext, cleanText, cursorOffset).
   * 4. Kiểm tra Cache: cache.get(cleanText.toLowerCase()).
   *    - Nếu HIT: cập nhật timestamp và trả về ngay lập tức (0ms).
   * 5. Điều phối 3 mức (3-Tier Execution):
   *    - Mức 'word': Gọi song song Promise.allSettled([freeDict.lookup, googleTranslate.translate]).
   *      + Lấy định nghĩa từ điển Anh-Anh + nghĩa tiếng Việt.
   *      + Nếu bật enableAiGrammar và có geminiApiKey: gọi thêm geminiService.analyzeContext.
   *    - Mức 'phrase':
   *      + Ưu tiên tra freeDict.lookup (tìm cụm động từ/thành ngữ).
   *      + Đồng thời gọi googleTranslate.translate.
   *      + Nếu freeDict không có: xem như cụm dịch nghĩa.
   *    - Mức 'sentence':
   *      + Nếu có geminiApiKey và enableAiGrammar: dịch và phân tích ngữ cảnh qua Gemini.
   *      + Ngược lại: dịch qua GoogleTranslate.
   * 6. Tổng hợp dữ liệu thành LookupResult chuẩn hóa.
   * 7. Lưu vào cache.set(cleanText.toLowerCase(), result) và trả về.
   */
  async lookup(
    rawText: string,
    rawContext: string,
    cursorOffset?: number,
    settingsOverride?: PluginSettings
  ): Promise<LookupResult> {
    // 1. Hủy request đang chạy trước đó
    this.cancelPending();
    const controller = new AbortController();
    this.activeController = controller;

    // 2. Làm sạch text
    const cleanText = cleanSelection(rawText);
    if (!cleanText) {
      return {
        query: rawText || "",
        type: "word",
        contextSentence: rawContext || "",
        contextSentenceClean: rawContext || "",
        vietnameseTranslation: "",
        timestamp: Date.now(),
      };
    }

    // 3. Trích xuất câu ngữ cảnh
    const { cleanContext, rawContext: contextSentence } = extractContextSentence(
      rawContext,
      cleanText,
      cursorOffset
    );
    const contextSentenceClean = cleanContext;

    // 4. Kiểm tra Cache
    const cacheKey = cleanText.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      cached.timestamp = Date.now();
      if (rawContext && rawContext.trim()) {
        cached.contextSentence = contextSentence;
        cached.contextSentenceClean = contextSentenceClean;
      }
      return cached;
    }

    // 5. Điều phối 3 mức
    const type = this.classify(cleanText);
    const effectiveSettings: PluginSettings = { ...this.settings, ...settingsOverride };

    let phonetic: string | undefined;
    let audioUrl: string | undefined;
    let definitions: DictDefinition[] | undefined;
    let vietnameseTranslation = "";
    let aiGrammarNote: string | undefined;

    if (type === "word" || type === "phrase") {
      const promises: [
        Promise<FreeDictResult | null>,
        Promise<string | null>,
        Promise<string | null>
      ] = [
        this.freeDict.lookup(cleanText, effectiveSettings.preferredAccent),
        this.googleTranslate.translate(
          cleanText,
          "vi",
          effectiveSettings.translateEndpointUrl
        ),
        effectiveSettings.enableAiGrammar && effectiveSettings.geminiApiKey
          ? this.geminiService.analyzeContext(
              cleanText,
              contextSentenceClean,
              effectiveSettings.geminiApiKey
            )
          : Promise.resolve(null),
      ];

      const [dictSettled, gtSettled, geminiSettled] = await Promise.allSettled(promises);

      if (controller.signal.aborted) {
        throw new DOMException("The lookup operation was aborted", "AbortError");
      }

      if (dictSettled.status === "fulfilled" && dictSettled.value) {
        phonetic = dictSettled.value.phonetic;
        audioUrl = dictSettled.value.audioUrl;
        if (dictSettled.value.definitions && dictSettled.value.definitions.length > 0) {
          definitions = dictSettled.value.definitions;
        }
      }

      if (gtSettled.status === "fulfilled" && gtSettled.value) {
        vietnameseTranslation = gtSettled.value;
      }

      if (geminiSettled.status === "fulfilled" && geminiSettled.value) {
        aiGrammarNote = geminiSettled.value;
      }
    } else {
      // type === "sentence"
      if (effectiveSettings.enableAiGrammar && effectiveSettings.geminiApiKey) {
        const geminiRes = await this.geminiService.analyzeContext(
          cleanText,
          contextSentenceClean,
          effectiveSettings.geminiApiKey
        );
        if (controller.signal.aborted) {
          throw new DOMException("The lookup operation was aborted", "AbortError");
        }
        if (geminiRes) {
          vietnameseTranslation = geminiRes;
          aiGrammarNote = geminiRes;
        } else {
          // Fallback sang Google Translate nếu Gemini thất bại
          const gt = await this.googleTranslate.translate(
            cleanText,
            "vi",
            effectiveSettings.translateEndpointUrl
          );
          if (controller.signal.aborted) {
            throw new DOMException("The lookup operation was aborted", "AbortError");
          }
          vietnameseTranslation = gt || "";
        }
      } else {
        const gt = await this.googleTranslate.translate(
          cleanText,
          "vi",
          effectiveSettings.translateEndpointUrl
        );
        if (controller.signal.aborted) {
          throw new DOMException("The lookup operation was aborted", "AbortError");
        }
        vietnameseTranslation = gt || "";
      }
    }

    if (controller.signal.aborted) {
      throw new DOMException("The lookup operation was aborted", "AbortError");
    }

    // 6. Tổng hợp dữ liệu thành LookupResult chuẩn hóa
    const result: LookupResult = {
      query: cleanText,
      type,
      contextSentence,
      contextSentenceClean,
      ...(phonetic ? { phonetic } : {}),
      ...(audioUrl ? { audioUrl } : {}),
      vietnameseTranslation,
      ...(definitions && definitions.length > 0 ? { definitions } : {}),
      ...(aiGrammarNote ? { aiGrammarNote } : {}),
      timestamp: Date.now(),
    };

    // 7. Lưu vào cache và trả về
    this.cache.set(cacheKey, result);
    return result;
  }
}
