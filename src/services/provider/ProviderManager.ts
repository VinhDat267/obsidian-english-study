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
import { detectScript } from "../../utils/languageHelper";
import { GoogleTranslate, GoogleTranslationMeta } from "./GoogleTranslate";
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
   * Phân loại 3 mức thích ứng cả ký tự Latin và CJK:
   * - CJK (tiếng Trung, Nhật không có khoảng trắng):
   *   + <= 2 ký tự: 'word'
   *   + 3-6 ký tự: 'phrase'
   *   + > 6 ký tự hoặc có dấu câu (. ! ? 。 ！ ？ …): 'sentence'
   * - Ngôn ngữ có khoảng trắng:
   *   + 1 từ: 'word'
   *   + <= 4 từ: 'phrase'
   *   + > 4 từ hoặc có dấu kết thúc câu: 'sentence'
   */
  classify(cleanText: string): LookupType {
    const trimmed = cleanText ? cleanText.trim() : "";
    if (!trimmed) {
      return "word";
    }

    // Dấu kết thúc câu Latin và CJK (. ! ? 。 ！ ？ …)
    const hasSentencePunctuation = /[.!?。！？…]/.test(trimmed);

    const script = detectScript(trimmed);
    if (script === "ja" || script === "zh") {
      if (hasSentencePunctuation || trimmed.length > 6) {
        return "sentence";
      }
      if (trimmed.length <= 2) {
        return "word";
      }
      return "phrase";
    }

    // Đếm số từ theo khoảng trắng cho các ngôn ngữ có space
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
   * 4. Kiểm tra Cache: cache.get(`${targetLang}:${cleanText.toLowerCase()}`).
   *    - Nếu HIT: cập nhật timestamp và trả về ngay lập tức (0ms).
   * 5. Điều phối 3 mức (3-Tier Execution):
   *    - Mức 'word' / 'phrase':
   *      + Nếu là tiếng Anh: tra cứu FreeDict (phát âm, nghĩa Anh-Anh).
   *      + Nếu là CJK hoặc ngôn ngữ khác: bỏ qua FreeDict, tra cứu Google Translate có lấy metadata (Pinyin/Romaji).
   *      + Nếu bật enableAiGrammar và có geminiApiKey: gọi thêm geminiService.analyzeContext kèm sourceLang & targetLang.
   *    - Mức 'sentence':
   *      + Nếu có geminiApiKey và enableAiGrammar: dịch và phân tích ngữ cảnh qua Gemini.
   *      + Ngược lại: dịch qua GoogleTranslate.
   * 6. Tổng hợp dữ liệu thành LookupResult chuẩn hóa (sourceLang, targetLang, transliteration).
   * 7. Lưu vào cache và trả về.
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

    const effectiveSettings: PluginSettings = { ...this.settings, ...settingsOverride };
    const targetLang = effectiveSettings.targetLanguage || "vi";
    const sourceLang = effectiveSettings.sourceLanguage || "auto";

    // 2. Làm sạch text
    const cleanText = cleanSelection(rawText);
    if (!cleanText) {
      return {
        query: rawText || "",
        type: "word",
        contextSentence: rawContext || "",
        contextSentenceClean: rawContext || "",
        vietnameseTranslation: "",
        sourceLang: sourceLang !== "auto" ? sourceLang : "en",
        targetLang,
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

    // 4. Kiểm tra Cache (cách ly theo targetLang)
    const cacheKey = `${targetLang}:${cleanText.toLowerCase()}`;
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
    const script = detectScript(cleanText);
    const isEnglish = (script === "latin" || script === "other") && (sourceLang === "auto" || sourceLang === "en");

    let phonetic: string | undefined;
    let audioUrl: string | undefined;
    let definitions: DictDefinition[] | undefined;
    let vietnameseTranslation = "";
    let aiGrammarNote: string | undefined;
    let detectedSourceLang: string | undefined = sourceLang !== "auto" ? sourceLang : (isEnglish ? "en" : undefined);
    let transliteration: string | undefined;

    if (type === "word" || type === "phrase") {
      const promises: [
        Promise<FreeDictResult | null>,
        Promise<GoogleTranslationMeta | null>,
        Promise<string | null>
      ] = [
        isEnglish
          ? this.freeDict.lookup(cleanText, effectiveSettings.preferredAccent)
          : Promise.resolve(null),
        this.googleTranslate.translateWithMeta(
          cleanText,
          sourceLang,
          targetLang,
          effectiveSettings.translateEndpointUrl
        ),
        effectiveSettings.enableAiGrammar && effectiveSettings.geminiApiKey
          ? this.geminiService.analyzeContext(
              cleanText,
              contextSentenceClean,
              effectiveSettings.geminiApiKey,
              detectedSourceLang || "auto",
              targetLang
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
        vietnameseTranslation = gtSettled.value.translation;
        if (gtSettled.value.detectedLang) {
          detectedSourceLang = gtSettled.value.detectedLang;
        }
        if (gtSettled.value.transliteration) {
          transliteration = gtSettled.value.transliteration;
        }
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
          effectiveSettings.geminiApiKey,
          sourceLang,
          targetLang
        );
        if (controller.signal.aborted) {
          throw new DOMException("The lookup operation was aborted", "AbortError");
        }
        if (geminiRes) {
          vietnameseTranslation = geminiRes;
          aiGrammarNote = geminiRes;
          if (!detectedSourceLang) {
            detectedSourceLang = script !== "latin" && script !== "other" ? script : "en";
          }
        } else {
          // Fallback sang Google Translate nếu Gemini thất bại
          const gtMeta = await this.googleTranslate.translateWithMeta(
            cleanText,
            sourceLang,
            targetLang,
            effectiveSettings.translateEndpointUrl
          );
          if (controller.signal.aborted) {
            throw new DOMException("The lookup operation was aborted", "AbortError");
          }
          if (gtMeta) {
            vietnameseTranslation = gtMeta.translation;
            if (gtMeta.detectedLang) {
              detectedSourceLang = gtMeta.detectedLang;
            }
            if (gtMeta.transliteration) {
              transliteration = gtMeta.transliteration;
            }
          }
        }
      } else {
        const gtMeta = await this.googleTranslate.translateWithMeta(
          cleanText,
          sourceLang,
          targetLang,
          effectiveSettings.translateEndpointUrl
        );
        if (controller.signal.aborted) {
          throw new DOMException("The lookup operation was aborted", "AbortError");
        }
        if (gtMeta) {
          vietnameseTranslation = gtMeta.translation;
          if (gtMeta.detectedLang) {
            detectedSourceLang = gtMeta.detectedLang;
          }
          if (gtMeta.transliteration) {
            transliteration = gtMeta.transliteration;
          }
        }
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
      ...(detectedSourceLang ? { sourceLang: detectedSourceLang } : {}),
      targetLang,
      ...(transliteration ? { transliteration } : {}),
      timestamp: Date.now(),
    };

    // 7. Lưu vào cache và trả về
    this.cache.set(cacheKey, result);
    return result;
  }
}
