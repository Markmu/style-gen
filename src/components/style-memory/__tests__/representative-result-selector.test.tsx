// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RepresentativeResultSelector } from "@/components/style-memory/representative-result-selector";
import type { RepresentativeCandidate } from "@/types/models";

/**
 * plan-06 Task 4/7：代表结果确认层（RepresentativeResultSelector）测试。
 *
 * 覆盖：候选按 memoryId 归属读取（query-key 唯一 owner）、preferred 预选、
 * 确认 POST { generationTaskId }、确认失败保留弹层可重试、取消零请求、
 * 「Load earlier」游标翻页、首屏读取失败重试与打开时焦点进入对话框。
 */

function candidate(
  id: string,
  overrides: Partial<RepresentativeCandidate> = {},
): RepresentativeCandidate {
  return {
    id,
    imageUrl: `https://cdn.example.com/results/${id}.webp`,
    promptSummary: `Preferred direction result ${id}`,
    createdAt: "2026-09-01T00:03:00.000Z",
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function candidatesResponse(
  items: RepresentativeCandidate[],
  options: { hasMore?: boolean; nextCursor?: string | null } = {},
) {
  return jsonResponse(200, {
    items,
    hasMore: options.hasMore ?? false,
    nextCursor: options.nextCursor ?? null,
  });
}

const RECORD_BODY = {
  id: "mem-1",
  name: "Source memory",
  verificationStatus: "user_verified",
};

function renderSelector(
  overrides: Partial<Parameters<typeof RepresentativeResultSelector>[0]> = {},
) {
  const onClose = vi.fn();
  const onConfirmed = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RepresentativeResultSelector
        memoryId="mem-1"
        memoryName="Source memory"
        open
        onClose={onClose}
        onConfirmed={onConfirmed}
        {...overrides}
      />
    </QueryClientProvider>,
  );
  return { onClose, onConfirmed };
}

function postCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("/representative-result"),
  ) as Array<[string, RequestInit]>;
}

describe("RepresentativeResultSelector — plan-06 工作台代表结果确认入口", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("打开即按 memoryId 读取候选（归属范围由服务端定义）并渲染 radio 列表", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/api/templates/mem-1/representative-candidates")) {
        return Promise.resolve(
          candidatesResponse([candidate("cand-1"), candidate("cand-2")]),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSelector();

    const dialog = screen.getByTestId("representative-result-selector");
    expect(dialog).toHaveAttribute("role", "dialog");

    await waitFor(() => {
      expect(within(dialog).getAllByRole("radio")).toHaveLength(2);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/mem-1/representative-candidates",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("preferred 预选：preferred 结果 radio 已勾选，确认后 POST { generationTaskId } 并回调回读", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes("/representative-candidates")) {
        return Promise.resolve(
          candidatesResponse([candidate("cand-1"), candidate("cand-2")]),
        );
      }
      if (String(url).includes("/representative-result")) {
        return Promise.resolve(jsonResponse(200, RECORD_BODY));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose, onConfirmed } = renderSelector({
      preselectedIterationId: "cand-2",
    });

    const dialog = screen.getByTestId("representative-result-selector");
    const preferredRadio = await within(dialog).findByRole("radio", {
      name: /cand-2/,
    });
    expect(preferredRadio).toBeChecked();
    expect(
      within(dialog).getByRole("radio", { name: /cand-1/ }),
    ).not.toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: /Set as representative/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));

    const writes = postCalls(fetchMock);
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/api/templates/mem-1/representative-result");
    expect(JSON.parse(String(writes[0][1].body))).toEqual({
      generationTaskId: "cand-2",
    });
  });

  it("取消零请求：Cancel 只关闭弹层，不发出任何写请求", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/representative-candidates")) {
        return Promise.resolve(candidatesResponse([candidate("cand-1")]));
      }
      return Promise.resolve(jsonResponse(500, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose, onConfirmed } = renderSelector();

    await screen.findByRole("radio", { name: /cand-1/ });
    await user.click(screen.getByRole("radio", { name: /cand-1/ }));
    await user.click(screen.getByRole("button", { name: "Cancel", exact: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
    expect(postCalls(fetchMock)).toHaveLength(0);
  });

  it("确认失败保留弹层与所选结果：服务端错误可见，主动重试成功后才关闭并回读", async () => {
    let postAttempts = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/representative-candidates")) {
        return Promise.resolve(candidatesResponse([candidate("cand-1")]));
      }
      if (String(url).includes("/representative-result")) {
        postAttempts += 1;
        if (postAttempts === 1) {
          return Promise.resolve(
            jsonResponse(503, {
              error: "Representative update temporarily unavailable",
              retryable: true,
            }),
          );
        }
        return Promise.resolve(jsonResponse(200, RECORD_BODY));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { onClose, onConfirmed } = renderSelector({
      preselectedIterationId: "cand-1",
    });

    const dialog = screen.getByTestId("representative-result-selector");
    await within(dialog).findByRole("radio", { name: /cand-1/ });
    await user.click(within(dialog).getByRole("button", { name: /Set as representative/ }));

    await waitFor(() =>
      expect(within(dialog).getByText(/temporarily unavailable/)).toBeVisible(),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
    // 预选的失败重试不丢：弹层保留、radio 保持勾选
    expect(within(dialog).getByRole("radio", { name: /cand-1/ })).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: /Set as representative/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(postCalls(fetchMock)).toHaveLength(2);
  });

  it("「Load earlier」游标翻页读取更早候选", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (
        String(url).includes("/representative-candidates") &&
        String(url).includes("cursor=")
      ) {
        return Promise.resolve(candidatesResponse([candidate("cand-old")]));
      }
      if (String(url).includes("/representative-candidates")) {
        return Promise.resolve(
          candidatesResponse([candidate("cand-1")], {
            hasMore: true,
            nextCursor: "2026-09-01T00:03:00.000Z::cand-1",
          }),
        );
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSelector();

    const dialog = screen.getByTestId("representative-result-selector");
    await within(dialog).findByRole("radio", { name: /cand-1/ });
    await user.click(within(dialog).getByRole("button", { name: /Load earlier/ }));

    await within(dialog).findByRole("radio", { name: /cand-old/ });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/mem-1/representative-candidates?cursor=2026-09-01T00%3A03%3A00.000Z%3A%3Acand-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("首屏候选读取失败：真实错误位 + 重试恢复（不伪造候选）", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(503, { error: "Candidates unavailable", retryable: true }),
        ),
      )
      .mockImplementation((url: string) => {
        if (String(url).includes("/representative-candidates")) {
          return Promise.resolve(candidatesResponse([candidate("cand-1")]));
        }
        return Promise.resolve(jsonResponse(404, {}));
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSelector();

    const dialog = screen.getByTestId("representative-result-selector");
    await waitFor(() =>
      expect(within(dialog).getByText("Candidates unavailable")).toBeVisible(),
    );
    expect(within(dialog).queryAllByRole("radio")).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Retry" }));
    await within(dialog).findByRole("radio", { name: /cand-1/ });
  });

  it("打开时焦点进入对话框（focus-managed，初始焦点不留在页面背景）", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes("/representative-candidates")) {
        return Promise.resolve(candidatesResponse([candidate("cand-1")]));
      }
      return Promise.resolve(jsonResponse(404, {}));
    });
    vi.stubGlobal("fetch", fetchMock);
    renderSelector();

    const dialog = screen.getByTestId("representative-result-selector");
    await waitFor(() => {
      expect(dialog).toContainElement(document.activeElement);
    });
  });
});
