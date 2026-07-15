import KNOWLEDGE from "./knowledge.md";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "tencent/hy3:free";
const HISTORY_TTL = 60 * 60 * 6; // 6 ساعت
const MAX_HISTORY_MSGS = 10;
const RATE_LIMIT_WINDOW = 30; // ثانیه
const RATE_LIMIT_MAX = 8; // پیام مجاز در بازه

const SYSTEM_PROMPT = `${KNOWLEDGE}

قوانین فنی:
- فقط فارسی و به‌صورت طبیعی جواب بده مگر کاربر زبان دیگری استفاده کرد.
- از فرمت Markdown ساده (bold با *) در تلگرام استفاده کن، نه HTML.`;

export default {
  async fetch(request, env) {
    const reqUrl = new URL(request.url);

    // مسیر یک‌بارمصرف برای ست کردن webhook از سمت Cloudflare (فیلتر نیست)
    // استفاده: مرورگر رو باز کن و برو به:
    // https://<worker-url>/setup?key=<WEBHOOK_SECRET>
    if (reqUrl.pathname === "/setup") {
      if (reqUrl.searchParams.get("key") !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }
      const telegramUrl = `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`;
      const res = await fetch(telegramUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: reqUrl.origin,
          secret_token: env.WEBHOOK_SECRET,
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method !== "POST") {
      return new Response("JARVIS bot is alive.", { status: 200 });
    }

    // امنیت: بررسی هدر مخفی تلگرام
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

    const message = update.message;
    if (!message || !message.text) {
      return new Response("OK");
    }

    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text.trim();

    try {
      // ریت‌لیمیت ساده بر اساس کاربر
      const allowed = await checkRateLimit(env, userId);
      if (!allowed) {
        await sendTelegramMessage(env, chatId, "یه کم آروم‌تر 🙂 چند ثانیه دیگه دوباره پیام بده.");
        return new Response("OK");
      }

      if (text === "/start") {
        await sendTelegramMessage(
          env,
          chatId,
          "سلام! من JARVIS هستم، دستیار شخصی ایمان 👋\nهر سوالی درباره‌ی مهارت‌ها، سوابق یا پروژه‌های ایمان داری بپرس."
        );
        return new Response("OK");
      }

      const history = await getHistory(env, userId);
      const reply = await askOpenRouter(env, history, text);
      await saveHistory(env, userId, history, text, reply);
      await sendTelegramMessage(env, chatId, reply);
    } catch (err) {
      console.error(err);
      await sendTelegramMessage(env, chatId, "یه مشکلی پیش اومد، لطفاً دوباره امتحان کن.");
    }

    return new Response("OK");
  },
};

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
      max_tokens: 700,
      temperature: 0.6,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  return reply || "متوجه نشدم، می‌شه سوالت رو واضح‌تر بپرسی؟";
}

async function sendTelegramMessage(env, chatId, text) {
  const url = `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
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
