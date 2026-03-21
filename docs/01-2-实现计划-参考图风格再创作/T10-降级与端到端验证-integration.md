---
task_id: "T10"
title: "降级与端到端验证"
dimension: integration
phase: 4
status: ready-to-dev
depends_on: ["T09"]
---

# T10: 降级与端到端验证（集成）

## 任务概要

- **目标**: 实现前端错误展示组件、最小降级开关机制和重试逻辑，完成全链路端到端验证
- **依赖**: T09（限流与错误规范已就绪，统一错误格式可用）
- **所属模块**: 跨模块集成
- **前置条件**: T09 完成，所有 API 端点已有统一错误格式和结构化日志
- **不在范围**: GA4 埋点（P1）、反馈收集（P1）、用户登录

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/components/workspace/error-display.tsx` | 统一错误展示组件 |
| create | `src/components/workspace/retry-button.tsx` | 统一重试按钮组件 |
| modify | `src/app/workspace/page.tsx` | 集成错误展示和降级提示 |

## 实现规格

### 1. 前端错误展示（error-display.tsx）

- 根据 error.code 展示不同的错误信息
- 区分可重试（显示重试按钮）和不可重试（显示返回/替换图片入口）
- 限流错误（RATE_LIMITED）：显示剩余等待时间
- 服务不可用（SERVICE_UNAVAILABLE）：展示"服务暂时不可用，请稍后重试"并禁用对应操作按钮

### 2. 重试逻辑（retry-button.tsx）

- 分析失败重试：重新创建分析任务（替换参考图或同图重试）
- 生成失败重试：用相同 Prompt 和参数创建新生成任务
- 重试不复用失败任务（架构 7.4）

### 3. 最小降级开关

按架构 8.2 降级策略，实现基于 API 错误码的前端降级：

**L1（生图模型响应慢）**：
- 前端轮询超过 60 秒后展示排队提示："生成排队中，请耐心等待"
- 不改变功能可用性

**L2（生图模型不可用）**：
- 当 POST /api/generation 返回 `code: "SERVICE_UNAVAILABLE"` 时
- 前端禁用"生成"按钮，展示"图片生成服务暂时不可用"
- 保留分析结果和 Prompt 编辑能力

**L4（视觉模型不可用）**：
- 当 POST /api/analysis 返回 `code: "SERVICE_UNAVAILABLE"` 时
- 前端展示"分析服务暂时不可用，请稍后重试"
- 已有分析结果仍可查看和编辑

实现方式：不需要单独的健康检查接口，仅根据 API 调用的实际响应错误码触发降级 UI。状态存储在工作区前端状态中，页面刷新后重置。

### 4. 全链路验证

验证以下完整场景：

**Happy Path**：
1. 首页上传参考图 → 跳转工作区
2. 自动分析 → 展示配方 + Prompt
3. 确认 Prompt → 生成 → 展示结果
4. 对比参考图和结果图
5. 修改 Prompt → 再次生成 → 新结果

**Error Path**：
1. 上传不支持的文件类型 → 前端拦截
2. 上传超大文件 → 前端拦截
3. 分析失败 → 展示错误 + 重试入口
4. 生成失败 → 保留 Prompt + 重试入口
5. 限流触发 → 展示等待提示
6. L3 降级 → LLM 失败后展示原始视觉分析 + 手动编写 Prompt 提示

**Edge Cases**：
1. 替换参考图 → 清空结果，重新分析
2. 分析中刷新页面 → 回到 idle（首版可接受）
3. 快速连续点击生成 → 同一步骤只保留一个任务

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 实现前端错误展示组件 | todo | error-display.tsx：根据 error.code 展示不同信息 |
| 2 | 实现重试按钮组件 | todo | retry-button.tsx：分析/生成失败重试 |
| 3 | 实现 L1 降级提示 | todo | 轮询超过 60 秒展示排队提示 |
| 4 | 实现 L2/L4 降级开关 | todo | 根据 SERVICE_UNAVAILABLE 错误码禁用对应操作 |
| 5 | 集成到工作区页面 | todo | page.tsx 中接入错误展示和降级组件 |
| 6 | 全链路 Happy Path 验证 | todo | 上传→分析→生成→对比→迭代 |
| 7 | 全链路 Error Path 验证 | todo | 各类失败场景 + L3 降级场景 |
| 8 | Edge Case 验证 | todo | 替换图片、刷新页面、重复提交 |

## 验证命令

```bash
pnpm type-check
pnpm build
pnpm lint
pnpm dev
# 全链路验证（手动）：
# 1. 首页上传 → 工作区分析 → 编辑 Prompt → 生成 → 对比 → 迭代
# 2. 上传非图片文件，验证前端拦截
# 3. 模拟分析/生成失败，验证错误展示和重试
# 4. 模拟 API 返回 SERVICE_UNAVAILABLE，验证对应按钮禁用
```

## 预期结果

- 全链路 Happy Path 完整可用：上传 → 分析 → 生成 → 对比 → 迭代
- 分析/生成失败时错误信息清晰，重试入口可用
- L1 降级：轮询超时后显示排队提示
- L2 降级：生成服务不可用时禁用生成按钮，保留分析和编辑
- L4 降级：分析服务不可用时展示提示，已有结果仍可操作
- L3 降级：LLM 失败时展示原始分析结果和手动编辑提示
- `pnpm build` 和 `pnpm lint` 无报错

## 交接上下文

- **架构章节**: 8.1 性能目标、8.2 错误处理与降级、8.6 风险
- **相关代码**: 所有 API route 文件、所有工作区组件
- **消费的上游契约摘要**:

```typescript
// T09 提供的统一错误格式
interface ApiError {
  error: string;
  code: string;     // "RATE_LIMITED" | "VISION_FAILED" | "LLM_FAILED" | "GENERATION_TIMEOUT" | "SERVICE_UNAVAILABLE"
  retryable: boolean;
}
```

## 执行指引

- **工具链**: React, Next.js, Tailwind CSS, pnpm
- **执行顺序**: Task 1-5 按序执行；Task 6-8 必须在 Task 1-5 之后执行
- **阻塞处理**: 如果前置任务有未修复的 bug 导致全链路不通，暂停并报告具体阻塞点
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查错误码映射、降级 UI 条件渲染逻辑、状态机流转
- **允许修改的额外文件**: `src/app/workspace/page.tsx`、`src/hooks/use-workspace-state.ts`（如需添加降级状态字段）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 降级开关基于实际 API 响应触发，不需要额外的健康检查基础设施
- 全链路验证依赖所有外部服务（R2、Gemini、fal.ai）可用，如有服务不可用需分段验证
- L5 降级（数据库不可用 → 整页维护提示）属于部署层面处理，不在代码层实现
