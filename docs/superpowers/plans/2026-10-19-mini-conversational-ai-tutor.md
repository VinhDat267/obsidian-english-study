# Mini Conversational AI Tutor ("Hỏi Sâu Gia Sư AI") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng khung chat "Hỏi Sâu Gia Sư AI" (Mini Conversational AI Tutor) tích hợp trong Popover (thông qua Accordion Drawer có Quick Chips phân tích trắc nghiệm/học thuật) và chuyển tiếp liền mạch sang Tab 3 của Sidebar View để đàm thoại đường dài.

**Architecture:** Hybrid Component Architecture:
- `AiTutorChatService`: Quản lý trạng thái phiên hội thoại (multi-turn), tin nhắn, prompt chips và chuyển giao session.
- `GeminiService.chatWithTutor()`: Đóng gói API REST đa lượt của Gemini (`contents: [{ role, parts }]`) với `systemInstruction` nạp tri thức bài đọc.
- `PopoverChatDrawer`: Sub-component UI accordion nhỏ gọn gắn ở chân Popover, có chips trắc nghiệm & ô nhập nhanh.
- `EnglishStudySidebar`: Bổ sung Tab 3 `Gia sư AI 💬` nhận bàn giao phiên từ Popover và cho phép chat không giới hạn.

**Tech Stack:** TypeScript, Obsidian API (`ItemView`, `setIcon`), Gemini REST API (v1beta), Vitest, CSS Theme Variables.

**Spec:** `docs/superpowers/specs/2026-10-19-mini-conversational-ai-tutor-design.md`

## Global Constraints

- 100% tuân thủ CSS Variables của Obsidian (`--background-floating`, `--background-secondary`, `--interactive-accent`, `--text-normal`, `--text-muted`, `--background-modifier-border`, etc.). Tuyệt đối không dùng hardcoded hex color.
- Thao tác DOM an toàn, dọn dẹp event listeners đầy đủ, không gây memory leak khi đóng Popover/Sidebar.
- Tuân thủ nghiêm ngặt Superpowers TDD (Red-Green-Refactor): Viết test trước, chứng kiến test fail, triển khai code tối thiểu để pass test.
- Không phá vỡ bất kỳ bài test nào trong số 583 bài test (34 test files) hiện có.
- Trả lời và hiển thị thông điệp UI bằng tiếng Việt tự nhiên, thân thiện và đậm chất học thuật.

## Review Focus

1. **Multi-turn conversation payload format:** Định dạng payload gửi lên Gemini v1beta REST phải tuân thủ nghiêm ngặt `{ systemInstruction: { parts: [...] }, contents: [{ role: 'user' | 'model', parts: [...] }] }`.
2. **Quota 429 graceful fallback:** Khi `gemini-flash-latest` gặp lỗi 429 (Resource Exhausted), hệ thống phải tự động fallback sang `gemini-flash-lite-latest` mà không làm crash phiên chat.
3. **Accordion state & dynamic Popover bounds:** Khi PopoverChatDrawer mở ra hoặc co lại, FloatingPopover phải tự động tính toán lại vị trí/max-height để không bị tràn khỏi màn hình (clamped to `vh - top - 16px`).
4. **Seamless handoff to Sidebar:** Khi người dùng bấm "Ghim sang Sidebar", toàn bộ dữ liệu phiên (câu hỏi, câu ngữ cảnh, các lượt tin nhắn đã hỏi) phải chuyển giao nguyên vẹn sang Tab 3 của Sidebar mà không bị mất mát hay gửi lại từ đầu.
5. **Sanitization & Markdown Rendering:** Nội dung phản hồi từ AI phải được render chuẩn Markdown (đậm, nghiêng, bullet list, code block) thông qua `renderMarkdownToElement` an toàn, chống XSS.

---

### Task 1: Định Nghĩa Kiểu Dữ Liệu Cho AI Tutor Chat

**Files:**
- Modify: `src/types/index.ts`
- Test: `tests/types/tutorTypes.test.ts`

**Interfaces:**
- Produces: `TutorChatMessage`, `TutorSession`, `QuickPromptChip`, mở rộng `PopoverCallbacks` với `onPinToSidebarChat`.

- [ ] **Step 1: Write the failing test**
Viết file `tests/types/tutorTypes.test.ts` kiểm tra các kiểu dữ liệu và cấu trúc khởi tạo session hợp lệ.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/types/tutorTypes.test.ts`
Expected: FAIL do types/helpers chưa được export.

- [ ] **Step 3: Implement types in `src/types/index.ts`**
Thêm `TutorChatMessage`, `TutorSession`, `QuickPromptChip` và `onPinToSidebarChat?: (session: TutorSession) => void` vào `PopoverCallbacks`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/types/tutorTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/types/index.ts tests/types/tutorTypes.test.ts
git commit -m "feat(types): add tutor chat message and session types"
```

---

### Task 2: Dịch Vụ Quản Lý Phiên Chat `AiTutorChatService`

**Files:**
- Create: `src/services/ai/AiTutorChatService.ts`
- Test: `tests/services/AiTutorChatService.test.ts`

**Interfaces:**
- Consumes: `TutorChatMessage`, `TutorSession`, `QuickPromptChip`, `DocumentContextMeta` từ `src/types/index.ts`.
- Produces: `AiTutorChatService` với các method:
  - `createSession(params: { query: string; contextSentence: string; docContext?: DocumentContextMeta; sourceLang?: string; targetLang?: string }): TutorSession`
  - `addMessage(sessionId: string, role: "user" | "model", content: string): TutorChatMessage | null`
  - `getSession(sessionId: string): TutorSession | null`
  - `clearSession(sessionId: string): boolean`
  - `getQuickPromptChips(): QuickPromptChip[]`
  - `buildSystemInstruction(session: TutorSession): string`

- [ ] **Step 1: Write the failing test**
Tạo file `tests/services/AiTutorChatService.test.ts` kiểm tra đầy đủ lifecycle của session, sinh prompt system instruction tối ưu cho MCQ và tra từ chuyên sâu, nạp và lưu tin nhắn.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/services/AiTutorChatService.test.ts`
Expected: FAIL with "AiTutorChatService not defined".

- [ ] **Step 3: Implement `AiTutorChatService`**
Viết mã nguồn trong `src/services/ai/AiTutorChatService.ts`. Hỗ trợ các chips:
1) Giải thích câu trắc nghiệm MCQ (tại sao chọn đáp án đúng, bẫy các phương án còn lại).
2) Phân biệt từ đồng nghĩa & sắc thái chuyên ngành.
3) Phân tích ngữ pháp sâu & mệnh đề tương đương.
4) Collocations & 3 ví dụ thực tế.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/services/AiTutorChatService.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/ai/AiTutorChatService.ts tests/services/AiTutorChatService.test.ts
git commit -m "feat(ai): implement AiTutorChatService for multi-turn session management"
```

---

### Task 3: Tích Hợp API Chat Đa Lượt Vào `GeminiService`

**Files:**
- Modify: `src/services/provider/GeminiService.ts`
- Test: `tests/services/GeminiServiceTutor.test.ts`

**Interfaces:**
- Consumes: `TutorSession` từ `src/types/index.ts`.
- Produces: `GeminiService.chatWithTutor(session: TutorSession, apiKey: string, model?: string, systemInstructionText?: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test**
Tạo file `tests/services/GeminiServiceTutor.test.ts` mock `executeRequest` để kiểm thử:
1) Gửi payload chuẩn định dạng đa lượt: `systemInstruction` và mảng `contents: [{ role, parts }]`.
2) Trích xuất kết quả trả về từ `candidates[0].content.parts[0].text`.
3) Tự động fallback sang `gemini-flash-lite-latest` khi gặp status code 429.
4) Trả về null an toàn khi API key trống hoặc mạng ngắt kết nối.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/services/GeminiServiceTutor.test.ts`
Expected: FAIL with "chatWithTutor is not a function".

- [ ] **Step 3: Implement `chatWithTutor` in `GeminiService.ts`**
Thêm phương thức `chatWithTutor` vào `GeminiService.ts` với đầy đủ cấu trúc REST multi-turn của Gemini v1beta, xử lý token và retry 429.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/services/GeminiServiceTutor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/services/provider/GeminiService.ts tests/services/GeminiServiceTutor.test.ts
git commit -m "feat(gemini): add multi-turn chatWithTutor API with fallback support"
```

---

### Task 4: Xây Dựng UI Component `PopoverChatDrawer`

**Files:**
- Create: `src/ui/PopoverChatDrawer.ts`
- Test: `tests/ui/PopoverChatDrawer.test.ts`

**Interfaces:**
- Consumes: `AiTutorChatService`, `GeminiService`, `TutorSession`, `QuickPromptChip`.
- Produces: `PopoverChatDrawer` class với:
  - `render(): HTMLElement`
  - `toggle(expand?: boolean): void`
  - `isExpanded(): boolean`
  - `setSession(session: TutorSession): void`
  - `onResizeCallback: () => void`
  - `onPinToSidebarCallback: (session: TutorSession) => void`
  - Tự động render Markdown cho tin nhắn từ AI.

- [ ] **Step 1: Write the failing test**
Tạo `tests/ui/PopoverChatDrawer.test.ts` kiểm thử:
1) Render Accordion toggle button (mặc định đóng).
2) Bấm toggle chuyển trạng thái mở (expanded) và gọi `onResizeCallback`.
3) Render các Quick Chips và click chip tự động gửi tin nhắn.
4) Nhập text vào textarea và bấm Enter kích hoạt gửi.
5) Hiển thị trạng thái đang trả lời (loading indicator).
6) Bấm nút "Ghim sang Sidebar" gọi callback `onPinToSidebarCallback`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/ui/PopoverChatDrawer.test.ts`
Expected: FAIL with "PopoverChatDrawer not defined".

- [ ] **Step 3: Implement `PopoverChatDrawer.ts`**
Viết mã nguồn UI sạch, xử lý đầy đủ các event click, phím Enter/Shift+Enter, auto-scroll đến tin nhắn mới nhất, và dọn dẹp sạch sẽ khi hủy.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/ui/PopoverChatDrawer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/ui/PopoverChatDrawer.ts tests/ui/PopoverChatDrawer.test.ts
git commit -m "feat(ui): implement PopoverChatDrawer component"
```

---

### Task 5: Nhúng Chat Drawer Vào `FloatingPopover` & Tự Động Co Giãn Vị Trí

**Files:**
- Modify: `src/ui/FloatingPopover.ts`
- Test: `tests/ui/FloatingPopoverChat.test.ts`

**Interfaces:**
- Consumes: `PopoverChatDrawer`, `AiTutorChatService`, `GeminiService`.
- Produces: `FloatingPopover` có thể hiển thị drawer chat gia sư AI ở chân thẻ, mở rộng mượt mà và chuyển tiếp sang Sidebar.

- [ ] **Step 1: Write the failing test**
Tạo `tests/ui/FloatingPopoverChat.test.ts` kiểm tra:
1) FloatingPopover khởi tạo kèm Chat Drawer khi có API key.
2) Khi Chat Drawer mở, Popover tự động cập nhật bounding box và scroll view.
3) Nút "Ghim sang Sidebar" trong drawer phát đúng callback lên plugin.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/ui/FloatingPopoverChat.test.ts`
Expected: FAIL do Drawer chưa được nhúng vào FloatingPopover.

- [ ] **Step 3: Modify `FloatingPopover.ts`**
Khởi tạo và đính kèm `PopoverChatDrawer` vào dưới footer của Popover. Kết nối callback `onResize` và `onPinToSidebarChat`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/ui/FloatingPopoverChat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/ui/FloatingPopover.ts tests/ui/FloatingPopoverChat.test.ts
git commit -m "feat(popover): integrate PopoverChatDrawer with dynamic auto-resizing"
```

---

### Task 6: Bổ Sung Tab 3 "Gia sư AI 💬" Trong `SidebarView` & Bàn Giao Session

**Files:**
- Modify: `src/ui/SidebarView.ts`
- Test: `tests/ui/SidebarViewTutor.test.ts`

**Interfaces:**
- Consumes: `TutorSession`, `AiTutorChatService`, `GeminiService`.
- Produces: Tab 3 `ai-tutor` trong `EnglishStudySidebar`, hàm `openTutorSession(session: TutorSession)`.

- [ ] **Step 1: Write the failing test**
Tạo `tests/ui/SidebarViewTutor.test.ts` kiểm thử:
1) Thanh điều hướng Sidebar có thêm nút Tab "Gia sư AI 💬".
2) Hàm `openTutorSession(session)` kích hoạt Tab 3 và hiển thị toàn bộ lịch sử trò chuyện.
3) Hỗ trợ tiếp tục gửi câu hỏi mới từ Sidebar.

- [ ] **Step 2: Run test to verify it fails**
Run: `npx vitest run tests/ui/SidebarViewTutor.test.ts`
Expected: FAIL with "openTutorSession is not a function" hoặc Tab 3 chưa tồn tại.

- [ ] **Step 3: Implement Tab 3 in `SidebarView.ts`**
Bổ sung `activeTab = "ai-tutor"`, render giao diện chat toàn màn hình của Sidebar kèm khung nhập tin nhắn, danh sách Quick Chips, nút xóa lịch sử chat.

- [ ] **Step 4: Run test to verify it passes**
Run: `npx vitest run tests/ui/SidebarViewTutor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/ui/SidebarView.ts tests/ui/SidebarViewTutor.test.ts
git commit -m "feat(sidebar): add AI Tutor tab and session handoff support"
```

---

### Task 7: Đồng Bộ Toàn Bộ Vào `main.ts`, Hoàn Thiện `styles.css` & Kiểm Thử Toàn Diện

**Files:**
- Modify: `main.ts`
- Modify: `styles.css`
- Test: Toàn bộ test suite (`npm test`)

**Interfaces:**
- Wire `AiTutorChatService` vào lifecycle của plugin trong `main.ts`.
- Kết nối sự kiện `onPinToSidebarChat` từ `FloatingPopover` để tự động mở Sidebar leaf và chuyển sang Tab 3.
- Hoàn thiện toàn bộ CSS styling chuẩn Obsidian Theme Tokens.

- [ ] **Step 1: Update `styles.css`**
Thêm các style class cho `.popover-chat-drawer`, `.drawer-toggle-btn`, `.quick-chips-wrapper`, `.chat-chip`, `.tutor-messages-container`, `.message-bubble-user`, `.message-bubble-model`, `.chat-input-row`, `.tutor-loading-dots`.

- [ ] **Step 2: Update `main.ts`**
Khởi tạo `AiTutorChatService`, truyền vào Popover và Sidebar, cấu hình handoff mở Sidebar leaf khi được yêu cầu.

- [ ] **Step 3: Run full test suite & production build**
Run: `npm test` và `npm run build`.
Expected: Tất cả các test suites (>38 test files, ~600+ tests) pass 100%, bản build `main.js` thành công không lỗi type.

- [ ] **Step 4: Deploy to Obsidian Vault & Verify**
Copy `main.js`, `manifest.json`, `styles.css` vào thư mục plugin của Obsidian vault.

- [ ] **Step 5: Commit**
```bash
git add main.ts styles.css
git commit -m "feat(plugin): wire AI Tutor chat service and finalize craft-grade styles"
```
