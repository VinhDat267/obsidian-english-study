# Obsidian English Study Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng plugin Obsidian cá nhân hóa phục vụ việc học tiếng Anh khi đọc Markdown: tra từ điển, dịch câu tức thì qua Floating Popover và lưu từ vựng kèm ngữ cảnh bài đọc vào Vault.

**Architecture:** Kiến trúc 4 tầng phân tách trách nhiệm (Event Layer → Provider Layer → UI Layer → Storage Layer). Toàn bộ HTTP calls chạy qua `requestUrl` của Obsidian API (bypass CORS). Logic xử lý chuỗi và định dạng được tách biệt thuần TypeScript 100% để kiểm thử tự động độc lập qua Vitest.

**Tech Stack:** TypeScript, Obsidian Plugin API, esbuild, Vitest, CSS (Obsidian Theme Variables).

**Spec:** `docs/superpowers/specs/2026-10-18-obsidian-english-study-plugin-design.md`

## Global Constraints

- Không dùng `workspace.on('editor-change')` để bắt bôi đen (chỉ dùng DOM `mouseup`/`keyup` qua `registerDomEvent`).
- Không dùng `EditorSuggest` cho popup tra từ (tự dựng Floating DOM element định vị qua `getBoundingClientRect()`).
- Callback trong `app.vault.process(file, fn)` bắt buộc phải đồng bộ 100% (fetch mạng xong trước khi gọi `process`).
- Không gán hotkey mặc định trong code (đăng ký qua `addCommand` để người dùng tự gán trong Settings).
- CSS chỉ dùng CSS variables chuẩn của Obsidian (`var(--background-floating)`, `var(--text-normal)`, v.v.).
- Toàn bộ HTTP request bắt buộc dùng `requestUrl` của Obsidian, không dùng `fetch()` trình duyệt.
- Tách biệt Pure Logic 100% không dính Obsidian API để chạy Unit Test bằng Vitest.

## Review Focus

1. **Selection liên tục khi rê chuột**: Nhả chuột nhiều lần hoặc bôi đen giật cục không được spam API (Kiểm chứng bằng Selection Debounce 150ms + API Debounce 250ms).
2. **Ký tự đặc biệt trong bảng Markdown**: Câu chứa dấu `|` hoặc xuống dòng không được làm vỡ cột bảng (Kiểm chứng bằng test escape `|` thành `\|`).
3. **Từ chia thì / số nhiều (404 từ điển)**: Từ như `running`, `hypotheses` không được báo lỗi đỏ mà phải tự bỏ hậu tố hoặc fallback dịch nghĩa (Kiểm chứng bằng Inflection Fallback).
4. **Mất mạng khi đang đọc**: Không được đơ giao diện Obsidian, phải đọc từ RAM Cache hoặc báo nhẹ nhàng (Kiểm chứng bằng Cache LRU + Graceful degradation).
5. **Ghi file khi file đang mở**: Ghi từ vựng không được làm giật con trỏ hay mất dữ liệu đang soạn thảo (Kiểm chứng bằng atomic `vault.process()`).

---

### Task 1: Scaffolding, Build Pipeline & Mocking Environment

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `vitest.config.ts`
- Create: `__mocks__/obsidian.ts`
- Create: `src/types/index.ts`

**Interfaces:**
- Produces: Types `LookupResult`, `PluginSettings`, `VocabFormat` trong `src/types/index.ts`. Mock `requestUrl`, `Notice`, `Plugin`, `ItemView`, `TFile` trong `__mocks__/obsidian.ts`.

- [ ] **Step 1: Viết `package.json` và cài đặt dependencies**
  - devDependencies: `obsidian`, `typescript`, `esbuild`, `vitest`, `@types/node`.
  - scripts: `"build": "node esbuild.config.mjs"`, `"test": "vitest run"`.

- [ ] **Step 2: Viết `tsconfig.json`, `manifest.json`, `esbuild.config.mjs` và `vitest.config.ts`**
  - Cấu hình esbuild bundle sang CommonJS (`format: "cjs"`), target `es2018`, output `main.js`.
  - Cấu hình vitest alias `'obsidian'` trỏ tới `__mocks__/obsidian.ts`.

- [ ] **Step 3: Định nghĩa Interfaces chuẩn trong `src/types/index.ts`**
  - Khai báo `LookupResult`, `PluginSettings`, `DEFAULT_SETTINGS`.

- [ ] **Step 4: Viết `__mocks__/obsidian.ts` và test khởi động Vitest**
  - Test: `tests/scaffold.test.ts` kiểm tra mock import và type checking.
  - Chạy: `npx vitest run` → Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add package.json tsconfig.json esbuild.config.mjs manifest.json vitest.config.ts __mocks__/ src/types/ tests/
  git commit -m "chore: setup project scaffolding, build pipeline, types and vitest mocks"
  ```

---

### Task 2: Pure Logic — Text Cleaner & Context Sentence Parser

**Files:**
- Create: `src/utils/textCleaner.ts`
- Create: `src/utils/textParser.ts`
- Test: `tests/utils/textCleaner.test.ts`
- Test: `tests/utils/textParser.test.ts`

**Interfaces:**
- Consumes: Nothing (Pure functions).
- Produces:
  - `cleanSelection(raw: string): string`
  - `extractContextSentence(paragraph: string, selectedText: string, cursorOffset: number): { cleanContext: string, rawContext: string }`

- [ ] **Step 1: Viết failing tests cho `textCleaner` và `textParser`**
  - Test `cleanSelection`: Lọc dấu câu bao quanh (`"hypothesis,"` → `hypothesis`), bóc thẻ Markdown (`**crucial**` → `crucial`, `[[note]]` → `note`).
  - Test `extractContextSentence`: Bóc đúng câu chứa từ viết tắt (`Dr. Smith met Mr. John.`), số thập phân (`3.14`), câu nhiều dòng.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
  - Chạy: `npx vitest run tests/utils/` → Expected: FAIL (module not implemented).

- [ ] **Step 3: Triển khai `textCleaner.ts` và `textParser.ts`**
  - Xử lý regex ranh giới câu, bỏ qua danh sách viết tắt phổ biến (`Mr.`, `Mrs.`, `Dr.`, `e.g.`, `i.e.`, `vs.`).

- [ ] **Step 4: Chạy test để xác nhận PASS**
  - Chạy: `npx vitest run tests/utils/` → Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/utils/textCleaner.ts src/utils/textParser.ts tests/utils/
  git commit -m "feat: implement textCleaner and context sentence extraction with tests"
  ```

---

### Task 3: Pure Logic — LRU Memory Cache & Vocabulary Formatter

**Files:**
- Create: `src/utils/lruCache.ts`
- Create: `src/utils/vocabFormatter.ts`
- Test: `tests/utils/lruCache.test.ts`
- Test: `tests/utils/vocabFormatter.test.ts`

**Interfaces:**
- Consumes: `LookupResult` từ `src/types/index.ts`.
- Produces:
  - `class LRUCache<T>` (`get(key)`, `set(key, val)`, `clear()`)
  - `formatTableRow(result: LookupResult, highlight: boolean): string`
  - `formatCallout(result: LookupResult): string`
  - `insertRowAtTableEnd(markdown: string, row: string): string`
  - `isWordInContent(markdown: string, word: string): boolean`

- [ ] **Step 1: Viết failing tests cho `lruCache` và `vocabFormatter`**
  - Test `LRUCache`: giới hạn 200 items, xóa item cũ nhất khi đầy (FIFO/LRU eviction).
  - Test `vocabFormatter`: Escape ký tự `|` thành `\|`, chèn dòng vào đúng vị trí cuối bảng (trước tiêu đề phụ mới hoặc dòng trống), bôi đậm từ trong ngữ cảnh.

- [ ] **Step 2: Chạy test xác nhận FAIL**
  - Chạy: `npx vitest run tests/utils/lruCache.test.ts tests/utils/vocabFormatter.test.ts` → Expected: FAIL.

- [ ] **Step 3: Triển khai `lruCache.ts` và `vocabFormatter.ts`**
  - Code thuần TypeScript không import Obsidian.

- [ ] **Step 4: Chạy test xác nhận PASS**
  - Chạy: `npx vitest run tests/utils/` → Expected: PASS all.

- [ ] **Step 5: Commit**
  ```bash
  git add src/utils/lruCache.ts src/utils/vocabFormatter.ts tests/utils/
  git commit -m "feat: implement LRU cache and markdown table/callout vocab formatter"
  ```

---

### Task 4: Provider Layer — Network Base & Free Engines

**Files:**
- Create: `src/services/provider/BaseProvider.ts`
- Create: `src/services/provider/FreeDictService.ts`
- Create: `src/services/provider/GoogleTranslate.ts`
- Test: `tests/services/FreeDictService.test.ts`
- Test: `tests/services/GoogleTranslate.test.ts`

**Interfaces:**
- Consumes: `requestUrl` từ `obsidian`.
- Produces:
  - `BaseProvider.fetchJson<T>(url, options)`
  - `FreeDictService.lookup(word: string): Promise<DictResult | null>` (kèm stemming fallback khi 404: bỏ `-ing`, `-ed`, `-s`)
  - `GoogleTranslate.translate(text: string, targetLang?: string): Promise<string | null>`

- [ ] **Step 1: Viết failing tests cho FreeDictService và GoogleTranslate**
  - Mock `requestUrl` trả về mock JSON dictionaryapi.dev và Google Translate API.
  - Test trường hợp 404 (từ chia thì) → tự gọi truy vấn dạng bỏ hậu tố.
  - Test trường hợp timeout hoặc lỗi mạng → trả về null, không throw unhandled error.

- [ ] **Step 2: Chạy test xác nhận FAIL**
  - Chạy: `npx vitest run tests/services/` → Expected: FAIL.

- [ ] **Step 3: Triển khai `BaseProvider.ts`, `FreeDictService.ts`, `GoogleTranslate.ts`**
  - Sử dụng timeout 3500ms qua `RequestUrlParam`.

- [ ] **Step 4: Chạy test xác nhận PASS**
  - Chạy: `npx vitest run tests/services/` → Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/services/provider/BaseProvider.ts src/services/provider/FreeDictService.ts src/services/provider/GoogleTranslate.ts tests/services/
  git commit -m "feat: implement BaseProvider, FreeDictService with stem fallback, and GoogleTranslate"
  ```

---

### Task 5: Provider Layer — Gemini AI Service & Provider Manager

**Files:**
- Create: `src/services/provider/GeminiService.ts`
- Create: `src/services/provider/ProviderManager.ts`
- Test: `tests/services/GeminiService.test.ts`
- Test: `tests/services/ProviderManager.test.ts`

**Interfaces:**
- Consumes: `FreeDictService`, `GoogleTranslate`, `LRUCache`, `LookupResult`, `PluginSettings`.
- Produces:
  - `GeminiService.analyzeContext(targetText: string, contextSentence: string, apiKey: string): Promise<string | null>`
  - `ProviderManager.lookup(rawText: string, rawContext: string, cursorOffset: number): Promise<LookupResult>`

- [ ] **Step 1: Viết failing tests cho `GeminiService` và `ProviderManager`**
  - Test `classify`: 1 từ → `word`; cụm $\le 4$ từ → `phrase`; câu $> 4$ từ → `sentence`.
  - Test `ProviderManager`: tra từ 1 lần lưu cache, tra lần 2 lấy từ RAM (không gọi lại mạng).
  - Test fallback: khi Dict 404 và không có stem → tự động fallback sang Translate.

- [ ] **Step 2: Chạy test xác nhận FAIL**
  - Chạy: `npx vitest run tests/services/ProviderManager.test.ts` → Expected: FAIL.

- [ ] **Step 3: Triển khai `GeminiService.ts` và `ProviderManager.ts`**
  - Tích hợp `Promise.allSettled` gọi song song từ điển Anh-Anh và nghĩa tiếng Việt.
  - Quản lý In-flight request và `AbortController`.

- [ ] **Step 4: Chạy test xác nhận PASS**
  - Chạy: `npx vitest run tests/services/` → Expected: PASS all.

- [ ] **Step 5: Commit**
  ```bash
  git add src/services/provider/GeminiService.ts src/services/provider/ProviderManager.ts tests/services/
  git commit -m "feat: implement GeminiService and ProviderManager with 3-tier routing and cache"
  ```

---

### Task 6: Storage Layer — Vault Vocabulary Service

**Files:**
- Create: `src/services/storage/VocabService.ts`
- Test: `tests/services/VocabService.test.ts`

**Interfaces:**
- Consumes: `app.vault`, `LookupResult`, `PluginSettings`, `vocabFormatter`.
- Produces:
  - `VocabService.saveVocab(result: LookupResult): Promise<{ success: boolean, isDuplicate: boolean }>`

- [ ] **Step 1: Viết failing tests cho `VocabService`**
  - Mock `app.vault.getAbstractFileByPath`, `app.vault.create`, `app.vault.process`.
  - Test ghi file mới khi chưa tồn tại.
  - Test cập nhật atomic qua `vault.process()` đồng bộ.
  - Test phát hiện từ trùng lặp.

- [ ] **Step 2: Chạy test xác nhận FAIL**
  - Chạy: `npx vitest run tests/services/VocabService.test.ts` → Expected: FAIL.

- [ ] **Step 3: Triển khai `VocabService.ts`**
  - Hỗ trợ lưu bảng Markdown và Callout. Hỗ trợ đọc Daily Note từ core plugin nếu bật.

- [ ] **Step 4: Chạy test xác nhận PASS**
  - Chạy: `npx vitest run tests/services/VocabService.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/services/storage/VocabService.ts tests/services/VocabService.test.ts
  git commit -m "feat: implement VocabService with safe atomic vault process writes"
  ```

---

### Task 7: UI Layer — DOM Helpers, Floating Trigger, Floating Popover & CSS

**Files:**
- Create: `src/utils/domHelper.ts`
- Create: `src/ui/FloatingTrigger.ts`
- Create: `src/ui/FloatingPopover.ts`
- Create: `styles.css`
- Test: `tests/utils/domHelper.test.ts`

**Interfaces:**
- Consumes: `LookupResult`, Obsidian theme tokens, `domHelper`.
- Produces:
  - `calculatePosition(selectionRect, popoverEl, vw, vh): { top: number, left: number }`
  - `FloatingTrigger.show(rect, onClick)`, `FloatingTrigger.hide()`
  - `FloatingPopover.show(result, callbacks)`, `FloatingPopover.hide()`

- [ ] **Step 1: Viết test cho `domHelper.ts`**
  - Test tính toán tọa độ: lật lên trên nếu gần đáy màn hình, lật sang trái nếu gần mép phải.
  - Chạy: `npx vitest run tests/utils/domHelper.test.ts` → Expected: FAIL rồi PASS sau khi code.

- [ ] **Step 2: Triển khai `FloatingTrigger.ts`**
  - Icon nổi `[📖]` kích thước 22x22px, định vị gần con trỏ, tự ẩn khi click ra ngoài.

- [ ] **Step 3: Triển khai `FloatingPopover.ts`**
  - Render Card: Header (Từ, IPA, loa audio, Pin, Đóng), Body (Nghĩa tiếng Việt, Định nghĩa Anh-Anh, Phân tích AI), Footer (Câu ngữ cảnh, Nút Lưu từ, Nút Copy).
  - Tích hợp HTML5 Audio + Web Speech API fallback khi bấm icon loa.

- [ ] **Step 4: Viết `styles.css`**
  - 100% Obsidian CSS variables (`--background-floating`, `--text-normal`, `--text-accent`, `--shadow-l`).

- [ ] **Step 5: Commit**
  ```bash
  git add src/utils/domHelper.ts src/ui/FloatingTrigger.ts src/ui/FloatingPopover.ts styles.css tests/utils/domHelper.test.ts
  git commit -m "feat: implement FloatingTrigger, FloatingPopover, domHelper and Obsidian theme CSS"
  ```

---

### Task 8: UI Layer — Sidebar View & Settings Tab

**Files:**
- Create: `src/ui/SidebarView.ts`
- Create: `src/ui/SettingsTab.ts`

**Interfaces:**
- Consumes: `ItemView`, `PluginSettingTab`, `Setting`, `PluginSettings`.
- Produces:
  - `VIEW_TYPE_ENGLISH_STUDY = 'english-study-sidebar'`
  - `class EnglishStudySidebar extends ItemView` (Tab Deep Dive + Tab Session History)
  - `class EnglishStudySettingTab extends PluginSettingTab` (4 sections cài đặt)

- [ ] **Step 1: Triển khai `SidebarView.ts`**
  - Kế thừa `ItemView`, icon `book-open`.
  - Hiển thị chi tiết tra cứu đầy đủ và danh sách lịch sử phiên học từ Cache. Nút phát âm và nút xóa lịch sử.

- [ ] **Step 2: Triển khai `SettingsTab.ts`**
  - 4 section: Tương tác đọc (Trigger mode), Sổ từ vựng (Path, Format, Daily Note), Dịch thuật & AI (URL dịch, Gemini Key, Test connection), Phát âm (Accent, Auto-play).
  - Cảnh báo bảo mật Git leak cho API Key.

- [ ] **Step 3: Commit**
  ```bash
  git add src/ui/SidebarView.ts src/ui/SettingsTab.ts
  git commit -m "feat: implement SidebarView and EnglishStudySettingTab"
  ```

---

### Task 4: Plugin Entry Point & Integration Verification

**Files:**
- Create: `main.ts`

**Interfaces:**
- Consumes: Toàn bộ các module từ Task 1 đến Task 8.
- Produces: `export default class EnglishStudyPlugin extends Plugin`.

- [ ] **Step 1: Triển khai `main.ts`**
  - `onload()`:
    - Load settings qua `Object.assign({}, DEFAULT_SETTINGS, await this.loadData())`.
    - Đăng ký `registerView(VIEW_TYPE_ENGLISH_STUDY, ...)`.
    - Thêm Ribbon Icon mở Sidebar.
    - Đăng ký Commands qua `this.addCommand()`: `lookup-selected-text`, `save-to-vocabulary`, `open-sidebar`.
    - Đăng ký `registerDomEvent(document, 'mouseup')` và `'keyup'` với Selection Debounce (150ms).
    - Đăng ký `this.registerEvent(workspace.on('active-leaf-change'))` để auto-dismiss Popover.
    - Đăng ký Settings Tab qua `this.addSettingTab()`.
  - `onunload()`:
    - Dọn dẹp DOM element popover và trigger nếu còn hiển thị.

- [ ] **Step 2: Chạy toàn bộ Unit Tests**
  - Chạy: `npx vitest run` → Expected: PASS 100%.

- [ ] **Step 3: Chạy build esbuild ra bundle `main.js`**
  - Chạy: `npm run build`
  - Expected: Tạo thành công file `main.js` không lỗi cú pháp hay thiếu import.

- [ ] **Step 4: Commit toàn bộ tích hợp**
  ```bash
  git add main.ts
  git commit -m "feat: integrate all components into main.ts plugin entry point"
  ```

---

## Verification Plan

### Automated Tests
1. Chạy toàn bộ Unit Tests:
   ```bash
   npx vitest run --coverage
   ```
   - `textCleaner.test.ts`: Kiểm tra bóc tách dấu câu và markdown tags.
   - `textParser.test.ts`: Kiểm tra trích xuất câu ngữ cảnh chuẩn xác.
   - `lruCache.test.ts`: Kiểm tra cơ chế bộ nhớ đệm 200 từ.
   - `vocabFormatter.test.ts`: Kiểm tra định dạng bảng và callout không vỡ layout.
   - `ProviderManager.test.ts`: Kiểm tra phân loại 3 mức và routing.
   - `VocabService.test.ts`: Kiểm tra ghi file an toàn vào Vault.
2. Kiểm tra đóng gói build:
   ```bash
   npm run build
   ```
   - Xác nhận file `main.js` được sinh ra hợp lệ.

### Manual Verification
1. **Kiểm tra tương tác đọc**:
   - Bôi đen 1 từ tiếng Anh trong file Markdown → Icon `[📖]` xuất hiện sau 150ms.
   - Bấm icon hoặc phím tắt → Popover hiển thị nghĩa tiếng Việt, IPA, định nghĩa Anh-Anh trong < 500ms.
   - Bấm icon loa → Nghe phát âm chuẩn.
   - Cuộn chuột hoặc click ra ngoài → Popover tự động biến mất sạch sẽ.
2. **Kiểm tra lưu từ vựng**:
   - Bấm nút "Lưu vào sổ từ vựng" → Thông báo Notice hiển thị.
   - Mở file `Vocabulary.md` → Thấy từ mới được thêm vào cuối bảng kèm đúng câu ngữ cảnh.
3. **Kiểm tra Sidebar**:
   - Bấm ribbon icon mở Sidebar → Thấy từ vừa tra nằm trong tab "Lịch sử phiên học".
