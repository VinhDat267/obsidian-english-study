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
  private static nextCacheNamespace = 0;
  private freeDict: FreeDictService;
  private googleTranslate: GoogleTranslate;
  private geminiService: GeminiService;
  private cache: LRUCache<LookupResult>;
  private activeController: AbortController | null = null;
  private settings: PluginSettings;
  private readonly cacheNamespace = ProviderManager.nextCacheNamespace++;
  private credentialIdentity = "";
  private credentialEpoch = 0;

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
    const providerSettings: Array<keyof PluginSettings> = [
      "sourceLanguage", "targetLanguage", "translateEndpointUrl", "preferredAccent",
      "geminiApiKey", "enableAiTranslation", "enableAiGrammar",
    ];
    if (providerSettings.some(key => key in settings && settings[key] !== this.settings[key])) {
      this.cancelPending();
      this.cache.clear();
    }
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
   * Lấy instance GeminiService
   */
  getGeminiService(): GeminiService {
    return this.geminiService;
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

  private snapshotDocContext(docContext?: DocumentContextMeta): DocumentContextMeta | undefined {
    if (!docContext) return undefined;
    return { ...docContext, ...(docContext.tags ? { tags: [...docContext.tags] } : {}) };
  }

  private snapshotResult(result: LookupResult): LookupResult {
    return {
      ...result,
      ...(result.definitions ? { definitions: result.definitions.map(definition => ({ ...definition })) } : {}),
      docContext: this.snapshotDocContext(result.docContext),
    };
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
    docContext?: DocumentContextMeta | { docContext?: DocumentContextMeta; onAiUpdate?: (result: LookupResult) => void },
    onAiUpdate?: (result: LookupResult) => void
  ): Promise<LookupResult> {
    this.cancelPending();

    // Hỗ trợ cả 2 cách gọi:
    // 1. Chuẩn: lookup(text, raw, offset, settings, docContext, onAiUpdate)
    // 2. Options wrapper: lookup(text, raw, offset, settings, { docContext, onAiUpdate })
    let effectiveDocContext: DocumentContextMeta | undefined;
    let effectiveOnAiUpdate = onAiUpdate;

    if (docContext) {
      if (
        "onAiUpdate" in (docContext as any) ||
        ("docContext" in (docContext as any) && Object.keys(docContext).length <= 2)
      ) {
        const wrapper = docContext as {
          docContext?: DocumentContextMeta;
          onAiUpdate?: (result: LookupResult) => void;
        };
        effectiveDocContext = wrapper.docContext;
        if (!effectiveOnAiUpdate && typeof wrapper.onAiUpdate === "function") {
          effectiveOnAiUpdate = wrapper.onAiUpdate;
        }
      } else {
        effectiveDocContext = docContext as DocumentContextMeta;
      }
    }
    effectiveDocContext = this.snapshotDocContext(effectiveDocContext);

    const controller = new AbortController();
    this.activeController = controller;

    const effectiveSettings: PluginSettings = {
      ...this.settings,
      ...settings,
    };

    const sourceLang = effectiveSettings.sourceLanguage || "auto";
    const targetLang = effectiveSettings.targetLanguage || "vi";
    const credentialIdentity = effectiveSettings.geminiApiKey.trim();
    if (credentialIdentity !== this.credentialIdentity) {
      this.credentialIdentity = credentialIdentity;
      this.credentialEpoch++;
      this.cache.clear();
    }

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
        docContext: effectiveDocContext,
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
    // Credentials stay private; only their invalidation epoch enters cache keys.
    // Both context forms matter: the raw form is displayed, the clean form feeds AI.
    const cacheKey = JSON.stringify([
      this.cacheNamespace, this.credentialEpoch, cleanText, sourceLang, targetLang,
      contextSentence, contextSentenceClean, Boolean(effectiveDocContext),
      effectiveDocContext?.noteTitle, effectiveDocContext?.fileTitle, effectiveDocContext?.folderPath,
      effectiveDocContext?.heading, effectiveDocContext?.headingContext, effectiveDocContext?.tags,
      effectiveSettings.translateEndpointUrl, effectiveSettings.preferredAccent,
      effectiveSettings.enableAiTranslation, effectiveSettings.enableAiGrammar,
      Boolean(effectiveOnAiUpdate),
    ]);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...this.snapshotResult(cached), timestamp: Date.now() };
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
        if (dictSettled.value.word.trim().toLowerCase() === cleanText.toLowerCase()) {
          phonetic = dictSettled.value.phonetic;
          audioUrl = dictSettled.value.audioUrl;
        }
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
      if (!effectiveOnAiUpdate && needsAiGrammar && !needsAiTranslation) {
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

    if (controller.signal.aborted) {
      throw new DOMException("The lookup operation was aborted", "AbortError");
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
      docContext: effectiveDocContext,
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
            effectiveDocContext,
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
          if (!effectiveOnAiUpdate && !needsAiTranslation && type === "sentence" && result.aiGrammarNote) {
            // Already populated above in legacy sentence branch
            return;
          }

          const aiGrammar = await this.geminiService.analyzeGrammar(
            cleanText,
            contextSentenceClean,
            effectiveSettings.geminiApiKey,
            effectiveDocContext,
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
            if (controller.signal.aborted) return;
            if (legacyRes) result.aiGrammarNote = legacyRes;
          }
        }
      } finally {
        result.aiLoading = false;
        if (!controller.signal.aborted) {
          this.cache.set(cacheKey, this.snapshotResult(result));
          if (effectiveOnAiUpdate) {
            effectiveOnAiUpdate(this.snapshotResult(result));
          }
        }
      }
    };

    if (hasAnyAi) {
      if (effectiveOnAiUpdate) {
        // Chế độ Progressive: trả về base result ngay lập tức, chạy AI ngầm
        executeAi();
        return this.snapshotResult(result);
      } else {
        // Chế độ cổ điển/test: chờ AI hoàn thành trước khi trả về
        await executeAi();
        if (controller.signal.aborted) {
          throw new DOMException("The lookup operation was aborted", "AbortError");
        }
        return this.snapshotResult(result);
      }
    }

    this.cache.set(cacheKey, this.snapshotResult(result));
    return this.snapshotResult(result);
  }
}
