# Nhập file từ Codex vào Thư viện Cloudflare

Khi chủ Xưởng yêu cầu đưa file đã tạo vào App, dùng `studio_prepare_library_upload`.
Không cần mở lại tập, nhận claim hoặc thay đổi các kết quả đã duyệt.

1. Đọc `studio_get_project` để kiểm tra đúng dự án và ID tập.
2. Tính SHA-256 byte gốc, tên/MIME/dung lượng. Workers KV Free hỗ trợ tối đa 20 MiB/tệp; tác vụ sáng tạo qua `studio_save_artifact` vẫn tối đa 1 MiB như trước.
3. Gọi `studio_prepare_library_upload` với `filename`, `mime`, `size`, `sha256`; có thể thêm `episode_id`, `category`, `description`, `tags`. Bỏ `episode_id` nếu dùng chung dự án.
4. Nếu `uploadRequired=false`, tài nguyên đã có, không tạo bản trùng. Nếu cần tải, phản hồi có `uploadUrl`, `uploadToken`, `expiresAt` (15 phút). Giữ token trong phiên/tệp xác thực tạm riêng; không đưa vào ghi chú công khai, Git hoặc hồ sơ sản xuất.
5. PUT byte gốc tới đúng URL, header `Authorization: Bearer <uploadToken>`, `Content-Type` khớp MIME. Quyền gắn với một file, owner, digest và dung lượng; không cho ghi đè file khác.
6. Sau khi thành công, GET cùng URL/token nếu cần kiểm tra lại byte. Token chỉ đọc lại file vừa nhập, không mở quyền đọc các file khác. Đọc lại `studio_get_project` để xác nhận file nằm trong `state.assets`.
7. Gửi người dùng `asset.url` trên domain App. Người dùng đăng nhập tài khoản chủ Xưởng và mở Thư viện để xem/tải file. File không được công khai hoặc đưa vào source GitHub.

Mỗi request kiểm tra lại allowlist GitHub. Quyền tải không dùng cookie trình duyệt và không chấp nhận các header danh tính tự gửi từ ngoài. Thiếu/sai/hết hạn token bị từ chối. MIME/byte/digest sai không thêm tài nguyên; cập nhật thư viện dùng CAS để giữ dữ liệu người dùng đang chỉnh ở phiên khác. Nhập file không duyệt, không chạy agent, không sửa storyboard hoặc nội dung đã được duyệt.

## Phiên ChatGPT/Codex còn giữ danh mục MCP cũ

`studio_get_project` trả `libraryUpload` để nhận biết phiên bản giao thức đang chạy.
Nếu chưa gọi được tool mới, dùng cầu nối có phiên bản qua tool ghi file hiện có:

```json
{
  "task_id": "library:ep-01",
  "claim_token": "",
  "filename": "crew-book.pdf",
  "mime": "application/json",
  "encoding": "utf8",
  "content": "{\"protocol\":\"valley-library-upload/1\",\"mime\":\"application/pdf\",\"size\":12345,\"sha256\":\"<sha256-byte-goc>\",\"category\":\"knowledge\",\"description\":\"Hồ sơ quay\",\"tags\":\"production\"}"
}
```

`library:ep-01` là namespace của thao tác nhập thư viện, **không phải ID đầu việc**.
Dùng `library:project` để lưu chung dự án. `claim_token` bắt buộc rỗng ở namespace này; không sao chép hoặc dùng claim cũ. MIME ngoài phong bì là JSON để tương thích schema cũ; MIME tệp gốc nằm bên trong. Chỉ gửi metadata, không nhét PDF/ZIP lớn vào `content`. Sau bước cấp quyền vẫn phải PUT file thật và kiểm tra kết quả, không báo đã đồng bộ chỉ vì nhận được URL.

Các UUID đầu việc bình thường vẫn đi qua toàn bộ kiểm tra claim, lease, đầu vào và giới hạn 1 MiB. Cầu nối này không thay đổi quy tắc bàn giao giữa các tài khoản Codex.

## Cấp quyền theo lô

Khi `studio_get_project.libraryBatch` công bố `valley-library-batch/1`, có thể dùng `studio_save_artifact` với `task_id="library-batch:project"`, claim rỗng, JSON/UTF-8. Content gồm `protocol` và `files` (1–100 metadata tệp, cùng các trường như nhập một file). Kết quả `uploads` có quyền riêng cho từng file; không công bố hoặc lưu token vào Git/tài liệu. Đây chỉ là gom một lượt cấp quyền. Mỗi file vẫn cần PUT byte thật, kiểm tra receipt; không báo hoàn thành sau bước metadata. Đối chiếu file có sẵn theo digest/tên/MIME/phạm vi/phân loại để tránh trùng. Token không được dùng cho file khác hoặc endpoint khác.

Đăng ký metadata file dùng phép thêm JSON nguyên tử trong D1, giữ revision và kiểm tra quyền/digest/phạm vi. Request không cần đọc và serialize toàn bộ dự án nhiều lần; điều này giảm CPU cho Workers Free khi thư viện lớn. Giới hạn 600 tài nguyên và 2 MiB metadata vẫn được kiểm tra trước khi ghi.
