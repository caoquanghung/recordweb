

Các nguyên tắc thiết kế
1. Fidelity-first: Ưu tiên giữ nội dung, bố cục, thứ tự và thời gian animation gốc từ PowerPoint.

2. Native browser execution: Không chuyển slide thành video hoặc ảnh tĩnh nếu còn có thể render được bằng browser.

3. Deterministic playback: Engine có thể tái hiện trạng thái slide ở một thời điểm hoặc animation step xác định.

4. Recording integration: Presentation Engine phải cung cấp frame cho video compositor, thay vì chỉ render đẹp lên màn hình.

5. Graceful degradation: Animation không hỗ trợ sẽ được thay thế bằng fallback có kiểm soát; không được làm hỏng cả slide.

6. Progressive loading: Parse trước metadata và slide đầu tiên, tải hoặc decode tài nguyên còn lại theo nhu cầu.


Cấu trúc source:
```
recordweb/
├── app/
│   └── studio/
│       └── page.tsx
│
├── components/
│   └── presentation/
│       ├── PresentationStage.tsx
│       ├── PresentationToolbar.tsx
│       ├── SlideThumbnails.tsx
│       └── ImportProgress.tsx
│
├── packages/
│   └── pptx-engine/
│       └── src/
│           ├── package/
│           │   ├── PptxPackageReader.ts
│           │   ├── RelationshipResolver.ts
│           │   └── AssetManager.ts
│           │
│           ├── parser/
│           │   ├── PresentationParser.ts
│           │   ├── SlideParser.ts
│           │   ├── ShapeParser.ts
│           │   ├── TextParser.ts
│           │   └── TimingParser.ts
│           │
│           ├── model/
│           │   ├── Presentation.ts
│           │   ├── Slide.ts
│           │   ├── SceneNode.ts
│           │   └── AnimationNode.ts
│           │
│           ├── animation/
│           │   ├── TimingCompiler.ts
│           │   ├── AnimationScheduler.ts
│           │   ├── EffectRegistry.ts
│           │   └── PlaybackController.ts
│           │
│           ├── renderer/
│           │   ├── CanvasRenderer.ts
│           │   ├── ShapeRenderer.ts
│           │   ├── TextRenderer.ts
│           │   └── EffectRenderer.ts
│           │
│           ├── recording/
│           │   └── PresentationFrameSource.ts
│           │
│           └── index.ts
│
└── workers/
    └── pptx-parser.worker.ts
```


Nên sử dụng một package TypeScript thuần cho core engine. React chỉ làm nhiệm vụ quản lý UI và kết nối engine với Studio.



Module 1: PPTX Package Reader
technique:
fflate hoặc JSZip: Giải nén package trong browser.
DOMParser hoặc parser XML có cấu trúc: Đọc nội dung.
Web Worker: Parse slide mà không chặn UI.
Blob và object URL: Quản lý ảnh và media trên client.

Parser phải xử lý relationship IDs và kế thừa theme/layout/master. Không nên giả định tên file hoặc vị trí file trong ZIP luôn tuân theo thứ tự slide.



Module 2: Intermediate Representation (IR)
