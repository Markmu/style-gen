# 视觉设计改造文档：Stitch "Obsidian Core" 参考设计

> 基于 Stitch MCP 生成的两个参考页面代码，对照现有 codebase，制定完整的视觉改造方案。
> 参考代码已归档至 `docs/stitch-reference/landing-page.html` 和 `docs/stitch-reference/workbench.html`。

---

## 1. 设计令牌映射

### 1.1 颜色体系对比

| 用途 | Stitch 原始色值 | 当前项目 Token | 当前色值 | 改造方向 |
|------|----------------|---------------|---------|---------|
| 页面背景 | `surface: #131315` (纯灰) | `--surface-base` | `#060e20` (深蓝) | **保留蓝色调**，符合 Luminescent Darkroom 定位 |
| 侧边栏/容器低层 | `surface-container-low: #1c1b1d` | `--surface-low` | `#091328` | 保留 |
| 工作区/容器中层 | `surface-container: #201f22` | `--surface-mid` | `#0f1930` | 保留 |
| 浮层/容器高层 | `surface-container-high: #2a2a2c` | `--surface-bright` | `#1f2b49` | 保留 |
| 主色 | `primary: #c0c1ff` (淡紫) | `--accent-primary` | `#ba9eff` | 保留（更饱和的紫色更符合品牌调性） |
| 主色暗 | `primary-container: #4b4dd8` | `--accent-primary-dim` | `#8455ef` | 保留 |
| 次色 | `secondary: #b9c7df` (淡蓝) | `--accent-secondary` | `#53ddfc` | 保留（青色更有辨识度） |
| 主文本 | `on-surface: #e5e1e4` (暖白) | `--text-primary` | `#dee5ff` (冷白) | 保留冷色调，与蓝色背景更协调 |
| 次要文本 | `on-surface-variant: #c7c4d8` | `--text-secondary` | `#a3aac4` | 保留 |
| 边框/ghost | `outline-variant: #464555` | `--border` | `#40485d` | 保留 |
| 错误 | `error: #ffb4ab` | `--color-error` | `#ff6e84` | 保留（更醒目） |

**结论：保留现有 Luminescent Darkroom 颜色体系，采用 Stitch 的布局模式和交互模式。**

### 1.2 排版体系

| 属性 | Stitch 设计 | 当前项目 | 改造方向 |
|------|-----------|---------|---------|
| 标题字体 | Inter 600-800 | Manrope 700-800 | 保留 Manrope（更有几何感） |
| 正文字体 | Inter 400-600 | Inter 400-600 | 一致 |
| 标签/技术元数据 | 10-11px, uppercase, tracking-widest, font-mono | 无 | **新增：技术标签样式** |
| 标题 tracking | tracking-tighter (-0.02em) | tracking-tight | **调整：改为 tracking-tighter** |
| 图标 | Material Symbols Outlined, 18-24px | Material Symbols Outlined | 一致 |

### 1.3 间距与圆角

| 属性 | Stitch 设计 | 当前项目 | 改造方向 |
|------|-----------|---------|---------|
| 圆角 | 0.125rem-0.5rem (小圆角) | rounded-xl (0.75rem) | **调整：减小圆角至 rounded-lg** |
| Section 间距 | py-32 (8rem) | py-16 (4rem) | **调整：增大间距，留更多呼吸空间** |
| 卡片内间距 | p-6 ~ p-8 | p-4 ~ p-5 | **调整：增大内间距** |
| 导航栏高度 | h-12 (3rem) | 无固定导航栏 | 新增 |

---

## 2. Landing Page 改造计划

### 2.0 页面整体线框图

```
┌──────────────────────────────────────────────────────────────────────────┐
│  NAV BAR (sticky, h-12, glassmorphic)                                    │
│  ┌──────────────────────┐                    ┌─────────────────────────┐ │
│  │ ✦ StyleGen           │  Features  Pricing  │  🔔  ⚙️  [Avatar]     │ │
│  └──────────────────────┘                    └─────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                   ┌── HERO SECTION ──────────────────┐                   │
│                   │  min-h-[700px]                    │                   │
│                   │  radial-gradient bg               │                   │
│                   │                                  │                   │
│                   │   ┌──────────────────────────┐   │                   │
│                   │   │  PRECISION VISUAL INTEL   │   │  ← badge pill    │
│                   │   └──────────────────────────┘   │                   │
│                   │                                  │                   │
│                   │       参考图风格再创作            │                   │
│                   │     将视觉灵感转化为结构化参数    │                   │
│                   │                                  │                   │
│                   │    ┌──────────┐ ┌──────────┐    │                   │
│                   │    │ 开始创作  │ │ 查看示例  │    │  ← dual CTA     │
│                   │    └──────────┘ └──────────┘    │                   │
│                   │                                  │                   │
│                   └──────────────────────────────────┘                   │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│              ┌── UPLOAD ENTRY ──────────────────────┐                    │
│              │  max-w-lg, centered                   │                    │
│              │  ┌────────────────────────────────┐  │                    │
│              │  │     ⬆ cloud_upload              │  │                    │
│              │  │   点击或拖拽上传参考图           │  │                    │
│              │  │   JPG / PNG / WebP, ≤10MB       │  │                    │
│              │  └────────────────────────────────┘  │                    │
│              └──────────────────────────────────────┘                    │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌── FEATURES BENTO GRID ─────────────────────────────────────────────┐ │
│  │  py-32, max-w-7xl, grid-cols-3 gap-8                              │ │
│  │                                                                    │ │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │ │
│  │  │  p-8             │ │  p-8             │ │  p-8             │   │ │
│  │  │  ┌────┐          │ │  ┌────┐          │ │  ┌────┐          │   │ │
│  │  │  │visibility│     │ │  │deployed_code│  │ │  │ sync │     │   │ │
│  │  │  └────┘          │ │  └────┘          │ │  └────┘          │   │ │
│  │  │                  │ │                  │ │                  │   │ │
│  │  │  视觉分析        │ │  结构化配方      │ │  一键生成        │   │ │
│  │  │  AI 深度解析...  │ │  将视觉特征...   │ │  基于提取的...   │   │ │
│  │  │                  │ │                  │ │                  │   │ │
│  │  │  ┌────────────┐  │ │  ┌─tag─┐ ┌─tag┐│ │  ┌──┐┌──┐┌──┐   │   │ │
│  │  │  │  ▓▓▓▓▓░░░  │  │ │  │Lig│ │Mat││ │  │  │  ││  ││  │   │   │ │
│  │  │  │  chart     │  │ │  └────┘ └───┘│ │  │  │  ││  ││  │   │   │ │
│  │  │  └────────────┘  │ │  ┌─tag──────┐ │ │  │  └──┘└──┘└──┘   │   │ │
│  │  │  ↑ visual decor  │ │  │Lens_35mm │ │ │  │  ↑ color grid  │   │ │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌── STATS SECTION ───────────────────────────────────────────────────┐ │
│  │  py-20, border-y, flex row                                        │ │
│  │                                                                    │ │
│  │  ┌───────────────────────┐    ┌──────────┐ ┌──────────┐          │ │
│  │  │ 精准，方为效率。      │    │  98%     │ │ 0.4s     │          │ │
│  │  │                       │    │ ACCURACY │ │ INFERENCE│          │ │
│  │  │ 停止猜测 Prompt...    │    └──────────┘ └──────────┘          │ │
│  │  └───────────────────────┘                                        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│          ┌── BOTTOM CTA ────────────────────────────────┐                │
│          │  py-32, text-center                           │                │
│          │                                               │                │
│          │        准备好开始创作了吗？                    │                │
│          │    上传参考图，开启你的风格再创作之旅          │                │
│          │                                               │                │
│          │         ┌─────────────────────┐               │                │
│          │         │  ⚡ 开始创作         │               │                │
│          │         └─────────────────────┘               │                │
│          └───────────────────────────────────────────────┘                │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌── FOOTER ──────────────────────────────────────────────────────────┐ │
│  │  py-12, border-t, opacity-60                                      │ │
│  │  ┌─────────────────┐                ┌───────────────────────────┐ │ │
│  │  │ © 2024 StyleGen │                │ Privacy  Terms  API      │ │ │
│  │  └─────────────────┘                └───────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 导航栏 (TopNavBar)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ sticky top-0 z-50 · h-12 · border-b · bg-base/80 · backdrop-blur-xl    │
│                                                                          │
│  ┌────────────────────────────────┐  ┌────────────────────────────────┐ │
│  │ ✦ StyleGen                    │  │ 🔔  ⚙️    [avatar 28px]       │ │
│  │   (text-lg, semibold,         │  │  (icon btns,   rounded-full,   │ │
│  │    tracking-tighter)          │  │   ghost style)  border-ghost   │ │
│  │                               │  │                                │ │
│  │  功能  定价  更新日志          │  │                                │ │
│  │  (text-sm, gap-6)             │  │                                │ │
│  │  活跃项: text-primary         │  │                                │ │
│  │  其他: text-secondary         │  │                                │ │
│  └────────────────────────────────┘  └────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Stitch 参考：**
- 固定定位，`h-12`，`backdrop-blur-xl`，半透明背景 `bg-[#131315]/80`
- 左侧：品牌名（`text-lg font-semibold tracking-tighter`）+ 导航链接
- 右侧：Material Symbols 图标按钮（notifications, settings）+ 用户头像

**当前实现：** `auth-header.tsx` 已改为全宽 sticky 导航栏

**仍需调整：**
- [ ] 添加导航链接占位（Features / Pricing / Changelog 或中文对应）
- [ ] 添加 Material Symbols 工具图标按钮
- [ ] 用户头像区域增加 `border border-outline-variant/20` 边框

### 2.2 Hero 区域

```
┌──────────────────────────────────────────────────────────────────────────┐
│  min-h-[700px] · radial-gradient(circle at 50% -20%) · flex · center   │
│                                                                          │
│                         ┌──────────────────────────┐                     │
│                         │ PRECISION VISUAL INTEL   │  ← rounded-full    │
│                         │ font-mono, text-[10px]   │    bg-low          │
│                         │ uppercase tracking-widest│    border-ghost     │
│                         └──────────────────────────┘                     │
│                                                                          │
│              参考图风格再创作                                             │
│           将视觉灵感转化为                                              │
│         ┌──────────────────────────────────────┐                         │
│         │ AI prompt 模板。                     │  ← text-primary 强调   │
│         └──────────────────────────────────────┘                         │
│                                                                          │
│       上传参考图，AI 自动提取视觉配方，                                  │
│       生成可编辑的 Prompt，一键创建同风格新图                            │
│       (text-lg, text-secondary, max-w-2xl, leading-relaxed)              │
│                                                                          │
│         ┌──────────────────┐  ┌──────────────────┐                      │
│         │   ⚡ 开始创作     │  │   查看示例        │                      │
│         │ bg-primary       │  │ bg-transparent    │                      │
│         │ text-on-primary  │  │ border-ghost      │                      │
│         │ shadow-lg        │  │ text-on-surface   │                      │
│         │ active:scale-95  │  │ hover:bg-low      │                      │
│         └──────────────────┘  └──────────────────┘                      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  mt-20 · max-w-6xl · rounded-xl · overflow-hidden                 │  │
│  │  border-ghost · shadow-2xl · group                                 │  │
│  │  ┌──────────────────────────────────────────────────────────────┐  │  │
│  │  │                                                              │  │  │
│  │  │               展示图 / 产品截图 (aspect-video)                │  │  │
│  │  │               group-hover:scale-105 transition-700            │  │  │
│  │  │                                                              │  │  │
│  │  │  ┌─────────────────────────────────────────────┐             │  │  │
│  │  │  │  bg-bright/80 backdrop-blur-md              │             │  │  │
│  │  │  │  ┌──────┐ ┌──────────────────┐              │             │  │  │
│  │  │  │  │ ▓▓▓▓ │ │ ▓▓▓▓▓▓▓▓▓▓░░░░  │              │  ← overlay │  │  │
│  │  │  │  │ bar  │ │ skeleton lines   │              │    mock     │  │  │
│  │  │  │  └──────┘ └──────────────────┘              │             │  │  │
│  │  │  └─────────────────────────────────────────────┘             │  │  │
│  │  └──────────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

**Stitch 参考：**
```

**当前实现：** `hero.tsx` 有渐变标题、图标容器、单 CTA 按钮

**需调整：**
- [ ] 增加 hero-gradient 背景效果（`radial-gradient`）
- [ ] 添加顶部徽章标签
- [ ] 标题中关键词使用强调色
- [ ] 改为双 CTA 按钮布局（主按钮 + ghost 次按钮）
- [ ] 增大 section 高度至 `min-h-[700px]`，添加 `justify-center`
- [ ] 添加底部展示图区域（可选，需要设计素材）

### 2.3 功能卡片区域 (Features Bento Grid)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  py-32 · px-6 · max-w-7xl · mx-auto                                    │
│                                                                          │
│  grid · grid-cols-1 · md:grid-cols-3 · gap-8                           │
│                                                                          │
│  ┌───────────────────────────┐ ┌───────────────────────────┐ ┌───────────────────────────┐
│  │  p-8 · rounded-xl        │ │  p-8 · rounded-xl        │ │  p-8 · rounded-xl        │
│  │  bg-[--surface-low]      │ │  bg-[--surface-low]      │ │  bg-[--surface-low]      │
│  │  border-ghost/15         │ │  border-ghost/15         │ │  border-ghost/15         │
│  │  hover:border-primary/30 │ │  hover:border-primary/30 │ │  hover:border-primary/30 │
│  │                          │ │                          │ │                          │
│  │  ┌────┐                  │ │  ┌────┐                  │ │  ┌────┐                  │
│  │  │ ⬡  │ w-10 h-10       │ │  │ ⬡  │ w-10 h-10       │ │  │ ⬡  │ w-10 h-10       │
│  │  │visibility│             │ │  │deployed_code│        │ │  │  sync │              │
│  │  └────┘ rounded-md       │ │  └────┘ rounded-md       │ │  └────┘ rounded-md       │
│  │  bg-mid border-ghost/20  │ │  bg-mid border-ghost/20  │ │  bg-mid border-ghost/20  │
│  │  mb-6                    │ │  mb-6                    │ │  mb-6                    │
│  │                          │ │                          │ │                          │
│  │  视觉分析                │ │  结构化配方              │ │  一键生成                │
│  │  text-xl font-semibold   │ │  text-xl font-semibold   │ │  text-xl font-semibold   │
│  │  tracking-tight mb-3     │ │  tracking-tight mb-3     │ │  tracking-tight mb-3     │
│  │                          │ │                          │ │                          │
│  │  AI 深度解析参考图的     │ │  将视觉特征转化为可编辑  │ │  基于提取的视觉配方，    │
│  │  色彩、构图、光照、质感  │ │  的结构化 Prompt 模板    │ │  快速生成同风格的新图片  │
│  │  text-sm leading-relaxed │ │  text-sm leading-relaxed │ │  text-sm leading-relaxed │
│  │                          │ │                          │ │                          │
│  ├──────────────────────────┤ ├──────────────────────────┤ ├──────────────────────────┤
│  │  mt-8 视觉装饰区        │ │  mt-8 视觉装饰区        │ │  mt-8 视觉装饰区        │
│  │                          │ │                          │ │                          │
│  │  ┌────────────────────┐  │ │  ┌──────┐ ┌───────────┐│ │  ┌────┐ ┌────┐ ┌────┐   │
│  │  │ ▓▓▓▓▓▓▓░░░░░░░░░  │  │ │  │Ligh_ │ │Material_ ││ │  │    │ │    │ │    │   │
│  │  │ ▓▓▓ 动画进度条     │  │ │  │Volum │ │Obsidian  ││ │  │    │ │    │ │    │   │
│  │  │ query_stats icon   │  │ │  └──────┘ └───────────┘│ │  └────┘ └────┘ └────┘   │
│  │  │ (text-4xl, op-20)  │  │ │  ┌────────────────────┐│ │  aspect-square bg-mid   │
│  │  └────────────────────┘  │ │  │Lens_35mm_Anamorphic││ │  border-ghost/10 grid   │
│  │  ↑ h-32 rounded border   │ │  └────────────────────┘│ │  3x color grid          │
│  │  animate-pulse 顶部线    │ │  ↑ mono text-[10px]   │ │                          │
│  │                          │ │  uppercase tags        │ │                          │
│  └───────────────────────────┘ └───────────────────────────┘ └───────────────────────────┘
```

**Stitch 参考：**
```
py-32, px-6, max-w-7xl
└── grid grid-cols-3 gap-8
    └── Card: p-8, rounded-xl, bg-surface-container-low, border border-outline-variant/15
        ├── 图标容器: w-10 h-10, rounded-md, bg-surface-container, border
        ├── 标题: text-xl font-semibold tracking-tight
        ├── 描述: text-sm leading-relaxed
        └── 底部视觉装饰区（各有不同）
            ├── Module 1: 动画进度条 + 大图标
            ├── Module 2: 标签组 (uppercase, tracking-wider, font-mono)
            └── Module 3: 3 格网格色块
```

**当前实现：** `value-section.tsx` 有 3 列卡片，但缺少底部视觉装饰

**需调整：**
- [ ] 卡片间距从 gap-6 增至 gap-8
- [ ] 卡片内间距从 px-6 py-8 增至 p-8
- [ ] 图标容器改为 Stitch 风格（`w-10 h-10 rounded-md bg-surface-container border`）
- [ ] 标题文字大小从 text-base 增至 text-xl
- [ ] 增加卡片 hover 效果 `hover:border-primary/30`
- [ ] 增加每张卡片底部的视觉装饰区域

### 2.4 数据统计区域

```
┌──────────────────────────────────────────────────────────────────────────┐
│  py-20 · border-y · border-ghost/10 · bg-base/50                       │
│                                                                          │
│  max-w-7xl · mx-auto · px-8                                             │
│  flex · flex-col · md:flex-row · items-center · justify-between · gap-12│
│                                                                          │
│  ┌───────────────────────────────┐     ┌──────────────────────────────┐ │
│  │ max-w-md                      │     │ flex gap-4                    │ │
│  │                               │     │                              │ │
│  │  精准，方为效率。             │     │  ┌────────────┐ ┌──────────┐│ │
│  │  text-3xl font-semibold       │     │  │ p-6        │ │ p-6      ││ │
│  │  tracking-tight mb-4          │     │  │ rounded-lg │ │rounded-lg││ │
│  │                               │     │  │ bg-mid     │ │bg-mid    ││ │
│  │  停止猜测 Prompt。            │     │  │ border     │ │border    ││ │
│  │  开始工程化它。               │     │  │ ghost/10   │ │ghost/10  ││ │
│  │                               │     │  │            │ │          ││ │
│  │  StyleGen 提供专业的技术      │     │  │  98%       │ │ 0.4s     ││ │
│  │  框架，让艺术家获得完全       │     │  │ text-3xl   │ │text-3xl  ││ │
│  │  的控制权。                   │     │  │ font-bold  │ │font-bold ││ │
│  │                               │     │  │ text-primary│ │text-primary│
│  │  text-on-surface-variant      │     │  │            │ │          ││ │
│  │  text-base leading-relaxed    │     │  │ ACCURACY   │ │INFERENCE ││ │
│  │                               │     │  │ text-[10px]│ │text-[10px││ │
│  └───────────────────────────────┘     │  │ uppercase  │ │uppercase ││ │
│                                        │  │ tracking-  │ │tracking- ││ │
│                                        │  │ widest     │ │widest    ││ │
│                                        │  │ font-mono  │ │font-mono ││ │
│                                        │  └────────────┘ └──────────┘│ │
│                                        └──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

**Stitch 参考：**
```
py-20, border-y, bg-surface-container-lowest/50
└── flex flex-col md:flex-row items-center justify-between gap-12
    ├── 左侧文案区 (max-w-md)
    │   ├── 标题 "Precision is the new speed."
    │   └── 描述文本
    └── 右侧数据卡片组
        ├── 卡片: p-6, rounded-lg, bg-surface, border
        │   ├── 数值 text-3xl font-bold text-primary
        │   └── 标签 text-[10px] uppercase tracking-widest font-mono
```

**当前实现：** 简单的三列数据展示

**需调整：**
- [ ] 改为左右布局（文案 + 数据卡片）
- [ ] 数据卡片使用 Stitch 风格（圆角容器 + border）
- [ ] 标签使用 mono 字体、uppercase、tracking-widest

### 2.5 底部 CTA 区域

```
┌──────────────────────────────────────────────────────────────────────────┐
│  py-32 · text-center · px-6                                            │
│                                                                          │
│  max-w-3xl · mx-auto · space-y-8                                       │
│                                                                          │
│         准备好开始创作了吗？                                              │
│         text-4xl font-semibold tracking-tight                           │
│                                                                          │
│    上传参考图，开启你的风格再创作之旅                                    │
│    text-lg text-[--text-secondary]                                      │
│                                                                          │
│         ┌───────────────────────────────┐                                │
│         │        ⚡ 开始创作             │                                │
│         │  px-10 py-4                   │                                │
│         │  bg-[--text-primary]          │  ← 反转色：深底浅字变为       │
│         │  text-[--surface-base]        │    浅底深字（高对比）         │
│         │  rounded-md font-bold         │                                │
│         │  active:scale-95              │                                │
│         │  transition-transform         │                                │
│         └───────────────────────────────┘                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Stitch 参考：**
```
py-32, text-center
└── max-w-3xl
    ├── 标题 text-4xl font-semibold tracking-tight
    ├── 描述 text-lg text-on-surface-variant
    └── CTA 按钮 (bg-on-surface text-surface, font-bold)
```

**当前实现：** 有 CTA 区域，使用 UploadEntry 组件

**需调整：**
- [ ] 使用 Stitch 风格的大号 CTA 按钮（深底浅字反转）
- [ ] 增大间距至 py-32
- [ ] 可选：将 UploadEntry 放在 CTA 按钮旁边

### 2.6 Footer

```
┌──────────────────────────────────────────────────────────────────────────┐
│  py-12 · border-t · border-ghost/5 · opacity-60                       │
│                                                                          │
│  max-w-7xl · mx-auto                                                    │
│  flex · flex-col · md:flex-row · justify-between · items-center · px-8  │
│                                                                          │
│  ┌─────────────────────────┐         ┌──────────────────────────────────┐
│  │ © 2024 StyleGen         │         │  Privacy  Terms  API  Discord   │
│  │ text-xs font-mono       │         │  text-[10px] font-mono           │
│  │ uppercase tracking-[0.2em]│       │  uppercase tracking-widest       │
│  │ text-secondary/50       │         │  text-secondary/50               │
│  └─────────────────────────┘         │  hover:text-primary              │
│                                      └──────────────────────────────────┘
└──────────────────────────────────────────────────────────────────────────┘
```

**Stitch 参考：**
```
py-12, border-t, opacity-60
├── 左侧: 版权文字 font-mono text-xs uppercase tracking-[0.2em]
└── 右侧: 链接组 font-mono text-[10px] uppercase tracking-widest
```

**当前实现：** 无独立 Footer 组件

**需新增：**
- [ ] 创建 `src/components/landing/footer.tsx` 组件
- [ ] 包含版权信息和底部链接
- [ ] mono 字体、uppercase、tracking-widest 样式

---

## 3. Workspace 改造计划

### 3.0 页面整体线框图

```
┌──────────────────────────────────────────────────────────────────────────┐
│  TOP NAV BAR (sticky, h-12, glassmorphic)  ← 复用 Landing 导航栏       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  max-w-7xl · mx-auto · px-4 · py-8                                    │
│                                                                          │
│  ┌── PAGE HEADER ─────────────────────────────────────────────────────┐ │
│  │  mb-8 · flex · justify-between · items-end                        │ │
│  │  ┌──────────────────────────────┐  ┌──────────────────────────┐  │ │
│  │  │ Prompt Architect (h1)        │  │ ┌──────────────────────┐ │  │ │
│  │  │ 解构并重构视觉结构 (p text-sm)│  │ │  ↻ 重置              │ │  │ │
│  │  └──────────────────────────────┘  │ └──────────────────────┘ │  │ │
│  │                                     └──────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  grid · grid-cols-1 · lg:grid-cols-3 · gap-8                          │
│                                                                          │
│  ┌── COL-1: 参考图 ──────┐  ┌── COL-2: 分析结果 ──────┐  ┌── COL-3: 生成 ─┐
│  │                        │  │                          │  │                │
│  │  ┌──────────────────┐  │  │  ┌─ RECIPE CARD ──────┐ │  │ ┌────────────┐ │
│  │  │                  │  │  │  │                    │ │  │ │ GEN PANEL  │ │
│  │  │                  │  │  │  │  SUBECT: xxxxx     │ │  │ │            │ │
│  │  │   参考图预览     │  │  │  │  SCENE:  xxxxx     │ │  │ │ ■ 1:1      │ │
│  │  │   (w-full,       │  │  │  │  STYLE:  xxxxx     │ │  │ │ □ 4:3      │ │
│  │  │    rounded-xl,   │  │  │  │  LIGHT:  xxxxx     │ │  │ │ □ 16:9     │ │
│  │  │    ring-ghost)   │  │  │  │  ...               │ │  │ │            │ │
│  │  │                  │  │  │  └────────────────────┘ │  │ │ □ 标准      │ │
│  │  └──────────────────┘  │  │                          │  │ │ ● 高清      │ │
│  │                        │  │  ┌─ PROMPT EDITOR ────┐ │  │ │            │ │
│  │  [替换参考图]          │  │  │  Prompt:           │ │  │ │ ┌────────┐ │ │
│  │                        │  │  │  ┌──────────────┐  │ │  │ │ │⚡ 生成  │ │ │
│  │  ┌─ COMPARISON ──────┐ │  │  │  │textarea 6行  │  │ │  │ │ │  图片   │ │ │
│  │  │ (生成后出现)       │ │  │  │  └──────────────┘  │ │  │ │ └────────┘ │ │
│  │  │ ┌───────┐┌──────┐ │ │  │  │                    │ │  │ └────────────┘ │ │
│  │  │ │参考图 ││结果图│ │ │  │  │  Negative Prompt: │ │  │                │
│  │  │ └───────┘└──────┘ │ │  │  │  ┌──────────────┐  │ │  │ ┌────────────┐ │
│  │  └──────────────────┘ │  │  │  │textarea 3行  │  │ │  │ │ PROGRESS   │ │
│  │                        │  │  │  └──────────────┘  │ │  │ │ (生成中)   │ │
│  │                        │  │  └────────────────────┘ │  │ └────────────┘ │
│  │                        │  │                          │  │                │
│  │                        │  │                          │  │ ┌────────────┐ │
│  │                        │  │                          │  │ │ RESULT     │ │
│  │                        │  │                          │  │ │ [生成图]   │ │
│  │                        │  │                          │  │ │ ▼ download │ │
│  │                        │  │                          │  │ └────────────┘ │
│  └────────────────────────┘  └──────────────────────────┘  └────────────────┘
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.1 整体布局结构

**Stitch 参考：**
```
┌──────────────────────────────────────────────────────┐
│ TopNavBar (h-12, fixed)                              │
├──────┬───────────────────────────────────────────────┤
│      │                                               │
│ Side │  Main Content (w-3/4)     │ Control Panel     │
│ bar  │                           │ (w-1/4)           │
│ 256px│                           │                   │
│      │  - Header + Action        │ - Quick Edit      │
│      │  - Drop Zone              │ - Aspect Ratio    │
│      │  - Extracted Structure    │ - Generate Button │
│      │                           │ - Recent History  │
│      │                           │                   │
├──────┴───────────────────────────┴───────────────────┤
│ Footer (h-10, fixed bottom)                          │
└──────────────────────────────────────────────────────┘
```

**当前实现：** 三列等宽网格 `lg:grid-cols-3`

**需调整：**
- [ ] 新增左侧边栏导航（可选，当前项目功能不足以支撑完整侧边栏）
- [ ] **替代方案**：保持当前三列布局，但调整比例为更接近 Stitch 的内容区 + 控制面板模式
- [ ] 中列（分析+配方+Prompt）作为主内容区
- [ ] 右列（生成面板）作为控制面板，参考 Stitch 的控制面板风格

### 3.2 侧边栏 (SideNavBar)

**Stitch 参考：**
```
fixed, left-0, top-12, h-[calc(100vh-3rem)], w-64
bg-surface-container-lowest, border-r
├── Workspace 标题区 (uppercase, tracking-widest)
├── 导航项组
│   ├── Generate (active: text-primary, bg-surface-container)
│   ├── Library
│   └── Models
└── 底部链接 (Docs, Support)
```

**改造决策：** 当前阶段不新增侧边栏。原因：
1. 当前产品功能仅覆盖"上传→分析→生成"单条线
2. 缺少 Library、Models 等概念支撑侧边栏导航
3. 添加空侧边栏会降低有效内容面积
4. 后续功能扩展时再评估引入

### 3.3 页面头部区域

**Stitch 参考：**
```
header: flex justify-between items-end, mb-8
├── 左侧
│   ├── h1: text-2xl font-semibold tracking-tight
│   └── p: text-on-surface-variant text-sm
└── 右侧
    └── Action 按钮 (bg-primary-container, text-sm)
```

**当前实现：** 简单的 `h1` + 三列各自的 `h2` 标题

**需调整：**
- [ ] 为工作区页面添加统一头部区域
- [ ] 左侧标题 + 描述文字
- [ ] 右侧操作按钮（"保存为模板"或"重置"）

### 3.4 上传/拖拽区 (Drop Zone)

**Stitch 参考：**
```
aspect-video, rounded-xl, bg-surface-container-lowest
border-2 border-dashed border-outline-variant/20
hover:border-primary/40
├── 居中内容
│   ├── material icon "upload_file" (text-4xl)
│   ├── 主文字 "Drop reference image"
│   └── 辅助文字 (text-xs)
└── 背景视觉占位图 (absolute, opacity-10)
```

**当前实现：** `upload-zone.tsx` 有类似拖拽区

**需调整：**
- [ ] 改为 `aspect-video` 宽屏比例
- [ ] 添加 hover 时 `border-primary/40` 效果
- [ ] 图标从 `add_photo_alternate` 改为 `upload_file`（与 Stitch 一致）
- [ ] 可选：添加背景视觉占位

### 3.5 提取结构卡片 (Extracted Structure / Recipe Card)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  p-6 · rounded-xl · bg-[--surface-mid] · border-ghost/10               │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ⚡ account_tree  ·  EXTRACTED STRUCTURE                            │ │
│  │ icon text-primary   text-sm font-semibold uppercase tracking-widest│ │
│  │                       text-[--text-secondary]                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  grid · grid-cols-2 · gap-x-12 · gap-y-8 · mt-6                      │
│                                                                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │ SUBJECT                     │  │ STYLE                           │ │
│  │ text-[10px] font-bold       │  │ text-[10px] font-bold           │ │
│  │ uppercase tracking-widest   │  │ uppercase tracking-widest       │ │
│  │ text-[--text-secondary]/60  │  │ text-[--text-secondary]/60      │ │
│  │                             │  │                                 │ │
│  │ ┌─────────────────────── ✏️ ┐│  │ ┌─────────────────────── 🎨 ┐ │ │
│  │ │ Cybernetic organism     ││  │ │ Cinematic Hyper-realism │ │ │
│  │ │ bg-lowest border-none   ││  │ │ bg-lowest border-none   │ │ │
│  │ │ focus:ring-primary      ││  │ │ focus:ring-primary      │ │ │
│  │ │ py-2 px-3 text-sm       ││  │ │ py-2 px-3 text-sm       │ │ │
│  │ └────────────────────────┘│  │ └─────────────────────────┘ │ │
│  └─────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                          │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │ LIGHTING                    │  │ COMPOSITION                     │ │
│  │ text-[10px] font-bold       │  │ text-[10px] font-bold           │ │
│  │ uppercase tracking-widest   │  │ uppercase tracking-widest       │ │
│  │                             │  │                                 │ │
│  │ ┌─────────────────────── ☀ ┐│  │ ┌─────────────────── 🎯 ┐     │ │
│  │ │ Low-key, volumetric     ││  │ │ Extreme close-up     │     │ │
│  │ │ blue neon               ││  │ │ centered             │     │ │
│  │ └────────────────────────┘│  │ └───────────────────────┘     │ │
│  └─────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                          │
│  右侧图标: edit · palette · light_mode · center_focus_weak             │
│  text-[14px] text-[--text-secondary]/40 · absolute right-3 top-2.5     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Stitch 参考：**
```
p-6, rounded-xl, bg-surface-container, border-outline-variant/10
├── 标题行: material icon + uppercase tracking-widest 标签
└── grid grid-cols-2 gap-x-12 gap-y-8
    └── 每个字段
        ├── label: text-[10px] uppercase tracking-widest text-on-surface-variant/60
        ├── input: bg-surface-container-lowest, border-none, focus:ring-primary
        └── 右侧图标 (edit, palette, light_mode, center_focus_weak)
```

**当前实现：** `recipe-card.tsx` 为只读展示

**需调整：**
- [ ] 标签样式改为 Stitch 风格（`text-[10px] uppercase tracking-widest`）
- [ ] 考虑将部分字段改为可编辑 input（长期目标，当前保持只读）
- [ ] 每个字段添加右侧小图标装饰

### 3.6 控制面板 (右侧栏 / Generate Panel)

```
┌──────────────────────────────────────┐
│  w-full · bg-[--surface-low]        │
│  border-l · border-ghost/15         │
│  · p-6 · space-y-6                  │
│                                      │
│  ┌── QUICK EDIT ──────────────────┐ │
│  │ text-xs font-bold uppercase   │ │
│  │ tracking-widest mb-4          │ │
│  │                               │ │
│  │ ┌───────────────────────────┐ │ │
│  │ │ 编辑生成指令...           │ │ │
│  │ │ textarea · bg-lowest      │ │ │
│  │ │ border-ghost/10           │ │ │
│  │ │ focus:border-primary/50   │ │ │
│  │ │ rounded-lg · p-3 · rows-3 │ │ │
│  │ │ placeholder:text-sec/30   │ │ │
│  │ └───────────────────────────┘ │ │
│  └───────────────────────────────┘ │
│                                      │
│  ┌── ASPECT RATIO ────────────────┐ │
│  │ text-xs font-bold uppercase   │ │
│  │ tracking-widest mb-4          │ │
│  │                               │ │
│  │ grid · grid-cols-3 · gap-2    │ │
│  │                               │ │
│  │ ┌─────────┐┌─────────┐┌────┐│ │
│  │ │ ┌───┐   ││ ┌─────┐ ││┌──┐││ │
│  │ │ │   │   ││ │     │ │││  │││ │
│  │ │ └───┘   ││ └─────┘ ││└──┘││ │
│  │ │  1:1    ││  16:9   ││9:16││ │
│  │ │ ●active ││ □normal ││ □ ││ │
│  │ │bg-bright││bg-bright││    ││ │
│  │ │border-  ││/40      ││    ││ │
│  │ │primary/ ││border-  ││    ││ │
│  │ │40       ││ghost/10 ││    ││ │
│  │ │text-    ││         ││    ││ │
│  │ │primary  ││         ││    ││ │
│  │ └─────────┘└─────────┘└────┘│ │
│  └───────────────────────────────┘ │
│                                      │
│  ┌── QUALITY ────────────────────┐  │
│  │  ┌──────────┐ ┌──────────┐   │  │
│  │  │  标准    │ │  ●高清   │   │  │
│  │  └──────────┘ └──────────┘   │  │
│  └───────────────────────────────┘  │
│                                      │
│  ┌──────────────────────────────────┐│
│  │  ⚡ bolt    生成图片              ││
│  │  w-full · py-4 · rounded-xl     ││
│  │  bg-primary · text-on-primary   ││
│  │  font-bold · shadow-lg          ││
│  │  shadow-primary/10              ││
│  │  hover:brightness-110           ││
│  │  active:scale-[0.98]            ││
│  │  flex · items-center · gap-2   ││
│  │  justify-center                 ││
│  │  material icon: bolt (FILL: 1)  ││
│  └──────────────────────────────────┘│
│                                      │
│  ┌── PROGRESS (生成中) ───────────┐ │
│  │ rounded-lg · border-primary/30 │ │
│  │ bg-primary/5 · p-4            │ │
│  │                                │ │
│  │ 🔄 正在生成图片...             │ │
│  │ 已等待 12s · 预计 10-60s      │ │
│  │                                │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  │  │ │
│  │ │ progress bar animated    │  │ │
│  │ └──────────────────────────┘  │ │
│  └───────────────────────────────┘ │
│                                      │
│  ┌── RESULT (生成完成) ───────────┐ │
│  │ bg-mid · ring-ghost · p-4    │ │
│  │ ┌──────────────────────────┐  │ │
│  │ │                          │  │ │
│  │ │    [生成结果图]          │  │ │
│  │ │    rounded-lg · w-full   │  │ │
│  │ │                          │  │ │
│  │ └──────────────────────────┘  │ │
│  │ 宽高比: 1:1  画质: 高清      │ │
│  │ ▼ 查看使用的 Prompt          │ │
│  │                               │ │
│  │ ┌──────────┐ ┌──────────┐   │ │
│  │ │ ⬇ 下载   │ │ ↑ 新图   │   │ │
│  │ │ btn-glow │ │ ghost    │   │ │
│  │ └──────────┘ └──────────┘   │ │
│  └───────────────────────────────┘ │
└──────────────────────────────────────┘
```

**Stitch 参考：**
```
w-1/4, bg-surface-container-low, border-l
├── Quick Edit 区域
│   ├── textarea (bg-surface-container-lowest, placeholder)
│   └── Aspect Ratio 选择器
│       └── grid grid-cols-3
│           └── 每个按钮: flex-col, 可视化比例图标 + 文字
├── Generate Button (w-full, py-4, shadow-primary/10, material icon bolt)
└── Recent History 底部
    └── grid grid-cols-2, 缩略图 + add 按钮
```

**当前实现：** `generate-panel.tsx` + `generation-progress.tsx` + `result-display.tsx`

**需调整：**
- [ ] Aspect Ratio 按钮改为 Stitch 的可视化比例图标样式
- [ ] 生成按钮增加 `shadow-lg shadow-primary/10` 和 Material Symbol `bolt`
- [ ] 生成进度条增加动画脉冲效果
- [ ] 结果展示区增加 Recent History 风格（可选）

### 3.7 底部 Footer

**Stitch 参考：**
```
fixed bottom-0, h-10, bg-surface/50 backdrop-blur-sm
├── 左侧: 版权 font-mono text-[10px]
└── 右侧: 链接组 font-mono text-[10px]
```

**需新增：**
- [ ] Workspace 页面添加固定底部 Footer（可选）

---

## 4. 通用样式规则

### 4.1 Ghost Border

Stitch 的边框哲学：边框应该"被感受到，而不是被看到"。

```css
/* Ghost border */
border border-outline-variant/15    /* 15% 透明度 */
border border-outline-variant/10    /* 10% 透明度（更微妙） */
border border-outline-variant/20    /* 20% 透明度（强调用） */
```

**应用到当前项目：**
```css
border border-[var(--border)]/15
border border-[var(--border)]/10
border border-[var(--border)]/20
```

### 4.2 技术标签样式

Stitch 使用统一的技术标签风格，用于元数据、状态标签等：

```css
text-[10px] font-bold uppercase tracking-widest font-mono
```

**应用场景：**
- Recipe Card 的字段标签（"SUBJECT"、"STYLE"等）
- 生成参数标签（"ASPECT RATIO"、"QUALITY"）
- 状态标签

### 4.3 卡片 Hover 效果

```css
hover:border-[var(--accent-primary)]/30 transition-all duration-300
```

### 4.4 背景模糊效果

```css
/* 导航栏 */
bg-[var(--surface-base)]/80 backdrop-blur-xl

/* 浮层 */
bg-[var(--surface-bright)]/80 backdrop-blur-md
```

---

## 5. 实施优先级

### P0 - 高优先级（视觉核心）

1. **Landing Page Hero 重构** — 徽章标签、强调色关键词、双 CTA
2. **功能卡片视觉装饰** — 每张卡片增加底部装饰区域
3. **技术标签样式** — 统一 Recipe Card 和 Generate Panel 的标签风格
4. **Ghost Border 应用** — 降低所有边框透明度

### P1 - 中优先级（体验提升）

5. **数据统计区域重构** — 改为左右布局
6. **底部 CTA 重构** — 深底浅字反转按钮
7. **导航栏增强** — 添加链接和图标按钮
8. **Aspect Ratio 可视化** — 改为图标式选择器

### P2 - 低优先级（锦上添花）

9. **Footer 组件** — Landing Page 底部信息栏
10. **Workspace 头部区域** — 统一标题 + 操作按钮
11. **背景视觉效果** — Hero 区域 radial-gradient、上传区视觉占位
12. **动画效果** — 卡片 hover 缩放、进度条脉冲

---

## 6. 文件修改清单

### Landing Page 相关

| 文件 | 改动范围 | 优先级 |
|------|---------|-------|
| `src/components/landing/hero.tsx` | 重构：增加徽章、双 CTA、gradient 背景 | P0 |
| `src/components/landing/value-section.tsx` | 增强卡片：装饰区域、hover 效果 | P0 |
| `src/components/landing/upload-entry.tsx` | 微调样式 | P1 |
| `src/components/auth/auth-header.tsx` | 增加导航链接和图标 | P1 |
| `src/app/page.tsx` | 调整布局结构和间距 | P1 |
| `src/components/landing/footer.tsx` | **新建** Footer 组件 | P2 |

### Workspace 相关

| 文件 | 改动范围 | 优先级 |
|------|---------|-------|
| `src/components/workspace/recipe-card.tsx` | 标签改为技术样式、字段图标 | P0 |
| `src/components/workspace/generate-panel.tsx` | Aspect Ratio 可视化、生成按钮增强 | P1 |
| `src/components/workspace/upload-zone.tsx` | 宽屏比例、hover 边框效果 | P1 |
| `src/components/workspace/empty-analysis.tsx` | 技术标签样式 | P1 |
| `src/components/workspace/analysis-progress.tsx` | 微调样式 | P2 |
| `src/components/workspace/generation-progress.tsx` | 微调样式 | P2 |
| `src/components/workspace/result-display.tsx` | 微调样式 | P2 |
| `src/components/workspace/comparison-view.tsx` | 微调样式 | P2 |
| `src/components/workspace/error-display.tsx` | Ghost border | P2 |
| `src/components/workspace/retry-button.tsx` | 微调样式 | P2 |
| `src/app/workspace/page.tsx` | 整体间距调整、可选头部区域 | P2 |

### 全局

| 文件 | 改动范围 | 优先级 |
|------|---------|-------|
| `src/app/globals.css` | 新增 `.label-tech` 工具类、hero-gradient | P0 |

---

## 7. 验证标准

- [ ] `pnpm type-check` 通过
- [ ] `pnpm lint` 无新增 error
- [ ] `pnpm test` 全部通过（预计需更新 5-8 个测试文件的 class 断言）
- [ ] `pnpm dev` 手动验证：
  - Landing Page：导航栏 → Hero → 功能卡片 → 数据统计 → CTA → Footer
  - Workspace：上传 → 分析 → 编辑 → 生成 → 查看结果
  - 响应式：移动端和桌面端布局均正常
