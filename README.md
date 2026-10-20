# Obsidian Polyglot Study Assistant 🌐📖

> **A seamless, non-intrusive multilingual language learning companion for [Obsidian](https://obsidian.md). Effortlessly study English, Japanese, Chinese, Korean, French, German, Spanish, Russian, and more with instant lookups, native Romaji/Pinyin transliteration, CJK-aware routing, AI grammar insights with Gemini Flash, authentic TTS pronunciation, and contextual vocabulary accumulation directly in your Markdown Vault.**

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vitest](https://img.shields.io/badge/Tests-735%20Passed-FCC72B?logo=vitest&logoColor=black)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Why Polyglot Study Exists

Reading foreign literature, scientific papers, manga, or technical documentation in Obsidian is wonderful — until you hit an unfamiliar word, complex grammar structure, or non-Latin script:
- Switching out to browser tabs or standalone translator apps breaks your cognitive reading flow.
- Standard translation tools don't understand Obsidian's Markdown format, cannot parse CJK text without spaces, and cannot save words to your Vault.
- When you do look up a word, you quickly forget it because you didn't preserve the **original sentence context** where it appeared.

**Obsidian Polyglot Study Assistant** completely solves this inside your editor:
Highlight any text in **Edit Mode** or **Reading Mode** $\to$ view instant definitions, Vietnamese translations, and Romaji/Pinyin $\to$ listen to authentic native pronunciation $\to$ save the word with its original context sentence into your vocabulary notebook in **1 click**.

---

## ✨ Key Features & Capabilities

### 📖 Immersive Bilingual Reading

Open a note in **Reading Mode**, then use the **languages icon in the note header** or the command **Bật/tắt dịch song ngữ khi đọc**.

- Translations appear directly below their source blocks, with a prominent accent background, a vertical border, and semibold text that follows the Obsidian theme.
- Translation starts for blocks in or near the visible area and continues as you scroll. Each pane can be toggled independently.
- The source Markdown is never rewritten by this mode. Turning it off removes the temporary translations; switching files or entering Edit Mode ends that pane's session.
- Inline code and math are protected. Code blocks, tables, embeds, and interactive content are skipped. Failed blocks offer **Thử lại** instead of presenting the original text as a successful translation.
- In **Settings → Polyglot Study Assistant → DỊCH SONG NGỮ KHI ĐỌC**, choose Google Translate (default) or Gemini (requires your API key). The existing source/target language settings apply; AI grammar is a separate option.
- Successful translations are cached in memory, up to 200 entries. Changes to translation settings end existing reading sessions; toggle again to apply them.

The separate **Dịch song ngữ file Markdown hiện tại** command writes bilingual Markdown to the current file or a new file. Use the reading command above for a temporary view.

File export checks cancellation and source conflicts before committing. If the source/editor changed or is not synchronized with disk, in-place export is rejected; save/sync the note first or choose a new file. A failed or incomplete translation writes nothing. Existing exports are preserved by choosing a unique filename.

### 🖍️ Reading Highlights

- Use the highlight toolbar or continuous pen in **Reading Mode**. Right-drag paints or erases; left selection remains available for translation. Edit Mode and contenteditable regions are excluded.
- Highlights persist in plugin settings without changing the original Markdown, including Japanese/Chinese text and phrases spanning inline tags.
- Erasing removes all fragments of the affected saved highlight IDs. Note/folder renames migrate the records; deleted paths are cleaned up.
- Raw Vault paths preserve case and literal percent characters. Legacy path keys migrate once when ownership is unambiguous. Ambiguous/orphan legacy records remain stored under `\u0000polyglot-legacy:` recovery keys and are not assigned to a guessed note; the old lossy format cannot reliably identify their original owner.

### 🌍 1. Multilingual Study Expansion (Đa Ngôn Ngữ Toàn Diện)
- **Automatic Script & Language Detection**:
  - Automatically identifies Unicode scripts:
    - 🇯🇵 **Japanese**: Hiragana, Katakana, and Kanji (`ja`)
    - 🇨🇳 **Chinese**: Simplified & Traditional Hanzi (`zh`)
    - 🇰🇷 **Korean**: Hangul syllables & Jamo (`ko`)
    - 🇷🇺 **Russian**: Cyrillic script (`ru`)
    - 🇬🇧 🇫🇷 🇩🇪 🇪🇸 🇻🇳 **Latin**: English, French, German, Spanish, Vietnamese, etc.
- **CJK-Aware 3-Tier Routing Engine**:
  - Solves the segmentation challenge of Chinese and Japanese (which do not use whitespace between words):
    - **$\le 2$ CJK characters**: Classified as `word` (Từ đơn).
    - **$3 - 6$ CJK characters**: Classified as `phrase` (Cụm từ / Thành ngữ).
    - **$> 6$ CJK characters** or ending with CJK punctuation (`。 ！ ？ …`): Classified as `sentence` (Câu).
  - Automatically bypasses FreeDict for non-English scripts to eliminate redundant network requests and 404 errors.
- **Native Romaji & Pinyin Transliteration**:
  - Leverages Google Translate GTX API with `dt=t&dt=rm` parameters to extract authentic Romanization:
    - Romaji for Japanese (*e.g.* `[Konnichiwa]`, `[Benkyō]`)
    - Pinyin for Chinese (*e.g.* `[Nǐ hǎo]`, `[Rén gōng zhì néng]`)
    - Romaja for Korean.
- **Authentic Native Web Speech TTS**:
  - Automatically matches target speech locale (*e.g.* `ja-JP`, `zh-CN`, `ko-KR`, `fr-FR`, `de-DE`, `es-ES`, `ru-RU`, `en-US`).
  - Scans `window.speechSynthesis.getVoices()` to prioritize native dialect voices for the most natural pronunciation.

---

### ⚡ 2. 3-Tier Execution & AI Grammar Insights
- **Tier 1: Single Word**:
  - **English**: Queries Free Dictionary API for phonetic IPA (`/haɪˈpɑː.θə.sɪs/`), parts of speech (*n., v., adj.*), definitions, and example sentences.
  - **All Languages**: Concurrently queries Google Translate for primary meaning and native transliteration.
- **Inflection & Stemming Fallback**: Automatically strips suffixes (`-ing`, `-ed`, `-es`, `-s`) to resolve base lemmas.
  - Lemma fallback supplies definitions; its IPA/audio is not presented as the pronunciation of the inflected query. Missing audio falls back to TTS for the original query.
- **Tier 2: Phrasal Verbs & Idioms**:
  - Prioritizes idiom dictionary entries before falling back to phrase translation.
- **Tier 3: Sentences & Deep Context Analysis**:
  - Smooth translation into Vietnamese (or your chosen target language).
  - **Gemini Flash AI Integration**: When enabled, acts as your private language tutor — providing nuanced grammatical breakdown, Kanji breakdown, honorific explanations (Keigo/Jondaemal), and contextual usage notes.

---

### 🖱️ 3. Draggable Popover Card & Auto-Translate
- **Draggable Header with Visual Grip Handle**:
  - Features an Obsidian Lucide `grip-horizontal` handle.
  - Automatic `cursor: grab` and `cursor: grabbing` feedback.
  - Complete event isolation: Clicking internal buttons (Audio, Pin, Close) never triggers accidental drag.
- **8px Viewport Safety Clamping**:
  - Guarantees the popover stays within screen boundaries, preventing clipping on small displays or split panes.
- **Auto-Translate on Selection (Tự động dịch khi bôi đen)**:
  - Configure the plugin to immediately look up text upon releasing selection without needing to click an icon or press hotkeys.
  - **Immediate Rect Capture**: Pins coordinates instantly before network requests start.
  - **Instant Loading Spinner Card**: Shows a sleek spinner (`loader-2`) and transitions smoothly to the result card upon arrival.
  - **Safe Abort**: Pressing `Escape` or clicking Close immediately cancels in-flight network requests (`cancelPending()`).

---

### 📓 4. Flexible Vocabulary Vault Storage
- **1-Click Atomic Storage**:
  - Uses Obsidian's synchronous `app.vault.process()` API to prevent race conditions or data corruption.
- **Standard Markdown Table & Callout Flashcards**:
  - **Table format**: Escapes pipes (`\|`), bolds keywords in context, adds transliteration column, and stamps `YYYY-MM-DD`.
  - **Callout format (`> [!vocab]`)**: Formatted for Spaced Repetition and Anki exports.
- **Multi-File & Tagging Options**:
  - **Unified Vault with Tags**: Adds automated Dataview tags (*e.g.* `#vocab/japanese`, `#vocab/chinese`, `#vocab/english`).
  - **Separate Files per Language**: Toggle `separateVocabFileByLanguage` in Settings to automatically route vocabulary into `Vocabulary_ja.md`, `Vocabulary_zh.md`, etc.
- **Smart Duplicate Merging**:
  - Appends new context sentences (`<br>• `) to existing entries instead of duplicating rows.

---

### 📌 5. Sidebar Panel & In-Memory LRU Cache
- **Right Sidebar View (`ItemView`)**:
  - **Deep Dive Tab**: Displays comprehensive definitions, grammar notes, phonetic IPA, Romaji/Pinyin, and audio player.
  - **Session History Tab**: Logs every lookup during your active session.
- **0ms Instant LRU Cache**:
  - In-RAM LRU Cache stores up to 200 items isolated by exact query, source/target languages, context, document metadata, endpoint and AI settings. Provider setting changes invalidate pending work and cached results.

---

## 📸 Architecture Diagram

```text
               [ Reading Note in Obsidian ]
                            │
                            ▼
               Highlight Word / Sentence
                            │
                     (150ms Debounce)
                            │
                            ▼
          [ Trigger Icon / Auto-Translate / Hotkey ]
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
  Single Word / Phrase                     Full Sentence
    • Script Detection (CJK vs Latin)        • Neural Translation
    • FreeDict (English IPA & definitions)   • Gemini Flash AI
    • Google Translate (dt=t&dt=rm)            (Deep grammar breakdown)
    • Romaji / Pinyin Transliteration
        │                                       │
        └───────────────────┬───────────────────┘
                            │
                            ▼
               [ Draggable Popover Card ]
                 ├─ 🏷️ Language Badge ([🇯🇵 JA], [🇨🇳 ZH], [🇬🇧 EN])
                 ├─ 🔊 Native Web Speech TTS Audio
                 ├─ 💡 Translation & Romaji/Pinyin
                 ├─ 🤖 AI Grammar & Contextual Notes
                 ├─ 📝 Original Context Sentence
                 ├─ [ 💾 Lưu vào sổ ] ───► Atomic Vault (Table/Callout)
                 └─ [ 📌 Ghim Sidebar ] ─► Polyglot Study Sidebar
```

---

## 🚀 Installation

### Option 1: Manual Installation (Fastest)
1. Download or copy the following 3 files from this repository:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. In your Obsidian Vault, navigate to:
   ```text
   <Your-Vault>/.obsidian/plugins/
   ```
   *(Enable "Show Hidden Files" in your OS if `.obsidian` is not visible).*
3. Create a folder named `obsidian-english-study` and paste the 3 files inside:
   ```text
   <Your-Vault>/.obsidian/plugins/obsidian-english-study/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
4. In Obsidian: Go to **Settings > Community plugins** $\to$ Click **Reload plugins** $\to$ Enable **Polyglot Study Assistant**.

---

### Option 2: Build From Source

Development requires Node.js 22.12+ on the 22.x line, 24.x, or 26+. This is a build/test toolchain requirement, not an additional runtime dependency inside Obsidian.

```bash
# 1. Clone repository
git clone https://github.com/VinhDat267/obsidian-polyglot-study.git
cd obsidian-polyglot-study

# 2. Install dependencies
npm ci

# 3. Run full test suite (735 tests)
npm test

# 4. Build production bundle
npm run build
```
Copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugin directory.

---

## ⌨️ Hotkeys & Commands

| Command | Suggested Hotkey | Description |
| :--- | :--- | :--- |
| **Tra từ điển / Dịch câu bôi đen (Đa ngôn ngữ)** | `Alt + T` or `Ctrl + Shift + D` | Look up highlighted text in Edit or Reading mode. |
| **Lưu từ vựng vào sổ** | `Alt + S` | Save active lookup result into your vocabulary notebook. |
| **Mở thanh bên Polyglot Study** | `Alt + P` | Open and focus the right sidebar study panel. |
| **Bật/tắt dịch song ngữ khi đọc** | Assign in Obsidian | Toggle temporary bilingual translations in the active Reading Mode pane. |

---

## ⚙️ Settings Overview

Open **Settings > Polyglot Study Assistant** to customize your environment:

| Group | Setting | Default | Description |
| :--- | :--- | :--- | :--- |
| **Trigger & Display** | `Tự động dịch khi bôi đen` | `false` | Automatically look up and display popover when text is highlighted. |
| | `Chế độ kích hoạt` | `Icon nổi (icon)` | Choose between Floating Icon `[📖]` or Hotkey Only (when auto-translate is off). |
| **Multilingual Settings** | `Ngôn ngữ nguồn (Học tập)` | `Tự động nhận diện` | Choose source language (`auto`, `en`, `ja`, `zh`, `ko`, `fr`, `de`, `es`, `ru`). |
| | `Ngôn ngữ đích (Dịch nghĩa)` | `Tiếng Việt (vi)` | Target translation language (`vi`, `en`, `zh`, `ja`). |
| | `Tách riêng file từ vựng` | `false` | Automatically saves into `Vocabulary_<lang>.md` instead of shared file. |
| **Vocabulary Vault** | `Lưu vào Daily Note` | `false` | Appends new vocabulary to today's Daily Note (`YYYY-MM-DD.md`). |
| | `Đường dẫn file từ vựng` | `Vocabulary.md` | Path to store vocabulary notes. |
| | `Định dạng lưu từ vựng` | `Bảng Markdown` | Select between Markdown Table or Callout Flashcards (`> [!vocab]`). |
| | `In đậm từ trong ngữ cảnh` | `true` | Automatically bolds target word in the extracted sentence. |
| **AI & Engines** | `Gemini API Key` | `""` | Optional Google Gemini API key for advanced grammar tutoring. |
| | `Phân tích ngữ pháp AI` | `true` | Enables AI grammar and context explanations. |
| **Audio** | `Giọng phát âm ưu tiên` | `US (Mỹ)` | Prioritizes US or UK recordings for English words. |
| | `Tự động phát âm` | `false` | Automatically speaks pronunciation when looking up single words. |

> [!WARNING]
> **Git Security Tip**:
> Plugin configurations are stored in `.obsidian/plugins/obsidian-english-study/data.json`. If you sync your vault to a public repository using **Obsidian Git**, add `data.json` to `.gitignore` to prevent exposing your personal Gemini API key.

---

## 🧪 Testing & Verification

The project is built on strict **Test-Driven Development (TDD)** principles:

```bash
# Run 735 tests across 43 test files
npm test

# Typecheck application and tests, then all production code against real Obsidian types
npm run typecheck
npm run typecheck:production

# Check the reading feature independently against the real Obsidian API types
npm run typecheck:reading

# Run tests with coverage
npx vitest run --coverage
```

### Test Suite Breakdown:
- `tests/reading/`: Real DOM fixtures for extraction, protected code/math, safe rendering, per-pane lifecycle, pre-attachment postprocessing, viewport virtualization, cancellation, lazy scheduling, cache isolation, and the complete plugin flow with HTTP mocked. Tests assert that reading mode does not write notes.
- `languageHelper`: Script detection across CJK, Cyrillic, and Latin, language metadata, speech locales, Dataview tags.
- `GoogleTranslate`: Parsing multi-chunk translations, `dt=rm` Romaji/Pinyin extraction, fallback mirror handling.
- `ProviderManager`: CJK-aware 3-tier classification, FreeDict bypass, language-aware cache key isolation, `AbortController` cancellation.
- `VocabService`: Separate language files (`Vocabulary_<lang>.md`), language tag stamping, synchronous `vault.process()` safety.
- `FloatingPopover` & `SidebarView`: Language badge rendering (`[🇯🇵 JA]`), transliteration display, Web Speech TTS locale assignment, drag-and-drop viewport clamping.
- `SettingsTab`: All 5 setting groups verification, dropdown change handlers, toggle synchronization.
- `main`: Full plugin lifecycle, ribbon icons, commands, Edit and Reading mode lookups.

Verification limits: automated tests use a mocked Obsidian host and HTTP. All production code and the reading module pass checks against the installed real Obsidian API types; the full application/test typecheck also passes. Version 1.1.1 includes audit regression tests for safe file commits, cancellation, cache isolation, AI language targets and highlight persistence. Browser fixture checks from the original reading feature cover representative light/dark themes, narrow panes, and 200% CSS zoom. Actual Obsidian and live-provider acceptance remain separate and were not run for the audit fixes. See [the remediation record](docs/audits/2026-10-19-remediation.md).

The [2026-10-20 follow-up fixes](docs/audits/2026-10-20-remediation.md) cover scroll-safe lookups, highlight history on rename/delete, Tutor context isolation and pending-chat handoff, vocabulary table ownership, pronunciation provenance, Reading Mode auto-translation, and restored TypeScript checks. The current 735-test suite also covers list selections without empty highlight boxes, shared undo/redo, and restoration. Live Obsidian/provider acceptance remains separate from the automated and browser-fixture checks.

---

## 🛠️ Tech Stack

- **Language**: [TypeScript 5.4](https://www.typescriptlang.org) (Strict mode)
- **Runtime**: [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- **Bundler**: [esbuild](https://esbuild.github.io) (CommonJS target ES2018)
- **Test Runner**: [Vitest 5.0.5](https://vitest.dev), Vite 8.3.4; esbuild 0.28.2
- **Styling**: Scoped CSS adhering 100% to Obsidian Theme Tokens (`taste-skill` verified)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to customize and extend it for your language learning workflow!
