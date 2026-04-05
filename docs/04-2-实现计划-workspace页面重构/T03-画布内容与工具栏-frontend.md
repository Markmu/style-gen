---
task_id: "T03"
title: "画布内容与工具栏"
dimension: frontend
phase: 2
status: done
depends_on: ["T01"]
---

# T03: 画布内容与工具栏（前端）

## 任务概要

- **目标**: 创建 WorkspaceCanvas 统一画布组件，内部根据 canvasView 派生状态切换子视图（空态上传区/参考图主视图/结果图主视图/对比视图）；创建 CanvasToolbar（画布工具栏）和 StyleTagBar（风格标签）；将画布集成到 page.tsx 左栏
- **依赖**: T01（两段式布局骨架就位）
- **所属模块**: WorkspaceCanvas / CanvasToolbar / StyleTagBar
- **前置条件**: T01 完成，page.tsx 已有两栏布局
- **不在范围**: 降级提示（T04）、决策面板内容（T02）、测试迁移（T05）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/workspace-canvas.tsx` | 统一画布组件 |
| create | `src/components/workspace/canvas-toolbar.tsx` | 画布工具栏（结果图/对比/下载） |
| create | `src/components/workspace/style-tag-bar.tsx` | 画布底部风格标签 |
| modify | `src/app/workspace/page.tsx` | 左栏 placeholder 替换为 WorkspaceCanvas |

## 实现规格

### 1. CanvasView 派生计算

在 WorkspaceCanvas 内部实现 canvasView 派生逻辑（不存储为独立状态）：

```typescript
type CanvasView = "upload" | "reference" | "result" | "comparison";

function deriveCanvasView(
  state: WorkspaceState,
  referenceImageUrl: string | null,
  resultImageUrl: string | null,
): CanvasView {
  if (!referenceImageUrl) return "upload";
  if (resultImageUrl && state === "generation_ready") return "result";
  return "reference";
}
```

对比视图通过 CanvasToolbar 的按钮手动切换，使用组件内部 `useState` 管理（仅在 `generation_ready` 时可用）。

### 2. WorkspaceCanvas (`workspace-canvas.tsx`)

```typescript
interface WorkspaceCanvasProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  resultImageUrl: string | null;
  recipe: VisualRecipe | null;
  isUploading: boolean;
  uploadProgress: number;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
}
```

实现要点：

- 根据 `deriveCanvasView` 结果切换子视图，视图切换使用 CSS transition，duration ≤ 200ms（架构 §8.1）：
  - **upload**: 渲染 `UploadZone`（直接复用，props 不变）
  - **reference**: 渲染参考图主视图 — 图片展示 + 底部 StyleTagBar（分析完成后）
  - **result**: 渲染结果图主视图 — 结果图展示 + CanvasToolbar
  - **comparison**: 渲染对比视图 — 左右分栏（参考图 | 结果图）+ CanvasToolbar
- `uploading` 状态下渲染 UploadZone 的上传进度视图
- `analyzing` 状态下在参考图上方/下方展示分析中的视觉反馈（如 skeleton 动画或 overlay）
- 图片展示使用 `next/image` 组件，`unoptimized` 属性（与现有一致）
- 画布整体使用 `rounded-xl bg-[var(--surface-mid)] ring-1 ring-[var(--border)]` 样式包裹
- 参考图和结果图展示区域设置合理的 max-height 和 object-contain，保证大图不超出

### 3. CanvasToolbar (`canvas-toolbar.tsx`)

仅在 `generation_ready` 状态且 `resultImageUrl` 存在时显示。

```typescript
interface CanvasToolbarProps {
  resultImageUrl: string;
  referenceImageUrl: string;
  activeView: "result" | "comparison";
  onViewChange: (view: "result" | "comparison") => void;
}
```

实现要点：

- 水平排列三个操作：
  - "结果图"按钮：切换 activeView 为 `result`
  - "对比查看"按钮：切换 activeView 为 `comparison`
  - "下载"按钮：`<a href={resultImageUrl} download>` 触发下载
- 使用 toggle 样式区分当前 activeView
- 工具栏位于画布内部顶部，使用半透明背景 `bg-[var(--surface-base)]/80 backdrop-blur-sm`
- 吸收现有 `ResultDisplay` 的下载和 `ComparisonView` 的对比功能

### 4. StyleTagBar (`style-tag-bar.tsx`)

纯展示组件，在参考图下方展示风格标签。

```typescript
interface StyleTagBarProps {
  recipe: VisualRecipe;
}
```

实现要点：

- 使用架构文档 §7.2 `extractStyleTags` 逻辑：
  - 优先从 `recipe.styleTags` 取前 5 个
  - 不足 3 个时从核心字段（subject / mood / color）补充
- `StyleTag` 接口在本组件文件内部定义（仅此组件消费），含 `label: string` 和 `sourceField: string`
- 标签使用 pill 样式：`rounded-full bg-[var(--surface-bright)] px-2.5 py-0.5 text-xs`
- 水平排列，flex-wrap
- 仅在 recipe 存在且分析完成后展示（由 WorkspaceCanvas 控制条件）

### 5. 对比视图

吸收现有 `ComparisonView` 的对比能力为 WorkspaceCanvas 内部模式：

- 左右分栏对比（参考图 | 结果图）
- 复用 ComparisonView 的自适应布局逻辑（横版并排/竖版堆叠）
- 不改变面板状态，仅影响画布内部视图

### 6. page.tsx 更新

- 将左栏 placeholder 替换为 `<WorkspaceCanvas />`
- 传递所有必需 props
- 移除 page.tsx 中已下沉到 WorkspaceCanvas 的渲染逻辑（UploadZone 直接渲染、ComparisonView 渲染、ResultDisplay 渲染等）

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 StyleTagBar 组件 | done | extractStyleTags 逻辑 + pill 标签展示 |
| 2 | 创建 CanvasToolbar 组件 | done | 结果图/对比/下载三个操作 |
| 3 | 创建 WorkspaceCanvas 组件 | done | canvasView 派生 + 四种子视图切换 + 集成 UploadZone/CanvasToolbar/StyleTagBar |
| 4 | 更新 page.tsx | done | 左栏引入 WorkspaceCanvas，移除已下沉的渲染逻辑 |
| 5 | 验证编译和类型检查 | done | `pnpm type-check && pnpm build` 通过 |

## 验证命令

```bash
pnpm type-check && pnpm lint && pnpm build
```

## 预期结果

1. 空态下画布展示 UploadZone（点击/拖拽上传）
2. 上传完成后画布展示参考图 + 分析完成后底部 StyleTagBar
3. 生成完成后画布切换为结果图 + 顶部 CanvasToolbar
4. 点击 CanvasToolbar "对比查看"可切换为左右分栏对比
5. 点击 CanvasToolbar "下载"可下载结果图
6. 所有图片正确展示，不超出画布区域

## 交接上下文

- **架构章节**: ADR-2（统一画布）、§5.2（WorkspaceCanvas / CanvasToolbar / StyleTagBar 职责）、§7.2（CanvasView / extractStyleTags）
- **相关代码**: `src/components/workspace/upload-zone.tsx`（直接复用）、`src/components/workspace/comparison-view.tsx`（对比逻辑参考）、`src/components/workspace/result-display.tsx`（下载/放大逻辑参考）
- **契约 / 数据对象**: `CanvasView`、`WorkspaceState`、`VisualRecipe`、`StyleTag`
- **提供给下游的契约摘要**:

```typescript
// WorkspaceCanvas props
interface WorkspaceCanvasProps {
  state: WorkspaceState;
  referenceImageUrl: string | null;
  resultImageUrl: string | null;
  recipe: VisualRecipe | null;
  isUploading: boolean;
  uploadProgress: number;
  onFileSelected: (file: File) => void;
  onReplace: () => void;
}

// CanvasToolbar props
interface CanvasToolbarProps {
  resultImageUrl: string;
  referenceImageUrl: string;
  activeView: "result" | "comparison";
  onViewChange: (view: "result" | "comparison") => void;
}
```

## 执行指引

- **工具链**: pnpm, React 19, next/image, Tailwind CSS 4
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 next/image 的 unoptimized 属性、检查 UploadZone 的 props 是否完整传递、检查 CSS grid 对比视图布局
- **允许修改的额外文件**: `src/components/workspace/upload-zone.tsx`（仅在 props 接口不兼容时最小调整）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- UploadZone 内部有"替换参考图"确认对话框逻辑，在 WorkspaceCanvas 中复用时需确保 onReplace 回调正确传递
- 对比视图从独立 ComparisonView 降级为画布内部模式时，需保留自适应布局逻辑（横版并排/竖版堆叠）
- 结果图展示需保留现有 ResultDisplay 的全屏放大功能（点击图片放大查看）

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 大尺寸图片展示 | 使用 object-contain + max-height 限制，不超出画布 | done |
| recipe 为 null 时 StyleTagBar | 不渲染 StyleTagBar，由 WorkspaceCanvas 控制 | done |
| 对比视图下切换回结果图 | CanvasToolbar activeView 状态切换，画布内容响应 | done |
| generation_ready 状态下更换参考图 | 点击 StatusBar "更换参考图"→ reset → canvasView 回到 upload | done |
| 下载按钮网络异常 | `<a download>` 标签的浏览器原生行为，不需要额外处理 | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
