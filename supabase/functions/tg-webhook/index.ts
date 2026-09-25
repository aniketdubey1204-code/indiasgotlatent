// Supabase Edge Function: tg-webhook — receives Telegram /start <token>, links login.
// Deploy: Edge Functions > New "tg-webhook" > paste > Deploy (Enforce JWT OFF)
// Secrets: TG_BOT_TOKEN = <new bot token after /revoke> (never in frontend)
// One-time webhook connect (paste in YOUR browser address bar, replace NEW_TOKEN):
//   https://api.telegram.org/botNEW_TOKEN/setWebhook?url=https://jybncrrkygihsiyeepzq.supabase.co/functions/v1/tg-webhook
// Verify: .../getWebhookInfo
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const update = await req.json();
    const msg = update.message || update.edited_message;
    const text = (msg?.text || "").trim();
    const from = msg?.from || {};
    if (!text.startsWith("/start")) return new Response("ok");
    const token = text.split(/\s+/)[1] || "";
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    console.error("tg-start", JSON.stringify({ hasPayload: !!token, len: token.length, chat: msg?.chat?.type || "?" }));
    if (!token) {
      // Payload lost (typed /start, logged in after opening link, old chat) —
      // claim the newest pending session from last 3 minutes.
      const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: recent } = await sb.from("tg_logins")
        .select("token,created_at").eq("status", "pending")
        .gte("created_at", since).order("created_at", { ascending: false }).limit(1).single();
      if (!recent) {
        await sendMsg(from.id, "Session expired. Tap Login with Telegram on the site first, then press START here.");
        return new Response("ok");
      }
      await sb.from("tg_logins").update({
        status: "claimed",
        telegram_id: from.id,
        telegram_username: from.username || "",
      }).eq("token", recent.token);
      await sendMsg(from.id, `Welcome ${from.first_name || "friend"}! Go back to the site — you are logged in.`);
      return new Response("ok");
    }
    const { data, error: selErr } = await sb.from("tg_logins").select("token,status").eq("token", token).single();
    console.error("tg-lookup", JSON.stringify({ found: !!data, selErr: selErr?.message || null }));
    if (!data) {
      await sendMsg(from.id, "Session expired. Generate a fresh login on the site.");
      return new Response("ok");
    }
    await sb.from("tg_logins").update({
      status: "claimed",
      telegram_id: from.id,
      telegram_username: from.username || "",
    }).eq("token", token);
    const name = from.first_name || "friend";
    await sendMsg(from.id, `Welcome ${name}! Go back to the site — you are logged in.`);
    return new Response("ok");
  } catch (e) {
    console.error("tg-webhook", e);
    return new Response("ok");
  }
});

async function sendMsg(chatId, text) {
  if (!chatId) return;
  const token = Deno.env.get("TG_BOT_TOKEN") || "";
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
