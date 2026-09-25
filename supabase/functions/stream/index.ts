// Supabase Edge Function: stream
// Deploy: Supabase Dashboard > Edge Functions > New "stream" > paste this > Deploy
// Then video src = https://jybncrrkygihsiyeepzq.supabase.co/functions/v1/stream?dataId=bonus-06
// Browser only sees your Supabase URL, original worker + mp4 stay server-side.

const OKCDN_JSON = "https://iglll1.freeforall.dev/okcdn.json";
const WORKER = "https://okcdn.uppcldirect.workers.dev";
const ALLOWED_REFERER = "https://iglll1.freeforall.dev/player";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const u = new URL(req.url);
    const dataId = u.searchParams.get("dataId");
    const okId = u.searchParams.get("id");
    const quality = u.searchParams.get("q") || "best";

    let epId = okId;
    let epType = null;
    let youtubeId = null;
    if (dataId && !epId) {
      const eps = await (await fetch(OKCDN_JSON)).json();
      const ep = eps.find((e) => e.dataId === dataId);
      if (!ep) return new Response(JSON.stringify({ error: "Episode not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      if (ep.type === "youtube") return new Response(JSON.stringify({ type: "youtube", youtubeId: ep.youtubeId }), { headers: { ...cors, "Content-Type": "application/json" } });
      if (ep.type === "mp4" && ep.url) epId = null;
      if (ep.type === "mp4" && ep.url) {
        // Proxy direct mp4 too so source stays hidden
        const up = await fetch(ep.url, { headers: { Referer: ALLOWED_REFERER, Range: req.headers.get("Range") || "" } });
        const h = new Headers(cors);
        h.set("Content-Type", up.headers.get("Content-Type") || "video/mp4");
        if (up.headers.get("Content-Range")) h.set("Content-Range", up.headers.get("Content-Range"));
        if (up.headers.get("Content-Length")) h.set("Content-Length", up.headers.get("Content-Length"));
        h.set("Accept-Ranges", "bytes");
        return new Response(up.body, { status: up.status, headers: h });
      }
      epId = ep.id;
      epType = ep.type;
    }

    if (!epId) return new Response(JSON.stringify({ error: "Missing id/dataId" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    // Resolve stream list from worker with whitelisted referer
    const w = await fetch(`${WORKER}/?id=${encodeURIComponent(epId)}`, { headers: { Referer: ALLOWED_REFERER } });
    const wj = await w.json();
    if (wj.status !== "success" || !wj.streams?.length) {
      return new Response(JSON.stringify({ error: wj.message || "Stream unavailable" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    let streams = wj.streams.slice().sort((a, b) => parseInt(b.type?.match(/(\d+)p/)?.[1] || 0) - parseInt(a.type?.match(/(\d+)p/)?.[1] || 0));
    // List mode: return available qualities as proxy params (mp4 URLs stay hidden)
    if (u.searchParams.get("list") === "1") {
      const quals = streams.map((s) => {
        const m = (s.type || "").match(/(\d+)p/);
        const size = m ? parseInt(m[1], 10) : 720;
        return { label: s.type || (size + "p"), q: s.type || String(size), size };
      });
      return new Response(JSON.stringify({ type: "okcdn", qualities: quals }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    let pick = streams[0];
    if (quality !== "best") {
      const q = streams.find((s) => (s.type || "").includes(quality));
      if (q) pick = q;
    }

    // Proxy mp4 bytes (supports seeking via Range)
    const range = req.headers.get("Range");
    const up = await fetch(pick.url, { headers: { Referer: ALLOWED_REFERER, ...(range ? { Range: range } : {}) } });
    const h = new Headers(cors);
    h.set("Content-Type", up.headers.get("Content-Type") || "video/mp4");
    h.set("Accept-Ranges", "bytes");
    if (up.headers.get("Content-Range")) h.set("Content-Range", up.headers.get("Content-Range")!);
    if (up.headers.get("Content-Length")) h.set("Content-Length", up.headers.get("Content-Length")!);
    return new Response(up.body, { status: up.status, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  }
});
