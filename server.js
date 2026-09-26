"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3000);

const APP_URL =
  process.env.APP_URL ||
  "https://ez-media-production-a181.up.railway.app";

const PLATFORM_NAME = "EZ MEDIA";
const PLATFORM_VERSION = "8.0.0";

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

/* =========================
   DATABASE
========================= */

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
    console.error("PostgreSQL error:", error);
  });
}

/* =========================
   HELPERS
========================= */

function createId() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function dbAvailable() {
  return Boolean(pool);
}

async function query(text, params = []) {
  if (!pool) {
    throw new Error("DATABASE_URL غير مضبوط");
  }

  return pool.query(text, params);
}

function safeText(value, fallback = "") {
  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value).trim();
}

/* =========================
   DEFAULT SECTIONS
========================= */

const DEFAULT_SECTIONS = [
  ["الرئيسية", "home", "🏠"],
  ["الأخبار", "news", "📰"],
  ["عاجل", "urgent", "⚡"],
  ["السعودية", "saudi", "🇸🇦"],
  ["الخليج", "gulf", "🌐"],
  ["العالم", "world", "🌍"],
  ["التغطيات الميدانية", "coverage", "📍"],
  ["التقارير", "reports", "📊"],
  ["المقالات", "articles", "✍️"],
  ["الفيديو", "video", "🎬"],
  ["4K", "4k", "📺"],
  ["البث المباشر", "live", "🔴"],
  ["القناة الفضائية", "satellite", "📡"],
  ["الصوتيات", "audio", "🎧"],
  ["البودكاست", "podcast", "🎙️"],
  ["البرامج", "programs", "🎞️"],
  ["الحوارات", "interviews", "🎤"],
  ["الاقتصاد", "economy", "💼"],
  ["التقنية", "technology", "💻"],
  ["الرياضة", "sports", "🏆"],
  ["الثقافة", "culture", "📚"],
  ["المجتمع", "community", "👥"],
  ["المنوعات", "variety", "✨"],
  ["الصور", "photos", "📷"],
  ["الخدمات الإعلامية", "media-services", "📣"],
  ["الإعلانات", "ads", "📢"],
  ["الإنتاج الإعلامي", "production", "🎥"],
  ["الاستوديو", "studio", "🎙️"],
  ["الأرشيف", "archive", "🗂️"],
  ["مركز الإعلام", "media-center", "🏢"]
];

/* =========================
   DATABASE INITIALIZATION
========================= */

async function initializeDatabase() {
  if (!pool) {
    console.log("DATABASE_URL غير موجود. تشغيل بدون قاعدة بيانات.");
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '📰',
      description TEXT DEFAULT '',
      banner_url TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      excerpt TEXT DEFAULT '',
      body TEXT DEFAULT '',
      type TEXT DEFAULT 'article',
      section_id TEXT,
      image_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      audio_url TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      featured BOOLEAN DEFAULT FALSE,
      scheduled_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      section_id TEXT,
      button_text TEXT DEFAULT '',
      button_url TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      sort_order INTEGER DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'image',
      url TEXT NOT NULL,
      alt_text TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT DEFAULT 'rss',
      active BOOLEAN DEFAULT TRUE,
      last_fetched_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'general',
      webhook_url TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE,
      schedule TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      status TEXT DEFAULT 'queued',
      message TEXT DEFAULT '',
      started_at TIMESTAMPTZ DEFAULT NOW(),
      finished_at TIMESTAMPTZ
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      page TEXT DEFAULT '',
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (let i = 0; i < DEFAULT_SECTIONS.length; i++) {
    const [name, slug, icon] = DEFAULT_SECTIONS[i];

    await query(
      `
      INSERT INTO sections
        (id, name, slug, icon, description, sort_order)
      VALUES
        ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (slug)
      DO NOTHING
      `,
      [
        createId(),
        name,
        slug,
        icon,
        `قسم ${name} في منصة EZ MEDIA`,
        i + 1
      ]
    );
  }

  console.log("EZ MEDIA database initialized.");
}

/* =========================
   HEALTH
========================= */

app.get("/api/health", async (req, res) => {
  let database = "not_configured";

  if (pool) {
    try {
      await query("SELECT 1");
      database = "connected";
    } catch (error) {
      database = "error";
    }
  }

  res.json({
    success: true,
    platform: PLATFORM_NAME,
    version: PLATFORM_VERSION,
    status: "online",
    database,
    time: now()
  });
});

/* =========================
   PLATFORM
========================= */

app.get("/api/platform", (req, res) => {
  res.json({
    success: true,
    name: PLATFORM_NAME,
    version: PLATFORM_VERSION,
    description: "منصة الإعلام الرقمي وصناعة المحتوى",
    app_url: APP_URL,
    features: [
      "الأخبار",
      "التغطيات",
      "الفيديو",
      "4K",
      "البودكاست",
      "البث المباشر",
      "القناة الفضائية",
      "الخدمات الإعلامية",
      "الإعلانات",
      "الأتمتة",
      "التحليلات"
    ]
  });
});

/* =========================
   SECTIONS
========================= */

app.get("/api/sections", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: DEFAULT_SECTIONS.map((item, index) => ({
        id: `default-${index + 1}`,
        name: item[0],
        slug: item[1],
        icon: item[2],
        sort_order: index + 1,
        active: true
      }))
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM sections
      WHERE active = TRUE
      ORDER BY sort_order ASC, name ASC
    `);

    res.json({
      success: true,
      database: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/sections/all", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM sections
      ORDER BY sort_order ASC, name ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/sections", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  const name = safeText(req.body.name);

  if (!name) {
    return res.status(400).json({
      success: false,
      error: "اسم القسم مطلوب"
    });
  }

  const slug =
    safeText(req.body.slug) ||
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-أ-ي]/g, "");

  try {
    const result = await query(
      `
      INSERT INTO sections
      (id,name,slug,icon,description,banner_url,active,sort_order)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        createId(),
        name,
        slug,
        safeText(req.body.icon, "📰"),
        safeText(req.body.description),
        safeText(req.body.banner_url),
        req.body.active !== false,
        Number(req.body.sort_order || 0)
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put("/api/sections/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `
      UPDATE sections
      SET
        name = COALESCE($1,name),
        slug = COALESCE($2,slug),
        icon = COALESCE($3,icon),
        description = COALESCE($4,description),
        banner_url = COALESCE($5,banner_url),
        active = COALESCE($6,active),
        sort_order = COALESCE($7,sort_order),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        req.body.name,
        req.body.slug,
        req.body.icon,
        req.body.description,
        req.body.banner_url,
        req.body.active,
        req.body.sort_order,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "القسم غير موجود"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete("/api/sections/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `
      DELETE FROM sections
      WHERE id = $1
      RETURNING id
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "القسم غير موجود"
      });
    }

    res.json({
      success: true,
      deleted: result.rows[0].id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   CONTENT
========================= */

app.get("/api/content", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const params = [];
    let where = `
      WHERE status = 'published'
    `;

    if (req.query.section) {
      params.push(req.query.section);
      where += ` AND section_id = $${params.length}`;
    }

    if (req.query.type) {
      params.push(req.query.type);
      where += ` AND type = $${params.length}`;
    }

    const limit = Math.min(
      Math.max(Number(req.query.limit || 20), 1),
      100
    );

    params.push(limit);

    const result = await query(
      `
      SELECT *
      FROM content
      ${where}
      ORDER BY COALESCE(published_at,created_at) DESC
      LIMIT $${params.length}
      `,
      params
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/content/all", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM content
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/content", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  const title = safeText(req.body.title);

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "العنوان مطلوب"
    });
  }

  const slug =
    safeText(req.body.slug) ||
    `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  try {
    const result = await query(
      `
      INSERT INTO content
      (
        id,title,slug,excerpt,body,type,section_id,
        image_url,video_url,audio_url,status,
        featured,scheduled_at,published_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14
      )
      RETURNING *
      `,
      [
        createId(),
        title,
        slug,
        safeText(req.body.excerpt),
        safeText(req.body.body),
        safeText(req.body.type, "article"),
        safeText(req.body.section_id) || null,
        safeText(req.body.image_url),
        safeText(req.body.video_url),
        safeText(req.body.audio_url),
        safeText(req.body.status, "draft"),
        Boolean(req.body.featured),
        req.body.scheduled_at || null,
        req.body.status === "published"
          ? req.body.published_at || new Date()
          : null
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/content/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `SELECT * FROM content WHERE id = $1`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "المحتوى غير موجود"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put("/api/content/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `
      UPDATE content
      SET
        title = COALESCE($1,title),
        excerpt = COALESCE($2,excerpt),
        body = COALESCE($3,body),
        type = COALESCE($4,type),
        section_id = COALESCE($5,section_id),
        image_url = COALESCE($6,image_url),
        video_url = COALESCE($7,video_url),
        audio_url = COALESCE($8,audio_url),
        status = COALESCE($9,status),
        featured = COALESCE($10,featured),
        scheduled_at = COALESCE($11,scheduled_at),
        published_at =
          CASE
            WHEN $9 = 'published'
            THEN COALESCE(published_at,NOW())
            ELSE published_at
          END,
        updated_at = NOW()
      WHERE id = $12
      RETURNING *
      `,
      [
        req.body.title,
        req.body.excerpt,
        req.body.body,
        req.body.type,
        req.body.section_id,
        req.body.image_url,
        req.body.video_url,
        req.body.audio_url,
        req.body.status,
        req.body.featured,
        req.body.scheduled_at,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "المحتوى غير موجود"
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete("/api/content/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `DELETE FROM content WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "المحتوى غير موجود"
      });
    }

    res.json({
      success: true,
      deleted: result.rows[0].id
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   BANNERS
========================= */

app.get("/api/banners", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM banners
      WHERE active = TRUE
      ORDER BY sort_order ASC, created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/banners", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  const title = safeText(req.body.title);

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "عنوان البانر مطلوب"
    });
  }

  try {
    const result = await query(
      `
      INSERT INTO banners
      (
        id,title,description,image_url,video_url,
        section_id,button_text,button_url,
        active,sort_order,starts_at,ends_at
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        createId(),
        title,
        safeText(req.body.description),
        safeText(req.body.image_url),
        safeText(req.body.video_url),
        safeText(req.body.section_id) || null,
        safeText(req.body.button_text),
        safeText(req.body.button_url),
        req.body.active !== false,
        Number(req.body.sort_order || 0),
        req.body.starts_at || null,
        req.body.ends_at || null
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete("/api/banners/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `DELETE FROM banners WHERE id = $1 RETURNING id`,
      [req.params.id]
    );

    res.json({
      success: true,
      deleted: result.rows[0]?.id || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   MEDIA
========================= */

app.get("/api/media", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM media
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/media", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `
      INSERT INTO media
      (id,name,type,url,alt_text)
      VALUES
      ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [
        createId(),
        safeText(req.body.name, "Media"),
        safeText(req.body.type, "image"),
        safeText(req.body.url),
        safeText(req.body.alt_text)
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete("/api/media/:id", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    await query(
      `DELETE FROM media WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   SOURCES
========================= */

app.get("/api/sources", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM sources
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/sources", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `
      INSERT INTO sources
      (id,name,url,type,active)
      VALUES
      ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [
        createId(),
        safeText(req.body.name),
        safeText(req.body.url),
        safeText(req.body.type, "rss"),
        req.body.active !== false
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   AUTOMATION
========================= */

app.get("/api/automation/jobs", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM automation_jobs
      ORDER BY created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/automation/jobs", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const result = await query(
      `
      INSERT INTO automation_jobs
      (id,name,type,webhook_url,active,schedule)
      VALUES
      ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        createId(),
        safeText(req.body.name, "EZ MEDIA Automation"),
        safeText(req.body.type, "general"),
        safeText(req.body.webhook_url),
        req.body.active !== false,
        safeText(req.body.schedule)
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/automation/run", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const runId = createId();

    await query(
      `
      INSERT INTO automation_runs
      (id,job_id,status,message)
      VALUES
      ($1,$2,$3,$4)
      `,
      [
        runId,
        req.body.job_id || null,
        "queued",
        "تم إنشاء تشغيل الأتمتة"
      ]
    );

    res.json({
      success: true,
      run_id: runId,
      status: "queued",
      message:
        "تم تسجيل التشغيل. الربط الفعلي مع n8n يحتاج Webhook صالح."
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/automation/logs", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(`
      SELECT *
      FROM automation_runs
      ORDER BY started_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   ANALYTICS
========================= */

app.post("/api/analytics/event", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      recorded: false
    });
  }

  try {
    await query(
      `
      INSERT INTO analytics_events
      (id,event_name,page,metadata)
      VALUES
      ($1,$2,$3,$4)
      `,
      [
        createId(),
        safeText(req.body.event_name, "page_view"),
        safeText(req.body.page),
        req.body.metadata || {}
      ]
    );

    res.json({
      success: true,
      recorded: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   STATS
========================= */

app.get("/api/stats", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      stats: {
        sections: DEFAULT_SECTIONS.length,
        content: 0,
        banners: 0,
        media: 0,
        sources: 0,
        automation_jobs: 0
      }
    });
  }

  try {
    const tables = [
      "sections",
      "content",
      "banners",
      "media",
      "sources",
      "automation_jobs"
    ];

    const stats = {};

    for (const table of tables) {
      const result = await query(
        `SELECT COUNT(*)::int AS count FROM ${table}`
      );

      stats[table] = result.rows[0].count;
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   SETTINGS
========================= */

app.get("/api/settings", async (req, res) => {
  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: {}
    });
  }

  try {
    const result = await query(`
      SELECT key,value
      FROM settings
      ORDER BY key
    `);

    const data = {};

    for (const row of result.rows) {
      data[row.key] = row.value;
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put("/api/settings", async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      error: "قاعدة البيانات غير متصلة"
    });
  }

  try {
    const entries = Object.entries(req.body || {});

    for (const [key, value] of entries) {
      await query(
        `
        INSERT INTO settings
        (key,value,updated_at)
        VALUES
        ($1,$2,NOW())
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
        `,
        [key, String(value)]
      );
    }

    res.json({
      success: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   SEARCH
========================= */

app.get("/api/search", async (req, res) => {
  const q = safeText(req.query.q);

  if (!q) {
    return res.json({
      success: true,
      data: []
    });
  }

  if (!pool) {
    return res.json({
      success: true,
      database: false,
      data: []
    });
  }

  try {
    const result = await query(
      `
      SELECT
        id,
        title,
        slug,
        excerpt,
        type,
        image_url,
        published_at
      FROM content
      WHERE
        status = 'published'
        AND (
          title ILIKE $1
          OR excerpt ILIKE $1
          OR body ILIKE $1
        )
      ORDER BY published_at DESC NULLS LAST
      LIMIT 50
      `,
      [`%${q}%`]
    );

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/* =========================
   ROOT
========================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    platform: PLATFORM_NAME,
    version: PLATFORM_VERSION,
    status: "online",
    message: "EZ MEDIA API تعمل بنجاح"
  });
});

/* =========================
   404
========================= */

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint غير موجود"
  });
});

app.use((req, res) => {
  res.status(404).send("EZ MEDIA - الصفحة غير موجودة");
});

/* =========================
   START
========================= */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log("====================================");
      console.log("EZ MEDIA");
      console.log("Version:", PLATFORM_VERSION);
      console.log("Port:", PORT);
      console.log("URL:", APP_URL);
      console.log("====================================");
    });
  } catch (error) {
    console.error("Database initialization failed:", error.message);

    app.listen(PORT, "0.0.0.0", () => {
      console.log("EZ MEDIA يعمل بدون قاعدة بيانات.");
      console.log("Port:", PORT);
    });
  }
}

startServer();

/* =========================
   SHUTDOWN
========================= */

async function shutdown(signal) {
  console.log(`${signal} received.`);

  try {
    if (pool) {
      await pool.end();
    }
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
