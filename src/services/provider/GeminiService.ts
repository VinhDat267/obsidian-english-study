import { BaseProvider } from "./BaseProvider";

export interface GeminiTestResult {
  ok: boolean;
  error?: string;
}

export class GeminiService extends BaseProvider {
  /**
   * Phân tích từ/câu theo ngữ cảnh bằng Gemini API:
   * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
   * Model mặc định: 'gemini-flash-latest' (tự động cập nhật bản Flash mới nhất của Google)
   *
   * Hỗ trợ tự động map model gemini-2.0-flash / gemini-2.5-flash sang gemini-flash-latest để tránh 404 Not Found.
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
    if (!cleanKey) {
      return null;
    }

    const cleanTarget = targetText ? targetText.trim() : "";
    if (!cleanTarget) {
      return null;
    }

    const cleanContext = contextSentence ? contextSentence.trim() : "";

    // Phân giải linh hoạt sourceLang và model
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

    // Auto-upgrade deprecated models to prevent 404
    if (selectedModel === "gemini-2.0-flash" || selectedModel === "gemini-2.5-flash") {
      selectedModel = "gemini-flash-latest";
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
   * Kiểm tra kết nối chi tiết với Gemini API và trả về mã/thông báo lỗi cụ thể nếu thất bại.
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
   * Kiểm tra kết nối API Key hợp lệ:
   * Gửi 1 prompt ngắn 'Hi' để xác nhận HTTP 200.
   */
  async testConnection(apiKey: string): Promise<boolean> {
    const res = await this.testConnectionDetailed(apiKey);
    return res.ok;
  }
}
