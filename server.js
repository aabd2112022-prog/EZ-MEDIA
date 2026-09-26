"use strict";

/*
=========================================================
 EZ MEDIA — GLOBAL SMART MEDIA PLATFORM
 Backend API
 Node.js 20+ / Express / PostgreSQL
 Railway Ready
=========================================================
*/

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const APP_URL =
  process.env.APP_URL ||
  "https://ez-media-production-cfa2.up.railway.app";

const PLATFORM_NAME = "EZ MEDIA";
const PLATFORM_VERSION = "6.0.0";

/*
=========================================================
 SECURITY / MIDDLEWARE
=========================================================
*/

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(
  cors({
    origin: true,
    credentials: false
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

/*
=========================================================
 DATABASE
=========================================================
*/

const DATABASE_URL = process.env.DATABASE_URL || "";

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on("error", (error) => {
    console.error("PostgreSQL pool error:", error);
  });
}

/*
=========================================================
 HELPERS
=========================================================
*/

function id() {
  return crypto.randomUUID();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function clean(value, fallback = null) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value;
}

function bool(value, fallback = true) {
  if (value === undefined || value === null) return fallback;

  if (typeof value === "boolean") return value;

  return ["true", "1", "yes", "on"].includes(
    String(value).toLowerCase()
  );
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function json(value, fallback = {}) {
  if (value === undefined || value === null) return fallback;

  if (typeof value === "object") return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requireDatabase(req, res, next) {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "DATABASE_URL غير مضبوط في Railway."
    });
  }

  next();
}

/*
=========================================================
 OPTIONAL ADMIN PROTECTION
=========================================================

إذا وضعت:
ADMIN_TOKEN=your-secret-token

في Railway Variables،
فإن عمليات POST/PUT/PATCH/DELETE تحتاج:
Authorization: Bearer your-secret-token

إذا لم تضع ADMIN_TOKEN، يسمح النظام بالطلبات الإدارية
لتسهيل الإعداد الأولي.
=========================================================
*/

function requireAdmin(req, res, next) {
  const configuredToken = process.env.ADMIN_TOKEN;

  if (!configuredToken) {
    return next();
  }

  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authorization مطلوب."
    });
  }

  const token = auth.substring(7);

  if (token !== configuredToken) {
    return res.status(403).json({
      success: false,
      error: "رمز الإدارة غير صحيح."
    });
  }

  next();
}

/*
=========================================================
 30 GLOBAL SECTIONS
=========================================================
*/

const DEFAULT_SECTIONS = [
  {
    name: "الأخبار",
    slug: "news",
    icon: "📰",
    description: "آخر الأخبار والتحديثات"
  },
  {
    name: "الأخبار العاجلة",
    slug: "breaking-news",
    icon: "🚨",
    description: "الأخبار العاجلة والمهمة"
  },
  {
    name: "السعودية",
    slug: "saudi",
    icon: "🇸🇦",
    description: "أخبار وتقارير السعودية"
  },
  {
    name: "الخليج",
    slug: "gulf",
    icon: "🌍",
    description: "أخبار دول الخليج"
  },
  {
    name: "العالم",
    slug: "world",
    icon: "🌐",
    description: "الأخبار العالمية"
  },
  {
    name: "الاقتصاد",
    slug: "economy",
    icon: "📈",
    description: "الاقتصاد والأسواق"
  },
  {
    name: "الأعمال",
    slug: "business",
    icon: "💼",
    description: "الشركات وريادة الأعمال"
  },
  {
    name: "التقنية",
    slug: "technology",
    icon: "💻",
    description: "التقنية والتحول الرقمي"
  },
  {
    name: "الذكاء الاصطناعي",
    slug: "artificial-intelligence",
    icon: "🧠",
    description: "الذكاء الاصطناعي ومستقبله"
  },
  {
    name: "الابتكار",
    slug: "innovation",
    icon: "💡",
    description: "الابتكار والمشاريع المستقبلية"
  },
  {
    name: "الثقافة",
    slug: "culture",
    icon: "📚",
    description: "الثقافة والمعرفة"
  },
  {
    name: "الفن",
    slug: "art",
    icon: "🎨",
    description: "الفنون والإبداع"
  },
  {
    name: "الترفيه",
    slug: "entertainment",
    icon: "🎭",
    description: "الترفيه والفعاليات"
  },
  {
    name: "المجتمع",
    slug: "society",
    icon: "👥",
    description: "قضايا ومبادرات المجتمع"
  },
  {
    name: "الرياضة",
    slug: "sports",
    icon: "🏆",
    description: "الأخبار والفعاليات الرياضية"
  },
  {
    name: "السياحة",
    slug: "tourism",
    icon: "✈️",
    description: "السياحة والوجهات"
  },
  {
    name: "السيارات",
    slug: "automotive",
    icon: "🚗",
    description: "السيارات والتنقل"
  },
  {
    name: "الصحة",
    slug: "health",
    icon: "❤️",
    description: "الصحة والتوعية"
  },
  {
    name: "التعليم",
    slug: "education",
    icon: "🎓",
    description: "التعليم والتطوير"
  },
  {
    name: "البيئة",
    slug: "environment",
    icon: "🌱",
    description: "البيئة والاستدامة"
  },
  {
    name: "الفيديو",
    slug: "video",
    icon: "🎥",
    description: "الفيديو والتقارير المرئية"
  },
  {
    name: "التغطيات",
    slug: "coverage",
    icon: "📡",
    description: "التغطيات الميدانية"
  },
  {
    name: "المقابلات",
    slug: "interviews",
    icon: "🎤",
    description: "المقابلات والحوارات"
  },
  {
    name: "التقارير",
    slug: "reports",
    icon: "📊",
    description: "التقارير الإعلامية"
  },
  {
    name: "البودكاست",
    slug: "podcast",
    icon: "🎙️",
    description: "البرامج والحلقات الصوتية"
  },
  {
    name: "البث المباشر",
    slug: "live",
    icon: "🔴",
    description: "البث المباشر"
  },
  {
    name: "القناة الرقمية",
    slug: "digital-channel",
    icon: "📺",
    description: "قناة EZ MEDIA الرقمية"
  },
  {
    name: "الإعلانات",
    slug: "advertising",
    icon: "📢",
    description: "الإعلانات والرعاية"
  },
  {
    name: "الخدمات الإعلامية",
    slug: "media-services",
    icon: "🎬",
    description: "التغطيات والإنتاج والخدمات"
  },
  {
    name: "EZ AI",
    slug: "ez-ai",
    icon: "🤖",
    description: "مركز الذكاء الاصطناعي الإعلامي"
  }
];

/*
=========================================================
 DATABASE INITIALIZATION
=========================================================
*/

async function initDatabase() {
  if (!pool) {
    console.warn("DATABASE_URL غير موجود.");
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    /*
    Languages
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS languages (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        native_name TEXT,
        direction TEXT DEFAULT 'ltr',
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Sections
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        icon TEXT,
        description TEXT,
        parent_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
        sort_order INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Banners
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id TEXT PRIMARY KEY,
        section_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
        parent_section_id TEXT REFERENCES sections(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        subtitle TEXT,
        description TEXT,
        image_url TEXT,
        link_url TEXT,
        button_text TEXT,
        position TEXT DEFAULT 'section',
        sort_order INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT TRUE,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Content
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS content (
        id TEXT PRIMARY KEY,
        section_id TEXT REFERENCES sections(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        slug TEXT,
        type TEXT DEFAULT 'article',
        status TEXT DEFAULT 'draft',
        excerpt TEXT,
        description TEXT,
        body TEXT,
        author TEXT,
        source_name TEXT,
        source_url TEXT,
        image_url TEXT,
        video_url TEXT,
        audio_url TEXT,
        external_url TEXT,
        language_code TEXT DEFAULT 'ar',
        tags JSONB DEFAULT '[]'::jsonb,
        metadata JSONB DEFAULT '{}'::jsonb,
        seo_title TEXT,
        seo_description TEXT,
        seo_keywords TEXT,
        views BIGINT DEFAULT 0,
        featured BOOLEAN DEFAULT FALSE,
        breaking BOOLEAN DEFAULT FALSE,
        scheduled_at TIMESTAMPTZ,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Content translations
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_translations (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL REFERENCES content(id) ON DELETE CASCADE,
        language_code TEXT NOT NULL,
        title TEXT,
        excerpt TEXT,
        description TEXT,
        body TEXT,
        seo_title TEXT,
        seo_description TEXT,
        status TEXT DEFAULT 'machine',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(content_id, language_code)
      )
    `);

    /*
    Media
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'image',
        mime_type TEXT,
        url TEXT,
        thumbnail_url TEXT,
        size BIGINT DEFAULT 0,
        duration INTEGER,
        alt_text TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Sources
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'rss',
        url TEXT,
        api_url TEXT,
        language_code TEXT DEFAULT 'ar',
        category TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        fetch_interval INTEGER DEFAULT 15,
        last_fetched_at TIMESTAMPTZ,
        last_status TEXT,
        last_error TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Channels
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        logo_url TEXT,
        stream_url TEXT,
        stream_type TEXT DEFAULT 'hls',
        enabled BOOLEAN DEFAULT TRUE,
        is_live BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Programs
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id TEXT PRIMARY KEY,
        channel_id TEXT REFERENCES channels(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        video_url TEXT,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        recurring BOOLEAN DEFAULT FALSE,
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Advertisements
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS advertisements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'banner',
        title TEXT,
        description TEXT,
        image_url TEXT,
        video_url TEXT,
        link_url TEXT,
        placement TEXT DEFAULT 'homepage',
        priority INTEGER DEFAULT 0,
        enabled BOOLEAN DEFAULT TRUE,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        impressions BIGINT DEFAULT 0,
        clicks BIGINT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Automation
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'workflow',
        description TEXT,
        enabled BOOLEAN DEFAULT TRUE,
        schedule TEXT,
        config JSONB DEFAULT '{}'::jsonb,
        last_run_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Automation runs
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        job_id TEXT REFERENCES automation_jobs(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'running',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        result JSONB DEFAULT '{}'::jsonb,
        error TEXT
      )
    `);

    /*
    Analytics
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        content_id TEXT,
        section_id TEXT,
        language_code TEXT,
        session_id TEXT,
        path TEXT,
        referrer TEXT,
        country TEXT,
        device TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    Settings
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    /*
    AI Jobs
    */
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'queued',
        input JSONB DEFAULT '{}'::jsonb,
        output JSONB DEFAULT '{}'::jsonb,
        provider TEXT,
        model TEXT,
        error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      )
    `);

    /*
    Indexes
    */
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_content_status
      ON content(status)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_content_type
      ON content(type)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_content_section
      ON content(section_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_content_language
      ON content(language_code)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_content_published
      ON content(published_at DESC)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sections_parent
      ON sections(parent_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_banners_section
      ON banners(section_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_analytics_created
      ON analytics_events(created_at DESC)
    `);

    /*
    Default languages
    */
    const languages = [
      ["ar", "العربية", "العربية", "rtl"],
      ["en", "English", "English", "ltr"],
      ["fr", "Français", "Français", "ltr"],
      ["es", "Español", "Español", "ltr"],
      ["de", "Deutsch", "Deutsch", "ltr"],
      ["it", "Italiano", "Italiano", "ltr"],
      ["pt", "Português", "Português", "ltr"],
      ["tr", "Türkçe", "Türkçe", "ltr"],
      ["ru", "Русский", "Русский", "ltr"],
      ["zh", "中文", "中文", "ltr"],
      ["ja", "日本語", "日本語", "ltr"],
      ["ko", "한국어", "한국어", "ltr"],
      ["hi", "हिन्दी", "हिन्दी", "ltr"],
      ["ur", "اردو", "اردو", "rtl"],
      ["fa", "فارسی", "فارسی", "rtl"]
    ];

    for (const language of languages) {
      await client.query(
        `
        INSERT INTO languages
          (id, code, name, native_name, direction)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (code) DO NOTHING
        `,
        [id(), ...language]
      );
    }

    /*
    Default sections
    */
    let order = 1;

    for (const section of DEFAULT_SECTIONS) {
      await client.query(
        `
        INSERT INTO sections
          (id,name,slug,icon,description,sort_order)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (slug)
        DO UPDATE SET
          name = EXCLUDED.name,
          icon = EXCLUDED.icon,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
        `,
        [
          id(),
          section.name,
          section.slug,
          section.icon,
          section.description,
          order++
        ]
      );
    }

    /*
    Default settings
    */
    const defaultSettings = {
      platform_name: "EZ MEDIA",
      platform_description:
        "منصة الإعلام الرقمي وصناعة المحتوى",
      default_language: "ar",
      timezone: "Asia/Riyadh",
      theme: "white-cyan-blue",
      platform_status: "online",
      ai_enabled: false,
      automation_enabled: false,
      translation_enabled: true
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      await client.query(
        `
        INSERT INTO settings(key,value)
        VALUES($1,$2)
        ON CONFLICT(key) DO NOTHING
        `,
        [key, JSON.stringify(value)]
      );
    }

    await client.query("COMMIT");

    console.log("EZ MEDIA database initialized.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Database initialization failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

/*
=========================================================
 HEALTH
=========================================================
*/

app.get("/api/health", async (req, res) => {
  const result = {
    success: true,
    platform: PLATFORM_NAME,
    version: PLATFORM_VERSION,
    status: "online",
    database: "not_configured",
    time: new Date().toISOString()
  };

  if (!pool) {
    return res.status(200).json(result);
  }

  try {
    await pool.query("SELECT 1");

    result.database = "connected";

    return res.json(result);
  } catch (error) {
    result.status = "degraded";
    result.database = "error";

    return res.status(503).json({
      ...result,
      error: error.message
    });
  }
});

/*
=========================================================
 PLATFORM INFO
=========================================================
*/

app.get("/api/platform", async (req, res) => {
  res.json({
    success: true,
    platform: PLATFORM_NAME,
    version: PLATFORM_VERSION,
    description:
      "منصة الإعلام الرقمي وصناعة المحتوى",
    architecture: {
      backend: "Node.js + Express",
      database: "PostgreSQL",
      api: "REST",
      hosting: "Railway",
      frontend_ready: true,
      ai_ready: true,
      automation_ready: true,
      multilingual: true
    },
    url: APP_URL
  });
});

/*
=========================================================
 LANGUAGES
=========================================================
*/

app.get(
  "/api/languages",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM languages
        WHERE enabled = TRUE
        ORDER BY name ASC
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/languages",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const code = clean(req.body.code);

      if (!code) {
        return res.status(400).json({
          success: false,
          error: "code مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO languages
        (id,code,name,native_name,direction,enabled)
        VALUES($1,$2,$3,$4,$5,$6)
        RETURNING *
        `,
        [
          id(),
          code,
          clean(req.body.name, code),
          clean(req.body.native_name, req.body.name),
          clean(req.body.direction, "ltr"),
          bool(req.body.enabled, true)
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 SECTIONS
=========================================================
*/

app.get(
  "/api/sections",
  requireDatabase,
  async (req, res, next) => {
    try {
      const parent = req.query.parent;

      const result = parent
        ? await pool.query(
            `
            SELECT *
            FROM sections
            WHERE parent_id = $1
            AND enabled = TRUE
            ORDER BY sort_order ASC, name ASC
            `,
            [parent]
          )
        : await pool.query(`
            SELECT *
            FROM sections
            WHERE parent_id IS NULL
            AND enabled = TRUE
            ORDER BY sort_order ASC, name ASC
          `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/sections/all",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT
          s.*,
          p.name AS parent_name
        FROM sections s
        LEFT JOIN sections p
          ON p.id = s.parent_id
        ORDER BY
          COALESCE(s.parent_id, s.id),
          s.sort_order,
          s.name
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/sections",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const name = clean(req.body.name);

      if (!name) {
        return res.status(400).json({
          success: false,
          error: "name مطلوب."
        });
      }

      const slug =
        clean(req.body.slug) || slugify(name);

      const result = await pool.query(
        `
        INSERT INTO sections
        (id,name,slug,icon,description,parent_id,sort_order,enabled)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *
        `,
        [
          id(),
          name,
          slug,
          clean(req.body.icon, "📰"),
          clean(req.body.description),
          clean(req.body.parent_id),
          number(req.body.sort_order, 0),
          bool(req.body.enabled, true)
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/sections/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        UPDATE sections
        SET
          name = COALESCE($1,name),
          slug = COALESCE($2,slug),
          icon = COALESCE($3,icon),
          description = COALESCE($4,description),
          parent_id = $5,
          sort_order = COALESCE($6,sort_order),
          enabled = COALESCE($7,enabled),
          updated_at = NOW()
        WHERE id = $8
        RETURNING *
        `,
        [
          clean(req.body.name),
          clean(req.body.slug),
          clean(req.body.icon),
          clean(req.body.description),
          clean(req.body.parent_id),
          req.body.sort_order !== undefined
            ? number(req.body.sort_order)
            : null,
          req.body.enabled !== undefined
            ? bool(req.body.enabled)
            : null,
          req.params.id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "القسم غير موجود."
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/sections/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM sections
        WHERE id = $1
        RETURNING *
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "القسم غير موجود."
        });
      }

      res.json({
        success: true,
        deleted: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 CONTENT
=========================================================
*/

app.get(
  "/api/content",
  requireDatabase,
  async (req, res, next) => {
    try {
      const limit = Math.min(
        Math.max(number(req.query.limit, 20), 1),
        100
      );

      const offset = Math.max(
        number(req.query.offset, 0),
        0
      );

      const conditions = [];
      const values = [];

      if (req.query.type) {
        values.push(req.query.type);
        conditions.push(`c.type = $${values.length}`);
      }

      if (req.query.status) {
        values.push(req.query.status);
        conditions.push(`c.status = $${values.length}`);
      } else {
        conditions.push(`c.status = 'published'`);
      }

      if (req.query.language) {
        values.push(req.query.language);
        conditions.push(
          `c.language_code = $${values.length}`
        );
      }

      if (req.query.section_id) {
        values.push(req.query.section_id);
        conditions.push(
          `c.section_id = $${values.length}`
        );
      }

      if (req.query.featured === "true") {
        conditions.push(`c.featured = TRUE`);
      }

      if (req.query.breaking === "true") {
        conditions.push(`c.breaking = TRUE`);
      }

      if (req.query.search) {
        values.push(`%${req.query.search}%`);

        conditions.push(`
          (
            c.title ILIKE $${values.length}
            OR c.description ILIKE $${values.length}
            OR c.body ILIKE $${values.length}
          )
        `);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

      values.push(limit);
      const limitIndex = values.length;

      values.push(offset);
      const offsetIndex = values.length;

      const result = await pool.query(
        `
        SELECT
          c.*,
          s.name AS section_name,
          s.slug AS section_slug
        FROM content c
        LEFT JOIN sections s
          ON s.id = c.section_id
        ${where}
        ORDER BY
          c.featured DESC,
          c.breaking DESC,
          COALESCE(c.published_at,c.created_at) DESC
        LIMIT $${limitIndex}
        OFFSET $${offsetIndex}
        `,
        values
      );

      res.json({
        success: true,
        count: result.rows.length,
        limit,
        offset,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get(
  "/api/content/:id",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        SELECT
          c.*,
          s.name AS section_name,
          s.slug AS section_slug
        FROM content c
        LEFT JOIN sections s
          ON s.id = c.section_id
        WHERE c.id = $1
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "المحتوى غير موجود."
        });
      }

      await pool.query(
        `
        UPDATE content
        SET views = views + 1
        WHERE id = $1
        `,
        [req.params.id]
      );

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/content",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const title = clean(req.body.title);

      if (!title) {
        return res.status(400).json({
          success: false,
          error: "title مطلوب."
        });
      }

      const contentId = id();

      const status = clean(
        req.body.status,
        "draft"
      );

      const publishedAt =
        status === "published"
          ? clean(req.body.published_at) ||
            new Date().toISOString()
          : clean(req.body.published_at);

      const result = await pool.query(
        `
        INSERT INTO content
        (
          id,
          section_id,
          title,
          slug,
          type,
          status,
          excerpt,
          description,
          body,
          author,
          source_name,
          source_url,
          image_url,
          video_url,
          audio_url,
          external_url,
          language_code,
          tags,
          metadata,
          seo_title,
          seo_description,
          seo_keywords,
          featured,
          breaking,
          scheduled_at,
          published_at
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          $13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
          $23,$24,$25,$26
        )
        RETURNING *
        `,
        [
          contentId,
          clean(req.body.section_id),
          title,
          clean(req.body.slug) || slugify(title),
          clean(req.body.type, "article"),
          status,
          clean(req.body.excerpt),
          clean(req.body.description),
          clean(req.body.body),
          clean(req.body.author, "EZ MEDIA"),
          clean(req.body.source_name),
          clean(req.body.source_url),
          clean(req.body.image_url),
          clean(req.body.video_url),
          clean(req.body.audio_url),
          clean(req.body.external_url),
          clean(req.body.language_code, "ar"),
          JSON.stringify(array(req.body.tags)),
          JSON.stringify(json(req.body.metadata, {})),
          clean(req.body.seo_title, title),
          clean(req.body.seo_description),
          clean(req.body.seo_keywords),
          bool(req.body.featured, false),
          bool(req.body.breaking, false),
          clean(req.body.scheduled_at),
          publishedAt
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/content/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        UPDATE content
        SET
          section_id = COALESCE($1,section_id),
          title = COALESCE($2,title),
          slug = COALESCE($3,slug),
          type = COALESCE($4,type),
          status = COALESCE($5,status),
          excerpt = COALESCE($6,excerpt),
          description = COALESCE($7,description),
          body = COALESCE($8,body),
          author = COALESCE($9,author),
          source_name = COALESCE($10,source_name),
          source_url = COALESCE($11,source_url),
          image_url = COALESCE($12,image_url),
          video_url = COALESCE($13,video_url),
          audio_url = COALESCE($14,audio_url),
          external_url = COALESCE($15,external_url),
          language_code = COALESCE($16,language_code),
          tags = COALESCE($17,tags),
          metadata = COALESCE($18,metadata),
          seo_title = COALESCE($19,seo_title),
          seo_description = COALESCE($20,seo_description),
          seo_keywords = COALESCE($21,seo_keywords),
          featured = COALESCE($22,featured),
          breaking = COALESCE($23,breaking),
          scheduled_at = COALESCE($24,scheduled_at),
          published_at = COALESCE($25,published_at),
          updated_at = NOW()
        WHERE id = $26
        RETURNING *
        `,
        [
          clean(req.body.section_id),
          clean(req.body.title),
          clean(req.body.slug),
          clean(req.body.type),
          clean(req.body.status),
          clean(req.body.excerpt),
          clean(req.body.description),
          clean(req.body.body),
          clean(req.body.author),
          clean(req.body.source_name),
          clean(req.body.source_url),
          clean(req.body.image_url),
          clean(req.body.video_url),
          clean(req.body.audio_url),
          clean(req.body.external_url),
          clean(req.body.language_code),
          req.body.tags !== undefined
            ? JSON.stringify(array(req.body.tags))
            : null,
          req.body.metadata !== undefined
            ? JSON.stringify(json(req.body.metadata, {}))
            : null,
          clean(req.body.seo_title),
          clean(req.body.seo_description),
          clean(req.body.seo_keywords),
          req.body.featured !== undefined
            ? bool(req.body.featured)
            : null,
          req.body.breaking !== undefined
            ? bool(req.body.breaking)
            : null,
          clean(req.body.scheduled_at),
          clean(req.body.published_at),
          req.params.id
        ]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "المحتوى غير موجود."
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/content/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM content
        WHERE id = $1
        RETURNING id,title
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "المحتوى غير موجود."
        });
      }

      res.json({
        success: true,
        deleted: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 TRANSLATIONS
=========================================================
*/

app.get(
  "/api/content/:id/translations",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM content_translations
        WHERE content_id = $1
        ORDER BY language_code
        `,
        [req.params.id]
      );

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/content/:id/translations",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        INSERT INTO content_translations
        (
          id,
          content_id,
          language_code,
          title,
          excerpt,
          description,
          body,
          seo_title,
          seo_description,
          status
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT(content_id,language_code)
        DO UPDATE SET
          title = EXCLUDED.title,
          excerpt = EXCLUDED.excerpt,
          description = EXCLUDED.description,
          body = EXCLUDED.body,
          seo_title = EXCLUDED.seo_title,
          seo_description = EXCLUDED.seo_description,
          status = EXCLUDED.status,
          updated_at = NOW()
        RETURNING *
        `,
        [
          id(),
          req.params.id,
          clean(req.body.language_code, "en"),
          clean(req.body.title),
          clean(req.body.excerpt),
          clean(req.body.description),
          clean(req.body.body),
          clean(req.body.seo_title),
          clean(req.body.seo_description),
          clean(req.body.status, "machine")
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 BANNERS
=========================================================
*/

app.get(
  "/api/banners",
  requireDatabase,
  async (req, res, next) => {
    try {
      const values = [];
      const conditions = ["b.enabled = TRUE"];

      if (req.query.section_id) {
        values.push(req.query.section_id);

        conditions.push(
          `(b.section_id = $${values.length}
            OR b.parent_section_id = $${values.length})`
        );
      }

      if (req.query.position) {
        values.push(req.query.position);

        conditions.push(
          `b.position = $${values.length}`
        );
      }

      const result = await pool.query(
        `
        SELECT
          b.*,
          s.name AS section_name
        FROM banners b
        LEFT JOIN sections s
          ON s.id = b.section_id
        WHERE ${conditions.join(" AND ")}
        AND (
          b.starts_at IS NULL
          OR b.starts_at <= NOW()
        )
        AND (
          b.ends_at IS NULL
          OR b.ends_at >= NOW()
        )
        ORDER BY b.sort_order ASC, b.created_at DESC
        `,
        values
      );

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/banners",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.title) {
        return res.status(400).json({
          success: false,
          error: "title مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO banners
        (
          id,
          section_id,
          parent_section_id,
          title,
          subtitle,
          description,
          image_url,
          link_url,
          button_text,
          position,
          sort_order,
          enabled,
          starts_at,
          ends_at
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
        `,
        [
          id(),
          clean(req.body.section_id),
          clean(req.body.parent_section_id),
          req.body.title,
          clean(req.body.subtitle),
          clean(req.body.description),
          clean(req.body.image_url),
          clean(req.body.link_url),
          clean(req.body.button_text, "استكشف"),
          clean(req.body.position, "section"),
          number(req.body.sort_order, 0),
          bool(req.body.enabled, true),
          clean(req.body.starts_at),
          clean(req.body.ends_at)
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/banners/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM banners
        WHERE id = $1
        RETURNING *
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "Banner غير موجود."
        });
      }

      res.json({
        success: true,
        deleted: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 MEDIA
=========================================================
*/

app.get(
  "/api/media",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const limit = Math.min(
        Math.max(number(req.query.limit, 50), 1),
        200
      );

      const result = await pool.query(
        `
        SELECT *
        FROM media
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [limit]
      );

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/media",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.name) {
        return res.status(400).json({
          success: false,
          error: "name مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO media
        (
          id,
          name,
          type,
          mime_type,
          url,
          thumbnail_url,
          size,
          duration,
          alt_text,
          metadata
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [
          id(),
          req.body.name,
          clean(req.body.type, "image"),
          clean(req.body.mime_type),
          clean(req.body.url),
          clean(req.body.thumbnail_url),
          number(req.body.size, 0),
          number(req.body.duration, 0),
          clean(req.body.alt_text),
          JSON.stringify(json(req.body.metadata, {}))
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/media/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM media
        WHERE id = $1
        RETURNING *
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "الوسيط غير موجود."
        });
      }

      res.json({
        success: true,
        deleted: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 SOURCES
=========================================================
*/

app.get(
  "/api/sources",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM sources
        ORDER BY created_at DESC
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/sources",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.name) {
        return res.status(400).json({
          success: false,
          error: "name مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO sources
        (
          id,
          name,
          type,
          url,
          api_url,
          language_code,
          category,
          enabled,
          fetch_interval,
          metadata
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [
          id(),
          req.body.name,
          clean(req.body.type, "rss"),
          clean(req.body.url),
          clean(req.body.api_url),
          clean(req.body.language_code, "ar"),
          clean(req.body.category),
          bool(req.body.enabled, true),
          number(req.body.fetch_interval, 15),
          JSON.stringify(json(req.body.metadata, {}))
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 SOURCE FETCH — RSS / JSON READY
=========================================================
*/

app.post(
  "/api/sources/:id/fetch",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const sourceResult = await pool.query(
        `
        SELECT *
        FROM sources
        WHERE id = $1
        `,
        [req.params.id]
      );

      if (!sourceResult.rows.length) {
        return res.status(404).json({
          success: false,
          error: "المصدر غير موجود."
        });
      }

      const source = sourceResult.rows[0];

      if (!source.url && !source.api_url) {
        return res.status(400).json({
          success: false,
          error: "المصدر لا يحتوي URL."
        });
      }

      const target = source.api_url || source.url;

      let response;

      try {
        response = await fetch(target, {
          headers: {
            Accept:
              "application/rss+xml, application/atom+xml, application/json, text/xml, text/plain"
          },
          redirect: "follow"
        });
      } catch (fetchError) {
        await pool.query(
          `
          UPDATE sources
          SET
            last_status = 'error',
            last_error = $1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [fetchError.message, req.params.id]
        );

        return res.status(502).json({
          success: false,
          error: "تعذر الاتصال بالمصدر.",
          details: fetchError.message
        });
      }

      const text = await response.text();

      await pool.query(
        `
        UPDATE sources
        SET
          last_fetched_at = NOW(),
          last_status = $1,
          last_error = $2,
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          response.ok ? "success" : "http_error",
          response.ok
            ? null
            : `HTTP ${response.status}`,
          req.params.id
        ]
      );

      res.json({
        success: response.ok,
        source_id: req.params.id,
        url: target,
        http_status: response.status,
        content_type:
          response.headers.get("content-type") || "",
        bytes: Buffer.byteLength(text),
        note:
          "تم جلب المصدر. تحويل RSS/Atom إلى محتوى منشور يحتاج قواعد التحرير/المراجعة قبل النشر."
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 CHANNELS
=========================================================
*/

app.get(
  "/api/channels",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM channels
        WHERE enabled = TRUE
        ORDER BY name
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/channels",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.name) {
        return res.status(400).json({
          success: false,
          error: "name مطلوب."
        });
      }

      const name = req.body.name;

      const result = await pool.query(
        `
        INSERT INTO channels
        (
          id,
          name,
          slug,
          description,
          logo_url,
          stream_url,
          stream_type,
          enabled,
          is_live,
          metadata
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [
          id(),
          name,
          clean(req.body.slug) || slugify(name),
          clean(req.body.description),
          clean(req.body.logo_url),
          clean(req.body.stream_url),
          clean(req.body.stream_type, "hls"),
          bool(req.body.enabled, true),
          bool(req.body.is_live, false),
          JSON.stringify(json(req.body.metadata, {}))
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 PROGRAMS
=========================================================
*/

app.get(
  "/api/programs",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT
          p.*,
          c.name AS channel_name
        FROM programs p
        LEFT JOIN channels c
          ON c.id = p.channel_id
        WHERE p.enabled = TRUE
        ORDER BY p.start_time ASC NULLS LAST
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/programs",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.title) {
        return res.status(400).json({
          success: false,
          error: "title مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO programs
        (
          id,
          channel_id,
          title,
          description,
          image_url,
          video_url,
          start_time,
          end_time,
          recurring,
          enabled
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
        `,
        [
          id(),
          clean(req.body.channel_id),
          req.body.title,
          clean(req.body.description),
          clean(req.body.image_url),
          clean(req.body.video_url),
          clean(req.body.start_time),
          clean(req.body.end_time),
          bool(req.body.recurring, false),
          bool(req.body.enabled, true)
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 ADVERTISEMENTS
=========================================================
*/

app.get(
  "/api/ads",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM advertisements
        WHERE enabled = TRUE
        AND (
          starts_at IS NULL
          OR starts_at <= NOW()
        )
        AND (
          ends_at IS NULL
          OR ends_at >= NOW()
        )
        ORDER BY priority DESC, created_at DESC
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/ads",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.name) {
        return res.status(400).json({
          success: false,
          error: "name مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO advertisements
        (
          id,
          name,
          type,
          title,
          description,
          image_url,
          video_url,
          link_url,
          placement,
          priority,
          enabled,
          starts_at,
          ends_at
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
        `,
        [
          id(),
          req.body.name,
          clean(req.body.type, "banner"),
          clean(req.body.title),
          clean(req.body.description),
          clean(req.body.image_url),
          clean(req.body.video_url),
          clean(req.body.link_url),
          clean(req.body.placement, "homepage"),
          number(req.body.priority, 0),
          bool(req.body.enabled, true),
          clean(req.body.starts_at),
          clean(req.body.ends_at)
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.delete(
  "/api/ads/:id",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        DELETE FROM advertisements
        WHERE id = $1
        RETURNING *
        `,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error: "الإعلان غير موجود."
        });
      }

      res.json({
        success: true,
        deleted: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 AUTOMATION
=========================================================
*/

app.get(
  "/api/automation/jobs",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT *
        FROM automation_jobs
        ORDER BY created_at DESC
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/automation/jobs",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.name) {
        return res.status(400).json({
          success: false,
          error: "name مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO automation_jobs
        (
          id,
          name,
          type,
          description,
          enabled,
          schedule,
          config
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
        `,
        [
          id(),
          req.body.name,
          clean(req.body.type, "workflow"),
          clean(req.body.description),
          bool(req.body.enabled, true),
          clean(req.body.schedule),
          JSON.stringify(json(req.body.config, {}))
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

app.post(
  "/api/automation/run",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const runId = id();

      let job = null;

      if (req.body.job_id) {
        const jobResult = await client.query(
          `
          SELECT *
          FROM automation_jobs
          WHERE id = $1
          `,
          [req.body.job_id]
        );

        job = jobResult.rows[0] || null;
      }

      await client.query(
        `
        INSERT INTO automation_runs
        (id,job_id,status,result)
        VALUES($1,$2,'running',$3)
        `,
        [
          runId,
          job ? job.id : null,
          JSON.stringify({
            triggered_by: "api",
            type: req.body.type || "manual"
          })
        ]
      );

      /*
      هنا نقطة تشغيل محرك الأتمتة الحقيقي.
      يمكن ربط n8n أو خدمة أخرى بهذا endpoint.
      */

      const result = {
        run_id: runId,
        status: "accepted",
        message:
          "تم تسجيل عملية الأتمتة بنجاح وهي جاهزة للمعالجة.",
        job_id: job ? job.id : null
      };

      await client.query(
        `
        UPDATE automation_runs
        SET
          status = 'accepted',
          finished_at = NOW(),
          result = $1
        WHERE id = $2
        `,
        [JSON.stringify(result), runId]
      );

      await client.query("COMMIT");

      res.status(202).json({
        success: true,
        data: result
      });
    } catch (error) {
      await client.query("ROLLBACK");
      next(error);
    } finally {
      client.release();
    }
  }
);

app.get(
  "/api/automation/logs",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT
          r.*,
          j.name AS job_name
        FROM automation_runs r
        LEFT JOIN automation_jobs j
          ON j.id = r.job_id
        ORDER BY r.started_at DESC
        LIMIT 100
      `);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 AI ENGINE — READY FOR PROVIDER
=========================================================
*/

app.get(
  "/api/ai/status",
  async (req, res) => {
    const provider =
      process.env.AI_PROVIDER || null;

    const apiConfigured =
      Boolean(process.env.AI_API_KEY);

    res.json({
      success: true,
      ai: {
        enabled: apiConfigured,
        provider,
        configured: apiConfigured,
        capabilities: [
          "content-generation",
          "summarization",
          "translation",
          "seo",
          "classification",
          "transcription-ready",
          "media-analysis-ready"
        ]
      }
    });
  }
);

app.post(
  "/api/ai/jobs",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      if (!req.body.type) {
        return res.status(400).json({
          success: false,
          error: "type مطلوب."
        });
      }

      const result = await pool.query(
        `
        INSERT INTO ai_jobs
        (
          id,
          type,
          status,
          input,
          provider,
          model
        )
        VALUES
        ($1,$2,'queued',$3,$4,$5)
        RETURNING *
        `,
        [
          id(),
          req.body.type,
          JSON.stringify(json(req.body.input, {})),
          process.env.AI_PROVIDER || null,
          process.env.AI_MODEL || null
        ]
      );

      res.status(202).json({
        success: true,
        data: result.rows[0],
        message:
          "تم إنشاء مهمة AI. يلزم ربط مزود AI بمفتاح API لتنفيذ المعالجة."
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 ANALYTICS
=========================================================
*/

app.post(
  "/api/analytics/event",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(
        `
        INSERT INTO analytics_events
        (
          id,
          event_name,
          content_id,
          section_id,
          language_code,
          session_id,
          path,
          referrer,
          country,
          device,
          metadata
        )
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id,created_at
        `,
        [
          id(),
          clean(req.body.event_name, "page_view"),
          clean(req.body.content_id),
          clean(req.body.section_id),
          clean(req.body.language_code),
          clean(req.body.session_id),
          clean(req.body.path),
          clean(req.body.referrer),
          clean(req.body.country),
          clean(req.body.device),
          JSON.stringify(json(req.body.metadata, {}))
        ]
      );

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 STATS
=========================================================
*/

app.get(
  "/api/stats",
  requireDatabase,
  async (req, res, next) => {
    try {
      const [
        sections,
        content,
        media,
        sources,
        banners,
        channels,
        programs,
        ads,
        languages,
        events
      ] = await Promise.all([
        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM sections
          WHERE parent_id IS NULL
          AND enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM content
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM media
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM sources
          WHERE enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM banners
          WHERE enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM channels
          WHERE enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM programs
          WHERE enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM advertisements
          WHERE enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM languages
          WHERE enabled = TRUE
        `),

        pool.query(`
          SELECT COUNT(*)::int AS count
          FROM analytics_events
        `)
      ]);

      res.json({
        success: true,
        sections: sections.rows[0].count,
        content: content.rows[0].count,
        media: media.rows[0].count,
        sources: sources.rows[0].count,
        banners: banners.rows[0].count,
        channels: channels.rows[0].count,
        programs: programs.rows[0].count,
        ads: ads.rows[0].count,
        languages: languages.rows[0].count,
        analytics_events: events.rows[0].count
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 SETTINGS
=========================================================
*/

app.get(
  "/api/settings",
  requireDatabase,
  async (req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT key,value
        FROM settings
        ORDER BY key
      `);

      const settings = {};

      for (const row of result.rows) {
        settings[row.key] = row.value;
      }

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/settings/:key",
  requireDatabase,
  requireAdmin,
  async (req, res, next) => {
    try {
      const value =
        req.body.value !== undefined
          ? req.body.value
          : req.body;

      const result = await pool.query(
        `
        INSERT INTO settings(key,value,updated_at)
        VALUES($1,$2,NOW())
        ON CONFLICT(key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
        RETURNING *
        `,
        [
          req.params.key,
          JSON.stringify(value)
        ]
      );

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 SEARCH
=========================================================
*/

app.get(
  "/api/search",
  requireDatabase,
  async (req, res, next) => {
    try {
      const q = clean(req.query.q);

      if (!q) {
        return res.status(400).json({
          success: false,
          error: "q مطلوب."
        });
      }

      const limit = Math.min(
        Math.max(number(req.query.limit, 20), 1),
        100
      );

      const result = await pool.query(
        `
        SELECT
          c.id,
          c.title,
          c.slug,
          c.type,
          c.excerpt,
          c.image_url,
          c.language_code,
          c.published_at,
          s.name AS section_name
        FROM content c
        LEFT JOIN sections s
          ON s.id = c.section_id
        WHERE c.status = 'published'
        AND (
          c.title ILIKE $1
          OR c.excerpt ILIKE $1
          OR c.description ILIKE $1
          OR c.body ILIKE $1
        )
        ORDER BY
          c.featured DESC,
          c.published_at DESC NULLS LAST
        LIMIT $2
        `,
        [`%${q}%`, limit]
      );

      res.json({
        success: true,
        query: q,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
=========================================================
 PUBLIC CONFIG
=========================================================
*/

app.get(
  "/api/config",
  async (req, res) => {
    res.json({
      success: true,
      platform: PLATFORM_NAME,
      version: PLATFORM_VERSION,
      api: APP_URL,
      default_language: "ar",
      direction: "rtl",
      theme: {
        primary: "cyan",
        secondary: "blue",
        background: "white",
        gradients: true
      },
      features: {
        sections: true,
        branches: true,
        banners: true,
        content: true,
        video: true,
        podcast: true,
        live: true,
        channels: true,
        advertising: true,
        analytics: true,
        multilingual: true,
        ai_ready: true,
        automation_ready: true
      }
    });
  }
);

/*
=========================================================
 ROOT
=========================================================
*/

app.get("/", (req, res) => {
  res.json({
    success: true,
    platform: PLATFORM_NAME,
    message:
      "EZ MEDIA API يعمل بنجاح.",
    version: PLATFORM_VERSION,
    api: `${APP_URL}/api`,
    health: `${APP_URL}/api/health`,
    config: `${APP_URL}/api/config`,
    stats: `${APP_URL}/api/stats`
  });
});

/*
=========================================================
 API 404
=========================================================
*/

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint غير موجود.",
    path: req.originalUrl
  });
});

/*
=========================================================
 GLOBAL ERROR HANDLER
=========================================================
*/

app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);

  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      error: "البيانات موجودة مسبقًا.",
      details: error.detail || null
    });
  }

  if (error.code === "23503") {
    return res.status(400).json({
      success: false,
      error: "هناك مرجع مرتبط غير صالح.",
      details: error.detail || null
    });
  }

  res.status(500).json({
    success: false,
    error: "حدث خطأ داخلي في EZ MEDIA.",
    details:
      process.env.NODE_ENV === "production"
        ? undefined
        : error.message
  });
});

/*
=========================================================
 START
=========================================================
*/

async function start() {
  try {
    await initDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("======================================");
      console.log("EZ MEDIA");
      console.log(`Version: ${PLATFORM_VERSION}`);
      console.log(`Port: ${PORT}`);
      console.log(`URL: ${APP_URL}`);
      console.log(
        `Database: ${pool ? "configured" : "NOT CONFIGURED"}`
      );
      console.log("======================================");
    });
  } catch (error) {
    console.error(
      "EZ MEDIA failed to start:",
      error
    );

    /*
    إذا لم تكن قاعدة البيانات مضبوطة، نسمح
    للسيرفر بالعمل حتى يمكن فحص /api/health.
    */
    if (!pool) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(
          `EZ MEDIA running without database on ${PORT}`
        );
      });
      return;
    }

    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM received.");

  if (pool) {
    await pool.end();
  }

  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received.");

  if (pool) {
    await pool.end();
  }

  process.exit(0);
});

start();
