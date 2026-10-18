export type LookupType = "word" | "phrase" | "sentence";
export type VocabFormat = "table" | "callout";
export type TriggerMode = "icon" | "hotkey-only" | "auto-popup";
export type PreferredAccent = "us" | "uk";

export interface DictDefinition {
  partOfSpeech: string;
  meaningEn: string;
  example?: string;
}

export interface LookupResult {
  query: string;
  type: LookupType;
  contextSentence: string;
  contextSentenceClean: string;
  phonetic?: string;
  audioUrl?: string;
  vietnameseTranslation: string;
  definitions?: DictDefinition[];
  aiGrammarNote?: string;
  timestamp: number;

  // Multilingual properties
  sourceLang?: string;
  targetLang?: string;
  transliteration?: string;
}

export interface PluginSettings {
  // Nhóm 1: Tương tác đọc
  autoTranslateOnSelection: boolean;
  triggerMode: TriggerMode;

  // Nhóm Ngôn ngữ học tập (Multilingual)
  sourceLanguage: string;
  targetLanguage: string;
  separateVocabFileByLanguage: boolean;

  // Nhóm 2: Sổ từ vựng
  vocabFilePath: string;
  vocabFormat: VocabFormat;
  useDailyNote: boolean;
  highlightWordInContext: boolean;

  // Nhóm 3: Dịch thuật & AI
  translateEndpointUrl: string;
  geminiApiKey: string;
  enableAiGrammar: boolean;

  // Nhóm 4: Phát âm
  preferredAccent: PreferredAccent;
  autoPlayAudio: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  autoTranslateOnSelection: false,
  triggerMode: "icon",
  sourceLanguage: "auto",
  targetLanguage: "vi",
  separateVocabFileByLanguage: false,
  vocabFilePath: "Vocabulary.md",
  vocabFormat: "table",
  useDailyNote: false,
  highlightWordInContext: true,
  translateEndpointUrl: "https://translate.googleapis.com",
  geminiApiKey: "",
  enableAiGrammar: false,
  preferredAccent: "us",
  autoPlayAudio: false,
};
