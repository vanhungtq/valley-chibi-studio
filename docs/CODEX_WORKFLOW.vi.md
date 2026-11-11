# Vận hành các vai trò trong Codex

Các instruction chi tiết nằm trong `public/data.js` và được đưa vào gói đầu việc. Đọc schema từ `studio_get_task`; không tự đoán cấu trúc output.

| Vai trò | Kiểm tra đầu vào | Đầu ra chính |
|---|---|---|
| Điều hành | Bible, brief, hiện trạng, nguồn lực, điều chưa biết | Mục tiêu, phạm vi, tiêu chí duyệt, câu hỏi khảo sát |
| Sáng tạo | Định hướng đã duyệt, ảnh thật, reference có nguồn | Concept, hook, motif, nhịp cảm xúc, màu sắc, đạo cụ |
| Biên kịch | Concept đã duyệt, nhân vật/bối cảnh xác nhận | Cảnh có ID, giờ kể, hành động quan sát được, âm thanh, cảm xúc |
| Quay phim | Kịch bản đã duyệt, máy/ống kính và ánh sáng hiện trường | Shot liên kết cảnh, bố cục, tiêu cự FF, chuyển động, ánh sáng, continuity |
| Designer | Kịch bản và shot list đã duyệt, thư viện | Hồ sơ trực quan, file Codex tạo, checklist, production book |

## Thời lượng và chế độ duyệt theo tập

Trong Brief, đặt `targetMinutes` từ 1 đến 240 phút. Gói task có `episode.targetMinutes` và `targetSeconds`; mục tiêu này ưu tiên hơn khoảng thời lượng chung của project. Biên kịch và Quay phim phải nộp tổng `shot.seconds` nằm trong ±5% mục tiêu. Thời lượng dựng khác thời lượng take và lịch quay. Khi sửa mục tiêu sau khi đã có kết quả, lưu phiên bản và mở lại từ định hướng.

**Tự động duyệt & chuyển bước** mặc định tắt, được chủ dự án bật/tắt riêng từng tập qua giao diện. Khi bật ở một kết quả đang chờ, kết quả được duyệt một lần và bước tiếp được giao ngay. Mỗi lần nộp hợp lệ, máy chủ lưu output và duyệt/chuyển bước trong cùng giao dịch D1, lưu `output.approval.mode=automatic`, lịch sử và nhật ký. MCP không có công cụ bật chế độ này.

Đọc `workflow`, `awaitingHumanReview` và `nextTask` trong phản hồi nộp. Khi tự động đang bật, đọc và nhận `nextTask` để tiếp tục vai trò kế tiếp trong phiên hiện tại. Khi tắt hoặc cần duyệt thủ công, dừng chờ chủ dự án. Tắt khi claim đang chạy vẫn giữ token, tiến độ và file; kết quả tiếp theo chờ duyệt. Tắt không hoàn tác các phê duyệt đã hoàn tất. Nếu phản hồi có `queueError`, nộp lại cùng output để khôi phục bước tiếp mà không duyệt trùng.

Chế độ này không mở phiên Codex ẩn và không giữ Codex chạy khi chat đã đóng. Khi đổi tài khoản, kết nối cùng MCP và đọc lại dữ liệu để tiếp tục. Máy chủ kiểm tra schema, nguồn và thời lượng; đánh giá nội dung và tính khả thi vẫn thuộc các vai trò trong Codex.

## Chu trình công cụ

```text
studio_list_tasks
  → studio_get_task
  → studio_claim_task
  → studio_read_resource
  → làm việc bằng Codex
  → studio_report_progress
  → studio_save_artifact (từng file)
  → studio_submit_result
  → thủ công: dừng chờ duyệt / tự động: nhận nextTask và tiếp tục
```

`studio_claim_task` trả token phiên và lease mười lăm phút. Báo tiến độ trước mỗi mười phút để gia hạn. Token chỉ kiểm soát việc cập nhật đầu việc, không phải API key mô hình; vẫn giữ trong phiên, không xuất ra hồ sơ.

Kết quả phải có `title`, `summary`, `content`, `missing`, `sources`, `scenes`. Biên kịch và Quay phim nộp đầy đủ scene/shot. Các vai trò khác dùng `scenes: []`. Dùng `assetIds` cho ảnh, để trường `image` trống. Chỉ dùng ID nguồn trong gói được giao. Liệt kê thiếu dữ kiện ở `missing`.

Nội dung phân tích chất lượng do Codex chịu trách nhiệm, không phải một bộ lọc tự chứng minh đúng. Máy chủ kiểm tra cấu trúc, quyền tài khoản, ID nguồn và đầu vào còn hiệu lực; chủ dự án vẫn cần đối chiếu hiện trường trước khi duyệt.

## Những trạng thái được đồng bộ

| Trạng thái | Ý nghĩa |
|---|---|
| `queued` | Chủ dự án đã giao, chưa có Codex nhận |
| `running` | Codex đã nhận, lease còn hiệu lực |
| `interrupted` (hiển thị) | Lease hết hạn, không giả định Codex vẫn đang chạy |
| `awaiting_review` | Kết quả và file đã được nộp, chờ người duyệt |
| `approved` | Đã duyệt thủ công hoặc tự động theo lựa chọn của chủ dự án |
| `changes_requested` | Bản cũ được mở lại để sửa |
| `stale` | Đầu vào thay đổi, cần gói mới |
| `cancelled` / `error` | Chủ dự án hủy hoặc Codex báo bị chặn |

## Tiêu chuẩn cho tập đầu

Giữ cách kể từ hành động và âm thanh đời sống. Chỉ đưa bối cảnh, người và đạo cụ thật vào hồ sơ quay khi đã đọc tư liệu. Tập “Ngày đầu ở thung lũng mận” đi từ con đường, mở nhà, dọn một góc, sửa mái hiên thử, bữa cơm tới căn nhà sáng đèn. Tách khối lượng cải tạo và lịch quay khỏi một ngày được kể trong phim. Không mặc định hai người tự hoàn thành công việc mái hoặc kết cấu lớn.

Mở rộng bằng chức năng quản lý tri thức, trợ lý sản xuất, continuity và biên tập quốc tế khi số tập tăng. Chưa có các agent phụ tự chạy; có thể thực hiện các kiểm tra đó trong trách nhiệm năm vai trò hiện tại.

## Storyboard và học từ video mẫu

Designer dùng tính năng tạo ảnh ChatGPT, nhóm tối đa 4 shot trong ảnh 2×2 không viền, theo thứ tự trên trái, trên phải, dưới trái, dưới phải. Nộp ảnh qua studio_save_artifact với storyboard_shot_ids, sau đó studio_submit_result. Ảnh được liên kết đúng shot và áp dụng chế độ duyệt của tập. Ảnh quá 1 MB có thể nhập tại tab Storyboard để cắt và lưu từng ô. Đây là ảnh AI dự kiến quay, không phải ảnh hiện trường.

Trong Tri thức & reference, tải ảnh kỹ thuật trực tiếp hoặc video mẫu MP4/MOV (30 MB/tệp); thêm từng shot có timecode, ảnh góc máy và chú thích tùy chọn. Video lớn hơn giữ URL nguồn và ảnh các shot. Có thể chụp khung hình tại vị trí đang dừng từ video đã lưu. Gói giao việc đưa phân tích và ID ảnh/video liên quan cho Codex đọc. Agent trích nguồn, áp dụng nguyên tắc vào câu chuyện riêng và nêu rõ phần chưa kiểm chứng.
