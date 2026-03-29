// @vitest-environment jsdom
import { render, screen, fireEvent } from "@testing-library/react";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "test-user" } }, status: "authenticated" }),
  signIn: vi.fn(),
}));

const mockSetFile = vi.fn();
vi.mock("@/components/landing/use-file-store", () => ({
  useFileStore: () => ({
    file: null,
    setFile: mockSetFile,
    consumeFile: vi.fn(),
  }),
}));

import { UploadEntry } from "../upload-entry";

describe("UploadEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("渲染上传区域", () => {
    render(<UploadEntry />);
    expect(screen.getByText("点击或拖拽上传参考图")).toBeInTheDocument();
    expect(
      screen.getByText("支持 JPG / PNG / WebP，不超过 10MB"),
    ).toBeInTheDocument();
  });

  it("合法文件 -> 跳转工作区", () => {
    const { container } = render(<UploadEntry />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const validFile = new File(["pixel"], "photo.png", { type: "image/png" });

    fireEvent.change(input, { target: { files: [validFile] } });

    expect(mockSetFile).toHaveBeenCalledWith(validFile);
    expect(mockPush).toHaveBeenCalledWith("/workspace");
  });

  it("拒绝非图片文件", () => {
    const { container } = render(<UploadEntry />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const textFile = new File(["hello"], "doc.txt", { type: "text/plain" });

    fireEvent.change(input, { target: { files: [textFile] } });

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("仅支持 JPG、PNG、WebP 格式的图片");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetFile).not.toHaveBeenCalled();
  });

  it("拒绝超大文件", () => {
    const { container } = render(<UploadEntry />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const bigFile = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(bigFile, "size", { value: 11 * 1024 * 1024 });

    fireEvent.change(input, { target: { files: [bigFile] } });

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("文件大小不能超过 10MB");
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSetFile).not.toHaveBeenCalled();
  });

  it("清除前次错误", () => {
    const { container } = render(<UploadEntry />);
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    // First: trigger an error
    const badFile = new File(["x"], "doc.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [badFile] } });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Then: upload a valid file
    const goodFile = new File(["pixel"], "photo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [goodFile] } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockSetFile).toHaveBeenCalledWith(goodFile);
    expect(mockPush).toHaveBeenCalledWith("/workspace");
  });
});
