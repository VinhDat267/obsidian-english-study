import {
  LookupResult,
  PluginSettings,
  LookupType,
  DictDefinition,
  DEFAULT_SETTINGS,
  DocumentContextMeta,
} from "../../types";
import { LRUCache } from "../../utils/lruCache";
import { cleanSelection, formatMultipleChoiceText } from "../../utils/textCleaner";
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

  /**
   * Cập nhật runtime settings
   */
  updateSettings(settings: Partial<PluginSettings>): void {
    this.settings = { ...this.settings, ...settings };
    if (settings.preferredAccent) {
      this.freeDict = new FreeDictService(settings.preferredAccent);
    }
  }

  /**
   * Lấy instance cache
   */
  getCache(): LRUCache<LookupResult> {
    return this.cache;
  }

  /**
   * Hủy bỏ request đang chờ (nếu có)
   */
  cancelPending(): void {
    if (this.activeController) {
      this.activeController.abort();
      this.activeController = null;
    }
  }

  /**
   * Phân loại văn bản:
   * - Có dấu kết thúc câu (. ! ? 。 ！ ？ …) hoặc > 4 từ -> sentence
   * - CJK: <= 2 ký tự -> word; 3-6 ký tự -> phrase; > 6 ký tự -> sentence
   * - 1 từ -> word; 2-4 từ -> phrase
   */
  classify(text: string): LookupType {
    const trimmed = text.trim();
    if (!trimmed) {
      return "word";
    }

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

    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;

    if (wordCount > 4 || hasSentencePunctuation) {
      return "sentence";
    }

    if (wordCount === 1) {
      return "word";
    }

    return "phrase";
  }

  /**
   * Phương thức điều phối tra cứu chính:
   * Hỗ trợ Progressive Loading khi có onAiUpdate:
   * - Giai đoạn 1 (tức thì ~200ms): Trả về kết quả từ điển / Google Translate ngay lập tức.
   * - Giai đoạn 2 (chạy ngầm): Gọi Gemini AI dịch chuyên ngành và phân tích ngữ pháp, gọi onAiUpdate khi xong.
   */
  async lookup(
    text: string,
    rawContext: string,
    cursorOffset: number = 0,
    settings?: Partial<PluginSettings>,
    docContext?: DocumentContextMeta,
    onAiUpdate?: (result: LookupResult) => void
  ): Promise<LookupResult> {
    this.cancelPending();

    const controller = new AbortController();
    this.activeController = controller;

    const effectiveSettings: PluginSettings = {
      ...this.settings,
      ...settings,
    };

    const sourceLang = effectiveSettings.sourceLanguage || "auto";
    const targetLang = effectiveSettings.targetLanguage || "vi";

    // 1. Làm sạch văn bản
    const cleanText = cleanSelection(text);
    if (!cleanText) {
      return {
        query: "",
        type: "word",
        contextSentence: "",
        contextSentenceClean: "",
        vietnameseTranslation: "",
        timestamp: Date.now(),
        sourceLang,
        targetLang,
        docContext,
      };
    }

    // 2. Trích xuất câu ngữ cảnh
    const { cleanContext, rawContext: contextSentence } = extractContextSentence(
      rawContext,
      cleanText,
      cursorOffset
    );
    const contextSentenceClean = cleanContext;

    // 3. Kiểm tra Cache
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

    // 4. Phân loại và nhận diện ngôn ngữ
    const type = this.classify(cleanText);
    const script = detectScript(cleanText);
    const isEnglish = (script === "latin" || script === "other") && (sourceLang === "auto" || sourceLang === "en");

    let phonetic: string | undefined;
    let audioUrl: string | undefined;
    let definitions: DictDefinition[] | undefined;
    let vietnameseTranslation = "";
    let aiGrammarNote: string | undefined;
    let aiTranslation: string | undefined;
    let detectedSourceLang: string | undefined = sourceLang !== "auto" ? sourceLang : (isEnglish ? "en" : undefined);
    let transliteration: string | undefined;

    const hasAiApiKey = Boolean(effectiveSettings.geminiApiKey && effectiveSettings.geminiApiKey.trim());
    const needsAiTranslation = Boolean(effectiveSettings.enableAiTranslation && hasAiApiKey);
    const needsAiGrammar = Boolean(effectiveSettings.enableAiGrammar && hasAiApiKey);
    const hasAnyAi = needsAiTranslation || needsAiGrammar;

    if (type === "word" || type === "phrase") {
      const [dictSettled, gtSettled] = await Promise.allSettled([
        isEnglish
          ? this.freeDict.lookup(cleanText, effectiveSettings.preferredAccent)
          : Promise.resolve(null),
        this.googleTranslate.translateWithMeta(
          cleanText,
          sourceLang,
          targetLang,
          effectiveSettings.translateEndpointUrl
        ),
      ]);

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
        vietnameseTranslation = formatMultipleChoiceText(gtSettled.value.translation);
        if (gtSettled.value.detectedLang) {
          detectedSourceLang = gtSettled.value.detectedLang;
        }
        if (gtSettled.value.transliteration) {
          transliteration = gtSettled.value.transliteration;
        }
      }
    } else {
      // type === "sentence"
      if (!onAiUpdate && needsAiGrammar && !needsAiTranslation) {
        // Classic / legacy sentence mode: call analyzeContext directly (1 request)
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
          vietnameseTranslation = formatMultipleChoiceText(geminiRes);
          aiGrammarNote = geminiRes;
          if (!detectedSourceLang) {
            detectedSourceLang = script !== "latin" && script !== "other" ? script : "en";
          }
        } else {
          const gtMeta = await this.googleTranslate.translateWithMeta(
            cleanText,
            sourceLang,
            targetLang,
            effectiveSettings.translateEndpointUrl
          );
          if (gtMeta) {
            vietnameseTranslation = formatMultipleChoiceText(gtMeta.translation);
            if (gtMeta.detectedLang) detectedSourceLang = gtMeta.detectedLang;
            if (gtMeta.transliteration) transliteration = gtMeta.transliteration;
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
          vietnameseTranslation = formatMultipleChoiceText(gtMeta.translation);
          if (gtMeta.detectedLang) {
            detectedSourceLang = gtMeta.detectedLang;
          }
          if (gtMeta.transliteration) {
            transliteration = gtMeta.transliteration;
          }
        }
      }
    }

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
      docContext,
      aiLoading: hasAnyAi,
    };

    // Hàm thực thi AI (Dịch nghĩa chuyên ngành & Ngữ pháp)
    const executeAi = async (): Promise<void> => {
      try {
        if (needsAiTranslation) {
          const aiTrans = await this.geminiService.translateContext(
            cleanText,
            contextSentenceClean,
            effectiveSettings.geminiApiKey,
            docContext,
            detectedSourceLang || sourceLang,
            targetLang
          );
          if (controller.signal.aborted) return;
          if (aiTrans) {
            const formattedAiTrans = formatMultipleChoiceText(aiTrans);
            result.aiTranslation = formattedAiTrans;
            result.vietnameseTranslation = formattedAiTrans;
          }
        }

        if (needsAiGrammar) {
          if (!onAiUpdate && !needsAiTranslation && type === "sentence" && result.aiGrammarNote) {
            // Already populated above in legacy sentence branch
            return;
          }

          const aiGrammar = await this.geminiService.analyzeGrammar(
            cleanText,
            contextSentenceClean,
            effectiveSettings.geminiApiKey,
            docContext,
            detectedSourceLang || sourceLang,
            targetLang
          );
          if (controller.signal.aborted) return;
          if (aiGrammar) {
            result.aiGrammarNote = aiGrammar;
          } else if (!needsAiTranslation) {
            // fallback nếu analyzeGrammar null
            const legacyRes = await this.geminiService.analyzeContext(
              cleanText,
              contextSentenceClean,
              effectiveSettings.geminiApiKey,
              detectedSourceLang || "auto",
              targetLang
            );
            if (legacyRes) result.aiGrammarNote = legacyRes;
          }
        }
      } finally {
        result.aiLoading = false;
        if (!controller.signal.aborted) {
          this.cache.set(cacheKey, result);
          if (onAiUpdate) {
            onAiUpdate(result);
          }
        }
      }
    };

    if (hasAnyAi) {
      if (onAiUpdate) {
        // Chế độ Progressive: trả về base result ngay lập tức, chạy AI ngầm
        executeAi();
        return result;
      } else {
        // Chế độ cổ điển/test: chờ AI hoàn thành trước khi trả về
        await executeAi();
        return result;
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }
}
