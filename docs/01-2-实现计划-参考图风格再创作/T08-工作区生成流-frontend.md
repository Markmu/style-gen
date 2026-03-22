---
task_id: "T08"
title: "工作区-生成与对比流"
dimension: frontend
phase: 3
status: done
depends_on: ["T05", "T07"]
---

# T08: 工作区-生成与对比流（前端）

## 任务概要

- **目标**: 实现工作区页面的生成触发、生成进度、结果展示、参考图与结果对比以及迭代生成流程
- **依赖**: T05（Generation API 可用）、T07（工作区上传与分析流已实现，状态机已就绪）
- **所属模块**: 工作区（ui）
- **前置条件**: 工作区状态机已实现（T07）；POST /api/generation、GET /api/generation/:id 可用
- **不在范围**: 风格强度滑杆（P1）、主体替换（P1）、批量生成

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/hooks/use-generation.ts` | 生成任务轮询 Hook |
| create | `src/components/workspace/generate-panel.tsx` | 生成控制面板（参数 + 按钮） |
| create | `src/components/workspace/generation-progress.tsx` | 生成进度展示 |
| create | `src/components/workspace/result-display.tsx` | 生成结果图展示 |
| create | `src/components/workspace/comparison-view.tsx` | 参考图与结果对比视图 |
| modify | `src/app/workspace/page.tsx` | 集成生成相关组件到右栏 |
| modify | `src/hooks/use-workspace-state.ts` | 补充 generating/generation_ready 状态转换逻辑 |

## 实现规格

### 1. 生成轮询 Hook（use-generation.ts）

使用 React Query 的 `useQuery` + `refetchInterval` 实现轮询：

```typescript
function useGeneration(taskId: string | null): {
  data: GenerationTaskWithResult | null;
  isPolling: boolean;
  error: Error | null;
}
```

- 轮询间隔：3 秒（架构 4.3）
- 当 status 为 completed 或 failed 时停止轮询

### 2. 生成控制面板（generate-panel.tsx）

- **生成参数选择**：
  - 宽高比选择器：1:1、4:3、16:9、3:4、9:16（下拉或按钮组）
  - 质量选择：standard / hd（开关或按钮组）
- **生成按钮**：
  - analysis_ready 状态：显示"生成图片"
  - generation_ready 状态：显示"重新生成"
  - generating 状态：禁用，显示"生成中..."
- 点击生成时：
  1. 调用 POST /api/generation，传入当前 promptText、negativePromptText 和参数
  2. 将状态切换为 generating
  3. 开始轮询生成任务状态

### 3. 生成进度（generation-progress.tsx）

- generating 状态：显示加载动画 + "正在生成图片..."
- 可展示耗时计时器
- 提示用户预计等待时间（10-60 秒）

### 4. 结果图展示（result-display.tsx）

- generation_ready 状态：展示生成的结果图
- 图片可点击放大查看
- 显示使用的 Prompt（快照）和参数信息
- 失败时：显示错误信息和"重试"按钮

### 5. 对比视图（comparison-view.tsx）

- 并排展示参考图（左）和生成结果图（右）
- 支持滑动对比模式（可选，滑块在两图之间）
- 显示图片尺寸信息
- 架构 4.1："生成完成后默认进入对比视图"

### 6. 迭代流程

从 generation_ready 状态继续迭代：

1. 用户修改 Prompt 编辑器中的内容（T07 的 prompt-editor.tsx）
2. 用户点击"重新生成"按钮
3. 以修改后的 Prompt 创建新的生成任务
4. 状态从 generation_ready → generating
5. 不重跑分析（架构 4.2 "生成后继续迭代"分支）

### 7. 集成到工作区页面

在 T07 的 `workspace/page.tsx` 右栏中，Prompt 编辑器下方添加：
- 生成控制面板
- 生成进度（generating 时显示）
- 结果展示 + 对比视图（generation_ready 时显示）

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 实现生成轮询 Hook | done | use-generation.ts（React Query） |
| 2 | 实现生成控制面板 | done | generate-panel.tsx：参数选择 + 生成按钮 |
| 3 | 实现生成进度组件 | done | generation-progress.tsx |
| 4 | 实现结果图展示组件 | done | result-display.tsx |
| 5 | 实现对比视图组件 | done | comparison-view.tsx：参考图 vs 结果图 |
| 6 | 集成到工作区页面 | done | 在 page.tsx 中接入生成相关组件 |
| 7 | 实现迭代生成流程 | done | 编辑 Prompt → 重新生成 → 新结果 |

## 验证命令

```bash
pnpm type-check
pnpm build
pnpm dev
# 浏览器验证完整流程：
# 1. 上传参考图 → 分析完成 → 看到配方和 Prompt
# 2. 设置生成参数，点击"生成图片"
# 3. 看到生成进度动画
# 4. 生成完成后看到结果图
# 5. 默认进入对比视图（参考图 vs 结果图）
# 6. 修改 Prompt，点击"重新生成"，看到新结果
# 7. 生成失败时看到错误信息和重试按钮
```

## 预期结果

- 生成参数可选择，生成按钮状态正确
- 生成进度显示正常，轮询间隔 3 秒
- 生成完成后展示结果图和对比视图
- 迭代流程可走通：修改 Prompt → 重新生成 → 新结果替换旧结果
- 生成失败时保留 Prompt 和参数，支持重试

## 交接上下文

- **架构章节**: 4.1 主流程（生成 → 对比 → 迭代）、4.2 关键分支（生成后继续迭代）、4.3 状态机（generating, generation_ready）
- **相关代码**: `src/app/workspace/page.tsx`（T07 创建）、`src/hooks/use-workspace-state.ts`（T07 创建）、`src/components/workspace/prompt-editor.tsx`（T07 创建）
- **契约 / 数据对象**: GenerationTask, GenerationParams
- **消费的上游契约摘要**:

```typescript
// POST /api/generation
// Request: { analysisTaskId, promptText, negativePromptText, params: { aspectRatio, quality } }
// Response: { id: string; status: "pending" }

// GET /api/generation/:id
// Response: GenerationTask & { resultFileUrl: string | null }
```

## 执行指引

- **工具链**: React, React Query, Next.js, Tailwind CSS
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 需要 T07 的工作区页面和状态机已就绪；如 T05 API 未就绪，可用 mock 数据先开发 UI
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 Generation API 返回格式、React Query 轮询配置、状态机流转是否正确
- **允许修改的额外文件**: `src/app/workspace/page.tsx`（集成生成相关组件）、`src/hooks/use-workspace-state.ts`（补充 generating/generation_ready 状态逻辑）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 对比视图的滑动模式是增强体验，首版可先做简单并排对比，后续迭代滑动效果
- 生成耗时较长（10-60 秒），进度展示的用户体验需要关注，避免用户以为卡死
- 迭代生成不重跑分析是核心规则，确保状态机正确实现
