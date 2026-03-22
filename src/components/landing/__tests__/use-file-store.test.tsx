// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { FileStoreProvider, useFileStore } from "../use-file-store";
import type { ReactNode } from "react";

function wrapper({ children }: { children: ReactNode }) {
  return <FileStoreProvider>{children}</FileStoreProvider>;
}

describe("useFileStore", () => {
  it("初始状态 file 为 null", () => {
    const { result } = renderHook(() => useFileStore(), { wrapper });
    expect(result.current.file).toBeNull();
  });

  it("setFile 存储文件", () => {
    const { result } = renderHook(() => useFileStore(), { wrapper });
    const file = new File(["content"], "test.png", { type: "image/png" });

    act(() => {
      result.current.setFile(file);
    });

    expect(result.current.file).toBe(file);
  });

  it("consumeFile 一次性读取", () => {
    const { result } = renderHook(() => useFileStore(), { wrapper });
    const file = new File(["content"], "test.png", { type: "image/png" });

    act(() => {
      result.current.setFile(file);
    });

    let consumed: File | null = null;
    act(() => {
      consumed = result.current.consumeFile();
    });

    expect(consumed).toBe(file);
    expect(result.current.file).toBeNull();
  });

  it("consumeFile 幂等 (second call returns null)", () => {
    const { result } = renderHook(() => useFileStore(), { wrapper });
    const file = new File(["content"], "test.png", { type: "image/png" });

    act(() => {
      result.current.setFile(file);
    });

    act(() => {
      result.current.consumeFile();
    });

    let second: File | null = null;
    act(() => {
      second = result.current.consumeFile();
    });

    expect(second).toBeNull();
  });

  it("未包裹 Provider 时抛异常", () => {
    // Suppress console.error for expected error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useFileStore());
    }).toThrow("useFileStore must be used within FileStoreProvider");

    spy.mockRestore();
  });
});
