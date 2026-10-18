import { BaseProvider } from "./BaseProvider";

export class GoogleTranslate extends BaseProvider {
  /**
   * Dịch đoạn text sang ngôn ngữ đích (mặc định targetLang='vi')
   * 1. Endpoint mặc định:
   *    https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={targetLang}&dt=t&q={encodedText}
   * 2. Parse cấu trúc dữ liệu mảng nhiều tầng của Google Translate:
   *    data[0] là danh sách các câu đã dịch: data[0].map(chunk => chunk[0]).join('')
   * 3. Fallback Mirror:
   *    - Nếu status 429 (Rate limit) hoặc endpoint chính lỗi, thử gọi mirror phụ:
   *      https://lingva.ml/api/v1/auto/{targetLang}/{encodedText}
   * 4. Trả về chuỗi đã dịch, hoặc null nếu thất bại.
   */
  async translate(
    text: string,
    targetLang: string = "vi",
    customEndpointUrl?: string
  ): Promise<string | null> {
    const cleanText = text ? text.trim() : "";
    if (!cleanText) {
      return null;
    }

    const lang = targetLang || "vi";
    const encodedText = encodeURIComponent(cleanText);

    // 1. Chuẩn bị primary URL
    const base = (customEndpointUrl && customEndpointUrl.trim()) || "https://translate.googleapis.com";
    const cleanBase = base.replace(/\/+$/, "");

    let primaryUrl: string;
    if (cleanBase.includes("/translate_a/single")) {
      const separator = cleanBase.includes("?") ? "&" : "?";
      primaryUrl = `${cleanBase}${separator}client=gtx&sl=auto&tl=${encodeURIComponent(lang)}&dt=t&q=${encodedText}`;
    } else {
      primaryUrl = `${cleanBase}/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(lang)}&dt=t&q=${encodedText}`;
    }

    // 2. Thử gọi Primary Endpoint
    const primaryRes = await this.executeRequest(primaryUrl);
    if (primaryRes && primaryRes.status === 200) {
      const data = this.extractJson(primaryRes);
      const parsed = this.parseGoogleResponse(data);
      if (parsed !== null) {
        return parsed;
      }
    }

    // 3. Fallback Mirror (lingva.ml) nếu primary gặp 429 hoặc lỗi
    const mirrorUrl = `https://lingva.ml/api/v1/auto/${encodeURIComponent(lang)}/${encodedText}`;
    const mirrorRes = await this.executeRequest(mirrorUrl);

    if (mirrorRes && mirrorRes.status === 200) {
      const mirrorData = this.extractJson(mirrorRes);
      if (mirrorData && typeof mirrorData.translation === "string") {
        return mirrorData.translation;
      }
    }

    // 4. Cả 2 đều thất bại
    return null;
  }

  private extractJson(res: any): any {
    if (!res) return null;
    if (res.json !== undefined && res.json !== null) {
      return res.json;
    }
    if (res.text) {
      try {
        return JSON.parse(res.text);
      } catch {
        return null;
      }
    }
    return null;
  }

  private parseGoogleResponse(data: any): string | null {
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const chunks = data[0]
        .filter((chunk: any) => Array.isArray(chunk) && typeof chunk[0] === "string")
        .map((chunk: any) => chunk[0]);

      if (chunks.length > 0) {
        return chunks.join("");
      }
    }
    return null;
  }
}
