# Nâng cấp tập phim bằng ảnh thực tế

1. Vào **Tập phim**, mở bản hồ sơ (ví dụ **Tập 1 v2.0**), bấm **Tiếp tục trong Xưởng**. App lưu lịch sử bản làm việc trước đó, lấy kịch bản/shotlist/ảnh từ hồ sơ và mở bản đang nâng cấp. Các ID có hậu tố như `S01A` được giữ nguyên. Bản hồ sơ mốc vẫn xem/tải được trong Tập phim.
2. Trong Xưởng, chọn **Storyboard → Chi tiết & ảnh thực tế** trên từng shot. Tải ảnh khảo sát, bố cục thử hoặc khung hình quay thật; hoặc chọn ảnh từ Thư viện. Thêm ghi chú riêng cho mỗi ảnh, rồi **Lưu shot**. Có thể gỡ liên kết ảnh khỏi shot; file vẫn ở Thư viện. Tối đa 20 ảnh/shot. Ảnh lớn được tối ưu để Agent đọc, giữ ảnh gốc trên máy của bạn.
3. Sau khi thêm đủ tư liệu, chọn **Chạy quy trình** để giao lượt nâng cấp. Kiểm tra thời lượng và bật/tắt chế độ tự động duyệt theo nhu cầu. Mở Codex đã kết nối MCP để nhận và thực hiện công việc. Việc lưu ảnh không tự mở phiên Codex.

Ghi chú cần cụ thể: hướng cửa mở, giờ chụp, hướng nắng, vị trí máy, chi tiết khác storyboard, điều muốn giữ hoặc thay đổi. Ảnh thực tế và storyboard AI được lưu riêng để đối chiếu.

Agent nhận `context.episode.actualPhotos`, ánh xạ ID shot sang resource ID ảnh và ghi chú; cùng `workingSource` chỉ bản mốc và các file kiến thức/shotlist. Các ảnh gắn shot luôn có trong `context.resources.assets`, kể cả khi thư viện có nhiều tài nguyên. Agent phải đọc ảnh thật qua `studio_read_resource`, phân biệt quan sát của mình với mô tả người dùng. Writer/Camera phải giữ ID shot và liên kết ảnh của bản đang nâng cấp. Các bước sau tiếp tục dùng cùng ảnh/ghi chú.

Thêm, gỡ hoặc sửa ghi chú ảnh sau khi đã có kết quả sẽ lưu lịch sử và mở lại định hướng để rà soát tác động. Kết quả lần trước được giữ trong lịch sử, các bước mới phải duyệt theo chính sách của tập. Bấm **Mở bản nâng cấp** lần nữa chỉ mở bản đang làm, không đặt lại các ảnh hay chỉnh sửa đã lưu.

Codex có thể mở bản làm việc khi chủ Xưởng yêu cầu rõ bằng `studio_resume_episode_dossier(episode_id,dossier_id,expected_revision)`. Nếu danh mục MCP còn cũ, dùng `studio_save_artifact` với `task_id="episode:<id>"`, `claim_token=""`, `mime="application/json"`, `encoding="utf8"`, `filename="resume.json"`; `content` là JSON `{ "protocol":"valley-episode-work/1", "dossier_id":"v2-0", "expected_revision":42 }`. Luôn đọc `studio_get_project` để lấy revision thật, không dùng số ví dụ. Máy chủ không chiếm lease đang chạy và không tự giao/duyệt task khi mở bản làm việc.
