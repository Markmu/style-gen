// @ts-nocheck
const mockQuery = vi.fn();
const mockConnect = vi.fn();

const MockPool = vi.fn(function () {
  this.query = mockQuery;
  this.connect = mockConnect;
});

vi.mock("pg", () => ({
  Pool: MockPool,
}));

describe("db", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    MockPool.mockClear();
    mockQuery.mockClear();
    mockConnect.mockClear();

    // Re-mock pg after resetModules so the new module import picks it up
    vi.doMock("pg", () => ({
      Pool: MockPool,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("query", () => {
    it("正常执行", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");
      const expectedResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockQuery.mockResolvedValueOnce(expectedResult);

      const { query } = await import("@/lib/db");
      const result = await query("SELECT * FROM users WHERE id = $1", [1]);

      expect(result).toBe(expectedResult);
      expect(mockQuery).toHaveBeenCalledWith("SELECT * FROM users WHERE id = $1", [1]);
    });
  });

  describe("getClient", () => {
    it("返回连接", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");
      const mockClient = { query: vi.fn(), release: vi.fn() };
      mockConnect.mockResolvedValueOnce(mockClient);

      const { getClient } = await import("@/lib/db");
      const client = await getClient();

      expect(client).toBe(mockClient);
      expect(mockConnect).toHaveBeenCalled();
    });
  });

  describe("缺少 DATABASE_URL", () => {
    it("抛出异常", async () => {
      // Ensure DATABASE_URL is not set
      vi.stubEnv("DATABASE_URL", "");
      delete process.env.DATABASE_URL;

      const { query } = await import("@/lib/db");

      await expect(query("SELECT 1")).rejects.toThrow(
        "Missing required environment variable: DATABASE_URL"
      );
    });
  });

  describe("连接池", () => {
    it("单例复用", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const { query } = await import("@/lib/db");
      await query("SELECT 1");
      await query("SELECT 2");

      // Pool should only be constructed once
      expect(MockPool).toHaveBeenCalledTimes(1);
    });

    it("配置正确", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const { query } = await import("@/lib/db");
      await query("SELECT 1");

      expect(MockPool).toHaveBeenCalledWith({
        connectionString: "postgres://localhost:5432/testdb",
        max: 10,
        idleTimeoutMillis: 30000,
      });
    });
  });
});
