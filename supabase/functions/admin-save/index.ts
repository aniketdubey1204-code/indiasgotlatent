// Supabase Edge Function: admin-save
// Deploy: Edge Functions > New "admin-save" > paste > Deploy
// Secrets: set ADMIN_KEY (Edge Functions > Secrets > New: name ADMIN_KEY, value <long random>)
// Frontend calls with header x-admin-key. Only key holder (you) can insert.
// Requires service_role key available as SUPABASE_SERVICE_ROLE_KEY (built-in) + SUPABASE_URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = req.headers.get("x-admin-key") || "";
    const expected = Deno.env.get("ADMIN_KEY") || "";
    if (!expected || key !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const body = await req.json();
    const { id, title, video_url, thumbnail_url, description, episode_number, category } = body;
    if (!title || !video_url) {
      return new Response(JSON.stringify({ error: "Title + video_url required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const url = Deno.env.get("SUPABASE_URL") || "";
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !svc) {
      console.error("admin-save missing env", { hasUrl: !!url, hasSvc: !!svc });
      return new Response(JSON.stringify({ error: "Server misconfigured (service key missing)" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const allowed = ["season1", "season2", "s1bonus", "s1bts", "s2bonus", "s2bts", "special", "bonus", "bts"];
    const raw = String(category || "").toLowerCase();
    // Normalize legacy plain bonus/bts to S1 (majority) — sync already qualifies new rows
    const norm = raw === "bonus" ? "s1bonus" : raw === "bts" ? "s1bts" : raw;
    const row = {
      title, video_url,
      thumbnail_url: thumbnail_url || "",
      description: description || "",
      episode_number: parseInt(episode_number, 10) || 0,
      category: allowed.includes(norm) ? norm : "s1bonus",
    };
    const sb = createClient(url, svc);
    if (id) {
      const { data, error } = await sb.from("videos").update(row).eq("id", id).select();
      if (error) {
        console.error("admin-save update failed", error.message);
        const friendly = error.code === "23505" ? "That player URL already exists on another entry." : error.message;
        return new Response(JSON.stringify({ error: friendly }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: true, updated: true, data }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    const { data, error } = await sb.from("videos").insert(row).select();
    if (error) {
      console.error("admin-save insert failed", error.message);
      const friendly = error.code === "23505" ? "Already in vault — use Edit on the existing entry." : error.message;
      return new Response(JSON.stringify({ error: friendly }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, data }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  }
});
