export type LookupType = "word" | "phrase" | "sentence";
export type VocabFormat = "table" | "callout";
export type TriggerMode = "icon" | "hotkey-only" | "auto-popup";
export type PreferredAccent = "us" | "uk";
export type ReadingEngine = "google" | "gemini";

export interface DictDefinition {
  partOfSpeech: string;
  meaningEn: string;
  example?: string;
}

export interface DocumentContextMeta {
  noteTitle?: string;
  fileTitle?: string;
  folderPath?: string;
  heading?: string;
  headingContext?: string;
  tags?: string[];
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
  aiTranslation?: string;
  aiLoading?: boolean;
  docContext?: DocumentContextMeta;
  timestamp: number;

  // Multilingual properties
  sourceLang?: string;
  targetLang?: string;
  transliteration?: string;
}

export interface PluginSettings {
  readingTranslationEngine: ReadingEngine;
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
  enableAiTranslation: boolean;
  enableAiGrammar: boolean;

  // Nhóm 4: Phát âm
  preferredAccent: PreferredAccent;
  autoPlayAudio: boolean;

  // Nhóm 5: Dịch song ngữ toàn bộ file (Bilingual File Translation)
  bilingualTranslationStyle: BilingualStyle;

  // Nhóm 6: Highlight khi đọc (Reading Mode Non-Destructive Highlights)
  readingHighlights?: Record<string, ReadingHighlightItem[]>;
}

export interface ReadingHighlightItem {
  id: string;
  text: string;
  color: "yellow" | "green" | "blue" | "pink" | "purple" | "orange";
  timestamp: number;
}

export type BilingualStyle = "blockquote" | "colored" | "highlight" | "bold_prefix";

export type MarkdownBlockType =
  | "frontmatter"
  | "code_block"
  | "math_block"
  | "table"
  | "heading"
  | "paragraph"
  | "list_item"
  | "multiple_choice"
  | "blank_line"
  | "existing_translation"
  | "raw_other";

export interface MarkdownBlock {
  id: string;
  type: MarkdownBlockType;
  rawText: string;
  translatableText?: string;
  translatedText?: string;
  skipTranslation: boolean;
  indent?: string;
  listPrefix?: string;
}

export interface BilingualProgressMeta {
  current: number;
  total: number;
  percent: number;
  currentText: string;
}

export interface BilingualTranslationOptions {
  engine: "google" | "gemini";
  targetLang?: string;
  sourceLang?: string;
  apiKey?: string;
  customModel?: string;
  customEndpointUrl?: string;
  docContext?: DocumentContextMeta;
  signal?: AbortSignal;
  batchSize?: number;
  delayMs?: number;
  onProgress?: (progress: BilingualProgressMeta) => void;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  readingTranslationEngine: "google",
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
  enableAiTranslation: false,
  enableAiGrammar: false,
  preferredAccent: "us",
  autoPlayAudio: false,
  bilingualTranslationStyle: "blockquote",
  readingHighlights: {},
};
