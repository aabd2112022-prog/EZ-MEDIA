const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تشغيل واجهة EZ MEDIA
app.use(express.static(path.join(__dirname, "public")));

// فحص حالة المنصة
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    platform: "EZ MEDIA",
    status: "online",
    time: new Date().toISOString()
  });
});

// معلومات المنصة
app.get("/api/platform", (req, res) => {
  res.json({
    name: "EZ MEDIA",
    description: "منصة الإعلام الرقمي وصناعة المحتوى",
    version: "1.0.0",
    status: "online"
  });
});

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

// أي مسار غير موجود
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "المسار غير موجود"
  });
});

// تشغيل الخادم
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `EZ MEDIA يعمل على المنفذ ${PORT}`
  );
});
