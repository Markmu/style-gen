---
task_id: "T07"
title: "端到端验证与健壮性"
dimension: integration
phase: 3
status: done
depends_on: ["T05", "T06"]
---

# T07: 端到端验证与健壮性（集成）

## 任务概要

- **目标**: 验证默认 Replicate 配置下全链路（分析 + 生成）端到端跑通，回归验证 Gemini/fal.ai 备选模式，补充可观测性日志，确认异常路径覆盖
- **依赖**: T05（Analysis API 异步化）、T06（Generation API 异步化）
- **所属模块**: 端到端验证
- **前置条件**: T01-T06 均已完成；所有环境变量已配置（REPLICATE_API_TOKEN, REPLICATE_WEBHOOK_SECRET, GEMINI_API_KEY, FAL_KEY）
- **不在范围**: 前端 UI 变更；性能优化；自动降级机制

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/__tests__/provider-integration.test.ts` | Provider 切换集成测试 |
| modify | `src/app/api/analysis/route.ts` | 补充可观测性日志（如有遗漏） |
| modify | `src/app/api/generation/route.ts` | 补充可观测性日志（如有遗漏） |
| modify | `src/lib/ai/webhook-handler.ts` | 补充 Webhook 日志（如有遗漏） |
| modify | `.env.example` | 新增环境变量说明 |

## 实现规格

### 1. Provider 切换集成测试

编写集成测试验证 Provider 工厂在不同环境变量配置下的行为：

```typescript
describe('Provider Integration', () => {
  it('VISION_PROVIDER=gemini 返回 GeminiVisionProvider', () => { ... });
  it('VISION_PROVIDER=replicate 返回 ReplicateVisionProvider', () => { ... });
  it('IMAGE_GEN_PROVIDER=fal 返回 FalImageGenProvider', () => { ... });
  it('IMAGE_GEN_PROVIDER=replicate 返回 ReplicateImageGenProvider', () => { ... });
  it('未设置环境变量时默认使用 replicate', () => { ... });
  it('未知 provider 名称时抛出明确错误', () => { ... });
});
```

### 2. 全链路验证检查清单

以下场景需要人工或自动化 E2E 验证：

**Replicate 默认模式（Happy Path）**:
- [ ] `POST /api/analysis` 返回 `{ id, status: 'processing' }`
- [ ] `GET /api/analysis/:id` 轮询到 processing 状态
- [ ] Webhook 回调后任务变为 completed
- [ ] `POST /api/generation` 返回 `{ id, status: 'processing' }`
- [ ] Webhook 回调后任务变为 completed，resultAssetId 存在

**Gemini/fal.ai 备选模式**:
- [ ] `VISION_PROVIDER=gemini` 时分析链路同步完成
- [ ] `IMAGE_GEN_PROVIDER=fal` 时生成链路 fire-and-forget 完成
- [ ] 切换回默认 Replicate 后功能正常

**性能观察**（手动验收时记录，不阻塞交付）:
- [ ] Replicate 分析链路实际耗时 <= 60s（含 Webhook 回调 + 结构化）
- [ ] Replicate 生成链路实际耗时 <= 120s（含 Webhook 回调 + 图片转存）

**异常路径**:
- [ ] Webhook 签名验证失败 → 返回 401，任务等待超时标记 failed
- [ ] Replicate prediction 失败 → Webhook 回调 failed → 任务标记 failed
- [ ] 分析结构化失败 → L3 降级（promptText 为原始文本，errorStage: llm）
- [ ] 生成图片转存失败 → 任务标记 failed
- [ ] 5 分钟超时无回调 → 任务标记 failed
- [ ] 重复 Webhook 回调 → 幂等处理，返回 200

### 3. 可观测性补充

确认以下日志点已在 T04/T05/T06 中实现，如有遗漏则补充：

| 日志事件 | 位置 | 必要字段 |
| --- | --- | --- |
| `provider_call_started` | Analysis/Generation API | taskId, provider, model, mode |
| `provider_call_completed` | Analysis/Generation API | taskId, provider, duration |
| `webhook_received` | Webhook handler | taskId, taskType, signatureValid |
| `webhook_processed` | Webhook handler | taskId, taskType, result, duration |
| `task_timeout` | 超时定时器 | taskId, provider, submittedAt |

### 4. 环境变量文档更新

更新 `.env.example` 新增：

```env
# AI Provider 配置
VISION_PROVIDER=replicate          # replicate | gemini
IMAGE_GEN_PROVIDER=replicate       # replicate | fal
REPLICATE_API_TOKEN=               # Replicate API 令牌
REPLICATE_WEBHOOK_SECRET=          # Webhook 签名验证密钥
WEBHOOK_BASE_URL=                  # Webhook 回调基地址（开发环境需使用 ngrok 等）
```

### 5. 全局构建验证

确保所有改动不破坏现有功能：

```bash
pnpm type-check && pnpm lint && pnpm test && pnpm build
```

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 编写 Provider 切换集成测试 | done | 覆盖所有 Provider 组合 |
| 2 | 审查并补充可观测性日志 | done | 对照日志清单逐项检查 |
| 3 | 更新 `.env.example` | done | 新增环境变量说明 |
| 4 | 运行全局构建验证 | done | `pnpm type-check && pnpm lint && pnpm test && pnpm build` |
| 5 | 执行全链路验证检查清单 | done | 手动或 E2E 验证所有场景（需人工执行） |

## 验证命令

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

## 预期结果

- 所有 Provider 组合的集成测试通过
- 可观测性日志覆盖所有关键节点
- `.env.example` 包含完整的环境变量说明
- `pnpm build` 成功（生产构建无错误）
- 全链路验证检查清单全部通过

## 交接上下文

- **架构章节**: 8（非功能需求）、8.5（可观测性）、9.2 Phase C（健壮性与验收）
- **相关代码**: T01-T06 所有产出文件
- **契约 / 数据对象**: 全部 Provider 接口、API 端点契约
- **消费的上游契约摘要**:

所有上游任务的产出均被本任务消费用于验证。

## 执行指引

- **工具链**: pnpm, Vitest, Playwright（可选 E2E）
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: 如果 E2E 验证需要真实 Replicate API，确认 API Token 和 Webhook URL 配置正确
- **完成信号**: 所有验证命令通过 + 全链路检查清单完成 → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 逐个 Provider 组合隔离测试；检查环境变量配置；查看 Webhook 日志排查回调问题
- **允许修改的额外文件**: T01-T06 产出的任何文件（修复验证中发现的问题）
- **暂停条件**: 发现 T01-T06 中的设计缺陷需要回溯修改时，应暂停并报告

## 风险 / 备注

- 真实 Replicate API 调用会产生费用，集成测试中建议仍以 mock 为主，仅手动全链路验证时使用真实 API
- 开发环境 Webhook 需要 ngrok 或类似工具暴露本地端口
- 全链路验证检查清单中的部分项目可能需要手动执行，无法完全自动化

## 边界场景检查

| 场景 | 处理方式 | 状态 |
| --- | --- | --- |
| Provider 配置缺失 | 缺少 API Token 时工厂函数或 Provider 构造抛出明确错误 | done |
| Webhook URL 不可达 | 开发环境需配置 WEBHOOK_BASE_URL 指向 ngrok 地址 | done |
| 多 Provider 同时配置 | 环境变量互不影响，各自独立切换 | done |
| 构建回归 | `pnpm build` 无新增 warning/error | done |

> 边界场景状态只允许 `todo` / `done` / `waived`。若为 `waived`，说明列必须写原因。
