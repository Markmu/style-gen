---
feat_id: "PLAN-04"
title: "历史条与回溯"
dimension: frontend
phase: 3
status: done
depends_on: ["PLAN-01", "PLAN-03"]
---

# PLAN-04: 历史条与回溯

## 功能概要

- **目标**: 创建 HistoryStrip（底部横向缩略图条）和 HistoryDetailDialog（历史详情弹窗），替换现有 GenerateHistoryBar，完成历史回溯闭环。
- **完成后可观察结果**: 底部显示横向历史缩略图条（左侧"History"标题 + 48×48 圆角缩略图横向排列 + 右侧"查看全部"按钮），每次生成完成后左侧自动新增一条缩略图。点击缩略图弹出详情弹窗，展示结果图 + Prompt 快照 + 参数。点击"恢复到工作台"将历史状态还原到三列卡片中，顶部切换到 Editing 高亮。生成历史条不再包含生成参数和生成按钮（已由 FloatingGenerateButton 接管）。
- **依赖**: PLAN-01（三列骨架）
- **关联验收标准**: [AC-06]
- **涉及架构模块**: HistoryStrip, HistoryDetailDialog, GenerateHistoryBar（替换）
- **前置条件**: 三列布局已就绪，生成流程可正常工作（FloatingGenerateButton 已实现）
- **不在范围**: ReferenceCard、RecipeCard、PromptCard、FloatingGenerateButton

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/history-strip.tsx` | 底部横向缩略图条（ADR-4：纯浏览，不含生成区） |
| create | `src/components/workspace/history-detail-dialog.tsx` | 历史详情弹窗（结果图 + Prompt 快照 + 参数） |
| modify | `src/app/workspace/page.tsx` | 替换 GenerateHistoryBar 为 HistoryStrip + HistoryDetailDialog |
| create | `src/components/workspace/__tests__/history-strip.test.tsx` | 历史条组件测试 |
| create | `src/components/workspace/__tests__/history-detail-dialog.test.tsx` | 历史详情弹窗测试 |

## 实现规格

### 前端部分

#### 1. HistoryStrip

底部横向缩略图条（ADR-4：从 GenerateHistoryBar 剥离生成区，仅保留缩略图浏览）。

- 左侧"History"标题 + 图标
- 中间横向排列 48×48 圆角缩略图（支持横向滚动）
- 选中项带蓝色边框和对勾
- 右侧"查看全部"按钮
- 空态：仅显示"History"标题，无缩略图
- 限制渲染数量：最近 20 条（架构 §8.6）
- 复用现有 useHistoryList hook 的 generation-history query
- 点击缩略图调用 `onSelect(id: string)` 回调
- "查看全部"调用 `onViewAll()` 回调
- 接受 props：`historyItems: HistoryStripItem[]`、`selectedId?: string`、`onSelect`、`onViewAll`
- `data-testid="history-strip"`

#### 2. HistoryDetailDialog

历史详情弹窗。

- 展示：结果图（大图）+ Prompt 快照 + 负向提示词 + 参数（宽高比/分辨率）
- 底部两个按钮："恢复到工作台" + "关闭"
- "恢复到工作台"调用 `onRestore(id: string)` 回调
- 接受 props：`open: boolean`、`detail: HistoryDetail | null`、`onRestore`、`onClose`
- 参考现有 GenerationDialog 的弹窗结构和动画
- `data-testid="history-detail-dialog"`

#### 3. page.tsx 接线

替换 GenerateHistoryBar。

- 移除 GenerateHistoryBar 引用
- 新增 `selectedHistoryId: string | null` state 和 `historyDetailOpen: boolean` state
- HistoryStrip 接入 generation-history query 数据（复用 useHistoryList）
- HistoryStrip `onSelect` → 设置 selectedHistoryId + 打开 HistoryDetailDialog
- HistoryDetailDialog `onRestore` → 调用 handleHistoryRestore + 关闭弹窗
- HistoryStrip `onViewAll` → router.push('/history')
- 保留 GenerationDialog 用于当前生成结果展示
- 生成完成后 queryClient.invalidateQueries({ queryKey: ["generation-history"] }) 刷新历史条

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 HistoryStrip 和 HistoryDetailDialog 组件测试 | frontend | done | 覆盖空态、有数据、选中、恢复回调 |
| 2 | 创建 HistoryStrip | frontend | done | 缩略图条 + 横向滚动 + 选中态 + 20 条限制 |
| 3 | 创建 HistoryDetailDialog | frontend | done | 详情弹窗 + 结果图 + Prompt 快照 + 恢复按钮 |
| 4 | 改造 page.tsx 替换 GenerateHistoryBar | frontend | done | 移除旧组件，接入 HistoryStrip + HistoryDetailDialog |
| 5 | 清理未使用的旧组件引用 | frontend | done | 移除 GenerateHistoryBar import |
| 6 | 组件测试和构建验证 | frontend | done | pnpm test + pnpm type-check + pnpm build |

## 验收标准

### 功能验收

- [x] AC-06 底部历史条显示横向缩略图，点击弹出详情弹窗
- [x] AC-06 详情弹窗展示结果图 + Prompt 快照 + 参数
- [x] AC-06 "恢复到工作台"还原三列卡片内容，顶部切换到 Editing
- [x] AC-06 生成完成后历史条左侧自动新增缩略图
- [x] 历史条空态仅显示"History"标题，无缩略图
- [x] 历史条限制最近 20 条缩略图
- [x] "查看全部"跳转到完整历史页面
- [x] E2E-TDD：生成完成 → 历史条新增 → 点击缩略图 → 恢复到工作台（`e2e/workspace-history-strip.spec.ts`，red 先失败，green 后通过）

### 全流程验收（US 覆盖矩阵）

> 架构文档 §2.4 定义的成功标准：AC-01 ~ AC-08 全部可正常走通。

| US 编号 | 用户故事简述 | 承接功能 | 验证方式 |
| --- | --- | --- | --- |
| US-01 | 上传参考图后系统自动分析并展示视觉配方 | PLAN-01, PLAN-02 | E2E 全流程回归 |
| US-02 | 一屏看到参考图、视觉配方和提示词三列信息 | PLAN-01 | E2E 全流程回归 |
| US-03 | 顶部模式标签清楚地知道当前工作阶段 | PLAN-01 | E2E 全流程回归 |
| US-04 | 快速触发生成并查看历史结果 | PLAN-03, PLAN-04 | E2E 全流程回归 |
| US-05 | 在配方卡片中直接编辑风格描述（P2 预留） | PLAN-02 | 验证按钮显示但功能预留 |
| US-06 | 将配方内容一键复制到提示词（P2 预留） | PLAN-02 | 验证按钮显示但功能预留 |
| US-07 | 通过左侧导航快速跳转 | PLAN-01 | 导航跳转验证 |
| US-08 | 上传/分析失败时看到明确提示和重试入口 | PLAN-01, PLAN-02 | E2E 全流程回归 |

- [x] US-01 ~ US-08 全部可在三列布局下正常走通（最终集成回归）

### 性能验收（架构 §8.1 目标）

- [x] 历史 Query 缓存命中：返回工作台时历史数据可用（TanStack Query staleTime 5min）
- [x] HistoryStrip 渲染不超过 20 个缩略图 DOM 节点

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/history-strip.test.tsx src/components/workspace/__tests__/history-detail-dialog.test.tsx
pnpm type-check
pnpm build
pnpm e2e -- e2e/workspace-reference-recipe.spec.ts e2e/workspace-prompt-generate.spec.ts e2e/workspace-history-strip.spec.ts
```

## 交接上下文

- **架构章节**: §4.2（HistoryStrip, HistoryDetailDialog）, §5 ADR-4, §6.6, §7.2（HistoryStripItem, HistoryDetail）, §7.3（generation-history API）
- **相关代码**: `src/components/workspace/generate-history-bar.tsx`（被替换）、`src/components/workspace/generation-dialog.tsx`（复用）、`src/hooks/use-history-list.ts`、`src/hooks/use-history-restore.ts`
- **契约 / 数据对象**: `HistoryStripItem`、`HistoryDetail`、generation-history query
- **下游消费方**: 无（最终功能）

## 风险与边界

- **执行顺序**: 先创建 HistoryStrip 和 HistoryDetailDialog（Task 2-3），再替换 page.tsx（Task 4），最后清理旧引用（Task 5）
- **验证失败排查方向**: 检查 useHistoryList hook 返回数据格式、缩略图 URL 是否有效、恢复数据映射（HistoryDetail → useWorkspaceState）
- **允许修改的额外文件**: 无
- **暂停条件**: 如果需要修改历史查询 API 或新增端点，停止并请求确认
- **E2E 不适用说明**: 不适用，本功能有用户可观察行为
- **风险备注**: GenerateHistoryBar 被替换后可保留文件但不再引用；建议后续清理 unused 组件。FloatingGenerateWindow 已被 FloatingGenerateButton 替代但暂保留文件。

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 无历史记录 | HistoryStrip 仅显示标题，无缩略图 | done |
| 历史条目超过 20 条 | 只渲染最近 20 条，其余可"查看全部" | done |
| 恢复历史时参考图不可用 | 进入 history_restored 状态，三列卡片显示可用的数据 | done |
| 历史恢复失败 | console.error 提示错误，不阻塞工作台 | done |
| 快速连续点击缩略图 | 使用 Dialog open state 防止重复弹窗 | done |
