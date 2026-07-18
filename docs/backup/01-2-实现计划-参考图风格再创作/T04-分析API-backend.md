---
task_id: "T04"
title: "分析 API"
dimension: backend
phase: 2
status: done
depends_on: ["T02"]
---

# T04: 分析 API（后端）

## 任务概要

- **目标**: 实现两阶段 AI 分析链路（视觉理解 → LLM 结构化整理），提供分析任务创建和状态查询接口
- **依赖**: T02（数据模型与 Repository 已就绪）
- **所属模块**: Analysis API、AI 模型集成
- **前置条件**: Gemini API Key 已配置；Asset Repository 和 AnalysisTask Repository 可用
- **不在范围**: 图片上传、生成图片、Prompt 版本管理

## 文件清单

| 动作 | 路径 | 说明 |
| --- | --- | --- |
| create | `src/lib/ai/vision.ts` | Gemini 视觉理解调用 |
| create | `src/lib/ai/structurer.ts` | Gemini LLM 结构化整理调用 |
| create | `src/lib/ai/prompts.ts` | System Prompt 模板 |
| create | `src/app/api/analysis/route.ts` | POST /api/analysis |
| create | `src/app/api/analysis/[id]/route.ts` | GET /api/analysis/:id |

## 实现规格

### 1. System Prompt 模板（prompts.ts）

导出两个常量：

**VISION_SYSTEM_PROMPT**：指导视觉模型从参考图中提取原始视觉信息，包括主体、场景、构图、镜头、光照、色彩、纹理、风格、氛围等。要求输出详细描述文本，不要求结构化。

**STRUCTURER_SYSTEM_PROMPT**：指导 LLM 将视觉分析原始文本整理为 VisualRecipe JSON，并据此生成 Prompt 和 Negative Prompt。要求使用 JSON 格式输出，字段严格对齐 VisualRecipe 接口。输出结构：

```json
{
  "recipe": { /* VisualRecipe 字段 */ },
  "promptText": "...",
  "negativePromptText": "..."
}
```

### 2. 视觉理解模型调用（vision.ts）

- 使用 Gemini 3 Flash API（通过 `@google/genai` SDK）
- 导出 `analyzeImage(imageUrl: string): Promise<string>`
- 传入图片 URL，获取原始分析文本
- 超时设置：30 秒
- 错误时抛出明确异常，调用方可识别为 vision 阶段失败

### 3. LLM 结构化整理调用（structurer.ts）

- 使用 Gemini 3 Flash API（与视觉理解相同 Provider，ADR-2 确认）
- 导出 `structureAnalysis(rawAnalysis: string): Promise<{ recipe: VisualRecipe; promptText: string; negativePromptText: string }>`
- 使用 JSON mode 或 structured output 确保返回格式稳定（架构风险 8.6）
- 超时设置：30 秒
- 错误时抛出明确异常，调用方可识别为 llm 阶段失败

### 4. POST /api/analysis

**请求体**：

```typescript
{
  assetId: string;     // 预分配的 ULID
  fileUrl: string;     // 图片公共 URL
  width: number;
  height: number;
  mimeType: string;
}
```

**处理流程**（架构 6.1 步骤 3-7，同步串行执行）：

1. 校验输入参数
2. 创建 Asset 记录（type: 'reference'）
3. 创建 AnalysisTask 记录（status: 'pending'）
4. 更新任务状态为 'processing'
5. 调用 `analyzeImage(fileUrl)` — 阶段 1
6. 调用 `structureAnalysis(rawAnalysis)` — 阶段 2（如失败则走 L3 降级）
7. 成功：将 recipe、promptText、negativePromptText、rawResponse 写入任务，状态改为 'completed'
7b. L3 降级：将 rawResponse 写入 promptText，recipe 保持 null，状态改为 'completed'，标记 degraded
8. 返回完成的 AnalysisTask

**错误处理**：
- 视觉模型失败：任务标记 failed，errorStage: 'vision'，errorMessage 记录具体原因
- LLM 失败（L3 降级，架构 8.2）：不将分析标记为 failed，而是降级处理：
  - 将 rawResponse（视觉模型原始返回）写入 promptText 作为降级 Prompt
  - recipe 保持 null
  - negativePromptText 设为空字符串
  - 状态标记为 'completed'，新增 `degraded: true` 标记
  - 前端据此展示提示："AI 结构化整理暂时不可用，已返回原始分析结果，您可手动编辑 Prompt"
- 整体超时 60 秒（架构 8.2）

**响应**：返回完整 AnalysisTask JSON（含 recipe 和 prompt）

### 5. GET /api/analysis/:id

- 按 ID 查询 AnalysisTask
- 返回完整任务数据，包含 status、recipe、promptText、negativePromptText、errorMessage、errorStage
- 任务不存在返回 404

## Task 列表

| # | Task | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | 安装 @google/genai SDK | done | Gemini API 客户端 |
| 2 | 编写 System Prompt 模板 | done | prompts.ts：视觉理解 + 结构化整理两套 prompt |
| 3 | 实现视觉理解模型调用 | done | vision.ts：analyzeImage 函数 |
| 4 | 实现 LLM 结构化整理调用 | done | structurer.ts：structureAnalysis 函数，JSON mode |
| 5 | 实现 POST /api/analysis | done | 创建 Asset + Task，串行两阶段调用，保存结果 |
| 5b | 实现 L3 降级分支 | done | LLM 失败时降级返回原始视觉分析，status 仍为 completed |
| 6 | 实现 GET /api/analysis/:id | done | 状态查询端点 |
| 7 | 手动测试完整分析链路 | done | 上传一张图片后调用分析 API，验证返回结构 |

## 验证命令

```bash
pnpm type-check
pnpm build
# 手动测试（需先通过 T03 上传一张图片获取 fileUrl）
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{"assetId": "<ulid>", "fileUrl": "<r2_url>", "width": 1024, "height": 768, "mimeType": "image/jpeg"}'
# 查询结果
curl http://localhost:3000/api/analysis/<task_id>
```

## 预期结果

- `pnpm build` 成功
- POST /api/analysis 能接收图片信息，返回包含 recipe 和 promptText 的完整 AnalysisTask
- recipe 字段包含 VisualRecipe 的全部字段（imageSummary, subject, scene 等）
- promptText 和 negativePromptText 非空，是可用于生图的描述文本
- GET /api/analysis/:id 返回任务完整状态
- 分析失败时 errorStage 正确标记为 'vision' 或 'llm'

## 交接上下文

- **架构章节**: 6.1 上传与分析（步骤 3-8）、7.2 推荐最小 Schema（VisualRecipe + AnalysisTask）、7.3 API 边界、ADR-2、ADR-5
- **相关代码**: `src/lib/repositories/asset-repository.ts`、`src/lib/repositories/analysis-task-repository.ts`
- **契约 / 数据对象**: Asset, VisualRecipe, AnalysisTask
- **提供给下游的契约摘要**:

```typescript
// POST /api/analysis
// Request: { assetId: string; fileUrl: string; width: number; height: number; mimeType: string }
// Response: AnalysisTask（含 recipe: VisualRecipe, promptText, negativePromptText）

// GET /api/analysis/:id
// Response: AnalysisTask

// src/lib/ai/vision.ts
export function analyzeImage(imageUrl: string): Promise<string>;

// src/lib/ai/structurer.ts
export function structureAnalysis(rawAnalysis: string): Promise<{
  recipe: VisualRecipe;
  promptText: string;
  negativePromptText: string;
}>;
```

## 执行指引

- **工具链**: pnpm, @google/genai, Next.js API Routes
- **执行顺序**: Task 列表按序执行
- **阻塞处理**: Gemini API Key 无效或额度不足时暂停并报告；如 JSON mode 不稳定，先尝试优化 prompt，不要改链路结构
- **完成信号**: 所有验证命令通过 + 所有 Task 标记为 done → 将 status 改为 `review`

## 失败处理

- **验证失败排查方向**: 检查 Gemini API Key、模型名称（gemini-3-flash）、网络连通性、prompt 格式、JSON 解析
- **允许修改的额外文件**: `package.json`（添加 Gemini SDK 依赖）
- **暂停条件**: 同一验证命令连续失败 3 次以上，应暂停并报告

## 风险 / 备注

- LLM 结构化输出不稳定是首版最大技术风险（架构 8.6）。优先使用 JSON mode / structured output，兜底方案是 prompt 中强调格式 + 前端对缺失字段做兜底
- System Prompt 质量直接影响 recipe 质量，需要手动调试优化，首版先实现基础版，后续迭代
- 分析链路是同步长请求（可达 30 秒），注意 Vercel 等平台的 API Route 超时限制
