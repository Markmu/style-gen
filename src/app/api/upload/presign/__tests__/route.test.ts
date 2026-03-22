/**
 * Upload presign API route tests
 *
 * Source: src/app/api/upload/presign/route.ts
 */

import { NextRequest } from "next/server";
import { POST } from "../route";

// ---------- mocks ----------
vi.mock("@/lib/r2", () => ({
  generatePresignedUploadUrl: vi.fn().mockResolvedValue("https://presigned.example.com/upload"),
  getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}));

vi.mock("@/lib/ulid", () => ({
  generateId: vi.fn(() => "01TESTULID0000000000000000"),
}));

import { generatePresignedUploadUrl, getPublicUrl } from "@/lib/r2";
import { generateId } from "@/lib/ulid";

// ---------- helpers ----------
function makeRequest(body?: unknown): NextRequest {
  if (body === undefined) {
    // no body at all — will cause request.json() to throw
    return new NextRequest("http://localhost/api/upload/presign", {
      method: "POST",
    });
  }
  if (typeof body === "string") {
    // raw string body (non-JSON scenario)
    return new NextRequest("http://localhost/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }
  return new NextRequest("http://localhost/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------- suite ----------
describe("POST /api/upload/presign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generatePresignedUploadUrl).mockResolvedValue("https://presigned.example.com/upload");
    vi.mocked(getPublicUrl).mockImplementation((key: string) => `https://cdn.example.com/${key}`);
    vi.mocked(generateId).mockReturnValue("01TESTULID0000000000000000");
  });

  // ---- happy paths ----

  it("正常预签名请求 (P0)", async () => {
    const res = await POST(makeRequest({ fileName: "photo.jpg", mimeType: "image/jpeg" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      presignedUrl: "https://presigned.example.com/upload",
      fileUrl: expect.stringContaining("cdn.example.com"),
      assetId: "01TESTULID0000000000000000",
    });
  });

  it("支持 image/png (P0)", async () => {
    const res = await POST(makeRequest({ fileName: "img.png", mimeType: "image/png" }));

    expect(res.status).toBe(200);
    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringContaining("original.png"),
      "image/png",
    );
  });

  it("支持 image/webp (P0)", async () => {
    const res = await POST(makeRequest({ fileName: "img.webp", mimeType: "image/webp" }));

    expect(res.status).toBe(200);
    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringContaining("original.webp"),
      "image/webp",
    );
  });

  // ---- validation errors ----

  it("mimeType 不合法 image/gif (P0)", async () => {
    const res = await POST(makeRequest({ fileName: "anim.gif", mimeType: "image/gif" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_MIME_TYPE");
    expect(json.retryable).toBe(false);
  });

  it("缺少 fileName (P0)", async () => {
    const res = await POST(makeRequest({ mimeType: "image/jpeg" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(json.retryable).toBe(false);
  });

  it("缺少 mimeType (P0)", async () => {
    const res = await POST(makeRequest({ fileName: "photo.jpg" }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(json.retryable).toBe(false);
  });

  it("空请求体 (P0)", async () => {
    const res = await POST(makeRequest({}));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
  });

  it("非 JSON 请求体 (P1)", async () => {
    const res = await POST(makeRequest("this is not json{{{"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(json.retryable).toBe(false);
  });

  // ---- key format ----

  it("key 格式正确 references/${assetId}/original.${ext} (P0)", async () => {
    await POST(makeRequest({ fileName: "photo.jpg", mimeType: "image/jpeg" }));

    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      "references/01TESTULID0000000000000000/original.jpg",
      "image/jpeg",
    );
    expect(getPublicUrl).toHaveBeenCalledWith(
      "references/01TESTULID0000000000000000/original.jpg",
    );
  });

  // ---- edge cases ----

  it("文件名含特殊字符 (P1)", async () => {
    const res = await POST(
      makeRequest({ fileName: "my photo (1)!@#.jpg", mimeType: "image/jpeg" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // Extension should be sanitised to only alphanumeric
    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^references\/.*\/original\.jpg$/),
      "image/jpeg",
    );
    expect(json.assetId).toBeDefined();
  });

  it("文件名无扩展名 (P1)", async () => {
    const res = await POST(
      makeRequest({ fileName: "noextension", mimeType: "image/png" }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // "noextension".split(".").pop() => "noextension" which is alphanumeric, used as ext
    expect(generatePresignedUploadUrl).toHaveBeenCalledWith(
      expect.stringMatching(/^references\/.*\/original\.noextension$/),
      "image/png",
    );
    expect(json.assetId).toBeDefined();
  });

  // ---- R2 failure ----

  it("R2 签名失败 返回 500 PRESIGN_FAILED retryable true (P0)", async () => {
    vi.mocked(generatePresignedUploadUrl).mockRejectedValueOnce(
      new Error("R2 unavailable"),
    );

    const res = await POST(makeRequest({ fileName: "img.png", mimeType: "image/png" }));
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("PRESIGN_FAILED");
    expect(json.retryable).toBe(true);
  });

  it("响应包含 retryable 字段 (P1)", async () => {
    // Success response does not include retryable (only error responses do)
    const successRes = await POST(
      makeRequest({ fileName: "ok.jpg", mimeType: "image/jpeg" }),
    );
    const successJson = await successRes.json();
    expect(successJson.retryable).toBeUndefined();

    // 400 error includes retryable: false
    const badRes = await POST(makeRequest({ mimeType: "image/gif", fileName: "x.gif" }));
    const badJson = await badRes.json();
    expect(badJson.retryable).toBe(false);

    // 500 error includes retryable: true
    vi.mocked(generatePresignedUploadUrl).mockRejectedValueOnce(new Error("fail"));
    const errRes = await POST(makeRequest({ fileName: "x.png", mimeType: "image/png" }));
    const errJson = await errRes.json();
    expect(errJson.retryable).toBe(true);
  });
});
