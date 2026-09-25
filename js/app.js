let plyr = null;

async function loadVideos() {
  const grid = document.getElementById("video-grid");
  grid.innerHTML = "<p style='color:#aaa'>Loading...</p>";
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
  // Hero = latest main episode (newest season episode), grid stays chronological
  const mains = videos.filter(v => ["season1", "season2"].includes((v.category || "").toLowerCase()));
  setHero(mains.length ? mains[mains.length - 1] : videos[videos.length - 1]);
  renderRail(videos);
}

function thumbSrc(v) {
  const t = v.thumbnail_url || "";
  if (!t) return "";
  if (t.includes("ytimg.com")) return t;
  return APP_CONFIG.THUMB_PROXY + "?url=" + encodeURIComponent(t);
}

function setHero(v) {
  const bg = document.getElementById("hero-bg");
  const src = thumbSrc(v);
  if (bg) {
    bg.style.backgroundImage = src ? `url('${src}')` : "none";
  }
  const t = document.getElementById("hero-title");
  if (t) t.textContent = v.title || "India's Got Latent";
  const d = document.getElementById("hero-desc");
  if (d) d.textContent = v.description || "Uncut studio sessions, bonus segments and member-only drops.";
  const k = document.getElementById("hero-kicker");
  if (k) k.textContent = "Latest Drop • " + (v.title || "India's Got Latent");
}

function renderRail(videos) {
  const grid = document.getElementById("video-grid");
  const q = (document.getElementById("rail-search")?.value || "").toLowerCase();
  const list = videos.filter(v => !q || (v.title || "").toLowerCase().includes(q));
  const h = document.querySelector(".rail h2");
  if (h) h.textContent = "India's Got Latent — All Episodes (" + list.length + ")";
  grid.innerHTML = "";
  if (!list.length) { grid.innerHTML = "<p style='color:#C8BDB6'>No episodes in this section yet. Add via Admin.</p>"; return; }
  list.forEach(v => {
    const d = document.createElement("div");
    d.className = "cin-card";
    const yt = youtubeIdFromUrl(v.video_url);
    const label = yt ? "YouTube" : ({ season1: "S1", season2: "S2", s1bonus: "S1 Bonus", s1bts: "S1 BTS", s2bonus: "S2 Bonus", s2bts: "S2 BTS", special: "Special", bonus: "Bonus", bts: "BTS" }[(v.category || guessCategory(v)).toLowerCase()] || "EP");
    const src = thumbSrc(v);
    const img = src ? `<img src="${src}" loading="lazy" onerror="this.style.display='none'" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block"/>` : "";
    d.innerHTML = `
      <div class="thumb">${img}</div>
      <div class="tags">${yt ? `<span class="mini">YouTube</span>` : ""}<span class="mini">${label} • EP ${v.episode_number || ""}</span></div>
      <div class="shade"></div>
      <div class="cmeta"><h3>${escapeHtml(v.title)}</h3><p>${escapeHtml((v.description || "").slice(0, 90))}</p></div>`;
    d.onclick = () => openPlayer(v);
    grid.appendChild(d);
  });
}

function filterRail(kind, el, keep) {
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
  const mains = list.filter(v => ["season1", "season2"].includes((v.category || "").toLowerCase()));
  if (mains.length) openPlayer(mains[mains.length - 1]);
  else if (list.length) openPlayer(list[list.length - 1]);
}
function toggleWatchlist() {
  const l = JSON.parse(localStorage.getItem("watchlist") || "[]");
  const list = window._videos || [];
  const mains = list.filter(v => ["season1", "season2"].includes((v.category || "").toLowerCase()));
  const f = mains.length ? mains[mains.length - 1] : list[list.length - 1];
  if (f && !l.includes(f.title)) { l.push(f.title); localStorage.setItem("watchlist", JSON.stringify(l)); }
  alert(l.length ? "Watchlist: " + l.join(", ") : "Watchlist empty");
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
async function playYouTubeInSite(videoId, title) {
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
      onError: (e) => {
        // 101/150/153 = owner blocked embedding -> fallback button
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

async function openPlayer(v) {
  // Direct YouTube links play in-site via YouTube player (fallback button if blocked).
  const directYt = youtubeIdFromUrl(v.video_url);
  if (directYt) {
    document.getElementById("player-wrap").classList.remove("hidden");
    await playYouTubeInSite(directYt, v.title);
    return;
  }
  document.getElementById("player-wrap").classList.remove("hidden");
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
      if (ep && ep.type === "youtube") {
        // Try in-site YouTube player; blocked ones show Watch button automatically.
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
  const fb = document.getElementById("yt-fallback");
  if (fb) fb.remove();
  vid.pause(); vid.innerHTML = ""; vid.removeAttribute("src"); vid.load();
  if (frame) frame.removeAttribute("src");
  document.getElementById("player-wrap").classList.add("hidden");
}
window.loadVideos = loadVideos;
