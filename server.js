const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

/* =========================
   EZ MEDIA DATABASE
========================= */

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "ez-media.db"));

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT,
    section TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'article',
    excerpt TEXT DEFAULT '',
    body TEXT DEFAULT '',
    image TEXT DEFAULT '',
    video TEXT DEFAULT '',
    author TEXT DEFAULT 'EZ MEDIA',
    status TEXT DEFAULT 'draft',
    featured INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT
);

CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    image TEXT DEFAULT '',
    button_text TEXT DEFAULT 'استكشف القسم',
    link TEXT DEFAULT '#',
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    placement TEXT NOT NULL,
    image TEXT DEFAULT '',
    video TEXT DEFAULT '',
    link TEXT DEFAULT '#',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'live',
    stream_url TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    description TEXT DEFAULT '',
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    presenter TEXT DEFAULT '',
    image TEXT DEFAULT '',
    schedule TEXT DEFAULT '',
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT DEFAULT 'rss',
    active INTEGER DEFAULT 1,
    last_fetch TEXT
);

CREATE TABLE IF NOT EXISTS automation_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    details TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT DEFAULT ''
);
`);

/* =========================
   30 MAIN SECTIONS
========================= */

const sections = [
    ["الأخبار", "news", "أخبار محلية وعربية ودولية"],
    ["المحلي", "local", "الأخبار والتغطيات المحلية"],
    ["العالمي", "global", "الأخبار والأحداث العالمية"],
    ["السياسة", "politics", "الشأن السياسي والتحليلات"],
    ["الاقتصاد", "economy", "اقتصاد وأسواق واستثمار"],
    ["الأعمال", "business", "الشركات وريادة الأعمال"],
    ["التقنية", "technology", "التقنية والتحول الرقمي"],
    ["الذكاء الاصطناعي", "ai", "الذكاء الاصطناعي ومستقبل التقنية"],
    ["المجتمع", "society", "قصص ومبادرات مجتمعية"],
    ["الثقافة", "culture", "الثقافة والفنون والإبداع"],
    ["الترفيه", "entertainment", "الترفيه والفعاليات"],
    ["الرياضة", "sports", "الأخبار والفعاليات الرياضية"],
    ["السياحة", "tourism", "السياحة والوجهات والتجارب"],
    ["الصحة", "health", "المحتوى الصحي والتوعوي"],
    ["التعليم", "education", "التعليم والتدريب والمعرفة"],
    ["العلوم", "science", "العلوم والاكتشافات"],
    ["البيئة", "environment", "البيئة والاستدامة"],
    ["السيارات", "cars", "السيارات وتقنيات النقل"],
    ["الطيران", "aviation", "الطيران والمطارات"],
    ["الإعلام", "media", "صناعة الإعلام والتحول الرقمي"],
    ["صناعة المحتوى", "content", "صناعة وإدارة المحتوى"],
    ["التغطيات الميدانية", "coverage", "التغطيات والفعاليات الميدانية"],
    ["الفيديو", "video", "الفيديو والمحتوى المرئي"],
    ["البودكاست", "podcast", "البرامج والحلقات الصوتية"],
    ["البث المباشر", "live", "البث المباشر للأحداث والبرامج"],
    ["القناة الفضائية", "satellite", "بوابة القناة والبث الفضائي"],
    ["الإعلانات", "advertising", "الحلول والمساحات الإعلانية"],
    ["الإنتاج المرئي", "production", "التصوير والإنتاج والمونتاج"],
    ["الاستوديو", "studio", "البرامج والاستوديو الرقمي"],
    ["الفعاليات والخدمات", "events-services", "الفعاليات والخدمات الإعلامية"]
];

const insertSection = db.prepare(`
INSERT OR IGNORE INTO sections
(name, slug, description, active, sort_order)
VALUES (?, ?, ?, 1, ?)
`);

const sectionTransaction = db.transaction(() => {
    sections.forEach((section, index) => {
        insertSection.run(
            section[0],
            section[1],
            section[2],
            index + 1
        );
    });
});

sectionTransaction();

/* =========================
   AUTOMATIC BANNERS
========================= */

const bannerInsert = db.prepare(`
INSERT INTO banners
(section,title,subtitle,button_text,link,active)
VALUES (?, ?, ?, ?, ?, 1)
`);

const bannerExists = db.prepare(`
SELECT id FROM banners WHERE section = ?
`);

const bannerTransaction = db.transaction(() => {

    sections.forEach(section => {

        if (!bannerExists.get(section[1])) {

            bannerInsert.run(
                section[1],
                section[0],
                section[2],
                "استكشف القسم",
                "/#"+section[1]
            );

        }

    });

});

bannerTransaction();

/* =========================
   HELPERS
========================= */

function slugify(value) {

    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^\u0600-\u06FFa-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "content";

}

function bool(value) {

    return value === true ||
           value === 1 ||
           value === "1" ? 1 : 0;

}

/* =========================
   HEALTH
========================= */

app.get("/api/health", (req, res) => {

    res.json({
        success: true,
        platform: "EZ MEDIA",
        status: "online",
        version: "3.0.0",
        time: new Date().toISOString()
    });

});

/* =========================
   PLATFORM
========================= */

app.get("/api/platform", (req, res) => {

    res.json({

        name: "EZ MEDIA",

        description:
        "منصة الإعلام الرقمي وصناعة المحتوى",

        sections: 30,

        features: [

            "الأخبار",
            "التغطيات الميدانية",
            "الفيديو",
            "البودكاست",
            "البث المباشر",
            "القناة الفضائية",
            "الإعلانات",
            "الإنتاج المرئي",
            "الاستوديو",
            "صناعة المحتوى",
            "الأتمتة",
            "التحليلات",
            "إدارة المحتوى",
            "إدارة البنرات",
            "إدارة الوسائط",
            "إدارة المصادر"

        ]

    });

});

/* =========================
   SECTIONS
========================= */

app.get("/api/sections", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM sections
        WHERE active = 1
        ORDER BY sort_order
        `).all()
    );

});

app.post("/api/sections", (req, res) => {

    const {
        name,
        slug,
        description
    } = req.body;

    if (!name) {

        return res.status(400).json({
            success: false,
            error: "اسم القسم مطلوب"
        });

    }

    const finalSlug = slugify(slug || name);

    const result = db.prepare(`
    INSERT INTO sections
    (name,slug,description)
    VALUES (?,?,?)
    `).run(
        name,
        finalSlug,
        description || ""
    );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

/* =========================
   CONTENT
========================= */

app.get("/api/content", (req, res) => {

    const {
        section,
        type,
        status,
        q,
        limit = 100
    } = req.query;

    let sql = `
    SELECT *
    FROM content
    WHERE 1 = 1
    `;

    const params = [];

    if (section) {

        sql += " AND section = ?";
        params.push(section);

    }

    if (type) {

        sql += " AND type = ?";
        params.push(type);

    }

    if (status) {

        sql += " AND status = ?";
        params.push(status);

    }

    if (q) {

        sql += `
        AND (
            title LIKE ?
            OR excerpt LIKE ?
            OR body LIKE ?
        )
        `;

        const search = `%${q}%`;

        params.push(
            search,
            search,
            search
        );

    }

    sql += `
    ORDER BY datetime(created_at) DESC
    LIMIT ?
    `;

    params.push(
        Math.min(
            Number(limit) || 100,
            500
        )
    );

    res.json(
        db.prepare(sql).all(...params)
    );

});

app.get("/api/content/:id", (req, res) => {

    const content =
        db.prepare(`
        SELECT *
        FROM content
        WHERE id = ?
        `).get(req.params.id);

    if (!content) {

        return res.status(404).json({
            success: false,
            error: "المحتوى غير موجود"
        });

    }

    db.prepare(`
    UPDATE content
    SET views = views + 1
    WHERE id = ?
    `).run(req.params.id);

    res.json(content);

});

app.post("/api/content", (req, res) => {

    const b = req.body;

    if (!b.title || !b.section) {

        return res.status(400).json({
            success: false,
            error: "العنوان والقسم مطلوبان"
        });

    }

    const status = b.status || "draft";

    const result = db.prepare(`
    INSERT INTO content
    (
        title,
        slug,
        section,
        type,
        excerpt,
        body,
        image,
        video,
        author,
        status,
        featured,
        published_at
    )
    VALUES
    (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(

        b.title,

        slugify(
            b.slug ||
            b.title
        ),

        b.section,

        b.type ||
        "article",

        b.excerpt ||
        "",

        b.body ||
        "",

        b.image ||
        "",

        b.video ||
        "",

        b.author ||
        "EZ MEDIA",

        status,

        bool(b.featured),

        status === "published"
            ? new Date().toISOString()
            : null

    );

    res.status(201).json({
        success: true,
        id: result.lastInsertRowid
    });

});

app.put("/api/content/:id", (req, res) => {

    const old =
        db.prepare(`
        SELECT *
        FROM content
        WHERE id = ?
        `).get(req.params.id);

    if (!old) {

        return res.status(404).json({
            success: false,
            error: "المحتوى غير موجود"
        });

    }

    const b = req.body;

    const status =
        b.status ??
        old.status;

    db.prepare(`
    UPDATE content
    SET
        title = ?,
        slug = ?,
        section = ?,
        type = ?,
        excerpt = ?,
        body = ?,
        image = ?,
        video = ?,
        author = ?,
        status = ?,
        featured = ?,
        published_at = ?
    WHERE id = ?
    `).run(

        b.title ?? old.title,

        slugify(
            b.slug ??
            old.slug
        ),

        b.section ??
        old.section,

        b.type ??
        old.type,

        b.excerpt ??
        old.excerpt,

        b.body ??
        old.body,

        b.image ??
        old.image,

        b.video ??
        old.video,

        b.author ??
        old.author,

        status,

        bool(
            b.featured ??
            old.featured
        ),

        status === "published"
            ? (
                old.published_at ||
                new Date().toISOString()
              )
            : old.published_at,

        req.params.id

    );

    res.json({
        success: true
    });

});

app.delete("/api/content/:id", (req, res) => {

    const result =
        db.prepare(`
        DELETE FROM content
        WHERE id = ?
        `).run(req.params.id);

    res.json({
        success:
            result.changes > 0
    });

});

/* =========================
   BANNERS
========================= */

app.get("/api/banners", (req, res) => {

    const section =
        req.query.section;

    if (section) {

        return res.json(
            db.prepare(`
            SELECT *
            FROM banners
            WHERE section = ?
            AND active = 1
            `).all(section)
        );

    }

    res.json(
        db.prepare(`
        SELECT *
        FROM banners
        WHERE active = 1
        ORDER BY id
        `).all()
    );

});

app.post("/api/banners", (req, res) => {

    const b = req.body;

    if (!b.section || !b.title) {

        return res.status(400).json({
            success: false,
            error: "القسم والعنوان مطلوبان"
        });

    }

    const result =
        db.prepare(`
        INSERT INTO banners
        (
            section,
            title,
            subtitle,
            image,
            button_text,
            link,
            active
        )
        VALUES (?,?,?,?,?,?,?)
        `).run(

            b.section,
            b.title,
            b.subtitle || "",
            b.image || "",
            b.button_text ||
                "استكشف القسم",
            b.link || "#",
            bool(
                b.active ??
                true
            )

        );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

app.put("/api/banners/:id", (req, res) => {

    const old =
        db.prepare(`
        SELECT *
        FROM banners
        WHERE id = ?
        `).get(req.params.id);

    if (!old) {

        return res.status(404).json({
            success: false,
            error: "البنر غير موجود"
        });

    }

    const b = req.body;

    db.prepare(`
    UPDATE banners
    SET
        section = ?,
        title = ?,
        subtitle = ?,
        image = ?,
        button_text = ?,
        link = ?,
        active = ?
    WHERE id = ?
    `).run(

        b.section ??
            old.section,

        b.title ??
            old.title,

        b.subtitle ??
            old.subtitle,

        b.image ??
            old.image,

        b.button_text ??
            old.button_text,

        b.link ??
            old.link,

        bool(
            b.active ??
            old.active
        ),

        req.params.id

    );

    res.json({
        success: true
    });

});

app.delete("/api/banners/:id", (req, res) => {

    const result =
        db.prepare(`
        DELETE FROM banners
        WHERE id = ?
        `).run(req.params.id);

    res.json({
        success:
            result.changes > 0
    });

});

/* =========================
   ADVERTISING
========================= */

app.get("/api/ads", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM ads
        WHERE active = 1
        ORDER BY id DESC
        `).all()
    );

});

app.post("/api/ads", (req, res) => {

    const b = req.body;

    if (!b.name || !b.type || !b.placement) {

        return res.status(400).json({
            success: false,
            error:
                "اسم الإعلان والنوع والموقع مطلوبة"
        });

    }

    const result =
        db.prepare(`
        INSERT INTO ads
        (
            name,
            type,
            placement,
            image,
            video,
            link,
            active
        )
        VALUES (?,?,?,?,?,?,?)
        `).run(

            b.name,
            b.type,
            b.placement,
            b.image || "",
            b.video || "",
            b.link || "#",
            bool(
                b.active ??
                true
            )

        );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

app.delete("/api/ads/:id", (req, res) => {

    const result =
        db.prepare(`
        DELETE FROM ads
        WHERE id = ?
        `).run(req.params.id);

    res.json({
        success:
            result.changes > 0
    });

});

/* =========================
   LIVE / SATELLITE
========================= */

app.get("/api/channels", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM channels
        WHERE active = 1
        ORDER BY id
        `).all()
    );

});

app.post("/api/channels", (req, res) => {

    const b = req.body;

    if (!b.name) {

        return res.status(400).json({
            success: false,
            error: "اسم القناة مطلوب"
        });

    }

    const result =
        db.prepare(`
        INSERT INTO channels
        (
            name,
            type,
            stream_url,
            logo,
            description,
            active
        )
        VALUES (?,?,?,?,?,?)
        `).run(

            b.name,

            b.type ||
                "live",

            b.stream_url ||
                "",

            b.logo ||
                "",

            b.description ||
                "",

            bool(
                b.active ??
                true
            )

        );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

app.delete("/api/channels/:id", (req, res) => {

    const result =
        db.prepare(`
        DELETE FROM channels
        WHERE id = ?
        `).run(req.params.id);

    res.json({
        success:
            result.changes > 0
    });

});

/* =========================
   PROGRAMS
========================= */

app.get("/api/programs", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM programs
        WHERE active = 1
        ORDER BY id DESC
        `).all()
    );

});

app.post("/api/programs", (req, res) => {

    const b = req.body;

    if (!b.name) {

        return res.status(400).json({
            success: false,
            error: "اسم البرنامج مطلوب"
        });

    }

    const result =
        db.prepare(`
        INSERT INTO programs
        (
            name,
            description,
            presenter,
            image,
            schedule,
            active
        )
        VALUES (?,?,?,?,?,?)
        `).run(

            b.name,
            b.description || "",
            b.presenter || "",
            b.image || "",
            b.schedule || "",
            bool(
                b.active ??
                true
            )

        );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

/* =========================
   MEDIA LIBRARY
========================= */

app.get("/api/media", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM media
        ORDER BY id DESC
        `).all()
    );

});

app.post("/api/media", (req, res) => {

    const b = req.body;

    if (!b.name || !b.type || !b.url) {

        return res.status(400).json({
            success: false,
            error:
                "اسم الوسائط والنوع والرابط مطلوبة"
        });

    }

    const result =
        db.prepare(`
        INSERT INTO media
        (
            name,
            type,
            url,
            thumbnail
        )
        VALUES (?,?,?,?)
        `).run(

            b.name,
            b.type,
            b.url,
            b.thumbnail || ""

        );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

app.delete("/api/media/:id", (req, res) => {

    const result =
        db.prepare(`
        DELETE FROM media
        WHERE id = ?
        `).run(req.params.id);

    res.json({
        success:
            result.changes > 0
    });

});

/* =========================
   SOURCES
========================= */

app.get("/api/sources", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM sources
        ORDER BY id DESC
        `).all()
    );

});

app.post("/api/sources", (req, res) => {

    const b = req.body;

    if (!b.name || !b.url) {

        return res.status(400).json({
            success: false,
            error:
                "اسم المصدر والرابط مطلوبان"
        });

    }

    const result =
        db.prepare(`
        INSERT INTO sources
        (
            name,
            url,
            type,
            active
        )
        VALUES (?,?,?,?)
        `).run(

            b.name,
            b.url,
            b.type || "rss",
            bool(
                b.active ??
                true
            )

        );

    res.json({
        success: true,
        id: result.lastInsertRowid
    });

});

app.delete("/api/sources/:id", (req, res) => {

    const result =
        db.prepare(`
        DELETE FROM sources
        WHERE id = ?
        `).run(req.params.id);

    res.json({
        success:
            result.changes > 0
    });

});

/* =========================
   AUTOMATION
========================= */

app.post("/api/automation/run", (req, res) => {

    const action =
        req.body?.action ||
        "تشغيل الأتمتة";

    const result =
        db.prepare(`
        INSERT INTO automation_logs
        (
            action,
            status,
            details
        )
        VALUES (?,?,?)
        `).run(

            action,

            "completed",

            "تم تشغيل دورة الأتمتة الداخلية. ربط الخدمات الخارجية يحتاج مفاتيح API وصلاحيات رسمية."

        );

    res.json({

        success: true,

        run_id:
            result.lastInsertRowid,

        message:
            "تم تشغيل دورة الأتمتة الداخلية"

    });

});

app.get("/api/automation/logs", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM automation_logs
        ORDER BY id DESC
        LIMIT 200
        `).all()
    );

});

/* =========================
   DASHBOARD STATISTICS
========================= */

app.get("/api/stats", (req, res) => {

    const count = table => {

        return db.prepare(
            `SELECT COUNT(*) AS total
             FROM ${table}`
        ).get().total;

    };

    const views =
        db.prepare(`
        SELECT COALESCE(
            SUM(views),0
        ) AS total
        FROM content
        `).get().total;

    res.json({

        sections:
            count("sections"),

        content:
            count("content"),

        banners:
            count("banners"),

        ads:
            count("ads"),

        channels:
            count("channels"),

        programs:
            count("programs"),

        media:
            count("media"),

        sources:
            count("sources"),

        automation:
            count("automation_logs"),

        views

    });

});

/* =========================
   SETTINGS
========================= */

app.get("/api/settings", (req, res) => {

    res.json(
        db.prepare(`
        SELECT *
        FROM settings
        ORDER BY id
        `).all()
    );

});

app.post("/api/settings", (req, res) => {

    const {
        key,
        value
    } = req.body;

    if (!key) {

        return res.status(400).json({
            success: false,
            error: "مفتاح الإعداد مطلوب"
        });

    }

    db.prepare(`
    INSERT INTO settings
    (setting_key,setting_value)
    VALUES (?,?)
    ON CONFLICT(setting_key)
    DO UPDATE SET
    setting_value = excluded.setting_value
    `).run(
        key,
        value || ""
    );

    res.json({
        success: true
    });

});

/* =========================
   FRONTEND
========================= */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

app.get("*", (req, res) => {

    if (
        req.path.startsWith("/api/")
    ) {

        return res.status(404).json({
            success: false,
            error: "واجهة API غير موجودة"
        });

    }

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "index.html"
        )
    );

});

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {

    console.error(err);

    res.status(500).json({

        success: false,

        error:
            "حدث خطأ داخلي في EZ MEDIA"

    });

});

/* =========================
   START
========================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `EZ MEDIA يعمل على المنفذ ${PORT}`
        );

        console.log(
            "30 قسمًا جاهزة"
        );

        console.log(
            "نظام المحتوى جاهز"
        );

        console.log(
            "نظام البنرات جاهز"
        );

        console.log(
            "نظام الإعلانات جاهز"
        );

        console.log(
            "نظام البث جاهز"
        );

        console.log(
            "نظام الأتمتة جاهز"
        );

    }
);
