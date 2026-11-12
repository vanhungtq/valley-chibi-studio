# Valley Chibi Studio · Cloudflare + Codex

Xưởng tiền kỳ YouTube đời sống nông thôn hướng tới khán giả quốc tế: 5 vai trò, giao diện chibi 3D, thư viện theo dự án/tập, kịch bản, storyboard và hồ sơ quay.

**Mọi công việc sáng tạo thực hiện trong Codex.** Xưởng lưu dữ liệu, giao việc, nhận tiến độ và kết quả qua MCP. Không gọi API mô hình bên ngoài và không cần API key mô hình.

## Đổi tài khoản Codex và tiếp tục cùng dự án

Một Xưởng Cloudflare dùng được với nhiều tài khoản Codex/ChatGPT. Trong Xưởng chọn **Kết nối Codex**, sao chép URL/yêu cầu tiếp tục, rồi kết nối MCP và cấp quyền bằng cùng GitHub chủ Xưởng trong tài khoản mới. Với việc đang chạy, bấm **Bàn giao sang Codex khác** để phiên mới nhận ngay với token mới; tiến độ và file đã đồng bộ được giữ lại. Chat/file chưa đồng bộ không tự chuyển tài khoản.

**[Hướng dẫn chuyển Codex](docs/RESUME_CODEX.vi.md)** · [Prompt tiếp tục ở tài khoản mới](docs/CODEX_RESUME_PROMPT.vi.md). Không cần tạo lại Worker, D1/KV hoặc GitHub OAuth App. Chỉ kết nối GitHub trong Codex mới khi cần đọc/sửa mã repo. Khả năng thêm MCP tùy tài khoản/workspace.

## Cài trên Cloudflare từ GitHub

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fvanhungtq%2Fvalley-chibi-studio%2Ftree%2Fmain)

Chọn **Workers & Pages → Create application → Continue with GitHub**. Dùng nhánh `main`.

| Mục | Giá trị |
|---|---|
| Root directory | `/` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Node.js | 24 |
| Worker entry | `worker/cloudflare.js` |
| Lưu trữ | D1 `DB`, KV `FILES_KV` và KV `OAUTH_KV` |
| MCP | Remote MCP, **Streamable HTTP**, `https://<domain>/mcp` |
| Xác thực | **OAuth 2.1 + PKCE**, đăng nhập GitHub, allowlist |

**[Hướng dẫn Cloudflare chi tiết bằng tiếng Việt](docs/CLOUDFLARE.vi.md)** · [Prompt cài đặt](docs/CLOUDFLARE_INSTALL_PROMPT.vi.md)

Bản này chạy độc lập với Sites. Tạo GitHub OAuth App với callback `https://<domain>/auth/callback`; đặt `PUBLIC_ORIGIN`, allowlist GitHub và hai secret của OAuth App trong Worker. AI và tạo ảnh vẫn thực hiện trong ChatGPT/Codex qua MCP; không cần khóa API mô hình. Plugin Sites cũ không tự chuyển sang domain Cloudflare. Không dùng Pages static cho bản này.

Sau deploy, kiểm tra `/healthz`, đăng nhập website rồi thêm custom MCP vào ChatGPT/Codex bằng URL `/mcp`. Mục Zero Trust **MCP servers / Server portals** là lớp quản lý/gom server tùy chọn; một Xưởng riêng có thể kết nối thẳng MCP.

## Lưu tệp bằng Workers KV Free

Bản Cloudflare mặc định dùng `FILES_KV`, không khai báo R2 và không yêu cầu tạo bucket. D1 giữ dự án/đầu việc, `OAUTH_KV` giữ phiên đăng nhập, `FILES_KV` giữ nội dung nhị phân của ảnh/tài liệu/video nhỏ. File dùng UUID mới, giới hạn 20 MiB/tệp. Giao diện lấy đúng hạn mức từ máy chủ; đọc video hỗ trợ byte ranges.

Theo [Cloudflare KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), gói Free có 1 GB dữ liệu, 100.000 lượt đọc và 1.000 lượt ghi/ngày. Hạn mức dùng chung tài khoản, gồm cả OAuth và kho tệp; hết quota thì thao tác bị từ chối. KV không dành cho lưu toàn bộ footage video. Video lớn dùng URL tham chiếu và ảnh từng shot.

KV có độ trễ đồng bộ [60 giây hoặc hơn giữa các khu vực](https://developers.cloudflare.com/kv/concepts/how-kv-works/). Ảnh trong giao diện có thử tải lại có giới hạn; Codex cần thử đọc lại nếu tệp mới chưa đồng bộ. Không chuyển project state/claim/duyệt vào KV. Tệp R2 cũ không tự chuyển sang KV và không bị xóa bởi thay đổi này.

## Cài bằng Sites trong tài khoản ChatGPT khác (tùy chọn)

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
  → Duyệt thủ công hoặc tự động theo lựa chọn trong Xưởng (approved)
  → Giao bước tiếp theo
```

Bấm giao việc không tự khởi chạy một phiên Codex ẩn. Trong phiên Codex có plugin Xưởng, yêu cầu nhận đầu việc vừa giao hoặc dán yêu cầu được sao chép từ giao diện. Codex dùng năng lực và công cụ của chính phiên đó. Mặc định sau khi nộp, Codex dừng chờ bạn duyệt. Khi bạn bật **Tự động duyệt & chuyển bước**, máy chủ duyệt kết quả hợp lệ, giao `nextTask` và Codex tiếp tục các vai trò trong phiên đang mở. MCP không có công cụ tự bật chế độ hoặc bỏ qua lựa chọn của bạn.

Năm vai trò: Điều hành → Sáng tạo → Biên kịch → Quay phim → Designer. Đây là các trách nhiệm chuyên môn; có thể thực hiện tuần tự trong một phiên Codex. Không có tuyên bố năm phiên nền luôn chạy đồng thời.

## Những phần đã có

- Xưởng 3D thủ tục bằng Three.js, trạng thái lấy từ đầu việc thật.
- Thư viện bối cảnh, nhân vật, đạo cụ, tài liệu, reference; phạm vi toàn dự án hoặc từng tập.
- Project bible, URL nguồn, timecode, mô tả, tags, ghi chú và phiên bản.
- Đầu việc lưu snapshot + hash; từ chối kết quả khi đầu vào đã đổi.
- Claim theo lease 15 phút, gia hạn bằng báo tiến độ, hiển thị khi phiên cần tiếp tục.
- Kết quả có schema, ID nguồn hợp lệ, lưu file Codex và áp dụng chế độ duyệt theo tập.
- Hồ sơ HTML có hình nhúng, in PDF qua trình duyệt, shot list CSV và JSON sao lưu.
- Tập mẫu có 6 cảnh, 24 shot, 480 giây mục tiêu dựng. Nội dung mẫu được gắn nhãn riêng.
- Đăng nhập Sites, D1 cho bản ghi, KV theo tài khoản ở bản Cloudflare Free (R2 ở bản Sites); JSON sao lưu không chứa file nhị phân.

## Thời lượng tập phim và tự động duyệt

Trong **Brief tập phim**, nhập **Thời lượng video mục tiêu · phút**, ví dụ `30`. Mỗi tập lưu riêng `targetMinutes` (số nguyên 1–240); tập mới mặc định 30 phút, tập mẫu và dữ liệu cũ giữ mục tiêu 8 phút. Giao diện và production book hiển thị riêng mục tiêu và tổng thời lượng shot đã phân bổ. Sửa thời lượng khi đã có kết quả lưu bản cũ vào lịch sử và mở lại quy trình từ định hướng.

Công tắc **Tự động duyệt & chuyển bước** nằm ngay dưới thanh thông tin tập. Mặc định tắt. Khi bật, Xưởng duyệt cả kết quả đang chờ, lưu dấu vết tự động, tạo đầu việc kế tiếp và trả hướng dẫn để Codex làm tiếp cho đến đủ năm vai trò. Biên kịch/quay phim phải phân bổ tổng `shot.seconds` trong ±5% thời lượng mục tiêu. Tắt công tắc được cả khi Codex đang làm: claim/file giữ nguyên, kết quả nộp sau đó sẽ chờ bạn duyệt. Các mốc đã duyệt trước khi tắt vẫn giữ trong lịch sử.

Tự động chuyển bước cần một phiên Codex/ChatGPT đang làm việc và kết nối MCP. Website không chạy một phiên Codex ẩn khi bạn đóng chat. Nếu bàn giao gặp lỗi sau khi đã lưu kết quả, Codex có thể nộp lại đúng kết quả để tạo bước tiếp mà không duyệt trùng.

## Storyboard ChatGPT & thư viện tri thức có hình

- Storyboard → **Tạo ảnh bằng ChatGPT**: chia shot list thành nhóm 4, sao chép prompt cho một ảnh 2×2 không viền. Designer nhận cùng hướng dẫn qua MCP. Không gọi API mô hình bên ngoài.
- **Nhập ảnh 4 shot**: chọn nhóm hoặc gán riêng từng ô, tải ảnh lên, cắt bằng Canvas của trình duyệt và lưu từng JPEG vào kho tệp (KV trên Cloudflare, R2 ở Sites). Ảnh AI có nhãn riêng, được đưa vào production book và tải theo từng shot.
- Designer có thể dùng `studio_save_artifact` với trường tùy chọn `storyboard_shot_ids` (1–4 ID theo thứ tự trên trái, trên phải, dưới trái, dưới phải). Tối đa 1 MB/ảnh. Sau `studio_submit_result`, Xưởng liên kết các ô vào shot và áp dụng chế độ duyệt của tập. Bản gốc được lưu một lần; giao diện/HTML cắt theo ô, tải từng ảnh sẽ cắt JPEG thực tế.
- Tri thức → **Thêm kiến thức**: ảnh minh họa kỹ thuật có thể tải trực tiếp, không cần URL. Video mẫu có file MP4/MOV hoặc URL nguồn, kênh/tác giả, ảnh minh họa và tối đa 200 shot theo thứ tự.
- Mỗi shot reference có timecode, ảnh góc quay, cỡ cảnh, tiêu cự nếu biết, chuyển động và chú thích. Có thể lấy khung hình từ video đã lưu tại vị trí đang dừng, thêm/xóa/đổi thứ tự shot và tìm theo nội dung phân tích.
- Gói Codex giữ toàn bộ ảnh/video liên kết với reference được chọn, kể cả ngoài 16 tài nguyên gợi ý ban đầu. Ghi rõ số nguồn đã chọn. Agent đọc ảnh thật và dẫn nguồn, học nguyên tắc để vận dụng vào câu chuyện riêng.
- Giới hạn hiện tại: 20 MiB/tệp tải từ giao diện Cloudflare Free (30 MiB ở Sites), 5 MB/lượt đọc MCP, 1 MB/file Codex nộp. Video lớn hơn dùng URL và ảnh shot; URL chưa được tự động tải, xem hoặc chép lời. Ghép 4 shot giảm số lần tạo ảnh nhưng không bảo đảm tỷ lệ tiết kiệm token.

## Giao diện sáng/tối và xưởng 3D

- Nút mặt trăng/mặt trời ở thanh trên cùng đổi nhanh Sáng/Tối. Thiết lập dự án → Giao diện & không gian có Sáng, Tối và Theo hệ thống. Lựa chọn lưu trên trình duyệt, áp dụng trước khi vẽ trang để tránh chớp nền sáng.
- Xưởng Three.js có bốn nhân viên phụ không gắn nhãn: đi trong lối đi, dừng làm việc, mang tài liệu/khay trà. Năm cộng sự chính giữ nhãn và trạng thái theo đầu việc thật; chuyển động trang trí không đại diện cho tác vụ Codex đang chạy.
- Kéo chuột xoay 360° và đổi góc cao/thấp, cuộn zoom, chụm hai ngón để zoom trên cảm ứng. Khi canvas có focus, phím mũi tên xoay, cộng/trừ zoom, 0/Home đặt lại góc nhìn. Có nút tự xoay, tạm dừng chuyển động và toàn màn hình nếu trình duyệt cho phép.
- Camera giữ góc nhìn khi giao diện cập nhật; tường tự mờ khi quay ra phía sau. Ánh sáng xưởng đổi theo theme, đèn trần và màn hình sáng hơn vào chế độ tối. Cây, đèn treo, quạt, mèo và bụi sáng có chuyển động nhẹ.
- Three.js r169 được đóng gói tại Site. GSAP 3.13.0 tải từ jsDelivr với bản dự phòng cùng phiên bản trong `public/vendor/`; CSP chỉ mở thêm nguồn script CDN này. Không có model API hoặc nội dung dự án gửi đến CDN.
- Mặc định tôn trọng `prefers-reduced-motion`; có nút bật/tắt chuyển động. Dừng hoạt ảnh khi tab ẩn hoặc xưởng ngoài vùng nhìn; giải phóng timeline và tài nguyên GPU khi rời xưởng.
- Kiểm thử DOM và toán học camera/lộ trình không thay thế kiểm tra WebGL, cảm ứng và toàn màn hình trên trình duyệt thật.

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

Tên công cụ trên phiên ChatGPT/Codex có thể được thêm tiền tố bởi plugin. Cloudflare dùng Remote MCP tại `/mcp`; bản Sites tùy chọn dùng plugin native của Sites. Không cần dựng model gateway.

## Mã nguồn và kiểm tra

```text
wrangler.jsonc         Cấu hình Cloudflare Workers + D1/KV/assets
worker/cloudflare.js   Entry độc lập và kiểm tra danh tính
worker/cloudflare/     GitHub login, session, consent OAuth
.github/workflows/     CI Node 24, tests và build
docs/CLOUDFLARE.vi.md  Hướng dẫn cài Cloudflare/GitHub/MCP
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

Dùng Node 24. `npm run build` mặc định chuẩn bị bản Cloudflare; bản Sites dùng `npm run build:sites`:

```sh
npm ci
npm test
npm run check
npm run build
```

Kiểm thử OAuth bằng Chromium thật: `npx playwright-core install chromium --only-shell`, rồi `npm run test:browser:oauth`. CI dùng Google Chrome có sẵn trên runner Ubuntu để kiểm tra Origin của form, redirect/CSP, PKCE và chặn CSRF. GitHub được giả lập trong Miniflare, browser chạy offline; không dùng tài khoản hoặc Secret thật. Nếu dùng Chromium đã có, đặt `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` bằng đường dẫn binary.

`linkedom`, Wrangler, Miniflare và Playwright Core là dev dependencies. Runtime OAuth dùng `@cloudflare/workers-oauth-provider`; không có dependency runtime gọi mô hình. `npm run build:sites` tạo `dist/server/index.js`, Worker ESM chứa assets và handler của bản Sites. Cloudflare dùng trực tiếp `worker/cloudflare.js` và Workers Static Assets. `.openai/hosting.json` dùng `d1: "DB"`, `r2: "BUCKET"`, `capabilities: ["mcp"]`.

Khi triển khai, dùng quy trình Sites hiện có, giữ manifest của đúng Site và đóng gói cả thư mục `drizzle/`. Migration đã áp dụng là bất biến; append migration khi đổi schema. GitHub giữ bản phân phối không chứa Site ID; checkout đang triển khai phải giữ Site ID của nó.

```sh
node scripts/export-handoff.mjs /duong-dan-moi/valley-chibi-studio
```

Lệnh này cần đích chưa tồn tại, ở ngoài checkout. Không chép Git metadata, secrets, runtime, dữ liệu người dùng hoặc Site ID sang bản bàn giao.

## Giới hạn thực tế

- Xưởng không tự chạy Codex khi không có phiên nhận việc. Đồng bộ giao diện bằng thăm dò mỗi 5 giây khi mở trang.
- Tải thư viện Cloudflare KV tối đa 20 MiB/tệp (Sites: 30 MiB); đọc qua MCP tối đa 5 MB/lượt; file Codex nộp qua MCP tối đa 1 MB/tệp, tuần tự. Chưa có chunk upload.
- Xem PDF/video, sinh ảnh và dựng PDF chất lượng cao phụ thuộc công cụ sẵn có trong Codex. Metadata/URL không chứng minh nội dung đã được đọc.
- Snapshot chọn tài nguyên bằng từ khóa, tối đa 16 file và 10 reference trong phạm vi liên quan. Chưa có OCR/transcript tự động, embeddings hoặc vector database phía máy chủ. Metadata thư viện vẫn nằm trong JSON dự án; bản tổ chức Cloudflare chưa thêm FTS/phân trang riêng.
- Các frame chưa gắn ảnh dùng sơ đồ SVG minh họa. Không trình bày như storyboard được sinh từ ảnh thật.
- Các bài kiểm tra API/MCP/DOM không thay thế kiểm tra trực quan WebGL và bản in; môi trường xây bản đầu chưa cung cấp công cụ browser QA.
- GitHub lưu mã nguồn và hướng dẫn. Dữ liệu và upload thật vẫn ở Site của chủ sở hữu; chuyển tài khoản cần tải lại và liên kết file dưới tài khoản mới.

## Nghiên cứu và hướng mở rộng

Đối chiếu mới: [Nâng cấp Agents từ OpenMontage](docs/OPENMONTAGE_RESEARCH.vi.md), ngày 12/11/2026. Báo cáo đề xuất skill theo vai trò, hợp đồng đầu ra, review trước tự động duyệt, phân tích reference có chứng cứ, continuity và checkpoint theo cảnh. Đây là lộ trình nghiên cứu; các nâng cấp được đề xuất chưa được triển khai trong ứng dụng.

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
