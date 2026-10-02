let plyr = null;

async function loadVideos() {
  const grid = document.getElementById("video-grid");
  grid.innerHTML = Array.from({ length: 8 }, () => `<div class="skel"><div class="sk-thumb"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`).join("");
  let videos = [];
  if (typeof LOCAL_VIDEOS !== "undefined" && LOCAL_VIDEOS.length) {
    videos = [...LOCAL_VIDEOS];
  } else {
    try {
      if (typeof supabaseClient !== "undefined" && supabaseClient && APP_CONFIG.SUPABASE_URL && !APP_CONFIG.SUPABASE_URL.includes("YOUR-")) {
        const { data, error } = await supabaseClient.from("videos").select("*").order("source_index", { ascending: true }).order("episode_number", { ascending: false });
        if (!error && data && data.length) videos = data;
      }
    } catch (e) { console.warn(e); }
  }
  // Apply admin local additions & deletions
  try {
    const custom = JSON.parse(localStorage.getItem("admin_custom_videos") || "[]");
    if (custom.length) {
      custom.forEach(cv => {
        const existIdx = videos.findIndex(v => v.id === cv.id);
        if (existIdx >= 0) videos[existIdx] = cv;
        else videos.push(cv);
      });
    }
    const hidden = JSON.parse(localStorage.getItem("admin_hidden_video_ids") || "[]");
    if (hidden.length) {
      videos = videos.filter(v => !hidden.includes(v.id));
    }
  } catch (e) {}
  // Sort by sort_index (chronological release order), fallback to array order
  videos.sort((a, b) => {
    const ai = typeof a.sort_index === "number" ? a.sort_index : 9999;
    const bi = typeof b.sort_index === "number" ? b.sort_index : 9999;
    return ai - bi;
  });
  window._videos = videos;
  if (!videos.length) { grid.innerHTML = "<p>No videos yet. Open Admin to add.</p>"; return; }
  // Hero = newest synced episode drop (s2-08 or highest sort_index)
  const heroVideo = videos.find(v => v.id === "s2-08") || videos[videos.length - 1];
  setHero(heroVideo);
  try { renderContinueWatching(videos); } catch (e) { console.warn("continue-watching:", e); }
  renderRail(videos);
  // Deep link: ?ep=<id> or #v=<id> opens that episode directly (from Sitemap / Google / Share)
  const urlParams = new URLSearchParams(location.search);
  const epParam = urlParams.get("ep") || urlParams.get("v");
  const dm = (location.hash || "").match(/^#v=(.+)$/);
  const targetId = epParam || (dm ? dm[1] : null);
  if (targetId) {
    const f = videos.find(x => String(x.id) === targetId || String(x.dataId) === targetId || x.video_url === decodeURIComponent(targetId));
    if (f) { openPlayer(f); }
  }
}

function thumbSrc(v) {
  if (!v) return "";
  let t = v.thumbnail_url || "";
  // Prioritize Full HD YouTube thumbnail (1280x720, no black bars)
  if (v.youtubeId) return `https://i.ytimg.com/vi/${v.youtubeId}/maxresdefault.jpg`;
  // Local high-res assets bundled in Vercel CDN
  if (v.localImage) return `/assets/thumbs/${v.localImage}`;
  if (t.includes("indiassgottlatent.freeforall.dev")) {
    t = t.replace("indiassgottlatent.freeforall.dev", "igltalent.freeforall.dev");
  }
  if (t.startsWith("/assets/") || t.startsWith("assets/") || t.startsWith("http://") || t.startsWith("https://")) return t;
  if (v.archive_id) return (APP_CONFIG.ARCHIVE_BASE || "https://archive.org") + "/services/img/" + v.archive_id;
  return t;
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
  if (!v) return "";
  const c = (v.category || guessCategory(v) || "").toLowerCase();
  const num = v.episode_number;

  if (c === "season1") return num ? `Season 1 • EP ${num}` : "Season 1";
  if (c === "season2") return num ? `Season 2 • EP ${num}` : "Season 2";
  if (c === "s1bonus") return num ? `Season 1 • Bonus ${num}` : "Season 1 • Bonus";
  if (c === "s2bonus") return num ? `Season 2 • Bonus ${num}` : "Season 2 • Bonus";
  if (c === "s1bts") return num ? `Season 1 • BTS ${num}` : "Season 1 • BTS";
  if (c === "s2bts") return num ? `Season 2 • BTS ${num}` : "Season 2 • BTS";
  if (c === "bonus") return num ? `Bonus ${num}` : "Bonus";
  if (c === "bts") return num ? `BTS ${num}` : "BTS";
  if (c === "special") return "Special";

  return num ? `EP ${num}` : "Special";
}

function cardBadgeText(v) {
  if (!v) return "";
  const c = (v.category || guessCategory(v) || "").toLowerCase();
  const num = v.episode_number;

  if (c === "season1") return num ? `S1 • EP ${num}` : "S1";
  if (c === "season2") return num ? `S2 • EP ${num}` : "S2";
  if (c === "s1bonus") return num ? `S1 • Bonus ${num}` : "S1 • Bonus";
  if (c === "s2bonus") return num ? `S2 • Bonus ${num}` : "S2 • Bonus";
  if (c === "s1bts") return num ? `S1 • BTS ${num}` : "S1 • BTS";
  if (c === "s2bts") return num ? `S2 • BTS ${num}` : "S2 • BTS";
  if (c === "bonus") return num ? `Bonus ${num}` : "Bonus";
  if (c === "bts") return num ? `BTS ${num}` : "BTS";
  if (c === "special") return "Special";

  return num ? `EP ${num}` : "Special";
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
    const badge = yt ? "YouTube" : cardBadgeText(v);
    const src = thumbSrc(v);
    const ytHq = v.youtubeId ? `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg` : "";
    const locFb = v.localImage ? `/assets/thumbs/${v.localImage}` : (v.archive_id ? `https://archive.org/services/img/${v.archive_id}` : "");
    const fallbackThumb = ytHq || locFb;
    const img = src ? `<img src="${src}" loading="lazy" onload="this.classList.add('img-on')" onerror="if (!this.dataset.fb && '${fallbackThumb}') { this.dataset.fb='1'; this.src='${fallbackThumb}'; } else { this.style.display='none'; }" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block" alt=""/>` : "";
    const durText = v.duration || "";
    d.innerHTML = `
      <div class="thumb">${img}</div>
      <div class="tags"><span class="mini">${badge}</span></div>
      ${durText ? `<span class="dur">${durText}</span>` : ""}
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
  if (list.length) {
    const heroEp = list.find(v => v.id === "s2-08") || list[list.length - 1];
    openPlayer(heroEp);
  }
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
        // 101/150/153 = owner blocked embedding -> fallback button (no proxy: egress protection).
        if ([101, 150, 153].includes(e.data)) {
          destroyYT();
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
  if (typeof requireAuth === "function" && !requireAuth()) return;
  window._current = v;
  if (v && v.id) {
    try { history.replaceState(null, "", "?ep=" + v.id); } catch (e) {}
  }
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

  function initPlyr(streamUrl) {
    const opts = {
      controls: [
        'play-large',
        'restart',
        'rewind',
        'play',
        'fast-forward',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'pip',
        'airplay',
        'download',
        'fullscreen'
      ],
      seekTime: 10,
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] },
      settings: ['quality', 'speed'],
      quality: {
        default: 1080,
        options: [1080, 720, 480, 360],
        forced: true,
        onChange: (newQ) => {
          const btn = document.getElementById("quality-btn");
          if (btn) btn.textContent = `⚙ ${newQ}p${newQ >= 720 ? ' HD' : ''}`;
          toast(`Resolution: ${newQ}p`);
        }
      },
      fullscreen: { enabled: true, fallback: true, iosNative: true },
      keyboard: { focused: true, global: true },
      tooltips: { controls: true, seek: true },
      urls: { download: streamUrl }
    };
    plyr = new Plyr(vid, opts);

    // Auto-resume playback position
    plyr.on('canplay', () => {
      if (window._current && !window._current._resumed) {
        window._current._resumed = true;
        const saved = parseInt(localStorage.getItem("pos_" + window._current.id) || "0", 10);
        if (saved > 10 && (!plyr.duration || saved < plyr.duration - 15)) {
          plyr.currentTime = saved;
          const m = Math.floor(saved / 60);
          const s = saved % 60;
          toast(`Resumed from ${m}:${s < 10 ? '0' : ''}${s} ⏱`);
        }
      }
    });

    plyr.on('timeupdate', () => {
      if (window._current && plyr.currentTime > 5 && (!plyr.duration || plyr.currentTime < plyr.duration - 15)) {
        localStorage.setItem("pos_" + window._current.id, Math.floor(plyr.currentTime));
      }
    });

    setupDoubleTapGesture();
  }

  // 1. Direct MP4 link (archive.org direct link or local file)
  let streamUrl = v.video_url || "";
  if (!isDirectVideo(streamUrl)) {
    const dataId = v.dataId || (streamUrl ? new URL(streamUrl, location.origin).searchParams.get("id") : "") || v.id;
    const base = APP_CONFIG.ARCHIVE_DOWNLOAD_BASE || "https://archive.org/download";
    if (v.archive_id && v.filename) {
      streamUrl = `${base}/${v.archive_id}/${encodeURIComponent(v.filename)}`;
    } else if (dataId) {
      const found = (typeof LOCAL_VIDEOS !== "undefined") ? LOCAL_VIDEOS.find(x => x.dataId === dataId || x.id === dataId) : null;
      if (found && found.video_url) streamUrl = found.video_url;
      else if (v.filename) {
        const ident = `igl-${dataId.toLowerCase().replace(/ /g, '-').replace(/_/g, '-')}`.replace(/[^a-z0-9\-]/g, '-').slice(0, 80);
        streamUrl = `${base}/${ident}/${encodeURIComponent(v.filename)}`;
      }
    }
  }

  if (streamUrl && isDirectVideo(streamUrl)) {
    vid.innerHTML = "";
    [1080, 720, 480, 360].forEach(size => {
      const s = document.createElement("source");
      s.src = streamUrl;
      s.type = "video/mp4";
      s.setAttribute("size", size);
      vid.appendChild(s);
    });
    initPlyr(streamUrl);
    hideLoader();
    return;
  }

  // 2. YouTube fallback if available
  if (v.youtubeId) {
    await playYouTubeInSite(v.youtubeId, v.title);
    return;
  }

  document.getElementById("player-title").textContent = "Episode stream loading or unavailable";
  hideLoader();
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
  if (location.search.includes("ep=")) {
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }
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
  return cardBadgeText(v);
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
  const url = location.origin + location.pathname + "?ep=" + (f.id || encodeURIComponent(f.video_url));
  const done = () => toast("Link copied — share it");
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, () => toast(url));
  else toast(url);
}
function skipTime(delta) {
  if (plyr) {
    plyr.currentTime = Math.max(0, Math.min(plyr.duration || 9999, plyr.currentTime + delta));
  } else {
    const vid = document.getElementById("player");
    if (vid && !vid.classList.contains("hidden")) {
      vid.currentTime = Math.max(0, Math.min(vid.duration || 9999, vid.currentTime + delta));
    } else if (window._ytPlayer && window._ytPlayer.getCurrentTime) {
      const cur = window._ytPlayer.getCurrentTime() || 0;
      window._ytPlayer.seekTo(cur + delta, true);
    }
  }
  toast(delta > 0 ? `+${delta}s ⏭` : `⏮ ${delta}s`);
}

function showGestureAnim(side) {
  const el = document.getElementById("gesture-" + side);
  if (!el) return;
  el.classList.add("active");
  setTimeout(() => el.classList.remove("active"), 500);
}

function setupDoubleTapGesture() {
  const screen = document.getElementById("screen-container");
  if (!screen || screen._gestureBound) return;
  screen._gestureBound = true;

  let lastTapTime = 0;
  let lastTapSide = "";
  let tapTimeout = null;

  screen.addEventListener("pointerup", (e) => {
    if (e.target.closest(".plyr__controls") || e.target.closest(".pbtn") || e.target.closest(".plyr__control")) return;
    const rect = screen.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const side = x < width * 0.42 ? "left" : (x > width * 0.58 ? "right" : "center");

    if (now - lastTapTime < 320 && side === lastTapSide && side !== "center") {
      clearTimeout(tapTimeout);
      lastTapTime = 0;
      if (side === "left") {
        skipTime(-10);
        showGestureAnim("left");
      } else if (side === "right") {
        skipTime(10);
        showGestureAnim("right");
      }
    } else {
      lastTapTime = now;
      lastTapSide = side;
      tapTimeout = setTimeout(() => {
        lastTapTime = 0;
        lastTapSide = "";
      }, 320);
    }
  });
}

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
function cycleSpeed() {
  let curSpeed = 1;
  if (plyr) curSpeed = plyr.speed || 1;
  else if (window._ytPlayer && window._ytPlayer.getPlaybackRate) curSpeed = window._ytPlayer.getPlaybackRate() || 1;

  const curIdx = SPEEDS.indexOf(curSpeed);
  const nextSpeed = SPEEDS[(curIdx + 1) % SPEEDS.length];

  if (plyr) plyr.speed = nextSpeed;
  else if (window._ytPlayer && window._ytPlayer.setPlaybackRate) window._ytPlayer.setPlaybackRate(nextSpeed);

  const btn = document.getElementById("speed-btn");
  if (btn) btn.textContent = `⚡ ${nextSpeed}x`;
  toast(`Speed: ${nextSpeed}x`);
}

function openQualityMenu() {
  if (plyr) {
    const curQ = plyr.quality || 1080;
    const nextQ = curQ === 1080 ? 720 : (curQ === 720 ? 480 : (curQ === 480 ? 360 : 1080));
    plyr.quality = nextQ;
    const btn = document.getElementById("quality-btn");
    if (btn) btn.textContent = `⚙ ${nextQ}p${nextQ >= 720 ? ' HD' : ''}`;
    toast(`Resolution: ${nextQ}p${nextQ >= 720 ? ' HD' : ''}`);
  } else {
    toast("Resolution: Auto HD");
  }
}

async function togglePiP() {
  const vid = document.getElementById("player");
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (vid && !vid.classList.contains("hidden")) {
      await vid.requestPictureInPicture();
    } else if (plyr && plyr.pip) {
      plyr.pip = !plyr.pip;
    } else {
      toast("PiP not supported for this stream");
    }
  } catch (e) {
    toast("Picture-in-Picture unavailable");
  }
}

function downloadCurrent() {
  const cur = window._current;
  if (!cur) return;
  const vid = document.getElementById("player");
  const src = (vid && vid.currentSrc) ? vid.currentSrc : cur.video_url;
  if (src && src.startsWith("http")) {
    const a = document.createElement("a");
    a.href = src;
    a.download = cur.filename || `${cur.title}.mp4`;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("Download started ⬇");
  } else {
    toast("Download link unavailable");
  }
}

// Global Keyboard Shortcuts
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  const wrap = document.getElementById("player-wrap");
  if (!wrap || wrap.classList.contains("hidden")) return;

  if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
    e.preventDefault();
    skipTime(-10);
    showGestureAnim("left");
  } else if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
    e.preventDefault();
    skipTime(10);
    showGestureAnim("right");
  } else if (e.key === " " || e.key === "k" || e.key === "K") {
    e.preventDefault();
    if (plyr) plyr.togglePlay();
  } else if (e.key === "m" || e.key === "M") {
    e.preventDefault();
    if (plyr) plyr.muted = !plyr.muted;
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    if (plyr) plyr.fullscreen.toggle();
  } else if (e.key === "t" || e.key === "T") {
    e.preventDefault();
    toggleTheater();
  } else if (e.key === ">") {
    cycleSpeed();
  }
});

/* ---------- Continue Watching ---------- */
function renderContinueWatching(videos) {
  let container = document.getElementById("continue-section");
  // Build list of partially-watched episodes
  const watched = [];
  videos.forEach(v => {
    const key = "pos_" + (v.id || v.video_url);
    const saved = parseFloat(localStorage.getItem(key) || "0");
    if (saved > 30) { // at least 30 seconds watched
      watched.push({ video: v, position: saved });
    }
  });
  if (!watched.length) {
    if (container) container.remove();
    return;
  }
  // Sort by most recently watched (higher position = more likely recent)
  watched.sort((a, b) => b.position - a.position);
  const top = watched.slice(0, 8);

  if (!container) {
    container = document.createElement("div");
    container.id = "continue-section";
    container.className = "continue-section";
    const filtersEl = document.querySelector(".filters");
    if (filtersEl) filtersEl.parentNode.insertBefore(container, filtersEl.nextSibling);
    else document.getElementById("app")?.appendChild(container);
  }
  container.innerHTML = `<h3>▶ Continue Watching</h3><div class="continue-row">${top.map(w => {
    const v = w.video;
    const pct = v.duration ? Math.min(95, Math.round((w.position / parseDuration(v.duration)) * 100)) : 50;
    const resumeTime = fmtTime(w.position);
    return `<div class="continue-card" onclick="openPlayer(window._videos.find(x=>x.id==='${v.id}'))" title="Resume from ${resumeTime}">
      <img src="${thumbSrc(v)}" loading="lazy" onerror="this.style.visibility='hidden'" alt=""/>
      <div class="c-info"><h4>${escapeHtml(v.title)}</h4><div class="c-prog"><span style="width:${pct}%"></span></div></div>
    </div>`;
  }).join("")}</div>`;
}

function parseDuration(str) {
  if (!str) return 3600;
  const m = str.match(/(\d+)h\s*(\d+)m\s*(\d+)s/);
  if (m) return parseInt(m[1])*3600 + parseInt(m[2])*60 + parseInt(m[3]);
  const m2 = str.match(/(\d+)m\s*(\d+)s/);
  if (m2) return parseInt(m2[1])*60 + parseInt(m2[2]);
  return 3600;
}

window.loadVideos = loadVideos;
window.skipTime = skipTime;
window.cycleSpeed = cycleSpeed;
window.openQualityMenu = openQualityMenu;
window.togglePiP = togglePiP;
window.downloadCurrent = downloadCurrent;

// Auto-run loadVideos when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    if (!window._videos) loadVideos();
  });
} else {
  if (!window._videos) loadVideos();
}
