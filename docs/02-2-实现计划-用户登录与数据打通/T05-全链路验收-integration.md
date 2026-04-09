---
task_id: "T05"
title: "全链路联调验收"
dimension: integration
phase: 3
status: done
depends_on: ["T02", "T03", "T04"]
---

# T05: 全链路联调验收（集成）

## 任务概要

- **目标**: 编写端到端测试覆盖认证流程和数据隔离，验证完整用户旅程和 01 期功能回归
- **依赖**: T02（middleware）、T03（数据关联）、T04（前端 UI）
- **所属模块**: 集成验证
- **前置条件**: T02、T03、T04 均已完成；本地环境可运行完整应用
- **不在范围**: 单元测试（各任务自带）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `e2e/auth.spec.ts` | 认证流程 E2E 测试 |
| create | `e2e/data-isolation.spec.ts` | 数据隔离验证测试 |

## 实现规格

### 1. 认证流程 E2E 测试（`e2e/auth.spec.ts`）

由于 Google OAuth 在 E2E 中无法直接测试（需要真实 Google 账号），测试策略为：

**可自动化的场景**：
- 未登录访问 `/workspace` → 被重定向到 `/`
- 未登录调用 `POST /api/analysis` → 返回 401
- 未登录调用 `POST /api/generation` → 返回 401
- 未登录调用 `POST /api/upload/presign` → 返回 401
- 首页正常展示，包含"登录"按钮
- 首页 CTA 按钮可见

**需要 mock session 的场景**（通过设置测试 cookie 或 Auth.js test mode）：
- 已登录状态下 `/workspace` 可正常访问
- 已登录状态下右上角显示用户头像/名称
- 点击退出后回到首页

### 2. 数据隔离验证测试（`e2e/data-isolation.spec.ts`）

通过 API 级别验证数据隔离：
- 用户 A 创建的分析任务，用户 B 查询返回 404
- 用户 A 创建的生成任务，用户 B 查询返回 404
- 匿名历史数据（user_id = NULL）不出现在任何用户的查询结果中

### 3. 回归验证

确认 01 期核心创作闭环不受影响：
- 上传参考图（presign URL 正常）
- 触发分析任务（AI 分析正常）
- 查询分析结果（轮询正常）
- 提交生成任务（图片生成正常）
- 查询生成结果（轮询正常）

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 创建 `e2e/auth.spec.ts`，编写认证流程测试 | done | 未登录拦截 + 已登录访问 |
| 2 | 创建 `e2e/data-isolation.spec.ts`，编写数据隔离测试 | done | API 级别验证 |
| 3 | 运行全部 E2E 测试，确认通过 | done | `pnpm e2e` |
| 4 | 运行全局验证命令 | done | type-check + lint + test + build |

## 验证命令

```bash
# E2E 测试
pnpm e2e

# 全局验证
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

## 预期结果

- 所有 E2E 测试通过
- `pnpm type-check && pnpm lint && pnpm test && pnpm build` 全部通过
- 未登录用户无法访问受保护路由和 API
- 数据隔离正确，用户只能访问自己的数据
- 01 期创作闭环功能回归通过

## 交接上下文

- **架构章节**: 2.4 成功标准、4.1 主流程、4.2 关键分支、8.6 主要风险
- **相关代码**: 所有 T01-T04 的产出文件
- **契约 / 数据对象**: 所有已定义的 API 契约和数据模型
- **消费的上游契约摘要**:

```
全部上游契约汇总：
- Auth.js: signIn/signOut/useSession/auth()
- Middleware: 未登录 → 重定向(页面) / 401(API)
- Repository: 所有 create/find 方法含 userId 参数
- API Routes: 从 session 获取 userId，数据归属验证
```

## 执行指引

- **工具链**: Playwright, pnpm
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: E2E 测试失败时先确认 dev server 是否正常启动；检查 mock session 是否正确配置；数据隔离测试失败时检查 Repository 的 WHERE 条件
- **允许修改的额外文件**: `playwright.config.ts`（测试配置）、`e2e/` 目录下其他测试文件
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- Google OAuth E2E 测试需要 mock 策略，真实 OAuth 流程无法在 CI 中自动化
- 如果 Auth.js 不支持便捷的 test mode，可考虑在测试环境中使用 Credentials Provider 作为替代
- 数据隔离测试需要能模拟两个不同用户的 session，可能需要直接操作数据库和 cookie
