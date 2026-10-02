// Auth gate: Telegram (Login Widget) default, Email OTP via Supabase fallback.
// Zero-setup demo mode: works without keys using localStorage.
const cfg = (typeof APP_CONFIG !== "undefined" && APP_CONFIG) ? APP_CONFIG : {};
const { SUPABASE_URL = "", SUPABASE_ANON_KEY = "", TELEGRAM_BOT_NAME = "Latentttbot" } = cfg;
const isSupabaseConfigured = SUPABASE_URL && !SUPABASE_URL.includes("YOUR-") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR-");
let supabaseClient = null;
try {
  if (isSupabaseConfigured) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) { console.warn("Supabase init failed, using demo mode", e); }

const authOverlay = () => document.getElementById("auth-overlay");
const appEl = () => document.getElementById("app");

function showApp() {
  authOverlay().classList.add("hidden");
  const f = document.getElementById("dock-footer");
  if (f) f.classList.remove("hidden");
  if (window.loadVideos && !window._videos) window.loadVideos();
  if (window.updateAdminUI) window.updateAdminUI();
}
function showAuth() {
  authOverlay().classList.remove("hidden");
  const f = document.getElementById("dock-footer");
  if (f) f.classList.add("hidden");
  mountTelegramWidget();
}
function isLoggedIn() {
  return localStorage.getItem("tgl_auth") === "1" || localStorage.getItem("email_auth") === "1";
}
function requireAuth() {
  if (isLoggedIn()) return true;
  showAuth();
  return false;
}

function closeAuth() {
  const o = authOverlay();
  if (o) o.classList.add("hidden");
  const f = document.getElementById("dock-footer");
  if (f && isLoggedIn()) f.classList.remove("hidden");
}
function toggleAuthModal() {
  if (isLoggedIn()) {
    const u = getCurrentUser();
    const who = u ? (u.username ? "@" + u.username : u.email || "Account") : "User";
    if (confirm(`Logged in as ${who}. Do you want to log out?`)) {
      logout();
    }
    return;
  }
  showAuth();
}

async function initAuth() {
  // Always load videos so full catalog is immediately visible to visitors & search crawlers
  if (window.loadVideos && !window._videos) window.loadVideos();

  // If user got stuck with fake demo username, clear it so they can log in fresh with their real username
  try {
    const raw = localStorage.getItem("tgl_user");
    if (raw) {
      const u = JSON.parse(raw);
      if (u && (u.username === "telegram_user" || !u.username)) {
        localStorage.removeItem("tgl_auth");
        localStorage.removeItem("tgl_user");
      }
    }
  } catch (e) {}

  // 0. Magic-link callback (?code=...)? Exchange for session.
  if (supabaseClient) {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("code")) {
        await supabaseClient.auth.exchangeCodeForSession(window.location.href);
        // Clean URL
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.toString());
      }
      const { data } = await supabaseClient.auth.getSession();
      if (data && data.session) {
        if (data.session.user?.email) { localStorage.setItem("email_auth", "1"); localStorage.setItem("email_auth_user", data.session.user.email); }
        showApp(); return;
      }
    } catch (e) { console.warn(e); }
  }
  mountTelegramWidget();
  // 1. Check local session
  if (isLoggedIn()) {
    showApp();
  } else {
    updateAdminUI();
  }
}

function mountTelegramWidget() {
  const wrap = document.getElementById("telegram-widget");
  if (!wrap) return;
  const bot = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.TELEGRAM_BOT_NAME) || "Latentttbot";
  wrap.innerHTML = `
    <div style="text-align:center;margin-bottom:12px">
      <p style="color:#C8BDB6;font-size:13px;line-height:1.5;margin:0 0 10px">
        1. Open <strong>@${bot}</strong> on Telegram and tap <strong>START</strong>:
      </p>
      <button class="btn" onclick="openTelegramBot()" style="display:flex;align-items:center;justify-content:center;gap:8px;background:#2AABEE;color:#fff;margin:0 auto 10px;width:100%">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
        Open @${bot} in Telegram
      </button>
    </div>
    <div style="border-top:1px solid rgba(255,255,255,.12);padding-top:12px;text-align:left">
      <label style="font-size:11px;color:#C8BDB6;letter-spacing:.08em;text-transform:uppercase">2. Enter your Telegram @username</label>
      <input id="tg-user-input" placeholder="@duhitssaniket" style="width:100%;padding:11px;margin:6px 0;border-radius:10px;border:1px solid #333;background:#111;color:#fff;font-size:14px;box-sizing:border-box" onkeydown="if(event.key==='Enter')submitTelegramLogin()"/>
      <button class="btn" onclick="submitTelegramLogin()">Verify &amp; Enter</button>
    </div>
    <p id="tg-status" style="color:#FFBC95;font-size:12px;margin-top:8px;text-align:center"></p>
  `;
}

function openTelegramBot() {
  const bot = (typeof APP_CONFIG !== "undefined" && APP_CONFIG.TELEGRAM_BOT_NAME) || "Latentttbot";
  window.open("https://t.me/" + bot + "?start=vault", "_blank", "noopener");
  const st = document.getElementById("tg-status");
  if (st) st.textContent = "Bot opened! Press START in Telegram, then enter your @username above.";
  const inp = document.getElementById("tg-user-input");
  if (inp) inp.focus();
}

function submitTelegramLogin() {
  const inp = document.getElementById("tg-user-input");
  const raw = (inp ? inp.value : "").trim();
  const u = raw.replace(/^@/, "").trim();
  if (!u) {
    const st = document.getElementById("tg-status");
    if (st) st.textContent = "Please enter your Telegram @username.";
    if (inp) inp.focus();
    return;
  }
  localStorage.setItem("tgl_auth", "1");
  localStorage.setItem("tgl_user", JSON.stringify({ username: u }));
  showApp();
  if (typeof toast === "function") toast("Welcome, @" + u + "!");
}

function submitGoogleLogin() {
  const inp = document.getElementById("google-email");
  const email = (inp ? inp.value : "").trim();
  const st = document.getElementById("google-status");
  if (!email || !email.includes("@")) {
    if (st) st.textContent = "Please enter a valid Google email address.";
    if (inp) inp.focus();
    return;
  }
  localStorage.setItem("email_auth", "1");
  localStorage.setItem("email_auth_user", email);
  showApp();
  if (typeof toast === "function") toast("Welcome, " + email + "!");
}

// Called by Telegram widget
async function onTelegramAuth(user) {
  // Real Telegram Login Widget data (id, first_name, username, photo_url, auth_date, hash)
  localStorage.setItem("tgl_auth", "1");
  localStorage.setItem("tgl_user", JSON.stringify(user));
  showApp();
}

function getCurrentUser() {
  try {
    const t = JSON.parse(localStorage.getItem("tgl_user") || "null");
    if (t && (t.username || t.first_name)) return { type: "telegram", username: (t.username || "").replace(/^@/, ""), raw: t };
  } catch (e) {}
  const em = localStorage.getItem("email_auth_user");
  if (localStorage.getItem("email_auth") === "1" && em) return { type: "email", email: em };
  return null;
}

function isAdmin() {
  const u = getCurrentUser();
  if (!u) return false;
  if (u.type === "telegram") {
    return (APP_CONFIG.ADMIN_TELEGRAM_USERNAMES || []).map(e=>e.toLowerCase().replace(/^@/,"")).includes((u.username || "").toLowerCase());
  }
  if (u.type === "email" && u.email) {
    return (APP_CONFIG.ADMIN_EMAILS || []).map(e=>e.toLowerCase()).includes(u.email.toLowerCase());
  }
  return false;
}

function updateAdminUI() {
  const b = document.getElementById("admin-btn");
  if (b) b.classList.toggle("hidden", !isAdmin());
  const u = getCurrentUser();
  const navBtn = document.getElementById("nav-auth-btn");
  const menuBtn = document.getElementById("menu-auth-btn");
  const logged = isLoggedIn();
  const label = logged ? (u && u.username ? "Logout (@" + u.username + ")" : "Logout") : "Login";
  if (navBtn) navBtn.textContent = label;
  if (menuBtn) menuBtn.textContent = label;
}
window.updateAdminUI = updateAdminUI;
window.closeAuth = closeAuth;
window.toggleAuthModal = toggleAuthModal;
window.requireAuth = requireAuth;
window.isLoggedIn = isLoggedIn;
window.openTelegramBot = openTelegramBot;
window.submitTelegramLogin = submitTelegramLogin;
window.submitGoogleLogin = submitGoogleLogin;

function switchTab(which) {
  document.getElementById("tab-telegram").classList.toggle("active", which === "telegram");
  document.getElementById("tab-google").classList.toggle("active", which === "google");
  document.getElementById("pane-telegram").classList.toggle("hidden", which !== "telegram");
  document.getElementById("pane-google").classList.toggle("hidden", which !== "google");
}

function demoTelegramLogin() {
  const v = ((document.getElementById("tg-demo") || {}).value || "telegram_user").replace(/^@/, "");
  localStorage.setItem("tgl_auth", "1");
  localStorage.setItem("tgl_user", JSON.stringify({ username: v }));
  showApp();
}

function signInWithGoogle() {
  submitGoogleLogin();
}

async function sendEmailOtp() {
  const btn = document.querySelector("#pane-email .btn.secondary");
  if (btn && btn.disabled) return;
  const email = document.getElementById("email").value.trim();
  if (!email) return alert("Enter email");
  if (!supabaseClient) {
    // Demo mode: generate code locally
    const code = String(Math.floor(100000 + Math.random() * 900000));
    localStorage.setItem("demo_otp_" + email, code);
    alert("Demo mode OTP for " + email + ": " + code);
    return;
  }
  const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split("?")[0].split("#")[0] } });
  if (error) {
    if (error.message.includes("rate limit")) alert("Rate limited. Wait 60 min, do not spam Send. Check spam, click last link. For testing use Telegram tab.");
    else alert(error.message);
  }
  else {
    alert("Check email. Click Sign in link to enter. It will return here logged in. If your email also shows a 6-digit code, enter it below.");
    if (btn) { btn.disabled = true; btn.textContent = "Sent - wait 60s"; setTimeout(() => { btn.disabled = false; btn.textContent = "Send Login Email"; }, 60000); }
  }
}

async function verifyEmailOtp() {
  const email = document.getElementById("email").value.trim();
  const token = document.getElementById("otp").value.trim();
  if (!email) return alert("Enter email first, then Send Login Email.");
  if (!token) return alert("No code entered. Just click Sign in link in your email to enter. Code box is only if email shows a 6-digit code.");
  if (!supabaseClient) {
    const expected = localStorage.getItem("demo_otp_" + email);
    if (token === expected) {
      localStorage.setItem("email_auth", "1");
      localStorage.setItem("email_auth_user", email);
      showApp();
    } else alert("Wrong code. Click Send OTP and use the shown code.");
    return;
  }
  const { data, error } = await supabaseClient.auth.verifyOtp({ email, token, type: "email" });
  if (error) alert(error.message);
  else { localStorage.setItem("email_auth", "1"); localStorage.setItem("email_auth_user", email); showApp(); }
}

async function logout() {
  try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch (e) {}
  localStorage.removeItem("tgl_auth");
  localStorage.removeItem("tgl_user");
  localStorage.removeItem("email_auth");
  localStorage.removeItem("email_auth_user");
  location.reload();
}

window.addEventListener("DOMContentLoaded", initAuth);
