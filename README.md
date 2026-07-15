# JARVIS Bot

بات تلگرام منشی هوشمند، روی Cloudflare Workers با مدل رایگان OpenRouter (`tencent/hy3:free`).

## فایل‌ها
- `index.js` — کل منطق بات (webhook، حافظه‌ی مکالمه در KV، ریت‌لیمیت، تماس با OpenRouter)
- `knowledge.md` — دانش‌نامه‌ی بات؛ اینجا رو با اطلاعات واقعی ایمان پر کن
- `wrangler.toml` — تنظیمات Cloudflare
- `.dev.vars` — مقادیر حساس برای اجرای محلی (پوش نمی‌شه، در `.gitignore` است)

## راه‌اندازی (یک‌بار)

### ۱. نصب و لاگین
```bash
npm install
npx wrangler login
```

### ۲. ساخت KV namespace
```bash
npx wrangler kv:namespace create JARVIS_KV
```
خروجی یک `id` می‌ده؛ آن را در `wrangler.toml` جای `PUT_YOUR_KV_NAMESPACE_ID_HERE` بگذار.

### ۳. ست کردن secrets روی Cloudflare (پروداکشن)
```bash
npx wrangler secret put BOT_TOKEN
npx wrangler secret put OPENROUTER_API_KEY
npx wrangler secret put WEBHOOK_SECRET
```
مقدار `WEBHOOK_SECRET` را خودت یک رشته‌ی تصادفی انتخاب کن (مثلاً با `openssl rand -hex 24`).

### ۴. دیپلوی
```bash
npx wrangler deploy
```
یک URL شبیه `https://jarvis-bot.<your-subdomain>.workers.dev` می‌گیری.

### ۵. وصل کردن وبهوک تلگرام
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://jarvis-bot.<your-subdomain>.workers.dev" \
  -d "secret_token=<همون WEBHOOK_SECRET>"
```

## اجرای محلی برای تست
```bash
npm run dev
```
(مقادیر از `.dev.vars` خوانده می‌شود)

## نکته‌ی امنیتی مهم
توکن‌هایی که قبلاً برای ساخت این پروژه رد و بدل شد (BOT_TOKEN، OpenRouter API key، GitHub PAT)
باید **Revoke/Regenerate** بشن، چون در تاریخچه‌ی چت باقی می‌مونن. فقط مقادیر جدید را در
`wrangler secret put` و `.dev.vars` قرار بده.
