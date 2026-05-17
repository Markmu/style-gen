/**
 * R2 storage utilities tests
 *
 * Source: src/lib/r2.ts
 * Module-level singletons require vi.resetModules() + dynamic import() for isolation.
 */

// ---------- mocks (hoisted) ----------
const mockSend = vi.fn();

// Must use `function` (not arrow) so they can be called with `new`
const MockS3Client = vi.fn(function (this: { send: typeof mockSend }) {
  this.send = mockSend;
});
const MockPutObjectCommand = vi.fn(function (this: Record<string, unknown>, input: Record<string, unknown>) {
  Object.assign(this, input);
});
const mockGetSignedUrl = vi.fn();

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: MockS3Client,
  PutObjectCommand: MockPutObjectCommand,
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// ---------- helpers ----------
const BASE_ENV = {
  R2_ACCOUNT_ID: "test-account-id",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret-key",
  R2_BUCKET_NAME: "test-bucket",
  R2_PUBLIC_URL: "https://cdn.example.com",
};

/** Set env vars via vi.stubEnv, resetModules, then dynamically import r2.ts */
async function loadR2(envOverrides: Record<string, string | undefined> = {}) {
  // Apply environment
  const env = { ...BASE_ENV, ...envOverrides };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      vi.stubEnv(k, "");
      delete process.env[k]; // stubEnv sets "", so force-delete
    } else {
      vi.stubEnv(k, v);
    }
  }

  // Reset module registry so singletons are recreated
  vi.resetModules();

  // Re-register mocks after resetModules (they stay hoisted but registry clears)
  vi.doMock("@aws-sdk/client-s3", () => ({
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
  }));
  vi.doMock("@aws-sdk/s3-request-presigner", () => ({
    getSignedUrl: mockGetSignedUrl,
  }));

  return import("@/lib/r2") as Promise<typeof import("@/lib/r2")>;
}

// ---------- suite ----------
describe("r2 — R2 storage utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ---- generatePresignedUploadUrl ----

  it("generatePresignedUploadUrl 正常生成 (P0)", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://presigned.example.com/upload");
    const r2 = await loadR2();

    const url = await r2.generatePresignedUploadUrl("images/test.png", "image/png");

    expect(url).toBe("https://presigned.example.com/upload");
    expect(MockPutObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "images/test.png",
      ContentType: "image/png",
    });
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("generatePresignedUploadUrl 有效期 10 分钟 expiresIn: 600 (P0)", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("https://presigned.example.com/upload");
    const r2 = await loadR2();

    await r2.generatePresignedUploadUrl("key.png", "image/png");

    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(), // S3Client instance
      expect.anything(), // PutObjectCommand
      { expiresIn: 600 },
    );
  });

  // ---- getPublicUrl ----

  it("getPublicUrl 正常拼接 (P0)", async () => {
    const r2 = await loadR2();

    const url = r2.getPublicUrl("references/abc/original.png");

    expect(url).toBe("https://cdn.example.com/references/abc/original.png");
  });

  it("getPublicUrl 去除尾部斜杠 (P0)", async () => {
    const r2 = await loadR2({ R2_PUBLIC_URL: "https://cdn.example.com/" });

    const url = r2.getPublicUrl("images/test.jpg");

    expect(url).toBe("https://cdn.example.com/images/test.jpg");
  });

  // ---- uploadBuffer ----

  it("uploadBuffer 正常上传 (P0)", async () => {
    mockSend.mockResolvedValueOnce({});
    const r2 = await loadR2();
    const buf = Buffer.from("hello");

    await r2.uploadBuffer("data/file.bin", buf, "application/octet-stream");

    expect(MockPutObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "data/file.bin",
      Body: buf,
      ContentType: "application/octet-stream",
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // ---- S3Client 配置 ----

  it("S3Client 配置正确 (P1)", async () => {
    mockGetSignedUrl.mockResolvedValueOnce("url");
    const r2 = await loadR2();

    // Trigger client creation
    await r2.generatePresignedUploadUrl("k", "image/png");

    expect(MockS3Client).toHaveBeenCalledWith({
      region: "auto",
      endpoint: "https://test-account-id.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      },
    });
  });

  // ---- 缺少环境Variable ----

  it("缺少 R2_ACCOUNT_ID 抛出异常 (P0)", async () => {
    const r2 = await loadR2({ R2_ACCOUNT_ID: undefined });

    await expect(
      r2.generatePresignedUploadUrl("key", "image/png"),
    ).rejects.toThrow("Missing required environment variable: R2_ACCOUNT_ID");
  });

  it("缺少 R2_BUCKET_NAME 抛出异常 (P1)", async () => {
    const r2 = await loadR2({ R2_BUCKET_NAME: undefined });

    await expect(
      r2.generatePresignedUploadUrl("key", "image/png"),
    ).rejects.toThrow("Missing required environment variable: R2_BUCKET_NAME");
  });

  it("缺少 R2_PUBLIC_URL 抛出异常 (P1)", async () => {
    const r2 = await loadR2({ R2_PUBLIC_URL: undefined });

    expect(() => r2.getPublicUrl("key")).toThrow(
      "Missing required environment variable: R2_PUBLIC_URL",
    );
  });
});
