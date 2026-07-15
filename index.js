import KNOWLEDGE from "./knowledge.md";
import PERSONA from "./persona.md";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-4-31b-it:free";
const HISTORY_TTL = 60 * 60 * 24 * 30; // ۳۰ روز، حافظه‌ی مکالمه پایدار می‌مونه
const MAX_HISTORY_MSGS = 12;
const RATE_LIMIT_WINDOW = 60; // ثانیه (حداقل مجاز در Cloudflare KV)
const RATE_LIMIT_MAX = 15;

const SYSTEM_PROMPT = `${PERSONA}

---

${KNOWLEDGE}

---

قوانین فنی و ظاهری (خیلی مهم، دقیق رعایت کن):
- فقط و فقط فارسیِ روان و تمیز بنویس. هرگز کلمه یا کاراکتر خارجی/بی‌معنی/نامفهوم (مثل کلمات چینی، ویتنامی، یا نمادهای عجیب) وسط متن فارسی قاطی نکن.
- از Markdown ساده‌ی تلگرام استفاده کن: *بولد* برای تیتر/نکات مهم. هرگز از HTML یا نمادهای ناقص و بی‌ربط (مثل پرانتز و آکولاد اضافه) استفاده نکن.
- بین بخش‌های مختلف پاسخ یک خط خالی بذار تا فاصله و خوانایی رعایت بشه. متن رو فشرده و به‌هم‌چسبیده ننویس.
- برای لیست از • استفاده کن، نه از خط تیره‌ی خام.
- ایموجی کم ولی به‌جا استفاده کن؛ تم بصری تیم محمدی مشکی/سفید/خاکستریه، پس ترجیحاً از ایموجی‌های خنثی و مونوکروم (مثل ⚙️ 🧠 💼 👤 🛠 📌) استفاده کن. فقط برای نکات واقعاً مهم یا هشدار از رنگ‌های زرد/قرمز/سبز (مثل ⚠️ ✅ 🔴) استفاده کن، نه برای هر جمله.
- پاسخ‌ها کوتاه، مرتب و مکالمه‌ای باشن؛ نه مقاله‌ی طولانی و نه یک بلوک متن فشرده.

## مسیر عضویت در تیم (وقتی کاربر می‌خواد عضو تیم بشه)
اگه کاربر نشون داد می‌خواد به تیم محمدی بپیونده (مهارتی داره و می‌خواد همکاری کنه)، فرآیند پیچیده توضیح نده. فقط بگو:
«چشم، من مهارت‌هات رو ثبت کردم و از طرف من تأییدیه داری 👍 برو به آیدی ایمان محمدی پیام بده: @imanmohammadi_E و بگو جارویس تأییدت کرده، بعد مهارت‌ها و رزومه‌ت رو کامل براش توضیح بده. به احتمال زیاد قبول می‌شی.»
از او بخواه مهارت‌هاش رو خلاصه برات بگه (اگه نگفته) تا در پاسخت نامش رو ببری، ولی مسیر نهایی همیشه ارجاع مستقیم به @imanmohammadi_E باشه، نه یه چک‌لیست طولانی.`;

const WELCOME_TEXT =
  "سلام! خوش اومدید 👋\nمن *JARVIS* هستم، منشی تیم محمدی و دستیار شخصی ایمان محمدی.\n\nسوالی درباره‌ی تیم، اعضا، یا خود ایمان دارید؟ در خدمتم. می‌تونید از دکمه‌های زیر هم استفاده کنید یا مستقیم بپرسید.";

const MAIN_MENU = {
  inline_keyboard: [
    [{ text: "👥 اعضای تیم", callback_data: "team_members" }],
    [{ text: "ℹ️ درباره‌ی تیم", callback_data: "about_team" }],
    [{ text: "🤝 همکاری با ما", callback_data: "collab" }],
  ],
};

const TEAM_MEMBERS_MENU = {
  inline_keyboard: [
    [{ text: "ایمان محمدی (بنیان‌گذار)", callback_data: "member_iman" }],
    [{ text: "⬅️ بازگشت", callback_data: "home" }],
  ],
};

const MEMBER_SUBMENU = {
  inline_keyboard: [
    [{ text: "🛠 مهارت‌ها", callback_data: "member_iman_skills" }],
    [{ text: "💼 نمونه‌کارها", callback_data: "member_iman_portfolio" }],
    [{ text: "👤 درباره‌ی من", callback_data: "member_iman_about" }],
    [{ text: "⬅️ بازگشت", callback_data: "team_members" }],
  ],
};

const BACK_TO_MEMBER = {
  inline_keyboard: [[{ text: "⬅️ بازگشت", callback_data: "member_iman" }]],
};

const STATIC_TEXTS = {
  about_team:
    "*تیم محمدی (Team MOHAMMADI)*\n\nیه جمع فنی-محصولیه که ایمان محمدی بنیانش گذاشته. هدف: کنار هم آوردن هر کسی که یه مهارتی داره (بک‌اند، فرانت‌اند، دیزاین، رباتیک، امنیت، تست و...) برای ساخت محصولاتی که مشکل واقعی حل می‌کنن.\n\nمدل کار پروژه‌محوره: برای هر پروژه، اعضای مرتبط انتخاب می‌شن و درآمد با عدالت بین همون اعضا تقسیم می‌شه. هیچ‌کس بیکار نمی‌مونه، و حتی اگه یه‌روز رفتی، رزومه‌ای که ساختی باهات می‌مونه 😉\n\nکانال رسمی: t.me/MOHAMMADI_main\nاینستاگرام: instagram.com/mohammadi.main",
  collab:
    "علاقه‌مند به همکاری یا عضویت؟ 🤝\n\nمستقیم به آیدی ایمان محمدی پیام بدید:\n@imanmohammadi_E\n\nبنویسید که JARVIS شما رو راهنمایی کرده، بعد مهارت‌ها و رزومه‌تون رو کامل توضیح بدید. احتمال قبولی بالاست، فقط واضح و کامل بنویسید چی بلدید.",
  member_iman_skills:
    "*مهارت‌های ایمان محمدی*\n\n🧠 هوش مصنوعی\nLLM Applications، AI Agents، LangChain، LangGraph، RAG، Prompt Engineering\n\n⚙️ بک‌اند\nPython، Django، DRF، REST APIs، Web Scraping\n\n🎨 فرانت‌اند\nHTML، CSS، JavaScript (پایه)\n\n🗄 دیتابیس\nMongoDB، SQLite\n\n🛠 زیرساخت\nGit، Docker، Linux، DNS، SSL/TLS، Deployment",
  member_iman_portfolio:
    "*نمونه‌کارهای ایمان محمدی*\n\n🎬 *TiraWork*\nوب‌سایت استودیو انیمیشن (Django, HTML, CSS)\nhttps://tirawork.ir\n\n🤖 *دستیار هوش مصنوعی شخصی* _(در حال توسعه)_\nحافظه‌ی بلندمدت، AI Agents، اتصال تلگرام/اینستاگرام\n\n📰 *پلتفرم بازارچه‌ی رسانه* _(در حال توسعه)_\nعضو تیم سه‌نفره، معماری کامل محصول",
  member_iman_about:
    "*درباره‌ی ایمان محمدی*\n\nAI Product Builder • Software Developer • Automation Engineer\n\n۱۸ ساله و بنیان‌گذار تیم محمدی. خودش رو یه چیز خاص (فقط فرانت یا فقط بک‌اند) تعریف نمی‌کنه؛ روش کارش اینه:\nمسئله رو پیدا کن → تکنولوژی لازم رو یاد بگیر → با AI ترکیب کن → محصول واقعی بساز.\n\n📎 تلگرام: @imanmohammadi_E\n📎 گیت‌هاب: github.com/iman-dev-MOHAMMADI",
};

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
      return new Response("JARVIS bot is alive.", { status: 200 });
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
        await sendTelegramMessage(env, chatId, "یه کم آروم‌تر قربان 🙂 چند ثانیه دیگه دوباره پیام بدید.");
        return new Response("OK");
      }

      if (text === "/start") {
        await markSeen(env, userId);
        await sendTelegramMessage(env, chatId, WELCOME_TEXT, MAIN_MENU);
        return new Response("OK");
      }

      const isFirstTime = !(await hasSeen(env, userId));
      if (isFirstTime) {
        await markSeen(env, userId);
        await sendTelegramMessage(env, chatId, WELCOME_TEXT, MAIN_MENU);
        return new Response("OK");
      }

      const history = await getHistory(env, userId);
      await sendTypingAction(env, chatId);
      const reply = await askOpenRouter(env, history, text);
      await saveHistory(env, userId, history, text, reply);
      await sendTelegramMessage(env, chatId, reply);
    } catch (err) {
      console.error(err);
      const chatId = update?.message?.chat?.id || update?.callback_query?.message?.chat?.id;
      if (chatId) {
        await sendTelegramMessage(env, chatId, "یه مشکلی پیش اومد قربان، لطفاً دوباره امتحان کنید.");
      }
    }

    return new Response("OK");
  },
};

async function handleCallback(env, cq) {
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data;

  // ack سریع تا لودینگ دکمه تو تلگرام قطع بشه
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
    await editTelegramMessage(env, chatId, messageId, "کدوم عضو رو می‌خواید ببینید؟", TEAM_MEMBERS_MENU);
    return;
  }
  if (data === "member_iman") {
    await editTelegramMessage(env, chatId, messageId, "چی می‌خواید درباره‌ی ایمان بدونید؟", MEMBER_SUBMENU);
    return;
  }
  if (STATIC_TEXTS[data]) {
    const keyboard = data.startsWith("member_iman_") ? BACK_TO_MEMBER : MAIN_MENU;
    await editTelegramMessage(env, chatId, messageId, STATIC_TEXTS[data], keyboard);
    return;
  }
}

async function askOpenRouter(env, history, userText) {
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
      model: MODEL,
      messages,
      max_tokens: 1500,
      temperature: 0.5,
      reasoning: { exclude: true },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply || "یه لحظه گیج شدم قربان، می‌شه واضح‌تر بپرسید؟";
}

async function sendTelegramMessage(env, chatId, text, replyMarkup) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function editTelegramMessage(env, chatId, messageId, text, replyMarkup) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`;
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // اگه ویرایش ممکن نبود (مثلاً پیام خیلی قدیمیه)، پیام جدید بفرست
  if (!res.ok) {
    await sendTelegramMessage(env, chatId, text, replyMarkup);
  }
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
