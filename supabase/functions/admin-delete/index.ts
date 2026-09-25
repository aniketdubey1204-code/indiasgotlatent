// Supabase Edge Function: admin-delete — admin-only bulk delete.
// Deploy: Edge Functions > New "admin-delete" > paste > Deploy (Enforce JWT OFF)
// Secret: same ADMIN_KEY.
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
    const { ids } = await req.json();
    if (!Array.isArray(ids) || !ids.length) {
      return new Response(JSON.stringify({ error: "No ids" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { error } = await sb.from("videos").delete().in("id", ids);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ ok: true, deleted: ids.length }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
