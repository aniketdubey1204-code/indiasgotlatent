// Supabase Edge Function: resolve — returns the direct CDN URL for a dataId.
// For the GitHub mirror Action (worker Cloudflare-blocks GitHub IPs, but not Supabase).
// Deploy: Edge Functions > New "resolve" > paste > Deploy (Enforce JWT OFF)
// Guarded by CRON_SECRET (same value as sync cron). Never expose the URL —
// it leaks signed CDN links, callable only with the secret.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OKCDN_JSON = "https://igltalent.freeforall.dev/okcdn.json";
const WORKER_FALLBACK = "https://okcdn.okcdn-api.workers.dev";
const REFERER = "https://igltalent.freeforall.dev/player";

async function workerBase() {
  try {
    const c = await (await fetch("https://igltalent.freeforall.dev/config.json")).json();
    if (c.OKCDN_WORKER) return c.OKCDN_WORKER;
  } catch (e) {}
  return WORKER_FALLBACK;
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = req.headers.get("x-cron-secret") || "";
    const expected = Deno.env.get("CRON_SECRET") || "";
    if (!expected || secret !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: cors });
    }
    const u = new URL(req.url);
    const dataId = u.searchParams.get("dataId") || "";
    const eps = await (await fetch(OKCDN_JSON)).json();
    const ep = eps.find((e) => e.dataId === dataId);
    if (!ep) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: cors });
    if (ep.type === "mp4" && ep.url) return new Response(JSON.stringify({ url: ep.url }), { headers: cors });
    const wj = await (await fetch(`${await workerBase()}/?id=${encodeURIComponent(ep.id)}`, { headers: { Referer: REFERER } })).json();
    if (wj.status !== "success" || !wj.streams?.length) {
      return new Response(JSON.stringify({ error: "no streams" }), { status: 502, headers: cors });
    }
    const best = wj.streams.slice().sort((a, b) => (parseInt((b.type || "").match(/(\d+)p/)?.[1] || 0) - parseInt((a.type || "").match(/(\d+)p/)?.[1] || 0)))[0];
    return new Response(JSON.stringify({ url: best.url, label: best.type }), { headers: cors });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors });
  }
});
