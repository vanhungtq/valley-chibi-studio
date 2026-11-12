# Video mẫu từ ZIP và sổ tay kỹ năng của Agents

Trong **Tri thức & reference**, chọn **Nhập ZIP video mẫu**. Gói cần CSV và ảnh từng shot; không cần video hoàn chỉnh. ZIP được giải nén trong trình duyệt, ảnh được tối ưu nếu quá lớn rồi lưu vào kho riêng của Xưởng. Chi tiết hồ sơ và phân tích nằm trong D1; dữ liệu tập chỉ giữ mục lục, tránh nhân bản toàn bộ video vào mỗi tập.

```text
video-tham-khao/
  shots.csv
  shots/
    S01.jpg
    S02.jpg
```

Mẫu: [reference-template.csv](../public/reference-template.csv). CSV có thể dùng dấu phẩy, chấm phẩy hoặc tab; hỗ trợ BOM, ô có dấu nháy/xuống dòng và tên cột tiếng Việt/Anh. App tự nhận cột, có giao diện sửa ghép cột và chọn CSV nếu ZIP chứa nhiều bảng.

Các cột hữu ích: `shot_id`, `scene_id`, `scene_type`, `timecode` (hoặc `start`, `end`), `image_path`, `description`, `size`, `lens`, `move`. Đường dẫn ảnh có thể tương đối với CSV hoặc thư mục gốc ZIP. Khi không có cột ảnh, App thử ghép ID với tên ảnh; nếu không chắc sẽ yêu cầu chọn. Có thể chọn ghép theo thứ tự tên file khi số ảnh bằng số dòng, sau khi kiểm tra preview. Không tự ghép tùy tiện ảnh trùng tên.

Giới hạn mỗi gói: ZIP 100 MiB, tổng CSV/ảnh sau giải nén 200 MiB, 300 shot, ảnh gốc tối đa 20 MiB, CSV tối đa 1 MiB. Thư viện hiện có tối đa 600 tài nguyên. Ảnh lớn được tối ưu để Codex đọc, giữ bản gốc trên máy. ZIP mã hóa/ZIP64, đường dẫn vượt thư mục và tệp bị hỏng bị từ chối. App lưu đủ ảnh/CSV đã nhập; không cần tải nguyên ZIP lên KV.

Sau khi nhập, hồ sơ hiển thị ảnh, shot, timecode và phân cảnh; bấm ảnh để xem lớn. Mở **Thông tin & phân loại** để đặt dạng video (Nấu ăn, Nông nghiệp, Cải tạo nhà…) và loại từng phân cảnh (Hái rau, Cuốc đất, Sơ chế…). Các loại có sẵn là gợi ý, có thể nhập thêm loại mới. Bộ lọc trên trang thư viện giúp tìm đúng dạng video hoặc phân cảnh.

## Codex phân tích và lưu kiến thức

Chọn **Giao Codex phân tích** hoặc giữ tùy chọn đó khi nhập ZIP. Trạng thái đầu tiên là **Chờ Codex nhận việc**. Chọn **Sao chép yêu cầu cho Codex**, dán vào phiên đã kết nối MCP. App chỉ giao và lưu công việc; việc nhập ZIP không tự mở một phiên AI.

Codex phải đọc ảnh thật qua `studio_read_resource`, phân biệt điều quan sát từ ảnh với mô tả trong CSV và suy luận. Timecode có thể cung cấp dữ liệu để tính thời lượng, nhưng ảnh tĩnh không chứng minh chuyển động máy hoặc âm thanh của video hoàn chỉnh.

Kết quả gồm quan sát từng shot, nguyên tắc quay/kể chuyện, vai trò áp dụng, ID shot dẫn chứng và giới hạn nhận định. Khi CSV chưa có nhãn, Codex có thể gợi ý dạng video và loại phân cảnh; App điền vào chỗ còn trống, bạn có thể sửa lại. Kết quả được lưu thành sổ tay kiến thức theo hồ sơ để những task sau truy xuất; không dùng API mô hình bên ngoài.

Nếu đổi Codex, bấm **Bàn giao Codex khác** trước khi nhận bằng token mới. Tiến độ và đầu vào đã lưu vẫn còn. Không sao chép token từ phiên cũ. Sửa hồ sơ/phân loại làm các lượt phân tích cũ hết hiệu lực; cần giao phân tích lại để áp dụng kỹ năng hiện hành.

## Chọn nguồn khi làm tập mới

Ở bước tạo/sửa brief hoặc **Chạy quy trình**, dùng **Reference muốn ứng dụng**. Hoặc trong thư viện bấm **Chọn reference cho tập**.

- Có thể chọn nhiều dạng video, nhiều loại phân cảnh hoặc ghim hồ sơ cụ thể.
- Trong một nhóm là OR; giữa các nhóm là AND. Ví dụ chọn **Nấu ăn + Hái rau** lấy shot hái rau từ video nấu ăn.
- Mỗi gói sản xuất lấy tối đa 10 reference liên quan. Với hồ sơ ảnh, máy chủ đọc chi tiết thật từ D1, lọc các shot/ảnh và kỹ năng theo phân cảnh đã chọn. Gói reference lớn hơn 1 MiB yêu cầu lọc hẹp hơn.
- Không có nguồn khớp thì số nguồn nhận được là 0, không thay bằng video mẫu khác. Chưa chọn nhóm nào thì dùng cách chọn reference liên quan hiện có.
- Đổi lựa chọn sau khi đã có kết quả sẽ lưu lịch sử và mở lại định hướng. Agent nhận lựa chọn ở `episode.referenceSelection`, nguồn ở `resources.references`, kỹ năng ở `analysis.skills`. Dẫn reference ID và shot nguồn, học nguyên tắc rồi áp dụng cho bối cảnh riêng.

## Công cụ và hợp đồng phân tích

`studio_reference_analysis` có các action `list`, `get`, `claim`, `progress`, `submit`, `fail`. Gọi theo `job_id`; mọi thao tác ghi sau claim cần token mới và lease 15 phút. Mỗi shot phải có quan sát dẫn đúng image ID, mỗi kỹ năng phải dẫn shot trong gói. Nộp lặp cùng kết quả đã tiếp nhận không tạo bản trùng. Revision và nguồn được kiểm tra lại trước khi lưu; đầu việc phân tích không thay output hay mốc duyệt của tập.

Danh mục tool cũ dùng namespace `reference:<jobId>` với `studio_get_task`, `studio_claim_task`, `studio_report_progress`, `studio_fail_task`. `studio_get_project.referenceJobs` liệt kê ID thật. Khi nộp bằng `studio_submit_result`, `scenes=[]`, giữ trường schema cũ và đặt JSON analysis trong block `valley-reference-analysis` cuối `output.content`.

Analysis gồm `title`, `summary`, `videoTypes` (tùy chọn), `observations: [{shotId,imageId,observation,sceneTypes?}]`, `skills: [{title,technique,application,roles,sourceShotIds,sceneTypes}]`, `limits: [string]`. Roles là `ceo`, `creative`, `writer`, `camera`, `designer`. Đây là Codex tự phân tích; kiểm tra schema không xác minh thay việc đọc ảnh.
