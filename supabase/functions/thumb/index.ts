// Supabase Edge Function: thumb — image proxy so iglll1 hotlink/referer blocks don't break cards.
// Deploy: Edge Functions > New "thumb" > paste > Deploy (Enforce JWT OFF)
const OKCDN_JSON = "https://iglll1.freeforall.dev/okcdn.json";
const REFERER = "https://iglll1.freeforall.dev/";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const u = new URL(req.url);
    let target = u.searchParams.get("url") || "";
    const dataId = u.searchParams.get("dataId") || "";
    if (dataId && !target) {
      const eps = await (await fetch(OKCDN_JSON)).json();
      const ep = eps.find((e) => e.dataId === dataId);
      if (!ep) return new Response("not found", { status: 404, headers: cors });
      if (ep.localImage) target = new URL(OKCDN_JSON).origin + "/img/" + ep.localImage;
      else target = ep.thumbnail || "";
    }
    if (!target) return new Response("missing url", { status: 400, headers: cors });
    // Rewrite known-dead mirror host to live origin
    try {
      const t = new URL(target);
      if (t.hostname.includes("indiassgottlatent")) { t.hostname = new URL(OKCDN_JSON).hostname; t.protocol = "https:"; target = t.toString(); }
    } catch (e) {}
    // Pass through YouTube thumbs directly (they allow hotlink)
    if (target.includes("ytimg.com") || target.includes("yt3.")) {
      return Response.redirect(target, 302);
    }
    const up = await fetch(target, { headers: { Referer: REFERER } });
    if (!up.ok) return new Response("upstream " + up.status, { status: 502, headers: cors });
    const h = new Headers(cors);
    h.set("Content-Type", up.headers.get("Content-Type") || "image/webp");
    h.set("Cache-Control", "public, max-age=86400");
    return new Response(up.body, { headers: h });
  } catch (e) {
    return new Response(String(e), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
});
