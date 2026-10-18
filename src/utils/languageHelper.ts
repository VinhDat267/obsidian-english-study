export interface LanguageMeta {
  code: string;
  nameVi: string;
  badge: string;
  speechLocale: string;
  vocabTag: string;
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageMeta> = {
  auto: {
    code: "auto",
    nameVi: "Tự động nhận diện",
    badge: "🌐 Auto",
    speechLocale: "en-US",
    vocabTag: "#vocab/multilingual",
  },
  en: {
    code: "en",
    nameVi: "Tiếng Anh",
    badge: "🇬🇧 EN",
    speechLocale: "en-US",
    vocabTag: "#vocab/english",
  },
  ja: {
    code: "ja",
    nameVi: "Tiếng Nhật",
    badge: "🇯🇵 JA",
    speechLocale: "ja-JP",
    vocabTag: "#vocab/japanese",
  },
  zh: {
    code: "zh",
    nameVi: "Tiếng Trung",
    badge: "🇨🇳 ZH",
    speechLocale: "zh-CN",
    vocabTag: "#vocab/chinese",
  },
  ko: {
    code: "ko",
    nameVi: "Tiếng Hàn",
    badge: "🇰🇷 KO",
    speechLocale: "ko-KR",
    vocabTag: "#vocab/korean",
  },
  fr: {
    code: "fr",
    nameVi: "Tiếng Pháp",
    badge: "🇫🇷 FR",
    speechLocale: "fr-FR",
    vocabTag: "#vocab/french",
  },
  de: {
    code: "de",
    nameVi: "Tiếng Đức",
    badge: "🇩🇪 DE",
    speechLocale: "de-DE",
    vocabTag: "#vocab/german",
  },
  es: {
    code: "es",
    nameVi: "Tiếng Tây Ban Nha",
    badge: "🇪🇸 ES",
    speechLocale: "es-ES",
    vocabTag: "#vocab/spanish",
  },
  ru: {
    code: "ru",
    nameVi: "Tiếng Nga",
    badge: "🇷🇺 RU",
    speechLocale: "ru-RU",
    vocabTag: "#vocab/russian",
  },
  it: {
    code: "it",
    nameVi: "Tiếng Ý",
    badge: "🇮🇹 IT",
    speechLocale: "it-IT",
    vocabTag: "#vocab/italian",
  },
  vi: {
    code: "vi",
    nameVi: "Tiếng Việt",
    badge: "🇻🇳 VI",
    speechLocale: "vi-VN",
    vocabTag: "#vocab/vietnamese",
  },
};

export function getLanguageMeta(langCode?: string): LanguageMeta {
  if (!langCode || langCode === "auto") {
    return SUPPORTED_LANGUAGES["en"];
  }

  const clean = langCode.toLowerCase().trim();
  // Check exact match (e.g. "ja", "zh")
  if (SUPPORTED_LANGUAGES[clean]) {
    return SUPPORTED_LANGUAGES[clean];
  }

  // Handle Chinese regional variants like "zh-cn" or "zh-tw"
  if (clean.startsWith("zh")) {
    return SUPPORTED_LANGUAGES["zh"];
  }

  // Handle language dialect codes like "en-us", "fr-ca"
  const primary = clean.split("-")[0];
  if (SUPPORTED_LANGUAGES[primary]) {
    return SUPPORTED_LANGUAGES[primary];
  }

  return {
    code: clean,
    nameVi: clean.toUpperCase(),
    badge: `🌐 ${clean.toUpperCase()}`,
    speechLocale: "en-US",
    vocabTag: `#vocab/${clean}`,
  };
}

export function detectScript(text: string): "ja" | "zh" | "ko" | "ru" | "latin" | "other" {
  if (!text || !text.trim()) {
    return "other";
  }

  const clean = text.trim();

  // 1. Hiragana (\u3040-\u309F) or Katakana (\u30A0-\u30FF) -> Japanese
  const hasKana = /[\u3040-\u309F\u30A0-\u30FF]/.test(clean);
  if (hasKana) {
    return "ja";
  }

  // 2. Hangul Syllables (\uAC00-\uD7AF) or Jamo (\u1100-\u11FF) -> Korean
  const hasHangul = /[\uAC00-\uD7AF\u1100-\u11FF]/.test(clean);
  if (hasHangul) {
    return "ko";
  }

  // 3. Hanzi / CJK Unified Ideographs (\u4E00-\u9FFF) without Kana -> Chinese
  const hasHanzi = /[\u4E00-\u9FFF]/.test(clean);
  if (hasHanzi) {
    return "zh";
  }

  // 4. Cyrillic (\u0400-\u04FF) -> Russian / Slavic
  const hasCyrillic = /[\u0400-\u04FF]/.test(clean);
  if (hasCyrillic) {
    return "ru";
  }

  // 5. Latin letters ([a-zA-Z\u00C0-\u00FF...])
  const hasLatin = /[a-zA-Z\u00C0-\u00FF\u0100-\u017F\u0180-\u024F]/.test(clean);
  if (hasLatin) {
    return "latin";
  }

  return "other";
}
