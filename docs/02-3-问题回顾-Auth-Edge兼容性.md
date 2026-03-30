---
workflow_type: retrospective
status: review_ready
date: "2026-03-30"
related_documents:
  - "docs/02-1-架构文档-用户登录与数据打通.md"
  - "docs/02-2-实现计划-用户登录与数据打通/T01-认证基础-backend.md"
  - "docs/02-2-实现计划-用户登录与数据打通/T02-路由守卫-backend.md"
related_code:
  - "src/auth.config.ts"
  - "src/auth.ts"
  - "src/middleware.ts"
---

# 问题回顾：Auth.js 与 Edge Runtime 兼容性

## 1. 事件概述

在实现用户登录与路由守卫后，`middleware` 编译阶段持续出现以下告警：

- `Module not found: Can't resolve 'pg-native'`
- `A Node.js API is used ... which is not supported in the Edge Runtime`

典型依赖链路为：

```text
src/middleware.ts
  -> src/auth.ts
  -> src/lib/repositories/user-repository.ts
  -> src/lib/db/index.ts
  -> pg
```

表面现象是 `pg-native` 缺失，实际问题是 Edge bundle 看到了不该出现的 Node-only 数据库依赖。

## 2. 直接原因

`src/middleware.ts` 直接从 `@/auth` 导入 `auth`。而 `src/auth.ts` 顶层初始化了完整的 `NextAuth(...)` 配置，其中包含会访问数据库的 callbacks。

即使数据库访问使用了动态导入，只要完整的认证模块仍被 `middleware` 静态导入，打包器就会沿依赖图继续分析到 `pg`。因此：

- 运行时不一定真的执行数据库逻辑
- 但构建时已经把 Node-only 依赖带入了 Edge 分析范围

这就是本次问题的本质。

## 3. 根因分析

### 3.1 架构约束写得不够具体

架构文档已经指出 Middleware 运行在 Edge Runtime，不能直接访问数据库；但文档只表达了运行时约束，没有进一步落到模块边界约束。

缺失的关键规则是：

> 供 `middleware` 使用的 Auth.js 配置必须是 Edge-safe 子集，不能复用包含数据库 callbacks 的完整 `src/auth.ts`。

### 3.2 T01 把认证配置设计成单文件

`T01-认证基础-backend.md` 将 `src/auth.ts` 设计为统一入口，同时承载：

- Provider 配置
- JWT session 配置
- `signIn` / `jwt` / `session` callbacks
- 用户仓储访问

这个设计对 API Route 是可行的，但没有为后续 `middleware` 预留 Edge-safe 复用方式。

### 3.3 T02 的实现方案与风险说明不一致

`T02-路由守卫-backend.md` 的实现示例推荐：

```typescript
import { auth } from "@/auth";
export default auth((req) => { ... });
```

但同一文档后面又明确说明：

- middleware 在 Edge Runtime 中运行
- 不能访问 Node.js API 或数据库连接
- `auth()` 在 middleware 中只应做 JWT 验证

也就是说，风险被识别了，但没有被转化成可执行的实现约束。

### 3.4 验收标准过宽

原任务把 `pnpm build` 通过视为完成信号，但没有要求：

- 构建日志中不能出现 Edge Runtime 兼容性告警
- 不能出现从 `middleware` 指向数据库模块的 import trace

由于 Next.js 最终仍能产出构建结果，这个问题被遗漏到了后期。

### 3.5 测试覆盖不到 bundling 边界

现有 `middleware` 单测重点验证行为逻辑，例如：

- 未登录返回 401 / redirect
- 登录后放行
- 限流 key 使用 userId

这些测试是必要的，但它们 mock 掉了认证包装器，无法发现 `middleware -> auth -> db -> pg` 这种打包层面的依赖泄漏。

## 4. 修复方案

本次修复采用“拆分 Edge-safe 配置与 Node-only 配置”的方式：

1. 新增 `src/auth.config.ts`
   - 仅保留 Provider、JWT session、页面跳转等 Edge-safe 基础配置
2. 保留 `src/auth.ts` 作为 Node-only 认证入口
   - 在这里继续定义数据库相关 callbacks
3. 修改 `src/middleware.ts`
   - 不再从 `@/auth` 导入
   - 改为基于 `NextAuth(authConfig)` 创建 middleware 使用的 `auth`

修复后验证结果：

- `pnpm build` 通过
- 构建日志中不再出现 `pg-native` 缺失
- 构建日志中不再出现 `src/auth.ts -> pg` 的 Edge import trace
- `src/__tests__/middleware.test.ts` 全部通过

## 5. 文档与流程改进

### 5.1 架构文档应补充的规则

在 `02-1-架构文档-用户登录与数据打通.md` 的 ADR-10 下补充明确约束：

- `middleware` 只能依赖 Edge-safe 认证配置
- 认证配置需拆分为“基础配置”和“Node-only 回调实现”
- 任何数据库仓储、ORM、`pg`、Node-only 工具都不能出现在 middleware 的静态依赖图中

### 5.2 T01 应补充的实现要求

在 `T01-认证基础-backend.md` 中明确：

- `src/auth.ts` 不应作为 middleware 的直接依赖
- 需要新增一个可复用的 `auth.config.ts`（或同等职责模块）
- callbacks 中允许访问数据库，但仅限 Node runtime 路径使用

### 5.3 T02 应修正的示例代码

`T02-路由守卫-backend.md` 不应继续用 `import { auth } from "@/auth"` 作为默认示例，而应改为：

- middleware 基于 Edge-safe 配置初始化自己的 `auth`
- `@/auth` 仅供 API Route、Server Action、服务端逻辑复用

### 5.4 验收标准应升级

后续所有涉及 `middleware`、Edge Route、RSC/Server 边界的任务，验收标准应增加：

- `pnpm build` 不仅要成功，还要无新增 Edge Runtime 兼容性告警
- 不允许出现从 Edge 入口追踪到 `pg`、数据库仓储或 Node-only 包的 import trace

### 5.5 CI 应增加构建级护栏

建议在 CI 中增加一条构建级检查：

- 执行 `pnpm build`
- 将 `Edge Runtime` Node API 告警、`pg-native` 缺失、数据库依赖 import trace 视为失败

单元测试继续覆盖业务行为，构建检查负责兜住 bundling 边界问题。

## 6. 经验总结

### 6.1 判断 Edge 兼容性时，重点看依赖图而不是执行路径

“这段逻辑只在某个 callback 里才会跑到”并不足以证明 Edge 安全。只要 Edge 入口静态导入了该模块，打包器就可能继续分析到不兼容依赖。

### 6.2 动态导入不是万能隔离手段

动态导入只能延迟执行，不能替代正确的模块边界设计。真正可靠的做法是从入口级别切断依赖图。

### 6.3 Build warning 不是低优先级噪音

这次问题说明，构建阶段的 Edge import trace 已经足够精确地暴露设计缺陷。对于运行时边界问题，warning 本身就应被当作失败信号处理。

## 7. 后续行动项

| 项目 | 动作 | 负责人 | 状态 |
| --- | --- | --- | --- |
| 架构文档 | 补充 Edge-safe 认证配置拆分规则 | 待定 | todo |
| T01 文档 | 将单文件 `src/auth.ts` 改为拆分式设计说明 | 待定 | todo |
| T02 文档 | 替换 middleware 示例代码与验证标准 | 待定 | todo |
| CI | 增加 `pnpm build` 告警收敛策略 | 待定 | todo |

## 8. 关联代码

- `src/auth.config.ts`
- `src/auth.ts`
- `src/middleware.ts`

这三个文件共同构成了本次修复后的正确边界：

- `auth.config.ts` 负责 Edge-safe 基础配置
- `auth.ts` 负责 Node-only 完整认证能力
- `middleware.ts` 只消费 Edge-safe 配置，不接触数据库依赖
