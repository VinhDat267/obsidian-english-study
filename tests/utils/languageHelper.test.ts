import { describe, it, expect } from "vitest";
import {
  detectScript,
  getLanguageMeta,
  SUPPORTED_LANGUAGES,
  LanguageMeta,
} from "../../src/utils/languageHelper";

describe("languageHelper", () => {
  describe("detectScript()", () => {
    it("should detect Japanese for Hiragana and Katakana", () => {
      expect(detectScript("こんにちは")).toBe("ja");
      expect(detectScript("カタカナ")).toBe("ja");
      expect(detectScript("日本語を勉強します")).toBe("ja");
      expect(detectScript("ありがとう")).toBe("ja");
    });

    it("should detect Chinese for Hanzi without Japanese Kana", () => {
      expect(detectScript("你好世界")).toBe("zh");
      expect(detectScript("中国")).toBe("zh");
      expect(detectScript("今天天气很好")).toBe("zh");
      expect(detectScript("普通话")).toBe("zh");
    });

    it("should detect Korean for Hangul syllables and jamo", () => {
      expect(detectScript("안녕하세요")).toBe("ko");
      expect(detectScript("한국어")).toBe("ko");
      expect(detectScript("감사합니다")).toBe("ko");
    });

    it("should detect Cyrillic for Russian and Slavic text", () => {
      expect(detectScript("Привет")).toBe("ru");
      expect(detectScript("Здравствуйте")).toBe("ru");
      expect(detectScript("хорошо")).toBe("ru");
    });

    it("should detect Latin for English, French, German, Spanish text", () => {
      expect(detectScript("serendipity")).toBe("latin");
      expect(detectScript("Bonjour le monde")).toBe("latin");
      expect(detectScript("Guten Tag")).toBe("latin");
      expect(detectScript("Hola amigo")).toBe("latin");
    });

    it("should return other for punctuation, digits, or unknown scripts", () => {
      expect(detectScript("123456")).toBe("other");
      expect(detectScript("!@#$%^")).toBe("other");
      expect(detectScript("")).toBe("other");
    });
  });

  describe("getLanguageMeta()", () => {
    it("should return correct metadata for Japanese ('ja')", () => {
      const meta = getLanguageMeta("ja");
      expect(meta.code).toBe("ja");
      expect(meta.nameVi).toBe("Tiếng Nhật");
      expect(meta.badge).toContain("🇯🇵");
      expect(meta.speechLocale).toBe("ja-JP");
      expect(meta.vocabTag).toBe("#vocab/japanese");
    });

    it("should return correct metadata for Chinese ('zh' and 'zh-CN')", () => {
      const metaZh = getLanguageMeta("zh");
      expect(metaZh.code).toBe("zh");
      expect(metaZh.nameVi).toBe("Tiếng Trung");
      expect(metaZh.badge).toContain("🇨🇳");
      expect(metaZh.speechLocale).toBe("zh-CN");
      expect(metaZh.vocabTag).toBe("#vocab/chinese");

      const metaZhCn = getLanguageMeta("zh-CN");
      expect(metaZhCn.speechLocale).toBe("zh-CN");
    });

    it("should return correct metadata for Korean ('ko')", () => {
      const meta = getLanguageMeta("ko");
      expect(meta.code).toBe("ko");
      expect(meta.nameVi).toBe("Tiếng Hàn");
      expect(meta.badge).toContain("🇰🇷");
      expect(meta.speechLocale).toBe("ko-KR");
      expect(meta.vocabTag).toBe("#vocab/korean");
    });

    it("should return correct metadata for French ('fr')", () => {
      const meta = getLanguageMeta("fr");
      expect(meta.code).toBe("fr");
      expect(meta.nameVi).toBe("Tiếng Pháp");
      expect(meta.badge).toContain("🇫🇷");
      expect(meta.speechLocale).toBe("fr-FR");
      expect(meta.vocabTag).toBe("#vocab/french");
    });

    it("should return correct metadata for German ('de')", () => {
      const meta = getLanguageMeta("de");
      expect(meta.code).toBe("de");
      expect(meta.nameVi).toBe("Tiếng Đức");
      expect(meta.badge).toContain("🇩🇪");
      expect(meta.speechLocale).toBe("de-DE");
      expect(meta.vocabTag).toBe("#vocab/german");
    });

    it("should return correct metadata for English ('en')", () => {
      const meta = getLanguageMeta("en");
      expect(meta.code).toBe("en");
      expect(meta.nameVi).toBe("Tiếng Anh");
      expect(meta.badge).toContain("🇬🇧");
      expect(meta.speechLocale).toBe("en-US");
      expect(meta.vocabTag).toBe("#vocab/english");
    });

    it("should fallback gracefully for undefined or unsupported language codes", () => {
      const metaDefault = getLanguageMeta();
      expect(metaDefault.code).toBe("en");

      const metaUnknown = getLanguageMeta("xyz");
      expect(metaUnknown.code).toBe("xyz");
      expect(metaUnknown.speechLocale).toBe("en-US");
      expect(metaUnknown.vocabTag).toBe("#vocab/xyz");
    });
  });

  describe("SUPPORTED_LANGUAGES", () => {
    it("should include major study languages", () => {
      expect(SUPPORTED_LANGUAGES["auto"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["en"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["ja"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["zh"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["ko"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["fr"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["de"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["es"]).toBeDefined();
      expect(SUPPORTED_LANGUAGES["ru"]).toBeDefined();
    });
  });
});
