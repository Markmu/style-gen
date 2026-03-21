---
task_id: "T07"
title: "工作区-上传与分析流"
dimension: frontend
phase: 3
status: ready-to-dev
depends_on: ["T03", "T04"]
---

# T07: 工作区-上传与分析流（前端）

## 任务概要

- **目标**: 实现工作区页面的上传和分析展示流程，包括预签名 URL 上传、分析进度轮询、结构化配方展示和 Prompt 编辑器
- **依赖**: T03（Upload API 可用）、T04（Analysis API 可用）
- **所属模块**: 工作区（ui）
- **前置条件**: API 端点 POST /api/upload/presign、POST /api/analysis、GET /api/analysis/:id 已可用
- **不在范围**: 图片生成、结果对比、迭代生成（属于 T08）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/app/workspace/page.tsx` | 工作区主页面 |
| create | `src/hooks/use-workspace-state.ts` | 工作区状态机 |
| create | `src/hooks/use-upload.ts` | 预签名 URL 上传 Hook |
| create | `src/hooks/use-analysis.ts` | 分析任务轮询 Hook |
| create | `src/components/workspace/upload-zone.tsx` | 上传区域组件 |
| create | `src/components/workspace/analysis-progress.tsx` | 分析进度展示 |
| create | `src/components/workspace/recipe-card.tsx` | 结构化配方展示卡片 |
| create | `src/components/workspace/prompt-editor.tsx` | Prompt 编辑器 |

## 实现规格

### 1. 工作区状态机（use-workspace-state.ts）

严格对齐架构 4.3 定义的前端状态机：

```typescript
type WorkspaceState = 'idle' | 'uploading' | 'analyzing' | 'analysis_ready' | 'generating' | 'generation_ready';

interface WorkspaceContext {
  state: WorkspaceState;
  referenceImageUrl: string | null;   // 参考图 URL
  assetId: string | null;
  analysisTaskId: string | null;
  recipe: VisualRecipe | null;
  promptText: string;                  // 可编辑
  negativePromptText: string;          // 可编辑
  generationTaskId: string | null;
  resultImageUrl: string | null;
  error: { message: string; stage?: string } | null;
}
```

状态流转规则：
- `idle → uploading`：开始上传
- `uploading → analyzing`：上传完成，自动触发分析
- `analyzing → analysis_ready`：分析完成
- `analysis_ready → generating`：用户点击生成（T08 处理）
- `generating → generation_ready`：生成完成（T08 处理）
- `generation_ready → generating`：用户修改 Prompt 后再次生成（T08 处理）
- 任意状态 → `error`：错误回退到上一个稳定状态

关键规则（架构 4.3）：
- error 不清空已有稳定结果
- generation_ready 后编辑不重跑分析
- 同一步骤只保留一个有效任务

### 2. 预签名上传 Hook（use-upload.ts）

```typescript
function useUpload(): {
  upload: (file: File) => Promise<{ assetId: string; fileUrl: string }>;
  progress: number;
  isUploading: boolean;
}
```

流程：
1. 调用 POST /api/upload/presign 获取 presignedUrl、fileUrl、assetId
2. 使用 presignedUrl 直接 PUT 上传到 R2
3. 返回 assetId 和 fileUrl

### 3. 分析轮询 Hook（use-analysis.ts）

使用 React Query 的 `useQuery` + `refetchInterval` 实现轮询：

```typescript
function useAnalysis(taskId: string | null): {
  data: AnalysisTask | null;
  isPolling: boolean;
  error: Error | null;
}
```

- 轮询间隔：2 秒（架构 4.3）
- 当 status 为 completed 或 failed 时停止轮询
- 分析完成后自动从返回数据中提取 recipe、promptText、negativePromptText

### 4. 上传区域（upload-zone.tsx）

- 两种入口：
  a. 从首页带过来的文件（通过全局状态，T06 实现）→ 自动开始上传
  b. 工作区内选择/拖拽新文件
- 上传中显示进度条
- 上传完成后展示参考图预览
- 支持"替换参考图"操作（清空当前分析和生成结果，重新上传）

### 5. 分析进度（analysis-progress.tsx）

- analyzing 状态：显示加载动画 + "AI 正在分析图片风格..."
- 可展示分析耗时计时器
- 失败时：显示错误信息（区分 vision/llm 阶段）和重试按钮

### 6. 结构化配方展示（recipe-card.tsx）

展示 VisualRecipe 的关键字段，分区域呈现：

- **主体与场景**：subject, scene, imageSummary
- **构图与镜头**：composition, cameraLanguage
- **光照与色彩**：lighting, color
- **质感与风格**：texture, styleTags, mood
- **关键词**：visualKeywords
- **保留/可替换**：mustKeep, replaceable

每个字段展示为只读标签/卡片形式，首版不支持直接编辑配方字段（用户通过编辑 Prompt 间接修改）。

### 7. Prompt 编辑器（prompt-editor.tsx）

- Prompt 文本域：多行编辑，初始值来自分析结果的 promptText
- Negative Prompt 文本域：多行编辑，初始值来自 negativePromptText
- 编辑状态实时同步到 WorkspaceContext
- 不重跑分析，仅更新前端状态

### 8. 工作区页面布局（page.tsx）

左右分栏布局：
- **左栏**：参考图展示（上传区域 / 图片预览）
- **右栏**：分析结果（配方卡片 + Prompt 编辑器）+ 生成按钮（T08 实现）

移动端：上下堆叠布局。

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 实现工作区状态机 | todo | use-workspace-state.ts |
| 2 | 实现预签名上传 Hook | todo | use-upload.ts |
| 3 | 实现分析轮询 Hook | todo | use-analysis.ts（React Query） |
| 4 | 实现上传区域组件 | todo | upload-zone.tsx：拖拽/点击 + 进度 + 预览 |
| 5 | 实现分析进度组件 | todo | analysis-progress.tsx |
| 6 | 实现配方展示卡片 | todo | recipe-card.tsx：VisualRecipe 各字段展示 |
| 7 | 实现 Prompt 编辑器 | todo | prompt-editor.tsx：双文本域 |
| 8 | 组装工作区页面 | todo | page.tsx：左右分栏布局 + 状态驱动渲染 |
| 9 | 联调上传→分析自动触发 | todo | 上传完成后自动调用分析 API |

## 验证命令

```bash
pnpm type-check
pnpm build
pnpm dev
# 浏览器访问 http://localhost:3000/workspace，验证：
# 1. 可拖拽或点击上传图片
# 2. 上传后自动触发分析
# 3. 分析中展示进度动画
# 4. 分析完成后展示配方卡片和 Prompt
# 5. Prompt 可编辑
# 6. 从首页选择图片后跳转到工作区，自动开始上传
```

## 预期结果

- 工作区页面正常渲染，左右分栏布局
- 上传 → 分析 → 展示配方 + Prompt 全链路可走通
- 分析失败时展示错误信息和阶段标识
- Prompt 编辑器可自由编辑，不触发重新分析
- 替换参考图后清空结果，重新开始

## 交接上下文

- **架构章节**: 4.1 主流程、4.2 关键分支、4.3 工作区前端状态机
- **相关代码**: T03（POST /api/upload/presign）、T04（POST /api/analysis, GET /api/analysis/:id）
- **契约 / 数据对象**: VisualRecipe, AnalysisTask
- **消费的上游契约摘要**:

```typescript
// POST /api/upload/presign → { presignedUrl, fileUrl, assetId }
// POST /api/analysis → AnalysisTask（含 recipe, promptText, negativePromptText）
// GET /api/analysis/:id → AnalysisTask（轮询用）
```

## 执行指引

- **工具链**: React, React Query, Next.js App Router, Tailwind CSS
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 后端 API 未就绪时暂停并报告；可使用 mock 数据先开发 UI 组件
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 API 端点地址、React Query 配置、状态机流转逻辑、R2 CORS 配置（影响前端直传）
- **允许修改的额外文件**: `src/components/providers.tsx`（如需调整 React Query 配置）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- R2 的 CORS 配置需允许浏览器 PUT 请求，否则前端直传会被拦截，这不是代码问题而是 R2 Bucket 配置问题
- 首页到工作区的文件传递依赖 T06 中创建的全局状态
- 状态机是工作区的核心，所有 UI 组件的显隐和行为都由状态驱动
