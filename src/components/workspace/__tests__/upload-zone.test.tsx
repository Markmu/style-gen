// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadZone } from "@/components/workspace/upload-zone";

describe("UploadZone", () => {
  const defaultProps = {
    referenceImageUrl: null,
    isUploading: false,
    uploadProgress: 0,
    onFileSelected: vi.fn(),
    onReplace: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. 初始态渲染 dropzone - P0
  it("初始态渲染 dropzone - 显示 '点击或拖拽上传参考图'", () => {
    render(<UploadZone {...defaultProps} />);

    expect(screen.getByText("点击或拖拽上传参考图")).toBeInTheDocument();
    expect(screen.getByText(/支持 JPG \/ PNG \/ WebP/)).toBeInTheDocument();
  });

  // 2. 上传中显示进度条 - P0
  it("上传中显示进度条 - 显示 '正在上传... 50%'", () => {
    render(
      <UploadZone
        {...defaultProps}
        isUploading={true}
        uploadProgress={50}
      />,
    );

    expect(screen.getByText("正在上传... 50%")).toBeInTheDocument();
  });

  // 3. 上传完成显示预览图 - P0
  it("上传完成显示预览图 - img alt '参考图预览' 和 '替换参考图' 按钮", () => {
    render(
      <UploadZone
        {...defaultProps}
        referenceImageUrl="https://cdn.example.com/img.png"
      />,
    );

    const img = screen.getByAltText("参考图预览");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://cdn.example.com/img.png");
    expect(screen.getByText("替换参考图")).toBeInTheDocument();
  });

  // 4. 点击替换按钮 - P0
  it("点击替换按钮 - 显示确认对话框，确认后 onReplace called", async () => {
    const onReplace = vi.fn();
    const user = (await import("@testing-library/user-event")).default.setup();
    render(
      <UploadZone
        {...defaultProps}
        referenceImageUrl="https://cdn.example.com/img.png"
        onReplace={onReplace}
      />,
    );

    // First click shows confirmation
    await user.click(screen.getByText("替换参考图"));
    expect(screen.getByText("替换当前参考图？")).toBeInTheDocument();

    // Confirm the replace
    await user.click(screen.getByText("确认替换"));
    expect(onReplace).toHaveBeenCalledOnce();
  });

  // 5. 文件校验 — 拒绝非法类型 - P0
  it("文件校验 — 拒绝非法类型", () => {
    const onFileSelected = vi.fn();
    render(
      <UploadZone {...defaultProps} onFileSelected={onFileSelected} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const badFile = new File(["data"], "doc.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [badFile] } });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "仅支持 JPG、PNG、WebP 格式的图片",
    );
  });

  // 6. 文件校验 — 拒绝超大文件 - P0
  it("文件校验 — 拒绝超大文件", () => {
    const onFileSelected = vi.fn();
    render(
      <UploadZone {...defaultProps} onFileSelected={onFileSelected} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Create a file larger than 10MB
    const bigContent = new ArrayBuffer(11 * 1024 * 1024);
    const bigFile = new File([bigContent], "huge.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "文件大小不能超过 10MB",
    );
  });

  // 7. 文件校验 — 接受合法文件 - P0
  it("文件校验 — 接受合法文件", () => {
    const onFileSelected = vi.fn();
    render(
      <UploadZone {...defaultProps} onFileSelected={onFileSelected} />,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const validFile = new File(["img data"], "photo.jpg", { type: "image/jpeg" });

    fireEvent.change(input, { target: { files: [validFile] } });

    expect(onFileSelected).toHaveBeenCalledWith(validFile);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
