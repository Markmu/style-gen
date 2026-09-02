---
feat_id: "plan-06"
title: "首选 Memory 与结果新参考"
dimension: mixed
phase: 5
status: done
depends_on: ["plan-03", "plan-05"]
---

# plan-06: 首选 Memory 与结果新参考

## 功能概要

- **目标**: 完成本次首选、Style Memory 既有确认写点与“作为新参考”方向切换，使满意结果能安全沉淀或开启新方向，同时保持来源、历史和验证边界。
- **完成后可观察结果**: 用户可把一个完成结果设为本次首选并随时更换；即使该结果滚出五条 rail，仍显示“首选已在 Iteration Memory”并可打开详情。保存或更新 Style Memory 时复用现有确认流程，设置首选本身绝不会改变验证状态。用户把结果作为新参考前会看到未完成内容影响，取消不变；确认后直接复用已有 Asset 开始新分析，旧方向和全部结果仍可回溯。
- **依赖**: plan-03（Iteration detail、sourceAssetId 分支）、plan-05（结果选择/首选回调与 rail）
- **关联验收标准**: [AC-04, AC-06, AC-07]
- **涉及架构模块**: Direction Results & Compare、Workspace Session Controller、Analysis & Generation Routes、既有 Memory 写点
- **前置条件**: plan-05 结果动作可用；第 14 期 SaveStyleMemoryDialog 与 representative-result 端点保持 green。
- **不在范围**: 改变 Style Memory 验证算法、代表结果数量或 Iteration Memory IA；复制生成 Asset；自动保存首选。

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/direction-result-rail.tsx` | 接入窗口外首选、Memory、新参考与 Iteration 动作 |
| modify | `src/components/workspace/__tests__/direction-result-rail.test.tsx` | 首选滚出窗口、无效清理与动作测试 |
| modify | `src/components/iterations/save-style-memory-dialog.tsx` | 支持从 preferred 预选完成结果的复用入口 |
| modify | `src/components/iterations/__tests__/save-style-memory-dialog.test.tsx` | 预选、取消与失败保留测试 |
| modify | `src/components/style-memory/representative-result-selector.tsx` | 来源 Memory 的代表结果确认入口复用 |
| create | `src/components/style-memory/__tests__/representative-result-selector.test.tsx` | 归属、确认、失败与焦点测试 |
| modify | `src/app/workspace/page.tsx` | preferred detail 验证、Memory 动作、方向守卫与 sourceAssetId 分析接线 |
| modify | `e2e/workspace-evidence-guided-render-loop.spec.ts` | 增加 AC-04/06/07 首选、Memory 与新参考场景 |

## 实现规格

### 前端部分

#### 1. preferred 有效性与窗口外状态

- preferred 只在用户明确操作时写入 Workspace v5；使用 Iteration detail 验证当前用户可访问、相同 analysisTaskId、completed 且有 resultAssetId，不依赖当前 completed 五条窗口。
- 有效但滚出 rail：保留 ID，显示“首选已在 Iteration Memory”与打开详情；无效/不可访问才清除并说明原因。selected 与 preferred 始终独立。

#### 2. 既有 Style Memory 写点

- 无 currentTemplateId：从 preferred detail 打开 `SaveStyleMemoryDialog`，预选完成结果作为代表结果。
- 有 currentTemplateId：打开轻量代表结果确认，调用既有 `POST /api/templates/[id]/representative-result`。
- 服务端既有写点继续校验完成状态、resultAssetId、用户与来源关系；失败保留 preferred 和当前草稿，允许主动重试。客户端不得写 verification status。
- 仅在服务端返回成功后执行统一 `refreshCommittedMemoryWrite(memoryId, analysisTaskId)`：失效并回读 `templates` 列表前缀、`style-memory-detail/{memoryId}`、该 Memory 的 representative candidates，以及 `direction-iterations/{analysisTaskId}`。候选当前由组件本地加载，实施时必须接入可显式 refetch/invalidate 的唯一 owner，不得另建第二份候选缓存。
- 成功刷新完成后再让 Workspace/详情展示新代表结果、派生验证状态和方向动作；禁止客户端乐观伪造验证状态。若写入已成功但任一回读失败，显示“已保存，刷新失败”并只重试读取，不重复 POST，也不回滚服务端事实；写入失败则不执行任何成功失效链路。

#### 3. 结果作为新参考

- 只允许 completed 且有 resultAssetId 的当前用户结果；方向切换守卫比较 Prompt、negative constraints、generation params 与当前来源。
- 有未完成内容时说明将切换的内容；取消零写入并还原焦点。确认后清当前方向瞬时 selected/preferred，pace 重置 analyze_edit，调用 `/api/analysis {sourceAssetId}`。
- 服务端元数据由 plan-03 派生；前端不传 fileUrl/尺寸/MIME，不下载/上传/复制。旧方向任务保持不变，可从 Iteration Memory 找回。

#### 4. 成功后缓存一致性

- `SaveStyleMemoryDialog` 的 create 成功与 `RepresentativeResultSelector` 的 update 成功都回调同一刷新协调器；列表、详情、候选和方向 feed 的 query key/显式 refetch owner 必须唯一。
- E2E mock 分别记录四类回读：成功响应后无需页面刷新即可看到新代表结果/验证状态，候选重新加载，方向 rail 动作与 preferred 状态保持一致；部分回读失败时只出现读取重试，不发送第二次写请求。

#### 5. E2E-TDD

- 扩展主 spec：设置/更换首选；首选滚出 rail 仍有效；无效 detail 清理；无来源 Memory 保存预选；有来源 Memory 更新代表结果；写成功后四类回读与即时可见；部分刷新失败只重试读取；设置首选不改变验证状态；新参考取消/确认、零复制与旧方向可回溯。

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | red：首选/Memory/新参考 E2E | frontend | done | AC-04/06/07（证据 docs/e2e/evidence/plan-06-e2e-red-20260901.md） |
| 2 | 实现 preferred detail 验证与窗口外状态 | frontend | done | 不依赖 rail window；点击写入后经 detail 验证，结构性无效才清除 |
| 3 | 复用 SaveStyleMemoryDialog 预选入口 | frontend | done | 不改变第 14 期语义（defaultRepresentative 仅工作台入口传 true） |
| 4 | 复用代表结果确认入口 | frontend | done | 失败保留状态；候选迁移到 query-key 唯一 owner |
| 5 | 实现 Memory 写成功后的统一刷新协调器 | frontend | done | 列表/详情/候选/direction feed 回读；刷新失败不重复写入（throwOnError 据实判失败） |
| 6 | 实现方向切换守卫与 sourceAssetId 接线 | frontend | done | 取消零写入、确认新方向（复用 ReplaceConfirmDialog 骨架） |
| 7 | 补组件与回归测试 | frontend | done | Memory 存量 spec 不红，覆盖成功/部分刷新失败 |
| 8 | green：E2E/fast gate | frontend | done | 三 spec 76/76、verify:fast 全过；green evidence 交由 test-e2e 保存 |

## 验收标准

### 功能验收

- [x] AC-06 selected 与 preferred 分开显示；新结果不自动成为 preferred。
- [x] AC-06 preferred 滚出五条 completed 后仍按 detail 有效并链接 Iteration Memory；只有详情无效才清除。
- [x] AC-06 设置/更换 preferred 不改变任何 Memory 验证状态；保存/更新进入既有确认并预选结果，确认后才更新。
- [x] AC-06 Memory create/update 成功后自动回读列表、详情、representative candidates 和当前 direction feed；无需整页刷新即可看到服务端返回的新代表结果、验证状态与方向动作。
- [x] AC-06 写入成功但回读部分失败时，不回滚或重复 POST；页面明确“已保存，刷新失败”并只提供读取重试。写入失败时不执行成功缓存失效，也不乐观伪造状态。
- [x] AC-07 作为新参考前检测未完成内容；取消保持全部状态与焦点，确认后复用同一 Asset 开启 analyze_edit 新方向。
- [x] AC-04 新方向创建后旧方向与全部 Iteration 仍可从完整历史打开，未复制图片资产。
- [x] Memory 保存/代表结果失败保留 preferred、Prompt、参数与调整，可主动重试。
- [x] E2E-TDD：主 spec 首选/Memory/新参考场景先 red 后 green，且第 14 期 Style Memory targeted specs 不回退。

### 降级回归验收（架构 §8.2）

- [x] L2 preferred 详情或图片失败显示打开 Iteration/重试，不显示假图。
- [x] L5 API/R2 不可用时方向切换不声称成功，原草稿与旧方向保持。
- [x] `pnpm verify:fast` 通过。

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/direction-result-rail.test.tsx src/components/iterations/__tests__/save-style-memory-dialog.test.tsx src/components/style-memory/__tests__/representative-result-selector.test.tsx
pnpm e2e -- e2e/workspace-evidence-guided-render-loop.spec.ts e2e/style-memory-save-flows.spec.ts e2e/style-memory-detail.spec.ts --project=workspace
pnpm verify:fast
```

## 交接上下文

- **架构章节**: §6.6、§6.7、ADR-6、§3.2 首选窗口外/新参考分支
- **相关代码**: `src/components/iterations/save-style-memory-dialog.tsx`、`src/components/style-memory/representative-result-selector.tsx`、`src/app/workspace/page.tsx`
- **契约 / 数据对象**: `preferredIterationId`、Iteration detail、`sourceAssetId`、`currentTemplateId`
- **下游消费方**: plan-07

## 风险与边界

- **执行顺序**: red → preferred 验证 → Memory 入口 → 新参考守卫 → green。
- **验证失败排查方向**: rail window 与 detail cache 混用、sourceTemplate 关联校验、方向重置误清旧任务、焦点恢复。
- **允许修改的额外文件**: `src/components/iterations/replace-confirm-dialog.tsx` 及其测试（仅复用方向切换确认骨架，不新增第二套弹层）。
- **暂停条件**: 既有 Memory 端点无法表达预选代表结果，或 sourceAssetId 必须复制资产才能分析。
- **E2E 不适用说明**: 不适用；本功能是用户可观察结果治理闭环。
- **风险备注**: preferred 不写 templates；任何验证状态变化仍由第 14 期服务端规则派生。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| preferred 滚出五条窗口 | detail 有效则保留并提示 Iteration Memory | done |
| preferred task failed/无资产/不同方向 | 清除 ID 并说明无效原因 | done |
| Memory 更新接口失败 | 保留 preferred 和草稿，不失效成功缓存，允许主动重试写入 | done |
| Memory 写成功但部分回读失败 | 保留服务端成功事实，提示“已保存，刷新失败”，只重试读取且不重复 POST | done |
| 当前有未完成 adjustment 切新参考 | 先确认；取消零写入 | done |
| sourceAssetId 越权/失效 | 保留原方向并展示稳定错误 | done |
