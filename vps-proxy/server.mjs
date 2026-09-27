// Zero-dependency video+thumb proxy. Runs on any cheap VPS (Node 18+).
// Why: okcdn.ru returns 400 to ALL browser User-Agents, so the browser can never
// fetch video directly. A server must pipe the bytes with a non-browser UA.
// Piping through Supabase burns its 5GB egress quota — this VPS takes that load.
//
// Run:  PORT=8080 node server.mjs   (use pm2 or systemd to keep alive)
// Then: js/config.js -> STREAM_PROXY: "http://YOUR-VPS-IP:8080/watch"
//       THUMB_PROXY:  "http://YOUR-VPS-IP:8080/thumb"
import http from "node:http";

const PORT = process.env.PORT || 8080;
const OKCDN_JSON = "https://igltalent.freeforall.dev/okcdn.json";
const WORKER = "https://okcdn.uppcldirect.workers.dev";
const REFERER = "https://igltalent.freeforall.dev/player";
const UA = "Lavf/59.27.100"; // non-browser: CDN 400s Chrome/Firefox/empty-browser UAs

async function resolveStream(dataId, quality) {
  const eps = await (await fetch(OKCDN_JSON)).json();
  const ep = eps.find((e) => e.dataId === dataId);
  if (!ep) return { error: "Episode not found", status: 404 };
  if (ep.type === "youtube") return { youtube: ep.youtubeId };
  if (ep.type === "mp4" && ep.url) return { url: ep.url };
  const wj = await (await fetch(`${WORKER}/?id=${encodeURIComponent(ep.id)}`, { headers: { Referer: REFERER } })).json();
  if (wj.status !== "success" || !wj.streams?.length) return { error: "Stream unavailable", status: 502 };
  const streams = wj.streams.slice().sort((a, b) => (parseInt((b.type || "").match(/(\d+)p/)?.[1] || 0) - parseInt((a.type || "").match(/(\d+)p/)?.[1] || 0)));
  let pick = streams[0];
  if (quality && quality !== "best") {
    const q = streams.find((s) => (s.type || "").includes(quality));
    if (q) pick = q;
  }
  return { url: pick.url, qualities: streams.map((s) => s.type) };
}

const server = http.createServer(async (req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "range,content-type", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  try {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/watch") {
      const dataId = u.searchParams.get("dataId");
      const list = u.searchParams.get("list") === "1";
      const r = await resolveStream(dataId, u.searchParams.get("q") || "best");
      if (r.error) { res.writeHead(r.status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ error: r.error })); return; }
      if (r.youtube) { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ type: "youtube", youtubeId: r.youtube })); return; }
      if (list) { res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ type: "okcdn", qualities: (r.qualities || []).map((t) => ({ label: t, q: t, size: parseInt((t || "").match(/(\d+)p/)?.[1] || 720) })) })); return; }
      const h = { "User-Agent": UA };
      if (req.headers.range) h.Range = req.headers.range;
      const up = await fetch(r.url, { headers: h });
      const out = { ...cors, "Content-Type": up.headers.get("content-type") || "video/mp4", "Accept-Ranges": "bytes" };
      if (up.headers.get("content-range")) out["Content-Range"] = up.headers.get("content-range");
      if (up.headers.get("content-length")) out["Content-Length"] = up.headers.get("content-length");
      res.writeHead(up.status, out);
      const buf = Buffer.from(await up.arrayBuffer());
      res.end(buf);
      return;
    }
    if (u.pathname === "/thumb") {
      const target = u.searchParams.get("url") || "";
      if (!target) { res.writeHead(400, cors); res.end("missing url"); return; }
      if (target.includes("ytimg.com")) { res.writeHead(302, { ...cors, Location: target }); res.end(); return; }
      const up = await fetch(target, { headers: { "User-Agent": UA, Referer: REFERER } });
      if (!up.ok) { res.writeHead(502, cors); res.end("upstream " + up.status); return; }
      res.writeHead(200, { ...cors, "Content-Type": up.headers.get("content-type") || "image/webp", "Cache-Control": "public, max-age=86400" });
      res.end(Buffer.from(await up.arrayBuffer()));
      return;
    }
    res.writeHead(404, cors); res.end("not found");
  } catch (e) {
    res.writeHead(500, cors); res.end(String(e).slice(0, 200));
  }
});

server.listen(PORT, () => console.log("proxy on :" + PORT));
