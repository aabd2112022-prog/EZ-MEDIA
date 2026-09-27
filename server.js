/**
 * EZ MEDIA
 * Unified Media Platform Server
 * Version: 8.1.0
 *
 * يحتوي على:
 * - Express API
 * - PostgreSQL
 * - 30 قسم
 * - RSS / Atom Fetch
 * - Parsing
 * - Deduplication
 * - Summarization
 * - Auto Publishing
 * - Automation Scheduler
 * - Distribution Queue
 * - Analytics
 * - Settings
 * - Static Frontend
 */

"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");

/* =========================================================
   CONFIG
========================================================= */

const PORT = Number(process.env.PORT || 8080);

const PLATFORM_NAME = "EZ MEDIA";
const PLATFORM_VERSION = "8.1.0";

const APP_URL =
  process.env.APP_URL ||
  "https://ez-media-ez-media.up.railway.app";

const AUTOMATION_ENABLED =
  String(process.env.AUTOMATION_ENABLED || "true").toLowerCase() ===
  "true";

const AUTOMATION_INTERVAL_MS =
  Number(process.env.AUTOMATION_INTERVAL_MS || 60000);

const SOURCE_FETCH_TIMEOUT_MS =
  Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 15000);

const MAX_ITEMS_PER_SOURCE =
  Number(process.env.MAX_ITEMS_PER_SOURCE || 10);

const USER_AGENT =
  process.env.SOURCE_USER_AGENT ||
  "EZ-MEDIA-Automation/8.1.0";

const DATABASE_URL =
  process.env.DATABASE_URL || "";

const DB_SSL =
  String(process.env.DB_SSL || "true").toLowerCase() !== "false";

/* =========================================================
   APP
========================================================= */

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  cors({
    origin: true,
    credentials: false
  })
);

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);

/* =========================================================
   DATABASE
========================================================= */

let pool = null;

if (DATABASE_URL) {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DB_SSL ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  pool.on("error", (err) => {
    console.error("EZ MEDIA PostgreSQL pool error:", err.message);
  });
}

async function dbQuery(text, values = []) {
  if (!pool) {
    throw new Error("DATABASE_URL غير موجود");
  }

  return pool.query(text, values);
}

async function databaseAvailable() {
  if (!pool) return false;

  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   HELPERS
========================================================= */

function createId(prefix = "id") {
  return (
    prefix +
    "_" +
    crypto.randomBytes(12).toString("hex")
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(
      /[^\u0600-\u06FFa-z0-9-]/g,
      ""
    )
    .replace(/-+/g, "-");
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function stripHtml(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanText(value, maxLength = 1000) {
  const text = stripHtml(value);

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text
      .slice(0, maxLength)
      .replace(/\s+\S*$/, "") +
    "…"
  );
}

function makeSummary(text) {
  const clean = cleanText(text, 1500);

  if (!clean) return "";

  const sentences = clean.split(
    /(?<=[.!؟])\s+/
  );

  return cleanText(
    sentences.slice(0, 2).join(" "),
    500
  );
}

function parseDate(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function resolveUrl(link, base) {
  if (!link) return "";

  try {
    return new URL(link, base).toString();
  } catch {
    return link;
  }
}

function escapeRegex(value) {
  return String(value || "").replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

/* =========================================================
   30 SECTIONS
========================================================= */

const SECTIONS = [
  ["الأخبار", "📰", ["أخبار اليوم", "عاجل", "تقارير", "تحليلات"]],
  ["التغطيات", "🎥", ["تغطيات ميدانية", "فعاليات", "معارض", "مؤتمرات"]],
  ["الفيديو", "▶️", ["فيديوهات", "تقارير مرئية", "قصص قصيرة", "إنتاج خاص"]],
  ["البودكاست", "🎙️", ["حلقات", "حوارات", "لقاءات", "برامج صوتية"]],
  ["البث المباشر", "🔴", ["مباشر الآن", "جدول البث", "إعادة البث"]],
  ["الفضائية", "📡", ["برامج", "تقارير", "نشرات", "بث فضائي"]],
  ["الذكاء الاصطناعي", "🤖", ["أدوات AI", "إنتاج AI", "أتمتة", "مختبر AI"]],
  ["الأتمتة", "⚙️", ["سير العمل", "النشر", "جدولة", "مهام آلية"]],
  ["الإعلانات", "📢", ["إعلانات رقمية", "حملات", "مساحات إعلانية"]],
  ["الرعاية", "🤝", ["رعاية برامج", "رعاية فعاليات", "شراكات"]],
  ["الإنتاج", "🎬", ["إنتاج فيديو", "تصوير", "مونتاج", "إخراج"]],
  ["الاستوديو", "🎞️", ["تصوير", "صوت", "إضاءة", "بث"]],
  ["الفعاليات", "🎪", ["فعاليات", "مناسبات", "معارض", "مؤتمرات"]],
  ["المجتمع", "👥", ["مبادرات", "قصص", "مشاركات"]],
  ["الاقتصاد", "💼", ["أعمال", "شركات", "أسواق", "ريادة"]],
  ["التقنية", "💻", ["تقنية", "ابتكار", "تطبيقات", "منصات"]],
  ["السفر", "✈️", ["وجهات", "فنادق", "تجارب", "تغطيات"]],
  ["الرياضة", "🏆", ["أخبار رياضية", "فعاليات", "مقابلات", "تغطيات"]],
  ["الثقافة", "📚", ["ثقافة", "كتب", "فنون", "معرفة"]],
  ["الترفيه", "🎭", ["ترفيه", "فعاليات", "نجوم", "تجارب"]],
  ["الصورة", "📷", ["صور", "معارض", "تصوير ميداني"]],
  ["الصوت", "🎧", ["صوتيات", "مقابلات", "تعليق صوتي"]],
  ["الأرشيف", "🗄️", ["أرشيف الأخبار", "أرشيف الفيديو", "أرشيف الصور"]],
  ["الملف الإعلامي", "👤", ["نبذة", "إنجازات", "اعتمادات", "ظهور إعلامي"]],
  ["الخدمات", "💼", ["تغطيات", "إنتاج", "إعلانات", "استشارات"]],
  ["التجارة", "🛒", ["متجر", "منتجات", "عروض", "خدمات تجارية"]],
  ["الشركاء", "🌐", ["شركاء إعلاميون", "شركاء تجاريون", "جهات"]],
  ["المعلنون", "📣", ["المعلنون", "الحملات", "النتائج"]],
  ["التحليلات", "📊", ["المشاهدات", "الوصول", "الأداء", "التقارير"]],
  ["مركز الإعلام", "📺", ["بيانات إعلامية", "صور صحفية", "مواد إعلامية", "تواصل إعلامي"]]
];

/* =========================================================
   DATABASE SCHEMA
========================================================= */

async function ensureSchema() {
  if (!pool) {
    console.log("DATABASE_URL غير موجود - السيرفر يعمل بدون قاعدة بيانات.");
    return;
  }

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT,
      slug TEXT UNIQUE,
      icon TEXT,
      description TEXT,
      sort_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      section_id TEXT,
      name TEXT NOT NULL,
      slug TEXT,
      sort_order INTEGER DEFAULT 0,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY,
      section_id TEXT,
      branch TEXT,
      type TEXT DEFAULT 'article',
      title TEXT NOT NULL,
      excerpt TEXT,
      body TEXT,
      status TEXT DEFAULT 'draft',
      media_url TEXT,
      thumbnail_url TEXT,
      source_url TEXT,
      scheduled_at TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT DEFAULT 'rss',
      active BOOLEAN DEFAULT TRUE,
      section TEXT,
      branch TEXT,
      section_id TEXT,
      auto_publish BOOLEAN DEFAULT TRUE,
      fetch_interval_minutes INTEGER DEFAULT 15,
      max_items_per_run INTEGER DEFAULT 10,
      transform_mode TEXT DEFAULT 'summary',
      last_fetch_at TIMESTAMPTZ,
      last_error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS source_items (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      external_id TEXT,
      external_url TEXT,
      title TEXT,
      published_at TIMESTAMPTZ,
      content_hash TEXT,
      raw JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(source_id, external_id)
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      source_id TEXT,
      status TEXT,
      message TEXT,
      processed_count INTEGER DEFAULT 0,
      published_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      details JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      status TEXT DEFAULT 'active',
      configuration JSONB DEFAULT '{}'::jsonb,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS distribution_queue (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      platform TEXT,
      target TEXT,
      status TEXT DEFAULT 'queued',
      payload JSONB DEFAULT '{}'::jsonb,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      next_attempt_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_type TEXT,
      content_id TEXT,
      platform TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      type TEXT,
      url TEXT,
      title TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT,
      type TEXT,
      url TEXT,
      logo_url TEXT,
      active BOOLEAN DEFAULT TRUE,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS advertisements (
      id TEXT PRIMARY KEY,
      title TEXT,
      organization TEXT,
      image_url TEXT,
      link TEXT,
      status TEXT DEFAULT 'draft',
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_content_status
    ON content(status)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_content_section
    ON content(section_id)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_content_published
    ON content(published_at DESC)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_sources_active
    ON sources(active)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_source_items_hash
    ON source_items(content_hash)
  `);

  await dbQuery(`
    CREATE INDEX IF NOT EXISTS idx_distribution_status
    ON distribution_queue(status)
  `);

  await seedSections();
  await seedSettings();
}

async function seedSections() {
  for (let i = 0; i < SECTIONS.length; i++) {
    const [name, icon, branches] = SECTIONS[i];

    const id = "section_" + slugify(name);

    await dbQuery(
      `
      INSERT INTO sections
      (id,name,title,slug,icon,sort_order,active)
      VALUES
      ($1,$2,$2,$3,$4,$5,true)
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        title = EXCLUDED.title,
        slug = EXCLUDED.slug,
        icon = EXCLUDED.icon,
        sort_order = EXCLUDED.sort_order
      `,
      [
        id,
        name,
        slugify(name),
        icon,
        i + 1
      ]
    );

    for (let j = 0; j < branches.length; j++) {
      const branchName = branches[j];

      await dbQuery(
        `
        INSERT INTO branches
        (id,section_id,name,slug,sort_order,active)
        VALUES
        ($1,$2,$3,$4,$5,true)
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          sort_order = EXCLUDED.sort_order
        `,
        [
          `${id}_branch_${j + 1}`,
          id,
          branchName,
          slugify(branchName),
          j + 1
        ]
      );
    }
  }
}

async function seedSettings() {
  const defaults = {
    automation_enabled: String(AUTOMATION_ENABLED),
    automation_interval_ms: String(AUTOMATION_INTERVAL_MS),
    source_fetch_timeout_ms: String(SOURCE_FETCH_TIMEOUT_MS),
    max_items_per_source: String(MAX_ITEMS_PER_SOURCE),
    distribution_enabled: "true",
    distribution_platforms:
      "snapchat,tiktok,instagram,youtube,x,facebook"
  };

  for (const [key, value] of Object.entries(defaults)) {
    await dbQuery(
      `
      INSERT INTO settings(key,value)
      VALUES($1,$2)
      ON CONFLICT(key) DO NOTHING
      `,
      [key, value]
    );
  }
}

/* =========================================================
   RSS / ATOM
========================================================= */

function getTag(xml, tagNames) {
  const names = Array.isArray(tagNames)
    ? tagNames
    : [tagNames];

  for (const tag of names) {
    const regex = new RegExp(
      `<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`,
      "i"
    );

    const match = xml.match(regex);

    if (match && match[1]) {
      return decodeEntities(match[1].trim());
    }
  }

  return "";
}

function getAttribute(xml, tag, attribute) {
  const regex = new RegExp(
    `<${escapeRegex(tag)}[^>]*\\s${escapeRegex(attribute)}=["']([^"']+)["']`,
    "i"
  );

  const match = xml.match(regex);

  return match
    ? decodeEntities(match[1])
    : "";
}

function extractBlocks(xml, tag) {
  const regex = new RegExp(
    `<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegex(tag)}>`,
    "gi"
  );

  const blocks = [];

  let match;

  while ((match = regex.exec(xml)) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
}

function parseFeed(xml, sourceUrl) {
  const items = [];

  const rssItems = extractBlocks(xml, "item");

  for (const block of rssItems) {
    const title = cleanText(
      getTag(block, ["title"]),
      300
    );

    const description = cleanText(
      getTag(
        block,
        [
          "content:encoded",
          "description",
          "summary"
        ]
      ),
      1200
    );

    const link =
      getTag(block, ["link"]) ||
      getAttribute(block, "link", "href");

    const guid = cleanText(
      getTag(block, ["guid"]),
      500
    );

    const date = getTag(
      block,
      [
        "pubDate",
        "published",
        "updated"
      ]
    );

    if (!title) continue;

    items.push({
      externalId:
        guid ||
        link ||
        hash(title + "|" + sourceUrl),

      title,
      description,

      link: resolveUrl(
        link,
        sourceUrl
      ),

      publishedAt: parseDate(date),

      raw: block
    });
  }

  if (!items.length) {
    const entries = extractBlocks(
      xml,
      "entry"
    );

    for (const block of entries) {
      const title = cleanText(
        getTag(block, "title"),
        300
      );

      const description = cleanText(
        getTag(
          block,
          [
            "content",
            "summary"
          ]
        ),
        1200
      );

      let link = getAttribute(
        block,
        "link",
        "href"
      );

      if (!link) {
        link = getTag(
          block,
          "link"
        );
      }

      const id = cleanText(
        getTag(block, "id"),
        500
      );

      const date = getTag(
        block,
        [
          "published",
          "updated"
        ]
      );

      if (!title) continue;

      items.push({
        externalId:
          id ||
          link ||
          hash(title + "|" + sourceUrl),

        title,
        description,

        link: resolveUrl(
          link,
          sourceUrl
        ),

        publishedAt: parseDate(date),

        raw: block
      });
    }
  }

  return items;
}

async function fetchWithTimeout(
  url,
  timeout = SOURCE_FETCH_TIMEOUT_MS
) {
  const controller =
    new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    const response = await fetch(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5"
        },
        redirect: "follow",
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return {
      response,
      text: await response.text()
    };
  } finally {
    clearTimeout(timer);
  }
}

/* =========================================================
   CONTENT DETECTION
========================================================= */

function detectSection(source, item) {
  if (source.section) {
    return source.section;
  }

  const text = (
    item.title +
    " " +
    item.description
  ).toLowerCase();

  if (
    /رياض|كرة|دوري|بطولة|لاعب/.test(text)
  ) {
    return "الرياضة";
  }

  if (
    /تقنية|ذكاء اصطناعي|ai|تطبيق|رقمي/.test(text)
  ) {
    return "التقنية";
  }

  if (
    /سفر|سياحة|فندق|وجهة/.test(text)
  ) {
    return "السفر";
  }

  if (
    /اقتصاد|شركة|سوق|استثمار|أعمال/.test(text)
  ) {
    return "الاقتصاد";
  }

  if (
    /ثقافة|كتاب|فن|متحف/.test(text)
  ) {
    return "الثقافة";
  }

  return "الأخبار";
}

function detectBranch(
  source,
  item,
  section
) {
  if (source.branch) {
    return source.branch;
  }

  if (section === "الرياضة") {
    return "أخبار رياضية";
  }

  if (section === "التقنية") {
    return "تقنية";
  }

  if (section === "السفر") {
    return "وجهات";
  }

  if (section === "الاقتصاد") {
    return "أعمال";
  }

  if (section === "الثقافة") {
    return "ثقافة";
  }

  return "أخبار اليوم";
}

function transformItem(item, source) {
  const section =
    detectSection(
      source,
      item
    );

  const branch =
    detectBranch(
      source,
      item,
      section
    );

  const summary =
    makeSummary(
      item.description
    );

  const sourceName =
    source.name ||
    "مصدر خارجي";

  const body = [
    summary ||
      "تم رصد هذا المحتوى من المصدر المرتبط.",

    "",

    "المصدر: " +
      sourceName,

    "الرابط الأصلي: " +
      item.link
  ].join("\n");

  return {
    id: createId("content"),

    title: item.title,

    excerpt: summary,

    body,

    section,

    branch,

    type: "article",

    sourceName,

    sourceUrl: item.link,

    externalId: item.externalId,

    publishedAt: item.publishedAt,

    contentHash: hash(
      item.title +
      "|" +
      item.link
    ),

    metadata: {
      automated: true,
      source_id: source.id || null,
      source_name: sourceName,
      source_url: item.link,
      fetched_at:
        new Date().toISOString(),
      original_published_at:
        item.publishedAt
    }
  };
}

/* =========================================================
   SOURCE PROCESSOR
========================================================= */

async function processSource(source) {
  if (!pool) {
    throw new Error(
      "قاعدة البيانات غير متصلة"
    );
  }

  if (!source || !source.url) {
    throw new Error(
      "المصدر لا يحتوي على URL"
    );
  }

  const fetched =
    await fetchWithTimeout(
      source.url
    );

  const items =
    parseFeed(
      fetched.text,
      source.url
    );

  const limited =
    items.slice(
      0,
      Number(
        source.max_items_per_run ||
        MAX_ITEMS_PER_SOURCE
      )
    );

  let newItems = 0;
  let published = 0;

  for (const item of limited) {
    const externalId =
      item.externalId ||
      hash(
        item.title +
        "|" +
        item.link
      );

    const existing =
      await dbQuery(
        `
        SELECT id
        FROM source_items
        WHERE source_id = $1
          AND external_id = $2
        LIMIT 1
        `,
        [
          source.id,
          externalId
        ]
      );

    if (existing.rows.length) {
      continue;
    }

    const contentHash =
      hash(
        item.title +
        "|" +
        item.link
      );

    const duplicate =
      await dbQuery(
        `
        SELECT id
        FROM source_items
        WHERE content_hash = $1
        LIMIT 1
        `,
        [contentHash]
      );

    if (duplicate.rows.length) {
      continue;
    }

    await dbQuery(
      `
      INSERT INTO source_items
      (
        id,
        source_id,
        external_id,
        external_url,
        title,
        published_at,
        content_hash,
        raw
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8)
      `,
      [
        createId("srcitem"),
        source.id,
        externalId,
        item.link,
        item.title,
        item.publishedAt,
        contentHash,
        JSON.stringify(item)
      ]
    );

    const transformed =
      transformItem(
        item,
        source
      );

    let sectionId = null;

    const sectionResult =
      await dbQuery(
        `
        SELECT id
        FROM sections
        WHERE name = $1
           OR title = $1
           OR slug = $2
        LIMIT 1
        `,
        [
          transformed.section,
          slugify(
            transformed.section
          )
        ]
      );

    if (sectionResult.rows.length) {
      sectionId =
        sectionResult.rows[0].id;
    }

    const status =
      source.auto_publish === false
        ? "review"
        : "published";

    await dbQuery(
      `
      INSERT INTO content
      (
        id,
        section_id,
        branch,
        type,
        title,
        excerpt,
        body,
        status,
        source_url,
        published_at,
        metadata
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        CASE
          WHEN $8 = 'published'
          THEN NOW()
          ELSE NULL
        END,
        $10
      )
      `,
      [
        transformed.id,
        sectionId,
        transformed.branch,
        transformed.type,
        transformed.title,
        transformed.excerpt,
        transformed.body,
        status,
        transformed.sourceUrl,
        JSON.stringify(
          transformed.metadata
        )
      ]
    );

    newItems++;

    if (status === "published") {
      published++;
    }
  }

  await dbQuery(
    `
    UPDATE sources
    SET
      last_fetch_at = NOW(),
      last_error = NULL,
      updated_at = NOW()
    WHERE id = $1
    `,
    [source.id]
  );

  return {
    source: source.name,
    fetched: limited.length,
    newItems,
    published
  };
}

/* =========================================================
   AUTOMATION
========================================================= */

let automationBusy = false;
let scheduler = null;

async function createRun(
  status,
  message,
  details = {}
) {
  if (!pool) return null;

  const id = createId("run");

  await dbQuery(
    `
    INSERT INTO automation_runs
    (
      id,
      status,
      message,
      details
    )
    VALUES
    ($1,$2,$3,$4)
    `,
    [
      id,
      status,
      message,
      JSON.stringify(details)
    ]
  );

  return id;
}

async function runFetchAll() {
  if (!pool) {
    throw new Error(
      "قاعدة البيانات غير متصلة"
    );
  }

  if (automationBusy) {
    return {
      busy: true
    };
  }

  automationBusy = true;

  const started =
    Date.now();

  let processed = 0;
  let published = 0;
  let errors = 0;

  const results = [];

  try {
    const sources =
      await dbQuery(
        `
        SELECT *
        FROM sources
        WHERE active = TRUE
        ORDER BY created_at ASC
        `
      );

    for (const source of sources.rows) {
      try {
        const result =
          await processSource(
            source
          );

        processed +=
          result.newItems || 0;

        published +=
          result.published || 0;

        results.push(result);
      } catch (error) {
        errors++;

        await dbQuery(
          `
          UPDATE sources
          SET
            last_error = $1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [
            String(
              error.message ||
              error
            ).slice(0, 1000),
            source.id
          ]
        );

        results.push({
          source: source.name,
          error:
            error.message
        });
      }
    }

    const runId =
      await createRun(
        errors
          ? "completed_with_errors"
          : "completed",
        "اكتملت عملية جلب المصادر",
        {
          processed,
          published,
          errors,
          duration_ms:
            Date.now() - started,
          results
        }
      );

    return {
      success: true,
      runId,
      processed,
      published,
      errors,
      duration_ms:
        Date.now() - started,
      results
    };
  } finally {
    automationBusy = false;
  }
}

async function publishScheduled() {
  if (!pool) {
    throw new Error(
      "قاعدة البيانات غير متصلة"
    );
  }

  const result =
    await dbQuery(
      `
      UPDATE content
      SET
        status = 'published',
        published_at = NOW(),
        updated_at = NOW()
      WHERE status IN ('scheduled','ready')
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= NOW()
      RETURNING id,title
      `
    );

  return {
    published:
      result.rowCount,
    items:
      result.rows
  };
}

/* =========================================================
   DISTRIBUTION QUEUE
========================================================= */

const DISTRIBUTION_PLATFORMS = [
  "snapchat",
  "tiktok",
  "instagram",
  "youtube",
  "x",
  "facebook"
];

async function enqueueDistribution(
  contentId
) {
  if (!pool) return 0;

  const contentResult =
    await dbQuery(
      `
      SELECT *
      FROM content
      WHERE id = $1
        AND status = 'published'
      LIMIT 1
      `,
      [contentId]
    );

  if (!contentResult.rows.length) {
    return 0;
  }

  const content =
    contentResult.rows[0];

  let count = 0;

  for (
    const platform
    of DISTRIBUTION_PLATFORMS
  ) {
    const exists =
      await dbQuery(
        `
        SELECT id
        FROM distribution_queue
        WHERE content_id = $1
          AND platform = $2
        LIMIT 1
        `,
        [
          contentId,
          platform
        ]
      );

    if (exists.rows.length) {
      continue;
    }

    await dbQuery(
      `
      INSERT INTO distribution_queue
      (
        id,
        content_id,
        platform,
        target,
        status,
        payload
      )
      VALUES
      (
        $1,$2,$3,$4,'queued',$5
      )
      `,
      [
        createId("dist"),
        contentId,
        platform,
        platform,
        JSON.stringify({
          title:
            content.title,
          excerpt:
            content.excerpt,
          body:
            content.body,
          source_url:
            content.source_url
        })
      ]
    );

    count++;
  }

  return count;
}

async function enqueuePublishedContent() {
  if (!pool) return 0;

  const result =
    await dbQuery(
      `
      SELECT id
      FROM content
      WHERE status = 'published'
      ORDER BY published_at DESC NULLS LAST
      LIMIT 100
      `
    );

  let count = 0;

  for (const row of result.rows) {
    count +=
      await enqueueDistribution(
        row.id
      );
  }

  return count;
}

/* =========================================================
   API
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,
      platform: PLATFORM_NAME,
      version: PLATFORM_VERSION,
      status: "online",
      database:
        pool
          ? "configured"
          : "not_configured",
      time:
        new Date().toISOString()
    });
  }
);

app.get(
  "/api/platform",
  (req, res) => {
    res.json({
      success: true,
      platform: PLATFORM_NAME,
      version: PLATFORM_VERSION,
      app_url: APP_URL,
      automation_enabled:
        AUTOMATION_ENABLED,
      automation_interval_ms:
        AUTOMATION_INTERVAL_MS
    });
  }
);

app.get(
  "/api/health",
  async (req, res) => {
    const database =
      await databaseAvailable();

    res.json({
      success: true,
      platform: PLATFORM_NAME,
      version: PLATFORM_VERSION,
      status: "online",
      database:
        database
          ? "connected"
          : pool
            ? "error"
            : "not_configured",
      automation:
        AUTOMATION_ENABLED
          ? "enabled"
          : "disabled",
      time:
        new Date().toISOString()
    });
  }
);

/* =========================================================
   SECTIONS
========================================================= */

app.get(
  "/api/sections",
  async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          success: true,
          sections:
            SECTIONS.map(
              ([name, icon, branches], index) => ({
                id:
                  "section_" +
                  slugify(name),
                name,
                title: name,
                slug:
                  slugify(name),
                icon,
                sort_order:
                  index + 1,
                branches
              })
            )
        });
      }

      const result =
        await dbQuery(
          `
          SELECT *
          FROM sections
          WHERE active = TRUE
          ORDER BY sort_order ASC
          `
        );

      res.json({
        success: true,
        sections:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.get(
  "/api/branches",
  async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          success: true,
          branches: []
        });
      }

      const result =
        await dbQuery(
          `
          SELECT
            b.*,
            s.name AS section_name
          FROM branches b
          LEFT JOIN sections s
            ON s.id = b.section_id
          WHERE b.active = TRUE
          ORDER BY
            s.sort_order,
            b.sort_order
          `
        );

      res.json({
        success: true,
        branches:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   CONTENT
========================================================= */

app.get(
  "/api/content",
  async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          success: true,
          content: []
        });
      }

      const limit = Math.min(
        Number(req.query.limit || 50),
        200
      );

      const values = [];
      const where = [];

      if (req.query.section) {
        values.push(
          req.query.section
        );

        where.push(
          `(s.slug = $${values.length}
            OR s.name = $${values.length}
            OR c.section_id = $${values.length})`
        );
      }

      if (req.query.branch) {
        values.push(
          req.query.branch
        );

        where.push(
          `c.branch = $${values.length}`
        );
      }

      if (req.query.status) {
        values.push(
          req.query.status
        );

        where.push(
          `c.status = $${values.length}`
        );
      }

      values.push(limit);

      const sql = `
        SELECT
          c.*,
          s.name AS section_name,
          s.slug AS section_slug,
          s.icon AS section_icon
        FROM content c
        LEFT JOIN sections s
          ON s.id = c.section_id
        ${
          where.length
            ? "WHERE " +
              where.join(" AND ")
            : ""
        }
        ORDER BY
          c.published_at DESC NULLS LAST,
          c.created_at DESC
        LIMIT $${values.length}
      `;

      const result =
        await dbQuery(
          sql,
          values
        );

      res.json({
        success: true,
        content:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.get(
  "/api/content/:id",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            c.*,
            s.name AS section_name,
            s.slug AS section_slug
          FROM content c
          LEFT JOIN sections s
            ON s.id = c.section_id
          WHERE c.id = $1
          LIMIT 1
          `,
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
        content:
          result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/content",
  async (req, res) => {
    try {
      const {
        title,
        excerpt,
        body,
        section_id,
        branch,
        type,
        status,
        source_url,
        scheduled_at,
        metadata
      } = req.body;

      if (!title) {
        return res.status(400).json({
          success: false,
          error:
            "العنوان مطلوب"
        });
      }

      const id =
        createId("content");

      const result =
        await dbQuery(
          `
          INSERT INTO content
          (
            id,
            section_id,
            branch,
            type,
            title,
            excerpt,
            body,
            status,
            source_url,
            scheduled_at,
            published_at,
            metadata
          )
          VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            CASE
              WHEN $8 = 'published'
              THEN NOW()
              ELSE NULL
            END,
            $11
          )
          RETURNING *
          `,
          [
            id,
            section_id || null,
            branch || null,
            type || "article",
            title,
            excerpt || "",
            body || "",
            status || "draft",
            source_url || null,
            scheduled_at || null,
            JSON.stringify(
              metadata || {}
            )
          ]
        );

      res.status(201).json({
        success: true,
        content:
          result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.put(
  "/api/content/:id",
  async (req, res) => {
    try {
      const fields = [
        "title",
        "excerpt",
        "body",
        "branch",
        "type",
        "status",
        "source_url",
        "scheduled_at"
      ];

      const updates = [];
      const values = [];

      for (const field of fields) {
        if (
          Object.prototype.hasOwnProperty.call(
            req.body,
            field
          )
        ) {
          values.push(
            req.body[field]
          );

          updates.push(
            `${field} = $${values.length}`
          );
        }
      }

      if (!updates.length) {
        return res.status(400).json({
          success: false,
          error:
            "لا توجد تغييرات"
        });
      }

      values.push(
        req.params.id
      );

      const result =
        await dbQuery(
          `
          UPDATE content
          SET
            ${updates.join(", ")},
            updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *
          `,
          values
        );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error:
            "المحتوى غير موجود"
        });
      }

      res.json({
        success: true,
        content:
          result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.delete(
  "/api/content/:id",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          DELETE FROM content
          WHERE id = $1
          RETURNING id
          `,
          [req.params.id]
        );

      res.json({
        success:
          result.rowCount > 0
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   SOURCES
========================================================= */

app.get(
  "/api/sources",
  async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          success: true,
          sources: []
        });
      }

      const result =
        await dbQuery(
          `
          SELECT *
          FROM sources
          ORDER BY created_at DESC
          `
        );

      res.json({
        success: true,
        sources:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/sources",
  async (req, res) => {
    try {
      const {
        name,
        url,
        type,
        active,
        section,
        branch,
        auto_publish,
        fetch_interval_minutes,
        max_items_per_run
      } = req.body;

      if (!name || !url) {
        return res.status(400).json({
          success: false,
          error:
            "name و url مطلوبان"
        });
      }

      const result =
        await dbQuery(
          `
          INSERT INTO sources
          (
            id,
            name,
            url,
            type,
            active,
            section,
            branch,
            auto_publish,
            fetch_interval_minutes,
            max_items_per_run
          )
          VALUES
          (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
          )
          RETURNING *
          `,
          [
            createId("source"),
            name,
            url,
            type || "rss",
            active !== false,
            section || null,
            branch || null,
            auto_publish !== false,
            Number(
              fetch_interval_minutes || 15
            ),
            Number(
              max_items_per_run ||
              MAX_ITEMS_PER_SOURCE
            )
          ]
        );

      res.status(201).json({
        success: true,
        source:
          result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.put(
  "/api/sources/:id",
  async (req, res) => {
    try {
      const allowed = [
        "name",
        "url",
        "type",
        "active",
        "section",
        "branch",
        "auto_publish",
        "fetch_interval_minutes",
        "max_items_per_run"
      ];

      const updates = [];
      const values = [];

      for (const field of allowed) {
        if (
          Object.prototype.hasOwnProperty.call(
            req.body,
            field
          )
        ) {
          values.push(
            req.body[field]
          );

          updates.push(
            `${field} = $${values.length}`
          );
        }
      }

      if (!updates.length) {
        return res.status(400).json({
          success: false,
          error:
            "لا توجد تغييرات"
        });
      }

      values.push(
        req.params.id
      );

      const result =
        await dbQuery(
          `
          UPDATE sources
          SET
            ${updates.join(", ")},
            updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *
          `,
          values
        );

      res.json({
        success:
          result.rowCount > 0,
        source:
          result.rows[0] || null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.delete(
  "/api/sources/:id",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          DELETE FROM sources
          WHERE id = $1
          RETURNING id
          `,
          [req.params.id]
        );

      res.json({
        success:
          result.rowCount > 0
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   AUTOMATION API
========================================================= */

app.post(
  "/api/automation/fetch-source/:id",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT *
          FROM sources
          WHERE id = $1
          LIMIT 1
          `,
          [req.params.id]
        );

      if (!result.rows.length) {
        return res.status(404).json({
          success: false,
          error:
            "المصدر غير موجود"
        });
      }

      const output =
        await processSource(
          result.rows[0]
        );

      res.json({
        success: true,
        result:
          output
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/automation/fetch-all",
  async (req, res) => {
    try {
      const result =
        await runFetchAll();

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/automation/process",
  async (req, res) => {
    try {
      const result =
        await runFetchAll();

      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/automation/publish",
  async (req, res) => {
    try {
      const result =
        await publishScheduled();

      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/automation/run-full",
  async (req, res) => {
    try {
      const fetchResult =
        await runFetchAll();

      const publishResult =
        await publishScheduled();

      const queueCount =
        await enqueuePublishedContent();

      res.json({
        success: true,
        fetch:
          fetchResult,
        publish:
          publishResult,
        distribution_queued:
          queueCount
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.get(
  "/api/automation/status",
  async (req, res) => {
    let database = false;

    try {
      database =
        await databaseAvailable();
    } catch {}

    res.json({
      success: true,
      enabled:
        AUTOMATION_ENABLED,
      busy:
        automationBusy,
      interval_ms:
        AUTOMATION_INTERVAL_MS,
      database,
      time:
        new Date().toISOString()
    });
  }
);

app.get(
  "/api/automation/logs",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT *
          FROM automation_runs
          ORDER BY created_at DESC
          LIMIT 100
          `
        );

      res.json({
        success: true,
        runs:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   DISTRIBUTION
========================================================= */

app.get(
  "/api/distribution/queue",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT
            q.*,
            c.title
          FROM distribution_queue q
          LEFT JOIN content c
            ON c.id = q.content_id
          ORDER BY q.created_at DESC
          LIMIT 200
          `
        );

      res.json({
        success: true,
        queue:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/distribution/queue",
  async (req, res) => {
    try {
      const {
        content_id
      } = req.body;

      if (!content_id) {
        return res.status(400).json({
          success: false,
          error:
            "content_id مطلوب"
        });
      }

      const count =
        await enqueueDistribution(
          content_id
        );

      res.json({
        success: true,
        queued:
          count
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.post(
  "/api/distribution/:id/retry",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          UPDATE distribution_queue
          SET
            status = 'queued',
            attempts = attempts + 1,
            last_error = NULL,
            next_attempt_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [req.params.id]
        );

      res.json({
        success:
          result.rowCount > 0,
        item:
          result.rows[0] || null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   SETTINGS
========================================================= */

app.get(
  "/api/settings",
  async (req, res) => {
    try {
      const result =
        await dbQuery(
          `
          SELECT *
          FROM settings
          ORDER BY key
          `
        );

      const settings = {};

      for (
        const row
        of result.rows
      ) {
        settings[row.key] =
          row.value;
      }

      res.json({
        success: true,
        settings
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

app.put(
  "/api/settings",
  async (req, res) => {
    try {
      for (
        const [key, value]
        of Object.entries(
          req.body || {}
        )
      ) {
        await dbQuery(
          `
          INSERT INTO settings
          (key,value,updated_at)
          VALUES($1,$2,NOW())
          ON CONFLICT(key)
          DO UPDATE SET
            value = EXCLUDED.value,
            updated_at = NOW()
          `,
          [
            key,
            String(value)
          ]
        );
      }

      res.json({
        success: true
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   STATS
========================================================= */

app.get(
  "/api/stats",
  async (req, res) => {
    try {
      if (!pool) {
        return res.json({
          success: true,
          stats: {
            sections: 30,
            content: 0,
            sources: 0,
            published: 0,
            queued: 0
          }
        });
      }

      const result =
        await dbQuery(`
          SELECT
            (SELECT COUNT(*) FROM sections)
              AS sections,

            (SELECT COUNT(*) FROM content)
              AS content,

            (SELECT COUNT(*) FROM sources)
              AS sources,

            (SELECT COUNT(*)
             FROM content
             WHERE status = 'published')
              AS published,

            (SELECT COUNT(*)
             FROM distribution_queue
             WHERE status = 'queued')
              AS queued
        `);

      res.json({
        success: true,
        stats:
          result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   SEARCH
========================================================= */

app.get(
  "/api/search",
  async (req, res) => {
    try {
      const q =
        String(
          req.query.q || ""
        ).trim();

      if (!q) {
        return res.json({
          success: true,
          results: []
        });
      }

      const result =
        await dbQuery(
          `
          SELECT
            c.*,
            s.name AS section_name
          FROM content c
          LEFT JOIN sections s
            ON s.id = c.section_id
          WHERE
            c.title ILIKE $1
            OR c.excerpt ILIKE $1
            OR c.body ILIKE $1
          ORDER BY
            c.created_at DESC
          LIMIT 50
          `,
          [`%${q}%`]
        );

      res.json({
        success: true,
        results:
          result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   ANALYTICS
========================================================= */

app.post(
  "/api/analytics/event",
  async (req, res) => {
    try {
      const {
        event_type,
        content_id,
        platform,
        metadata
      } = req.body;

      await dbQuery(
        `
        INSERT INTO analytics_events
        (
          id,
          event_type,
          content_id,
          platform,
          metadata
        )
        VALUES
        ($1,$2,$3,$4,$5)
        `,
        [
          createId("event"),
          event_type || "unknown",
          content_id || null,
          platform || null,
          JSON.stringify(
            metadata || {}
          )
        ]
      );

      res.json({
        success: true
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error:
          error.message
      });
    }
  }
);

/* =========================================================
   SOCIAL LINKS
========================================================= */

app.get(
  "/api/social",
  (req, res) => {
    res.json({
      success: true,
      social: {
        snapchat:
          "https://www.snapchat.com/add/arb.200",

        tiktok:
          "https://www.tiktok.com/@arb.20000",

        instagram:
          "https://www.instagram.com/arb.20000",

        youtube:
          "https://www.youtube.com/@arb.200",

        x:
          "https://x.com/arb200300"
      }
    });
  }
);

/* =========================================================
   STATIC FRONTEND
========================================================= */

const publicPath =
  path.join(
    __dirname,
    "public"
  );

app.use(
  express.static(
    publicPath
  )
);

app.get(
  "*",
  (req, res) => {
    if (
      req.path.startsWith("/api/")
    ) {
      return res.status(404).json({
        success: false,
        error:
          "API endpoint not found"
      });
    }

    res.sendFile(
      path.join(
        publicPath,
        "index.html"
      )
    );
  }
);

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(
      "EZ MEDIA ERROR:",
      err
    );

    res.status(500).json({
      success: false,
      error:
        err.message ||
        "Internal Server Error"
    });
  }
);

/* =========================================================
   AUTOMATION SCHEDULER
========================================================= */

async function automationTick() {
  if (!AUTOMATION_ENABLED) {
    return;
  }

  if (!pool) {
    return;
  }

  if (automationBusy) {
    return;
  }

  try {
    await runFetchAll();
    await publishScheduled();
    await enqueuePublishedContent();
  } catch (error) {
    console.error(
      "Automation tick error:",
      error.message
    );
  }
}

/* =========================================================
   START
========================================================= */

async function start() {
  console.log("");
  console.log("======================================");
  console.log("EZ MEDIA");
  console.log("Unified Media Platform");
  console.log("Version:", PLATFORM_VERSION);
  console.log("======================================");

  if (pool) {
    try {
      await ensureSchema();

      console.log(
        "Database: CONNECTED"
      );
    } catch (error) {
      console.error(
        "Database initialization error:",
        error.message
      );
    }
  } else {
    console.log(
      "Database: NOT CONFIGURED"
    );
  }

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `EZ MEDIA listening on port ${PORT}`
      );

      console.log(
        "Automation:",
        AUTOMATION_ENABLED
          ? "ENABLED"
          : "DISABLED"
      );

      console.log(
        "App URL:",
        APP_URL
      );
    }
  );

  if (
    AUTOMATION_ENABLED &&
    pool
  ) {
    scheduler =
      setInterval(
        automationTick,
        AUTOMATION_INTERVAL_MS
      );

    setTimeout(
      automationTick,
      5000
    );
  }
}

/* =========================================================
   SHUTDOWN
========================================================= */

async function shutdown(
  signal
) {
  console.log(
    `\nEZ MEDIA shutting down: ${signal}`
  );

  if (scheduler) {
    clearInterval(
      scheduler
    );
  }

  if (pool) {
    try {
      await pool.end();
    } catch (error) {
      console.error(
        "Pool shutdown error:",
        error.message
      );
    }
  }

  process.exit(0);
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "unhandledRejection",
  (error) => {
    console.error(
      "Unhandled rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  (error) => {
    console.error(
      "Uncaught exception:",
      error
    );
  }
);

/* =========================================================
   RUN
========================================================= */

start().catch(
  (error) => {
    console.error(
      "EZ MEDIA startup failed:",
      error
    );

    process.exit(1);
  }
);
