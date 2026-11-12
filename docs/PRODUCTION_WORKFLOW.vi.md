# Quy trình chuyên môn 1.0 · Xưởng Chibi

Bản 2.1 bổ sung bộ kỹ năng, hợp đồng bàn giao theo vai trò và báo cáo tự rà soát. Nội dung được thực hiện trong phiên Codex/ChatGPT đang kết nối MCP; Cloudflare kiểm tra dữ liệu, lưu file và chuyển trạng thái.

## Bắt đầu một lần chạy

Trong Xưởng, chọn **Chạy quy trình**, nhập thời lượng, chọn **Tự động duyệt & chuyển bước** rồi bấm **Bắt đầu & giao việc**. Sao chép yêu cầu của đầu việc sang phiên Codex đã kết nối.

- Bật tự động: sau kết quả đạt điều kiện, máy chủ duyệt và tạo `nextTask`; Codex nhận và làm tiếp đến hết năm vai trò.
- Tắt tự động: kết quả chờ chủ Xưởng duyệt từng bước. Công tắc vẫn có thể tắt trong khi một claim đang chạy.
- Đổi thời lượng: lưu bản trước vào lịch sử, giữ các file đã đồng bộ và mở lại từ Điều hành. Nếu có một claim còn hiệu lực, đổi thời lượng bị từ chối để giữ công việc đang làm.
- Đóng phiên Codex không tạo ra một phiên ẩn tiếp tục chạy. Có thể kết nối cùng MCP từ Codex khác và nhận lại đúng phần đã đồng bộ.

Khi **chủ Xưởng đã yêu cầu rõ việc bắt đầu và lựa chọn thời lượng/chế độ trong chat**, Codex có thể dùng `studio_start_episode` sau khi đọc `studio_get_project`. Các tham số: `episode_id`, `target_minutes`, `auto_approve`, `expected_revision`. Revision phải lấy từ lần đọc mới nhất. Công cụ này không phải lệnh duyệt một kết quả; agent không được dùng nó để tự đổi lựa chọn của chủ Xưởng hoặc bỏ qua mốc đang chờ duyệt.

Các phiên MCP chưa làm mới danh sách công cụ có thể vẫn chỉ thấy chín công cụ cũ. Dùng nút **Chạy quy trình** của Xưởng để chuẩn bị đầu việc; tiếp tục bằng các công cụ đã có. Danh mục mới có mười công cụ.

## Gói đầu việc

`studio_get_task` trả:

- `skills`: kỹ năng quay thực tế, kỹ năng của vai trò và kỹ năng reviewer, kèm phiên bản.
- `reviewRubric`: các tiêu chí cần tự kiểm tra ở bước này.
- `productionSchema`: schema của dữ liệu bàn giao và self-review.
- `productionPolicy`: phiên bản workflow/contract, cờ bắt buộc, giới hạn vòng sửa.
- `context`, `outputSchema`, `task.progress`, `task.review`, `task.artifacts`: đầu vào và phần đã lưu để tiếp tục.

Skill chuẩn được định nghĩa trong `worker/production/skills.js`; bản Markdown ở `docs/agent-skills/` được tạo khi build. Workflow nằm ở `worker/production/manifest.js`; các bản JSON schema được xuất vào `docs/contracts/production-*.schema.json`. Đây là hướng dẫn tin cậy của dự án. File/tham khảo tải vào thư viện không được quyền đổi quy trình hoặc chế độ duyệt.

## Năm hợp đồng bàn giao

| Vai trò | Dữ liệu chuyên môn trong `production.data` |
|---|---|
| Điều hành | Mục tiêu phút, phạm vi, giới hạn, facts có nhãn nguồn, giả định, câu hỏi, tiêu chí và bàn giao |
| Sáng tạo | 2–3 concept, ID concept được chọn, lý do, styleProfile, đạo cụ, giả định và bàn giao |
| Biên kịch | Beat map liên kết toàn bộ scene, thời lượng beat khớp shot, continuity và giả định; nộp scenes đầy đủ |
| Quay phim | Shot design cho mọi shot, sound plan cho mọi scene, thiết bị và giả định; nộp scenes đầy đủ |
| Designer | Danh mục file thật đã lưu, production book HTML/PDF, trạng thái storyboard từng shot, checklist và giả định |

Hợp đồng có dạng `production = {schemaVersion: "1.0", stage, data, review}`. Đọc schema từ task thay vì đoán tên trường. Giữ các trường output cũ: `title`, `summary`, `content`, `missing`, `sources`, `scenes`.

`production.review` gồm `verdict`, `round`, `checks`, `findings`. Mỗi check dùng đúng một ID từ rubric, có `status` và `evidence` cụ thể. Finding có vị trí, mô tả, mức độ, hướng sửa và cờ đã xử lý. Không gửi suy luận nội bộ.

## Tương thích MCP cũ

Nếu công cụ nộp của phiên đã nhận trường `production`, dùng trường đó. Nếu phiên vẫn có schema output cũ, ghi tài liệu dễ đọc trong `content`, rồi thêm **một** block ở cuối:

````text
```valley-production
{JSON đầy đủ của production theo productionSchema của task}
```
````

Máy chủ đọc, kiểm tra và lưu JSON thành trường `production`; phần tài liệu hiển thị sẽ bỏ block kỹ thuật. Không dùng đồng thời trường `production` và block, không nộp nhiều block. Khi retry kết quả đã được nhận, giữ nguyên nội dung đã gửi.

Task cũ đã được tạo trước bản nâng cấp vẫn có thể nhận/nộp theo hợp đồng cũ. Gói task ghi `productionPolicy.required=false` và kết quả được gắn nhãn `legacy`, không giả làm đã qua self-review mới. Nếu nộp `production` cho task cũ, máy chủ vẫn kiểm tra đầy đủ. Task mới và các bước được giao tiếp sau nâng cấp bắt buộc hợp đồng 1.0.

## Rà soát và tự sửa

1. Thực hiện vai trò, đọc nguồn thật và tạo file cần bàn giao.
2. Tự rà soát theo rubric: nguồn, khả năng quay thật, continuity và tiêu chí riêng của vai trò.
3. Sửa lỗi có thể sửa trong phiên, tối đa hai vòng theo hướng dẫn. Nếu thiếu dữ kiện/công cụ không giải quyết được, lưu nháp và báo phần bị chặn.
4. Nộp output, contract và review. Chỉ dùng `verdict=passed` sau khi đã kiểm tra; không còn check blocked hay critical chưa xử lý.
5. Nếu server trả lỗi `quality`, đọc `issues[].field`, `message`, `proposedFix`, số lần nộp lỗi và `nextAction`. Sửa rồi nộp lại cùng claim đang có hiệu lực. Nộp lại đúng payload lỗi không tăng số lần lỗi; payload mới mới được tính thêm.
6. Nếu đạt, đọc `workflow`, `awaitingHumanReview`, `nextTask`. Tiếp tục hoặc dừng theo chế độ hiện tại, không tự bật tự động.

Máy chủ kiểm tra schema, rubric, nguồn, thời lượng và mapping: concept được chọn phải tồn tại; beat phải phủ scene và khớp thời lượng; shot design/sound plan phải phủ đúng ID; production book phải là file thật; ảnh storyboard ready phải có mapping đúng shot. Hình thiếu phải được ghi trong `missing` và cảnh báo review.

Đây là **self-review của Codex**, không phải đánh giá độc lập hay chứng nhận hiện trạng. Server không xem thay Codex nội dung ảnh, tính thẩm mỹ hoặc điều kiện quay thực tế. Giao diện trình bày rõ nguồn của kết quả kiểm tra.

## Đồng bộ và lịch sử

Báo cáo lỗi review lưu theo task, không ghi đè brief hoặc áp dụng output lỗi. Handoff giữ report, tiến độ và file để phiên tiếp theo biết cần sửa gì. Kết quả hợp lệ và trạng thái task/state được ghi trong cùng giao dịch D1; cập nhật muộn sau handoff/cancel/đổi revision bị từ chối.

Migration `0002_production_review.sql` thêm báo cáo, digest payload đã review và số lần lỗi vào task. Giữ các migration cũ bất biến. Script deploy hiện có áp dụng migration trước khi triển khai Worker mới vào database đã tồn tại. `/healthz` kiểm tra cả cột review.

Giới hạn file giữ nguyên: Cloudflare KV upload 20 MiB; đọc MCP 5 MiB/lượt; artifact MCP 1 MiB/tệp. Bộ kỹ năng được viết riêng cho Xưởng; không nhập mã hay bộ công cụ provider của OpenMontage, không bật tracing hoặc thêm dịch vụ mô hình.

## Phần chưa nằm trong đợt này

Chưa có tự tải/phân tích toàn bộ video YouTube, tìm kiếm tri thức nâng cao, checkpoint chi tiết theo từng cảnh, animatic MP4 tự render hoặc đo chất lượng nội dung bằng mô hình khác. Đợt này chuẩn hóa năm vai trò và điều kiện bàn giao; xem lộ trình đầy đủ tại [nghiên cứu OpenMontage](OPENMONTAGE_RESEARCH.vi.md).
