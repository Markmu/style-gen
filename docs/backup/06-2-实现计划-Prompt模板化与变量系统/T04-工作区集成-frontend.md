---
task_id: "T04"
title: "工作区集成"
dimension: frontend
phase: 2
status: done
depends_on: ["T02", "T03"]
---

# T04: 工作区集成（前端）

## 任务概要

- **目标**: 将模板 UI 组件（T03）集成到 Workspace 页面中，添加入口按钮、管理 Drawer/Dialog 的开关状态、实现「加载模板到编辑器」的完整数据流，使 P0 五个用户故事在浏览器端端到端走通
- **依赖**: T02（API 端点就绪）、T03（UI 组件就绪）
- **所属模块**: 工作区页面 (`src/app/workspace/page.tsx`) + 模板状态管理
- **前置条件**: T02 和 T03 均已完成或 API 契约已冻结
- **不在范围**: P1 变量向导面板、布局响应式调整、E2E 测试

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/app/workspace/page.tsx` | 集成模板入口按钮、Drawer、Dialog、状态管理、布局协调 |

> 模板状态逻辑较轻量（仅 open/close + 回调），直接内联在 page.tsx 中管理，无需独立 hook 文件。

## 实现规格

### 1. 工作区页面修改范围

当前 `src/app/workspace/page.tsx` 是一个 ~490 行的单文件组件，包含三列网格布局和完整的分析→生成流程。

**本任务需要添加的内容**:

#### 1.1 新增状态变量

```typescript
// 模板相关状态（在组件顶部现有状态声明区域追加）
const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false);
const [showTemplateDrawer, setShowTemplateDrawer] = useState(false);
```

#### 1.2 入口按钮位置

根据架构 ADR-5 和 PRD D-05：

**「保存为模板」+「我的模板」按钮**:
- 位置：PromptEditor 区域上方工具栏
- 显示条件：`showPromptEditor === true`（即 state 为 analysis_ready/generation_ready/generating）

在 `showPromptEditor && <PromptEditor ... />` 之前插入工具栏：

```tsx
{/* Template action toolbar — 仅在编辑器可见时显示 */}
{showPromptEditor && (
  <div className="flex items-center justify-between mb-2">
    <span></span>
    <div className="flex gap-2">
      <button
        onClick={() => setShowTemplateSaveDialog(true)}
        className="... /* secondary button style */"
      >
        保存为模板
      </button>
      <button
        onClick={() => setShowTemplateDrawer(true)}
        className="... /* secondary button style */"
      >
        我的模板
      </button>
    </div>
  </div>
)}
```

#### 1.3 模板保存对话框集成

```tsx
<TemplateSaveDialog
  open={showTemplateSaveDialog}
  initialContent={ws.promptText}           // ADR-7: 取编辑器当前文本
  sourceAnalysisTaskId={ws.analysisTaskId} // 有活跃分析任务时传入
  onSave={(template) => {
    setShowTemplateSaveDialog(false);
    // 可选：显示 toast "模板已保存"
  }}
  onClose={() => setShowTemplateSaveDialog(false)}
/>
```

关键点：
- `initialContent` 使用 `ws.promptText`（workspace state 中的当前 prompt 文本）
- `sourceAnalysisTaskId` 在有活跃分析任务时传入

#### 1.4 模板 Drawer 集成

```tsx
<TemplateDrawer
  open={showTemplateDrawer}
  onLoadTemplate={(content) => {
    ws.setPromptText(content);  // 将模板 content 填充到编辑器
    setShowTemplateDrawer(false);
  }}
  onDeleteSuccess={(id) => {
    // Drawer 内部已从列表移除，此处可扩展日志等副作用
  }}
  onClose={() => setShowTemplateDrawer(false)}
/>
```

关键点：
- `onLoadTemplate` 直接调用 `ws.setPromptText(content)`
- 加载后自动关闭 Drawer

#### 1.5 布局协调

采用 **overlay 方案**（方案 A）：Drawer 使用 `fixed right-0 top-0 h-full z-50` 定位，作为覆盖层不改变 grid 列数。这与 ADR-5 一致。

如果 overlay 遮挡过多编辑器内容影响体验，可在执行过程中切换为方案 B（grid 扩展为 4 列）并更新本任务说明。

#### 1.6 变量格式异常警告 [架构 4.2 分支]

加载模板后，如果检测到 content 含未闭合的 `{{` 或 `}}`（简单启发式：`{{` 数量 ≠ `}}` 数量），在编辑器上方显示轻量警告条：

```tsx
{templateWarning && (
  <div className="... /* warning banner */">
    模板含未闭合的变量标记，可能影响变量替换功能
  </div>
)}
```

此警告仅在「从模板加载」后检测一次，用户修改文本后自动消失。

### 2. PromptEditor 组件是否需要修改

**评估结论**: 不需要修改。操作按钮放在 page.tsx 的工具栏层即可。

但如果后续产品要求按钮更贴近编辑器（如在标题栏内嵌），可给 PromptEditor 增加 optional 的 `actions` slot prop（本任务不做此改动）。

### 3. 状态管理策略

模板功能的状态非常轻量：
- 两个 boolean（dialog/drawer open）
- 所有数据获取和变更通过组件内部 fetch 完成
- **不需要**额外的全局状态、context 或独立 hook

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 在 `src/app/workspace/page.tsx` 中添加模板状态变量（saveDialog/drawer open） | done | |
| 2 | 在 PromptEditor 区域上方添加「保存为模板」+「我的模板」工具栏按钮 | done | 条件渲染：showPromptEditor 时显示 |
| 3 | 集成 TemplateSaveDialog 组件，传入正确的 initialContent 和回调 | done | initialContent=ws.promptText (ADR-7) |
| 4 | 集成 TemplateDrawer 组件，传入 onLoadTemplate/onDeleteSuccess 回调 | done | onLoadTemplate → ws.setPromptText |
| 5 | 实现 Drawer 的 overlay 布局（fixed 定位，z-index 管理） | done | 方案 A 覆盖层 |
| 6 | 实现加载模板后的变量格式异常警告条 | done | 未闭合标记检测 + 轻量 warning banner |
| 7 | 端到端手动验证：保存→列表→加载→删除完整循环 | done | 浏览器中走通 P0 全部用户故事 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建验证
pnpm build
```

手动验证场景（需要 `pnpm dev` + 数据库 + 有效 session）：
1. 完成分析后，编辑器区域出现「保存为模板」和「我的模板」按钮
2. 点击「保存为模板」→ 弹出对话框 → 输入名称 → 保存 → 成功提示
3. 点击「我的模板」→ Drawer 打开 → 显示刚保存的模板
4. 点击「使用」→ 编辑器内容被替换为模板 content → Drawer 关闭
5. 在 Drawer 中删除模板 → 确认对话框 → 删除成功 → 列表更新

## 预期结果

1. `pnpm type-check` 和 `pnpm build` 通过
2. Workspace 页面在分析完成后显示两个模板操作按钮
3. 「保存为模板」→ 输入名称 → 保存 → 成功的完整流程可用
4. 「我的模板」→ 打开 Drawer → 查看列表 → 使用/删除的完整流程可用
5. 加载模板后编辑器内容正确替换为模板正文
6. Drawer 以 overlay 方式打开，不影响三列 grid 基础结构
7. **[成功标准]** P0 端到端闭环（保存→加载→删除）走通率 **100%**
8. **[成功标准]** 模板保存成功率 >= 99%
9. **[性能目标]** 模板加载到编辑器耗时 <= 500ms

## 交接上下文

- **架构章节**: 4.1 主流程、4.2 关键分支、4.3 状态机、5.1 系统上下文、ADR-5/ADR-7
- **相关代码**: `src/app/workspace/page.tsx`（主修改目标，~490 行）、`src/hooks/use-workspace-state.ts`（消费 ws.setPromptText）、T03 全部产出
- **契约 / 数据对象**: workspace state 接口（特别是 `promptText`, `setPromptText`, `analysisTaskId`）
- **消费的上游契约摘要**:

```typescript
// T03 组件 Props 契约 — 本任务消费
interface TemplateSaveDialogProps {
  open: boolean;
  initialContent: string;
  sourceAnalysisTaskId?: string;
  onSave: (template: PromptTemplate) => void;
  onClose: () => void;
}

interface TemplateDrawerProps {
  open: boolean;
  onLoadTemplate: (content: string) => void;
  onDeleteSuccess: (id: string) => void;
  onClose: () => void;
}

// useWorkspaceState 关键接口 — 本任务消费
ws.promptText: string;              // 当前编辑器文本（只读）
ws.setPromptText(text: string): void; // 设置编辑器文本
ws.analysisTaskId: string | null;   // 当前分析任务 ID
// ws.state 用于判断 showPromptEditor（analysis_ready/generation_ready/generating 时为 true）
```

## 执行指引

- **工具链**: pnpm, React 19, TypeScript, Tailwind CSS 4
- **执行顺序**: Task 列表按序执行（状态 → 按钮 → Dialog → Drawer → 布局 → 警告 → E2E 验证）
- **阻塞处理**: T03 组件未就绪时可先用 stub 组件占位；workspace state 接口不匹配时暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - 类型错误：检查 T03 组件 Props 类型是否与本任务使用方式一致
  - 布局问题：Drawer overlay 的 z-index 是否足够高、是否被其他元素遮挡
  - 回调问题：确认 `ws.setPromptText` 在 workspace state 中的签名
- **允许修改的额外文件**:
  - `src/components/workspace/prompt-editor.tsx`（仅限添加可选 `actions` slot prop，如确有必要）
  - `src/hooks/use-workspace-state.ts`（仅限确认 setPromptText 签名，不应修改实现）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- page.tsx 已有 ~490 行代码，新增模板集成代码（约 50-80 行）。若超过 600 行建议考虑拆分，但首版不做强制要求
- Drawer overlay 方案可能在窄屏幕上有体验问题（响应式留待 P1 后评估，ADR-5 已注明）
- `ws.promptText` 可能为空字符串（用户清空了编辑器），此时「保存为模板」按钮仍可点击，但 SaveDialog 内部会拦截空内容（ADR-7 分支）
- 加载模板后编辑器内容被完全替换，原有用户编辑内容丢失。这是预期行为（用户主动选择「使用」模板），UX 上需让用户明确感知

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| API 请求数据完整性 | 保存时 initialContent 来自 ws.promptText（受控状态），保证是编辑器真实内容 | todo |
| 加载/等待状态 | Dialog/Drawer 组件内部自行管理 isSaving/isLoading 状态 | todo |
| 错误处理与重试 | 保存失败保留对话框内容；加载失败显示错误 toast；删除失败保留原列表 | todo |
| 空状态处理 | 无模板时 Drawer 显示空状态引导；编辑器为空时保存按钮可用但 SaveDialog 拦截 | todo |
| 网络异常 | 组件内部 fetch try-catch 兜底，显示通用错误提示 | todo |
| 快速连续操作 | Dialog/Drawer 的 open 状态为 boolean，React 自动批处理避免中间态 | todo |
| 分析任务无活跃 ID | sourceAnalysisTaskId 为 undefined，API 端点接受可选字段 | todo |
| 模板 content 含特殊字符 | textarea 天然支持纯文本，XSS 由 React JSX 默认转义防护 | todo |
