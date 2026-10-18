import { BaseProvider } from "./BaseProvider";
import { DocumentContextMeta } from "../../types";

export interface GeminiTestResult {
  ok: boolean;
  error?: string;
}

export class GeminiService extends BaseProvider {
  /**
   * Helper build context hint từ DocumentContextMeta
   */
  private buildContextHint(docContext?: DocumentContextMeta): string {
    if (!docContext) return "";
    const parts: string[] = [];
    const title = docContext.noteTitle || docContext.fileTitle;
    if (title) {
      parts.push(`Chủ đề tài liệu: "${title}".`);
    }
    const heading = docContext.heading || docContext.headingContext;
    if (heading) {
      parts.push(`Mục/tiêu đề: "${heading}".`);
    }
    if (docContext.tags && docContext.tags.length > 0) {
      parts.push(`Lĩnh vực/Tags: ${docContext.tags.join(", ")}.`);
    }
    return parts.join(" ");
  }

  /**
   * 1. DỊCH NGHĨA CHUYÊN NGÀNH THEO NGỮ CẢNH (AI Contextual Translation):
   * Chỉ dịch nghĩa câu/từ chuẩn xác theo chuyên môn của tài liệu, trả về DUY NHẤT 1 câu dịch nghĩa.
   * Tuyệt đối không phân tích ngữ pháp.
   */
  async translateContext(
    targetText: string,
    contextSentence: string,
    apiKey: string,
    docContext?: DocumentContextMeta,
    sourceLang?: string,
    targetLang: string = "vi"
  ): Promise<string | null> {
    const cleanKey = apiKey ? apiKey.trim() : "";
    if (!cleanKey) return null;

    const cleanTarget = targetText ? targetText.trim() : "";
    if (!cleanTarget) return null;

    const cleanContext = contextSentence ? contextSentence.trim() : "";
    const contextHint = this.buildContextHint(docContext);
    const langTargetName = targetLang === "en" ? "tiếng Anh" : "tiếng Việt";

    const isMultilineOrChoice =
      cleanTarget.includes("\n") ||
      /(?:^|[\s\n])(?:\([A-Da-d]\)|\[[A-Da-d]\]|[A-Da-d][.)])\s+/.test(cleanTarget);

    const formatRequirement = isMultilineOrChoice
      ? `- Giữ nguyên cấu trúc các dòng và các lựa chọn đáp án (A, B, C, D... hoặc 1, 2, 3...) tương ứng như văn bản gốc, mỗi lựa chọn trên một dòng riêng biệt, không gộp chung vào một đoạn.`
      : `- Trả về DUY NHẤT một câu dịch nghĩa bằng ${langTargetName} súc tích, tự nhiên.`;

    const prompt = `${contextHint ? `${contextHint}\n` : ""}Bạn là một dịch giả chuyên gia am hiểu sâu sắc lĩnh vực trên. Hãy dịch nghĩa chính xác của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}".
Yêu cầu:
- Sử dụng đúng thuật ngữ chuyên môn của tài liệu (nếu có).
${formatRequirement}
- Tuyệt đối không giải thích ngữ pháp, không thêm lời chào hay từ ngữ rườm rà.`;

    return this.callGeminiApi(prompt, cleanKey);
  }

  /**
   * 2. PHÂN TÍCH NGỮ PHÁP AI (AI Grammar Analysis):
   * Chỉ phân tích cấu trúc ngữ pháp, từ loại, thành ngữ.
   * Tối đa 2 gạch đầu dòng, dưới 40 từ. Tuyệt đối không lặp lại giải thích nghĩa.
   */
  async analyzeGrammar(
    targetText: string,
    contextSentence: string,
    apiKey: string,
    docContext?: DocumentContextMeta,
    sourceLang?: string,
    targetLang: string = "vi"
  ): Promise<string | null> {
    const cleanKey = apiKey ? apiKey.trim() : "";
    if (!cleanKey) return null;

    const cleanTarget = targetText ? targetText.trim() : "";
    if (!cleanTarget) return null;

    const cleanContext = contextSentence ? contextSentence.trim() : "";
    const contextHint = this.buildContextHint(docContext);
    const langTargetName = targetLang === "en" ? "tiếng Anh" : "tiếng Việt";

    const prompt = `${contextHint ? `${contextHint}\n` : ""}Bạn là chuyên gia ngôn ngữ học. Hãy phân tích cấu trúc ngữ pháp và từ loại của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}".
Yêu cầu:
- Tối đa 2 gạch đầu dòng (bắt đầu bằng dấu •).
- Tổng độ dài dưới 40 từ bằng ${langTargetName}.
- Chỉ chỉ ra cấu trúc ngữ pháp hoặc thành ngữ cốt lõi, từ loại, giới từ đi kèm.
- Tuyệt đối KHÔNG lặp lại giải thích nghĩa của từ, không thêm lời chào kết bài.`;

    return this.callGeminiApi(prompt, cleanKey);
  }

  /**
   * 3. DỊCH HÀNG LOẠT (BATCH TRANSLATION) CHO TÀI LIỆU SONG NGỮ
   * Gom cụm nhiều đoạn văn bản trong 1 prompt để tối ưu quota 15 RPM
   */
  async translateBatch(
    items: Array<{ id: number; text: string }>,
    apiKey: string,
    docContext?: DocumentContextMeta,
    targetLang: string = "vi",
    model: string = "gemini-flash-latest",
    sourceLang: string = "auto"
  ): Promise<Map<number, string> | null> {
    const cleanKey = apiKey ? apiKey.trim() : "";
    if (!cleanKey || items.length === 0) return null;

    const contextHint = this.buildContextHint(docContext);
    const languages: Record<string, string> = { vi: "tiếng Việt", en: "tiếng Anh", zh: "tiếng Trung", ja: "tiếng Nhật" };
    const langTargetName = languages[targetLang] || ("ngôn ngữ có mã " + targetLang);

    const prompt = `${contextHint ? `${contextHint}\n` : ""}Bạn là một dịch giả chuyên gia. Hãy dịch từng đoạn văn bản sau sang ${langTargetName} một cách tự nhiên, chính xác và giữ đúng ngữ cảnh chuyên môn của tài liệu.
Đầu vào là mảng JSON:
${JSON.stringify(items, null, 2)}

Yêu cầu BẮT BUỘC:
- Nguồn: ${sourceLang}. Đích: ${targetLang}.
- Giữ nguyên chính xác mọi token có dạng ⟦PG…⟧; không sửa, thêm hoặc bỏ token.
- Giữ nguyên các dòng và ký hiệu lựa chọn trắc nghiệm, mỗi lựa chọn trên một dòng.
- Trả về DUY NHẤT một mảng JSON hợp lệ chứa id và bản dịch tương ứng theo cấu trúc:
[
  {"id": 0, "translation": "..."},
  ...
]
- Không thêm bất kỳ văn bản giải thích, tiền tố hoặc markdown fence ngoài mảng JSON.`;

    const responseText = await this.callGeminiApi(prompt, cleanKey, model);
    if (!responseText) return null;

    try {
      let cleanJson = responseText.trim();
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
      }
      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed)) {
        const resultMap = new Map<number, string>();
        for (const item of parsed) {
          if (item && typeof item.id === "number" && typeof item.translation === "string") {
            resultMap.set(item.id, item.translation.trim());
          }
        }
        return resultMap;
      }
    } catch {
      // JSON parse failed
    }
    return null;
  }

  /**
   * Gọi API Gemini với prompt và key
   */
  private async callGeminiApi(
    prompt: string,
    cleanKey: string,
    model: string = "gemini-flash-latest"
  ): Promise<string | null> {
    let selectedModel = model;
    if (selectedModel === "gemini-2.0-flash" || selectedModel === "gemini-2.5-flash") {
      selectedModel = "gemini-flash-latest";
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    try {
      const res = await this.executeRequest(
        url,
        {
          method: "POST",
          contentType: "application/json",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
          }),
        },
        10000
      );

      if (!res || res.status !== 200) {
        return null;
      }

      let data = res.json;
      if (!data && res.text) {
        try {
          data = JSON.parse(res.text);
        } catch {
          return null;
        }
      }

      const parts = data?.candidates?.[0]?.content?.parts;
      if (Array.isArray(parts) && parts.length > 0) {
        const text = parts.map((p: any) => p?.text || "").join("").trim();
        return text || null;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Phân tích từ/câu theo ngữ cảnh bằng Gemini API (tương thích ngược)
   */
  async analyzeContext(
    targetText: string,
    contextSentence: string,
    apiKey: string,
    sourceLangOrModel?: string,
    targetLang: string = "vi",
    customModel?: string
  ): Promise<string | null> {
    const cleanKey = apiKey ? apiKey.trim() : "";
    if (!cleanKey) return null;

    const cleanTarget = targetText ? targetText.trim() : "";
    if (!cleanTarget) return null;

    const cleanContext = contextSentence ? contextSentence.trim() : "";

    let sourceLang: string | undefined = sourceLangOrModel;
    let selectedModel = customModel || "gemini-flash-latest";

    if (
      sourceLangOrModel &&
      (sourceLangOrModel.startsWith("gemini-") ||
        sourceLangOrModel.includes("/") ||
        sourceLangOrModel.includes("pro"))
    ) {
      selectedModel = sourceLangOrModel;
      sourceLang = undefined;
    }

    let prompt: string;
    const langTargetName = targetLang === "en" ? "tiếng Anh" : "tiếng Việt";
    if (sourceLang === "ja") {
      prompt = `Bạn là chuyên gia tiếng Nhật. Hãy giải thích ngắn gọn (1-3 câu) nghĩa của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}". Chỉ ra cách đọc Furigana/Romaji, Hán tự Kanji (nếu có) và ngữ pháp liên quan bằng ${langTargetName}.`;
    } else if (sourceLang === "zh") {
      prompt = `Bạn là chuyên gia tiếng Trung. Hãy giải thích ngắn gọn (1-3 câu) nghĩa của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}". Chỉ ra phiên âm Pinyin, từ loại và ngữ pháp liên quan bằng ${langTargetName}.`;
    } else if (sourceLang === "ko") {
      prompt = `Bạn là chuyên gia tiếng Hàn. Hãy giải thích ngắn gọn (1-3 câu) nghĩa của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}". Chỉ ra cách đọc Romaja, kính ngữ hoặc ngữ pháp liên quan bằng ${langTargetName}.`;
    } else {
      prompt = `Bạn là một chuyên gia ngôn ngữ học. Hãy giải thích ngắn gọn (1-3 câu) nghĩa của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}". Chỉ ra cấu trúc ngữ pháp đặc biệt hoặc thành ngữ liên quan (nếu có) bằng ${langTargetName}.`;
    }

    return this.callGeminiApi(prompt, cleanKey, selectedModel);
  }

  /**
   * Kiểm tra kết nối chi tiết với Gemini API
   */
  async testConnectionDetailed(apiKey: string): Promise<GeminiTestResult> {
    const cleanKey = apiKey ? apiKey.trim() : "";
    if (!cleanKey) {
      return { ok: false, error: "API Key đang để trống." };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(cleanKey)}`;

    try {
      const res = await this.executeRequest(
        url,
        {
          method: "POST",
          contentType: "application/json",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: "Hi" }],
              },
            ],
          }),
        },
        10000
      );

      if (!res) {
        return { ok: false, error: "Quá thời gian kết nối (Timeout sau 10s) hoặc mạng bị gián đoạn." };
      }

      if (res.status === 200) {
        return { ok: true };
      }

      let errorMsg = `Mã lỗi HTTP ${res.status}`;
      try {
        const data = typeof res.json === "object" ? res.json : JSON.parse(res.text || "{}");
        if (data?.error?.message) {
          errorMsg += `: ${data.error.message}`;
        }
      } catch {}

      return { ok: false, error: errorMsg };
    } catch (err: any) {
      return { ok: false, error: err?.message || "Lỗi không xác định khi gọi API." };
    }
  }

  /**
   * Kiểm tra kết nối API Key hợp lệ (boolean)
   */
  async testConnection(apiKey: string): Promise<boolean> {
    const res = await this.testConnectionDetailed(apiKey);
    return res.ok;
  }
}
