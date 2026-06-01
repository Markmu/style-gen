import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import type { Asset, PromptTemplate } from "@/types/models";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockCreateTemplate = vi.fn();
const mockFindByName = vi.fn();
const mockFindAllByUserId = vi.fn();
vi.mock("@/lib/repositories/template-repository", () => ({
  createTemplate: (...args: unknown[]) => mockCreateTemplate(...args),
  findByName: (...args: unknown[]) => mockFindByName(...args),
  findAllByUserId: (...args: unknown[]) => mockFindAllByUserId(...args),
}));

const mockFindAssetById = vi.fn();
vi.mock("@/lib/repositories/asset-repository", () => ({
  findAssetById: (...args: unknown[]) => mockFindAssetById(...args),
}));

function makeRequest(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const REFERENCE_ASSET: Asset = {
  id: "asset-1",
  type: "reference",
  fileUrl: "https://cdn.example.com/reference.png",
  thumbnailUrl: null,
  width: 800,
  height: 600,
  mimeType: "image/png",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

const TEMPLATE: PromptTemplate = {
  id: "template-1",
  name: "Saved",
  content: "Create {{subject}}.",
  variables: [{ name: "subject", defaultValue: "glass fox" }],
  sourceAssetId: "asset-1",
  sourceImageUrl: "https://cdn.example.com/reference.png",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

describe("/api/templates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("creates a template with the owned reference asset image", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);
    mockCreateTemplate.mockResolvedValue(TEMPLATE);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        variables: [{ name: "subject", defaultValue: "glass fox" }],
        sourceAssetId: "asset-1",
        sourceImageUrl: "https://cdn.example.com/client-supplied.png",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateTemplate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        sourceAssetId: "asset-1",
        sourceImageUrl: "https://cdn.example.com/reference.png",
      }),
    );
  });

  it("returns source image fields in the template list response", async () => {
    mockFindAllByUserId.mockResolvedValue({
      items: [
        {
          id: "template-1",
          name: "Saved",
          variableCount: 1,
          sourceAssetId: "asset-1",
          sourceImageUrl: "https://cdn.example.com/reference.png",
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    const response = await GET(
      makeRequest("http://localhost:3000/api/templates?limit=20"),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items[0].sourceAssetId).toBe("asset-1");
    expect(data.items[0].sourceImageUrl).toBe("https://cdn.example.com/reference.png");
  });
});
