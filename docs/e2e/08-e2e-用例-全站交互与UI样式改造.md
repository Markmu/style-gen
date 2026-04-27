---
source: docs/08-1-架构文档-全站交互与UI样式改造.md
created: 2026-04-27
---

# E2E 测试用例：全站交互与 UI 样式改造

## 资产现状

- Playwright projects: `workspace` project runs against `http://localhost:3001` with `AUTH_REQUIRED=false`; `auth` project is limited to auth/data isolation specs.
- 现有相关 spec: `smoke.spec.ts`、`workspace-layout.spec.ts`、`template.spec.ts`。
- 可复用 helpers: FEAT-02 shell 验证不需要 API mock；后续工作台和模板流程可复用 `e2e/helpers/mock-api.ts`、`e2e/helpers/workspace-actions.ts`。
- 可复用 fixtures: FEAT-02 不需要 fixture。

## FEAT-02：全站壳层与导航统一

> 来源：架构文档 §6.4 跨页面切换链路、§7.2 PageLayoutContract；实现计划 FEAT-02。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
| --- | --- | --- | --- | --- | --- | --- |
| TC-2.1 | 顶部导航品牌和入口统一 | Happy | 常规宽屏 1280px，未登录可浏览 | 打开首页 | 顶部 banner 使用 Visoryn 品牌；包含首页、工作台、模板库入口；不出现 StyleGen 旧品牌 | `e2e/precision-glass-shell.spec.ts` |
| TC-2.2 | 工作区侧边导航当前项准确 | Happy | 常规宽屏 1280px | 打开 `/workspace/templates` | Library 导航按钮带 `aria-current="page"`，Generate 不带当前页状态 | `e2e/precision-glass-shell.spec.ts` |
| TC-2.3 | 常规宽屏壳层无横向溢出 | Layout | 常规宽屏 1280px | 分别打开 `/`、`/workspace`、`/workspace/templates` | `document.scrollWidth <= window.innerWidth` | `e2e/precision-glass-shell.spec.ts` |

## 汇总

| 类型 | 数量 |
| --- | --- |
| Happy Path | 2 |
| Layout | 1 |
| 合计 | 3 |

## FEAT-03：首页 Precision Glass 体验

> 来源：架构文档 §6.1 首页进入与上传入口链路；实现计划 FEAT-03。

| # | 场景 | 类型 | 前置条件 | 步骤 | 断言 | 目标 spec |
| --- | --- | --- | --- | --- | --- | --- |
| TC-3.1 | 首页首屏同时呈现价值、主行动、模板入口、产品预览和上传入口 | Happy | 常规宽屏 1280px，未登录可浏览 | 打开首页 | H1 表达核心能力；首屏可见“开始创作”“模板库”；产品预览包含 Reference / Recipe / Render；上传入口可见 | `e2e/precision-glass-home.spec.ts` |
| TC-3.2 | 上传区校验失败在原区域可恢复 | Error | 常规宽屏，已打开首页 | 上传非图片文件 | 上传区显示格式错误和“重新选择”恢复入口，不跳转页面 | `e2e/precision-glass-home.spec.ts` |
| TC-3.3 | 首页常规宽屏无横向溢出并露出下一段 | Layout | 1280px / 1440px | 打开首页 | 无横向溢出；首屏下方可看到价值区开头 | `e2e/precision-glass-home.spec.ts` |

## FEAT-03 汇总

| 类型 | 数量 |
| --- | --- |
| Happy Path | 1 |
| Error Path | 1 |
| Layout | 1 |
| 合计 | 3 |

### 需要新增的源码 data-testid

无。优先使用 role、link/button name 和 `aria-current`。
