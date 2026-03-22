-- assets 表
CREATE TABLE IF NOT EXISTS assets (
  id            VARCHAR(26) PRIMARY KEY,  -- ULID
  type          VARCHAR(20) NOT NULL,     -- 'reference' | 'generated'
  file_url      TEXT NOT NULL,
  thumbnail_url TEXT,
  width         INTEGER NOT NULL,
  height        INTEGER NOT NULL,
  mime_type     VARCHAR(50) NOT NULL,     -- image/jpeg, image/png, image/webp
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- analysis_tasks 表
CREATE TABLE IF NOT EXISTS analysis_tasks (
  id                   VARCHAR(26) PRIMARY KEY,
  source_asset_id      VARCHAR(26) NOT NULL REFERENCES assets(id),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  recipe               JSONB,           -- VisualRecipe JSON
  prompt_text          TEXT,
  negative_prompt_text TEXT,
  raw_response         TEXT,            -- 视觉模型原始返回
  error_message        TEXT,
  error_stage          VARCHAR(20),     -- 'vision' | 'llm'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- generation_tasks 表
CREATE TABLE IF NOT EXISTS generation_tasks (
  id                       VARCHAR(26) PRIMARY KEY,
  analysis_task_id         VARCHAR(26) NOT NULL REFERENCES analysis_tasks(id),
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
  prompt_snapshot          TEXT NOT NULL,
  negative_prompt_snapshot TEXT NOT NULL,
  params                   JSONB NOT NULL,    -- GenerationParams
  model_name               VARCHAR(100) NOT NULL,
  result_asset_id          VARCHAR(26) REFERENCES assets(id),
  error_message            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
