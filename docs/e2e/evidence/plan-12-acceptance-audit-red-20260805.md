# 第 12 期 Acceptance Audit — Red Evidence

- 日期：2026-08-05
- 命令：`pnpm e2e:targeted`
- 结论：未通过，套件有效
- 结果：35 passed / 12 failed

## 失败范围

- `ai-first-landing-states.spec.ts`：auth restricted 状态找不到共享 auth entry。
- `ai-first-shell.spec.ts`：Workspace / Style Memory 共享 Header、导航与部分 AI 状态文案与当前实现不一致。
- `ai-first-style-memory.spec.ts`：Use Memory 后的变量默认值未注入。
- `ai-first-visual-regression.spec.ts`：Workspace 关键 QA selector 中缺少 `ai-status-header`。
- `workspace-ai-first-evidence.spec.ts`：参考图 `object-fit` 与 evidence anchor 断言与当前实现不一致。

## 通过范围

- Design-token 基线。
- Iteration Memory 主链路。
- Render Dock readiness、生成与失败恢复主链路。
- Style Memory 的大部分列表、空态、搜索、复制、删除与失败状态。

## 恢复边界

本轮只固化证据与计划状态，不在未确认当前产品真值前盲目修改 UI 或放宽断言。后续需逐项判定“产品回归”还是“过时 E2E”，修复后重跑同一 `pnpm e2e:targeted` 命令。
