# Sửa 8 finding audit — 2026-10-20

Baseline: `346bfe4a2507a0dcde0a420684ab9d7494840e23`. Phạm vi do người dùng yêu cầu: sửa lần lượt F01–F08 trong [báo cáo audit](2026-10-20-review.md). Mã, test và tài liệu được giữ chung trong nhánh `fix/audit-2026-10-20`; chưa cài vào Vault.

| Finding | Hành vi sau sửa | Bằng chứng hồi quy |
| --- | --- | --- |
| F01 — TypeScript | Import `PopoverFontSize`; fixtures/callbacks UI tuân thủ contract thật | Full và production typecheck từ FAIL thành PASS; không nới `strict` hay loại tests |
| F02 — scroll/loading | Scroll giữ cả popover lẫn operation đang chờ; kết quả Google/AI vẫn cập nhật | `tests/auditFixes.test.ts`: hai deferred-response test RED → GREEN |
| F03 — history/path | Rename file/folder chuyển cả undo/redo và đường dẫn action; delete xóa history của đúng path/prefix | Bốn ca RED → GREEN: rename file/folder, delete rồi tạo lại path; sibling prefix không bị ảnh hưởng |
| F04 — Tutor/context | Session identity gồm query, câu ngữ cảnh, metadata tài liệu và source/target language; snapshot metadata; dedupe selection cũng xét toàn bộ lookup input | Tám ca service RED → GREEN; ca chọn `bank` trong hai đoạn khác nhau RED → GREEN; cùng context vẫn chia sẻ lịch sử popover/sidebar |
| F05 — bảng từ vựng | Chỉ insert/dedupe/merge trong bảng có schema từ vựng năm cột; tạo bảng riêng khi note chỉ có bảng khác; bỏ qua bảng trong fenced code | Năm ca RED → GREEN qua formatter và saver, gồm Daily Note, trùng bold query ở bảng khác và merge context đúng bảng |
| F06 — phát âm | Entry thiếu phiên âm không mượn IPA/audio của lemma. Stem fallback vẫn cung cấp định nghĩa; provider chỉ dùng IPA/audio khi dictionary word khớp query | Hai ca RED → GREEN cho entry 200 thiếu phiên âm và fallback lemma sau 404; UI tiếp tục TTS nguyên query khi thiếu audio |
| F07 — chat/lifecycle | Generation và session/messages identity loại response đã clear/delete/destroy/đổi phiên; response cũ không thay đổi loading của lượt mới | Tests drawer/sidebar RED → GREEN; kiểm tra cả response rỗng, lỗi, đổi phiên và gửi lượt mới sau clear |
| F08 — auto-translate | Xét auto-translate trước toolbar/manual trigger; khi bật tự dịch, lookup không phụ thuộc pen mode | Ma trận tám ca Reading Mode: bốn ca lỗi RED → GREEN và bốn ca bảo toàn hành vi đã đúng |

## Kiểm tra tích hợp bổ sung

Review độc lập phát hiện việc hủy request khi drawer bị destroy cũng làm mất câu trả lời lúc ghim chat sang sidebar. Bản sửa chuyển pending turn cùng session trước khi gỡ DOM, giữ trạng thái chờ ở sidebar rồi render kết quả khi hoàn thành. Clear/delete vẫn làm response hết hiệu lực; đóng drawer bình thường vẫn hủy quyền cập nhật của request đó. Test đi qua nút ghim thật và callback của plugin.

Review tiếp theo phát hiện input thay thế sau đổi tab sidebar còn bị disabled khi response về. Completion hiện đồng bộ lại giao diện Tutor đang hiển thị khi cùng generation/session còn hiệu lực, giữ thông báo lỗi và focus đúng input. Regression đổi tab trong lúc chờ đi từ RED sang GREEN.

## Verification

- `npm test`: **729/729 PASS**, **43** file. Tăng 39 ca so với baseline 690; không gỡ test để làm xanh suite.
- `npm run typecheck`: **PASS**.
- `npm run typecheck:production`: **PASS**, toàn bộ mã ứng dụng dùng type Obsidian đã cài.
- `npm run typecheck:reading`: **PASS**.
- `npm run build`: **PASS**; bundle `main.js` được sinh lại và vẫn là artifact bị Git ignore.
- `git diff --check`: **PASS**.

Test dùng mock Obsidian và HTTP/JSDOM. Chưa chạy Obsidian desktop/mobile thật, audio/TTS thật hoặc provider thật; không sử dụng credential, không sửa note/Vault thật. Bảng có schema tùy chỉnh không bị tự sửa/migrate; saver tạo bảng từ vựng chuẩn riêng để giữ nội dung hiện có. HTTP qua `requestUrl` có thể vẫn kết thúc sau khi người dùng hủy; guards ngăn kết quả hết hiệu lực cập nhật phiên/UI.

Vitest vẫn đưa cảnh báo tương thích config loader trong phiên bản Vite tương lai; đây không phải test failure. Không đổi toolchain hoặc phiên bản release trong phạm vi sửa tám finding này.
