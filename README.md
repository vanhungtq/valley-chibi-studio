# Valley Chibi Studio · Codex Edition

Xưởng tiền kỳ YouTube đời sống nông thôn hướng tới khán giả quốc tế: 5 vai trò, giao diện chibi 3D, thư viện theo dự án/tập, kịch bản, storyboard và hồ sơ quay.

**Mọi công việc sáng tạo thực hiện trong Codex.** Xưởng chỉ lưu dữ liệu, giao việc, nhận tiến độ và kết quả qua plugin MCP riêng của Site. Không gọi API mô hình bên ngoài và không cần API key mô hình.

## Cài sang tài khoản ChatGPT khác

- [Hướng dẫn đầy đủ](docs/INSTALL.vi.md)
- [Prompt cài đặt để dán vào Codex](docs/INSTALL_PROMPT.vi.md)
- [Quy trình 5 vai trò](docs/CODEX_WORKFLOW.vi.md)
- [Chỉ dẫn bắt buộc cho Codex](AGENTS.md)
- [JSON schema đầu ra](docs/contracts/production-output.schema.json)

Dùng Sites của tài khoản mới để tạo **Site riêng tư mới**, rồi cài plugin mà Sites tạo cho chính Site đó. Manifest bản GitHub cố ý không có `project_id`. Không chuyển Site ID, plugin ID hay credential của tài khoản cũ. OpenAI Developers có thể hỗ trợ cài đặt; không cần chạy quy trình tạo khóa API.

## Cách vận hành

```text
Bạn viết brief + tải tư liệu trong Xưởng
  → Giao việc cho Codex (queued)
  → Codex đọc gói và nhận việc (running)
  → Codex báo tiến độ, đọc file và tạo tài liệu
  → MCP đồng bộ file + kết quả (awaiting_review)
  → Bạn duyệt trong Xưởng (approved)
  → Giao bước tiếp theo
```

Bấm giao việc không tự khởi chạy một phiên Codex ẩn. Trong phiên Codex có plugin Xưởng, yêu cầu nhận đầu việc vừa giao hoặc dán yêu cầu được sao chép từ giao diện. Codex dùng năng lực và công cụ của chính phiên đó. Sau khi nộp, dừng chờ bạn duyệt; MCP không có công cụ tự phê duyệt.

Năm vai trò: Điều hành → Sáng tạo → Biên kịch → Quay phim → Designer. Đây là các trách nhiệm chuyên môn; có thể thực hiện tuần tự trong một phiên Codex. Không có tuyên bố năm phiên nền luôn chạy đồng thời.

## Những phần đã có

- Xưởng 3D thủ tục bằng Three.js, trạng thái lấy từ đầu việc thật.
- Thư viện bối cảnh, nhân vật, đạo cụ, tài liệu, reference; phạm vi toàn dự án hoặc từng tập.
- Project bible, URL nguồn, timecode, mô tả, tags, ghi chú và phiên bản.
- Đầu việc lưu snapshot + hash; từ chối kết quả khi đầu vào đã đổi.
- Claim theo lease 15 phút, gia hạn bằng báo tiến độ, hiển thị khi phiên cần tiếp tục.
- Kết quả có schema, ID nguồn hợp lệ, lưu file Codex và dừng chờ người duyệt.
- Hồ sơ HTML có hình nhúng, in PDF qua trình duyệt, shot list CSV và JSON sao lưu.
- Tập mẫu có 6 cảnh, 24 shot, 480 giây mục tiêu dựng. Nội dung mẫu được gắn nhãn riêng.
- Đăng nhập Sites, D1 cho bản ghi, R2 theo tài khoản; JSON sao lưu không chứa file nhị phân.

## Công cụ MCP

| Công cụ | Mục đích |
|---|---|
| `studio_get_project` | Đọc dự án và tiến độ |
| `studio_list_tasks` | Xem các đầu việc |
| `studio_get_task` | Lấy instruction, snapshot, nguồn và schema |
| `studio_claim_task` | Nhận việc, làm nhân vật chuyển sang đang làm |
| `studio_report_progress` | Báo tiến độ, gia hạn lease |
| `studio_read_resource` | Đọc tệp thật trong thư viện |
| `studio_save_artifact` | Đồng bộ file Codex tạo |
| `studio_submit_result` | Nộp kết quả để chủ dự án duyệt |
| `studio_fail_task` | Báo tác vụ bị chặn |

Tên công cụ trên phiên ChatGPT/Codex có thể được thêm tiền tố bởi plugin. Dùng kết nối native của Sites; không cần dựng MCP server cục bộ hay tự tạo model gateway.

## Mã nguồn và kiểm tra

```text
public/               Giao diện, scene chibi, mẫu, xuất tài liệu
worker/api.js         Identity, state revision, upload, chạy mẫu
worker/bridge.js      Queue, claim, tiến độ, file, nộp và duyệt
worker/mcp.js         Stateless JSON-RPC POST /mcp, 9 công cụ
scripts/build.mjs     Build Worker ESM và assets tự phục vụ
scripts/export-handoff.mjs  Xuất mã nguồn, bỏ Site identity
scripts/build-docs.mjs      Dựng hướng dẫn trong Xưởng từ Markdown
contracts/ trong docs/      JSON schema và ví dụ
prompts/ trong docs/        Instruction 5 vai trò
AGENTS.md             Chính sách cho Codex
```

Dùng Node 24:

```sh
npm ci
npm test
npm run check
npm run build
```

`linkedom` chỉ là dev dependency. Không có dependency runtime gọi mô hình. `dist/server/index.js` là Worker ESM chứa assets và handler. `.openai/hosting.json` dùng `d1: "DB"`, `r2: "BUCKET"`, `capabilities: ["mcp"]`.

Khi triển khai, dùng quy trình Sites hiện có, giữ manifest của đúng Site và đóng gói cả thư mục `drizzle/`. Migration đã áp dụng là bất biến; append migration khi đổi schema. GitHub giữ bản phân phối không chứa Site ID; checkout đang triển khai phải giữ Site ID của nó.

```sh
node scripts/export-handoff.mjs /duong-dan-moi/valley-chibi-studio
```

Lệnh này cần đích chưa tồn tại, ở ngoài checkout. Không chép Git metadata, secrets, runtime, dữ liệu người dùng hoặc Site ID sang bản bàn giao.

## Giới hạn thực tế

- Xưởng không tự chạy Codex khi không có phiên nhận việc. Đồng bộ giao diện bằng thăm dò mỗi 5 giây khi mở trang.
- Tải thư viện tối đa 30 MB/tệp; đọc qua MCP tối đa 5 MB/lượt; file Codex nộp qua MCP tối đa 1 MB/tệp, tuần tự. Chưa có chunk upload.
- Xem PDF/video, sinh ảnh và dựng PDF chất lượng cao phụ thuộc công cụ sẵn có trong Codex. Metadata/URL không chứng minh nội dung đã được đọc.
- Snapshot chọn tài nguyên bằng từ khóa, tối đa 16 file và 10 reference trong phạm vi liên quan. Chưa có OCR/transcript tự động, embeddings hoặc vector database phía máy chủ.
- Các frame chưa gắn ảnh dùng sơ đồ SVG minh họa. Không trình bày như storyboard được sinh từ ảnh thật.
- Các bài kiểm tra API/MCP/DOM không thay thế kiểm tra trực quan WebGL và bản in; môi trường xây bản đầu chưa cung cấp công cụ browser QA.
- GitHub lưu mã nguồn và hướng dẫn. Dữ liệu và upload thật vẫn ở Site của chủ sở hữu; chuyển tài khoản cần tải lại và liên kết file dưới tài khoản mới.

## Nghiên cứu và hướng mở rộng

Repo được cung cấp [awesome-ai-agents-2026](https://github.com/caramaschiHG/awesome-ai-agents-2026) là danh mục công cụ, không phải mã nguồn một xưởng phim. Tài liệu upstream của [LangGraph](https://github.com/langchain-ai/langgraph) và [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) được đối chiếu để đánh giá workflow, handoff và người duyệt. Bản này không tích hợp các SDK đó hoặc gọi API của chúng; Codex là nơi thực hiện nội dung, MCP là kênh đồng bộ.

Mở rộng nên ưu tiên khảo sát/trợ lý sản xuất, quản lý tri thức có nguồn, continuity và biên tập quốc tế. Những chức năng này trước mắt được kiểm tra trong trách nhiệm 5 vai trò. Thêm agent phụ khi khối lượng và khả năng của phiên Codex thực sự cần.

## Nguồn tài nguyên

Three.js r169 (MIT) và Inter (SIL OFL), giấy phép ở `public/vendor/`. Ảnh mood tải từ Unsplash, được dùng minh họa, không phải bối cảnh do người dùng cung cấp:

- https://images.unsplash.com/photo-1470770841072-f978cf4d019e
- https://images.unsplash.com/photo-1510798831971-661eb04b3739
- https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8
- https://images.unsplash.com/photo-1441974231531-c6227db76b6e
- https://images.unsplash.com/photo-1512621776951-a57141f2eefd

Tác phẩm cần khai thác bối cảnh, nhân vật và câu chuyện riêng, học nguyên tắc quay/kể từ reference thay vì sao chép tác phẩm của kênh khác.
