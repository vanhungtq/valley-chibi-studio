# Cài Valley Chibi Studio bằng tài khoản ChatGPT khác

**Nếu tiếp tục Xưởng Cloudflare hiện có khi đổi Codex, đọc [RESUME_CODEX.vi.md](RESUME_CODEX.vi.md) và dùng [prompt tiếp tục](CODEX_RESUME_PROMPT.vi.md). Chỉ kết nối lại MCP, giữ nguyên dự án và dữ liệu; không thực hiện các bước tạo Site bên dưới.** Phần còn lại dành cho một Xưởng Sites độc lập khi bạn chủ động muốn cài mới.

## 1. Mô hình vận hành

**Bạn → Xưởng giao việc → Codex thực hiện → MCP đồng bộ → bạn duyệt.**

- Mọi công việc suy nghĩ, phân tích tư liệu, viết kịch bản, thiết kế shot và tạo tài liệu diễn ra trong phiên Codex của bạn.
- Xưởng là giao diện, kho dữ liệu và hàng đợi đầu việc. Máy chủ không gọi dịch vụ mô hình bên ngoài.
- Không cần API key OpenAI hoặc API key mô hình khác. Không thực hiện bước tạo khóa API của plugin OpenAI Developers.
- Plugin OpenAI Developers có thể hỗ trợ tìm tài liệu và cài mã. Plugin **riêng của Xưởng**, được Sites tạo khi xuất bản, đảm nhiệm đồng bộ lúc vận hành.
- Bấm “Giao việc cho Codex” tạo một đầu việc chờ nhận. Bạn mở phiên Codex có plugin Xưởng rồi yêu cầu nhận việc. Trang web không tự khởi chạy một phiên Codex ẩn.
- Khả năng đọc media, sinh ảnh, dựng PDF và giới hạn tác vụ phụ thuộc công cụ/quyền sử dụng của phiên Codex hiện tại. Nếu thiếu công cụ, Codex phải báo rõ, không tự chuyển sang API ngoài.

## 2. Chuẩn bị ở tài khoản mới

1. Đăng nhập tài khoản ChatGPT sẽ vận hành dự án.
2. Kết nối GitHub với tài khoản có quyền đọc repo riêng tư `vanhungtq/valley-chibi-studio`. Cho phép ứng dụng GitHub của ChatGPT truy cập repo này.
3. Bật Sites để xây và xuất bản Xưởng. Có thể bật OpenAI Developers để hỗ trợ cài đặt; không cần tạo khóa API.
4. Mở một phiên Codex và gửi nội dung trong [INSTALL_PROMPT.vi.md](INSTALL_PROMPT.vi.md).

Repo: https://github.com/vanhungtq/valley-chibi-studio

Repo riêng tư chỉ mở được khi GitHub đang đăng nhập tài khoản được cấp quyền. Tài khoản ChatGPT khác không tự có quyền đọc repo chỉ vì cùng một người sử dụng.

## 3. Cài mã nguồn và tạo Site riêng

Codex cần thực hiện các bước sau theo skill Sites hiện có của tài khoản mới:

```sh
git clone https://github.com/vanhungtq/valley-chibi-studio.git
cd valley-chibi-studio
npm ci
npm test
npm run check
npm run build
```

Dùng Node 24 cho bộ kiểm tra SQLite. Không khởi động model server hay cài SDK gọi model bên ngoài.

Manifest trong bản GitHub:

```json
{
  "d1": "DB",
  "r2": "BUCKET",
  "capabilities": ["mcp"]
}
```

Manifest này cố ý không chứa `project_id`. Codex gọi công cụ tạo Site của tài khoản hiện tại **một lần**, lưu chính xác ID được trả về vào manifest, giữ Site riêng tư và tiếp tục quy trình đóng gói/xuất bản của Sites. Không dùng lại ID của bản demo thuộc tài khoản cũ.

Đầu ra build là Worker ESM `dist/server/index.js`. Archive triển khai cần có `.openai/hosting.json`, `dist/server/index.js` và toàn bộ `drizzle/`. Các migration hiện có:

- `0000_studio.sql`: dự án và khóa chạy mẫu.
- `0001_codex_tasks.sql`: hàng đợi, phiên nhận việc, kết quả và metadata file Codex.

Sites cung cấp D1 `DB`, R2 `BUCKET` và đăng nhập ChatGPT. Không tự tạo OAuth, không thêm khóa API mô hình vào biến môi trường. Các API người dùng từ chối request không có identity được nền tảng cung cấp.

Nếu skill Sites có helper chuẩn, dùng helper đó cho nguồn và đóng gói. Không copy các script tạm hoặc credential từ phiên xây bản demo.

## 4. Kết nối plugin của Xưởng

Khi chủ Site xuất bản với `capabilities: ["mcp"]`, Sites tạo một App/plugin riêng cho Site.

1. Nhờ Codex đọc Site với `include_mcp_connection: true` để lấy plugin thực tế.
2. Cài hoặc Connect plugin đó nếu chưa được kết nối tự động. Có thể tìm ở Plugins → Personal → Created by you, tùy giao diện tài khoản.
3. Nếu phiên hiện tại chưa thấy công cụ mới, mở phiên Codex mới sau khi cài.
4. Yêu cầu Codex thử `studio_get_project` và `studio_list_tasks` ở chế độ đọc. Tên công cụ trên giao diện có thể thêm tiền tố của plugin.

Không cần `codex mcp add`, không cần `codex mcp login` hoặc tạo thêm một MCP server cục bộ cho kết nối native của Sites.

Plugin và quyền truy cập Site gắn với tài khoản. Tài khoản mới nên có Site và plugin của chính nó. Bản demo cũ không tự chuyển chủ sở hữu.

## 5. Tạo tập phim thực tế

1. Trong Xưởng, vào Thiết lập dự án: tên, khán giả quốc tế, ngôn ngữ, thời lượng và project bible.
2. Tạo tập phim và viết ý tưởng thô. Tập mẫu có sẵn chỉ để học quy trình.
3. Tải ảnh bối cảnh, nhân vật, đạo cụ; chọn phạm vi dự án hoặc tập.
4. Thêm mô tả ảnh, thời điểm, hướng nắng, hiện trạng và điều chưa biết.
5. Lưu reference kèm URL nguồn, timecode, kỹ thuật quan sát và cách áp dụng. URL đơn thuần không có nghĩa Codex đã xem video.
6. Chọn “Giao việc cho Codex” ở bước định hướng. Nhân vật hiện “Chờ Codex nhận”.
7. Chọn “Sao chép yêu cầu”, dán vào phiên Codex có plugin Xưởng.

Codex sẽ đọc gói đầu việc, nhận phiên, báo tiến độ, đọc tư liệu và nộp kết quả. Sau khi nhận, nhân vật mới hiện “Codex đang làm”. File được đồng bộ hiển thị trong “Tài liệu của tập”. Trang mở sẽ kiểm tra cập nhật mỗi năm giây; đóng trang không làm mất kết quả đã lưu ở máy chủ.

## 6. Duyệt và sửa

Luồng chính:

1. Điều hành → brief và phạm vi → bạn duyệt.
2. Sáng tạo → concept, hook, palette, cảm xúc → bạn duyệt.
3. Biên kịch → phân cảnh và hành động chi tiết → bạn duyệt.
4. Quay phim → shot list, ánh sáng, âm thanh, continuity → bạn duyệt.
5. Designer → tài liệu và production book → bạn duyệt.

Sau mỗi bước, Codex dừng chờ bạn. Muốn đi tiếp, duyệt trong Xưởng rồi giao bước tiếp theo. Muốn sửa, chọn “Yêu cầu chỉnh sửa”, ghi cụ thể; bản cũ được lưu, bước cần sửa và các bước phụ thuộc được mở lại.

Thay đổi đầu vào trong lúc Codex đang làm khiến kết quả cũ bị từ chối, bảo vệ brief mới. Nếu phiên Codex dừng quá mười lăm phút không báo tiến độ, Xưởng hiện phiên cần tiếp tục; Codex có thể nhận lại sau khi lease hết hạn. Có thể hủy đầu việc trong Xưởng nếu muốn đổi hướng ngay.

## 7. Quy định file và sao lưu

- Tải thư viện: tối đa 30 MB/tệp; ảnh, PDF, TXT, MD, MP4, MOV.
- Đọc tệp qua plugin: tối đa 5 MB/lượt. Ảnh JPG/PNG/WebP trả về nội dung image; TXT/MD trả text; định dạng khác cần công cụ đọc của Codex.
- File Codex nộp qua MCP: tối đa 1 MB/tệp, UTF-8 hoặc base64. Nộp tuần tự. File lớn hơn giữ trong Codex và thông báo rõ; chưa có chunk upload.
- Production book: HTML chứa hình nhúng, có thể mở offline và in thành PDF. CSV mở bằng Excel/Sheets. JSON chứa nội dung và metadata, không chứa nhị phân của thư viện.
- GitHub chứa mã nguồn, prompt, schema, bài kiểm tra và hướng dẫn. Dữ liệu dự án thật và upload không tự được commit lên GitHub.
- Khi chuyển dữ liệu sang tài khoản khác, cần tải lại các tệp gốc và liên kết chúng dưới tài khoản mới; ID/quyền tệp của tài khoản cũ không dùng chéo được.

## 8. Kiểm tra sau cài

- Xưởng và plugin cùng đọc một tên dự án và cùng ID tập.
- Giao việc chỉ tạo trạng thái chờ nhận.
- Nhận qua plugin làm đúng nhân vật chuyển trạng thái.
- Tiến độ công khai và file xuất xuất hiện trên Xưởng.
- Nộp kết quả không tự duyệt hoặc tự mở bước sau.
- Chỉnh brief rồi thử nộp kết quả cũ: bị từ chối.
- Không có khóa API mô hình và không có request gọi dịch vụ mô hình trong worker.

Các bài kiểm tra chạy bằng `npm test` kiểm tra luồng API, MCP và DOM. Kiểm tra DOM không thay thế kiểm tra trực quan cảnh 3D và bản in bằng trình duyệt.

## 9. Câu lệnh vận hành hằng ngày

```text
Hãy dùng plugin Xưởng Chibi của tôi. Liệt kê các đầu việc, nhận đầu việc
tôi vừa giao và làm đúng vai trò cùng schema trong gói. Mọi tác vụ thực hiện
trong Codex; không gọi API mô hình bên ngoài. Đọc tư liệu thật, báo tiến độ,
đồng bộ file và nộp kết quả. Sau đó dừng để tôi duyệt trong Xưởng.
```

Nếu công cụ plugin chưa xuất hiện, cài/kết nối đúng plugin của Site rồi mở phiên mới. Không thay việc đồng bộ bằng các câu nói “đã cập nhật” khi chưa có kết quả thành công từ công cụ.
