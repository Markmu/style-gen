# UAT 产物目录

本目录用于保存验收测试台账、执行计划和失败证据。

推荐结构：

```text
docs/uat/
├── UAT-用例清单.md
├── cases/
├── evidence/
└── execution-plan-{YYYYMMDD}.md
```

约束：

- `UAT-用例清单.md` 是验收台账主入口
- 失败或阻塞用例必须在 `evidence/` 下留下证据
- `test-e2e` 与 `visual-regression` 的关键 artifact 应优先回填到这里
