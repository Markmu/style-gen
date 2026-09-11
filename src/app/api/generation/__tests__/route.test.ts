import { NextRequest } from 'next/server';
import { WorkspaceServiceError } from '@/lib/workspace/validation';
const mockAuth=vi.fn(),mockListIterations=vi.fn(),mockGetDirectionIterationFeed=vi.fn(),mockSubmit=vi.fn();
vi.mock('@/auth',()=>({auth:(...a:unknown[])=>mockAuth(...a)}));
vi.mock('@/lib/repositories/generation-task-repository',()=>({listIterations:(...a:unknown[])=>mockListIterations(...a),getDirectionIterationFeed:(...a:unknown[])=>mockGetDirectionIterationFeed(...a)}));
vi.mock('@/lib/generation/submission',()=>({submitGeneration:(...a:unknown[])=>mockSubmit(...a)}));
import {GET,POST} from '../route';
function createGetRequest(url='http://localhost:3000/api/generation?pageSize=20'){return new NextRequest(url);}
function createRequest(body:unknown){return new NextRequest('http://localhost:3000/api/generation',{method:'POST',body:JSON.stringify(body)});}
describe("GET /api/generation", () => {
  const sampleIterationItem = {
    id: "gen-history-1",
    status: "completed" as const,
    promptSummary: "a beautiful sunset",
    resultFileUrl: "https://cdn.example.com/result.webp",
    params: { aspectRatio: "16:9", quality: "high" },
    createdAt: new Date("2026-05-11T05:00:00.000Z"),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockListIterations.mockReset();
  });

  it("返回当前用户的迭代列表（条目为既有字段超集）", async () => {
    mockListIterations.mockResolvedValueOnce({
      items: [sampleIterationItem],
      nextCursor: "2026-05-11T05:00:00.000Z::gen-history-1",
    });

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      items: [
        {
          directionId: null,
          id: "gen-history-1",
          status: "completed",
          promptSummary: "a beautiful sunset",
          resultFileUrl: "https://cdn.example.com/result.webp",
          params: { aspectRatio: "16:9", quality: "high" },
          createdAt: "2026-05-11T05:00:00.000Z",
        },
      ],
      nextCursor: "2026-05-11T05:00:00.000Z::gen-history-1",
    });
  });

  it("无 status 参数默认 completed（近期迭代条 useHistoryList 兼容）", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=20"));

    expect(mockListIterations).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", status: "completed" })
    );
  });

  it("status=all / processing / completed / failed 白名单值透传给仓库", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?status=all"));
    await GET(createGetRequest("http://localhost:3000/api/generation?status=processing"));
    await GET(createGetRequest("http://localhost:3000/api/generation?status=failed"));
    await GET(createGetRequest("http://localhost:3000/api/generation?status=completed"));

    expect(mockListIterations).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: "all" })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ status: "processing" })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ status: "failed" })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ status: "completed" })
    );
  });

  it("非法 status 值返回 400 INVALID_REQUEST 且不查询仓库", async () => {
    const res = await GET(
      createGetRequest("http://localhost:3000/api/generation?status=done")
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("q trim 后透传，可与 status 组合生效", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(
      createGetRequest(
        "http://localhost:3000/api/generation?q=%20sunset%20&status=all"
      )
    );

    expect(mockListIterations).toHaveBeenCalledWith(
      expect.objectContaining({ q: "sunset", status: "all" })
    );
  });

  it("q trim 后超过 100 字符返回 400，不做静默截断", async () => {
    const longQ = "x".repeat(101);

    const res = await GET(
      createGetRequest(`http://localhost:3000/api/generation?q=${longQ}`)
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("q trim 后恰好 100 字符可接受", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    const q = "x".repeat(100);
    const res = await GET(
      createGetRequest(`http://localhost:3000/api/generation?q=%20${q}%20`)
    );

    expect(res.status).toBe(200);
    expect(mockListIterations).toHaveBeenCalledWith(
      expect.objectContaining({ q })
    );
  });

  it("q 为空串或纯空白视为无搜索条件", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?q="));
    await GET(createGetRequest("http://localhost:3000/api/generation?q=%20%20"));

    expect(mockListIterations).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ q: undefined })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ q: undefined })
    );
  });

  it("未Log in时返回 401 且不查询列表", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual(
      expect.objectContaining({ code: "UNAUTHORIZED", retryable: false })
    );
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("pageSize 会限制在 1 到 50 之间", async () => {
    mockListIterations.mockResolvedValue({ items: [], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=100"));
    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=0"));
    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=abc"));
    await GET(createGetRequest("http://localhost:3000/api/generation?pageSize=1.5"));

    expect(mockListIterations).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ pageSize: 50 })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageSize: 1 })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ pageSize: 20 })
    );
    expect(mockListIterations).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ pageSize: 1 })
    );
  });

  it("成功路径输出 iteration_list_queried 结构化日志", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockListIterations.mockResolvedValueOnce({ items: [sampleIterationItem], nextCursor: null });

    await GET(createGetRequest("http://localhost:3000/api/generation?status=all&q=sun"));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("iteration_list_queried")
    );

    logSpy.mockRestore();
  });

  it("查询异常时打印结构化错误日志", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockListIterations.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:5433"));

    const res = await GET(createGetRequest());
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("SERVICE_UNAVAILABLE");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("generation_history_list_failed")
    );

    errorSpy.mockRestore();
  });
});

// ─── plan-03: GET ?view=direction 方向分组 feed（§3 / AC-04） ─────────────

describe("GET /api/generation?view=direction (plan-03)", () => {
  function directionItem(overrides: Record<string, unknown> = {}) {
    return {
      id: "gen-dir-1",
      status: "completed" as const,
      promptSummary: "a beautiful sunset",
      resultFileUrl: "https://cdn.example.com/result.webp",
      params: { aspectRatio: "16:9", quality: "high" },
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      resultAssetId: "asset-dir-1",
      errorMessage: null,
      ...overrides,
    };
  }

  function createDirectionRequest(query: string): NextRequest {
    return new NextRequest(`http://localhost:3000/api/generation?${query}`, {
      method: "GET",
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuth.mockReset();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockGetDirectionIterationFeed.mockReset();
    // plan-03 implementer 修复测试 fixture：vi.restoreAllMocks() 不清除 vi.fn() 的调用记录，
    // 上一 describe 末次 listIterations 调用会泄漏进本 describe 的 not.toHaveBeenCalled() 断言；
    // reset 仅隔离跨 describe 状态，不改变任何断言语义。
    mockListIterations.mockReset();
  });

  it("返回 completed/active/latestFailure 分组 feed（DirectionIterationFeed DTO）", async () => {
    mockGetDirectionIterationFeed.mockResolvedValueOnce({
      completed: [
        directionItem(),
        directionItem({
          id: "gen-dir-2",
          resultAssetId: "asset-dir-2",
          createdAt: new Date("2026-08-31T00:00:00.000Z"),
        }),
      ],
      active: directionItem({
        id: "gen-dir-active",
        status: "processing",
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: directionItem({
        id: "gen-dir-failed",
        status: "failed",
        resultFileUrl: null,
        resultAssetId: null,
        errorMessage: "provider timeout",
      }),
    });

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1&pageSize=5")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetDirectionIterationFeed).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      5
    );
    expect(mockListIterations).not.toHaveBeenCalled();
    expect(json.completed).toEqual([
      {
        id: "gen-dir-1",
        status: "completed",
        promptSummary: "a beautiful sunset",
        resultFileUrl: "https://cdn.example.com/result.webp",
        params: { aspectRatio: "16:9", quality: "high" },
        createdAt: "2026-09-01T00:00:00.000Z",
        resultAssetId: "asset-dir-1",
        errorMessage: null,
      },
      {
        id: "gen-dir-2",
        status: "completed",
        promptSummary: "a beautiful sunset",
        resultFileUrl: "https://cdn.example.com/result.webp",
        params: { aspectRatio: "16:9", quality: "high" },
        createdAt: "2026-08-31T00:00:00.000Z",
        resultAssetId: "asset-dir-2",
        errorMessage: null,
      },
    ]);
    expect(json.active).toEqual(
      expect.objectContaining({ id: "gen-dir-active", status: "processing" })
    );
    expect(json.latestFailure).toEqual(
      expect.objectContaining({
        id: "gen-dir-failed",
        status: "failed",
        errorMessage: "provider timeout",
      })
    );
  });

  it("无进行中/失败任务时 active 与 latestFailure 返回 null", async () => {
    mockGetDirectionIterationFeed.mockResolvedValueOnce({
      completed: [directionItem()],
      active: null,
      latestFailure: null,
    });

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.active).toBeNull();
    expect(json.latestFailure).toBeNull();
    // pageSize 缺省为 5
    expect(mockGetDirectionIterationFeed).toHaveBeenCalledWith(
      "user-1",
      "analysis-1",
      5
    );
  });

  it("缺少 analysisTaskId 返回 400 INVALID_REQUEST 且不查询方向 feed", async () => {
    const res = await GET(createDirectionRequest("view=direction"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("方向 pageSize 仅允许 1-5：0 与 6 均返回 400", async () => {
    const zero = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1&pageSize=0")
    );
    expect(zero.status).toBe(400);
    expect((await zero.json()).code).toBe("INVALID_REQUEST");

    const six = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1&pageSize=6")
    );
    expect(six.status).toBe(400);
    expect((await six.json()).code).toBe("INVALID_REQUEST");

    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
  });

  it("view 为未知值时返回 400（枚举白名单，不静默回退普通列表）", async () => {
    const res = await GET(createDirectionRequest("view=other"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.code).toBe("INVALID_REQUEST");
    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
    expect(mockListIterations).not.toHaveBeenCalled();
  });

  it("成功路径输出 direction_iterations_queried（duration/completedCount/hasActive/hasLatestFailure）", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mockGetDirectionIterationFeed.mockResolvedValueOnce({
      completed: [directionItem()],
      active: directionItem({
        id: "gen-dir-active",
        status: "processing",
        resultFileUrl: null,
        resultAssetId: null,
      }),
      latestFailure: null,
    });

    await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );

    const logged = logSpy.mock.calls
      .map((call) => String(call[0]))
      .find((line) => line.includes("direction_iterations_queried"));
    expect(logged).toBeDefined();
    expect(logged).toContain('"completedCount":1');
    expect(logged).toContain('"hasActive":true');
    expect(logged).toContain('"hasLatestFailure":false');
    expect(logged).toContain('"duration"');

    logSpy.mockRestore();
  });

  it("未登录返回 401 且不查询方向 feed", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json).toEqual(
      expect.objectContaining({ code: "UNAUTHORIZED", retryable: false })
    );
    expect(mockGetDirectionIterationFeed).not.toHaveBeenCalled();
  });

  it("方向查询异常返回 500 SERVICE_UNAVAILABLE（可重试）", async () => {
    mockGetDirectionIterationFeed.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 127.0.0.1:5433")
    );

    const res = await GET(
      createDirectionRequest("view=direction&analysisTaskId=analysis-1")
    );
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.code).toBe("SERVICE_UNAVAILABLE");
    expect(json.retryable).toBe(true);
  });
});


describe('POST /api/generation HTTP envelope',()=>{
 beforeEach(()=>{mockAuth.mockResolvedValue({user:{id:'user-1'}});mockSubmit.mockReset();});
 it('passes authenticated user and unmodified body to the common service',async()=>{
  const body={directionId:'d',requestKey:'key'};mockSubmit.mockResolvedValue({id:'task',status:'completed',reused:false});const res=await POST(createRequest(body));expect(res.status).toBe(201);expect((await res.json()).status).toBe('completed');expect(mockSubmit).toHaveBeenCalledWith('user-1',body);
 });
 it('same-key receipt returns200, not a new201',async()=>{mockSubmit.mockResolvedValue({id:'task',status:'processing',submissionState:'unknown',reused:true});expect((await POST(createRequest({}))).status).toBe(200);});
 it('unauthenticated never calls service',async()=>{mockAuth.mockResolvedValue(null);expect((await POST(createRequest({}))).status).toBe(401);expect(mockSubmit).not.toHaveBeenCalled();});
 for(const status of [400,409,429,503])it(`maps service ${status} without dropping context`,async()=>{mockSubmit.mockRejectedValue(new WorkspaceServiceError('EXPECTED',status));const res=await POST(createRequest({}));expect(res.status).toBe(status);expect(await res.json()).toMatchObject({code:'EXPECTED',preservedContext:true});});
 it('rejects malformed JSON before invoking service',async()=>{const res=await POST(new NextRequest('http://localhost/api/generation',{method:'POST',body:'{'}));expect(res.status).toBe(400);expect(mockSubmit).not.toHaveBeenCalled();});
});
