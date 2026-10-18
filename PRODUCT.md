# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Plugin dùng DOM bên trong Obsidian; không phải một website độc lập. Manifest hiện khai báo hỗ trợ desktop và mobile; khả năng chạy thực tế trên từng nền tảng cần được kiểm chứng riêng.

## Users

Người dùng đọc tài liệu ngoại ngữ bằng Markdown trong Obsidian và muốn tra cứu, đối chiếu bản dịch, lưu từ vựng kèm ngữ cảnh ngay trong quá trình đọc.

## Product Purpose

Polyglot Study Assistant hỗ trợ học ngoại ngữ trong ghi chú: tra từ/câu, nghe phát âm, dịch, giải thích ngữ pháp bằng AI tùy chọn và lưu từ vựng vào Vault.

## Operating Context

- Mã hiện có tích hợp tra cứu trong Edit Mode và Reading Mode, popover, sidebar và sổ từ vựng Markdown.
- Provider hiện có gồm Free Dictionary, Google Translate và Gemini. Bản dịch phụ thuộc dịch vụ bên ngoài; Gemini sử dụng API key do người dùng cấu hình.
- Cache tra cứu và lịch sử phiên học hiện nằm trong RAM.
- Tính năng dịch song ngữ file hiện tại tạo nội dung Markdown rồi ghi vào file hiện tại hoặc một file mới.

## Capabilities and Constraints

- Yêu cầu đã được người dùng xác nhận ngày 2026-10-18: bổ sung dịch song ngữ khi đọc, bật/tắt được, không sửa file Markdown gốc.
- Chế độ đọc song ngữ mới phải giữ từng đoạn gốc và bản dịch liền nhau để đối chiếu.
- Tiếp tục dùng provider của project. Không cần tích hợp tài khoản hoặc SDK Immersive Translate để đạt trải nghiệm được yêu cầu.
- Tác vụ lưu từ vựng do người dùng chủ động thực hiện vẫn là một luồng riêng.
- Đặc tả đọc song ngữ mới đã được người dùng duyệt ngày 2026-10-18; kế hoạch đang được chuẩn bị, tính năng chưa triển khai.

## Evidence on Hand

- `README.md`, `main.ts`, `src/types/index.ts`, các service provider, storage, translation và UI là nguồn mô tả hiện trạng.
- `docs/superpowers/specs/2026-10-18-immersive-reading-translation-design.md` ghi thiết kế cho yêu cầu mới.
- Kiểm tra ở snapshot `515e7b0`: 337 test trên 21 file pass; typecheck hiện thất bại. Test dùng mock Obsidian/HTTP, không thay thế bằng chứng chạy trong Obsidian thật.

## Product Principles

1. Giữ luồng đọc và quan hệ giữa đoạn gốc với bản dịch.
2. Chế độ đọc song ngữ không ghi nội dung vào ghi chú.
3. Người dùng chủ động bật/tắt dịch và chọn công cụ dịch.
4. Lỗi dịch phải được thể hiện rõ, không biến văn bản gốc thành bản dịch thành công.
