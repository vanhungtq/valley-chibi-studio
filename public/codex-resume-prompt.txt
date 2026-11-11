Hãy tiếp tục Xưởng Chibi đang có của tôi trong tài khoản Codex/ChatGPT hiện tại:

- Xưởng: https://valley-chibi-studio.vanhungtq1.workers.dev
- Remote MCP Streamable HTTP, OAuth: https://valley-chibi-studio.vanhungtq1.workers.dev/mcp
- Repo: https://github.com/vanhungtq/valley-chibi-studio
- GitHub chủ Xưởng: vanhungtq.

Giữ nguyên Xưởng, repo, D1 và các kho KV. Không tạo Site/Worker/database/dự án mới hoặc deploy lại chỉ vì tôi đổi Codex. Nếu chưa thấy công cụ Xưởng, hướng dẫn tôi thêm kết nối MCP trong tài khoản hiện tại và cấp quyền bằng cùng GitHub chủ Xưởng. Không sao chép token, claimToken hoặc Secret từ tài khoản cũ; không yêu cầu dán Secret vào chat. Không khẳng định kết nối thành công khi chưa gọi được công cụ.

Đọc studio_get_project và studio_list_tasks để lấy dữ liệu thực tế. Đối chiếu tên dự án và tập với tôi; đọc studio_get_task của việc cần tiếp tục, gồm task.progress và task.artifacts. Đọc file liên quan bằng studio_read_resource. Không giả định có lịch sử chat hoặc file chưa đồng bộ của tài khoản cũ.

Nếu task đang running và lease cũ còn hiệu lực, hướng dẫn tôi vào Xưởng → Kết nối Codex → Bàn giao sang Codex khác hoặc chờ lease hết hạn. Nhận bằng studio_claim_task và dùng claimToken mới. Với awaiting_review, chờ tôi duyệt, không làm lại. Với stale, cần tôi giao task mới từ brief/tư liệu hiện tại.

Thực hiện tác vụ sáng tạo trong Codex bằng công cụ hiện có; không gọi API mô hình ngoài và không yêu cầu API key mô hình. Báo tiến độ qua studio_report_progress, lưu bản nháp/file qua studio_save_artifact, nộp qua studio_submit_result rồi dừng chờ tôi duyệt. Giữ nguyên ID cảnh/shot, nguồn và schema; nêu rõ phần chưa đồng bộ hoặc công cụ còn thiếu.

Chỉ khi tôi yêu cầu sửa app: dùng kết nối GitHub riêng để đọc repo, AGENTS.md và docs/RESUME_CODEX.vi.md. Fetch main mới nhất, giữ thay đổi của chủ repo, chạy kiểm tra phù hợp rồi cập nhật trực tiếp main; không tạo nhánh/PR. Dùng lại tài nguyên Cloudflare hiện có.
