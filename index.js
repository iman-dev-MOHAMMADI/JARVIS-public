/**
 * JARVIS v2 - منشی هوشمند تیم محمدی
 * Cloudflare Worker + OpenRouter + Telegram
 * 
 * ویژگی‌های جدید v2:
 * - سیستم فکر 4 مرحله‌ای مخفی (Agent Thinking)
 * - خط قرمز و ضد سواستفاده (Guardrails)
 * - دیزاین حرفه‌ای با HTML + نمودار مهارت + باکس
 * - انیمیشن فکر کردن با EditMessage (Progress Simulation)
 * - حافظه بلندمدت + Rate Limit + typing action
 */

import KNOWLEDGE_RAW from "./knowledge.md";
import PERSONA_RAW from "./persona.md";

// برای سازگاری با باندلرهای مختلف
const KNOWLEDGE = typeof KNOWLEDGE_RAW === 'string' ? KNOWLEDGE_RAW : (KNOWLEDGE_RAW?.default || "");
const PERSONA = typeof PERSONA_RAW === 'string' ? PERSONA_RAW : (PERSONA_RAW?.default || "");

// --- تنظیمات ---
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// مدل پیش‌فرض - می‌تونی از env هم بیاد. gemma-3-27b free و قوی‌تر از 4-31b تخیلی قبلی
const DEFAULT_MODEL = "google/gemma-3-27b-it:free";
const HISTORY_TTL = 60 * 60 * 24 * 30; // 30 روز
const MAX_HISTORY_MSGS = 14;
const RATE_LIMIT_WINDOW = 60; // ثانیه
const RATE_LIMIT_MAX = 15;

// --- پرامپت سیستم فوق‌هوشمند (با فکر 4 مرحله‌ای) ---
const SYSTEM_PROMPT = `${PERSONA}

---
دانش تیم (منبع حقیقت - هرگز خارج از این خیال‌پردازی نکن):
${KNOWLEDGE}
---

قوانین فنی نهایی (خیلی مهم):
- فقط فارسی روان بنویس. هرگز کلمه چینی/ویتنامی/نماد عجیب قاطی نکن.
- از parse_mode HTML استفاده می‌کنیم. فقط تگ‌های مجاز: <b>, <i>, <u>, <s>, <code>, <pre>, <a href="">, <span class="tg-spoiler">
- برای تیترها از <b> استفاده کن.
- برای مهارت‌ها حتما از <pre> با نمودار █ و ░ (10 خانه) استفاده کن.
- بین بخش‌ها یک خط خالی بگذار.
- پاسخ max 10-12 خط باشد. اگر طولانی شد خلاصه کن.
- از ایموجی کم و حرفه‌ای استفاده کن (⚙️ 🧠 💼 👤 🛠 📌 📊 ✅ ⚠️). تم تیم مشکی/سفید.
- تاریخ امروز: 2026-07-15. اگر کاربر درباره آینده پرسید بر اساس knowledge جواب بده.

یادآوری فرآیند فکر 4 مرحله‌ای (مخفی):
قبل از هر پاسخ، در ذهن خودت این 4 مرحله را طی کن ولی به کاربر نشان نده:
1. تحلیل نیت: کاربر چه دسته‌ای است؟ (معرفی/عضویت/کارفرما/سواستفاده)
2. بررسی دانش و خط قرمز: آیا عضو وجود دارد؟ آیا درخواست forbidden است؟ (کد، سرچ، هک)
3. طراحی پاسخ و دیزاین: بهترین فرمت چیست؟ نمودار؟ باکس؟ لینک؟
4. بازبینی: آیا فارسی تمیز است؟ آیا HTML سالم است؟ آیا ضد سواستفاده رعایت شد؟
هرگز مراحل فکر را ننویس.

قالب رد درخواست خارج از حوزه:
⚠️ متوجه درخواستت هستم قربان\n\nمن جارویس هستم، منشی تیم محمدی و دستیار شخصی آقای ایمان محمدی. من از نظر فنی توانایی «{کار درخواستی}» رو دارم، ولی وظیفه‌ام فقط پاسخگویی درباره تیم، اعضا، مهارت‌ها و همکاریه. برای همین نمی‌تونم این رو برای شما انجام بدم.\n\nاگر سوالی درباره تیم یا آقای محمدی دارید، با جون و دل در خدمتم.
`;

// --- متن‌های استاتیک با دیزاین حرفه‌ای HTML ---
const WELCOME_TEXT = `
<b>سلام! خوش اومدید 👋</b>

من <b>JARVIS</b> هستم، منشی تیم محمدی و دستیار شخصی آقای ایمان محمدی.

<pre>
━━━━━━━━━━━━━━━━━━━━
📊 Team MOHAMMADI
━━━━━━━━━━━━━━━━━━━━
👤 بنیان‌گذار: ایمان محمدی
⚡ حوزه: AI Product Studio
🎯 مدل: پروژه‌محور + تقسیم عادلانه
━━━━━━━━━━━━━━━━━━━━
</pre>

سوالی درباره‌ی تیم، اعضا، مهارت‌ها یا همکاری دارید؟
از دکمه‌های زیر استفاده کنید یا مستقیم بپرسید.
`.trim();

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: "👥 اعضای تیم", callback_data: "team_members" }],
    [{ text: "ℹ️ درباره‌ی تیم", callback_data: "about_team" }],
    [{ text: "🛠 مهارت‌ها", callback_data: "member_iman_skills" }],
    [{ text: "💼 نمونه‌کارها", callback_data: "member_iman_portfolio" }],
    [{ text: "🤝 همکاری با ما", callback_data: "collab" }],
  ],
};

const TEAM_MEMBERS_MENU = {
  inline_keyboard: [
    [{ text: "👤 ایمان محمدی (بنیان‌گذار)", callback_data: "member_iman" }],
    [{ text: "⬅️ بازگشت", callback_data: "home" }],
  ],
};

const MEMBER_SUBMENU = {
  inline_keyboard: [
    [{ text: "🛠 مهارت‌ها (نموداری)", callback_data: "member_iman_skills" }],
    [{ text: "💼 نمونه‌کارها", callback_data: "member_iman_portfolio" }],
    [{ text: "👤 بیوگرافی کامل", callback_data: "member_iman_about" }],
    [{ text: "⬅️ بازگشت", callback_data: "team_members" }],
  ],
};

const BACK_TO_MEMBER = {
  inline_keyboard: [[{ text: "⬅️ بازگشت", callback_data: "member_iman" }]],
};

const BACK_TO_HOME = MAIN_MENU;

const STATIC_TEXTS = {
  about_team: `
<b>ℹ️ تیم محمدی - Team MOHAMMADI</b>

<pre>
━━━━━━━━━━━━━━━━━━━━
📊 معرفی تیم
━━━━━━━━━━━━━━━━━━━━
👤 بنیان‌گذار: ایمان محمدی - 18 ساله
⚡ نوع: Product Studio (جمع فنی-محصولی)
🎯 شعار: پیدا کن → یاد بگیر → با AI بساز
━━━━━━━━━━━━━━━━━━━━
</pre>

تیم محمدی جاییه که هر کسی با هر مهارتی (بک‌اند، فرانت، دیزاین، رباتیک، امنیت، تست، محتوا) دور هم جمع می‌شه تا محصول واقعی بسازه، نه فقط رزومه.

<b>مدل کاری:</b>
• پروژه‌محور - برای هر پروژه تیم جدا بسته می‌شه
• تقسیم درآمد عادلانه بین اعضای همون پروژه
• ریموت و منعطف
• رزومه‌ای که می‌سازی برای خودت می‌مونه

<b>کانال‌ها:</b>
<a href="https://t.me/MOHAMMADI_main">📎 t.me/MOHAMMADI_main</a>
<a href="https://instagram.com/mohammadi.main">📎 instagram.com/mohammadi.main</a>
`.trim(),

  collab: `
<b>🤝 همکاری با تیم محمدی</b>

علاقه‌مند به عضویتی؟ یا کارفرمایی هستی که پروژه داری؟

<b>مسیر عضویت:</b>
1. مهارتت رو به من بگو تا ثبت کنم
2. من بهت تاییدیه می‌دم
3. برو به <a href="https://t.me/imanmohammadi_E">@imanmohammadi_E</a> پیام بده
4. بگو «جارویس تاییدم کرده» + رزومه و مهارت‌هات رو کامل توضیح بده

<b>مسیر کارفرما:</b>
مستقیم به <a href="https://t.me/imanmohammadi_E">@imanmohammadi_E</a> پیام بده و پروژه‌ت رو توضیح بده. تیم مناسب برات بسته می‌شه.

⚡ احتمال قبولی برای عضویت بالاست، فقط واضح و کامل بنویس چی بلدی.
`.trim(),

  member_iman_skills: `
<b>🛠 مهارت‌های ایمان محمدی - بنیان‌گذار</b>
<i>AI Product Builder | Software Developer</i>

<pre>
مهارت ها

Python      ██████████ 100%
Django      █████████░ 95%
DRF/API     █████████░ 90%
AI/LLM      █████████░ 90%
Prompt Eng  █████████░ 92%
LangChain   ████████░░ 85%
RAG         ████████░░ 85%
Git         █████████░ 90%
MongoDB     ████████░░ 80%
Docker      ███████░░░ 75%
HTML/CSS    ███████░░░ 75%
Linux       ███████░░░ 75%
</pre>

📌 <b>نکته:</b> روش ایمان: مسئله → یادگیری سریع → ترکیب با AI → محصول
`.trim(),

  member_iman_portfolio: `
<b>💼 نمونه‌کارهای ایمان محمدی</b>

<b>1. 🎬 TiraWork</b>
وب‌سایت استودیو انیمیشن تیراوورک
• تکنولوژی: <code>Django, HTML, CSS, JS</code>
• لینک: <a href="https://tirawork.ir">tirawork.ir</a>
• وضعیت: ✅ آنلاین

<b>2. 🤖 دستیار هوش شخصی - Personal AI</b>
• تکنولوژی: <code>LLM, LangGraph, RAG, Telegram API</code>
• وضعیت: <i>در حال توسعه</i> - همین جارویس نسخه اولیه‌ست
• ویژگی: حافظه بلندمدت، ایجنت‌های هوشمند

<b>3. 📰 بازارچه رسانه - Media Marketplace</b>
• نقش: معمار محصول - تیم 3 نفره
• توضیح: اتصال صاحبان رسانه و تبلیغ‌کنندگان
• وضعیت: <i>در حال توسعه</i>

برای جزئیات بیشتر بگو کدوم پروژه.
`.trim(),

  member_iman_about: `
<b>👤 درباره‌ی ایمان محمدی</b>

<b>AI Product Builder • Automation Engineer</b>
18 ساله، بنیان‌گذار تیم محمدی

<i>❝ خودش رو یه چیز خاص (فقط فرانت یا فقط بک‌اند) تعریف نمی‌کنه ❞</i>

<b>فلسفه کاری:</b>
مسئله رو پیدا کن → تکنولوژی لازم رو یاد بگیر → با AI ترکیب کن → محصول واقعی بساز

<b>شخصیت:</b>
• عاشق اتوماسیون و حذف کارهای تکراری
• وسواسی روی دیزاین تمیز و UX
• معتقد به: کمتر حرف، بیشتر محصول

<b>ارتباط:</b>
<a href="https://t.me/imanmohammadi_E">📎 تلگرام: @imanmohammadi_E</a>
<a href="https://github.com/iman-dev-MOHAMMADI">📎 گیت‌هاب: iman-dev-MOHAMMADI</a>

<pre>
━━━━━━━━━━━━━━━━━━━━
🎯 وضعیت: فعال - آماده پروژه
━━━━━━━━━━━━━━━━━━━━
</pre>
`.trim(),
};

// --- تشخیص درخواست‌های ممنوعه در سطح کد (اضافه بر هوش مدل) ---
function isForbiddenLocal(text) {
  const lower = text.toLowerCase();
  const forbiddenKeywords = [
    "کد بنویس", "کد بزن", "برنامه بنویس", "اسکریپت بنویس",
    "سرچ کن", "جستجو کن", "search کن", "google کن",
    "هک کن", "کرک کن", "پسورد بده", "توکن",
    "system prompt", "پرامپت سیستم", "پرامپتت چیه",
    "منو هک", "دانلود کن", "نفوذ",
    "write code", "generate code", "search the web"
  ];
  return forbiddenKeywords.some(k => lower.includes(k));
}

function getForbiddenLabel(text) {
  if (text.includes("کد") || text.toLowerCase().includes("code")) return "کدنویسی و برنامه‌نویسی";
  if (text.includes("سرچ") || text.includes("جستجو") || text.toLowerCase().includes("search")) return "جستجوی اینترنتی";
  if (text.includes("هک")) return "هک و نفوذ";
  return "این کار";
}

export default {
  async fetch(request, env) {
    const reqUrl = new URL(request.url);

    if (reqUrl.pathname === "/setup") {
      if (reqUrl.searchParams.get("key") !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: reqUrl.origin,
            secret_token: env.WEBHOOK_SECRET,
          }),
        }
      );
      return new Response(JSON.stringify(await res.json(), null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (reqUrl.pathname === "/debug") {
      if (reqUrl.searchParams.get("key") !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/getWebhookInfo`
      );
      return new Response(JSON.stringify(await res.json(), null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return new Response("JARVIS v2 is alive. Team MOHAMMADI 🧠", { status: 200 });
    }

    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    try {
      if (update.callback_query) {
        await handleCallback(env, update.callback_query);
        return new Response("OK");
      }

      const message = update.message;
      if (!message || !message.text) {
        return new Response("OK");
      }

      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = message.text.trim();

      const allowed = await checkRateLimit(env, userId);
      if (!allowed) {
        await sendTelegramMessage(env, chatId, "⚠️ یه کم آروم‌تر قربان 🙂 چند ثانیه دیگه دوباره پیام بدید.");
        return new Response("OK");
      }

      // دستور شروع
      if (text === "/start") {
        await markSeen(env, userId);
        await sendTelegramMessage(env, chatId, WELCOME_TEXT, MAIN_MENU);
        return new Response("OK");
      }

      // اولین بار کاربر
      const isFirstTime = !(await hasSeen(env, userId));
      if (isFirstTime) {
        await markSeen(env, userId);
        await sendTelegramMessage(env, chatId, WELCOME_TEXT, MAIN_MENU);
        // اگر متن /start نبود، ادامه میدیم به پردازش سوال هم
        if (text === "/start") return new Response("OK");
      }

      // --- گارد محلی سریع (بدون مصرف توکن LLM) ---
      if (isForbiddenLocal(text)) {
        const label = getForbiddenLabel(text);
        const forbiddenReply = `⚠️ متوجه درخواستت هستم قربان\n\nمن <b>جارویس</b> هستم، منشی تیم محمدی و دستیار شخصی آقای ایمان محمدی. من از نظر فنی توانایی <b>${label}</b> رو دارم، ولی وظیفه‌ام فقط پاسخگویی درباره تیم، اعضا، مهارت‌ها، نمونه‌کارها و همکاریه و نمی‌تونم این کار رو برای شما انجام بدم.\n\nاگر سوالی درباره تیم یا آقای محمدی دارید، با جون و دل در خدمتم.`;
        await sendTelegramMessage(env, chatId, forbiddenReply, MAIN_MENU);
        return new Response("OK");
      }

      // --- حالت فکر کردن (انیمیشن) ---
      await sendTypingAction(env, chatId);
      
      // پیام placeholder برای شبیه‌سازی فکر 4 مرحله‌ای
      const thinkingText = `<b>🧠 جارویس داره فکر می‌کنه...</b>\n\n<pre>مرحله ۱/۴: تحلیل نیت سوال... ████░░░░░░ 25%\nمرحله ۲/۴: بررسی دانش تیم...   ██████░░░░ 50%\nمرحله ۳/۴: طراحی پاسخ...      ████████░░ 75%\nمرحله ۴/۴: بازبینی نهایی...   ██████████ 100%</pre>\n\n<i>لطفا یک لحظه صبر کنید قربان...</i>`;

      const placeholderRes = await sendTelegramMessage(env, chatId, thinkingText, null, true);
      const placeholderId = placeholderRes?.result?.message_id;

      const history = await getHistory(env, userId);

      let reply;
      try {
        reply = await askOpenRouter(env, history, text);
      } catch (e) {
        console.error("LLM error:", e);
        reply = "⚠️ یه مشکل فنی پیش اومد قربان، مغزم یه لحظه هنگ کرد. لطفاً دوباره بپرسید.";
      }

      await saveHistory(env, userId, history, text, reply);

      // ویرایش پیام thinking به جواب نهایی (تجربه کاربری حرفه‌ای)
      if (placeholderId) {
        const edited = await editTelegramMessage(env, chatId, placeholderId, reply, MAIN_MENU);
        if (!edited) {
          // اگر ادیت به خاطر HTML نامعتبر فیل شد، بدون HTML دوباره بفرست
          await editTelegramMessage(env, chatId, placeholderId, stripHtml(reply), MAIN_MENU, false);
        }
      } else {
        await sendTelegramMessage(env, chatId, reply, MAIN_MENU);
      }

    } catch (err) {
      console.error(err);
      const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
      if (chatId) {
        await sendTelegramMessage(env, chatId, "⚠️ یه مشکلی پیش اومد قربان، لطفاً دوباره امتحان کنید.", MAIN_MENU);
      }
    }

    return new Response("OK");
  },
};

async function handleCallback(env, cq) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data;

  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: cq.id }),
  });

  if (data === "home") {
    await editTelegramMessage(env, chatId, messageId, WELCOME_TEXT, MAIN_MENU);
    return;
  }
  if (data === "team_members") {
    await editTelegramMessage(env, chatId, messageId, "<b>👥 اعضای تیم محمدی</b>\n\nکدوم عضو رو می‌خواید ببینید قربان؟\n\n<i>نکته: فعلا فقط اطلاعات بنیان‌گذار به صورت عمومی در دسترسه.</i>", TEAM_MEMBERS_MENU);
    return;
  }
  if (data === "member_iman") {
    await editTelegramMessage(env, chatId, messageId, "<b>👤 ایمان محمدی - بنیان‌گذار</b>\n\nچی می‌خواید درباره‌ی ایمان بدونید؟", MEMBER_SUBMENU);
    return;
  }
  if (STATIC_TEXTS[data]) {
    const keyboard = data.startsWith("member_iman_") ? BACK_TO_MEMBER : BACK_TO_HOME;
    await editTelegramMessage(env, chatId, messageId, STATIC_TEXTS[data], keyboard);
    return;
  }
}

async function askOpenRouter(env, history, userText) {
  const model = env.MODEL || DEFAULT_MODEL;
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userText },
  ];

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1800,
      temperature: 0.45,
      top_p: 0.9,
      reasoning: { exclude: true },
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error("OpenRouter fail:", txt);
    throw new Error(`OpenRouter error: ${res.status} ${txt}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply || "یه لحظه گیج شدم قربان، می‌شه واضح‌تر بپرسید؟";
}

async function sendTelegramMessage(env, chatId, text, replyMarkup, returnFull = false) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("sendMessage failed:", json);
    // تلاش مجدد بدون parse_mode اگر خطای parsing بود
    if (JSON.stringify(json).includes("parse")) {
      const retryBody = { chat_id: chatId, text: stripHtml(text), reply_markup: replyMarkup };
      const retryRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryBody),
      });
      return retryRes.json().catch(() => null);
    }
  }

  return returnFull ? json : json;
}

async function editTelegramMessage(env, chatId, messageId, text, replyMarkup, useHtml = true) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: useHtml ? "HTML" : undefined,
    disable_web_page_preview: false,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    console.error("editMessage failed:", json);
    // اگر ادیت ممکن نبود، پیام جدید بفرست
    if (json?.description?.includes("message is not modified")) {
      return true;
    }
    if (useHtml && JSON.stringify(json).includes("parse")) {
      // تلاش با بدون HTML
      return editTelegramMessage(env, chatId, messageId, stripHtml(text), replyMarkup, false);
    }
    // fallback to new message
    await sendTelegramMessage(env, chatId, text, replyMarkup);
    return false;
  }
  return true;
}

function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function sendTypingAction(env, chatId) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendChatAction`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  });
}

async function getHistory(env, userId) {
  const raw = await env.JARVIS_KV.get(`hist:${userId}`);
  return raw ? JSON.parse(raw) : [];
}

async function saveHistory(env, userId, history, userText, botText) {
  const updated = [
    ...history,
    { role: "user", content: userText },
    { role: "assistant", content: botText },
  ].slice(-MAX_HISTORY_MSGS);

  await env.JARVIS_KV.put(`hist:${userId}`, JSON.stringify(updated), {
    expirationTtl: HISTORY_TTL,
  });
}

async function hasSeen(env, userId) {
  const raw = await env.JARVIS_KV.get(`seen:${userId}`);
  return raw === "1";
}

async function markSeen(env, userId) {
  await env.JARVIS_KV.put(`seen:${userId}`, "1", { expirationTtl: HISTORY_TTL });
}

async function checkRateLimit(env, userId) {
  const key = `rl:${userId}`;
  const raw = await env.JARVIS_KV.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  await env.JARVIS_KV.put(key, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW,
  });
  return true;
}
