# Obsidian English Study Assistant 📖

> **A non-intrusive, smart language learning companion for [Obsidian](https://obsidian.md). Look up English words, translate highlighted sentences, listen to native pronunciation, and automatically accumulate vocabulary with real context directly into your Markdown notebook.**

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?logo=obsidian&logoColor=white)](https://obsidian.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vitest](https://img.shields.io/badge/Tests-224%20Passed-FCC72B?logo=vitest&logoColor=black)](https://vitest.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Why This Exists

Reading papers, technical docs, and foreign literature in Obsidian is wonderful — until you hit an unfamiliar word or complex sentence:
- Switching out to browser tabs breaks your reading flow.
- Standard translation extensions don't know about Obsidian's Markdown format and can't save words to your Vault.
- Even if you look up a word, you forget it tomorrow because you didn't save the **surrounding sentence context** where it appeared.

**Obsidian English Study** solves this completely inside your editor. Highlight text, view instant definitions or Vietnamese translations without losing your place, and save the word with its original context sentence into your vocabulary notebook in 1 click.

---

## ✨ Features

### ⚡ 3-Tier Smart Routing Engine
The plugin automatically inspects your highlighted text and routes it to the optimal provider:
1. **Single Word**: Queries Free Dictionary API for phonetic IPA (`/haɪˈpɑː.θə.sɪs/`), parts of speech (*n., v., adj.*), English definitions with examples, and streams US/UK audio. Concurrently queries Google Translate to display instant Vietnamese meanings.
2. **Inflection & Stemming Fallback**: Never get blocked by `404 Not Found` on conjugated verbs or plurals (*running*, *validated*, *hypotheses*). The plugin automatically strips inflections (`-ing`, `-ed`, `-es`, `-s`, etc.) to resolve base lemma entries before falling back.
3. **Phrasal Verbs & Idioms ($\le 4$ words)**: Detects phrasal verbs (*look after*, *give up*) and short idioms (*piece of cake*), prioritizing idiom definitions before sentence translation.
4. **Sentences & Paragraphs ($> 4$ words)**: Delivers smooth Vietnamese translation. If Gemini AI is enabled, the AI acts as your personal tutor — explaining nuanced grammar structures and idiomatic expressions within the specific context of your note.

### 🎯 Non-Intrusive Dual-View UI
- **Floating Action Trigger `[📖]`**: Appears discreetly 150ms after you highlight text. It never steals editor focus, preserving normal typing and selection.
- **Collision-Aware Popover**: Intelligently anchors to your selection. If text is near the bottom of your screen, it automatically flips upward; if near the edges, it adjusts inward to stay within view.
- **Audio Pronunciation**: Direct MP3 streaming with automatic, robust fallback to native Web Speech Synthesis (`window.speechSynthesis`).
- **Auto-Dismissal**: Disappears cleanly when you scroll the editor, switch note tabs, press `Escape`, or click outside.
- **Dedicated Sidebar Panel (`ItemView`)**:
  - **Deep Dive Tab**: Complete definitions, synonyms, antonyms, AI context analysis, and audio player.
  - **Session History Tab**: Keeps track of every word queried during your current study session using an in-RAM LRU Cache (200 items, $0\text{ms}$ instant recall).

### 📓 Safe Vault Vocabulary Notebook
- **1-Click Atomic Storage**: Saves words into `Vocabulary.md` (or your Daily Note) using Obsidian's synchronous `app.vault.process()` API, ensuring zero race conditions even while editing.
- **Two Flexible Formats**:
  - **Markdown Table**: Automatically escapes pipe characters (`\|`), bolds the keyword in context, and stamps `YYYY-MM-DD`.
  - **Flashcard Callout (`> [!vocab]`)**: Compatible with Spaced Repetition and Anki plugins.
- **Smart Duplicate Merging**: If a word is already in your notebook, it appends the new example sentence (`<br>• `) instead of creating duplicate clutter.

### 🎨 100% Native Theming
Strictly utilizes Obsidian CSS custom properties (`--background-floating`, `--text-normal`, `--text-accent`, `--interactive-accent`, `--shadow-l`). Adapts seamlessly to Light, Dark, and all Community Themes.

---

## 📸 Architecture & Interaction Flow

```
   [ Reading Note in Obsidian ]
                │
                ▼
      Highlight Word / Sentence
                │
         (150ms Debounce)
                │
                ▼
         [ 📖 ] Trigger Icon  (or Hotkey / Context Command)
                │
     ┌──────────┴──────────────────────────┐
     │                                     │
     ▼                                     ▼
Single Word / Idiom                   Sentence / Paragraph
  • Free Dictionary API (IPA + Audio)   • Google Translate (Fast Web)
  • Google Translate (Vietnamese)       • Gemini 2.0 Flash AI (Optional)
     │                                     │
     └──────────┬──────────────────────────┘
                │
                ▼
      [ Floating Popover Card ]
        ├─ 🔊 Pronounce (MP3 / TTS)
        ├─ 💡 Vietnamese translation
        ├─ 🇬🇧 English definitions & examples
        ├─ 🤖 AI Grammar & Context Notes
        ├─ 📝 "...highlighted **word** in context..."
        ├─ [ 💾 Save to Vocab ] ───► Atomic Vault Write (Table/Callout)
        └─ [ 📌 Pin to Sidebar ] ──► English Study Sidebar Panel
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
   *(On Windows/macOS, enable "Show Hidden Files" if `.obsidian` is invisible).*
3. Create a folder named `obsidian-english-study` and paste the 3 files inside:
   ```text
   <Your-Vault>/.obsidian/plugins/obsidian-english-study/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```
4. In Obsidian: Go to **Settings > Community plugins** $\to$ Click **Reload plugins** $\to$ Turn on **English Study Assistant**.

### Option 2: Build From Source
```bash
# 1. Clone repository
git clone https://github.com/VinhDat267/obsidian-english-study.git
cd obsidian-english-study

# 2. Install dependencies
npm install

# 3. Run test suite
npm test

# 4. Build production bundle
npm run build
```
Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/obsidian-english-study/` directory.

---

## ⌨️ Hotkeys & Commands

Obsidian English Study adheres strictly to Obsidian's official guidelines by not hijacking default hotkeys. You can configure your favorite keybindings:

1. Open Obsidian **Settings > Hotkeys**.
2. Search for:
   - `Tra từ điển / Dịch câu bôi đen`: Lookup highlighted text directly (e.g., `Alt + T` or `Ctrl + Shift + D`).
   - `Lưu từ vựng vào sổ`: Save current active lookup result to your vocabulary notebook (e.g., `Alt + S`).
   - `Mở thanh bên English Study`: Open and focus the right sidebar view.

---

## ⚙️ Settings Overview

Open **Settings > English Study Assistant** to customize your experience:

| Group | Setting | Default | Description |
| :--- | :--- | :--- | :--- |
| **Reading Interaction** | `Trigger Mode` | `Icon on selection` | Choose between: Floating Icon `[📖]`, Hotkey Only, or Auto-Popup. |
| **Vocabulary Vault** | `Use Daily Note` | `false` | When enabled, appends words to today's Daily Note (`YYYY-MM-DD.md`). |
| | `Vocab File Path` | `Vocabulary.md` | Path to store accumulated vocabulary notes. |
| | `Storage Format` | `Markdown Table` | Select between Markdown Table or Callout (`> [!vocab]`). |
| | `Highlight in Context` | `true` | Automatically bolds `**word**` in the extracted context sentence. |
| **Translation & AI** | `Translate Mirror URL`| *(Official Web)* | Custom proxy/mirror (e.g. Lingva) if Google Translate is throttled. |
| | `Gemini API Key` | `""` | Optional Google Gemini API key for deep grammatical analysis. |
| | `Enable AI Analysis` | `true` | Toggles AI grammar & idiom explanations. |
| **Audio** | `Preferred Accent` | `US (English - US)` | Prioritizes US (`-us.mp3`) or UK (`-uk.mp3`) audio recordings. |
| | `Auto-play Audio` | `false` | Automatically speaks pronunciation when looking up single words. |

> [!WARNING]
> **Security Note on Git Sync**:
> Plugin settings are stored in `.obsidian/plugins/obsidian-english-study/data.json`. If you sync your vault to a public GitHub repository using **Obsidian Git**, ensure you add `data.json` to your `.gitignore` to protect your personal Gemini API key.

---

## 🧪 Testing & Verification

The codebase is engineered with strict **Test-Driven Development (TDD)** and pure logic separation:

```bash
# Run 224 unit & integration tests across 16 suites
npm test

# Run tests with coverage
npx vitest run --coverage
```

Test coverage includes:
- `textCleaner`: Regex sanitizer, nested Markdown strips, quote & punctuation trims.
- `textParser`: Sentence boundary detection across multiline paragraphs, honorifics (`Dr.`, `Mr.`), Latin abbreviations (`e.g.`, `i.e.`), and decimals (`3.14`).
- `lruCache`: LRU eviction order and capacity boundaries.
- `vocabFormatter`: Table pipe escaping (`\|`), header detection, and duplicate context merging.
- `ProviderManager`: 3-tier classification, LRU RAM cache hit/miss, and `AbortController` cancellation.
- `VocabService`: Synchronous `vault.process()` safety, parent folder auto-creation, and duplicate checks.

---

## 🛠️ Tech Stack

- **Language**: [TypeScript 5.4](https://www.typescriptlang.org) (Strict mode)
- **Runtime**: [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- **Bundler**: [esbuild](https://esbuild.github.io) (CommonJS target ES2018)
- **Test Runner**: [Vitest 1.6](https://vitest.dev) (with comprehensive Obsidian API mocks)
- **Styling**: Scoped CSS with Obsidian Theme Tokens

---

## 📄 License

This project is licensed under the [MIT License](LICENSE). Feel free to use, customize, and extend it for your own language learning journey!
