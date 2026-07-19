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
  it("初始态渲染 dropzone - 显示 'Click or drag to upload a reference image'", () => {
    render(<UploadZone {...defaultProps} />);

    expect(screen.getByText("Click or drag to upload a reference image")).toBeInTheDocument();
    expect(screen.getByText(/JPG, PNG, or WebP/)).toBeInTheDocument();
    expect(screen.getByTestId("reference-upload-dropzone")).toContainElement(
      screen.getByText("AI will read the reference as evidence."),
    );
    expect(
      screen.getByText("AI will read the reference as evidence.").parentElement,
    ).not.toHaveClass("border-t");
    expect(screen.getByTestId("reference-upload-dropzone")).toContainElement(
      screen.getByText("composition"),
    );
  });

  // 2. 上传中显示进度条 - P0
  it("上传中显示进度条 - 显示 'Uploading... 50%'", () => {
    render(
      <UploadZone
        {...defaultProps}
        isUploading={true}
        uploadProgress={50}
      />,
    );

    expect(screen.getByText("Uploading... 50%")).toBeInTheDocument();
  });

  // 3. 上传Done显示预览图 - P0
  it("上传Done显示预览图 - img alt 'Reference preview' 和 'Replace Reference' 按钮", () => {
    render(
      <UploadZone
        {...defaultProps}
        referenceImageUrl="https://cdn.example.com/img.png"
      />,
    );

    const img = screen.getByAltText("Reference preview");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://cdn.example.com/img.png");
    expect(screen.getByText("Replace Reference")).toBeInTheDocument();
  });

  // 4. 点击替换按钮 - P0
  it("点击替换按钮 - 显示Confirm对话框，Confirm后 onReplace called", async () => {
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
    await user.click(screen.getByText("Replace Reference"));
    expect(screen.getByText("Replace the current reference?")).toBeInTheDocument();

    // Confirm the replace
    await user.click(screen.getByText("Replace Reference"));
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
      "Only JPG, PNG, and WebP images are supported",
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
      "File size must be 10MB or less",
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
