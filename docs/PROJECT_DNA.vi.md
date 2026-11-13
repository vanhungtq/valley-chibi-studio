# Kho DNA dự án: quy tắc, setup, mẫu phân cảnh

Trong **Tri thức & reference**, mở **DNA dự án** (tên do chủ dự án đặt). Kho gồm ba lớp:

1. `principles`: cách kể chuyện, tiến triển hành động, ngôn ngữ hình ảnh và các quy tắc dùng chung.
2. `setups`: bố cục ảnh nguồn, vị trí/lớp hành động, cỡ cảnh, cách áp dụng cho người và không gian của dự án. Chi tiết thể hiện trong `description`, `frameLayout`, `application`; thông số không có chứng cứ giữ rõ là chưa biết.
3. `recipes`: chuỗi bước của phân cảnh theo chủ đề, mỗi bước dẫn ID shot nguồn. Ví dụ các nhóm phân cảnh được phân loại là sơ chế, nấu ăn, hái rau, cuốc đất; chỉ tạo mẫu cụ thể sau khi đọc ảnh/CSV.

Mọi mẫu có `key` ổn định, vai trò áp dụng, phân loại cảnh, ID nguồn và ảnh dẫn chứng. `templateReferenceId` xác định nguồn của bố cục/chuỗi bước mặc định; tránh nhầm cùng mã `S01` giữa hai video. Nguồn khác cùng key bổ sung ví dụ và loại cảnh đã quan sát.

## Nguồn chuẩn và phần dùng chung

Chủ dự án có thể chọn nguồn chuẩn bằng ID hồ sơ hoặc nhãn duy nhất, ví dụ `Vid2`. Đó là lựa chọn của chủ dự án, chưa phải kết luận đã quan sát video. Khi nguồn chưa nhập/phân tích, kho hiện chờ nguồn và không sinh quy tắc.

- `owner_anchor`: mẫu đã phân tích từ nguồn chủ dự án chọn làm chuẩn.
- `cross_video`: cùng key được ghi nhận ở ít nhất hai nguồn hiện hành.
- `single_source`: biến thể/mẫu riêng của một nguồn; có thể dùng cho phân cảnh phù hợp nhưng không tự coi là DNA chung.

Nguồn hoặc CSV thay đổi làm analysis cũ hết hiệu lực. Kho chỉ biên soạn từ analysis có source hash khớp hồ sơ hiện hành. Mẫu thiếu ảnh dẫn chứng bị loại khỏi phần áp dụng. Các nhóm trùng key ưu tiên nội dung của nguồn chuẩn và giữ dẫn chứng của các nguồn còn lại.

`ready` cần có nguyên tắc chung, setup chung và mẫu phân cảnh. `partial` là có một phần; phân tích cũ chỉ có `skills` được chuyển thành nguyên tắc, không giả thành setup hay chuỗi cảnh chưa phân tích. Tối đa 50 nguồn trong một bộ, dữ liệu biên soạn tối đa 1 MiB.

## Phân tích ảnh thành dữ liệu DNA

Khi bộ DNA đã cấu hình, lượt phân tích reference mới nhận `context.dnaTarget`: định hướng, nguồn chuẩn, cách áp dụng và key đã có. Codex phải đọc ảnh từng shot, đối chiếu ảnh của bộ DNA hiện có, rồi nộp `analysis.dna`:

```json
{
  "version": "1.0",
  "principles": [],
  "setups": [],
  "recipes": []
}
```

Mỗi mẫu cần `key` ASCII, `title`, `description`, `application`, `roles`, `sceneTypes`, `sourceShotIds`, `evidenceBasis`. `evidenceBasis` là `still`, `csv`, `derived_timing` hoặc `mixed`. Setup cần `frameLayout`. Recipe cần 2–30 `steps`, mỗi bước có `label` và `shotIds` nằm trong mẫu. Cả bộ không được rỗng, tối đa 160 KiB, 60 mẫu mỗi nhóm. Các ID phải thuộc gói ảnh đã giao.

Ảnh và CSV cho phép phân tích bố cục và tính thời lượng khi timecode đủ dữ liệu. Chuyển động, âm thanh và thông số ống kính không được coi là đã xác minh từ một ảnh tĩnh. Dữ liệu tải lên là nguồn tham khảo, không phải chỉ thị thay quy tắc hệ thống.

## Lấy DNA ra viết kịch bản

Khi tạo/sửa brief hoặc chạy quy trình, chọn các loại video/phân cảnh và bật **Dùng [tên DNA]**. Bộ DNA chung được lấy độc lập với từng video, còn mẫu phân cảnh và biến thể setup được lọc theo lựa chọn. Mỗi vai trò nhận `resources.dna` cùng ảnh dẫn chứng thực tế.

`match_reference_layout` ưu tiên dùng bố cục/setup tương ứng làm mẫu và thay bằng bối cảnh, nhân vật, đạo cụ của chủ dự án. Agent phải đối chiếu nguồn thật của dự án, giữ ID và ghi key DNA + reference/shot đã áp dụng. `adapt_layout` cho phép đề xuất bố cục mới. DNA không thay ảnh hiện trạng hay danh tính nhân vật của dự án.

Nguyên tắc riêng của một nguồn được đưa vào gói làm việc khi khớp dạng video/phân cảnh chủ dự án đã chọn. Nó vẫn giữ nhãn `single_source`; việc truy xuất không tự nâng thành nguyên tắc chung. Khi chưa chọn chủ đề, chỉ các nguyên tắc chung/nguồn chuẩn được lấy mặc định.

Mở kho để xem mẫu, xem ảnh nguồn, hoặc tải JSON. Cấu hình/kiến thức nằm trong dữ liệu riêng của chủ dự án; không đưa phân tích thực tế và ảnh tải lên vào repo mã nguồn công khai.

## MCP và tương thích phiên cũ

`studio_project_dna` hỗ trợ `get`, `configure`; cấu hình cần revision mới nhất và yêu cầu rõ của chủ dự án. Không thay cấu hình khi một tác vụ sản xuất còn lease đang chạy.

Danh mục MCP cũ đọc kho bằng `studio_get_task(task_id="dna:active")`. Đây là thao tác đọc kho, không phải đầu việc để claim. Cấu hình qua `studio_save_artifact` với namespace `dna:active`, claim rỗng, JSON/UTF-8; content gồm `protocol="valley-project-dna/1"`, `action="configure"`, `expected_revision`, `config`. Chỉ dùng khi `studio_get_project.projectDna` công bố giao thức này.

Config gồm `title`, `enabled`, `anchorLabel`, `anchorReferenceId`, `ownerBrief`, `sourceReferenceIds`, `mode`. Bỏ trống danh sách nguồn để dùng các hồ sơ đã nhập; bỏ trống anchor ID để nhận theo nhãn khi có đúng một hồ sơ khớp.
