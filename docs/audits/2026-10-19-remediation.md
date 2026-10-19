# Audit remediation — 2026-10-19

Baseline: `d613051`. Bản sửa: **1.1.1**, nhánh `vinhdat/audit-remediation`. Người dùng yêu cầu sửa các lỗi trong báo cáo audit ngày 2026-10-19. Các sửa chữa giữ nguyên mục đích từng luồng; không thay thiết kế giao diện.

## Mapping findings to fixes

| Finding | Bản sửa | Kiểm thử hồi quy |
| --- | --- | --- |
| F01 — snapshot cũ/editor đổi file ghi đè | `BilingualFileWriter` kiểm tra file identity/path, editor owner và revision, so nội dung trong synchronous `vault.process` callback; không ghi khi có xung đột | `tests/auditRemediation.test.ts`: disk/editor conflict, recycled editor, atomic callback, initial editor/disk divergence |
| F02 — hủy request cuối vẫn ghi | Service kiểm tra abort sau mọi await; modal dùng operation identity, truyền signal tới write boundary; plugin unload đóng modal | Google/Gemini final response, final delay, closed/restarted modal, write-boundary cancellation/unload |
| F03 — source fallback báo success | Thiếu/blank/null/throw/missing batch ID làm fail export, không ghi/success notice | Service + modal failure tests, incomplete Gemini batch |
| F04 — cache sai ngôn ngữ/context/AI | Key theo exact query/source/target/context/metadata/endpoint/accent/AI flags/callback mode; private credential epoch; snapshots độc lập; settings update hủy việc cũ | 40 ProviderManager tests, gồm source/context/case/flags/key/endpoint/snapshot/cancellation |
| F05 — AI sai target Nhật/Trung | Map ngôn ngữ đích dùng chung cho các entrypoint; multiline/choice có target rõ ràng | 40 Gemini tests, gồm en/vi/ja/zh/unknown target và multiline |
| F06 — request cũ đóng UI mới | Lookup generation guard cho base/AI/catch/close/dismiss/unload; ghim sidebar giữ AI đang chạy nhưng không mở lại popover | Main + audit integration deferred-response tests, pin-while-AI-pending regression |
| F07 — CJK highlight không restore | Chỉ áp dụng lexical word boundary cho script phù hợp; CJK được match trong câu không khoảng trắng | JSDOM restoration tests |
| F08 — tẩy DOM/storage lệch nhau | Bulk removal trả affected IDs, gỡ mọi fragment theo ID; settings writes được xếp hàng với snapshot riêng | Service/helper + combined DOM/persistence + reordered-save regression |
| F09 — bút tác động Edit Mode | Kiểm tra preview/view identity/editable ở down/move/up; mutation entrypoint chặn Range khác pane, endpoint editable và selection cắt ngang widget editable | RightClickPenHandler + main source-mode guard + three editable/range regressions |
| F10 — rename/move orphan highlight | Vault rename/delete events migrate/cleanup exact paths và folder prefixes | Service migration + main Vault lifecycle integration |
| F11 — decode path trộn note | Canonical raw paths giữ case/extension/literal percent; decode chỉ phục vụ nhận diện format cũ | Literal percent/path isolation + reload/migration collision tests |
| F12 — inherited map key crash | Null-prototype dictionary, validate record shape/color và own keys | constructor.md/malformed-data tests |
| F13 — typecheck regression | Sửa nullable helper, callback API và typing test doubles; production check độc lập dùng API thật | `typecheck`, `typecheck:production`, `typecheck:reading` |
| F14 — docs/release stale | Cập nhật README/PRODUCT và trạng thái lịch sử; package/manifest 1.1.1 | Version/readback/build/checks |

## Verification

- Baseline: **477/477** tests pass; full `tsc` fail **81** diagnostic; reading typecheck fail **1** diagnostic.
- TDD: các worker xác nhận RED trước sửa cho service/modal, cache/prompt, highlight; parent xác nhận 10 ca main ban đầu RED, 3 ca integration RED và các ca initial-snapshot/unload RED riêng. Sau review, thêm một ca pin-while-AI-pending và ba ca editable/range cũng RED trước sửa. Sau sửa, các ca này GREEN.
- Integrated suite: **576/576**, **34** file, Vitest **5.0.5** (chạy lại sau các sửa cuối review).
- Full application/test TypeScript: **PASS**, không tắt `strict` hoặc loại tests khỏi root check.
- All production code against installed real Obsidian API types: **PASS**. Reading-only real API check: **PASS**.
- Build esbuild **0.28.2**: **PASS**. Vite **8.3.4**, Node đã kiểm tra **24.19.0**.
- Dependency upgrade xử lý peer dependencies tường minh (`vite`, `@types/node`), không dùng `--force`/`--legacy-peer-deps`. `npm audit`: **0 vulnerability** tại thời điểm kiểm tra.
- Review độc lập toàn nhánh tại `6141d33` phát hiện một P2 còn sót ở F09: mutation entrypoint nhận Range trong widget editable. Đã sửa cùng ba regression test RED → GREEN. Parent cũng sửa ca ghim sidebar làm hủy AI đang chạy, với regression RED → GREEN. Chưa có review độc lập lại sau bốn ca bổ sung này; full suite, cả ba typecheck, build và npm audit đã chạy lại thành công.
- Không tự push, merge hoặc cài vào Vault trong lượt sửa này.

## Compatibility decisions and limits

- Xuất file chọn all-or-nothing: chỉ một block thất bại cũng không ghi kết quả. Người dùng có thể thử lại sau khi sửa kết nối/key.
- In-place export chỉ chấp nhận source/editor/disk đồng bộ và không thay đổi; có xung đột thì không ghi. Có thể lưu/sync note trước hoặc chọn file mới; file mới dùng tên chưa tồn tại.
- `requestUrl` không hỗ trợ hủy HTTP đang bay; kết quả cũ bị bỏ và không thể vượt qua write/operation guards. Khi callback ghi atomic đã commit, không tuyên bố có thể hoàn tác tự động side effect đó.
- Legacy highlight paths từng bị lowercase/decode/remove-extension nên có thể mất thông tin chủ sở hữu. Migration chạy một lần qua marker `\u0000polyglot-path-format:2`; bucket mơ hồ/orphan được giữ dưới `\u0000polyglot-legacy:<key>`, không tự gán sang note khác hoặc xóa. Không thể tự khôi phục ownership đã mất từ format cũ; dữ liệu còn giữ để phục hồi có kiểm tra.
- Các test UI cũ dùng plain-object DOM doubles được type đúng hình dạng mock; test JSDOM và production typecheck vẫn tách riêng. Không dùng cast test để vô hiệu hóa kiểm tra code production.
- Nâng toolchain yêu cầu Node 22.12+ (22.x), 24.x hoặc 26+ khi build/test; plugin không tải Vitest/Vite vào Obsidian runtime.
- Actual Obsidian/provider/mobile acceptance: **NOT_RUN**. Không dùng credential, không đọc nội dung Vault và không ghi note thật.
