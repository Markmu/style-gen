---
task_id: "T05"
title: "P1 变量向导与增强"
dimension: integration
phase: 3
status: done
depends_on: ["T04"]
---

# T05: P1 变量向导与增强（集成）

## 任务概要

- **目标**: 实现 P1 阶段的三个增强功能：变量向导填值面板（核心）、模板重命名 API + UI、模板复制 API + UI，完成「检测变量 → 向导填值 → 替换生成」的完整闭环
- **依赖**: T04（工作区集成完成，模板基础功能可用）
- **所属模块**: 变量向导组件 + 增强 API 端点 + 工作区增强集成
- **前置条件**: T04 已完成并通过 review
- **不在范围**: P2 功能（分类/标签/导入导出/分享/版本历史）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/template-wizard.tsx` | 变量向导填值面板组件 |
| modify | `src/app/api/templates/[id]/route.ts` | 新增 PUT（更新/重命名）handler |
| create | `src/app/api/templates/[id]/duplicate/route.ts` | POST 复制端点 |
| modify | `src/lib/repositories/template-repository.ts` | 新增 updateTemplate / duplicateTemplate 函数 |
| modify | `src/app/workspace/page.tsx` | 集成变量向导面板的显示逻辑 |
| modify | `src/components/workspace/template-drawer.tsx` | 新增「复制」操作入口 |

## 实现规格

### 1. 变量向导面板组件

**文件**: `src/components/workspace/template-wizard.tsx`

**功能**:
- 加载含变量的模板后，自动在右列编辑区位置渲染为内嵌面板（替换原 PromptEditor 内容区）
- 展示从 template content 中提取的所有变量，每个变量一个输入框
- 用户填值后点击「应用」，执行变量替换并将结果填充到编辑器
- 支持「跳过」按钮恢复普通编辑态（含 `{{var}}` 标记的原文本）
- 与 TemplateDrawer 互斥：打开向导时自动关闭 Drawer（架构 4.3 规则）

**Props 接口**:
```typescript
interface TemplateWizardProps {
  variables: TemplateVariable[];       // 从模板提取的变量列表
  originalContent: string;             // 含 {{var}} 标记的原始正文
  onApply: (renderedContent: string) => void; // 替换后的最终文本回调
  onSkip: () => void;                  // 跳过向导，恢复普通编辑态
}
```

**UI 结构**:
```
┌──────────────────────────────────────┐
│  变量填值                     [跳过] │
├──────────────────────────────────────┤
│                                      │
│  该模板包含 N 个变量，填写后自动替换   │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ subject                      │    │
│  │ ┌──────────────────────────┐ │    │
│  │ │                          │ │    │
│  │ └──────────────────────────┘ │    │
│  │ (出现 2 次)                   │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌──────────────────────────────┐    │
│  │ lighting                     │    │
│  │ ┌──────────────────────────┐ │    │
│  │ │ neon city lights         │ │    │
│  │ └──────────────────────────┘ │    │
│  │ (出现 1 次)                   │    │
│  └──────────────────────────────┘    │
│                                      │
│          [取消]    [应用并生成]       │
└──────────────────────────────────────┘
```

**内部状态与逻辑**:
```typescript
const [values, setValues] = useState<Record<string, string>>(() =>
  Object.fromEntries(variables.map((v) => [v.name, v.defaultValue]))
);

// 应用时调用 replaceVariables（来自 template-parser，T01 创建的纯函数模块）
const handleApply = () => {
  const rendered = replaceVariables(originalContent, values);
  onApply(rendered);
};
```

**关键交互细节**:
- 每个变量卡片显示变量名 + 输入框 + 出现次数提示（"出现 N 次"）
- 「应用并生成」按钮：执行替换 → 回调填充到编辑器
- 「跳过」按钮：`onSkip()` → 恢复为含 `{{var}` 标记的普通编辑态
- 向导面板与 Drawer 互斥：通过 workspace state 协调

**样式约定**:
- 替换右列 PromptEditor + OutputSettings 的位置（内嵌式，ADR-5）
- 使用与现有组件一致的 CSS 变量系统
- 变量卡片使用 `bg-[var(--surface-bright)]` + 圆角

### 2. PUT /api/templates/:id — 更新/重命名

**文件**: 在 `src/app/api/templates/[id]/route.ts` 中新增 PUT handler

**请求体**:
```typescript
interface UpdateTemplateRequest {
  name?: string;        // user_input，新名称 1-50 字符
  content?: string;     // user_input，新内容非空 <= 10000 字符
}
```

**处理流程**:
1. 认证 → userId
2. 校验至少提供 name 或 content 之一
3. 调用 `findById(id, userId)` → 不存在返回 404
4. 若提供了新 name，调 `findByName(userId, name)` 检查同名 → 存在且 ID 不同则返回 409
5. 调用 `updateTemplate(id, userId, { name?, content? })`（Repository 内部重新 extractVariables）
6. 返回 **200** + 更新后的完整记录

### 3. POST /api/templates/:id/duplicate — 复制模板

**文件**: `src/app/api/templates/[id]/duplicate/route.ts`（新建路由文件）

**处理流程**:
1. 认证 → userId
2. 调用 `findById(id, userId)` → 不存在返回 404
3. 调用 `duplicateTemplate(id, userId)`（Repository 内部读取原模板 → 生成新 ULID → 名称追加 " (copy)" → 插入新记录）
4. 返回 **201** + 新模板记录

**命名规则**: 原名 + `" (copy)"`；若已存在同名 copy，则追加 `"(copy 2)"`, `"(copy 3)"` 依此类推。

### 4. Repository 扩展

在 `src/lib/repositories/template-repository.ts` 中新增两个函数：

```typescript
/** 更新模板（自动重新提取 variables） */
export async function updateTemplate(
  id: string,
  userId: string,
  data: { name?: string; content?: string }
): Promise<PromptTemplate> {
  const existing = await findById(id, userId);
  if (!existing) throw new Error(`Template not found: ${id}`);

  const updates: Record<string, unknown> = { updatedAt: sql`NOW()` };
  if (data.name !== undefined) updates.name = data.name;
  if (data.content !== undefined) {
    updates.content = data.content;
    updates.variables = extractVariables(data.content);
  }

  const rows = await db
    .update(templates)
    .set(updates)
    .where(and(eq(templates.id, id), eq(templates.userId, userId)))
    .returning();

  return rowToTemplate(rows[0]);
}

/** 复制模板（生成新 ID，名称追加 " (copy)"） */
export async function duplicateTemplate(
  id: string,
  userId: string
): Promise<PromptTemplate> {
  const existing = await findById(id, userId);
  if (!existing) throw new Error(`Template not found: ${id}`);

  const newId = generateId();
  let newName = `${existing.name} (copy)`;

  // 处理重复 copy 名称
  let suffix = 2;
  while (await findByName(userId, newName)) {
    newName = `${existing.name} (copy ${suffix})`;
    suffix++;
  }

  const [row] = await db
    .insert(templates)
    .values({
      id: newId,
      name: newName,
      content: existing.content,
      variables: existing.variables,
      sourceAnalysisTaskId: null, // 复制的模板不保留来源追溯
      userId,
    })
    .returning();

  return rowToTemplate(row);
}
```

### 5. 工作区页面增强集成

**修改 `src/app/workspace/page.tsx`**:

#### 5.1 新增状态

```typescript
const [showWizard, setShowWizard] = useState(false);
const [wizardContext, setWizardContext] = useState<{
  variables: TemplateVariable[];
  originalContent: string;
} | null>(null);
```

#### 5.2 加载模板时的变量检测

修改 `onLoadTemplate` 回调逻辑：

```typescript
onLoadTemplate={(content) => {
  ws.setPromptText(content);
  setShowTemplateDrawer(false);

  // 检测是否含变量标记 → 自动展示向导（P1）
  const vars = extractVariables(content);
  if (vars.length > 0) {
    setWizardContext({ variables: vars, originalContent: content });
    setShowWizard(true);
  }
}}
```

#### 5.3 向导面板条件渲染

在右列区域，当 `showWizard` 为 true 时，隐藏 PromptEditor + OutputSettings，显示 TemplateWizard：

```tsx
{/* Right column: Wizard mode or normal editor */}
<div className="min-h-0 space-y-4 overflow-y-auto">
  {showWizard && wizardContext ? (
    <TemplateWizard
      variables={wizardContext.variables}
      originalContent={wizardContext.originalContent}
      onApply={(rendered) => {
        ws.setPromptText(rendered);
        setShowWizard(false);
        setWizardContext(null);
      }}
      onSkip={() => {
        setShowWizard(false);
        setWizardContext(null);
      }}
    />
  ) : (
    <>
      {/* 现有的 PromptEditor + OutputSettings 渲染逻辑 */}
    </>
  )}
</div>
```

#### 5.4 Drawer 互斥

打开向导时关闭 Drawer：

```typescript
// 在 setShowWizard(true) 时同时执行
setShowTemplateDrawer(false);
```

### 6. Drawer 增强

**修改 `src/components/workspace/template-drawer.tsx`**:

在卡片操作菜单中增加「复制」选项：

```
[使用] [···]
         ├ 删除
         └ 复制     ← 新增
```

「复制」行为：
1. 调用 `POST /api/templates/:id/duplicate`
2. 成功后将新模板追加到本地列表头部
3. 显示 toast "已复制模板"

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 `src/components/workspace/template-wizard.tsx` 变量向导面板组件 | done | 含变量输入表单、出现次数提示、应用/跳过按钮 |
| 2 | 在 Repository 中新增 `updateTemplate` 和 `duplicateTemplate` 函数 | done | 含同名 copy 处理逻辑 |
| 3 | 在 `[id]/route.ts` 中新增 PUT handler（更新/重命名） | done | 含同名检测 409 |
| 4 | 创建 `[id]/duplicate/route.ts` POST 复制端点 | done | 含认证+归属校验 |
| 5 | 修改 workspace page.tsx 集成变量向导显示逻辑 | done | 含变量检测→自动展示向导→互斥处理 |
| 6 | 修改 TemplateDrawer 增加「复制」操作 | done | 菜单项 + API 调用 + 本地列表更新 |
| 7 | P1 操作埋点 [架构8.5] | done | 向导应用时输出 `wizard_applied`、重命名/复制成功时输出对应事件（使用 console.log 或统一事件函数） |
| 8 | 端到端验证：保存含变量模板→加载→向导填值→替换→生成的完整链路 | done | P1 核心闭环验证 |

## 验证命令

```bash
# 类型检查
pnpm type-check

# 构建验证
pnpm build

# 全量测试
pnpm test
```

手动 E2E 验证（需要 `pnpm dev` + 数据库 + 有效 session）：
1. 保存含 `{{subject}}` `{{lighting}}` 变量的模板
2. 加载该模板 → 自动弹出变量向导
3. 填写变量值 → 点击「应用」→ 编辑器显示替换后文本
4. 点击「跳过」→ 恢复含 `{{var}}` 标记的编辑态
5. 重命名模板 → 确认名称更新
6. 复制模板 → 确认列表中出现 "(copy)" 副本

## 预期结果

1. `pnpm type-check`、`pnpm build`、`pnpm test` 全部通过
2. 加载含变量模板后自动展示变量向导面板
3. 变量向导正确展示所有变量及出现次数
4. 「应用」后编辑器内容正确替换为填值后的最终 prompt
5. 「跳过」后恢复含 `{{var}}` 标记的普通编辑态
6. PUT 更新接口可正确重命名和更新内容（含变量重新提取）
7. POST 复制接口可正确创建副本（含名称去重）
8. Drawer 中「复制」操作可用
9. 向导与 Drawer 互斥正常工作
10. P1 三个用户故事全部走通

## 交接上下文

- **架构章节**: 4.1 主流程（P1 分支）、4.2 关键分支（向导跳过）、4.3 状态机（向导与 Drawer 互斥）、6.2 加载链路（P1 变量检测）、9.2 Phase C 定义
- **相关代码**: T01-T04 全部产出、`src/lib/template-parser.ts`（replaceVariables 函数）
- **契约 / 数据对象**: `TemplateVariable`, `UpdateTemplateRequest`
- **消费的上游契约摘要**:

```typescript
// T01/T02 已有契约 — 本任务扩展
// PUT /api/templates/:id — 新增
//   Request: { name?: string, content?: string }
//   Response 200: PromptTemplate（含重新提取的 variables）
//   Error 404/409

// POST /api/templates/:id/duplicate — 新增
//   Response 201: PromptTemplate（新副本）
//   Error 404

// template-parser — 本任务消费（T01 创建，纯函数前后端共享）
// replaceVariables(content, values): string  // 核心替换函数
// extractVariables(content): TemplateVariable[]  // 变量检测
```

## 执行指引

- **工具链**: pnpm, React 19, TypeScript, Tailwind CSS 4, Drizzle ORM
- **执行顺序**: Task 列表按序执行（Wizard 组件 → Repo 扩展 → API 端点 → Workspace 集成 → Drawer 增强 → E2E 验证）
- **阻塞处理**: T04 未完成时暂停；replaceVariables 函数边界问题需回溯 T01 确认
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**:
  - 类型错误：检查新增 API 端点的请求/响应类型定义
  - 向导替换不正确：检查 replaceVariables 的长变量名优先策略是否生效
  - 互斥逻辑问题：确认 showWizard/showTemplateDrawer 的联动代码
- **允许修改的额外文件**:
  - `src/lib/template-parser.ts`（仅限修复 replaceVariables 边界 bug）
  - `src/types/models.ts`（仅限新增 P1 相关类型）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- `duplicateTemplate` 中的 while 循环查找可用 copy 名称在最坏情况下可能多次查询数据库。首版模板量 < 100，性能可接受
- 向导面板替换了 PromptEditor + OutputSettings 的位置，用户在向导模式下无法调整生成参数。这是设计意图（先填值再设置参数）
- `extractVariables` 和 `replaceVariables` 在前后端共享同一份源码（T01 创建的 `src/lib/template-parser.ts`），确保逻辑完全一致
- P1 为体验增强阶段，若时间紧张可拆分优先级：变量向导 > 复制 > 重命名

## 边界场景检查

### 后端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| 重复请求/幂等性 | PUT 更新是幂等的（同一值多次更新结果一致）；POST duplicate 每次创建新记录 | todo |
| 超时处理 | 纯数据库操作无外部超时风险 | todo |
| 重试场景 | duplicate 失败时用户可重新点击复制 | todo |
| 并发冲突 | update 的 findByName + update 非原子；duplicate 的 copy 名称查找有竞态窗口 | todo |
| 空/无效输入 | PUT 至少需要一个字段；content 更新时重新 extractVariables | todo |

### 前端边界场景

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| API 请求数据完整性 | 复制/重操作的 ID 来自列表数据（服务端返回），保证有效 | todo |
| 加载/等待状态 | 复制/重命名操作添加 loading 状态防止重复提交 | todo |
| 错误处理与重试 | API 失败时保留原状态，显示错误提示 | todo |
| 空状态处理 | 无变量时不展示向导（直接加载到编辑器） | todo |
| 网络异常 | fetch try-catch 兜底 | todo |
| 变量值含特殊字符 | replaceVariables 使用字符串替换，特殊字符不影响正确性 | todo |
| 大量变量（>20 个） | 向导面板支持滚动；首版实际变量数通常 < 10 | todo |
