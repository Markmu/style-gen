-- Style-Gen 开发数据库初始化脚本
-- 基于架构文档 7.2 推荐最小 Schema

-- 资产表：参考图 + 生成图
CREATE TABLE IF NOT EXISTS assets (
  id            VARCHAR(26) PRIMARY KEY,          -- ULID
  type          VARCHAR(20) NOT NULL CHECK (type IN ('reference', 'generated')),
  file_url      TEXT        NOT NULL,
  thumbnail_url TEXT,
  width         INTEGER     NOT NULL,
  height        INTEGER     NOT NULL,
  mime_type     VARCHAR(50) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 分析任务表
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id                   VARCHAR(26) PRIMARY KEY,   -- ULID
  source_asset_id      VARCHAR(26) NOT NULL REFERENCES assets(id),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  recipe               JSONB,                     -- 结构化视觉配方
  prompt_text          TEXT,
  negative_prompt_text TEXT,
  raw_response         TEXT,                       -- 视觉模型原始返回，用于排障
  error_message        TEXT,
  error_stage          VARCHAR(10) CHECK (error_stage IN ('vision', 'llm')),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 生成任务表
CREATE TABLE IF NOT EXISTS generation_tasks (
  id                        VARCHAR(26) PRIMARY KEY,  -- ULID
  analysis_task_id          VARCHAR(26) NOT NULL REFERENCES analysis_tasks(id),
  status                    VARCHAR(20) NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  prompt_snapshot           TEXT        NOT NULL,
  negative_prompt_snapshot  TEXT        NOT NULL,
  params                    JSONB       NOT NULL,     -- GenerationParams: aspectRatio, quality
  model_name                VARCHAR(100) NOT NULL,
  result_asset_id           VARCHAR(26) REFERENCES assets(id),
  error_message             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按 source_asset_id 查分析任务
CREATE INDEX IF NOT EXISTS idx_analysis_tasks_source_asset
  ON analysis_tasks(source_asset_id);

-- 索引：按 analysis_task_id 查生成任务
CREATE INDEX IF NOT EXISTS idx_generation_tasks_analysis_task
  ON generation_tasks(analysis_task_id);

-- 索引：按状态过滤任务（轮询场景）
CREATE INDEX IF NOT EXISTS idx_analysis_tasks_status
  ON analysis_tasks(status) WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_generation_tasks_status
  ON generation_tasks(status) WHERE status IN ('pending', 'processing');
