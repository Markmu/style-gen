/* eslint-disable @typescript-eslint/ban-ts-comment */
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

// Mock the schema import to avoid pulling in drizzle pg-core at test time
vi.mock("../schema", () => ({}));

// Mock drizzle to return a fake db instance
const mockDrizzle = vi.fn(() => ({ _isMockDb: true }));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: (...args: unknown[]) => mockDrizzle(...args),
}));

describe("db", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    MockPool.mockClear();
    mockQuery.mockClear();
    mockConnect.mockClear();
    mockDrizzle.mockClear();

    // Re-mock after resetModules
    vi.doMock("pg", () => ({
      Pool: MockPool,
    }));
    vi.doMock("../schema", () => ({}));
    vi.doMock("drizzle-orm/node-postgres", () => ({
      drizzle: (...args: unknown[]) => mockDrizzle(...args),
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("getDb", () => {
    it("返回 Drizzle 实例", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");

      const { getDb } = await import("@/lib/db");
      const db = getDb();

      expect(db).toEqual({ _isMockDb: true });
      expect(mockDrizzle).toHaveBeenCalledTimes(1);
    });

    it("单例复用", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");

      const { getDb } = await import("@/lib/db");
      getDb();
      getDb();

      expect(mockDrizzle).toHaveBeenCalledTimes(1);
      expect(MockPool).toHaveBeenCalledTimes(1);
    });
  });

  describe("db proxy", () => {
    it("代理访问等价于 getDb()", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");

      const { db } = await import("@/lib/db");

      // Accessing a property triggers lazy init
      expect(db._isMockDb).toBe(true);
      expect(mockDrizzle).toHaveBeenCalledTimes(1);
    });
  });

  describe("缺少 DATABASE_URL", () => {
    it("抛出异常", async () => {
      vi.stubEnv("DATABASE_URL", "");
      delete process.env.DATABASE_URL;

      const { getDb } = await import("@/lib/db");

      expect(() => getDb()).toThrow(
        "Missing required environment variable: DATABASE_URL"
      );
    });
  });

  describe("连接池", () => {
    it("配置正确", async () => {
      vi.stubEnv("DATABASE_URL", "postgres://localhost:5432/testdb");

      const { getDb } = await import("@/lib/db");
      getDb();

      expect(MockPool).toHaveBeenCalledWith({
        connectionString: "postgres://localhost:5432/testdb",
        max: 10,
        idleTimeoutMillis: 30000,
      });
    });
  });
});
