import { GET } from "../route";
import { NextRequest } from "next/server";
import type { RepresentativeCandidate } from "@/types/models";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockFindById = vi.fn();
const mockFindStyleMemoryDetail = vi.fn();
const mockListRepresentativeCandidates = vi.fn();
vi.mock("@/lib/repositories/template-repository", () => ({
  findById: (...args: unknown[]) => mockFindById(...args),
  findStyleMemoryDetail: (...args: unknown[]) =>
    mockFindStyleMemoryDetail(...args),
  listRepresentativeCandidates: (...args: unknown[]) =>
    mockListRepresentativeCandidates(...args),
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
  });
}

const routeParams = (id = "template-1") => ({ params: Promise.resolve({ id }) });

const MEMORY = {
  id: "template-1",
  name: "Saved Direction",
  description: null,
  content: "Create {{subject}}.",
  variables: [{ name: "subject", defaultValue: "glass fox" }],
  retainedRules: ["rule a"],
  negativeConstraints: [],
  styleTokens: [],
  enhancementHints: [],
  verificationStatus: "user_verified" as const,
  representativeGenerationTaskId: "gen-1",
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  sourceGenerationTaskId: "gen-source",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

const CANDIDATES: RepresentativeCandidate[] = [
  {
    id: "gen-derived-1",
    imageUrl: "https://cdn.example.com/gen-derived-1.webp",
    promptSummary: "A glass fox at dawn",
    createdAt: "2026-06-02T00:00:00.000Z",
  },
  {
    // 来源迭代自身也在候选集内（sourceGenerationTaskId ∪ sourceTemplateId）
    id: "gen-source",
    imageUrl: "https://cdn.example.com/gen-source.webp",
    promptSummary: "Source iteration prompt",
    createdAt: "2026-06-01T00:00:00.000Z",
  },
];

describe("/api/templates/[id]/representative-candidates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockFindById.mockResolvedValue(MEMORY);
    mockFindStyleMemoryDetail.mockResolvedValue(MEMORY);
    mockListRepresentativeCandidates.mockResolvedValue({
      items: CANDIDATES,
      hasMore: true,
      nextCursor: "2026-06-01T00:00:00.000Z::gen-source",
    });
  });

  it("返回候选迭代分页结构（默认 limit=20，透传 templateId/userId）", async () => {
    const response = await GET(
      makeRequest(
        "http://localhost:3000/api/templates/template-1/representative-candidates",
      ),
      routeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mockListRepresentativeCandidates).toHaveBeenCalledTimes(1);
    const call = mockListRepresentativeCandidates.mock.calls[0];
    expect(call[0]).toBe("template-1");
    expect(call[1]).toBe("user-1");
    expect(call[3]).toBe(20);

    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      id: "gen-derived-1",
      imageUrl: "https://cdn.example.com/gen-derived-1.webp",
      promptSummary: "A glass fox at dawn",
    });
    expect(data.hasMore).toBe(true);
    expect(data.nextCursor).toBe("2026-06-01T00:00:00.000Z::gen-source");
  });

  it("cursor 与 limit 查询参数透传", async () => {
    const response = await GET(
      makeRequest(
        "http://localhost:3000/api/templates/template-1/representative-candidates?cursor=2026-06-01T00%3A00%3A00.000Z%3A%3Agen-source&limit=5",
      ),
      routeParams(),
    );

    expect(response.status).toBe(200);
    const call = mockListRepresentativeCandidates.mock.calls[0];
    expect(call[2]).toBe("2026-06-01T00:00:00.000Z::gen-source");
    expect(call[3]).toBe(5);
  });

  it("limit 超上限 50 时按 50 透传", async () => {
    const response = await GET(
      makeRequest(
        "http://localhost:3000/api/templates/template-1/representative-candidates?limit=999",
      ),
      routeParams(),
    );

    expect(response.status).toBe(200);
    const call = mockListRepresentativeCandidates.mock.calls[0];
    expect(call[3]).toBe(50);
  });

  it("Memory 不存在或不属于本人 → 404 TEMPLATE_NOT_FOUND", async () => {
    mockFindById.mockResolvedValue(null);
    mockFindStyleMemoryDetail.mockResolvedValue(null);

    const response = await GET(
      makeRequest(
        "http://localhost:3000/api/templates/template-1/representative-candidates",
      ),
      routeParams(),
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.code).toBe("TEMPLATE_NOT_FOUND");
    expect(mockListRepresentativeCandidates).not.toHaveBeenCalled();
  });

  it("未登录 → 401 UNAUTHORIZED", async () => {
    mockAuth.mockResolvedValue(null);

    const response = await GET(
      makeRequest(
        "http://localhost:3000/api/templates/template-1/representative-candidates",
      ),
      routeParams(),
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.code).toBe("UNAUTHORIZED");
    expect(mockListRepresentativeCandidates).not.toHaveBeenCalled();
  });
});
