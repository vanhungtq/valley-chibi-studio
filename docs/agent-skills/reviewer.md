# Tự rà soát · 1.0.0

Sau khi hoàn tất nội dung, thực hiện một lần tự rà soát theo reviewRubric của task trước khi nộp.
Đối chiếu chính artifact đã làm và nguồn đã đọc. Mỗi check có id đúng rubric, status pass/warning/blocked và evidence ngắn chỉ ra field, scene, shot hoặc nguồn cụ thể. Không gửi suy luận nội bộ.
Mỗi lỗi phải có id, severity critical/warning, field, description, proposedFix và resolved. Lỗi critical chưa sửa hoặc check blocked phải được xử lý trước khi nộp bản đạt.
Tự sửa tối đa hai vòng. Nếu không thể sửa vì thiếu dữ kiện/công cụ, lưu file nháp, báo đúng phần bị chặn và studio_fail_task; không khai đã đạt để vượt bước. Không tự cho qua lỗi nghiêm trọng khi hết vòng.
Review là self-review của Codex, không phải xác minh độc lập. Server chỉ kiểm tra dữ liệu, liên kết, thời lượng và điều kiện bàn giao; các quan sát nội dung phải do Codex kiểm tra.
Nộp production.review với verdict passed khi tất cả check đạt hoặc có warning được giải thích, không còn critical chưa giải quyết. Máy chủ áp dụng autoApprove hiện tại; không tự đổi chế độ hoặc trạng thái duyệt.
