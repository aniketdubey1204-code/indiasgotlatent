// Supabase Edge Function: tg — 302 redirect to Telegram mirror file.
// Video bytes flow Telegram -> viewer. Supabase only sends a ~500 byte redirect.
// Deploy: Edge Functions > New "tg" > paste > Deploy (Enforce JWT OFF)
// Secret: TG_MIRROR_BOT_TOKEN = <mirror bot token> (never in frontend)
Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const p = new URL(req.url).searchParams.get("p") || "";
    if (!/^[A-Za-z0-9/_.\-]+$/.test(p) || p.includes("..") || p.length > 200) {
      return new Response("bad path", { status: 400, headers: cors });
    }
    const token = Deno.env.get("TG_MIRROR_BOT_TOKEN") || "";
    if (!token) return new Response("not configured", { status: 500, headers: cors });
    return Response.redirect(`https://api.telegram.org/file/bot${token}/${p}`, 302);
  } catch (e) {
    return new Response(String(e), { status: 500, headers: cors });
  }
});
