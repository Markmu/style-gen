# 第 12 期 Acceptance Audit — Green Evidence

- 日期：2026-08-12
- 初始证据：`docs/e2e/evidence/plan-12-acceptance-audit-red-20260805.md`
- 最终命令：`pnpm verify:acceptance`
- 结论：通过
- 结果：48 passed / 0 failed；`verify:fast`、production build、targeted E2E 均通过

## 12 项失败判定

| 判定 | 数量 | 处理 |
| --- | ---: | --- |
| 现行 UI 缺陷 | 3 | TC-7.3 与 TC-2.7 暴露同一个未登录侧栏错误：无 session 时仍显示 `Signed in / Workspace user`，已改为真实 Log in 入口；TC-7.4 的 empty/noResults 行动与搜索恢复路径已补齐。 |
| 已过时的实现级断言 | 9 | 保留 AC 的用户结果覆盖，移除对旧顶部导航、旧 `ai-status-header` DOM、状态带内 facet 全量文案、失败态必须位于状态带、`object-contain` 和合成 Reference anchor 的强绑定。 |

## 产品真值依据

- Workspace 与 Style Memory 当前共享左侧工作区导航；Landing 单独使用顶部主导航。
- `ai-copilot-ribbon` 是跨 idle/analyzing/ready/generating 的稳定状态容器；生成失败恢复属于 `generation-dialog`。
- Reference Canvas 当前以 `object-fit: cover` 利用画布空间。
- `PRODUCT.md` 明确要求：模型未提供空间坐标时，不得暗示图像坐标或空间 provenance；因此合成 Reference anchor 已过时且不应恢复。

## 最终验证

- `pnpm vitest --run src/components/workspace/__tests__/left-sidebar.test.tsx src/components/workspace/__tests__/reference-card.test.tsx src/components/workspace/__tests__/recipe-card.test.tsx src/components/workspace/__tests__/prompt-card.test.tsx`：25 passed。
- `pnpm exec playwright test e2e/ai-first-shell.spec.ts e2e/ai-first-landing-states.spec.ts e2e/workspace-ai-first-evidence.spec.ts e2e/ai-first-visual-regression.spec.ts --project=workspace`：25 passed。
- `pnpm verify:acceptance`：92 test files / 687 tests passed；production build passed；targeted E2E 48 passed。
- 视觉检查：1440×900 与 390×844 的 Library 截图无横向溢出；内容区使用完整可用宽度。

## 结论

12 个失败项均已关闭。没有删除仍有产品价值的 AC；对 9 个过时项只更新了实现级表达，仍验证相同的可观察结果、恢复能力和上下文保留要求。
