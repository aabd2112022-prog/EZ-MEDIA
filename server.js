/**
 * EZ MEDIA
 * Automation Engine
 * Version: 1.0.0
 *
 * الوظيفة:
 * RSS / Atom
 *      ↓
 * Fetch
 *      ↓
 * Parse
 *      ↓
 * Deduplicate
 *      ↓
 * Clean
 *      ↓
 * Summarize
 *      ↓
 * Prepare EZ MEDIA Content
 *
 * لا ينسخ المقالات كاملة.
 * يحفظ العنوان + ملخص مختصر + رابط المصدر.
 */

"use strict";

const crypto = require("crypto");

const AUTOMATION_CONFIG = {
  enabled:
    String(process.env.AUTOMATION_ENABLED || "true")
      .toLowerCase() === "true",

  timeout:
    Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 15000),

  maxItems:
    Number(process.env.MAX_ITEMS_PER_SOURCE || 10),

  userAgent:
    process.env.SOURCE_USER_AGENT ||
    "EZ-MEDIA-Automation/1.0"
};


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

  const text =
    stripHtml(value)
      .replace(/\s+/g, " ")
      .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return (
    text.slice(0, maxLength)
      .replace(/\s+\S*$/, "") +
    "…"
  );
}


function escapeRegex(value) {

  return String(value || "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


/* =========================================================
   XML HELPERS
========================================================= */

function getTag(xml, tagNames) {

  const names = Array.isArray(tagNames)
    ? tagNames
    : [tagNames];

  for (const tag of names) {

    const escaped =
      escapeRegex(tag);

    const regex =
      new RegExp(
        `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
        "i"
      );

    const match =
      xml.match(regex);

    if (match && match[1]) {
      return decodeEntities(
        match[1].trim()
      );
    }
  }

  return "";
}


function getAttribute(xml, tag, attribute) {

  const regex =
    new RegExp(
      `<${escapeRegex(tag)}[^>]*\\s${escapeRegex(attribute)}=["']([^"']+)["']`,
      "i"
    );

  const match =
    xml.match(regex);

  return match
    ? decodeEntities(match[1])
    : "";
}


function extractBlocks(xml, tag) {

  const regex =
    new RegExp(
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

  /*
   RSS
  */

  const rssItems =
    extractBlocks(xml, "item");

  for (const block of rssItems) {

    const title =
      cleanText(
        getTag(block, ["title"]),
        300
      );

    const description =
      cleanText(
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
      getTag(
        block,
        ["link"]
      ) ||
      getAttribute(
        block,
        "link",
        "href"
      );

    const guid =
      cleanText(
        getTag(
          block,
          ["guid"]
        ),
        500
      );

    const date =
      getTag(
        block,
        [
          "pubDate",
          "published",
          "updated"
        ]
      );

    if (!title) {
      continue;
    }

    items.push({
      externalId:
        guid ||
        link ||
        hash(title + "|" + sourceUrl),

      title,

      description,

      link:
        resolveUrl(
          link,
          sourceUrl
        ),

      publishedAt:
        parseDate(date),

      raw: block
    });
  }


  /*
   Atom
  */

  if (!items.length) {

    const entries =
      extractBlocks(
        xml,
        "entry"
      );

    for (const block of entries) {

      const title =
        cleanText(
          getTag(block, "title"),
          300
        );

      const description =
        cleanText(
          getTag(
            block,
            [
              "content",
              "summary"
            ]
          ),
          1200
        );

      let link =
        getAttribute(
          block,
          "link",
          "href"
        );

      if (!link) {
        link =
          getTag(
            block,
            "link"
          );
      }

      const id =
        cleanText(
          getTag(
            block,
            "id"
          ),
          500
        );

      const date =
        getTag(
          block,
          [
            "published",
            "updated"
          ]
        );

      if (!title) {
        continue;
      }

      items.push({
        externalId:
          id ||
          link ||
          hash(title + "|" + sourceUrl),

        title,

        description,

        link:
          resolveUrl(
            link,
            sourceUrl
          ),

        publishedAt:
          parseDate(date),

        raw: block
      });
    }
  }

  return items;
}


function resolveUrl(link, base) {

  if (!link) {
    return "";
  }

  try {

    return new URL(
      link,
      base
    ).toString();

  } catch {

    return link;
  }
}


function parseDate(value) {

  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date.toISOString();
}


/* =========================================================
   FETCH
========================================================= */

async function fetchWithTimeout(
  url,
  timeout = AUTOMATION_CONFIG.timeout
) {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            "User-Agent":
              AUTOMATION_CONFIG.userAgent,

            "Accept":
              "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5"
          },

          redirect: "follow",

          signal:
            controller.signal
        }
      );

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );
    }

    return {
      response,
      text:
        await response.text()
    };

  } finally {

    clearTimeout(timer);
  }
}


/* =========================================================
   SUMMARIZER
========================================================= */

function makeSummary(text) {

  const clean =
    cleanText(text, 1500);

  if (!clean) {
    return "";
  }

  /*
   نأخذ أول جملتين تقريباً.
   هذا ليس نسخاً كاملاً للمصدر.
  */

  const sentences =
    clean.split(
      /(?<=[.!؟])\s+/
    );

  return cleanText(
    sentences
      .slice(0, 2)
      .join(" "),
    500
  );
}


/* =========================================================
   SECTION DETECTION
========================================================= */

function detectSection(
  source,
  item
) {

  if (source.section) {
    return source.section;
  }

  const text =
    (
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

  const text =
    (
      item.title +
      " " +
      item.description
    ).toLowerCase();


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


/* =========================================================
   TRANSFORM
========================================================= */

function transformItem(
  item,
  source
) {

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

    summary
      ? summary
      : "تم رصد هذا المحتوى من المصدر المرتبط.",

    "",

    "المصدر: " +
      sourceName,

    "الرابط الأصلي: " +
      item.link

  ].join("\n");


  return {

    id:
      createId("content"),

    title:
      item.title,

    excerpt:
      summary,

    body,

    section,

    branch,

    type:
      "article",

    sourceName,

    sourceUrl:
      item.link,

    externalId:
      item.externalId,

    publishedAt:
      item.publishedAt,

    contentHash:
      hash(
        item.title +
        "|" +
        item.link
      ),

    metadata: {

      automated:
        true,

      source_id:
        source.id || null,

      source_name:
        sourceName,

      source_url:
        item.link,

      fetched_at:
        new Date().toISOString(),

      original_published_at:
        item.publishedAt

    }
  };
}


/* =========================================================
   SOURCE ENGINE
========================================================= */

async function fetchSource(
  source
) {

  if (!source || !source.url) {

    throw new Error(
      "المصدر لا يحتوي على URL"
    );
  }

  const result =
    await fetchWithTimeout(
      source.url
    );

  const items =
    parseFeed(
      result.text,
      source.url
    );

  const limited =
    items.slice(
      0,
      Number(
        source.max_items_per_run ||
        AUTOMATION_CONFIG.maxItems
      )
    );

  return {

    source,

    count:
      limited.length,

    items:
      limited

  };
}


/* =========================================================
   DATABASE INTEGRATION
========================================================= */

async function saveNewItems(
  db,
  source,
  items
) {

  if (!db) {

    throw new Error(
      "DATABASE_URL غير متوفر"
    );
  }

  const saved = [];

  for (const item of items) {

    const externalId =
      item.externalId ||
      hash(
        item.title +
        "|" +
        item.link
      );

    /*
     منع التكرار
    */

    const existing =
      await db.query(
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


    const duplicateHash =
      await db.query(
        `
        SELECT id
        FROM source_items
        WHERE content_hash = $1
        LIMIT 1
        `,
        [
          contentHash
        ]
      );


    if (
      duplicateHash.rows.length
    ) {
      continue;
    }


    const id =
      createId("srcitem");


    await db.query(
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
        raw,
        created_at
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,NOW()
      )
      `,
      [
        id,

        source.id,

        externalId,

        item.link,

        item.title,

        item.publishedAt,

        contentHash,

        JSON.stringify(item)
      ]
    );


    saved.push({
      ...item,

      id,

      contentHash
    });
  }

  return saved;
}


/* =========================================================
   PERSIST CONTENT
========================================================= */

async function createContent(
  db,
  transformed,
  source
) {

  const id =
    transformed.id;


  /*
   البحث عن section_id
  */

  let sectionId = null;

  if (transformed.section) {

    const sectionResult =
      await db.query(
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
          slugify(transformed.section)
        ]
      );

    if (
      sectionResult.rows.length
    ) {

      sectionId =
        sectionResult.rows[0].id;
    }
  }


  const autoPublish =
    source.auto_publish !== false;


  const status =
    autoPublish
      ? "published"
      : "review";


  await db.query(
    `
    INSERT INTO content
    (
      id,
      section_id,
      branch,
      type,
      title,
      body,
      status,
      published_at,
      metadata,
      created_at,
      updated_at
    )
    VALUES
    (
      $1,$2,$3,$4,$5,$6,$7,
      CASE
        WHEN $7 = 'published'
        THEN NOW()
        ELSE NULL
      END,
      $8,
      NOW(),
      NOW()
    )
    `,
    [
      id,

      sectionId,

      transformed.branch,

      transformed.type,

      transformed.title,

      transformed.body,

      status,

      JSON.stringify(
        transformed.metadata
      )
    ]
  );


  return {
    id,
    status,
    sectionId
  };
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


/* =========================================================
   FULL SOURCE PROCESS
========================================================= */

async function processSource(
  db,
  source
) {

  const fetched =
    await fetchSource(
      source
    );


  if (!fetched.items.length) {

    return {
      source:
        source.name,

      fetched: 0,

      newItems: 0,

      published: 0
    };
  }


  const newItems =
    await saveNewItems(
      db,
      source,
      fetched.items
    );


  let published = 0;

  for (const item of newItems) {

    const transformed =
      transformItem(
        item,
        source
      );


    await createContent(
      db,
      transformed,
      source
    );


    published++;
  }


  await db.query(
    `
    UPDATE sources
    SET
      last_fetch_at = NOW(),
      last_error = NULL
    WHERE id = $1
    `,
    [
      source.id
    ]
  );


  return {

    source:
      source.name,

    fetched:
      fetched.items.length,

    newItems:
      newItems.length,

    published
  };
}


/* =========================================================
   EXPORT
========================================================= */

module.exports = {

  config:
    AUTOMATION_CONFIG,

  fetchSource,

  processSource,

  parseFeed,

  transformItem,

  makeSummary,

  detectSection,

  detectBranch,

  cleanText,

  stripHtml
};
