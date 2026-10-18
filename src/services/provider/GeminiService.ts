import { BaseProvider } from "./BaseProvider";

export class GeminiService extends BaseProvider {
  /**
   * Phân tích từ/câu theo ngữ cảnh bằng Gemini API:
   * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}
   * Model mặc định: 'gemini-2.0-flash'
   * 
   * Prompt: Yêu cầu AI đóng vai trò chuyên gia ngôn ngữ, giải thích ngắn gọn (1-3 câu) nghĩa của targetText 
   * trong contextSentence, chỉ ra cấu trúc ngữ pháp đặc biệt hoặc thành ngữ (bằng tiếng Việt).
   * 
   * Trả về text giải thích, hoặc null nếu lỗi/không có API key.
   */
  async analyzeContext(
    targetText: string,
    contextSentence: string,
    apiKey: string,
    model: string = "gemini-2.0-flash"
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
    const selectedModel = model && model.trim() ? model.trim() : "gemini-2.0-flash";

    const prompt = `Bạn là một chuyên gia ngôn ngữ học. Hãy giải thích ngắn gọn (1-3 câu) nghĩa của "${cleanTarget}" trong ngữ cảnh: "${cleanContext}". Chỉ ra cấu trúc ngữ pháp đặc biệt hoặc thành ngữ liên quan (nếu có) bằng tiếng Việt.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

    try {
      const res = await this.executeRequest(url, {
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
      });

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
   * Kiểm tra kết nối API Key hợp lệ:
   * Gửi 1 prompt ngắn 'Hi' để xác nhận HTTP 200.
   */
  async testConnection(apiKey: string): Promise<boolean> {
    const cleanKey = apiKey ? apiKey.trim() : "";
    if (!cleanKey) {
      return false;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(cleanKey)}`;

    try {
      const res = await this.executeRequest(url, {
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
      });

      return !!res && res.status === 200;
    } catch {
      return false;
    }
  }
}
