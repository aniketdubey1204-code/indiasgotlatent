// In-site admin (only @duhitssaniket sees panel): paste iglll1 URL -> auto-fill -> save via secret edge function.
function openAdmin() {
  if (!isAdmin()) return alert("Admin only.");
  const k = sessionStorage.getItem("admin_key") || prompt("Enter Admin Key (set in Supabase Secrets as ADMIN_KEY):");
  if (!k) return;
  sessionStorage.setItem("admin_key", k);
  sessionStorage.removeItem("edit_id");
  document.getElementById("admin-wrap").classList.remove("hidden");
}
function closeAdmin() {
  document.getElementById("admin-wrap").classList.add("hidden");
}

function parseDataId(url) {
  try { return new URL(url, location.origin).searchParams.get("id"); }
  catch (e) { return null; }
}

function parseYouTubeId(url) {
  try {
    const u = new URL(url, location.origin);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split(/[?#/]/)[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/\/(embed|shorts|live)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch (e) {}
  if (/^[A-Za-z0-9_-]{11}$/.test((url || "").trim())) return url.trim();
  return null;
}

async function adminFetchMeta() {
  let url = document.getElementById("a-url").value.trim();
  const msg = document.getElementById("a-msg");
  // 1. Direct YouTube link? Normalize + auto thumbnail, redirect-on-click later.
  const yt = parseYouTubeId(url);
  if (yt) {
    const watch = "https://www.youtube.com/watch?v=" + yt;
    document.getElementById("a-url").value = watch;
    if (!document.getElementById("a-title").value.trim()) document.getElementById("a-title").value = "YouTube • " + yt;
    document.getElementById("a-thumb").value = "https://i.ytimg.com/vi/" + yt + "/hqdefault.jpg";
    if (!document.getElementById("a-desc").value.trim()) document.getElementById("a-desc").value = "Watch on YouTube.";
    document.getElementById("a-cat").value = "special";
    nextEpNum();
    msg.textContent = "YouTube detected — card click will redirect to YouTube.";
    return;
  }
  const dataId = parseDataId(url);
  if (!dataId) { msg.textContent = "Invalid URL. Paste like https://iglll1.freeforall.dev/player?id=bonus-06"; return; }
  msg.textContent = "Fetching details...";
  try {
    const eps = await (await fetch(APP_CONFIG.OKCDN_JSON)).json();
    const ep = eps.find(e => e.dataId === dataId);
    if (!ep) { msg.textContent = "ID " + dataId + " not found in okcdn.json"; return; }
    document.getElementById("a-title").value = ep.title || dataId;
    // Thumbnails: okcdn.json `thumbnail` may point to dead mirror domain — prefer iglll1 /img/<localImage>, else YouTube.
    document.getElementById("a-thumb").value = resolveThumb(ep);
    document.getElementById("a-desc").value = ep.description || "";
    // Auto-sort category from okcdn season + id/title keywords
    document.getElementById("a-cat").value = detectCategory(ep);
    await nextEpNum();
    msg.textContent = "Found: " + ep.title + (ep.type === "youtube" ? " (YouTube — card will redirect)" : "");
  } catch (e) { msg.textContent = "Error: " + e.message; }
}

async function nextEpNum() {
  // Per-season numbering: S1 group (season1/s1bonus/s1bts) max+1, S2 group likewise
  const cat = (document.getElementById("a-cat") || {}).value || "s1bonus";
  const group = cat === "special" ? ["special"]
    : (cat === "season2" || cat.startsWith("s2")) ? ["season2", "s2bonus", "s2bts"]
    : ["season1", "s1bonus", "s1bts"];
  let n = 1;
  try {
    if (supabaseClient) {
      const { data } = await supabaseClient.from("videos").select("episode_number,category").in("category", group).order("episode_number", { ascending: false }).limit(1);
      if (data && data[0]) n = (data[0].episode_number || 0) + 1;
    } else if ((window._videos || []).length) {
      const nums = window._videos.filter(v => group.includes((v.category || "").toLowerCase())).map(v => v.episode_number || 0);
      if (nums.length) n = Math.max(...nums) + 1;
    }
  } catch (e) {}
  document.getElementById("a-num").value = n;
}

function resolveThumb(ep) {
  const base = new URL(APP_CONFIG.OKCDN_JSON).origin;
  if (ep.localImage) return base + "/img/" + ep.localImage;
  if (ep.youtubeId) return "https://i.ytimg.com/vi/" + ep.youtubeId + "/hqdefault.jpg";
  if (ep.thumbnail) {
    // Rewrite known-dead mirror host to live OKCDN_JSON origin
    try {
      const t = new URL(ep.thumbnail, base);
      if (t.hostname.includes("indiassgottlatent")) { t.hostname = new URL(base).hostname; t.protocol = "https:"; return t.toString(); }
      return t.toString();
    } catch (e) { return ep.thumbnail; }
  }
  return "";
}

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

function adminTab(which) {
  document.getElementById("atab-add").classList.toggle("active", which === "add");
  document.getElementById("atab-remove").classList.toggle("active", which === "remove");
  document.getElementById("a-tab-add").classList.toggle("hidden", which !== "add");
  document.getElementById("a-tab-remove").classList.toggle("hidden", which !== "remove");
  if (which === "remove") adminLoadList();
}

async function adminDeleteSelected() {
  if (!isAdmin()) { document.getElementById("a-msg").textContent = "Admin only."; return; }
  const key = sessionStorage.getItem("admin_key") || "";
  const ids = [...document.querySelectorAll("#a-list input[type=checkbox]:checked")].map(c => c.value);
  const msg = document.getElementById("a-msg");
  if (!ids.length) { msg.textContent = "Select at least 1 video."; return; }
  if (!confirm("Delete " + ids.length + " video(s)?")) return;
  msg.textContent = "Deleting...";
  try {
    const r = await fetch(APP_CONFIG.SUPABASE_URL + "/functions/v1/admin-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": APP_CONFIG.SUPABASE_ANON_KEY, "x-admin-key": key },
      body: JSON.stringify({ ids })
    });
    const j = await r.json();
    if (!r.ok) { msg.textContent = j.error || ("Delete failed: " + r.status); return; }
    msg.textContent = "Deleted " + j.deleted + ". Reloading...";
    if (window.loadVideos) await window.loadVideos();
    adminLoadList();
  } catch (e) { msg.textContent = "Error: " + e.message; }
}

async function adminLoadList() {
  if (!isAdmin()) return;
  const box = document.getElementById("a-list");
  box.innerHTML = "<p style='color:#aaa'>Loading...</p>";
  try {
    const { data, error } = await supabaseClient.from("videos").select("id,title,episode_number,video_url,thumbnail_url,description,category").order("episode_number", { ascending: true });
    if (error) { box.innerHTML = error.message; return; }
    box.innerHTML = (data || []).map(v =>
      `<div style="display:flex;gap:8px;align-items:center;font-size:13px;padding:6px 0;border-bottom:1px solid #222"><input type="checkbox" value="${v.id}" style="width:auto"/><span style="flex:1">${escapeHtml(v.title)} (EP ${v.episode_number || ""})</span><button class="btn secondary" style="width:auto;padding:4px 12px;margin:0" onclick='adminEdit(${JSON.stringify(v.id)})'>Edit</button></div>`
    ).join("") || "<p>No videos</p>";
  } catch (e) { box.innerHTML = "Error: " + e.message; }
}

async function adminEdit(id) {
  if (!isAdmin()) return;
  try {
    const { data, error } = await supabaseClient.from("videos").select("*").eq("id", id).single();
    if (error) { document.getElementById("a-msg").textContent = error.message; return; }
    sessionStorage.setItem("edit_id", id);
    document.getElementById("a-url").value = data.video_url || "";
    document.getElementById("a-title").value = data.title || "";
    document.getElementById("a-num").value = data.episode_number || 0;
    document.getElementById("a-thumb").value = data.thumbnail_url || "";
    document.getElementById("a-desc").value = data.description || "";
    if (document.getElementById("a-cat")) document.getElementById("a-cat").value = data.category || "bonus";
    adminTab("add");
    document.getElementById("a-msg").textContent = "Editing: " + data.title;
  } catch (e) { document.getElementById("a-msg").textContent = "Error: " + e.message; }
}

async function adminSave() {
  if (!isAdmin()) { document.getElementById("a-msg").textContent = "Admin only."; return; }
  const msg = document.getElementById("a-msg");
  const key = sessionStorage.getItem("admin_key") || "";
  if (!key) { msg.textContent = "Enter Admin Key first (reopen Admin)."; return; }
  const body = {
    id: sessionStorage.getItem("edit_id") || undefined,
    title: document.getElementById("a-title").value.trim(),
    episode_number: parseInt(document.getElementById("a-num").value || "0", 10) || 0,
    video_url: document.getElementById("a-url").value.trim(),
    thumbnail_url: document.getElementById("a-thumb").value.trim(),
    description: document.getElementById("a-desc").value.trim(),
    category: (document.getElementById("a-cat") || {}).value || "bonus"
  };
  if (!body.title || !body.video_url) { msg.textContent = "Title + URL required. Click Fetch Details first."; return; }
  msg.textContent = "Saving...";
  try {
    const r = await fetch(APP_CONFIG.SUPABASE_URL + "/functions/v1/admin-save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": APP_CONFIG.SUPABASE_ANON_KEY, "x-admin-key": key },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) { msg.textContent = j.error || ("Save failed: " + r.status); return; }
    msg.textContent = sessionStorage.getItem("edit_id") ? "Updated. Reloading grid..." : "Saved. Reloading grid...";
    sessionStorage.removeItem("edit_id");
    document.getElementById("a-url").value = "";
    if (window.loadVideos) await window.loadVideos();
    setTimeout(closeAdmin, 800);
  } catch (e) { msg.textContent = "Error: " + e.message; }
}
