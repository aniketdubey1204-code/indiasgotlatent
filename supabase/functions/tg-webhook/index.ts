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
    if (!token) {
      await sendMsg(from.id, "Open the vault site first and tap Login with Telegram, then come back here.");
      return new Response("ok");
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data } = await sb.from("tg_logins").select("token,status").eq("token", token).single();
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
