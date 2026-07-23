---
workflow_type: 'new-feature'
spec_id: 'FEAT-0007'
title: '历史恢复时回显 Source Image'
type: 'bugfix'
created: '2026-07-23'
status: 'done'
context:
  - 'docs/12-全站AI优先界面风格复刻/12-1-架构文档-全站AI优先界面风格复刻.md'
  - 'docs/12-全站AI优先界面风格复刻/12-2-实现计划-全站AI优先界面风格复刻/plan-05-Iteration-Memory与保存记忆入口.md'
---

<frozen-after-approval reason="人工意图 — 除非人类重新协商，否则不可修改">

## 意图

**问题：** 历史详情恢复已回填 Prompt、Recipe 和生成参数，但没有把该历史记录的 Source Image 完整写回 workspace，导致 Reference Canvas 无法稳定回显对应参考图。

**方案：** Restore to workspace 时，将历史详情返回的 `sourceAssetId/sourceImageUrl` 一并写入 workspace 权威状态，并由 Reference Canvas 展示该来源图。

## 边界

**必须：** 使用历史详情关联的 Source Image；恢复后 Prompt、Recipe、负向 Prompt、生成参数和现有继续生成行为保持不变。

**先问：** 若后续要求为缺少 Source Image 的旧历史记录补图，需要另行确定迁移或降级策略。

**禁止：** 不把生成结果图当作参考图；不修改历史数据表、上传/分析流程、详情弹窗视觉样式或生成 API 契约。

## 需求变更

### 修改

- **REQ-1**: [Restore 仅恢复生成上下文，Source Image 未进入 workspace 权威状态] → [Restore 同步恢复 `sourceAssetId/sourceImageUrl`，Reference Canvas 立即显示该历史记录的 Source Image]。
- **REQ-2**: [恢复来源图仅依赖页面临时上下文] → [恢复来源图进入 workspace 状态及其既有持久化快照，刷新/重挂载后仍遵循同一来源上下文]。

</frozen-after-approval>

## 代码地图

- `src/hooks/use-workspace-state.ts` -- `enterHistoryRestored` 当前不接收或写入来源 asset/image，是恢复不完整的状态边界。
- `src/app/workspace/page.tsx` -- `applyHistoryRestore` 已拿到历史来源字段，需要将其传入 workspace 恢复动作并让 Reference Canvas 消费权威状态。
- `src/hooks/__tests__/use-workspace-state.test.tsx` -- 验证历史恢复动作同步更新参考图、asset 和持久化状态。
- `e2e/workspace-ai-first-iteration-memory.spec.ts` -- 验证用户点击 Restore 后 Reference Canvas 显示历史 Source Image。

## 任务清单

- [x] `src/hooks/use-workspace-state.ts` -- 扩展历史恢复动作，一次性写入来源 asset/image 与既有生成上下文。
- [x] `src/app/workspace/page.tsx` -- 把历史详情的来源字段接入恢复动作，收敛 Reference Canvas 的来源读取。
- [x] `src/hooks/__tests__/use-workspace-state.test.tsx`、`e2e/workspace-ai-first-iteration-memory.spec.ts` -- 增加状态与用户链路回归测试。

## 验证命令

- `pnpm vitest --run src/hooks/__tests__/use-workspace-state.test.tsx src/hooks/__tests__/use-history-restore.test.tsx` -- 验证历史数据读取及 workspace 来源状态写回。
- `pnpm type-check` -- 验证恢复动作签名和调用方类型。
- `pnpm e2e -- e2e/workspace-ai-first-iteration-memory.spec.ts` -- 验证点击 Restore 后 Reference Canvas 回显历史 Source Image 且既有恢复流程可继续生成。

## 验收标准

- [x] Given 历史详情包含 Source Image, when 用户点击 Restore to workspace, then Reference Canvas 立即显示该 Source Image，而不是空态、当前草稿参考图或生成结果图。
- [x] Given 历史详情同时包含 source asset、Prompt、Recipe、负向 Prompt 和生成参数, when 恢复完成, then workspace 一次性采用这组同源上下文且原有继续生成能力不回退。
- [x] Given 历史恢复状态已写入 workspace, when 页面按既有机制重挂载并读取快照, then Reference Canvas 仍使用已恢复的 source asset/image。
- [x] Given 历史详情没有 Source Image, when 用户恢复该旧记录, then 系统不把生成结果图误用为 Reference Canvas 参考图。

## 验证记录

- Red: `pnpm vitest --run src/hooks/__tests__/use-workspace-state.test.tsx -t '历史恢复写入并持久化对应的 source asset 和 image'` — 预期失败；`enterHistoryRestored` 后 `assetId` 仍为 `null`，证明历史来源未写入 workspace 权威状态。
- Green: `pnpm vitest --run src/hooks/__tests__/use-workspace-state.test.tsx src/hooks/__tests__/use-history-restore.test.tsx` — 通过（2 files，36 tests）。
- Green: `pnpm type-check` — 通过。
- Green: `pnpm e2e -- e2e/workspace-ai-first-iteration-memory.spec.ts` — 通过（6 tests），Restore 用例验证 Reference Canvas 使用历史 `sourceImageUrl`。
- Regression: `pnpm lint` — 通过；仅有仓库既有 warnings。
- Regression: `git diff --check` — 通过。
