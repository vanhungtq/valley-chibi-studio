# Vận hành các vai trò trong Codex

Các instruction chi tiết nằm trong `public/data.js` và được đưa vào gói đầu việc. Đọc schema từ `studio_get_task`; không tự đoán cấu trúc output.

| Vai trò | Kiểm tra đầu vào | Đầu ra chính |
|---|---|---|
| Điều hành | Bible, brief, hiện trạng, nguồn lực, điều chưa biết | Mục tiêu, phạm vi, tiêu chí duyệt, câu hỏi khảo sát |
| Sáng tạo | Định hướng đã duyệt, ảnh thật, reference có nguồn | Concept, hook, motif, nhịp cảm xúc, màu sắc, đạo cụ |
| Biên kịch | Concept đã duyệt, nhân vật/bối cảnh xác nhận | Cảnh có ID, giờ kể, hành động quan sát được, âm thanh, cảm xúc |
| Quay phim | Kịch bản đã duyệt, máy/ống kính và ánh sáng hiện trường | Shot liên kết cảnh, bố cục, tiêu cự FF, chuyển động, ánh sáng, continuity |
| Designer | Kịch bản và shot list đã duyệt, thư viện | Hồ sơ trực quan, file Codex tạo, checklist, production book |

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
  → dừng, chủ dự án duyệt tại Xưởng
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
| `approved` | Chủ dự án đã duyệt trong Xưởng |
| `changes_requested` | Bản cũ được mở lại để sửa |
| `stale` | Đầu vào thay đổi, cần gói mới |
| `cancelled` / `error` | Chủ dự án hủy hoặc Codex báo bị chặn |

## Tiêu chuẩn cho tập đầu

Giữ cách kể từ hành động và âm thanh đời sống. Chỉ đưa bối cảnh, người và đạo cụ thật vào hồ sơ quay khi đã đọc tư liệu. Tập “Ngày đầu ở thung lũng mận” đi từ con đường, mở nhà, dọn một góc, sửa mái hiên thử, bữa cơm tới căn nhà sáng đèn. Tách khối lượng cải tạo và lịch quay khỏi một ngày được kể trong phim. Không mặc định hai người tự hoàn thành công việc mái hoặc kết cấu lớn.

Mở rộng bằng chức năng quản lý tri thức, trợ lý sản xuất, continuity và biên tập quốc tế khi số tập tăng. Chưa có các agent phụ tự chạy; có thể thực hiện các kiểm tra đó trong trách nhiệm năm vai trò hiện tại.
