---
task_id: "T05"
title: "回归测试与清理"
dimension: integration
phase: 4
status: done
depends_on: ["T04"]
---

# T05: 回归测试与清理（集成）

## 任务概要

- **目标**: 补充 E2E 测试覆盖 Workspace 新布局的完整状态流转链路、降级场景和错误处理场景，确保全链路可走通
- **依赖**: T04（所有新组件和降级迁移完成）
- **所属模块**: E2E 测试
- **前置条件**: T01-T04 全部完成、T05-frontend 单元测试通过、`pnpm dev` 可正常启动
- **不在范围**: 单元测试（T05-frontend）、性能测试、视觉回归测试（建议后续通过 visual-regression skill 补充）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `e2e/workspace-layout.spec.ts` | 新布局 E2E 测试：两段式布局、状态栏、画布、面板 |
| create | `e2e/workspace-degradation.spec.ts` | 降级场景 E2E 测试：L1-L4 在新布局中的正确展示 |

## 实现规格

### 1. 布局与状态流转 E2E (`workspace-layout.spec.ts`)

覆盖以下用户旅程：

**US-01 空态进入**:
- 访问 `/workspace`
- 验证两栏布局渲染（左侧画布 + 右侧面板）
- 验证 StatusBar 显示"未开始"标签
- 验证画布展示 UploadZone
- 验证面板展示空态预览文案

**US-02 上传并分析**:
- 上传图片文件
- 验证画布切换为参考图视图
- 验证 StatusBar 变为"分析中"
- 等待分析完成
- 验证 StatusBar 变为"可生成"
- 验证 Step 1 展示 5 字段核心摘要
- 验证画布底部展示 StyleTagBar
- 验证 Step 2 Prompt 编辑器可用
- 验证 Step 3 "生成首版"按钮可用

**US-03 展开完整配方**:
- 点击"展开完整配方"按钮
- 验证完整 Recipe 字段展示
- 点击"收起完整配方"
- 验证回到摘要视图

**US-04 生成图片**:
- 选择宽高比和画质
- 点击"生成首版"
- 验证 StatusBar 变为"生成中"
- 等待生成完成
- 验证画布切换为结果图
- 验证 CanvasToolbar 出现（结果图/对比/下载）
- 验证 StatusBar 变为"已完成"
- 验证 Step 3 按钮变为"重新生成"
- 验证 Step 2 标题变为"继续调整指令"

**US-05 对比查看**（对应 PRD US-07：同一视图中快速切换参考图和结果图）:
- 点击 CanvasToolbar "对比查看"
- 验证画布切换为对比视图（参考图 | 结果图）
- 点击"结果图"切回结果图视图

**US-06 迭代重新生成**（对应 PRD US-08：保留 Prompt 微调后重新生成）:
- 在 generation_ready 状态下修改 Prompt 文本
- 点击"重新生成"
- 验证使用修改后的 Prompt 发起新生成请求
- 验证生成完成后结果图更新

**US-07 更换参考图**:
- 点击 StatusBar "更换参考图"
- 验证所有状态重置
- 验证画布回到 UploadZone
- 验证 StatusBar 回到"未开始"

**US-08 错误处理与恢复**（对应 PRD US-09：知道出了什么问题、能不能重试、下一步做什么）:
- 分析失败场景：验证 RecipeStep 区域展示 ErrorDisplay，提供重试和更换参考图两个出口
- 生成失败场景：验证 OutputSettings 区域展示 ErrorDisplay，已有 Prompt 和参数不被清除
- 验证重试后错误清除、流程恢复正常

### 2. 降级场景 E2E (`workspace-degradation.spec.ts`)

使用 Playwright 的 route mock 模拟各降级场景：

**L1 分析排队**:
- Mock `/api/analysis/[id]` 延迟响应超过 60 秒
- 验证 RecipeStep 区域展示排队提示卡
- 验证提示卡包含 spinner 动画

**L2 生成不可用**:
- Mock `/api/generation` 返回 `{ error: "...", code: "SERVICE_UNAVAILABLE" }`
- 验证 OutputSettings 区域展示 amber 降级提示卡
- 验证生成按钮 disabled
- 验证 Prompt 编辑器仍可使用

**L3 LLM 降级**:
- Mock `/api/analysis/[id]` 返回 completed 但 recipe 为 null、promptText 有值
- 验证 RecipeStep 区域展示 amber 降级提示卡
- 验证 Prompt 编辑器预填原始分析文本

**L4 分析不可用**:
- Mock `/api/analysis` 返回 `{ error: "...", code: "SERVICE_UNAVAILABLE" }`
- 验证 RecipeStep 区域展示 amber 降级提示卡

**分析错误重试**:
- Mock `/api/analysis` 首次返回错误
- 验证 RecipeStep 区域展示 ErrorDisplay
- 点击重试按钮
- 验证重新发起分析请求

**生成错误重试**:
- Mock `/api/generation` 首次返回错误
- 验证 OutputSettings 区域展示 ErrorDisplay
- 点击重试按钮
- 验证错误清除

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 编写布局与状态流转 E2E | done | 8 个用户旅程覆盖（US-01~US-08，含迭代重新生成和错误恢复） |
| 2 | 编写降级场景 E2E | done | L1-L4 + 分析/生成错误重试 |
| 3 | 验证 E2E 测试全部通过 | done | `pnpm e2e` 通过 |

## 验证命令

```bash
pnpm e2e
```

## 预期结果

1. 所有布局与状态流转 E2E 测试通过
2. 所有降级场景 E2E 测试通过
3. 全链路（上传→分析→生成→对比→更换参考图）可走通

## 交接上下文

- **架构章节**: §2.4（成功标准）、§4.1（主流程）、§4.2（关键分支）、§8.2（降级链）
- **相关代码**: `e2e/` 目录下现有 E2E 测试
- **契约 / 数据对象**: API 路由（`/api/analysis`、`/api/generation` 等）
- **消费的上游契约摘要**: T01-T04 创建的所有组件的 DOM 结构（用于 E2E 选择器）

## 执行指引

- **工具链**: pnpm, Playwright, Next.js dev server
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done 或 waived → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 Playwright route mock 是否正确拦截 API 请求、检查 DOM 选择器是否匹配新组件结构、检查 dev server 是否正常启动
- **允许修改的额外文件**: `playwright.config.ts`（仅限配置调整）、`e2e/` 下现有测试文件（如需更新选择器）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- E2E 测试依赖 dev server（`pnpm dev` 自动启动），需确保端口 3000 可用
- 降级场景的 route mock 需要精确匹配 API 路径和响应格式
- L1 排队测试涉及 60 秒超时，可通过缩短测试中的 `QUEUEING_THRESHOLD_MS` 或使用 Playwright 的 clock API 加速
