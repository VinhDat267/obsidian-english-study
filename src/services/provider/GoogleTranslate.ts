import { BaseProvider } from "./BaseProvider";

export interface GoogleTranslationMeta {
  translation: string;
  detectedLang: string;
  transliteration?: string;
}

export class GoogleTranslate extends BaseProvider {
  /**
   * Dịch đoạn text và bóc tách đầy đủ metadata (ngôn ngữ phát hiện, phiên âm Romaji/Pinyin)
   */
  async translateWithMeta(
    text: string,
    sourceLang: string = "auto",
    targetLang: string = "vi",
    customEndpointUrl?: string
  ): Promise<GoogleTranslationMeta | null> {
    const cleanText = text ? text.trim() : "";
    if (!cleanText) {
      return null;
    }

    const sl = sourceLang || "auto";
    const tl = targetLang || "vi";
    const encodedText = encodeURIComponent(cleanText);

    // 1. Chuẩn bị primary URL với dt=t và dt=rm (romanization / pinyin)
    const base = (customEndpointUrl && customEndpointUrl.trim()) || "https://translate.googleapis.com";
    const cleanBase = base.replace(/\/+$/, "");

    let primaryUrl: string;
    if (cleanBase.includes("/translate_a/single")) {
      const separator = cleanBase.includes("?") ? "&" : "?";
      primaryUrl = `${cleanBase}${separator}client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dt=rm&q=${encodedText}`;
    } else {
      primaryUrl = `${cleanBase}/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dt=rm&q=${encodedText}`;
    }

    // 2. Thử gọi Primary Endpoint
    const primaryRes = await this.executeRequest(primaryUrl);
    if (primaryRes && primaryRes.status === 200) {
      const data = this.extractJson(primaryRes);
      const parsed = this.parseGoogleResponseWithMeta(data, sl);
      if (parsed !== null) {
        return parsed;
      }
    }

    // 3. Fallback Mirror (lingva.ml) nếu primary gặp 429 hoặc lỗi
    const mirrorUrl = `https://lingva.ml/api/v1/${encodeURIComponent(sl)}/${encodeURIComponent(tl)}/${encodedText}`;
    const mirrorRes = await this.executeRequest(mirrorUrl);

    if (mirrorRes && mirrorRes.status === 200) {
      const mirrorData = this.extractJson(mirrorRes);
      if (mirrorData && typeof mirrorData.translation === "string") {
        return {
          translation: mirrorData.translation,
          detectedLang: mirrorData.info?.detectedSource || (sl !== "auto" ? sl : "en"),
          transliteration: mirrorData.info?.pronunciation?.query,
        };
      }
    }

    // 4. Cả 2 đều thất bại
    return null;
  }

  /**
   * Phương thức dịch tương thích ngược (trả về chuỗi kết quả)
   */
  async translate(
    text: string,
    targetLang: string = "vi",
    customEndpointUrl?: string
  ): Promise<string | null> {
    const meta = await this.translateWithMeta(text, "auto", targetLang, customEndpointUrl);
    return meta ? meta.translation : null;
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

  private parseGoogleResponseWithMeta(data: any, fallbackLang: string): GoogleTranslationMeta | null {
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const chunks = data[0]
        .filter((chunk: any) => Array.isArray(chunk) && typeof chunk[0] === "string")
        .map((chunk: any) => chunk[0]);

      if (chunks.length > 0) {
        const translation = chunks.join("");
        let transliteration: string | undefined;

        // Tìm romanization trong data[0]: chunk có chunk[0] === null và chunk[2] / chunk[3] là string
        for (const chunk of data[0]) {
          if (Array.isArray(chunk)) {
            if (chunk[0] === null && (typeof chunk[2] === "string" || typeof chunk[3] === "string")) {
              transliteration = (chunk[3] || chunk[2]).trim() || undefined;
              break;
            }
          }
        }

        // Hoặc ở chunk[0][3]
        if (!transliteration && Array.isArray(data[0][0]) && typeof data[0][0][3] === "string") {
          transliteration = data[0][0][3].trim() || undefined;
        }

        // detected language ở data[2]
        let detectedLang = fallbackLang !== "auto" ? fallbackLang : "en";
        if (typeof data[2] === "string" && data[2].trim()) {
          detectedLang = data[2].trim();
        }

        return {
          translation,
          detectedLang,
          transliteration,
        };
      }
    }
    return null;
  }
}
