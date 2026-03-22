import { generateId } from "@/lib/ulid";

// Keep a reference to the real ulid for non-mocked tests
const { ulid: realUlid } = await import("ulid");

describe("generateId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("返回 26 位大写字母数字字符串", () => {
    const id = generateId();

    expect(typeof id).toBe("string");
    expect(id).toHaveLength(26);
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
  });

  it("每次调用返回唯一值", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it("内部调用 ulid 包", async () => {
    vi.resetModules();
    const fixedValue = "01HQXYZ1234567890ABCDEFGH";
    vi.doMock("ulid", () => ({
      ulid: vi.fn(() => fixedValue),
    }));

    const { generateId: mockedGenerateId } = await import("@/lib/ulid");
    const result = mockedGenerateId();

    expect(result).toBe(fixedValue);
  });
});
