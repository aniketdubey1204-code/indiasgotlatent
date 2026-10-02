// In-site admin (only admin sees panel): paste player URL -> auto-fill -> save via secret edge function.
function openAdmin() {
  if (!isAdmin()) return alert("Admin only. Login with admin credentials first.");
  sessionStorage.removeItem("edit_id");
  document.getElementById("admin-wrap").classList.remove("hidden");
  if (typeof syncBodyLock === "function") syncBodyLock();
  adminTab("add");
}
function closeAdmin() {
  document.getElementById("admin-wrap").classList.add("hidden");
  if (typeof syncBodyLock === "function") syncBodyLock();
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
  if (!dataId) { msg.textContent = "Invalid URL. Paste like https://igltalent.freeforall.dev/player?id=bonus-06"; return; }
  msg.textContent = "Fetching details...";
  try {
    const eps = await (await fetch(APP_CONFIG.OKCDN_JSON)).json();
    const ep = eps.find(e => e.dataId === dataId);
    if (!ep) { msg.textContent = "ID " + dataId + " not found in okcdn.json"; return; }
    document.getElementById("a-title").value = ep.title || dataId;
    // Thumbnails: okcdn.json `thumbnail` may point to dead mirror domain — prefer /img/<localImage>, else YouTube.
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
  const ids = [...document.querySelectorAll("#a-list input[type=checkbox]:checked")].map(c => c.value);
  const msg = document.getElementById("a-msg");
  if (!ids.length) { msg.textContent = "Select at least 1 video."; return; }
  if (!confirm("Hide / Delete " + ids.length + " video(s) from vault?")) return;
  msg.textContent = "Removing...";
  try {
    if (typeof supabaseClient !== "undefined" && supabaseClient && APP_CONFIG.SUPABASE_URL) {
      const key = sessionStorage.getItem("admin_key") || "";
      await fetch(APP_CONFIG.SUPABASE_URL + "/functions/v1/admin-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": APP_CONFIG.SUPABASE_ANON_KEY, "x-admin-key": key },
        body: JSON.stringify({ ids })
      }).catch(e => console.warn(e));
    }
    const hidden = JSON.parse(localStorage.getItem("admin_hidden_video_ids") || "[]");
    ids.forEach(id => { if (!hidden.includes(id)) hidden.push(id); });
    localStorage.setItem("admin_hidden_video_ids", JSON.stringify(hidden));

    // Also remove from custom videos if present
    const custom = JSON.parse(localStorage.getItem("admin_custom_videos") || "[]");
    const updatedCustom = custom.filter(v => !ids.includes(v.id));
    localStorage.setItem("admin_custom_videos", JSON.stringify(updatedCustom));

    msg.textContent = "Removed " + ids.length + " video(s) from vault.";
    if (window.loadVideos) await window.loadVideos();
    adminLoadList();
  } catch (e) { msg.textContent = "Error: " + e.message; }
}

function adminResetHidden() {
  localStorage.removeItem("admin_hidden_video_ids");
  if (window.loadVideos) window.loadVideos();
  adminLoadList();
  const msg = document.getElementById("a-msg");
  if (msg) msg.textContent = "All hidden videos restored.";
}

async function adminLoadList() {
  if (!isAdmin()) return;
  const box = document.getElementById("a-list");
  if (!box) return;
  box.innerHTML = "<p style='color:#aaa'>Loading catalog...</p>";
  try {
    let list = [];
    if (typeof supabaseClient !== "undefined" && supabaseClient) {
      try {
        const { data, error } = await supabaseClient.from("videos").select("id,title,episode_number,video_url,thumbnail_url,description,category").order("episode_number", { ascending: true });
        if (!error && data && data.length) list = data;
      } catch (e) {}
    }
    if (!list.length) {
      list = (window._videos && window._videos.length) ? window._videos : (typeof LOCAL_VIDEOS !== "undefined" ? LOCAL_VIDEOS : []);
    }
    const hidden = JSON.parse(localStorage.getItem("admin_hidden_video_ids") || "[]");
    const html = (list || []).map(v => {
      const isHidden = hidden.includes(v.id);
      return `<div style="display:flex;gap:8px;align-items:center;font-size:13px;padding:8px 0;border-bottom:1px solid #222;${isHidden ? 'opacity:0.4;' : ''}">
        <input type="checkbox" value="${v.id}" style="width:auto;margin:0 4px"/>
        <span style="flex:1;line-height:1.3">
          ${escapeHtml(v.title)} 
          <span style="color:#FFBC95;font-size:11px">(${v.category || "video"})</span>
          ${isHidden ? '<span style="color:#ff6b6b;font-weight:700;font-size:11px;margin-left:6px">[HIDDEN]</span>' : ''}
        </span>
        <button class="btn secondary" style="width:auto;padding:4px 12px;margin:0" onclick='adminEdit(${JSON.stringify(v.id)})'>Edit</button>
      </div>`;
    }).join("");

    const toolbar = hidden.length ? `<div style="padding:6px 0;border-bottom:1px solid #333;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center"><span style="color:#ff6b6b;font-size:12px">${hidden.length} video(s) hidden</span><button class="btn secondary" style="width:auto;padding:3px 10px;font-size:11px;margin:0" onclick="adminResetHidden()">Unhide All</button></div>` : "";

    box.innerHTML = toolbar + (html || "<p>No videos found</p>");
  } catch (e) {
    box.innerHTML = "<p style='color:#ff6b6b'>Error: " + escapeHtml(e.message) + "</p>";
  }
}

async function adminEdit(id) {
  if (!isAdmin()) return;
  try {
    let video = (window._videos || []).find(v => v.id === id);
    if (!video && typeof LOCAL_VIDEOS !== "undefined") {
      video = LOCAL_VIDEOS.find(v => v.id === id);
    }
    if (!video && typeof supabaseClient !== "undefined" && supabaseClient) {
      const { data } = await supabaseClient.from("videos").select("*").eq("id", id).single();
      if (data) video = data;
    }
    if (!video) {
      document.getElementById("a-msg").textContent = "Video not found.";
      return;
    }
    sessionStorage.setItem("edit_id", id);
    document.getElementById("a-url").value = video.video_url || "";
    document.getElementById("a-title").value = video.title || "";
    document.getElementById("a-num").value = video.episode_number || 0;
    document.getElementById("a-thumb").value = video.thumbnail_url || (video.localImage ? `/assets/thumbs/${video.localImage}` : "");
    document.getElementById("a-desc").value = video.description || "";
    if (document.getElementById("a-cat")) document.getElementById("a-cat").value = video.category || "season1";
    adminTab("add");
    document.getElementById("a-msg").textContent = "Editing: " + video.title;
  } catch (e) { document.getElementById("a-msg").textContent = "Error: " + e.message; }
}

async function adminSave() {
  if (!isAdmin()) { document.getElementById("a-msg").textContent = "Admin only."; return; }
  const msg = document.getElementById("a-msg");
  const editId = sessionStorage.getItem("edit_id");
  const title = document.getElementById("a-title").value.trim();
  const video_url = document.getElementById("a-url").value.trim();
  const episode_number = parseInt(document.getElementById("a-num").value || "0", 10) || 0;
  const thumbnail_url = document.getElementById("a-thumb").value.trim();
  const description = document.getElementById("a-desc").value.trim();
  const category = (document.getElementById("a-cat") || {}).value || "s1bonus";

  if (!title || !video_url) { msg.textContent = "Title + URL required. Click Fetch Details first."; return; }
  msg.textContent = "Saving to vault...";

  const newVid = {
    id: editId || ("custom-" + Date.now().toString(36)),
    title,
    episode_number,
    video_url,
    thumbnail_url,
    description,
    category,
    sort_index: Date.now()
  };

  if (typeof supabaseClient !== "undefined" && supabaseClient && APP_CONFIG.SUPABASE_URL) {
    const key = sessionStorage.getItem("admin_key") || "";
    await fetch(APP_CONFIG.SUPABASE_URL + "/functions/v1/admin-save", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": APP_CONFIG.SUPABASE_ANON_KEY, "x-admin-key": key },
      body: JSON.stringify(newVid)
    }).catch(e => console.warn(e));
  }

  const custom = JSON.parse(localStorage.getItem("admin_custom_videos") || "[]");
  const idx = custom.findIndex(v => v.id === newVid.id);
  if (idx >= 0) custom[idx] = newVid;
  else custom.unshift(newVid);
  localStorage.setItem("admin_custom_videos", JSON.stringify(custom));

  msg.textContent = editId ? "Updated in vault! Reloading..." : "Saved to vault! Reloading...";
  sessionStorage.removeItem("edit_id");
  document.getElementById("a-url").value = "";
  if (window.loadVideos) await window.loadVideos();
  setTimeout(closeAdmin, 800);
}

window.openAdmin = openAdmin;
window.closeAdmin = closeAdmin;
window.adminTab = adminTab;
window.adminFetchMeta = adminFetchMeta;
window.adminDeleteSelected = adminDeleteSelected;
window.adminLoadList = adminLoadList;
window.adminEdit = adminEdit;
window.adminSave = adminSave;
window.adminResetHidden = adminResetHidden;
