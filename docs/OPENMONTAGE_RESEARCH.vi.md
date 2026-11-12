# Nâng cấp các Agents của Xưởng Chibi từ nghiên cứu OpenMontage

Ngày nghiên cứu: 12/11/2026, giờ Việt Nam.

**Trạng thái: đề xuất kiến trúc và quy trình. Tài liệu này chưa triển khai các tính năng được đề xuất.** Không cài hoặc chạy OpenMontage, không gọi API mô hình, không thay đổi dữ liệu sản xuất của Xưởng.

- Nguồn nghiên cứu: [OpenMontage](https://github.com/OpenMontageInc/OpenMontage), commit [`fecb9a1`](https://github.com/OpenMontageInc/OpenMontage/commit/fecb9a1e3cc23ef84de30b272059457a427f16f8).
- Đối chiếu Xưởng: commit [`4613c39`](https://github.com/vanhungtq/valley-chibi-studio/commit/4613c39a5b571627045ee3aba002285ef082042d).
- Phạm vi: đã đọc hướng dẫn kiến trúc, pipeline cinematic/documentary, reviewer, phân tích reference, checkpoint, schema, công cụ phân tích và Backlot. Các nhận xét dưới đây dựa trên mã và tài liệu, chưa phải kết quả kiểm thử vận hành OpenMontage.

## 1. Kết luận và thứ tự ưu tiên

OpenMontage phù hợp để học cách tổ chức kỹ năng và kiểm tra bàn giao. Trợ lý lập trình điều phối công việc dựa trên manifest, skill và dữ liệu có cấu trúc; Python cung cấp công cụ và lưu trạng thái. Cách tách trách nhiệm này tương thích với Xưởng: Codex làm nội dung, Cloudflare lưu và đồng bộ.

Giữ năm vai trò chính. Nâng cấp theo thứ tự:

1. Hợp đồng đầu ra riêng cho từng vai trò, skill chuyên môn và kiểm tra chất lượng trước khi tự động duyệt.
2. Phân tích reference có timecode/chứng cứ, bộ quy tắc hình ảnh của dự án và continuity nhân vật/bối cảnh.
3. Checkpoint theo cảnh, storyboard cập nhật trong lúc làm và nhật ký quyết định để tiếp tục ở Codex khác.
4. Animatic, hỗ trợ dựng và gói phát hành quốc tế khi đã có dữ liệu quay.

Các nâng cấp này có thể dùng Codex hiện tại để suy luận. Không cần bổ sung khóa API mô hình. Khối lượng suy luận và đọc tư liệu tăng vẫn sử dụng hạn mức của phiên Codex/ChatGPT.

## 2. Xưởng đã có gì và còn thiếu gì

| Thành phần | Hiện trạng đã thấy trong mã Xưởng | Khoảng trống cần nâng cấp |
|---|---|---|
| Điều phối | Năm bước, task queue, claim/lease, tiến độ, file, handoff và chống nộp từ đầu vào cũ trong `worker/bridge.js` | Chưa có workflow manifest mô tả rõ đầu vào, đầu ra, tiêu chí và đường sửa của từng bước |
| Kỹ năng | `public/data.js` có instruction ngắn theo vai trò; bridge bổ sung quy tắc chung | Cần skill chuyên sâu được chọn theo bước, loại cảnh và tư liệu; có phiên bản để biết một bản bàn giao dùng hướng dẫn nào |
| Đầu ra | `worker/api.js` dùng một output schema chung; Biên kịch/Quay phim có scene và shot | Định hướng, concept và hồ sơ thiết kế vẫn chủ yếu là văn bản; khó kiểm tra sự nhất quán tự động |
| Tự động duyệt | Có `autoApprove`, lịch sử duyệt và tự tạo `nextTask`; tắt được khi claim đang chạy | Server kiểm tra cấu trúc, nguồn, thời lượng và phiên dữ liệu; chưa có báo cáo kiểm tra chất lượng chuyên môn có cấu trúc bắt buộc trước khi duyệt |
| Thư viện | Có ảnh/video, reference theo shot, timecode và chụp khung hình thủ công | Chưa có quy trình phân tích reference và biến quan sát thành kiến thức có thể tìm lại, tái sử dụng |
| Chọn nguồn | `chooseResources` xếp hạng theo từ trong tên/brief, lấy tối đa 10 reference, 16 asset gợi ý và giữ thêm file liên kết trực tiếp | Cần chọn nguồn theo vai trò/cảnh, tìm nội dung trích và bổ sung nguồn bị bỏ sót khi thư viện lớn |
| Storyboard | Có atlas ChatGPT 2×2, ánh xạ panel với shot, xuất production book | Chưa có checkpoint công việc từng cảnh và bản xem tiến độ chi tiết trước khi nộp cả bước |
| Tiếp tục phiên khác | Đã có snapshot, progress, artifact và handoff | Cần phân biệt rõ cảnh nào đã hoàn tất, đang sửa, thiếu dữ kiện; tránh đọc lại toàn bộ hoặc làm lại phần đã xong |

## 3. Áp dụng gì từ OpenMontage

### 3.1. Ba lớp: công cụ, quy trình và kiến thức chuyên môn

OpenMontage tách registry công cụ, kỹ năng vận hành dự án và kiến thức nền của từng công nghệ. Chỉ nạp phần cần dùng cho tác vụ [S1].

Với Xưởng:

- **Năng lực thực tế:** phiên này có đọc ảnh, tạo ảnh, trình duyệt hoặc FFmpeg hay không; MCP nào đang kết nối. Chỉ xác nhận có năng lực sau khi kiểm tra công cụ thực tế.
- **Quy trình của vai trò:** bước cần làm, nguồn cần đọc, file cần bàn giao, tiêu chí kết thúc và cách sửa.
- **Kiến thức quay phim:** ngôn ngữ hình ảnh, dựng cảnh lao động, quay bếp, âm thanh hiện trường, continuity, thiết kế tài liệu và phụ đề EN.

Pha đầu có thể để `studio_get_task` trả thêm nội dung skill liên quan và phiên bản skill. Không cần cài toàn bộ registry Python hoặc đưa hàng trăm file vào mỗi prompt. Hướng dẫn đáng tin cậy nằm trong repo; tư liệu người dùng tải lên được dùng làm nguồn tham khảo, không có quyền thay đổi chế độ duyệt.

### 3.2. Hợp đồng đầu ra và quy tắc riêng cho từng bước

OpenMontage có manifest xác định artifact đầu vào/đầu ra, tiêu chí thành công, review và checkpoint [S2]. Xưởng nên có workflow riêng cho phim nông thôn quay thực tế, giữ nguyên năm bước hiện tại.

| Vai trò | Đầu ra nên được cấu trúc | Kiểm tra khi bàn giao |
|---|---|---|
| Giám đốc điều hành | Phạm vi tập, dữ kiện xác nhận, giả định, điều thiếu, nguồn lực, mục tiêu phút, tiêu chí hoàn thành | Phân biệt một ngày trong câu chuyện với số ngày lao động/quay thật; không cam kết điều chưa khảo sát |
| Giám đốc sáng tạo | 2–3 concept, phương án chọn, nhịp cảm xúc, motif, bảng màu, đạo cụ, điểm khác reference | Concept khác nhau thực chất, phù hợp hiện trạng và tài nguyên; có lý do chọn |
| Biên kịch | Beat map, phân cảnh, hành động, thay đổi trạng thái, âm thanh, thời lượng và nguồn | Hành động có trình tự, có tiến triển/thành quả, đủ thời lượng mà không kéo dài tùy tiện |
| Quay phim | Shot list, mục đích shot, bố cục, máy/ống kính, hướng sáng, continuity, coverage và âm thanh cần thu | Đủ toàn/trung/cận/insert theo hành động; thiết bị khả thi; không thiếu cảnh nối quan trọng |
| Designer | Danh mục storyboard, mapping shot/panel, phiên bản hình, trang hồ sơ, file bàn giao và cảnh báo | Không mất ID, không sai ảnh/cảnh, đủ trang/file; phân biệt ảnh hiện trường, reference và storyboard AI |

Các schema mới cần có phiên bản và đường tương thích với output cũ. Không chỉ thêm trường tùy ý: schema hiện tại của MCP có `additionalProperties: false`. Giữ ổn định ID scene/shot, revision và các kiểm tra quyền nguồn đang có.

### 3.3. Kiểm tra chất lượng và tự sửa trước khi tự động duyệt

Reviewer của OpenMontage yêu cầu chỉ rõ lỗi tại field/khung hình cụ thể và đề xuất cách sửa [S3]. Đây là phần cần ưu tiên cho Xưởng.

Luồng đề xuất:

`Vai trò thực hiện → kiểm tra dữ liệu → Codex rà soát theo rubric → tự sửa nếu cần → nộp kết quả → áp dụng chế độ duyệt của tập → bước tiếp`

- Server kiểm tra khách quan: schema, ID nguồn, thời lượng, scene/shot mapping, phiên đầu vào và trạng thái claim.
- Codex kiểm tra chuyên môn: mạch kể, tính khả thi, continuity, tác dụng từng shot và độ nhất quán của hình/tài liệu. Báo cáo phải dẫn scene/shot và chứng cứ, kèm hướng sửa cụ thể.
- Giới hạn vòng tự sửa, đề xuất hai vòng trong cấu hình workflow. Không tự cho qua lỗi nghiêm trọng chỉ vì hết số vòng.
- Khi thiếu dữ kiện thực tế không thể suy ra, lưu phần đã làm và nêu đúng câu hỏi cần bổ sung. Không bịa hiện trạng để tiếp tục.
- `autoApprove=true` vẫn cho công việc đạt yêu cầu đi tiếp mà không hỏi duyệt thường lệ. Khi chủ Xưởng tắt, kết quả tiếp theo chờ duyệt như hiện nay. Chỉ chủ Xưởng thay đổi chế độ.

Reviewer trong cùng phiên là một lần rà soát theo tiêu chí. Không mô tả nó như một đánh giá độc lập nếu chưa có phiên/cơ chế đánh giá riêng.

### 3.4. Reference thành kiến thức có chứng cứ

OpenMontage có quy trình riêng để phân tích video mẫu: cấu trúc, nhịp dựng, keyframe, ngôn ngữ quay và các concept khác biệt [S4]. Công cụ lấy dữ liệu kỹ thuật; agent xem khung hình để diễn giải [S5].

Với Xưởng, mỗi phân tích nên có:

- Nguồn, timecode, ảnh/đoạn tư liệu đã xem; ghi rõ phần nào chưa truy cập được.
- Chủ thể; chuyển động chủ thể; bối cảnh; bố cục; máy quay.
- Nhịp giữ cảnh, loại chuyển cảnh, cách dùng âm thanh thật, điểm mở đầu và kết thúc.
- Nguyên tắc có thể học và cách áp dụng vào bối cảnh/nhân vật riêng của dự án.
- Nhãn phân biệt quan sát trực tiếp, thông tin chủ dự án cung cấp và suy luận chưa xác nhận.

Ví dụ kiến thức có ích: “Ở đoạn 02:15–02:40, tiếng chổi bắt đầu trước khi cắt sang tay quét; có thể dùng cách nối âm thanh này để chuyển từ ngoại cảnh vào nhà.” Chỉ ghi nhận ví dụ như vậy sau khi thật sự kiểm tra đoạn nguồn.

URL YouTube riêng lẻ không bảo đảm có thể đọc video; cần khả năng truy cập, khung hình/đoạn clip hoặc nguồn người dùng cung cấp. Không hứa đã xem toàn bộ từ vài keyframe. Tìm kiếm thư viện có thể bắt đầu bằng tags, nội dung trích, scene và vai trò; chưa cần thêm dịch vụ embedding hoặc Vectorize.

### 3.5. Quy tắc thẩm mỹ và bộ dữ kiện continuity dùng chung

OpenMontage truyền `taste_profile`, playbook và các trường như `shot_intent`, `narrative_role` qua các bước [S6, S7]. Với Xưởng nên có bộ quy tắc riêng cho phim slow living quay thật:

- Ít thoại, đọc được câu chuyện bằng hành động; thiên nhiên và âm thanh lao động giữ vai trò chính.
- Quy tắc màu sắc, ánh sáng, trang phục và mức độ chuyển động máy; cho phép ngoại lệ có lý do.
- Hồ sơ nhân vật/bối cảnh/đạo cụ gắn ảnh thật: tên/ID ổn định, trang phục theo cảnh, cửa/hiên/bếp, vị trí đồ vật và tiến độ cải tạo.
- Mỗi shot có mục đích, điều người xem thấy/cảm nhận và trạng thái trước/sau hành động.

Đây là đề xuất thiết kế cho Xưởng, không phải khẳng định OpenMontage đã có bộ kiểm tra continuity cho hai chị em và căn nhà của dự án.

### 3.6. Storyboard cập nhật từ công việc thật

Backlot hiển thị trạng thái từ file/checkpoint, sự kiện và artifact; có lịch sử và replay [S8]. Xưởng đã có 3D và thăm dò tiến độ nên có thể bổ sung:

- Thẻ từng cảnh/shot: đang lên ý tưởng, đã viết, thiếu tư liệu, đã có hình, đang sửa, đã duyệt.
- Xem hình và ghi chú ngay khi được lưu, cùng phiên bản và nguồn tương ứng.
- Nhân vật Chibi phản ánh bước/task đã nhận; phân biệt đang làm, đang review, chờ dữ kiện và chờ chủ Xưởng.
- Xem lại lịch sử bàn giao và quyết định theo thời gian.

Trên Cloudflare, dùng trạng thái/sự kiện được lưu qua MCP và cơ chế đồng bộ của Xưởng. Backlot hiện là server local đọc filesystem; không thể ghép nguyên cơ chế watcher đó vào Worker. Chuyển động trang trí của Chibi không đại diện cho một tác vụ Codex đang chạy.

### 3.7. Checkpoint theo cảnh và nhật ký quyết định

OpenMontage hỗ trợ checkpoint ngay trong bước đang làm [S9] và nhật ký quyết định tích lũy [S10]. Đây là phần hữu ích khi làm tập 30 phút và đổi tài khoản Codex:

- Lưu scene/shot nào hoàn thành, file nào đã đồng bộ, việc nào tiếp theo và input revision tương ứng.
- Tiếp tục đúng phần dở thay vì chỉ có một đoạn progress chung cho cả vai trò.
- Lưu quyết định ngắn, công khai: chọn phương án nào, nguồn nào, lý do thực tế và phương án bị thay thế. Không lưu suy luận nội bộ.
- Khi thay quyết định, thêm bản mới với cùng đối tượng quyết định; giữ lịch sử cũ để Designer và Quay phim không dùng nhầm phương án đã bỏ.

Cần giữ toàn bộ cơ chế lease, CAS revision, handoff và nộp idempotent của Xưởng. Các artifact lớn và checkpoint chi tiết nên tách khỏi JSON state tổng, tránh nhân bản toàn bộ cảnh/shot trong nhiều snapshot.

## 4. Những phần cần điều chỉnh cho dự án này

1. **Phim nông thôn 30 phút:** không áp số từ/phút của narration vào phim ít thoại, không tăng tốc dựng theo mẫu quảng cáo/Shorts. Phân bổ thời gian theo hành động, công đoạn, không gian và kết quả.
2. **Âm thanh:** pipeline documentary của OpenMontage có quy tắc nhạc/end-tag cụ thể. Với Xưởng, âm thanh hiện trường có thể là lựa chọn chính; nhạc và end-tag phải theo ý đồ của tập.
3. **Đọc chuyển động:** `VideoAnalyzer` dùng ngưỡng optical flow để phân loại [S5]. Chuyển động thấp không chứng minh đó là ảnh tĩnh; nhãn `motion_clip` không chứng minh clip do AI tạo. Cảnh máy cố định, sương và thao tác chậm cần người/agent kiểm tra ngữ cảnh.
4. **Điểm chất lượng:** `slideshow_risk.py` dùng heuristic về lặp loại cảnh, cỡ cảnh và mục đích chuyển động [S11]. Có thể tham khảo tiêu chí, nhưng cần hiệu chỉnh cho phim quan sát chậm; không biến một điểm số chung thành bằng chứng phim hay/dở.
5. **Mốc duyệt:** upstream có nhiều điểm yêu cầu người dùng duyệt. Xưởng phải tiếp tục tôn trọng công tắc tự động/thủ công đã có. Không đưa thêm câu hỏi duyệt thường lệ vào chế độ tự động.
6. **Công cụ nặng:** OpenMontage dùng Python, FFmpeg, renderer và tùy chọn local ML/GPU. Các thao tác render/phân tích media cần chạy trong môi trường Codex hoặc máy phù hợp khi có công cụ; Worker Free giữ vai trò điều phối và lưu dữ liệu nhỏ.
7. **Tệp lớn:** Cloudflare hiện dùng KV, giới hạn upload 20 MiB; MCP đọc tối đa 5 MiB/lượt, artifact tối đa 1 MiB. Video tham khảo dài/footage gốc cần nguồn có thể truy cập, proxy hoặc keyframe phù hợp. Không coi file ở máy/phiên cũ là đã đồng bộ, không đưa video gốc hàng GB vào KV.
8. **License:** repo công bố AGPL-3.0 [S12]. Nếu nhập mã/skill, cần giữ thông tin bản quyền, kiểm tra license từng thành phần và nghĩa vụ của phần mềm phái sinh phục vụ qua mạng. Báo cáo này đề xuất nguyên tắc kiến trúc và yêu cầu riêng; không nhập mã OpenMontage vào Xưởng.

## 5. Có nên thêm Agents?

Giữ năm cộng sự chính trên giao diện. Có thể bổ sung hai trách nhiệm hỗ trợ sau khi chuẩn hóa đầu ra:

- **Nghiên cứu & quản lý tri thức:** phân tích reference đã truy cập, tạo ghi chú kỹ thuật có nguồn, tìm lại kiến thức theo cảnh/vai trò.
- **Giám sát continuity & sản xuất:** rà soát nhân vật, đạo cụ, tiến độ công việc, ánh sáng, tính khả thi và thứ tự quay. Gắn lỗi vào scene/shot cụ thể.

Các trách nhiệm này có thể do Codex thực hiện nối tiếp trong cùng phiên. Không cần tạo thêm nhiều phiên chạy nền. Review chất lượng trước mắt là nhiệm vụ có rubric của Điều hành; kế hoạch âm thanh thuộc phối hợp Biên kịch–Quay phim. Hỗ trợ biên tập/quốc tế hóa có thể thêm khi đã có footage và nhu cầu xuất bản.

## 6. Ví dụ áp dụng cho Tập 1, mục tiêu 30 phút

Một beat map sơ bộ để kiểm chứng với hiện trạng, chưa phải kịch bản quay đã chốt:

| Khoảng thời gian dựng | Phần câu chuyện | Điều cần thể hiện |
|---|---|---|
| 00:00–02:00 | Đến thung lũng | Không gian, hành lý và cảm giác bước vào đời sống mới |
| 02:00–05:00 | Mở căn nhà cũ | Hiện trạng, khám phá, quyết định bắt đầu từ đâu |
| 05:00–13:00 | Dọn dẹp | Chuỗi thao tác có tiến triển và thay đổi trước/sau |
| 13:00–20:00 | Làm mới nhà/mái hiên | Công đoạn khả thi theo khảo sát, dụng cụ, phối hợp và thành quả |
| 20:00–28:00 | Nấu ăn | Chuẩn bị nguyên liệu, nhóm bếp, nấu và bày bữa; âm thanh nối cảnh |
| 28:00–30:00 | Bữa cơm và khép ngày | Thành quả nhỏ, quan hệ hai chị em, căn nhà trở nên có người ở |

Điều hành kiểm tra công việc nào làm được; Sáng tạo chọn motif; Biên kịch chia hành động và thời lượng; Quay phim thiết kế coverage/âm thanh; Designer nối thành hồ sơ. Ví dụ continuity cần phát hiện: tường đã sơn ở cảnh trước nhưng còn bẩn/chưa sơn trong ảnh cảnh sau. Các phần cải tạo thật có thể cần nhiều ngày và nhân lực khác; không suy từ 30 phút dựng ra một ngày lao động.

## 7. Lộ trình triển khai đề xuất

| Đợt | Hạng mục | Kết quả kiểm chứng |
|---|---|---|
| 1 — ưu tiên | Skill theo vai trò, workflow manifest, schema có phiên bản, rubric review và vòng tự sửa | Tác vụ nhận đúng skill; phát hiện lỗi có vị trí/hướng sửa; tự động chỉ chuyển khi đạt tiêu chí; duyệt thủ công và dữ liệu cũ vẫn hoạt động |
| 2 | Hồ sơ reference có chứng cứ, quy tắc thẩm mỹ, continuity và tìm kiến thức theo vai trò/cảnh | Một reference được phân tích thành kiến thức có timecode; áp dụng vào câu chuyện riêng; lỗi continuity được gắn đúng shot |
| 3 | Checkpoint theo cảnh, lịch sử quyết định và storyboard sống | Đổi Codex tiếp tục đúng phần dở; giao diện không báo chạy trước claim; không làm lại file/hình đã hoàn tất |
| 4 — mở rộng | Animatic, shot-to-footage mapping, kế hoạch dựng/âm thanh, phụ đề EN và gói phát hành | Có dữ liệu quay thật thì xuất được kế hoạch dựng hoặc bản xem thử bằng công cụ trong môi trường Codex phù hợp |

Các điểm mã dự kiến: `worker/bridge.js` tạo gói task/tiếp nhận kết quả, `worker/api.js` và schema cho validate, `worker/mcp.js` cho hợp đồng công cụ, `public/workflow.js` cho chính sách duyệt, `public/references.js` cho thư viện, `public/storyboard.js` và `public/exports.js` cho hồ sơ. Cần thêm kho skill/manifest và dữ liệu checkpoint/review khi triển khai; tên/thư mục cụ thể chốt ở đợt 1.

Kiểm tra bắt buộc khi triển khai: tương thích dự án/task cũ; bật/tắt tự động trong claim đang chạy; source/revision đổi thì từ chối kết quả cũ; nộp lại không nhân đôi review/duyệt; handoff giữ checkpoint/file; không gọi API mô hình; nguồn chưa xem không được đánh dấu đã xác minh. Kiểm tra schema trên server không thay thế đánh giá nội dung và khảo sát thực tế.

## 8. Nguồn đã đối chiếu

Các liên kết OpenMontage được ghim đúng commit nghiên cứu:

- [S1 — Kiến trúc và ba lớp kiến thức](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/PROJECT_CONTEXT.md#L11-L55).
- [S2 — Cinematic pipeline manifest](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/pipeline_defs/cinematic.yaml).
- [S3 — Reviewer](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/skills/meta/reviewer.md).
- [S4 — Phân tích reference](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/skills/meta/video-reference-analyst.md).
- [S5 — VideoAnalyzer và phân loại chuyển động](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/tools/analysis/video_analyzer.py#L690-L783).
- [S6 — Taste direction](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/skills/meta/taste-direction.md).
- [S7 — Scene plan schema](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/schemas/artifacts/scene_plan.schema.json).
- [S8 — Backlot](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/backlot/README.md).
- [S9 — Checkpoint protocol](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/skills/meta/checkpoint-protocol.md).
- [S10 — Nhật ký quyết định](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/AGENT_GUIDE.md#L117-L123).
- [S11 — Slideshow risk scorer](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/lib/slideshow_risk.py).
- [S12 — License](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/LICENSE).
- [Manifest documentary montage](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/pipeline_defs/documentary-montage.yaml).
- [Registry năng lực công cụ](https://github.com/OpenMontageInc/OpenMontage/blob/fecb9a1e3cc23ef84de30b272059457a427f16f8/tools/tool_registry.py).
