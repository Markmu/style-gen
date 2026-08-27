import { GET, PUT, DELETE } from "../route";
import { NextRequest } from "next/server";
import type { StyleMemoryDetail } from "@/types/models";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindById = vi.fn();
const mockFindStyleMemoryDetail = vi.fn();
const mockUpdateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockFindByName = vi.fn();
vi.mock("@/lib/repositories/template-repository", () => ({
  findById: (...args: unknown[]) => mockFindById(...args),
  findStyleMemoryDetail: (...args: unknown[]) =>
    mockFindStyleMemoryDetail(...args),
  updateTemplate: (...args: unknown[]) => mockUpdateTemplate(...args),
  deleteTemplate: (...args: unknown[]) => mockDeleteTemplate(...args),
  findByName: (...args: unknown[]) => mockFindByName(...args),
}));

const mockFindAssetById = vi.fn();
vi.mock("@/lib/repositories/asset-repository", () => ({
  findAssetById: (...args: unknown[]) => mockFindAssetById(...args),
}));

// plan-02: 写端点接入共享限流（templateWrite）
const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  RATE_LIMIT_CONFIGS: {
    upload: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
    analysis: { windowMs: 60 * 60 * 1000, maxRequests: 10 },
    generation: { windowMs: 60 * 60 * 1000, maxRequests: 20 },
    templateWrite: { windowMs: 60 * 60 * 1000, maxRequests: 30 },
  },
}));

function makeRequest(
  url: string,
  init?: { method?: string; body?: unknown },
): NextRequest {
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

const routeParams = (id = "template-1") => ({ params: Promise.resolve({ id }) });

const STYLE_MEMORY = {
  id: "template-1",
  name: "Saved Direction",
  description: "A glass-fox direction",
  content: "Create {{subject}}.",
  variables: [{ name: "subject", defaultValue: "glass fox" }],
  retainedRules: ["rule a", "rule b"],
  negativeConstraints: ["no text"],
  styleTokens: ["glass", "soft light"],
  enhancementHints: ["keep it minimal"],
  verificationStatus: "user_verified" as const,
  representativeGenerationTaskId: "gen-1",
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  sourceGenerationTaskId: "gen-source",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

const STYLE_MEMORY_DETAIL: StyleMemoryDetail = {
  ...STYLE_MEMORY,
  sourceGenerationTask: {
    id: "gen-source",
    createdAt: "2026-05-31T00:00:00.000Z",
  },
  representativeResult: {
    iterationId: "gen-1",
    imageUrl: "https://cdn.example.com/gen-1.webp",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
  usage: { lastUsedAt: "2026-06-02T00:00:00.000Z", derivedIterationCount: 3 },
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

describe("/api/templates/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockCheckRateLimit.mockReturnValue({
      allowed: true,
      remaining: 29,
      resetAt: Date.now() + 60 * 60 * 1000,
    });
  });

  // ─── plan-02: GET 详情 DTO（架构 §6.2/§7.3） ───────────────────────────

  describe("plan-02: GET 详情 DTO", () => {
    it("返回完整 StyleMemoryDetail（usage / representativeResult / 规则四元组）", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockFindStyleMemoryDetail.mockResolvedValue(STYLE_MEMORY_DETAIL);

      const response = await GET(
        makeRequest("http://localhost:3000/api/templates/template-1"),
        routeParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockFindStyleMemoryDetail).toHaveBeenCalledWith(
        "template-1",
        "user-1",
      );
      expect(data.verificationStatus).toBe("user_verified");
      expect(data.retainedRules).toEqual(["rule a", "rule b"]);
      expect(data.negativeConstraints).toEqual(["no text"]);
      expect(data.usage).toEqual({
        lastUsedAt: "2026-06-02T00:00:00.000Z",
        derivedIterationCount: 3,
      });
      expect(data.representativeResult).toEqual({
        iterationId: "gen-1",
        imageUrl: "https://cdn.example.com/gen-1.webp",
        createdAt: "2026-06-01T00:00:00.000Z",
      });
      expect(data.sourceGenerationTask).toEqual({
        id: "gen-source",
        createdAt: "2026-05-31T00:00:00.000Z",
      });
    });

    it("防御降级透传：脏数据行 DTO 的 verificationStatus 为 pending_verification", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockFindStyleMemoryDetail.mockResolvedValue({
        ...STYLE_MEMORY_DETAIL,
        // plan-01 读时防御降级：user_verified 但代表结果引用为空 → pending
        verificationStatus: "pending_verification",
      });

      const response = await GET(
        makeRequest("http://localhost:3000/api/templates/template-1"),
        routeParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.verificationStatus).toBe("pending_verification");
    });

    it("Memory 不存在或不属于本人 → 404 TEMPLATE_NOT_FOUND", async () => {
      mockFindById.mockResolvedValue(null);
      mockFindStyleMemoryDetail.mockResolvedValue(null);

      const response = await GET(
        makeRequest("http://localhost:3000/api/templates/template-1"),
        routeParams(),
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe("TEMPLATE_NOT_FOUND");
    });

    it("未登录 → 401 UNAUTHORIZED", async () => {
      mockAuth.mockResolvedValue(null);

      const response = await GET(
        makeRequest("http://localhost:3000/api/templates/template-1"),
        routeParams(),
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.code).toBe("UNAUTHORIZED");
      expect(mockFindStyleMemoryDetail).not.toHaveBeenCalled();
    });
  });

  // ─── plan-02: PUT 五字段编辑 + 回退 + 409 统一（架构 §6.4/§8.2） ───────

  describe("plan-02: PUT 编辑五字段", () => {
    it("接受 name/description/variables/retainedRules/negativeConstraints 并透传", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockFindByName.mockResolvedValue(null);
      mockUpdateTemplate.mockResolvedValue({
        ...STYLE_MEMORY,
        name: "Renamed",
        description: "New summary",
        retainedRules: ["rule a", "rule c"],
        negativeConstraints: ["no text", "no watermark"],
      });

      const response = await PUT(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "PUT",
          body: {
            name: "Renamed",
            description: "New summary",
            variables: [{ name: "subject", defaultValue: "ceramic fox" }],
            retainedRules: ["rule a", "rule c"],
            negativeConstraints: ["no text", "no watermark"],
          },
        }),
        routeParams(),
      );

      expect(response.status).toBe(200);
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        "template-1",
        "user-1",
        expect.objectContaining({
          name: "Renamed",
          description: "New summary",
          variables: [{ name: "subject", defaultValue: "ceramic fox" }],
          retainedRules: ["rule a", "rule c"],
          negativeConstraints: ["no text", "no watermark"],
        }),
      );
    });

    it("规则实质变更 → 响应回退为 pending_verification", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockUpdateTemplate.mockResolvedValue({
        ...STYLE_MEMORY,
        retainedRules: ["rule a", "rule c"],
        verificationStatus: "pending_verification",
      });

      const response = await PUT(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "PUT",
          body: { retainedRules: ["rule a", "rule c"] },
        }),
        routeParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        "template-1",
        "user-1",
        expect.objectContaining({ retainedRules: ["rule a", "rule c"] }),
      );
      expect(data.verificationStatus).toBe("pending_verification");
    });

    it("仅元数据（name/description/variables）→ 状态不变（user_verified）", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockFindByName.mockResolvedValue(null);
      mockUpdateTemplate.mockResolvedValue({
        ...STYLE_MEMORY,
        name: "Renamed",
        description: "New summary",
        verificationStatus: "user_verified",
      });

      const response = await PUT(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "PUT",
          body: {
            name: "Renamed",
            description: "New summary",
            variables: [{ name: "subject", defaultValue: "ceramic fox" }],
          },
        }),
        routeParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockUpdateTemplate).toHaveBeenCalledWith(
        "template-1",
        "user-1",
        expect.objectContaining({ description: "New summary" }),
      );
      expect(data.verificationStatus).toBe("user_verified");
    });

    it("名称冲突 → 409 code 统一为 TEMPLATE_NAME_CONFLICT", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockFindByName.mockResolvedValue({ ...STYLE_MEMORY, id: "template-2" });

      const response = await PUT(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "PUT",
          body: { name: "Taken Name" },
        }),
        routeParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.code).toBe("TEMPLATE_NAME_CONFLICT");
      expect(mockUpdateTemplate).not.toHaveBeenCalled();
    });

    it("请求体携带 verificationStatus → 400（ADR-1 信任边界）", async () => {
      mockFindById.mockResolvedValue(STYLE_MEMORY);
      mockFindByName.mockResolvedValue(null);
      mockUpdateTemplate.mockResolvedValue({
        ...STYLE_MEMORY,
        name: "Renamed",
      });

      const response = await PUT(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "PUT",
          body: { name: "Renamed", verificationStatus: "user_verified" },
        }),
        routeParams(),
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
      expect(mockUpdateTemplate).not.toHaveBeenCalled();
    });
  });

  // ─── DELETE 行为不变（plan-02 §实现规格 6：204 / 404） ────────────────

  describe("DELETE", () => {
    it("删除成功 → 204 无响应体", async () => {
      mockDeleteTemplate.mockResolvedValue(undefined);

      const response = await DELETE(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "DELETE",
        }),
        routeParams(),
      );

      expect(response.status).toBe(204);
      expect(mockDeleteTemplate).toHaveBeenCalledWith("template-1", "user-1");
    });

    it("Memory 不存在 → 404", async () => {
      mockDeleteTemplate.mockRejectedValue(new Error("Template not found"));

      const response = await DELETE(
        makeRequest("http://localhost:3000/api/templates/template-1", {
          method: "DELETE",
        }),
        routeParams(),
      );

      expect(response.status).toBe(404);
    });
  });
});
