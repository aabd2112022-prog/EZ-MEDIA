-- =========================================================
-- EZ MEDIA
-- DATABASE UPGRADE
-- Version 8.1.0
-- =========================================================

BEGIN;

-- =========================================================
-- 1. تطوير جدول المصادر
-- =========================================================

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS section_id TEXT;

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS branch TEXT;

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS auto_publish BOOLEAN DEFAULT FALSE;

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS fetch_interval_minutes INTEGER DEFAULT 30;

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS max_items_per_run INTEGER DEFAULT 10;

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS transform_mode TEXT DEFAULT 'summary';

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

ALTER TABLE sources
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();


CREATE INDEX IF NOT EXISTS idx_sources_active
ON sources(active);

CREATE INDEX IF NOT EXISTS idx_sources_section
ON sources(section_id);


-- =========================================================
-- 2. عناصر المصادر
-- منع تكرار المحتوى القادم من الإنترنت
-- =========================================================

CREATE TABLE IF NOT EXISTS source_items (

  id TEXT PRIMARY KEY,

  source_id TEXT NOT NULL,

  external_id TEXT NOT NULL,

  external_url TEXT,

  title TEXT NOT NULL,

  published_at TIMESTAMP,

  content_hash TEXT NOT NULL,

  raw JSONB,

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(source_id, external_id)

);


CREATE INDEX IF NOT EXISTS idx_source_items_source
ON source_items(source_id);

CREATE INDEX IF NOT EXISTS idx_source_items_hash
ON source_items(content_hash);

CREATE INDEX IF NOT EXISTS idx_source_items_published
ON source_items(published_at);


-- =========================================================
-- 3. طابور توزيع المحتوى
-- =========================================================

CREATE TABLE IF NOT EXISTS distribution_queue (

  id TEXT PRIMARY KEY,

  content_id TEXT,

  platform TEXT NOT NULL,

  target TEXT,

  status TEXT DEFAULT 'queued',

  payload JSONB,

  attempts INTEGER DEFAULT 0,

  last_error TEXT,

  next_attempt_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_distribution_status
ON distribution_queue(status);

CREATE INDEX IF NOT EXISTS idx_distribution_platform
ON distribution_queue(platform);

CREATE INDEX IF NOT EXISTS idx_distribution_content
ON distribution_queue(content_id);

CREATE INDEX IF NOT EXISTS idx_distribution_next_attempt
ON distribution_queue(next_attempt_at);


-- =========================================================
-- 4. قواعد الأتمتة
-- =========================================================

CREATE TABLE IF NOT EXISTS automation_rules (

  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,

  trigger_type TEXT NOT NULL,

  action_type TEXT NOT NULL,

  config JSONB DEFAULT '{}'::jsonb,

  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP DEFAULT NOW(),

  updated_at TIMESTAMP DEFAULT NOW()

);


CREATE INDEX IF NOT EXISTS idx_automation_rules_active
ON automation_rules(active);


-- =========================================================
-- 5. سجل تشغيل الأتمتة
-- =========================================================

ALTER TABLE automation_runs
ADD COLUMN IF NOT EXISTS job_id TEXT;

ALTER TABLE automation_runs
ADD COLUMN IF NOT EXISTS source_id TEXT;

ALTER TABLE automation_runs
ADD COLUMN IF NOT EXISTS processed_count INTEGER DEFAULT 0;

ALTER TABLE automation_runs
ADD COLUMN IF NOT EXISTS published_count INTEGER DEFAULT 0;

ALTER TABLE automation_runs
ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;

ALTER TABLE automation_runs
ADD COLUMN IF NOT EXISTS details JSONB;


CREATE INDEX IF NOT EXISTS idx_automation_runs_source
ON automation_runs(source_id);

CREATE INDEX IF NOT EXISTS idx_automation_runs_status
ON automation_runs(status);


-- =========================================================
-- 6. تطوير المحتوى
-- =========================================================

ALTER TABLE content
ADD COLUMN IF NOT EXISTS excerpt TEXT;

ALTER TABLE content
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE content
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;

ALTER TABLE content
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;


CREATE INDEX IF NOT EXISTS idx_content_status
ON content(status);

CREATE INDEX IF NOT EXISTS idx_content_section
ON content(section_id);

CREATE INDEX IF NOT EXISTS idx_content_branch
ON content(branch);

CREATE INDEX IF NOT EXISTS idx_content_scheduled
ON content(scheduled_at);


-- =========================================================
-- 7. إعدادات الأتمتة
-- =========================================================

INSERT INTO settings
(
  key,
  value
)
VALUES
(
  'automation_enabled',
  'true'
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;


INSERT INTO settings
(
  key,
  value
)
VALUES
(
  'automation_interval_ms',
  '60000'
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;


INSERT INTO settings
(
  key,
  value
)
VALUES
(
  'source_fetch_timeout_ms',
  '15000'
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;


INSERT INTO settings
(
  key,
  value
)
VALUES
(
  'max_items_per_source',
  '10'
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;


-- =========================================================
-- 8. إعدادات التوزيع
-- =========================================================

INSERT INTO settings
(
  key,
  value
)
VALUES
(
  'distribution_enabled',
  'true'
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;


-- =========================================================
-- 9. قواعد أتمتة افتراضية
-- =========================================================

INSERT INTO automation_rules
(
  id,
  name,
  trigger_type,
  action_type,
  config,
  active
)
VALUES
(
  'rule_fetch_sources',
  'جلب المصادر تلقائياً',
  'schedule',
  'fetch_sources',
  '{"interval_minutes":30}'::jsonb,
  TRUE
)
ON CONFLICT (id)
DO NOTHING;


INSERT INTO automation_rules
(
  id,
  name,
  trigger_type,
  action_type,
  config,
  active
)
VALUES
(
  'rule_process_content',
  'معالجة المحتوى تلقائياً',
  'new_source_item',
  'process_content',
  '{"mode":"summary"}'::jsonb,
  TRUE
)
ON CONFLICT (id)
DO NOTHING;


INSERT INTO automation_rules
(
  id,
  name,
  trigger_type,
  action_type,
  config,
  active
)
VALUES
(
  'rule_publish_content',
  'نشر المحتوى تلقائياً',
  'processed_content',
  'publish_content',
  '{"auto_publish":true}'::jsonb,
  TRUE
)
ON CONFLICT (id)
DO NOTHING;


INSERT INTO automation_rules
(
  id,
  name,
  trigger_type,
  action_type,
  config,
  active
)
VALUES
(
  'rule_distribution',
  'تجهيز توزيع المحتوى',
  'published_content',
  'queue_distribution',
  '{"enabled":true}'::jsonb,
  TRUE
)
ON CONFLICT (id)
DO NOTHING;


-- =========================================================
-- 10. المنصات المرتبطة بالتوزيع
-- =========================================================

INSERT INTO settings
(
  key,
  value
)
VALUES
(
  'distribution_platforms',
  'snapchat,tiktok,instagram,youtube,x,facebook'
)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value;


-- =========================================================
-- 11. تحديث timestamps
-- =========================================================

UPDATE sources
SET created_at = COALESCE(created_at, NOW()),
    updated_at = NOW();

UPDATE content
SET updated_at = COALESCE(updated_at, NOW());


-- =========================================================
-- انتهت الترقية
-- =========================================================

COMMIT;
