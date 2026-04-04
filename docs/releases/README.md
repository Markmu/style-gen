# 发布产物目录

本目录用于保存发布阶段强制产物。

推荐文件：

- `release-readiness-{YYYY-MM-DD}.md`
- `rollback-plan-{YYYY-MM-DD}.md`
- `post-release-check-{YYYY-MM-DD}.md`
- `retro-{YYYY-MM-DD}.md`

约束：

- 没有 `release-readiness` 与 `rollback-plan`，不应进入发布
- 没有 `post-release-check`，不应宣告发布稳定
- 没有 `retro`，本次交付的流程问题不算完成沉淀
