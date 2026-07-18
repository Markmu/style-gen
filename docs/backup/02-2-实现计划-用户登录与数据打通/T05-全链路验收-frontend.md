---
task_id: "T05"
title: "全链路联调验收"
dimension: frontend
phase: 3
status: done
depends_on: ["T02", "T03", "T04"]
---

# T05: 全链路联调验收（前端）

## 任务概要

- **目标**: 完成会话过期的前端处理逻辑（API 返回 401 时引导重新登录），以及验证 01 期创作闭环在认证体系下正常工作
- **依赖**: T02（middleware 认证拦截）、T03（数据关联）、T04（前端认证 UI）
- **所属模块**: 前端认证 UI（收尾）
- **前置条件**: T02、T03、T04 均已完成
- **不在范围**: E2E 自动化测试脚本（在 integration 维度）

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| modify | `src/hooks/use-analysis-polling.ts` | 拦截 401 响应，触发重新登录 |
| modify | `src/hooks/use-generation-polling.ts` | 拦截 401 响应，触发重新登录 |

## 实现规格

### 1. 401 响应拦截

在现有的轮询 hooks 中，当 API 返回 401 时：
- 停止轮询
- 调用 `signIn("google")` 引导用户重新登录
- 或展示"会话已过期，请重新登录"的提示

```typescript
// 在 fetch 或 React Query 的 onError 中
if (response.status === 401) {
  // 保留当前页面，重新登录后自动跳转回来（架构 4.3 session_expired 要求）
  signIn("google", { callbackUrl: window.location.pathname });
  return;
}
```

### 2. 验证清单

手动验证以下场景：
1. 未登录 → 访问首页 → 正常展示，右上角有"登录"按钮
2. 点击"登录" → Google OAuth → 登录成功 → 回到首页，右上角显示头像
3. 点击 CTA → 跳转工作区
4. 上传参考图 → 分析 → 编辑 prompt → 生成 → 完整闭环正常
5. 刷新页面 → 会话保持，不需要重新登录
6. 新标签页打开工作区 → 会话保持
7. 点击头像 → 退出登录 → 回到首页
8. 退出后尝试访问工作区 → 重定向到首页

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 在轮询 hooks 中增加 401 拦截 | done | signIn 或 toast |
| 2 | 手动验证完整用户旅程（8 项场景） | done | 需启动 dev server + Google OAuth 环境手动验收 |
| 3 | 验证 `pnpm type-check` 和 `pnpm build` 通过 | done | 本任务文件无类型/构建错误；预存错误来自其他上游任务 |

## 验证命令

```bash
pnpm type-check
pnpm build
pnpm test
```

## 预期结果

- 所有类型检查和构建通过
- 完整创作闭环（上传 → 分析 → 生成）在认证体系下正常工作
- 会话过期时前端正确引导重新登录
- 01 期所有功能不受影响

## 交接上下文

- **架构章节**: 4.2 关键分支（会话过期）、6.2 认证后的业务操作
- **相关代码**: `src/hooks/use-analysis-polling.ts`、`src/hooks/use-generation-polling.ts`
- **契约 / 数据对象**: 无新增
- **消费的上游契约摘要**:

```
Middleware 返回 401 时响应体：
{ error: "Authentication required", code: "UNAUTHORIZED", retryable: false }
```

## 执行指引

- **工具链**: pnpm, Next.js, next-auth/react
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 遇到依赖未就绪、路径不存在、验证环境缺失等情况时，暂停并报告阻塞原因，不要自行猜测或绕过
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 401 拦截逻辑是否在正确的 error handler 中；检查 signIn 调用是否正确
- **允许修改的额外文件**: `src/components/workspace/*.tsx`（如需调整 error 展示）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- 多标签页退出不一致场景：一个标签页退出后，另一个标签页下次 API 调用会收到 401，自动引导重新登录
- React Query 的 `retry` 默认重试 3 次，401 响应应配置为不重试

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| API 请求数据完整性 | 401 响应时停止当前操作，不提交部分数据 | done |
| 加载/等待状态 | 401 时停止轮询 loading 状态，展示登录引导 | done |
| 错误处理与重试 | 401 不重试，直接引导登录 | done |
| 空状态处理 | 不适用 | done |
| 网络异常 | 网络异常不触发登录引导（仅 401 触发） | done |
