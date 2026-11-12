# Phiên bản hồ sơ trong Tập phim

Vào **Tập phim → Hồ sơ tập phim** để mở các phiên bản được trình bày từ file đã có.
Mỗi phiên bản có tên riêng, thời lượng, ảnh storyboard, shotlist đọc trực tiếp và bốn tài liệu: PDF, ZIP, CSV, kiến thức Markdown.

Bấm **Tiếp tục trong Xưởng** để dùng bản hồ sơ làm nền cho lần nâng cấp tiếp, thêm ảnh thực tế và ghi chú cho từng shot. Xem [hướng dẫn ảnh thực tế](SHOT_PHOTOS.vi.md).

- **Tổng quan**: mạch chuyện theo cảnh, thời lượng và bộ tài liệu.
- **Storyboard**: xem từng bảng ảnh AI, lọc phân cảnh, bấm để phóng lớn. Các ô giữ thứ tự trên trái, trên phải, dưới trái, dưới phải.
- **Shotlist**: lọc cảnh, mở mỗi shot để đọc góc máy, ánh sáng, âm thanh và continuity.
- **Tài liệu & PDF**: mở/tải từng file và đọc PDF trong trang. Điện thoại không hỗ trợ PDF nhúng có thể mở tab mới.

Một hồ sơ là bản trình bày của file đã nhập, không phải một lần chạy agent hay một mốc tự động được duyệt. Các output, storyboard của quy trình, claim, chính sách tự động và kết quả đã duyệt được giữ nguyên. Dữ liệu snapshot nằm trong `episode.dossiers`; không tạo tập tiếp theo chỉ để thêm phiên bản.

## Đồng bộ từ Codex khi chủ Xưởng yêu cầu

1. Đọc `studio_get_project` mới nhất; kiểm tra đúng dự án và tập.
2. Nhập các file/ảnh qua quy trình [Thư viện](LIBRARY_UPLOADS.vi.md), kiểm tra tải lại thành công. Tài nguyên dùng chung hoặc của đúng tập mới được liên kết.
3. Gọi `studio_publish_episode_dossier` với `episode_id`, `dossier_id` ổn định (ví dụ `v2-0`), `title`, `version`, `summary`, `expected_revision`; `file_ids` gồm `pdf`, `archive`, `shotlist`, `knowledge`; `gallery` gồm `{asset_id, shot_ids}` theo đúng thứ tự ô; `visual_bible_id` tùy chọn.
4. Máy chủ đọc CSV thật để lấy shot và timeline. CSV dùng các cột `shotId,sceneId,sceneTitle,page,panel,start,end,seconds,timecode,lensMm,size,angle,move,action,continuity,sound,lighting,aperture,recording,techniqueRefs`. Thời lượng phải khớp mục tiêu ±5%, ID duy nhất, timeline liên tục. Nếu có gallery, phải đủ ảnh cho toàn bộ shot.
5. Đọc lại dự án, kiểm tra `episode.dossiers` và mở URL `/#episodes/<episodeId>/<dossierId>` trong App. Cùng yêu cầu/ID trả kết quả đã có; không tạo trùng. Nội dung khác phải dùng ID phiên bản mới. Revision cũ bị từ chối.

Nếu chủ Xưởng yêu cầu chuẩn hóa nhãn ảnh đang nhập cho phiên bản, có thể thêm `refresh_gallery_labels=true`: máy chủ đặt mô tả của đúng các ảnh gallery theo tên hồ sơ, page và ID shot thật từ CSV. Mặc định giữ nguyên mô tả thư viện. Không suy ID theo số thứ tự hàng; shot có hậu tố (ví dụ `S01A`) phải được giữ nguyên.

Phiên MCP giữ danh mục cũ đọc `episodeDossier` trong `studio_get_project`, rồi dùng `studio_save_artifact`: `task_id="episode:<episodeId>"`, `claim_token=""`, `mime="application/json"`, `encoding="utf8"`, `filename="episode-dossier.json"`. `content` là JSON gồm `protocol="valley-episode-dossier/1"` và các trường ở bước 3 trừ `episode_id` (lấy từ namespace). Đây là thao tác chủ Xưởng tổ chức hồ sơ, không phải nhận hay nộp task. UUID task bình thường giữ nguyên mọi kiểm tra claim.

File luôn dùng đăng nhập App; không công khai tài liệu, không đưa dữ liệu dự án vào source GitHub và không dùng API mô hình.
