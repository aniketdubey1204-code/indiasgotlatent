// Supabase Edge Function: sync-iglll1
// Runs on schedule (pg_cron) — NOT from browser. Uses service_role, no admin key in frontend.
// Deploy: Edge Functions > New "sync-iglll1" > paste > Deploy (Enforce JWT OFF, only cron secret can trigger)
// Schedule via sql/auto_sync.sql

const OKCDN_JSON = "https://iglll1.freeforall.dev/okcdn.json";
const PLAYER_BASE = "https://iglll1.freeforall.dev/player";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function detectCategory(ep) {
  const s = ((ep.season || "") + " " + (ep.dataId || "") + " " + (ep.title || "")).toLowerCase();
  const s2 = ep.season === "s2" || /\bs2\b|season 2/.test(s);
  if (/bts|behind/.test(s)) return s2 ? "s2bts" : "s1bts";
  if (/special|kapil|documentary|still alive/.test(s)) return "special";
  if (/bonus|extra|discarded|deleted/.test(s)) return s2 ? "s2bonus" : "s1bonus";
  if (ep.season === "s2" || /\bs2\b|season 2/.test(s)) return "season2";
  if (ep.season === "s1" || /^ep-|bonus-|extra-/.test(ep.dataId || "")) return "season1";
  return s2 ? "s2bonus" : "s1bonus";
}

function thumbFor(ep, origin) {
  if (ep.localImage) return origin + "/img/" + ep.localImage;
  if (ep.youtubeId) return "https://i.ytimg.com/vi/" + ep.youtubeId + "/hqdefault.jpg";
  return ep.thumbnail || "";
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Protect: only cron (secret) can trigger
    const secret = req.headers.get("x-cron-secret") || "";
    const expected = Deno.env.get("CRON_SECRET") || "";
    if (!expected || secret !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const eps = await (await fetch(OKCDN_JSON)).json();
    const origin = new URL(OKCDN_JSON).origin;

    const { data: existing } = await sb.from("videos").select("video_url, episode_number, thumbnail_url, source_index, category");
    const have = new Set((existing || []).map(r => r.video_url));
    const groupOf = (c) => c === "special" ? "special" : (c === "season2" || c.startsWith("s2")) ? "s2" : "s1";
    const groupMax = { s1: 0, s2: 0, special: 0 };
    (existing || []).forEach(r => {
      const g = groupOf((r.category || "s1bonus").toLowerCase());
      groupMax[g] = Math.max(groupMax[g], r.episode_number || 0);
    });
    let maxSrc = Math.max(0, ...((existing || []).map(r => r.source_index ?? 0)));

    let added = 0, updated = 0;
    for (let i = 0; i < eps.length; i++) {
      const ep = eps[i];
      const url = `${PLAYER_BASE}?id=${ep.dataId}`;
      const cat = detectCategory(ep);
      if (have.has(url)) {
        // Self-heal category + thumbs only — never reorder (order is curated via SQL)
        const patch = { category: cat };
        const cur = (existing || []).find(r => r.video_url === url);
        if (!cur || !cur.thumbnail_url) patch.thumbnail_url = thumbFor(ep, origin);
        await sb.from("videos").update(patch).eq("video_url", url);
        updated += 1;
        continue;
      }
      maxSrc += 1;
      groupMax[groupOf(cat)] += 1;
      const { error } = await sb.from("videos").insert({
        title: ep.title || ep.dataId,
        video_url: url,
        thumbnail_url: thumbFor(ep, origin),
        description: ep.description || "",
        episode_number: groupMax[groupOf(cat)],
        category: cat,
        source_index: maxSrc,
      });
      if (!error) { added += 1; have.add(url); }
    }
    return new Response(JSON.stringify({ ok: true, added, updated, total: eps.length }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
