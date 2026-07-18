# Đặc tả README đa ngôn ngữ

- **Ngày:** 2026-07-13
- **Trạng thái:** Đã duyệt hướng thiết kế — chờ duyệt đặc tả
- **Phạm vi:** README cấp gốc của repository `Foxconn-AI-Solution`

## Mục tiêu

Tạo một điểm vào rõ ràng, chính xác và dễ duyệt trên GitHub cho nền tảng giám sát nhà máy Foxconn/FII. README phải giúp cả kỹ sư vận hành lẫn lập trình viên hiểu nhanh thành phần hệ thống, cách chạy cục bộ, luồng dữ liệu và vị trí tài liệu chuyên sâu mà không lặp lại toàn bộ tài liệu vận hành.

## Tệp và ngôn ngữ

Ba tệp được đặt song song tại thư mục gốc:

| Tệp | Ngôn ngữ | Vai trò |
| --- | --- | --- |
| `README.md` | Tiếng Việt | README mặc định trên GitHub |
| `README.en.md` | English | Bản dành cho cộng tác viên quốc tế |
| `README.zh-CN.md` | 简体中文 | Bản dành cho đội vận hành/kỹ thuật Trung Quốc |

Mỗi tệp có cùng cấu trúc, cùng thông tin kỹ thuật và thanh chuyển ngôn ngữ ở đầu trang. Không tách README vào `docs/` và không tạo ba cây thư mục riêng.

## Cấu trúc nội dung

1. Tên sản phẩm, mô tả một câu và liên kết chuyển ngôn ngữ.
2. Giá trị hệ thống và khả năng chính: giám sát thời gian thực, quản lý máy/dây chuyền, cảnh báo, đồng bộ Open Data Fusion.
3. Sơ đồ Mermaid mô tả luồng `ClientPLC → MQTT/Backend → Operations UI` và nhánh Outbox/Fusion Adapter đến Open Data Fusion.
4. Bảng thành phần với công nghệ và trách nhiệm của Frontend, Backend, ClientPLC, Fusion Contracts, Fusion Adapter và ODF runtime.
5. Hướng dẫn khởi chạy nhanh theo thứ tự: clone/submodule, PostgreSQL/MQTT, backend, frontend, tùy chọn ODF preview và adapter.
6. Phần Open Data Fusion nêu rõ hai công tắc độc lập (`CaptureEnabled`, `DispatchEnabled`), nguyên tắc outbox và liên kết runbook chi tiết.
7. Cây thư mục rút gọn, lệnh kiểm thử/xây dựng đã dùng và liên kết tài liệu liên quan.
8. Ghi chú bảo mật/vận hành: không commit secrets, ODF production dùng secret manager, chưa coi local preview là production.

## Phong cách biên tập

- Gọn ở phần giới thiệu, chi tiết ở các bước kỹ thuật có thể thực hiện.
- Ưu tiên bảng, danh sách ngắn và khối lệnh nhỏ; không dùng badge CI, số liệu hiệu năng hoặc trạng thái phát hành chưa được xác minh.
- Dùng thuật ngữ nhất quán giữa ba ngôn ngữ; tên sản phẩm, tên biến môi trường, đường dẫn và lệnh giữ nguyên.
- Không sao chép README của submodule hoặc thay thế runbook chuyên sâu; README chỉ liên kết đến chúng.

## Nguồn sự thật và giới hạn

Nội dung được kiểm chứng từ cấu trúc repository, project files, cấu hình ODF cục bộ và runbook tại `infrastructure/open-data-fusion/README.md`. Không thay đổi mã ứng dụng, cấu hình runtime, README trong submodule hay tài liệu độc lập hiện có.

## Tiêu chí chấp nhận

- GitHub tự hiển thị README tiếng Việt ở nhánh `main` và cho phép chuyển sang hai bản dịch bằng một lần nhấp.
- Ba README cùng bao phủ một tập thông tin và lệnh kỹ thuật tương đương.
- Các liên kết nội bộ, tên tệp, lệnh `dotnet`, `npm`, Docker Compose và biến Open Data Fusion khớp với repository.
- Không có secret, mật khẩu mặc định, hướng dẫn production gây hiểu nhầm hoặc tuyên bố kiểm thử không có bằng chứng.
- Markdown hợp lệ, có thể đọc tốt trên GitHub và không cần ảnh/badge bên ngoài để hiểu nội dung.
