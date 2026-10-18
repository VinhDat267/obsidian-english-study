# Obsidian English Study Plugin — Design Specification

> **Tên plugin**: `obsidian-english-study`
> **Mục tiêu**: Trợ lý học tiếng Anh cá nhân hóa ngay trong Obsidian — tra từ điển, dịch câu tức thì khi đọc note, và gom từ vựng kèm ngữ cảnh vào sổ ôn tập.
> **Kiến trúc**: Smart Context Learning Hub (Phương án 1)
> **Ngày tạo**: 2026-10-18
> **Trạng thái**: Đã duyệt thiết kế — Chờ lập kế hoạch triển khai

---

## 1. Tổng quan sản phẩm

### 1.1 Bài toán cốt lõi

Người dùng đọc tài liệu tiếng Anh dưới dạng Markdown trong Obsidian. Khi gặp từ hoặc câu không hiểu, cần tra cứu nhanh mà không rời khỏi bài đọc, đồng thời muốn tích lũy từ vựng kèm ngữ cảnh thực tế để ôn tập lâu dài.

### 1.2 Tiêu chí thành công

- **Tốc độ**: Kết quả tra từ hiển thị trong < 500ms (Free API), < 2s (Gemini AI).
- **Không gián đoạn**: Popover không tự nhảy ra khi bôi đen để copy/paste/định dạng. Chỉ kích hoạt khi người dùng chủ động yêu cầu.
- **Plug-and-play**: Dùng được ngay sau cài đặt mà không cần cấu hình API key.
- **Học tập hiệu quả**: Mỗi từ được lưu kèm câu ngữ cảnh thực tế từ bài đọc.

### 1.3 Phạm vi (Scope)

| Trong phạm vi | Ngoài phạm vi |
| :--- | :--- |
| Tra từ điển Anh-Anh + dịch nghĩa Việt | Hệ thống Spaced Repetition / Flashcard tích hợp |
| Dịch câu/đoạn bôi đen | Dịch toàn bộ file tự động |
| Lưu từ vựng vào Markdown file | Đồng bộ từ vựng lên cloud |
| Phân tích ngữ cảnh bằng Gemini AI (tùy chọn) | Huấn luyện AI tùy chỉnh |
| Phát âm audio US/UK | Nhận diện giọng nói (Speech-to-text) |

---

## 2. Kiến trúc tổng thể & Cấu trúc Module

### 2.1 Sơ đồ kiến trúc phân tầng

```
obsidian-english-study/
├── main.ts                        # Entry point: Vòng đời plugin (onload/onunload)
├── manifest.json                  # Metadata plugin cho Obsidian
├── styles.css                     # CSS đồng bộ 100% với Obsidian theme tokens
├── esbuild.config.mjs             # Build config: CJS, es2018, externals
├── package.json
├── tsconfig.json
├── src/
│   ├── types/
│   │   └── index.ts               # Interfaces: LookupResult, PluginSettings, VocabEntry
│   ├── services/
│   │   ├── provider/
│   │   │   ├── BaseProvider.ts     # Lớp trừu tượng: requestUrl wrapper chung (chống CORS)
│   │   │   ├── FreeDictService.ts  # Free Dictionary API (IPA, từ loại, audio MP3)
│   │   │   ├── GoogleTranslate.ts  # Google Translate Web Endpoint (dịch câu nhanh)
│   │   │   ├── GeminiService.ts    # Gemini Flash API (phân tích ngữ cảnh chuyên sâu)
│   │   │   └── ProviderManager.ts  # Bộ điều phối: phân loại 3 mức + cache LRU + fallback
│   │   └── storage/
│   │       └── VocabService.ts     # Ghi từ vựng vào Vault (atomic write, chống trùng lặp)
│   ├── ui/
│   │   ├── FloatingTrigger.ts      # Icon nhỏ nổi khi bôi đen (ngăn popup nhảy bừa bãi)
│   │   ├── FloatingPopover.ts      # Popup chi tiết: nghĩa, IPA, audio, nút Lưu, nút Ghim
│   │   ├── SidebarView.ts          # ItemView thanh bên: lịch sử + chi tiết sâu
│   │   └── SettingsTab.ts          # Màn hình cài đặt 4 nhóm
│   └── utils/
│       ├── domHelper.ts            # Tính toán tọa độ Popover (chống tràn viền)
│       ├── textParser.ts           # Trích xuất câu ngữ cảnh đa dòng, xử lý Markdown
│       ├── textCleaner.ts          # Làm sạch dấu câu & ký tự Markdown bao quanh
│       ├── vocabFormatter.ts       # Định dạng dòng bảng/callout, escape ký tự đặc biệt
│       └── lruCache.ts             # Bộ nhớ đệm LRU trong RAM cho phiên làm việc
└── __mocks__/
    └── obsidian.ts                 # Mock requestUrl, Notice, Vault cho Unit Test
```

### 2.2 Trách nhiệm 4 tầng

1. **Event & Selection Layer (`main.ts`)**: Bắt sự kiện bôi đen qua `registerDomEvent(document, 'mouseup')` và `registerDomEvent(document, 'keyup')`. Đăng ký Commands cho Obsidian Command Palette. Quản lý vòng đời toàn bộ UI components.

2. **Provider Layer (`src/services/provider/`)**: Nhận text đã làm sạch + câu ngữ cảnh, tự động phân loại và gọi đúng engine, trả về `LookupResult` chuẩn hóa.

3. **UI Layer (`src/ui/`)**: Hiển thị Floating Trigger → Floating Popover → Pin to Sidebar. Tự động dismiss khi scroll hoặc đổi tab.

4. **Storage Layer (`src/services/storage/`)**: Ghi từ vựng an toàn vào Vault bằng `vault.process()` đồng bộ.

### 2.3 Cấu hình Build (`esbuild.config.mjs`)

- **Format**: `cjs` (CommonJS — bắt buộc bởi Obsidian)
- **Target**: `es2018`
- **Bundle**: `true`
- **External**: `["obsidian", "electron", "@codemirror/*", "@lezer/*"]` và Node.js builtins
- **Output**: `main.js` tại thư mục gốc plugin

---

## 3. Cơ chế bắt sự kiện bôi đen (Selection Detection)

> [!IMPORTANT]
> Sự kiện `workspace.on('editor-change')` **KHÔNG** kích hoạt khi bôi đen text.
> Nó chỉ kích hoạt khi nội dung tài liệu bị thay đổi (gõ, xóa, paste).

### 3.1 Giải pháp: DOM Events + Debounce

```typescript
// main.ts — onload()
this.registerDomEvent(document, 'mouseup', () => this.handleSelectionDebounced());
this.registerDomEvent(document, 'keyup', (e: KeyboardEvent) => {
  if (['ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight',
       'ArrowUp', 'ArrowDown'].includes(e.code)) {
    this.handleSelectionDebounced();
  }
});

// Auto-dismiss khi scroll hoặc đổi tab
this.registerEvent(
  this.app.workspace.on('active-leaf-change', () => this.dismissPopover())
);
```

### 3.2 Cơ chế Trigger 3 nấc (chống phiền người dùng)

| Nấc | Hành vi | Mục đích |
| :--- | :--- | :--- |
| **Nấc 1: Floating Trigger Icon** | Khi bôi đen xong, hiện icon nhỏ `[📖]` (20x20px, mờ nhẹ) ở mép trên vùng chọn | Không tự nhảy popup gây phiền |
| **Nấc 2: Click Icon hoặc Phím tắt** | Click vào icon hoặc dùng phím tắt → mở Floating Popover | Kích hoạt chủ động |
| **Nấc 3: Tùy chọn Auto-popup** | Bật trong Settings để popup tự hiện khi bôi đen | Cho người dùng thích trải nghiệm tức thì |

### 3.3 Đăng ký Commands (không gắn hotkey mặc định)

> [!NOTE]
> Obsidian guideline yêu cầu plugin không nên đặt hotkey mặc định để tránh xung đột.
> Người dùng tự cấu hình phím tắt trong Settings → Hotkeys.

```typescript
this.addCommand({
  id: 'lookup-selected-text',
  name: 'Tra từ điển / Dịch câu bôi đen',
  editorCheckCallback: (checking, editor) => {
    const hasSelection = editor.getSelection().trim().length > 0;
    if (checking) return hasSelection;
    this.handleLookup(editor);
  }
});

this.addCommand({
  id: 'save-to-vocabulary',
  name: 'Lưu từ vựng vào sổ',
  editorCheckCallback: (checking, editor) => {
    if (checking) return this.hasActiveLookupResult();
    this.saveCurrentResult();
  }
});
```

---

## 4. Luồng dữ liệu & Cơ chế dịch/tra từ (Data Flow)

### 4.1 Pipeline xử lý tổng thể

```
Bôi đen text
    │
    ▼
textCleaner.ts ── Lọc dấu câu & ký tự Markdown bao quanh
    │               ("hypothesis," → "hypothesis")
    │               ("**crucial**" → "crucial")
    ▼
textParser.ts ── Trích xuất câu ngữ cảnh đa dòng
    │              (Tìm ranh giới câu: ., !, ?)
    │              (Bỏ qua viết tắt: Mr., Dr., e.g., i.e.)
    │              (Dual output: bản sạch cho API + bản gốc cho sổ từ)
    ▼
ProviderManager.ts ── Phân loại 3 mức + Kiểm tra Cache
    │
    ├─ Cache HIT → Trả kết quả ngay (0ms)
    │
    ├─ Mức 1: Từ đơn (1 từ)
    │   ├─ Promise.allSettled([FreeDictService, GoogleTranslate])
    │   └─ Nếu Dict 404 → Fallback: bỏ hậu tố (-ing, -ed, -s) rồi thử lại
    │
    ├─ Mức 2: Cụm từ ngắn (≤ 4 từ, không dấu ngắt câu)
    │   ├─ Ưu tiên tra Dict trước (phrasal verb / idiom)
    │   └─ Nếu Dict 404 → Chuyển sang dịch câu
    │
    └─ Mức 3: Câu/Đoạn văn (> 4 từ hoặc có dấu câu)
        ├─ Nếu có Gemini Key → Gửi kèm câu ngữ cảnh cho AI phân tích
        └─ Nếu không → Google Translate dịch nhanh
    │
    ▼
LookupResult (chuẩn hóa) → Popover / Sidebar
```

### 4.2 Quy tắc phân loại 3 mức (3-Tier Classification)

```typescript
classify(cleanText: string): 'word' | 'phrase' | 'sentence' {
  const words = cleanText.split(/\s+/);
  const hasSentenceEnd = /[.!?]\s*$/.test(cleanText);

  if (words.length === 1) return 'word';
  if (words.length <= 4 && !hasSentenceEnd) return 'phrase';
  return 'sentence';
}
```

### 4.3 Cơ chế xử lý từ biến thể (Inflection Fallback)

Khi Free Dictionary API trả về 404 cho từ chia thì (`went`, `running`, `hypotheses`):

1. Thử bỏ hậu tố phổ biến: `-ing`, `-ed`, `-s`, `-es`, `-ies→y`, `-ied→y`
2. Nếu vẫn 404 → Fallback sang Google Translate để lấy nghĩa tiếng Việt
3. Nếu bật Gemini → AI tự phân tích dạng gốc và vai trò ngữ pháp

### 4.4 Bộ nhớ đệm LRU (`lruCache.ts`)

- Dung lượng: 200 entries (đủ cho một buổi học dài)
- Key: `cleanText.toLowerCase()`
- Tự động xóa entry cũ nhất khi đầy
- Reset khi đóng Obsidian hoặc reload plugin

### 4.5 Cơ chế Debounce & Rate-limit

Plugin sử dụng **2 cơ chế debounce riêng biệt** cho 2 mục đích khác nhau:

1. **Selection Debounce (150ms)** — trong `main.ts`: Sau khi `mouseup`/`keyup`, chờ 150ms rồi mới kiểm tra `editor.getSelection()` và hiện Floating Trigger Icon. Mục đích: tránh xử lý khi người dùng đang kéo chuột liên tục.

2. **API Request Debounce (250ms)** — trong `ProviderManager.ts`: Sau khi Floating Trigger Icon được click (hoặc hotkey được bấm), chờ 250ms rồi mới gửi request lên API. Mục đích: nếu người dùng bôi đen sửa lại vùng chọn ngay sau khi click, hủy request cũ và gửi request mới.

- **Chống spam 429**: Nếu Google Translate trả về 429 Too Many Requests, tự động chuyển sang URL dịch dự phòng (cấu hình được trong Settings, mặc định: Lingva Translate public instance)
- **In-flight Dedup**: Nếu request đang bay cho cùng một text → bỏ qua request mới
- **`AbortController`**: Hủy request cũ khi người dùng kích hoạt tra từ mới

### 4.6 Cấu trúc dữ liệu chuẩn hóa (Data Contract)

```typescript
export interface LookupResult {
  query: string;                 // Từ hoặc câu gốc được bôi đen
  type: 'word' | 'phrase' | 'sentence';
  contextSentence: string;       // Câu trích xuất từ bài đọc (giữ nguyên Markdown)
  contextSentenceClean: string;  // Câu đã lọc Markdown (gửi cho API)
  phonetic?: string;             // Phiên âm IPA
  audioUrl?: string;             // Link MP3 phát âm (nếu có)
  vietnameseTranslation: string;
  definitions?: Array<{
    partOfSpeech: string;        // noun, verb, adjective...
    meaningEn: string;
    example?: string;
  }>;
  aiGrammarNote?: string;        // Phân tích từ Gemini (nếu bật)
  timestamp: number;
}
```

---

## 5. Thiết kế Giao diện (UI/UX)

### 5.1 Floating Popover — Layout chi tiết

```
┌───────────────────────────────────────────────────────────┐
│ 🔊 /haɪˈpɑː.θə.sɪs/             [📌 Ghim Sidebar] [✖]  │
│ HYPOTHESIS  (noun)                                        │
├───────────────────────────────────────────────────────────┤
│ 💡 Nghĩa: Giả thuyết, giả định khoa học                   │
│ 🇬🇧 An idea or explanation based on known facts            │
│    but not yet proved.                                    │
├───────────────────────────────────────────────────────────┤
│ 📝 "...the **hypothesis** was tested thoroughly..."        │
├───────────────────────────────────────────────────────────┤
│ [ 💾 Lưu vào Sổ từ vựng ]              [ 📋 Copy nghĩa ]  │
└───────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Không dùng `EditorSuggest`** — API đó chỉ dành cho autocomplete khi gõ.
> Phải tự xây dựng Floating DOM Element định vị theo `window.getSelection().getRangeAt(0).getBoundingClientRect()`.

### 5.2 Kỹ thuật hiển thị Popover (`FloatingPopover.ts`)

```typescript
showPopover(result: LookupResult) {
  this.dismiss(); // Xóa popover cũ nếu có

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const rect = selection.getRangeAt(0).getBoundingClientRect();

  this.popoverEl = createEl('div', { cls: 'english-study-popover' });
  this.renderContent(this.popoverEl, result);
  document.body.appendChild(this.popoverEl);

  // Định vị thông minh — chống tràn viền màn hình
  const pos = calculatePosition(rect, this.popoverEl, window.innerWidth, window.innerHeight);
  this.popoverEl.style.top = `${pos.top}px`;
  this.popoverEl.style.left = `${pos.left}px`;
}
```

### 5.3 Auto-dismiss Popover

| Sự kiện | Hành vi |
| :--- | :--- |
| Click ra ngoài Popover | Ẩn Popover + Trigger Icon |
| Scroll trong Editor | Ẩn Popover + Trigger Icon |
| Đổi tab (`active-leaf-change`) | Ẩn Popover + Trigger Icon |
| Bấm `Esc` | Ẩn Popover + Trigger Icon |
| Bôi đen text mới | Ẩn Popover cũ → Hiện Trigger Icon mới |

### 5.4 Sidebar View (`SidebarView.ts`)

- Kế thừa `ItemView` của Obsidian, icon: `book-open` (Lucide)
- **Tab Chi tiết sâu (Deep Dive)**: Toàn bộ các tầng nghĩa, synonyms, antonyms, phân tích Gemini
- **Tab Lịch sử phiên học (Session History)**: Danh sách từ đã tra hôm nay, click để xem lại từ cache

```typescript
export const VIEW_TYPE_ENGLISH_STUDY = 'english-study-sidebar';

export class EnglishStudySidebar extends ItemView {
  getViewType() { return VIEW_TYPE_ENGLISH_STUDY; }
  getDisplayText() { return 'English Study'; }
  getIcon() { return 'book-open'; }

  async onOpen() {
    const container = this.contentEl;
    container.empty();
    container.createEl('h4', { text: 'English Study' });
    // Render tabs: Deep Dive | Session History
  }

  async onClose() { /* cleanup */ }
}
```

### 5.5 Phím tắt không cướp Focus

- Popover **KHÔNG** cướp focus con trỏ soạn thảo
- Thao tác lưu từ: Click nút "Lưu vào sổ từ vựng" trên Popover, hoặc dùng Command Palette
- Phím `Enter` luôn thuộc về Editor (xuống dòng), không bị hijack

### 5.6 Hệ màu CSS — 100% Obsidian Theme Tokens

```css
.english-study-popover {
  background: var(--background-floating);
  border: 1px solid var(--background-modifier-border);
  box-shadow: var(--shadow-l);
  border-radius: var(--radius-m);
  color: var(--text-normal);
  font-size: var(--font-ui-small);
  z-index: var(--layer-popover);
  max-width: 420px;
  position: fixed;
}

.english-study-popover .vocab-highlight {
  color: var(--text-accent);
  font-weight: 600;
}

.english-study-popover .translation-text {
  color: var(--text-normal);
}

.english-study-popover .muted-text {
  color: var(--text-muted);
}

.english-study-popover button {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-radius: var(--radius-s);
}
```

---

## 6. Cơ chế lưu trữ sổ từ vựng (Vault Storage)

### 6.1 Cấu hình

- **Đường dẫn file**: Người dùng tự chọn (mặc định: `Vocabulary.md`)
- **Hỗ trợ Daily Note**: Tùy chọn chèn vào Daily Note (`Daily Notes/YYYY-MM-DD.md`)
- **Tự động tạo file**: Nếu file chưa tồn tại, plugin tự tạo kèm header chuẩn

### 6.2 Hai định dạng lưu trữ

**Chuẩn 1: Bảng Markdown (Table — Mặc định)**

```markdown
## Sổ từ vựng tiếng Anh

| Từ / Cụm từ | Loại từ & Phiên âm | Nghĩa tiếng Việt | Câu ngữ cảnh | Ngày |
| :--- | :--- | :--- | :--- | :--- |
| **hypothesis** | *n.* `/haɪˈpɑː.θə.sɪs/` | Giả thuyết | the **hypothesis** was tested thoroughly | 2026-10-18 |
```

**Chuẩn 2: Khối Callout (Tương thích Flashcard)**

```markdown
> [!vocab] hypothesis
> - **Phiên âm**: `/haɪˈpɑː.θə.sɪs/` (*noun*)
> - **Nghĩa**: Giả thuyết, giả định khoa học
> - **Ngữ cảnh**: the **hypothesis** was tested thoroughly
> - **Thẻ**: #vocabulary #english-learning
```

### 6.3 Thuật toán ghi file an toàn (Smart Table Row Insertion)

> [!IMPORTANT]
> Callback trong `vault.process()` phải hoàn toàn đồng bộ.
> Mọi thao tác mạng phải hoàn tất TRƯỚC khi gọi `vault.process()`.

```typescript
async saveVocab(result: LookupResult): Promise<void> {
  // Bước 1: Chuẩn bị dữ liệu (đồng bộ, không cần mạng)
  const row = formatVocabRow(result); // escape "|" → "\|"

  // Bước 2: Lấy file hoặc tạo mới
  let file = this.app.vault.getAbstractFileByPath(this.settings.vocabPath);
  if (!file) {
    await this.app.vault.create(this.settings.vocabPath, getDefaultTemplate());
    file = this.app.vault.getAbstractFileByPath(this.settings.vocabPath);
  }

  if (!(file instanceof TFile)) return;

  // Bước 3: Ghi nguyên tử — callback đồng bộ
  await this.app.vault.process(file, (content) => {
    // Kiểm tra trùng lặp
    if (content.includes(`| **${result.query}**`)) {
      // Cập nhật thêm ngữ cảnh mới thay vì ghi đè
      return appendContextToExisting(content, result);
    }
    // Tìm vị trí cuối bảng (trước dòng trống hoặc tiêu đề mới)
    return insertRowAtTableEnd(content, row);
  });

  new Notice(`✅ Đã lưu "${result.query}" vào sổ từ vựng!`);
}
```

### 6.4 Bảo vệ ký tự đặc biệt

- Ký tự `|` trong câu/nghĩa → tự động escape thành `\|`
- Ký tự xuống dòng trong câu → thay bằng khoảng trắng
- Từ được tra → tự động bôi đậm (`**word**`) trong câu ngữ cảnh

---

## 7. Quản lý lỗi & Khả năng phục hồi (Error Handling)

### 7.1 Chiến lược Fail Gracefully

| Loại lỗi | Phát hiện | Xử lý tự động |
| :--- | :--- | :--- |
| **Mạng timeout** | `requestUrl` > 3.5s | Hủy request, kiểm tra cache. Nếu miss → hiện *"Mạng gián đoạn - Bấm thử lại"* |
| **Từ hiếm / Chia thì (404)** | Free Dict trả 404 | Thử bỏ hậu tố → Nếu vẫn 404 → Fallback Google Translate |
| **Gemini API lỗi** | Key sai / hết quota / 5xx | Badge cảnh báo *"Gemini không khả dụng - Tạm dùng Free Mode"* |
| **Ghi Vault thất bại** | Đường dẫn sai / file bị khóa | `new Notice("Không thể ghi...")` + lưu tạm vào cache |
| **Audio không tải được** | URL MP3 lỗi 404/timeout | Fallback `window.speechSynthesis` (Web Speech API) |
| **Rate-limit 429** | Google Translate trả 429 | Chuyển sang mirror endpoint dự phòng |

### 7.2 Request Dedup & Cancellation

- Debounce chi tiết: xem Mục 4.5
- Nếu request đang bay (`in-flight`) cho cùng một text → bỏ qua request mới
- `AbortController` để hủy request cũ khi người dùng bôi đen text mới

---

## 8. Màn hình Cài đặt (Settings Tab)

### 8.1 Cấu trúc Settings

```typescript
export interface PluginSettings {
  // Nhóm 1: Tương tác đọc
  triggerMode: 'icon' | 'hotkey-only' | 'auto-popup';

  // Nhóm 2: Sổ từ vựng
  vocabFilePath: string;          // Mặc định: "Vocabulary.md"
  vocabFormat: 'table' | 'callout';
  useDailyNote: boolean;          // Nếu bật: chèn vào Daily Note thay vì vocabFilePath
  highlightWordInContext: boolean; // Tự động bôi đậm từ trong câu ngữ cảnh

  // Nhóm 3: Dịch thuật & AI
  translateEndpointUrl: string;   // Mặc định: "translate.googleapis.com" (cấu hình được)
  geminiApiKey: string;
  enableAiGrammar: boolean;       // Phân tích ngữ pháp AI

  // Nhóm 4: Phát âm
  preferredAccent: 'us' | 'uk';
  autoPlayAudio: boolean;         // Tự phát âm khi tra từ đơn
}
```

> [!NOTE]
> **Tích hợp Daily Note**: Khi `useDailyNote = true`, plugin đọc cấu hình đường dẫn
> từ Daily Notes core plugin (nếu đang bật) để xác định file hôm nay.
> Nếu Daily Notes core plugin không bật, tùy chọn này bị vô hiệu hóa và dùng `vocabFilePath`.

### 8.2 Bảo mật API Key

> [!WARNING]
> File `data.json` chứa settings (bao gồm API Key) có thể bị commit lên Git.
> Nếu dùng plugin Obsidian Git, hãy thêm `data.json` vào `.gitignore`.

- Hiển thị cảnh báo trực quan ngay trong Settings Tab
- Ô nhập API Key dùng `type: password` (ẩn ký tự)
- Nút "Test kết nối" để xác minh key hợp lệ trước khi lưu

---

## 9. Giao tiếp mạng — `BaseProvider` & `requestUrl`

### 9.1 Lớp trừu tượng BaseProvider

Toàn bộ HTTP requests đều đi qua `requestUrl` của Obsidian API (bypass CORS hoàn toàn):

```typescript
import { requestUrl, RequestUrlParam } from 'obsidian';

export abstract class BaseProvider {
  protected async fetchJson<T>(
    url: string,
    options?: Partial<RequestUrlParam>
  ): Promise<T | null> {
    try {
      const res = await requestUrl({
        url,
        method: 'GET',
        throw: false,
        ...options
      });
      return res.status === 200 ? (res.json as T) : null;
    } catch {
      return null;
    }
  }
}
```

### 9.2 Các Provider cụ thể

| Provider | Endpoint | Dữ liệu trả về |
| :--- | :--- | :--- |
| `FreeDictService` | `api.dictionaryapi.dev/api/v2/entries/en/{word}` | IPA, từ loại, định nghĩa Anh-Anh, audio URL |
| `GoogleTranslate` | `translate.googleapis.com` (không chính thức, có thể bị chặn — URL cấu hình được trong Settings, fallback: Lingva Translate) | Bản dịch tiếng Việt |
| `GeminiService` | `generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash` | Phân tích ngữ cảnh, ngữ pháp, thành ngữ |

---

## 10. Chiến lược kiểm thử (Testing Strategy)

### 10.1 Nguyên tắc: Pure Logic Separation

> [!NOTE]
> Gói `obsidian` trên npm **chỉ chứa file `.d.ts`** (type definitions), không có mã JavaScript.
> Không thể import trực tiếp trong test runner.

**Giải pháp**: Tách logic thuần (không phụ thuộc Obsidian API) ra các module độc lập:

| Module thuần (testable trực tiếp) | Module phụ thuộc Obsidian (cần mock) |
| :--- | :--- |
| `textParser.ts` — trích xuất câu | `VocabService.ts` — ghi file Vault |
| `textCleaner.ts` — làm sạch text | `FloatingPopover.ts` — DOM manipulation |
| `lruCache.ts` — bộ nhớ đệm | `main.ts` — registerDomEvent, addCommand |
| `vocabFormatter.ts` — định dạng bảng/callout | Provider services — requestUrl |

### 10.2 Kịch bản Unit Test

**`textParser.test.ts`**:
- Trích xuất đúng câu chứa từ viết tắt: *"Dr. Watson visited Mr. Holmes."* → chọn "visited" → lấy cả câu
- Xử lý câu kéo dài qua nhiều dòng Markdown
- Bỏ qua số thập phân: *"The value was 3.14 approximately."*

**`textCleaner.test.ts`**:
- `"hypothesis,"` → `hypothesis`
- `"**crucial**"` → `crucial`
- `"(effective)"` → `effective`
- `"[[wiki-link]]"` → `wiki-link`

**`ProviderManager.test.ts`**:
- `"apple"` (1 từ) → type `word`
- `"give up"` (2 từ, ≤ 4) → type `phrase`
- `"This is a long sentence."` (> 4 từ, có dấu chấm) → type `sentence`
- Cache hit: tra cùng từ lần 2 → trả về từ RAM

**`vocabFormatter.test.ts`**:
- Escape ký tự `|` trong câu → `\|`
- Chèn dòng đúng vị trí cuối bảng (không nhảy xuống dưới tiêu đề phụ)
- Phát hiện trùng lặp → append ngữ cảnh mới thay vì tạo dòng mới

### 10.3 Mock Obsidian (`__mocks__/obsidian.ts`)

```typescript
export const requestUrl = jest.fn();
export class Notice { constructor(public message: string) {} }
export class Plugin {}
export class ItemView {}
// ... các class cần thiết khác
```

### 10.4 Kiểm thử tích hợp thủ công (Reality Check)

- Build `main.js` → Copy vào `.obsidian/plugins/obsidian-english-study/`
- Kiểm tra: bôi đen từ đơn, cụm từ, câu dài
- Kiểm tra: scroll dismiss, đổi tab dismiss, đổi theme Dark/Light
- Kiểm tra: lưu từ vựng vào file, kiểm tra định dạng bảng/callout
- Kiểm tra: mất mạng → thông báo nhẹ nhàng, không crash

---

## 11. Tổng kết các quyết định kiến trúc

| # | Quyết định | Lý do |
| :--- | :--- | :--- |
| 1 | Dùng `registerDomEvent(mouseup/keyup)` thay vì `editor-change` | `editor-change` không bắt được sự kiện bôi đen |
| 2 | Tự xây Floating DOM thay vì `EditorSuggest` | `EditorSuggest` chỉ dành cho autocomplete khi gõ |
| 3 | `vault.process()` với callback đồng bộ | API yêu cầu callback synchronous, fetch data trước |
| 4 | Không gắn hotkey mặc định | Obsidian guideline: tránh xung đột phím tắt |
| 5 | CSS dùng 100% Obsidian theme tokens | Tương thích mọi theme cộng đồng |
| 6 | Phân loại 3 mức (word/phrase/sentence) | Bắt đúng phrasal verbs và thành ngữ ngắn |
| 7 | `requestUrl` thay vì `fetch` | Bypass CORS, hoạt động trên cả Desktop & Mobile |
| 8 | Pure Logic Separation cho testing | Gói `obsidian` npm không có JS runtime |
