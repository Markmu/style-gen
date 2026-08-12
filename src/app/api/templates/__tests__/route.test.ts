import { GET, POST } from "../route";
import { NextRequest } from "next/server";
import type { AnalysisTask, Asset, PromptTemplate } from "@/types/models";

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

const mockFindAnalysisTaskById = vi.fn();
vi.mock("@/lib/repositories/analysis-task-repository", () => ({
  findAnalysisTaskById: (...args: unknown[]) => mockFindAnalysisTaskById(...args),
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

const ANALYSIS_TASK: AnalysisTask = {
  id: "analysis-1",
  sourceAssetId: "asset-1",
  status: "completed",
  recipe: null,
  promptText: "Create a glass fox.",
  negativePromptText: "",
  rawResponse: "A glass fox.",
  errorMessage: null,
  errorStage: null,
  analysisTemplateContent: "Create {{subject}}.",
  analysisTemplateVariables: [{ name: "subject", defaultValue: "glass fox" }],
  analysisTemplateStatus: "ready",
  analysisTemplateReason: null,
  provider: "gemini",
  externalId: null,
  modelName: "gemini-2.5-flash",
  userId: "user-1",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
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

  it("derives the owned reference image from sourceAnalysisTaskId", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);
    mockFindAssetById.mockResolvedValue(REFERENCE_ASSET);
    mockCreateTemplate.mockResolvedValue(TEMPLATE);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(201);
    expect(mockFindAnalysisTaskById).toHaveBeenCalledWith("analysis-1", "user-1");
    expect(mockFindAssetById).toHaveBeenCalledWith("asset-1");
    expect(mockCreateTemplate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        sourceAssetId: "asset-1",
        sourceImageUrl: "https://cdn.example.com/reference.png",
      }),
    );
  });

  it("rejects a missing or unauthorized source analysis task", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(null);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFindAnalysisTaskById).toHaveBeenCalledWith("analysis-1", "user-1");
    expect(mockFindAssetById).not.toHaveBeenCalled();
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects a non-reference asset derived from the analysis task", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);
    mockFindAssetById.mockResolvedValue({
      ...REFERENCE_ASSET,
      type: "generated",
    });

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects an asset owned by another user even when the task is owned", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);
    mockFindAssetById.mockResolvedValue({
      ...REFERENCE_ASSET,
      userId: "user-2",
    });

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects conflicting analysis task and explicit source asset IDs", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAnalysisTaskById.mockResolvedValue(ANALYSIS_TASK);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceAnalysisTaskId: "analysis-1",
        sourceAssetId: "asset-2",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockFindAssetById).not.toHaveBeenCalled();
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("rejects a client image URL without a database-backed source", async () => {
    mockFindByName.mockResolvedValue(null);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "Saved",
        content: "Create {{subject}}.",
        sourceImageUrl: "https://cdn.example.com/client-supplied.png",
      }),
    );

    expect(response.status).toBe(400);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
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

  it("accepts Unicode, spaced, and hyphenated variable names", async () => {
    mockFindByName.mockResolvedValue(null);
    mockFindAssetById.mockResolvedValue(null);
    mockCreateTemplate.mockResolvedValue(TEMPLATE);

    const response = await POST(
      makeRequest("http://localhost:3000/api/templates", {
        name: "多语言模板",
        content: "Create {{主体 名称}} with {{lighting-color}}.",
        variables: [
          { name: "主体 名称 ", defaultValue: "glass fox" },
          { name: "lighting-color", defaultValue: "soft blue" },
        ],
      }),
    );

    expect(response.status).toBe(201);
    expect(mockCreateTemplate).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        variables: [
          { name: "主体 名称", defaultValue: "glass fox" },
          { name: "lighting-color", defaultValue: "soft blue" },
        ],
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
