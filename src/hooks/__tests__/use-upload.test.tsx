// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { useUpload } from "@/hooks/use-upload";

describe("useUpload", () => {
  const mockFile = new File(["hello"], "test.png", { type: "image/png" });
  const mockPresignResponse = {
    presignedUrl: "https://r2.example.com/presigned-put",
    fileUrl: "https://cdn.example.com/test.png",
    assetId: "asset-123",
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. 初始状态 - P0
  it("初始状态 - progress: 0, isUploading: false", () => {
    const { result } = renderHook(() => useUpload());

    expect(result.current.progress).toBe(0);
    expect(result.current.isUploading).toBe(false);
    expect(typeof result.current.upload).toBe("function");
  });

  // 2. 上传成功完整流程 - P0
  it("上传成功完整流程", async () => {
    globalThis.fetch = vi.fn()
      // First call: presign
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPresignResponse),
      })
      // Second call: PUT to R2
      .mockResolvedValueOnce({
        ok: true,
      });

    const { result } = renderHook(() => useUpload());

    let uploadResult: { assetId: string; fileUrl: string } | undefined;

    await act(async () => {
      uploadResult = await result.current.upload(mockFile);
    });

    expect(uploadResult).toEqual({
      assetId: "asset-123",
      fileUrl: "https://cdn.example.com/test.png",
    });
    expect(result.current.progress).toBe(100);
    expect(result.current.isUploading).toBe(false);

    // Verify presign call
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: "test.png", mimeType: "image/png" }),
    });

    // Verify R2 PUT call
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://r2.example.com/presigned-put",
      {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: mockFile,
      },
    );
  });

  // 3. presign API 失败 - P0
  it("presign API 失败", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Unauthorized" }),
    });

    const { result } = renderHook(() => useUpload());

    await expect(
      act(async () => {
        await result.current.upload(mockFile);
      }),
    ).rejects.toThrow("Unauthorized");

    expect(result.current.isUploading).toBe(false);
  });

  // 4. R2 Upload failed - P0
  it("R2 Upload failed", async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPresignResponse),
      })
      .mockResolvedValueOnce({
        ok: false,
      });

    const { result } = renderHook(() => useUpload());

    await expect(
      act(async () => {
        await result.current.upload(mockFile);
      }),
    ).rejects.toThrow("Failed to upload file to storage");

    expect(result.current.isUploading).toBe(false);
  });

  // 5. 网络异常 - P1
  it("网络异常", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useUpload());

    await expect(
      act(async () => {
        await result.current.upload(mockFile);
      }),
    ).rejects.toThrow("Network error");

    expect(result.current.isUploading).toBe(false);
  });
});
