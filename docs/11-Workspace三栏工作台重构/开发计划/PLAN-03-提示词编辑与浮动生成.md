---
feat_id: "PLAN-03"
title: "提示词编辑与浮动生成"
dimension: frontend
phase: 2
status: done
depends_on: ["PLAN-01"]
---

# PLAN-03: 提示词编辑与浮动生成

## 功能概要

- **目标**: 实现 PromptCard 完整功能（UnifiedPromptEditor 包装 + 输出参数设置），创建 FloatingGenerateButton（浮动生成按钮 + Enter 快捷键），完成三列布局下的编辑→生成闭环。
- **完成后可观察结果**: 分析完成后 PromptCard 填充生成的提示词，用户可编辑正向/负向提示词，调整宽高比和分辨率等参数。右侧浮动生成按钮始终可见，提示词非空时可用，点击或按 Enter 触发生成。生成中按钮显示 loading 动画，完成后 GenerationDialog 弹出结果图。生成失败时顶部切回 Editing，Prompt 内容不丢失。
- **依赖**: PLAN-01（三列骨架）
- **关联验收标准**: [AC-04, AC-05]
- **涉及架构模块**: PromptCard, FloatingGenerateButton
- **前置条件**: 三列布局已就绪，PromptCard 基础壳已渲染
- **不在范围**: ReferenceCard、RecipeCard、HistoryStrip、HistoryDetailDialog

## 文件清单

### 前端维度

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/components/workspace/prompt-card.tsx` | 完整实现：编辑器 + 输出参数 + 模板集成 |
| create | `src/components/workspace/floating-generate-button.tsx` | 右侧固定浮动生成按钮 |
| modify | `src/app/workspace/page.tsx` | 接入完整 PromptCard + FloatingGenerateButton + Enter 快捷键 |
| create | `src/components/workspace/__tests__/floating-generate-button.test.tsx` | 浮动按钮组件测试 |

## 实现规格

### 前端部分

#### 1. PromptCard 完整实现

在基础壳上增加编辑器和参数设置。

- 有数据态：卡片头部（标题"Prompt" + 帮助图标 + 模型选择器 + 模板库按钮）→ 正向提示词 textarea → 负向提示词 textarea（折叠，带字符计数）→ 参数设置行（宽高比 / 分辨率 / 引导强度）→ 辅助选项开关（使用配方引导 / 增强细节）
- 复用现有 UnifiedPromptEditor 组件，外层包装 PromptCard 卡片壳
- 输出参数（aspectRatio/quality）从 FloatingGenerateWindow 迁移到 PromptCard 底部（ADR-4）
- 接受 UnifiedPromptEditor 所有相关 props：`templateContent`、`templateVariables`、`templateStatus`、`templateReason`、`templateKey`、`onResolvedPromptChange`、`onTemplateContentChange`、`onTemplateVariablesChange`、`onSaveTemplate`
- 新增 props：`params`、`onParamsChange`
- 参数设置行使用紧凑布局（icon + 下拉选择器）
- 复用现有 OutputSettings 组件的参数选项

#### 2. FloatingGenerateButton

右侧固定浮动生成按钮（ADR-4：从 GenerateHistoryBar 剥离生成区）。

- 位置：固定定位在三列卡片区域右侧，垂直居中
- 形态：蓝色圆形/胶囊，闪电图标 + "Generate" 文字，下方小字"Enter 生成"
- 4 种状态：禁用（置灰 + tooltip 提示不可用原因）、可用（蓝色）、Loading（旋转动画）、完成
- 悬停发光效果（glow）
- 接受 props：`state: WorkspaceState`、`canGenerate: boolean`、`onGenerate: () => void`
- canGenerate 由 page.tsx 计算：提示词非空 && 不在上传中 && 不在分析中 && 生成服务可用
- `data-testid="floating-generate-button"`

#### 3. Enter 快捷键监听

在 page.tsx 中实现全局键盘监听。

- 使用 `useEffect` 监听 `keydown` 事件
- 触发条件：key === "Enter" && 当前焦点不在 textarea/input 中
- 检查 canGenerate 条件后调用 handleGenerate
- 避免与 textarea 正常换行冲突

#### 4. page.tsx 接线

在 page.tsx 中接入完整编辑和生成流程。

- PromptCard 传入所有编辑器 props + 参数 props
- FloatingGenerateButton 传入 state、canGenerate、onGenerate
- canGenerate 计算：`(resolvedPromptText || ws.promptText).trim()` 非空 && ws.state 不在上传/分析/生成中 && 生成服务可用
- handleGenerate 从 FloatingGenerateButton 和 Enter 快捷键触发
- 保留现有 GenerationDialog 弹窗流程（ADR-5）
- 保留现有 GenerateHistoryBar（PLAN-04 替换）

## Task 列表

| # | Task | 维度 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| 1 | 编写 FloatingGenerateButton 组件测试 | frontend | done | 覆盖禁用/可用/loading/点击回调 |
| 2 | 完善 PromptCard 编辑器 + 参数集成 | frontend | done | 包装 UnifiedPromptEditor + 迁移 OutputSettings |
| 3 | 创建 FloatingGenerateButton | frontend | done | 浮动按钮 + 4 种状态 + glow 效果 |
| 4 | 实现全局 Enter 快捷键监听 | frontend | done | useEffect keydown 监听，排除 textarea 聚焦 |
| 5 | 改造 page.tsx 编辑生成接线 | frontend | done | 接入 PromptCard 完整 props + FloatingGenerateButton + canGenerate |
| 6 | 组件测试和构建验证 | frontend | done | pnpm test + pnpm type-check + pnpm build |

## 验收标准

### 功能验收

- [x] AC-04 PromptCard 填充生成的提示词，用户可编辑正向和负向提示词
- [x] AC-04 参数设置（宽高比/分辨率/引导强度）嵌入 PromptCard 底部
- [x] AC-04 模板模式下变量编辑正常工作
- [x] AC-05 右侧 FloatingGenerateButton 始终可见，提示词非空时可用
- [x] AC-05 点击 Generate 或按 Enter 触发生成，GenerationDialog 弹出结果图
- [x] AC-05 生成中按钮显示 loading 动画，完成后按钮恢复可用
- [x] AC-05 生成失败时顶部切回 Editing，Prompt 内容不丢失，按钮恢复可用
- [x] E2E-TDD：编辑提示词 → 点击生成 → 结果展示（`e2e/workspace-prompt-generate.spec.ts`，red 先失败，green 后通过）

### 性能验收（架构 §8.1 目标）

- [x] 浮动按钮渲染不引起三列布局重排（fixed 定位脱离文档流）

## 验证命令

```bash
pnpm vitest --run src/components/workspace/__tests__/floating-generate-button.test.tsx
pnpm type-check
pnpm build
```

## 交接上下文

- **架构章节**: §4.2（PromptCard, FloatingGenerateButton）, §5 ADR-4, ADR-5, §6.4, §6.5, §7.4（GenerateButton 列）
- **相关代码**: `src/components/workspace/prompt-card.tsx`、`src/components/workspace/unified-prompt-editor.tsx`、`src/components/workspace/output-settings.tsx`、`src/components/workspace/floating-generate-window.tsx`
- **契约 / 数据对象**: `AspectRatio`、`Quality`、`GenerationParams`、`canGenerate` 计算逻辑
- **下游消费方**: PLAN-04 的 HistoryStrip 新增缩略图记录依赖生成完成事件（queryClient.invalidateQueries）

## 风险与边界

- **执行顺序**: 先完善 PromptCard（Task 2），再创建 FloatingGenerateButton（Task 3），再接 Enter 快捷键（Task 4），最后改 page.tsx（Task 5）
- **验证失败排查方向**: 检查 canGenerate 条件计算、UnifiedPromptEditor props 传递、floating 定位 z-index、Enter 键与 textarea 聚焦冲突
- **允许修改的额外文件**: `src/app/globals.css`（浮动按钮样式）
- **暂停条件**: 如果需要修改生成 API 或新增后端接口，停止并请求确认
- **E2E 不适用说明**: 不适用，本功能有用户可观察行为
- **风险备注**: OutputSettings 从 FloatingGenerateWindow 迁移到 PromptCard 后，FloatingGenerateWindow 暂时保留但不再引用；GenerateHistoryBar 暂时保留，PLAN-04 阶段替换为 HistoryStrip

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 提示词为空 | FloatingGenerateButton 禁用，tooltip 提示原因 | done |
| 正在分析中 | FloatingGenerateButton 禁用 | done |
| L1 排队提示（轮询 >60s） | FloatingGenerateButton 保持可用态，排队提示由 GenerationDialog 承载（复用现有 degradation 机制） | done |
| 生成服务不可用（L2 降级） | FloatingGenerateButton 禁用 + 提示 | done |
| textarea 聚焦时按 Enter | 不触发生成，保留正常换行行为 | done |
| 生成失败 | 切回 Editing，Prompt 不丢失，按钮恢复可用 | done |
| 模板模式下提示词含未解析变量 | canGenerate 为 false，阻止生成 | done |
