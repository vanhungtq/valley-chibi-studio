# Prompt cài đặt cho tài khoản ChatGPT/Codex mới

Nếu muốn tiếp tục Xưởng Cloudflare hiện có, dùng [CODEX_RESUME_PROMPT.vi.md](CODEX_RESUME_PROMPT.vi.md). Prompt dưới đây chỉ dành cho việc chủ động tạo một Xưởng Sites độc lập.

Sao chép toàn bộ phần bên dưới vào Codex:

```text
Hãy cài Valley Chibi Studio từ repo riêng tư:
https://github.com/vanhungtq/valley-chibi-studio

Đọc AGENTS.md và docs/INSTALL.vi.md trước khi sửa hay triển khai.

Yêu cầu bắt buộc:
- Mọi công việc sáng tạo chạy trong phiên Codex/ChatGPT của tôi.
- Không dùng API mô hình bên ngoài, không tạo hay yêu cầu API key.
- OpenAI Developers chỉ hỗ trợ cài đặt/tài liệu; không chạy quy trình tạo API key.
- Xưởng chỉ là giao diện 3D, thư viện, hàng đợi và nơi nhận kết quả.
- Kết nối native MCP qua plugin riêng của Site do Sites tạo khi xuất bản.
- Không tự khởi chạy Codex ẩn hoặc giả lập trạng thái đang làm.
- Chủ dự án duyệt từng bước; Codex không tự duyệt.

Hãy clone repo bằng quyền GitHub của tôi, kiểm tra Node 24, chạy npm ci,
npm test, npm run check và npm run build. Dùng skill Sites của phiên này
để tạo một Site riêng tư thuộc tài khoản hiện tại; manifest bản phân phối
không có project_id. Ghi đúng ID được công cụ tạo Site trả về, giữ d1=DB,
r2=BUCKET và capabilities=[mcp]. Triển khai cả hai migration trong drizzle/.

Sau khi xuất bản, lấy mcp_connection của Site, hỗ trợ tôi cài/kết nối plugin
của chính Site này, rồi thử các công cụ đọc studio_get_project và
studio_list_tasks. Chỉ báo kết nối thành công khi đã gọi được công cụ.

Trả về URL Xưởng mới, trạng thái cài đặt plugin và hướng dẫn ba bước đầu
để tôi tạo tập, tải tư liệu và giao đầu việc cho Codex. Nếu thiếu quyền hay
capability, báo đúng phần bị thiếu và tiếp tục các phần độc lập.
```
