let plyr = null;

async function loadVideos() {
  const grid = document.getElementById("video-grid");
  grid.innerHTML = Array.from({ length: 8 }, () => `<div class="skel"><div class="sk-thumb"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`).join("");
  let videos = [];
  try {
    if (typeof supabaseClient !== "undefined" && supabaseClient && !APP_CONFIG.SUPABASE_URL.includes("YOUR-")) {
      // Private-catalog order first, newest uploads last as fallback
      const { data, error } = await supabaseClient.from("videos").select("*").order("source_index", { ascending: true }).order("episode_number", { ascending: false });
      if (!error && data && data.length) videos = data;
    }
  } catch (e) { console.warn(e); }
  if (!videos.length && typeof LOCAL_VIDEOS !== "undefined") videos = LOCAL_VIDEOS;
  window._videos = videos;
  if (!videos.length) { grid.innerHTML = "<p>No videos yet. Open Admin to add.</p>"; return; }
  // Hero = newest synced video overall (any category), grid stays chronological
  setHero(videos[videos.length - 1]);
  renderRail(videos);
  // Deep link: #v=<id> opens that episode directly (from Share).
  const dm = (location.hash || "").match(/^#v=(.+)$/);
  if (dm) {
    const f = videos.find(x => String(x.id) === dm[1] || x.video_url === decodeURIComponent(dm[1]));
    if (f) { history.replaceState(null, "", location.pathname); openPlayer(f); }
  }
}

function thumbSrc(v) {
  const t = v.thumbnail_url || "";
  if (!t) return "";
  if (t.includes("ytimg.com")) return t;
  return APP_CONFIG.THUMB_PROXY + "?url=" + encodeURIComponent(t);
}

function cleanText(s) {
  return String(s || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/thank you for supporting[^!]*!*/gi, "")
    .replace(/channel members!?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function splitTitle(full) {
  const t = String(full || "").replace(/^INDIA['’]S GOT LATENT\s*/i, "").trim();
  const m = t.split(/\s+[fF][tT]\.?\s+/);
  return { main: (m[0] || t || "India's Got Latent").trim(), guests: (m[1] || "").trim() };
}

function setHero(v) {
  const bg = document.getElementById("hero-bg");
  const src = thumbSrc(v);
  if (bg) {
    bg.style.backgroundImage = src ? `url('${src}')` : "none";
  }
  const t = document.getElementById("hero-title");
  if (t) t.textContent = splitTitle(v.title).main;
  const sub = document.getElementById("hero-sub");
  const guests = splitTitle(v.title).guests;
  if (sub) { sub.textContent = guests ? "ft. " + guests : ""; sub.style.display = guests ? "" : "none"; }
  const d = document.getElementById("hero-desc");
  if (d) {
    const fullTitle = cleanText(v.title).toLowerCase();
    let desc = cleanText(v.description).slice(0, 150);
    if (!desc || desc.toLowerCase() === fullTitle.slice(0, 150) || fullTitle.startsWith(desc.toLowerCase()) && desc.length > 40) {
      desc = "Uncut studio sessions, bonus segments and member-only drops — free in the vault.";
    }
    d.textContent = desc;
  }
  const k = document.getElementById("hero-kicker");
  if (k) k.textContent = "● Latest Drop";
  const m = document.getElementById("hero-meta");
  if (m) m.textContent = heroMetaText(v);
}

function heroMetaText(v) {
  const c = (v.category || "").toLowerCase();
  const label = { season1: "Season 1", season2: "Season 2", s1bonus: "S1 Bonus", s1bts: "S1 BTS", s2bonus: "S2 Bonus", s2bts: "S2 BTS", special: "Special" }[c] || "Fan Archive";
  return label + (v.episode_number ? " • EP " + v.episode_number : "") + " • S1 • S2 • Bonus • BTS • Specials";
}

function renderRail(videos) {
  const grid = document.getElementById("video-grid");
  const q = (document.getElementById("rail-search")?.value || "").toLowerCase();
  const list = videos.filter(v => !q || (v.title || "").toLowerCase().includes(q));
  const h = document.querySelector(".rail h2");
  if (h) h.textContent = "India's Got Latent — All Episodes (" + list.length + ")";
  grid.innerHTML = "";
  if (!list.length) { grid.innerHTML = "<p style='color:#C8BDB6'>No episodes in this section yet. Add via Admin.</p>"; return; }
  list.forEach((v, i) => {
    const d = document.createElement("div");
    d.className = "cin-card";
    d.tabIndex = 0;
    d.setAttribute("role", "button");
    d.setAttribute("aria-label", "Play " + (v.title || "episode"));
    d.style.animationDelay = Math.min(i * 35, 400) + "ms";
    const yt = youtubeIdFromUrl(v.video_url);
    const label = yt ? "YouTube" : ({ season1: "S1", season2: "S2", s1bonus: "S1 Bonus", s1bts: "S1 BTS", s2bonus: "S2 Bonus", s2bts: "S2 BTS", special: "Special", bonus: "Bonus", bts: "BTS" }[(v.category || guessCategory(v)).toLowerCase()] || "EP");
    const src = thumbSrc(v);
    const img = src ? `<img src="${src}" loading="lazy" onload="this.classList.add('img-on')" onerror="this.style.display='none'" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block" alt=""/>` : "";
    d.innerHTML = `
      <div class="thumb">${img}</div>
      <div class="tags">${yt ? `<span class="mini">YouTube</span>` : ""}<span class="mini">${label} • EP ${v.episode_number || ""}</span></div>
      <div class="shade"></div>
      <div class="play-ov"><span>▶</span></div>
      <div class="cmeta"><h3>${escapeHtml(v.title)}</h3><p>${escapeHtml((v.description || "").slice(0, 90))}</p></div>`;
    d.onclick = () => openPlayer(v);
    d.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlayer(v); } };
    grid.appendChild(d);
  });
}

function filterRail(kind, el, keep) {
  hideMenu();
  document.querySelectorAll(".fpill").forEach(b => { if (b.textContent.trim().toLowerCase().startsWith((kind || "all").toLowerCase().slice(0,4))) b.classList.add("active"); else if (!keep) b.classList.remove("active"); });
  if (!keep) { document.querySelectorAll(".fpill").forEach(b => b.classList.remove("active")); if (el) el.classList.add("active"); }
  document.querySelectorAll(".nav-dock a").forEach(a => a.classList.remove("active"));
  if (!window._videos) return;
  const k = (kind || "All").toLowerCase();
  let list = window._videos;
  // Legacy tolerance: old 'bonus'/'bts' behave as S1 buckets
  const cat = v => { const c = (v.category || guessCategory(v)).toLowerCase(); return c === "bonus" ? "s1bonus" : c === "bts" ? "s1bts" : c; };
  if (k.includes("season 1")) list = list.filter(v => ["season1", "s1bonus", "s1bts"].includes(cat(v)));
  else if (k.includes("season 2")) list = list.filter(v => ["season2", "s2bonus", "s2bts"].includes(cat(v)));
  else if (k.includes("bonus")) list = list.filter(v => ["s1bonus", "s1bts", "s2bonus", "s2bts", "special"].includes(cat(v)));
  renderRail(list);
  if (!keep) {
    const rail = document.getElementById("rail");
    if (rail) rail.scrollIntoView({ behavior: "smooth" });
  }
}

function guessCategory(v) {
  const s = ((v.title || "") + " " + (v.description || "")).toLowerCase();
  const s2 = /\bs2\b|season 2/.test(s);
  if (/bts|behind/.test(s)) return s2 ? "s2bts" : "s1bts";
  if (/special|kapil|documentary|still alive/.test(s)) return "special";
  if (s2) return /bonus|extra|discarded|deleted/.test(s) ? "s2bonus" : "season2";
  if (/bonus|extra|discarded|deleted/.test(s)) return "s1bonus";
  if (/episode/.test(s)) return "season1";
  return "s1bonus";
}
function playFeatured() {
  const list = window._videos || [];
  if (list.length) openPlayer(list[list.length - 1]);
}
function toggleWatchlist() {
  const l = JSON.parse(localStorage.getItem("watchlist") || "[]");
  const list = window._videos || [];
  const f = list[list.length - 1];
  if (f && !l.includes(f.title)) { l.push(f.title); localStorage.setItem("watchlist", JSON.stringify(l)); toast("Added to watchlist: " + f.title); }
  else toast(l.length ? "Watchlist (" + l.length + "): " + l.slice(0, 3).join(", ") + (l.length > 3 ? "…" : "") : "Watchlist empty");
}

function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function isDirectVideo(url){return /\.(mp4|webm|m3u8)(\?|#|$)/i.test(url || "");}
function youtubeIdFromUrl(url){
  try {
    const u = new URL(url, location.origin);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split(/[?#/]/)[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/\/(embed|shorts|live)\/([^/?#]+)/);
      if (m) return m[2];
    }
  } catch (e) {}
  return null;
}
function destroyPlyr(){ try { if (plyr) plyr.destroy(); } catch(e){} plyr = null; }
let ytPlayer = null;
function destroyYT(){ try { if (ytPlayer && ytPlayer.destroy) ytPlayer.destroy(); } catch(e){} ytPlayer = null; const h = document.getElementById("yt-holder"); if (h) { h.classList.add("hidden"); h.innerHTML = ""; } }
function ensureYTApi(){
  return new Promise(res => {
    if (window.YT && window.YT.Player) return res();
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    window.onYouTubeIframeAPIReady = () => res();
    document.head.appendChild(s);
  });
}
async function playYouTubeInSite(videoId, title, v) {
  const vid = document.getElementById("player");
  const frame = document.getElementById("embed");
  destroyPlyr(); destroyYT();
  vid.classList.add("hidden"); frame.classList.add("hidden"); frame.removeAttribute("src");
  const holder = document.getElementById("yt-holder");
  holder.classList.remove("hidden"); holder.innerHTML = "";
  document.getElementById("player-title").textContent = title;
  const oldFb = document.getElementById("yt-fallback");
  if (oldFb) oldFb.remove();
  await ensureYTApi();
  const pv = { autoplay: 1, rel: 0 };
  if (location.protocol.startsWith("http")) pv.origin = location.origin;
  ytPlayer = new YT.Player(holder, {
    videoId, width: "100%", height: "100%",
    playerVars: pv,
    events: {
      onReady: () => { hideLoader(); restoreYT(); },
      onStateChange: (ev) => {
        if (!window.YT) return;
        if (ev.data === YT.PlayerState.PLAYING) hideLoader();
        if (ev.data === YT.PlayerState.ENDED) onEnded();
      },
      onError: (e) => {
        // 101/150/153 = owner blocked embedding.
        if ([101, 150, 153].includes(e.data)) {
          destroyYT();
          // Mirror blocked? Cascade to the proxy stream so playback survives.
          const cur = v || window._current;
          if (cur && !cur._ytFailed && !youtubeIdFromUrl(cur.video_url || "")) {
            cur._ytFailed = true;
            toast("YouTube blocked this video — trying alternate stream…");
            playViaProxy(cur);
            return;
          }
          const wrap = document.getElementById("player-wrap");
          let fb = document.getElementById("yt-fallback");
          if (!fb) {
            fb = document.createElement("div");
            fb.id = "yt-fallback";
            fb.style.cssText = "margin:12px auto;text-align:center";
            wrap.querySelector(".player-inner").appendChild(fb);
          }
          fb.innerHTML = "";
          const a = document.createElement("a");
          a.href = "https://www.youtube.com/watch?v=" + videoId;
          a.target = "_blank"; a.rel = "noopener";
          a.className = "pill solid";
          a.style.cssText = "display:inline-block;text-decoration:none";
          a.textContent = "▶ Watch on YouTube";
          fb.appendChild(a);
          const note = document.createElement("p");
          note.style.cssText = "color:#C8BDB6;font-size:13px";
          note.textContent = "Owner blocked in-site playback for this video.";
          fb.appendChild(note);
        }
      }
    }
  });
}

function openInfo() {
  document.getElementById("info-wrap").classList.remove("hidden");
  syncBodyLock();
}
function closeInfo() {
  document.getElementById("info-wrap").classList.add("hidden");
  syncBodyLock();
}
function infoTab(which) {
  ["about", "faq", "contact", "dmca"].forEach(t => {
    document.getElementById("itab-" + t).classList.toggle("active", t === which);
    document.getElementById("ipane-" + t).classList.toggle("hidden", t !== which);
  });
}

async function openPlayer(v) {
  window._current = v;
  playerSetup(v);
  // Direct YouTube links play in-site via YouTube player (fallback button if blocked).
  const directYt = youtubeIdFromUrl(v.video_url);
  if (directYt) {
    document.getElementById("player-wrap").classList.remove("hidden");
    syncBodyLock();
    setPlayerMeta(v);
    await playYouTubeInSite(directYt, v.title);
    return;
  }
  // Our own YouTube mirror first (free forever, plays in-site).
  if (v.yt_mirror_id) {
    document.getElementById("player-wrap").classList.remove("hidden");
    syncBodyLock();
    setPlayerMeta(v);
    await playYouTubeInSite(v.yt_mirror_id, v.title, v);
    return;
  }
  await playViaProxy(v);
}

async function playViaProxy(v) {
  document.getElementById("player-wrap").classList.remove("hidden");
  syncBodyLock();
  const vid = document.getElementById("player");
  const frame = document.getElementById("embed");
  destroyPlyr(); destroyYT();
  const oldFb = document.getElementById("yt-fallback");
  if (oldFb) oldFb.remove();
  vid.innerHTML = ""; vid.removeAttribute("src"); vid.load();
  frame.removeAttribute("src"); frame.classList.add("hidden");
  vid.classList.remove("hidden");
  vid.poster = thumbSrc(v) || "";
  document.getElementById("player-title").textContent = v.title;
  setPlayerMeta(v);
  showLoader();

  function initPlyr(qualities) {
    const opts = { speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }, fullscreen: { enabled: true, fallback: true, iosNative: true } };
    if (qualities && qualities.length > 1) {
      opts.quality = { default: qualities[0].size, options: qualities.map(q => q.size) };
    }
    plyr = new Plyr(vid, opts);
  }

  if (isDirectVideo(v.video_url)) {
    const s = document.createElement("source");
    s.src = v.video_url; s.type = "video/mp4";
    vid.appendChild(s);
    initPlyr(null);
    return;
  }
  document.getElementById("player-title").textContent = "Loading " + v.title + "...";
  try {
    const dataId = new URL(v.video_url, location.origin).searchParams.get("id");
    if (!dataId) throw new Error("Invalid link");
    // YouTube?
    try {
      const eps = await (await fetch(APP_CONFIG.OKCDN_JSON)).json();
      const ep = eps.find(e => e.dataId === dataId);
      if (ep && ep.type === "youtube" && !v._ytFailed) {
        // Try in-site YouTube player; blocked ones cascade to proxy automatically.
        await playYouTubeInSite(ep.youtubeId, v.title);
        return;
      }
    } catch(e) {}
    // Get qualities via proxy list (mp4 URLs stay hidden server-side)
    const lr = await fetch(APP_CONFIG.STREAM_PROXY + "?dataId=" + encodeURIComponent(dataId) + "&list=1");
    const lj = await lr.json();
    if (!lj.qualities?.length) throw new Error("Stream unavailable");
    lj.qualities.forEach(q => {
      const s = document.createElement("source");
      s.src = APP_CONFIG.STREAM_PROXY + "?dataId=" + encodeURIComponent(dataId) + "&q=" + encodeURIComponent(q.q);
      s.type = "video/mp4";
      s.setAttribute("size", q.size);
      vid.appendChild(s);
    });
    vid.load();
    initPlyr(lj.qualities);
    document.getElementById("player-title").textContent = v.title;
  } catch (e) {
    document.getElementById("player-title").textContent = "Error: " + e.message;
  }
}
function closePlayer() {
  const vid = document.getElementById("player");
  const frame = document.getElementById("embed");
  destroyPlyr(); destroyYT();
  if (posTimer) { clearInterval(posTimer); posTimer = null; }
  if (nextTimer) { clearTimeout(nextTimer); nextTimer = null; }
  window._current = null;
  const fb = document.getElementById("yt-fallback");
  if (fb) fb.remove();
  vid.pause(); vid.innerHTML = ""; vid.removeAttribute("src"); vid.load();
  if (frame) frame.removeAttribute("src");
  document.getElementById("player-wrap").classList.add("hidden");
  syncBodyLock();
}

/* ---------- global UI system: toast, mobile menu, modal lock/esc/backdrop ---------- */
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  requestAnimationFrame(() => t.classList.add("show"));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.classList.add("hidden"), 350); }, 2600);
}
function toggleMenu(e) {
  if (e) e.stopPropagation();
  document.getElementById("menu-panel").classList.toggle("hidden");
}
function hideMenu() {
  const p = document.getElementById("menu-panel");
  if (p) p.classList.add("hidden");
}
function syncBodyLock() {
  const anyOpen = ["player-wrap", "admin-wrap", "info-wrap"].some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
  document.body.classList.toggle("locked", anyOpen);
}
function setPlayerMeta(v) {
  const m = document.getElementById("player-meta");
  if (m && v) m.textContent = heroMetaText(v);
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const pw = document.getElementById("player-wrap");
  const aw = document.getElementById("admin-wrap");
  const iw = document.getElementById("info-wrap");
  if (pw && !pw.classList.contains("hidden")) closePlayer();
  else if (aw && !aw.classList.contains("hidden") && typeof closeAdmin === "function") closeAdmin();
  else if (iw && !iw.classList.contains("hidden")) closeInfo();
  hideMenu();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".nav-dock")) hideMenu();
  const pw = document.getElementById("player-wrap");
  if (pw && !pw.classList.contains("hidden") && e.target === pw) closePlayer();
  const aw = document.getElementById("admin-wrap");
  if (aw && !aw.classList.contains("hidden") && e.target === aw && typeof closeAdmin === "function") closeAdmin();
  const iw = document.getElementById("info-wrap");
  if (iw && !iw.classList.contains("hidden") && e.target === iw) closeInfo();
});
/* ---------- player engine: loader, glow, up-next, autoplay, resume, share ---------- */
let posTimer = null;
let nextTimer = null;

function showLoader() {
  const l = document.getElementById("screen-loader");
  if (l) l.classList.remove("hidden");
}
function hideLoader() {
  const l = document.getElementById("screen-loader");
  if (l) l.classList.add("hidden");
}
function posKey(v) { return "igl_pos_" + (v.id || v.video_url); }
function fmtTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  return (h ? h + ":" + String(m % 60).padStart(2, "0") : m) + ":" + String(s % 60).padStart(2, "0");
}
function playerSetup(v) {
  showLoader();
  const g = document.getElementById("ambient-glow");
  if (g) { g.style.backgroundImage = `url('${thumbSrc(v)}')`; g.style.opacity = thumbSrc(v) ? "" : "0"; }
  const cb = document.getElementById("autoplay-next");
  if (cb) cb.checked = (localStorage.getItem("igl_autoplay") ?? "1") === "1";
  renderUpNext(v);
  const vid = document.getElementById("player");
  if (vid) {
    vid._resumeDone = false;
    vid.onplaying = () => hideLoader();
    vid.onended = () => onEnded();
    vid.onloadedmetadata = () => {
      if (vid._resumeDone) return;
      vid._resumeDone = true;
      const saved = parseFloat(localStorage.getItem(posKey(v)) || "0");
      if (saved > 10 && vid.duration && saved < vid.duration - 15) {
        vid.currentTime = saved;
        toast("Resumed from " + fmtTime(saved));
      }
    };
    vid.onerror = () => hideLoader();
  }
  if (posTimer) clearInterval(posTimer);
  posTimer = setInterval(() => {
    const cur = window._current;
    if (!cur) return;
    try {
      const vid2 = document.getElementById("player");
      if (vid2 && !vid2.classList.contains("hidden") && vid2.duration) {
        localStorage.setItem(posKey(cur), String(vid2.currentTime));
      } else if (ytPlayer && ytPlayer.getCurrentTime) {
        localStorage.setItem(posKey(cur), String(ytPlayer.getCurrentTime()));
      }
    } catch (e) {}
  }, 5000);
}
function restoreYT() {
  const cur = window._current;
  if (!cur || !ytPlayer) return;
  try {
    const saved = parseFloat(localStorage.getItem(posKey(cur)) || "0");
    const dur = ytPlayer.getDuration ? ytPlayer.getDuration() : 0;
    if (saved > 10 && (!dur || saved < dur - 15)) {
      ytPlayer.seekTo(saved, true);
      toast("Resumed from " + fmtTime(saved));
    }
  } catch (e) {}
}
function idxOf(v) {
  const list = window._videos || [];
  return list.findIndex(x => v && (x.id === v.id || x.video_url === v.video_url));
}
function epLabel(v) {
  const c = (v.category || "").toLowerCase();
  return ({ season1: "S1", season2: "S2", s1bonus: "S1 Bonus", s1bts: "S1 BTS", s2bonus: "S2 Bonus", s2bts: "S2 BTS", special: "Special" }[c] || "EP") + (v.episode_number ? " • EP " + v.episode_number : "");
}
function renderUpNext(v) {
  const box = document.getElementById("upnext-list");
  if (!box) return;
  const list = window._videos || [];
  const i = idxOf(v);
  const next = [];
  for (let k = 1; k <= 6 && list.length > 1; k++) next.push(list[(i + k + list.length) % list.length]);
  box.innerHTML = next.map((n, k) =>
    `<div class="up-card" data-k="${k}"><img loading="lazy" src="${thumbSrc(n)}" onerror="this.style.visibility='hidden'" alt=""/><div><h4>${escapeHtml(n.title)}</h4><p>${epLabel(n)}</p></div></div>`
  ).join("");
  box.querySelectorAll(".up-card").forEach((el) => {
    el.onclick = () => openPlayer(next[parseInt(el.dataset.k, 10)]);
  });
}
function isAutoplay() { return (localStorage.getItem("igl_autoplay") ?? "1") === "1"; }
function setAutoplay(on) {
  localStorage.setItem("igl_autoplay", on ? "1" : "0");
  toast(on ? "Autoplay on" : "Autoplay off");
}
function onEnded() {
  hideLoader();
  if (nextTimer) clearTimeout(nextTimer);
  const list = window._videos || [];
  const nxt = list[idxOf(window._current) + 1];
  if (isAutoplay() && nxt) {
    toast("Up next: " + nxt.title);
    nextTimer = setTimeout(() => openPlayer(nxt), 6000);
  }
  try { localStorage.removeItem(posKey(window._current)); } catch (e) {}
}
function stepEpisode(d) {
  const list = window._videos || [];
  const n = list[idxOf(window._current) + d];
  if (n) openPlayer(n);
  else toast(d > 0 ? "This is the latest episode" : "This is the first episode");
}
function toggleTheater() {
  const box = document.getElementById("player-box");
  const btn = document.getElementById("theater-btn");
  if (!box) return;
  box.classList.toggle("theater");
  if (btn) btn.classList.toggle("on", box.classList.contains("theater"));
}
function addCurrentToWatchlist() {
  const f = window._current;
  if (!f) return;
  const l = JSON.parse(localStorage.getItem("watchlist") || "[]");
  if (!l.includes(f.title)) { l.push(f.title); localStorage.setItem("watchlist", JSON.stringify(l)); }
  toast("Saved to watchlist");
}
function shareEpisode() {
  const f = window._current;
  if (!f) return;
  const url = location.origin + location.pathname + "#v=" + (f.id || encodeURIComponent(f.video_url));
  const done = () => toast("Link copied — share it");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(url));
  else toast(url);
}
window.loadVideos = loadVideos;
