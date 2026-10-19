# Kế Hoạch Triển Khai: Nâng Cấp UI/UX Chuẩn Taste Skill v2 & Impeccable Craft

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển hóa toàn bộ giao diện của Obsidian Polyglot Study từ dạng giao diện chấp nhận được thành giao diện đạt chuẩn **Craft-Grade / Anti-Slop** theo triết lý Taste Skill v2 và Impeccable Design: 100% Obsidian Native Lucide SVG Icons, loại bỏ đường kẻ vụn vặt (hairlines), phân tầng bề mặt bằng Surface Tone Stepping, hoàn thiện typography ngữ nghĩa và vi tương tác mượt mà.

**Architecture:** Giữ nguyên 100% logic nghiệp vụ và state machine hiện có (`ProviderManager`, `AiTutorChatService`, `VocabService`, `ReadingHighlightService`). Tái cấu trúc lớp trình bày (`styles.css`, `safeSetIcon` trong `domHelper.ts`, cùng các component `FloatingPopover.ts`, `PopoverChatDrawer.ts`, `SidebarView.ts`, `FloatingHighlightToolbar.ts`, `HighlighterPenPill.ts`).

**Tech Stack:** TypeScript, Obsidian Plugin API (`setIcon`, `Component`, `ItemView`), CSS Custom Properties (Obsidian Design Tokens), Vitest, esbuild.

**Spec Reference:** [ui-ux-taste-skill-review.md](file:///C:/Users/VinhDat/.gemini/antigravity/brain/6bc0b70c-6e3f-4463-bba0-df040ce2de5f/ui-ux-taste-skill-review.md)

---

## Global Constraints

- **100% Obsidian Theme Variables**: Tuyệt đối không dùng màu hardcoded (hex/rgb), mọi màu sắc phải sử dụng CSS variables (`--text-normal`, `--text-muted`, `--text-accent`, `--background-primary`, `--background-secondary`, `--interactive-accent`, `--shadow-s`, v.v.).
- **Zero Emoji as UI Icons**: Mọi biểu tượng chức năng (nút bấm, tab, trạng thái) bắt buộc sử dụng **Lucide SVG Icons** chuẩn của Obsidian thông qua `setIcon()`. Không dùng Unicode emoji (`🔊`, `🖍`, `✕`, `🤖`, `🗑️`, `➤`, `📋`, `💬`) làm icon tương tác.
- **Surface Tone Stepping thay cho Hairline Dividers**: Không dùng `border: 1px solid` tùy tiện để chia cắt khối nội dung; sử dụng tương phản nền `--background-secondary` và khoảng cách nhịp điệu (spacing rhythm: `8px`, `12px`, `16px`).
- **Explicit Transitions Only**: Cấm tuyệt đối `transition: all`. Mọi thuộc tính chuyển động phải được định danh rõ ràng (`transform`, `opacity`, `background-color`, `color`, `border-color`).
- **Không phá vỡ kiểm thử**: Bảo đảm toàn bộ 41 test files (647 tests) tiếp tục PASS 100% và biên dịch production `npm run build` không lỗi.

---

## Review Focus (Những bẫy tiềm ẩn cần kiểm soát)

1. **Fallback khi setIcon gặp môi trường test hoặc icon chưa load**: Trong môi trường Vitest (mock DOM), `setIcon` có thể không render SVG đầy đủ. `safeSetIcon` cần hỗ trợ render thẻ SVG inline hoặc text an toàn không gây crash và không phụ thuộc emoji.
2. **Kích thước & Hitbox nút bấm (Touch/Click Targets)**: Khi bỏ emoji và dùng icon SVG, kích thước icon phải chuẩn `14px-16px` nhưng hitbox nút bấm phải đạt tối thiểu `24px x 24px` (hoặc `28px x 28px` cho nút chính) để thao tác chuột/cảm ứng chính xác.
3. **Độ tương phản trên cả Light Theme và Dark Theme**: Các huy hiệu từ loại (Semantic POS pills: Noun, Verb, Adj, Adv) phải dùng biến màu `--text-accent`, `--text-success`, `--text-warning` kết hợp nền `--background-modifier-hover` để hiển thị sắc nét trên cả giao diện sáng lẫn tối.
4. **Co giãn mượt mà của Chat Textarea**: Khi người dùng gõ câu hỏi dài cho Gia sư AI, textarea phải tự mở rộng (auto-grow) từ `32px` đến tối đa `110px` mà không làm giật thanh cuộn hoặc tràn ra ngoài viewport popover.
5. **Không làm vỡ layout khi ghim sang Sidebar**: Các thành phần trong Popover khi được ghim sang SidebarView phải giữ nguyên cấu trúc DOM và phân cấp thông tin mà không bị méo mó tỉ lệ.

---

## Kế Hoạch Triển Khai Từng Task (Task Breakdown)

### Task 1: Chuẩn hóa Hệ thống Iconography & Tiện ích safeSetIcon (No More Emoji-as-UI)

**Mục tiêu**: Xóa bỏ hoàn toàn việc fallback về emoji thô. Nâng cấp `safeSetIcon` để hỗ trợ SVG fallback chuẩn xác trên mọi môi trường và thay thế toàn bộ 62 điểm dùng emoji làm icon trong các file UI.

**Files:**
- Modify: `src/utils/domHelper.ts` (nâng cấp `safeSetIcon` hỗ trợ SVG fallback tinh gọn)
- Modify: `src/ui/FloatingHighlightToolbar.ts` (thay `✕`, `🔍` bằng `x`, `search`)
- Modify: `src/ui/FloatingPopover.ts` (thay `🔊`, `🖍`, `✕`, `📋` bằng `volume-2`, `highlighter`, `x`, `copy`)
- Modify: `src/ui/PopoverChatDrawer.ts` (thay `🗑️`, `➤`, `📌` bằng `trash-2`, `send`, `pin`)
- Modify: `src/ui/SidebarView.ts` (thay `🤖`, `🗑️`, `➤`, `📋` và tab `Gia sư AI 💬` thành Lucide `bot` + text `Gia sư AI`)
- Modify: `src/ui/HighlighterPenPill.ts` (thay `✕` bằng `x`)
- Test: `tests/utils/domHelper.test.ts` & `tests/ui/SidebarViewTutor.test.ts`

**Các bước thực hiện:**
- [ ] 1. Viết test trong `tests/utils/domHelper.test.ts` kiểm chứng `safeSetIcon` gắn class `lucide-icon` và SVG fallback mà không sinh ra emoji.
- [ ] 2. Cập nhật `src/utils/domHelper.ts` với hàm `safeSetIcon` tối ưu.
- [ ] 3. Thay thế các icon trong `FloatingHighlightToolbar.ts`, `FloatingPopover.ts`, `PopoverChatDrawer.ts`, `SidebarView.ts`, `HighlighterPenPill.ts`.
- [ ] 4. Chạy `npx vitest run tests/utils/domHelper.test.ts tests/ui/SidebarViewTutor.test.ts tests/ui/PopoverChatDrawer.test.ts` xác nhận PASS.
- [ ] 5. Chạy `node "C:\Users\VinhDat\.gemini\config\skills\taste-skill\scripts\lint.mjs"` kiểm tra cảnh báo `[emoji]` giảm về 0.
- [ ] 6. Commit Git: `refactor(ui): replace emoji-as-ui with native Lucide SVG icons`.

---

### Task 2: Thanh lọc Hairline Borders & Thiết lập Surface Tone Stepping

**Mục tiêu**: Loại bỏ các đường viền `1px border` đóng hộp chật chội, chuyển sang phân tầng thị giác bằng tone màu bề mặt Obsidian (`--background-primary`, `--background-secondary`, `--background-modifier-form-field`) và nhịp điệu khoảng trắng tự nhiên.

**Files:**
- Modify: `styles.css` (khu vực Popover, Body, Actions footer, Chat Drawer, Sidebar tabs, History list)
- Test: `tests/ui/stylesTutor.test.ts` & `tests/ui/floatingUi.test.ts`

**Các bước thực hiện:**
- [ ] 1. Xác định các quy tắc CSS chứa `border: 1px solid` hoặc `border-top: 1px` không cần thiết trong `styles.css` (dựa trên danh sách cảnh báo của `taste-skill lint`).
- [ ] 2. Chuyển đổi các khối AI Note, Callout, Chat drawer, Input row sang phân tầng bằng `--background-secondary` và padding nhịp nhàng `8px / 12px / 14px`.
- [ ] 3. Xóa bỏ các `box-shadow` tại trạng thái nghỉ không thuộc lớp floating overlay thực tế.
- [ ] 4. Sửa các khai báo `transition: all` thành thuộc tính cụ thể (`transition: transform 0.15s ease, background-color 0.15s ease, color 0.15s ease`).
- [ ] 5. Chạy `npx vitest run tests/ui/stylesTutor.test.ts tests/ui/floatingUi.test.ts`.
- [ ] 6. Chạy `node "C:\Users\VinhDat\.gemini\config\skills\taste-skill\scripts\lint.mjs"` kiểm tra các cảnh báo `[hairline]`, `[shadow]`, `[transition-all]` được giải quyết.
- [ ] 7. Commit Git: `style(ui): eliminate hairline dividers and apply surface tone stepping`.

---

### Task 3: Tối ưu Phân cấp Typography & Semantic POS Badges

**Mục tiêu**: Nâng cấp phân cấp chữ đọc trong Popover và Sidebar. Từ vựng tra cứu trở thành tâm điểm thị giác (Hero Word), nghĩa dịch tiếng Việt nổi bật rõ ràng, và các nhãn từ loại (Danh từ, Động từ, Tính từ, Trạng từ) có huy hiệu ngữ nghĩa thanh thoát.

**Files:**
- Modify: `styles.css` (`.popover-query`, `.vocab-meaning-vi`, `.vocab-pos-tag`, `.vocab-example`)
- Modify: `src/ui/FloatingPopover.ts` & `src/ui/SidebarView.ts` (gắn thuộc tính `data-pos` chính xác cho các tag từ loại)
- Test: `tests/ui/floatingUi.test.ts` & `tests/ui/SidebarView.test.ts`

**Các bước thực hiện:**
- [ ] 1. Cập nhật CSS cho `.popover-query`: `font-size: 18px`, `font-weight: 700`, `letter-spacing: -0.01em`.
- [ ] 2. Định nghĩa màu ngữ nghĩa cho POS tags:
  - Noun: Tông xanh dịu (`--text-accent` trên nền `--background-modifier-hover`).
  - Verb: Tông xanh ngọc (`--text-success`).
  - Adj: Tông cam đất / vàng ấm (`--text-warning`).
  - Adv: Tông tím lavender nhạt.
- [ ] 3. Tinh chỉnh câu ví dụ ngữ cảnh: font nghiêng, lề thụt `10px`, vạch biên `--interactive-accent` bo tròn 2 đầu (`border-radius: 2px`).
- [ ] 4. Chạy `npx vitest run tests/ui/floatingUi.test.ts tests/ui/SidebarView.test.ts`.
- [ ] 5. Commit Git: `style(typography): enhance visual hierarchy and semantic POS pill badges`.

---

### Task 4: Nâng cấp Trải nghiệm tương tác AI Tutor & Chat Micro-interactions

**Mục tiêu**: Hoàn thiện trải nghiệm của khung chat Gia sư AI: textarea mở rộng tự động (auto-expanding textarea), chỉ báo typing dots sinh động, chips bar hiển thị linh hoạt với thanh cuộn ẩn tinh tế, và bọt tin nhắn markdown thụt lề chuẩn mực.

**Files:**
- Modify: `src/ui/PopoverChatDrawer.ts` (auto-resize textarea logic, typing indicator component)
- Modify: `src/ui/SidebarView.ts` (auto-resize textarea trong Sidebar, đồng bộ giao diện)
- Modify: `styles.css` (bọt chat message, prompt chips, typing indicator dots)
- Test: `tests/ui/PopoverChatDrawer.test.ts` & `tests/ui/SidebarViewTutor.test.ts`

**Các bước thực hiện:**
- [ ] 1. Viết test trong `tests/ui/PopoverChatDrawer.test.ts` kiểm chứng việc cập nhật nội dung textarea tự động điều chỉnh chiều cao.
- [ ] 2. Thêm hàm `adjustTextareaHeight` tự động tính `scrollHeight` từ `32px` đến `110px`.
- [ ] 3. Thay thế dòng text "Gia sư AI đang suy nghĩ..." bằng hiệu ứng 3 dấu chấm sóng nhịp nhàng (`typing-dots-wave`).
- [ ] 4. Bo góc bọt tin nhắn dạng thẻ bất đối xứng (Modern card speech bubble: bo góc 12px, góc hướng về người nói bo 3px).
- [ ] 5. Chạy `npx vitest run tests/ui/PopoverChatDrawer.test.ts tests/ui/SidebarViewTutor.test.ts`.
- [ ] 6. Commit Git: `feat(tutor): add auto-expanding textarea and craft-grade chat micro-interactions`.

---

### Task 5: Kiểm định Hồi quy Toàn diện, Build Production & Triển khai vào Vault

**Mục tiêu**: Đảm bảo 100% test suites (41 files, 647+ tests) đều PASS, quét lại `taste-skill lint`, build `main.js` sạch sẽ và sao chép vào Obsidian Vault của người dùng.

**Files:**
- Build: `npm run build` (`main.js`, `manifest.json`, `styles.css`)
- Deploy: `C:\Users\VinhDat\Documents\Obsidian\Obsidian\.obsidian\plugins\obsidian-english-study\`
- Test: Toàn bộ `tests/**/*.test.ts`

**Các bước thực hiện:**
- [ ] 1. Chạy toàn bộ test suite `npx vitest run` kiểm tra không có bất kỳ regression nào.
- [ ] 2. Chạy `node "C:\Users\VinhDat\.gemini\config\skills\taste-skill\scripts\lint.mjs"` kiểm tra kết quả thẩm định Taste Skill.
- [ ] 3. Chạy `npm run build` để đóng gói `main.js` tối ưu.
- [ ] 4. Sao chép các file `main.js`, `styles.css`, `manifest.json` vào thư mục plugin của Obsidian Vault.
- [ ] 5. Tạo báo cáo nghiệm thu [walkthrough.md](file:///C:/Users/VinhDat/.gemini/antigravity/brain/6bc0b70c-6e3f-4463-bba0-df040ce2de5f/walkthrough.md).
- [ ] 6. Commit Git: `chore: finalize taste-skill UI/UX refactoring and deploy to vault`.

---

## Verification Plan

### Automated Tests
- Chạy từng bộ test UI trong quá trình sửa:
  ```bash
  npx vitest run tests/ui/
  ```
- Chạy toàn bộ 41 test files:
  ```bash
  npx vitest run
  ```
- Quét kiểm tra tiêu chuẩn Taste Skill:
  ```bash
  node "C:\Users\VinhDat\.gemini\config\skills\taste-skill\scripts\lint.mjs"
  ```
- Biên dịch sản phẩm:
  ```bash
  npm run build
  ```

### Manual Verification trong Obsidian
1. **Kiểm tra Popover Tra từ**:
   - Bôi đen một từ tiếng Anh -> Popover xuất hiện.
   - Kiểm tra các nút (Loa, Bút highlight, Ghim, Đóng): 100% hiển thị bằng Lucide SVG vector sắc nét, không còn emoji.
   - Thử hover vào từng nút: xem hiệu ứng chuyển động mượt mà (scale nhẹ, đổi màu sang accent).
2. **Kiểm tra POS Tag & Phân tầng Visual**:
   - Từ vựng to rõ (18px), nghĩa tiếng Việt nổi bật (15px).
   - Tag từ loại [noun], [verb], [adj] có màu nền dịu mắt, hòa quyện với theme hiện tại.
   - Khối AI Note phân tầng bằng nền secondary mờ, không có đường kẻ bao quanh thô cứng.
3. **Kiểm tra Gia sư AI**:
   - Mở drawer chat -> Bấm thử Quick Prompt Chip -> Xuất hiện hiệu ứng typing dots sinh động.
   - Gõ câu hỏi dài 3-4 dòng -> Textarea tự động giãn chiều cao mượt mà.
   - Nhìn sang Sidebar -> Bấm tab "Gia sư AI" -> Toàn bộ đoạn chat hiển thị đồng bộ với bọt tin nhắn chuẩn Card-bubble.
