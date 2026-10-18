# Immersive Reading Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bổ sung bản dịch ngay dưới từng đoạn trong Reading Mode, có nền nổi rõ và chữ đậm, bật/tắt theo từng khung đọc và không sửa ghi chú gốc.

**Architecture:** Thêm module `src/reading/` sở hữu việc nhận diện khối, hàng đợi dịch, DOM bản dịch và vòng đời phiên đọc. Tích hợp qua Markdown post processor và `MarkdownRenderChild`; tái sử dụng GoogleTranslate/GeminiService, không gọi pipeline xuất file song ngữ hiện tại.

**Tech Stack:** TypeScript, Obsidian API, DOM/CSS, esbuild, Vitest 1.6; bổ sung jsdom 26.1.0 chỉ cho kiểm thử DOM. Máy khảo sát có Node 24.19.0; metadata npm của jsdom 26.1.0 yêu cầu Node >=18.

**Spec:** [2026-10-18-immersive-reading-translation-design.md](../specs/2026-10-18-immersive-reading-translation-design.md), được người dùng duyệt ngày 2026-10-18.

**Status:** Người dùng đã duyệt và chọn Native. Đã triển khai, review toàn nhánh, sửa hai lỗi Important bằng test hồi quy và kiểm thử cục bộ. Chờ quyết định tích hợp nhánh.

## Global Constraints

- Bản dịch chỉ hiển thị khi đọc trong Reading Mode; tính năng mặc định tắt.
- Có thể bật/tắt bản dịch; không sửa file Markdown gốc.
- Kiểu nhấn được chọn: **nền nổi rõ + chữ đậm hơn**.
- Nền: điểm khởi đầu là 20% accent trên nền chính của theme; fallback nền phụ nếu không hỗ trợ `color-mix`.
- Viền dọc 4px; chữ độ đậm 600; padding 12px; khoảng cách 8px từ đoạn gốc và 16px trước cặp tiếp theo; bo góc 6px; không bóng đổ.
- Giữ cỡ chữ đọc hiện tại; không in nghiêng toàn đoạn; tương phản chữ thường ít nhất 4.5:1 trong theme được kiểm chứng.
- Google tối đa 2 request đồng thời; Gemini 1 batch tại một thời điểm, tối đa 8 khối mỗi batch; ưu tiên viewport và vùng đệm 300px.
- Cache riêng trong RAM, LRU tối đa 200 kết quả thành công; không lưu ra Vault hoặc ổ đĩa.
- Không tự retry vô hạn, đổi provider hoặc gọi phân tích ngữ pháp cho mỗi đoạn.
- Tắt/hủy bỏ phản hồi cũ kể cả request cuối; không tuyên bố hủy được HTTP đang bay qua `requestUrl`.
- Không dịch code, công thức, bảng, embed, HTML tương tác hoặc DOM do renderer dịch thêm vào.
- Không dùng credential, gọi Gemini thật hoặc ghi vào Vault cá nhân khi chưa có cho phép riêng.
- Không sửa lỗi audit không liên quan, không tích hợp SDK Immersive Translate, không thêm dịch trong Edit Mode hoặc chức năng xuất file mới.

## Review Focus

1. Hai pane mở cùng source path: bật/tắt, metadata và callback chỉ tác động đúng pane — Task 4 và Task 5.
2. List lồng có cả text trực tiếp và paragraph: dịch từng nhóm đúng một lần, không dịch lại nội dung cha/con và không thay node gốc — Task 1.
3. Tắt đúng lúc request cuối hoàn thành hoặc sau khi cấu hình đổi: không tái chèn bản dịch, không cache kết quả đã bị vô hiệu hóa — Task 2 và Task 4.
4. Section render lại hoặc pane ở cửa sổ khác: dọn observer/listener và dùng `ownerDocument`, không giữ node cũ — Task 3 và Task 4.
5. Provider trả HTML, thiếu batch ID, làm mất token hoặc chọn đích `zh`/`ja`: hiển thị an toàn, lỗi thật và prompt đúng ngôn ngữ — Task 2 và Task 3.

## File Structure and Interfaces

| File | Trách nhiệm |
| --- | --- |
| `src/types/index.ts` | Thêm `readingTranslationEngine`, mặc định `google`; giữ nguyên các thiết lập hiện có |
| `src/reading/types.ts` | Hợp đồng nội bộ của khối, cấu hình, công việc, kết quả và phiên dịch |
| `src/reading/blockExtractor.ts` | Tách khối và bảo toàn inline; không ghi hoặc thay DOM gốc |
| `src/reading/ReadingTranslationService.ts` | Scheduler dùng chung, phiên hủy được, cache và adapter provider |
| `src/reading/ReadingTranslationRenderer.ts` | DOM trạng thái/bản dịch và nút thử lại; không nhận `App` hoặc `Vault` |
| `src/reading/ReadingTranslationController.ts` | Vòng đời theo view, post processor, viewport, metadata và chống callback cũ |
| `src/reading/registerReadingTranslation.ts` | Adapter có type API Obsidian thật: đăng ký controller và command cho plugin |
| `src/services/provider/GeminiService.ts` | Chỉnh riêng hợp đồng batch để tôn trọng nguồn/đích và token được bảo toàn |
| `main.ts`, `src/ui/SettingsTab.ts`, `styles.css` | Nối tính năng, chọn engine và kiểu hiển thị đã duyệt |
| `tests/reading/*.test.ts`, `tests/helpers/reading.ts`, `tests/fixtures/reading-note.html` | Kiểm thử DOM thực, race và integration offline |
| `package.json`, `package-lock.json`, `tsconfig.reading.json` | Dependency kiểm thử và typecheck phần mới bằng Obsidian thật |

Các tên dưới đây là giao diện đã chọn, dùng thống nhất giữa các task:

```ts
type ReadingEngine = 'google' | 'gemini';
interface ReadingProtectedFragment { token: string; node: Node }
interface ReadingBlock {
  id: string;
  kind: 'heading' | 'paragraph' | 'list-item';
  sourceNodes: readonly Node[];
  anchor: { parent: HTMLElement; before: Node | null };
  text: string;                    // Văn bản gửi provider, đã thay inline bằng token.
  cacheSeed: string;               // Bao gồm text và nội dung inline để không va cache.
  fragments: readonly ReadingProtectedFragment[];
  heading?: string;
}
interface ReadingTranslationConfig {
  engine: ReadingEngine; sourceLang: string; targetLang: string;
  endpointUrl: string; apiKey: string; model: string;
}
interface ReadingTranslationJob {
  blockId: string; text: string; cacheSeed: string;
  protectedTokens: readonly string[]; context?: DocumentContextMeta;
}
type ReadingTranslationResult =
  | { status: 'success'; text: string }
  | { status: 'error'; code: 'provider' | 'empty' | 'missing-key' | 'invalid-tokens' }
  | { status: 'cancelled' };
interface ReadingTranslationSession {
  enqueue(job: ReadingTranslationJob): Promise<ReadingTranslationResult>;
  cancel(): void;
}
```

Đặt `ReadingEngine` cạnh `PluginSettings` trong `src/types/index.ts`; các type còn lại nằm trong `src/reading/types.ts`, dùng `import type` cho `ReadingEngine` và `DocumentContextMeta` từ `src/types/index.ts`. Đây là hợp đồng riêng của chế độ đọc, không thay `LookupResult` hoặc hợp đồng xuất file hiện tại.

## Task 1: Extract blocks and protect inline content

**Files:** Create `src/reading/types.ts`, `src/reading/blockExtractor.ts`, `tests/reading/blockExtractor.test.ts`, `tests/helpers/reading.ts`, `tests/fixtures/reading-note.html`, `tsconfig.reading.json`; modify `src/types/index.ts`, `package.json`, `package-lock.json`.

**Interfaces:**
- Consumes DOM của một section thuộc Reading Mode và `DocumentContextMeta` hiện có.
- Produces `extractReadingBlocks(root: HTMLElement): ReadingBlock[]` và `restoreReadingFragments(text: string, fragments: readonly ReadingProtectedFragment[], doc: Document): DocumentFragment | null`.
- Test helper `mountReadingHtml(html: string): HTMLElement` gắn HTML fixture vào `document.body`; `deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void }` điều khiển phản hồi chậm.

- [x] **Step 1:** Gắn jsdom vào test DOM qua comment `// @vitest-environment jsdom`, giữ môi trường Node mặc định của suite cũ. Cài `npm install --save-dev --save-exact jsdom@26.1.0`; tạo fixture gồm heading, paragraph, list lồng, trắc nghiệm, code, math, bảng, embed và blockquote bình thường. Không cài package runtime cho plugin.
- [x] **Step 2:** Viết `extracts_each_inline_run_once_without_mutating_original_nodes` với fixture `<ul><li>Outer <code>x()</code><p>Paragraph</p><ul><li>Inner</li></ul>Tail</li></ul>`, cùng `protects_math_code_and_preserves_user_blockquotes`:

```ts
expect(blocks.map(b => b.kind)).toEqual(['list-item', 'paragraph', 'list-item', 'list-item']);
expect(root.innerHTML).toBe(beforeHtml);
expect(root.querySelector('code')).toBe(originalCodeNode);
expect(blocks.some(b => b.text.includes('x()'))).toBe(false);
expect(extractReadingBlocks(quoteRoot)).toHaveLength(1);
expect(extractReadingBlocks(technicalOnlyRoot)).toHaveLength(0);
```

- [x] **Step 3:** Chạy `npm test -- tests/reading/blockExtractor.test.ts`; xác nhận RED do module/chức năng chưa tồn tại, không phải thiếu environment.
- [x] **Step 4:** Cài extractor theo từng nhóm node inline liên tục. Heading/paragraph đặt anchor sau phần tử; text trực tiếp trong `li` đặt anchor bên trong `li`, trước block tiếp theo để không chèn `div` trực tiếp dưới `ul/ol`. Không lấy cả text của nested list. Bỏ ancestor kỹ thuật/interactivity và class `.polyglot-reading-translation`. Giữ soft newline và chuyển `br` thành newline trong text gửi dịch; nếu nhiều phương án trắc nghiệm cùng một paragraph, giữ paragraph gốc nguyên vẹn và đối chiếu bằng các dòng riêng trong bản dịch bên dưới. Test cả phương án ở paragraph/list riêng lẫn chung một paragraph có `br`.
- [x] **Step 5:** Sinh token theo thứ tự inline ổn định trong mỗi khối, chọn prefix không xuất hiện trong text gốc; không dùng nonce thay đổi mỗi lần render. `cacheSeed` là JSON của masked text và các loại/nội dung inline. Restore bằng text node xen các clone của fragment gốc; trả `null` nếu token thiếu, lặp hoặc xuất hiện token lạ. Thêm test va prefix có sẵn trong văn bản, token bị mất/lặp và đảm bảo khôi phục không chuyển node gốc. Không bắt buộc thứ tự token trong ngôn ngữ đích giống ngôn ngữ nguồn.
- [x] **Step 6:** Thêm field `readingTranslationEngine: ReadingEngine` vào `PluginSettings`, default `google`. Tạo `tsconfig.reading.json` extends cấu hình hiện có nhưng đặt `paths: {}`, `lib: ['DOM', 'DOM.Iterable', 'ES2018']`, `noEmit: true`, include `src/reading/**/*.ts`, exclude test/mock. Thêm script `typecheck:reading` chạy `tsc --project tsconfig.reading.json --noEmit`; các import provider được TypeScript theo dõi tự nhiên.
- [x] **Step 7:** Chạy test Task 1, `npm test -- tests/scaffold.test.ts`, `npm run typecheck:reading`; yêu cầu PASS. Commit đúng các file của task: `feat(reading): extract translation blocks without changing notes`.

## Task 2: Translate through bounded queues with real error states

**Files:** Create `src/reading/ReadingTranslationService.ts`, `tests/reading/ReadingTranslationService.test.ts`; modify `src/services/provider/GeminiService.ts`, `tests/services/GeminiService.test.ts`.

**Interfaces:**
- Consumes types và helper từ Task 1; `GoogleTranslate.translateWithMeta`, `GeminiService.translateBatch`, `LRUCache<T>` hiện có.
- Produces `ReadingTranslationService`, constructor nhận tùy chọn `{ google?: Pick<GoogleTranslate, 'translateWithMeta'>; gemini?: Pick<GeminiService, 'translateBatch'> }`.
- Methods: `createSession(config: ReadingTranslationConfig): ReadingTranslationSession`, `clearCache(): void`, `dispose(): void`.
- Giữ 5 tham số đầu của `translateBatch(items, apiKey, docContext?, targetLang?, model?)`; thêm tham số thứ 6 `sourceLang: string = 'auto'`, vẫn trả `Promise<Map<number, string> | null>`.

- [x] **Step 1:** Viết test dùng provider stub và deferred: `limits_google_to_two_requests`, `limits_gemini_to_one_batch_of_eight`, `does_not_cache_or_publish_last_response_after_cancel`, `separates_source_target_engine_context_and_protected_content`, `reports_provider_and_token_errors`.

```ts
expect(maxActiveGoogle).toBe(2);
expect(maxActiveGeminiBatches).toBe(1);
expect(batchSizes.every(n => n <= 8)).toBe(true);
session.cancel(); gate.resolve(successfulProviderResponse);
expect(await pending).toEqual({ status: 'cancelled' });
expect(await nullResponse).toEqual({ status: 'error', code: 'empty' });
expect(await brokenTokens).toEqual({ status: 'error', code: 'invalid-tokens' });
```

- [x] **Step 2:** Chạy `npm test -- tests/reading/ReadingTranslationService.test.ts`; xác nhận RED.
- [x] **Step 3:** Cài scheduler dùng chung cho các session của service, không tạo giới hạn concurrency riêng cho từng pane. Google gọi `translateWithMeta(text, sourceLang, targetLang, endpointUrl)`. Gemini chỉ gom job cùng session và cùng context, lấy tối đa 8 từ các job đã đủ điều kiện viewport; không gọi grammar. Request bị hủy cục bộ vẫn chiếm slot đến khi HTTP settle, nhưng không được publish/cache kết quả.
- [x] **Step 4:** Mỗi job settle đúng một lần; hủy session settle job chờ và chặn callback muộn. Lỗi HTTP/throw/null/batch thiếu ID không được biến text gốc thành success. Kiểm tra protected token trước khi cache. Lỗi do thiếu key không gửi request và không đổi provider.
- [x] **Step 5:** Dùng LRU 200 mục, chỉ lưu kết quả success. Khóa JSON giữ nguyên case của `[engine, sourceLang, targetLang, endpointUrl, model, cacheSeed, context]`; context có `noteTitle/heading/tags/folderPath` khi dùng Gemini, bỏ khi Google. Không đưa API key vào khóa/log. Thêm test 201 mục, cache hit không gọi lại provider và hai khối giống masked text nhưng khác inline không va cache.
- [x] **Step 6:** Sửa riêng prompt `translateBatch` để nêu đúng đích `vi/en/zh/ja`, nguồn rõ khi khác `auto`, bảo toàn token nguyên văn và giữ dòng/lựa chọn trắc nghiệm. Với job nhận diện được trắc nghiệm, chuẩn hóa kết quả qua `formatMultipleChoiceText` hiện có trước khi kiểm tra token/cache. Bổ sung test parse body `requestUrl`: `zh` chứa `tiếng Trung`, `ja` chứa `tiếng Nhật`, không bị mặc định thành tiếng Việt; thiếu ID chỉ làm lỗi khối tương ứng; các đáp án bị gộp trở lại thành dòng riêng. Không thay model, transport hoặc các hàm grammar ngoài nhu cầu task.
- [x] **Step 7:** Chạy `npm test -- tests/reading/ReadingTranslationService.test.ts tests/services/GeminiService.test.ts tests/services/BilingualTranslationService.test.ts` và `npm run typecheck:reading`; yêu cầu PASS. Commit: `feat(reading): schedule translations with cancellation and isolated cache`.

## Task 3: Render prominent translation blocks safely

**Files:** Create `src/reading/ReadingTranslationRenderer.ts`, `tests/reading/ReadingTranslationRenderer.test.ts`; modify `styles.css`.

**Interfaces:**
- Consumes `ReadingBlock`, `ReadingTranslationResult`, `restoreReadingFragments` từ Task 1.
- Produces `ReadingTranslationRenderer.mount(block: ReadingBlock, onRetry: () => void): ReadingTranslationView`.
- `ReadingTranslationView` có `element: HTMLElement`, `loading(): void`, `show(result: ReadingTranslationResult): void`, `dispose(): void`; định nghĩa interface trong `src/reading/types.ts`.

- [x] **Step 1:** Viết test DOM `inserts_below_source_without_modifying_it`, `renders_provider_html_as_text`, `supports_keyboard_retry_and_disposal`, `uses_the_source_owner_document`:

```ts
expect(source.nextElementSibling).toBe(view.element);
expect(source.outerHTML).toBe(originalHtml);
expect(view.element.querySelector('script, img')).toBeNull();
expect(view.element.textContent).toContain('<img src=x onerror=alert(1)>');
expect(view.element.ownerDocument).toBe(source.ownerDocument);
retryButton.click(); expect(onRetry).toHaveBeenCalledTimes(1);
view.dispose(); expect(view.element.isConnected).toBe(false);
```

- [x] **Step 2:** Chạy `npm test -- tests/reading/ReadingTranslationRenderer.test.ts`; xác nhận RED.
- [x] **Step 3:** Tạo DOM qua `sourceNodes[0].ownerDocument`, insert đúng `anchor`. Dùng `textContent` và fragment phục hồi; không dùng `innerHTML` với dữ liệu provider. `cancelled` dọn view, error cho nút **Thử lại**, loading hiện **Đang dịch…** với trạng thái truy cập. Dùng button thật; chỉ loading/error dùng thông báo trạng thái, tránh đọc lại mọi đoạn thành công qua live region.
- [x] **Step 4:** Đọc `impeccable/reference/craft-floor.md` trước khi chỉnh UI. Thêm CSS scoped `.polyglot-reading-translation` theo đúng Global Constraints; `white-space: pre-wrap`, bẻ từ dài, không ép chiều rộng, không thay style đoạn gốc. Nền fallback khai báo trước `color-mix`; màu chữ `var(--text-normal)`. Không lặp nhãn thành công hoặc thêm hiệu ứng không nằm trong thiết kế.
- [x] **Step 5:** Chạy test Task 3 và `npm run typecheck:reading`; yêu cầu PASS. Dùng fixture + renderer/CSS thật để kiểm tra có giới hạn: theme sáng/tối, pane 360px và 1024px, zoom 200%; chụp bằng chứng, kiểm tra màu computed/contrast >=4.5:1 và overflow. Nếu không có browser khả dụng, ghi `NOT_RUN` cho kiểm tra hình thức; không gọi jsdom là bằng chứng layout/contrast. Commit: `feat(reading): render prominent bilingual blocks`.

## Task 4: Own sessions by pane and renderer lifecycle

**Files:** Create `src/reading/ReadingTranslationController.ts`, `tests/reading/ReadingTranslationController.test.ts`; extend `tests/helpers/reading.ts`, `__mocks__/obsidian.ts`.

**Interfaces:**
- Consumes service Task 2, renderer Task 3, extractor Task 1, `App`, `MarkdownView`, `Component`, `MarkdownRenderChild`, `MarkdownPostProcessorContext` từ Obsidian.
- Produces `ReadingTranslationController extends Component`, constructor `(app: App, service: ReadingTranslationService, getSettings: () => PluginSettings)`.
- Public methods: `toggle(view: MarkdownView): void`, `isEnabled(view: MarkdownView): boolean`, `processSection(el: HTMLElement, ctx: MarkdownPostProcessorContext): void`, `syncWorkspace(): void`, `updateSettings(): void`.
- Test helpers: `makeReadingView(app: App, html: string, path: string): MarkdownView`; `makeReadingContext(view: MarkdownView): { ctx: MarkdownPostProcessorContext; unload(): void }`. Dùng DOM jsdom thật, provider fake và IntersectionObserver có thể chủ động emit entry trong test.

- [x] **Step 1:** Bổ sung tối thiểu mock `Component`/`MarkdownRenderChild` với load/unload/addChild/register/registerEvent và cleanup; cho mock `Plugin` kế thừa `Component`, ghi nhận `registerMarkdownPostProcessor` và trả lại callback được đăng ký. Bổ sung `MarkdownView.file/getMode/previewMode`, `View.addAction`, `Workspace.onLayoutReady`, `App.metadataCache`. Giữ nguyên helper DOM giả của suite cũ; test mới dùng DOM jsdom. `Component.addChild` chỉ tự load con khi cha đã load, đúng API thật. Test controller gọi `load()`; test integration gọi lifecycle plugin rồi đợi startup async, không giả định thêm child vào một cha chưa load sẽ tự chạy.
- [x] **Step 2:** Viết test `isolates_same_path_in_two_panes`, `ignores_final_reply_after_toggle_off`, `unloads_removed_sections_without_resetting_other_sections`, `invalidates_changed_settings_without_requesting_again`, `preserves_the_view_source_metadata`:

```ts
controller.toggle(left); expect(controller.isEnabled(left)).toBe(true);
expect(controller.isEnabled(right)).toBe(false);
controller.toggle(left); gate.resolve(providerResponse);
await flushPromises(); expect(leftRoot.querySelector('.polyglot-reading-translation')).toBeNull();
expect(rightRoot.querySelector('.polyglot-reading-translation')).toBeNull();
expect(submittedJob.context?.noteTitle).toBe('Left note');
expect(observerOptions.rootMargin).toBe('300px');
expect(offscreenProviderCalls).toBe(0);
```

- [x] **Step 3:** Chạy `npm test -- tests/reading/ReadingTranslationController.test.ts`; xác nhận RED.
- [x] **Step 4:** Cài Map keyed bằng `MarkdownView`, không keyed riêng source path. Phiên chứa source path, generation, cấu hình snapshot, section children và service session. Cấu hình mặc định `google`; đọc các field nguồn/đích/endpoint/key hiện có, model `gemini-flash-latest`. `updateSettings` so sánh field liên quan, kể cả key trong RAM; khi đổi, tắt phiên, dọn DOM, hủy job và clear cache; đổi accent/audio không kết thúc phiên.
- [x] **Step 5:** `processSection` tìm view có `getMode() === 'preview'`, `file.path === ctx.sourcePath` và `view.previewMode.containerEl.contains(el)`; loại section trong embed hoặc ngoài view. Đăng ký `MarkdownRenderChild` qua `ctx.addChild`. Callback unload dọn riêng section; kết quả chỉ được gắn nếu session/generation/path/config còn đúng và source node còn thuộc root hiện tại. Private helper `buildContext(view: MarkdownView, block: ReadingBlock): DocumentContextMeta` lấy noteTitle/folderPath/tags từ `view.file` và metadataCache, heading từ heading nguồn gần nhất phía trên trong root của chính view; không đọc file active ở pane khác.
- [x] **Step 6:** Bật phiên trước rồi gọi `view.previewMode.rerender(true)` để cả section có sẵn đi lại qua post processor; giữ và phục hồi scroll bằng `getScroll/applyScroll`. Theo dõi viewport qua IntersectionObserver có root thuộc view, `rootMargin: '300px'`; chỉ mount/enqueue khối khi vào vùng này. Nếu API observer không có, kiểm tra rect tương đối root trên scroll/resize với cùng margin, không dịch toàn bộ note như fallback. Dùng window/document của root cho observer và sự kiện để hỗ trợ popout.
- [x] **Step 7:** `onload` đăng ký `layout-change`, `file-open`, `active-leaf-change` rồi sync sau `onLayoutReady`. Sync chỉ giữ view còn tồn tại; đổi file/mode kết thúc phiên và gỡ UI. Bổ sung observer vòng đời có phạm vi view để phát hiện DOM/mode thay đổi giữa các workspace event; bỏ mutation do chính bản dịch tạo để tránh loop. `onunload` kết thúc mọi phiên, tháo icon/observer/listener và `service.dispose()`.
- [x] **Step 8:** Thêm test đoạn cuối/section bị gỡ giữa await, file/mode đổi, cùng file mở lại, view của document khác, fallback không IntersectionObserver, foreground pane đổi mà metadata vẫn đúng. Chạy test Task 4, các test Task 1–3 và `npm run typecheck:reading`; yêu cầu PASS. Commit: `feat(reading): manage pane scoped translation sessions`.

## Task 5: Integrate commands, settings and verify the complete flow

**Files:** Create `src/reading/registerReadingTranslation.ts`, `tests/reading/pluginIntegration.test.ts`; modify `main.ts`, `src/ui/SettingsTab.ts`, `tests/main.test.ts`, `tests/ui/SettingsTab.test.ts`, `README.md`, `PRODUCT.md`, spec/plan status.

**Interfaces:**
- Consumes `ReadingTranslationController` của Task 4.
- Produces `registerReadingTranslation(plugin: Plugin, getSettings: () => PluginSettings): ReadingTranslationController`; function này nằm trong phạm vi `typecheck:reading`, dùng type Obsidian thật.
- `main.ts` giữ field `readingTranslationController?: ReadingTranslationController`, khởi tạo qua factory; `saveSettings()` gọi `readingTranslationController?.updateSettings()` sau khi lưu settings.

- [x] **Step 1:** Viết integration test DOM chạy main → adapter/controller → service thật, chỉ stub HTTP/host Obsidian. Không spy thay `service.enqueue` hoặc `controller.toggle` trong test chứng minh luồng hoàn chỉnh. Dùng ghi chú fixture, observer giả phát entry và deferred HTTP cho trường hợp tắt lúc request cuối đang chờ.

```ts
expect(command.id).toBe('toggle-reading-translation');
expect(command.name).toBe('Bật/tắt dịch song ngữ khi đọc');
expect(root.querySelectorAll('.polyglot-reading-translation')).toHaveLength(expectedBlockCount);
expect(app.vault.modify).not.toHaveBeenCalled();
expect(app.vault.process).not.toHaveBeenCalled();
expect(app.vault.create).not.toHaveBeenCalled();
expect(view.editor.setValue).not.toHaveBeenCalled();
expect(originalNoteContent).toBe(noteContentAfterScenario);
```

- [x] **Step 2:** Chạy `npm test -- tests/reading/pluginIntegration.test.ts`; xác nhận RED.
- [x] **Step 3:** Factory dùng `plugin.addChild(controller)` và `plugin.registerMarkdownPostProcessor(...)`, đăng ký command kiểm tra Reading Mode. Controller tạo action icon `languages` cho mỗi Markdown view bằng `view.addAction`, cập nhật `aria-label/aria-pressed`, ẩn trong Edit Mode và gỡ khi view đóng. Không đặt hotkey mặc định. Cập nhật test command từ 7 thành 8; kiểm tra ID mới rõ ràng, giữ các assertion event cũ trừ khi hành vi thật yêu cầu đổi.
- [x] **Step 4:** Thêm nhóm cài đặt **DỊCH SONG NGỮ KHI ĐỌC**, dropdown **Công cụ dịch khi đọc**: Google Translate/Gemini; default `google`. Phân biệt nhóm xuất file cũ bằng mô tả rõ rằng nhóm đó ghi nội dung Markdown; không thay mặc định xuất file hoặc tự bật dịch khi đổi engine. Test thiếu Gemini key không gửi HTTP và không chuyển provider; AI grammar toggle không tác động lựa chọn engine đọc.
- [x] **Step 5:** Chạy các tình huống integration: bật → kết quả → tắt; bật → lỗi → Thử lại; bật → hủy request cuối; đổi nguồn/đích/endpoint/key; hai pane cùng file; đổi file/mode; unload plugin. Mọi nhánh kiểm tra không ghi note và không còn DOM bản dịch sau khi phiên kết thúc.
- [x] **Step 6:** Chạy lần lượt `npm test`, `npm run typecheck:reading`, `npm run build`, `git diff --check`. Baseline khảo sát là 337 test/21 file pass; full `tsc --noEmit` có 55 lỗi trước thay đổi (8 mock, 9 application, 38 test). Chạy full typecheck để đối chiếu và ghi kết quả thực; không ép sửa lỗi cũ ngoài phạm vi hoặc báo toàn project typecheck pass khi chỉ scoped check pass. Build thay `main.js` bị Git ignore là đầu ra dự kiến ở bước triển khai, không commit bundle.
- [x] **Step 7:** Cập nhật README với command, engine, hình thức, cache tạm thời và phân biệt đọc tạm với xuất file. Ghi bằng chứng visual Task 3 và trạng thái chạy thật vào phần nghiệm thu của plan. Nếu không có môi trường/vault thử nghiệm được phép hoặc chưa có phép gọi provider thật, ghi `NOT_RUN` cho Obsidian/provider thật; không đổi trạng thái đó thành PASS từ test mock.
- [x] **Step 8:** Commit đúng file của task: `feat(reading): integrate immersive bilingual reading mode`. Rà soát toàn nhánh so với đặc tả, đối chiếu public API, thay đổi ngoài phạm vi và bằng chứng không ghi note. Nếu người dùng chọn phương thức có reviewer độc lập thì dispatch theo đúng phương thức được chọn; không tự spawn trước lựa chọn đó.

## Coverage and Execution Handoff

| Nhóm yêu cầu đặc tả | Task kiểm chứng |
| --- | --- |
| Reading Mode, bật/tắt, action, engine | 4–5 |
| Nền/chữ nổi rõ, theme, truy cập | 3 |
| Cặp đoạn, list/trắc nghiệm, nội dung kỹ thuật | 1, 3, 5 |
| Lỗi thật, retry, concurrency/batch/cache | 2, 4 |
| Request cuối, render lại, cấu hình, nhiều pane | 2, 4–5 |
| Không ghi note, hồi quy và API thật | 1, 5 |
| Visual/browser và Obsidian thật là hai lớp bằng chứng | 3, 5 |

Thứ tự thực hiện: **Task 1 → Task 2 → Task 3 → Task 4 → Task 5**. Thực hiện trên nhánh hiện tại `vinhdat/immersive-reading-translation`; trước khi triển khai áp dụng skill worktree để kiểm tra nhu cầu checkout cách ly, giữ lại các commit tài liệu đã duyệt. Không tạo project/thread khác.

Người dùng đã chọn **Native** ngày 2026-10-18: thực hiện lần lượt trong cùng chat, một reviewer độc lập xem toàn nhánh ở cuối. Checkout cách ly được tạo từ nhánh tài liệu đã duyệt; nhánh triển khai là `vinhdat/immersive-reading-implementation`.

## Verification Record

- Tự rà soát kế hoạch so với đặc tả: đã đối chiếu phạm vi, 12 tiêu chí nghiệm thu, 5 Review Focus và các chữ ký giữa task; bổ sung kiểm tra trắc nghiệm chung paragraph, vòng đời mock theo API thật và cache của inline content.
- Test: **393/393**, 26 file. Build và `typecheck:reading` với type API Obsidian thật: **PASS**.
- Typecheck toàn repository: **FAIL**, 49 lỗi so với 55 tại baseline; đối chiếu diagnostic theo file/mã/nội dung cho thấy **không có lỗi mới**. Không mô tả scoped check là toàn repository pass.
- Browser fixture dùng renderer/CSS thật: **PASS** với 9 khối dịch, chữ 600, viền 4px; tương phản sáng 11.75:1 và tối 8.52:1. Pane 360px tại CSS zoom 200% và pane 1024px không tràn phần dịch. Đây là theme đại diện, không phải theme/vault Obsidian đang cài của người dùng.
- Detector UI đã chạy một lần; cảnh báo viền dọc được giữ theo đặc tả đã duyệt. Các cảnh báo CSS cũ ngoài tính năng không được sửa như tác dụng phụ.
- Obsidian/provider thật: `NOT_RUN`; không dùng credential hoặc Vault cá nhân.
- Điều chỉnh khi thực hiện: service session thuộc từng section để hủy đúng công việc section mà không hủy pane khác; scheduler vẫn có giới hạn chung. Vitest ưu tiên `.ts` để test không đọc nhầm `main.js` sau build.

## Native Final Review Record

Reviewer độc lập đã rà soát `7ef7cbc..0b31843`: không có Critical, có hai Important. Kiểm tra tĩnh renderer của Obsidian 1.14.4 và tái hiện offline xác nhận postprocessor có thể chạy trước khi section gắn vào DOM, và virtualization giữ lại section/child khi tạm tháo DOM. Đây không phải bằng chứng chạy Obsidian thật.

- **Đã sửa: section xử lý trước khi gắn DOM bị bỏ sót.** Đăng ký render child ngay, giữ các pane session đủ điều kiện tại thời điểm xử lý, chỉ xác định pane sở hữu khi containment và source path khớp. MutationObserver của view nhận section được gắn vào; không dùng thuộc tính context ngoài public API. Test `claims_preprocessed_detached_sections_only_after_owning_pane_attachment` và `claims_detached_sections_with_the_viewport_fallback` đã RED→GREEN; có kiểm tra hủy trước khi gắn vào.
- **Đã sửa: mất bản dịch khi cuộn ra/vào vùng virtualization.** Dựa vào host-managed child unload để dọn section vĩnh viễn; giữ DOM/kết quả của section tạm tháo, chỉ bắt đầu request mới khi block được gắn vào pane. Test `preserves_completed_translations_across_viewport_virtualization`, `retains_inflight_results_while_the_host_virtualizes_the_section` và `keeps_unstarted_observation_after_a_detached_visibility_notification` đã RED→GREEN.
- Fix pass thêm 7 ca kiểm thử: 5 ca tái hiện đã fail trước sửa; 2 ca bảo vệ hủy đang pass trước và sau sửa. Sau sửa: **393/393** test pass, typecheck phần đọc và build pass; full typecheck đối chiếu lại baseline **55→49**, không thêm diagnostic theo file/mã/nội dung.
- Theo Native workflow, tác giả thực hiện một lượt sửa và xác minh bằng test; không có lượt reviewer thứ hai. Không còn finding Important/Critical chưa xử lý; không có Minor được hoãn.

Các quyết định được lưu lại từ execution ledger (theo thứ tự):

1. **Session dịch theo section:** hủy một section không hủy section khác; chi phí: batch Gemini có thể nhỏ hơn giữa các section, giới hạn đồng thời vẫn dùng chung.
2. **Vitest ưu tiên `.ts` trước `.js`:** tránh đọc bundle sau build; chi phí: thứ tự resolve trong test thay đổi, runtime bundle không thay đổi.
3. **Obsidian/provider thật giữ `NOT_RUN`:** test offline và kiểm tra tĩnh không thay được chạy thật; chi phí: chưa chứng minh tương thích runtime/provider.
4. **Visual chỉ xác nhận theme đại diện:** reviewer không kiểm tra lại theme đang cài; chi phí: theme tùy biến có thể cần hiệu chỉnh tương phản.
5. **Giữ nền accent 20%, chữ 600 và viền 4px:** đúng thiết kế đã duyệt; chi phí: mức nhấn có thể khác theo theme.
6. **Giữ hai quyết định session/Vitest sau review:** không có lỗi mới từ reviewer cho hai lựa chọn này; chi phí vẫn là batch nhỏ hơn và resolve test khác.
7. **Không sửa lỗi typecheck baseline ngoài phạm vi:** không thêm diagnostic mới; chi phí: toàn repository vẫn chưa typecheck sạch.
8. **Giữ workspace tạm bị Git ignore:** lệnh dọn đúng thư mục của plan bị kiểm duyệt tự động từ chối với thông báo `blocked by policy`; không thử cách xóa khác. Chi phí: còn artifact kiểm thử/review cục bộ trong `.superpowers/sdd/2026-10-18-immersive-reading-translation/`. Server và tab preview đã dừng/đóng.

## References

- Spec đã duyệt ở đầu tài liệu; API Obsidian đã đối chiếu trong `node_modules/obsidian/obsidian.d.ts`: `MarkdownView.getMode/previewMode`, `MarkdownPreviewView.rerender/getScroll/applyScroll`, `View.addAction`, `Plugin.registerMarkdownPostProcessor`, `MarkdownPostProcessorContext.addChild`.
- [Metadata jsdom 26.1.0](https://registry.npmjs.org/jsdom/26.1.0), kiểm tra chỉ đọc ngày 2026-10-18; dependency chỉ được cài khi bắt đầu Task 1.
