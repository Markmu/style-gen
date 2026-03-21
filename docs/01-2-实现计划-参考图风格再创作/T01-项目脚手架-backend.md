---
task_id: "T01"
title: "项目脚手架"
dimension: backend
phase: 1
status: review
depends_on: []
---

# T01: 项目脚手架（后端）

## 任务概要

- **目标**: 初始化 Next.js + TypeScript + Tailwind CSS 项目，配置开发工具链，建立基础项目结构
- **依赖**: 无
- **所属模块**: 项目基础设施
- **前置条件**: Node.js >= 18 和 pnpm 已安装
- **不在范围**: 业务代码、数据库连接、API 实现

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `package.json` | 项目依赖和脚本 |
| create | `tsconfig.json` | TypeScript 配置 |
| create | `next.config.ts` | Next.js 配置 |
| create | `tailwind.config.ts` | Tailwind CSS 配置 |
| create | `postcss.config.mjs` | PostCSS 配置 |
| create | `src/app/layout.tsx` | 根布局组件 |
| create | `.env.example` | 环境变量模板 |
| create | `.gitignore` | Git 忽略规则 |

## 实现规格

### 1. 项目初始化

使用 `pnpm create next-app` 或手动初始化，确保：

- Next.js 15+（App Router）
- TypeScript strict mode
- Tailwind CSS 4+
- ESLint + Next.js recommended rules

### 2. 核心依赖

```
dependencies:
  next, react, react-dom
  @tanstack/react-query        # 前端数据层
  ulid                         # ID 生成
  pg                           # PostgreSQL 客户端

devDependencies:
  typescript, @types/node, @types/react
  tailwindcss, postcss
  eslint, eslint-config-next
```

### 3. package.json scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "type-check": "tsc --noEmit"
}
```

### 4. .env.example

```
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/style_gen

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# Gemini
GEMINI_API_KEY=

# fal.ai
FAL_KEY=
```

### 5. 根布局

`src/app/layout.tsx` 包含：
- HTML lang="zh-CN"
- 全局字体和基础样式
- React Query Provider 包裹（创建 `src/components/providers.tsx`）

### 6. 目录结构

```
src/
├── app/
│   ├── layout.tsx
│   └── page.tsx          # 占位首页
├── components/
│   └── providers.tsx     # React Query Provider
├── hooks/
├── lib/
└── types/
```

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 初始化 Next.js 项目 | done | 创建 package.json、tsconfig.json、next.config.ts |
| 2 | 配置 Tailwind CSS | done | tailwind.config.ts + postcss.config.mjs |
| 3 | 创建根布局和 Provider | done | layout.tsx + providers.tsx（React Query） |
| 4 | 创建 .env.example 和 .gitignore | done | 环境变量模板 |
| 5 | 验证项目启动 | done | pnpm dev 可正常运行 |

## 验证命令

```bash
pnpm install
pnpm build
pnpm type-check
pnpm lint
```

## 预期结果

- `pnpm build` 成功，无报错
- `pnpm type-check` 通过，无类型错误
- `pnpm lint` 通过
- `pnpm dev` 可启动，访问 localhost:3000 看到占位页面

## 交接上下文

- **架构章节**: 9.1 推荐核心技术栈
- **相关代码**: 无（greenfield）
- **契约 / 数据对象**: 无
- **提供给下游的契约摘要**:

项目结构已就绪，后续任务可直接在 `src/lib/`、`src/app/api/`、`src/components/` 下创建文件。React Query Provider 已配置，前端任务可直接使用 `useQuery` / `useMutation`。

## 执行指引

- **工具链**: pnpm, Next.js App Router, TypeScript
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: Node.js 或 pnpm 版本不满足时暂停并报告
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 Node.js 版本、pnpm 版本、依赖冲突
- **允许修改的额外文件**: 无
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

无特殊风险。标准 Next.js 项目初始化。
