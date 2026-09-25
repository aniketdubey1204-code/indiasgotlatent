// Auth gate: Telegram (Login Widget) default, Email OTP via Supabase fallback.
// Zero-setup demo mode: works without keys using localStorage.
const { SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_NAME } = APP_CONFIG;
const isSupabaseConfigured = SUPABASE_URL && !SUPABASE_URL.includes("YOUR-") && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR-");
let supabaseClient = null;
try {
  if (isSupabaseConfigured) supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) { console.warn("Supabase init failed, using demo mode", e); }

const authOverlay = () => document.getElementById("auth-overlay");
const appEl = () => document.getElementById("app");

function showApp() {
  authOverlay().classList.add("hidden");
  appEl().classList.remove("hidden");
  if (window.loadVideos) window.loadVideos();
  if (window.updateAdminUI) window.updateAdminUI();
}
function showAuth() {
  authOverlay().classList.remove("hidden");
  appEl().classList.add("hidden");
}

async function initAuth() {
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
      if (data.session) {
        if (data.session.user?.email) { localStorage.setItem("email_auth", "1"); localStorage.setItem("email_auth_user", data.session.user.email); }
        showApp(); return;
      }
    } catch (e) { console.warn(e); }
  }
  // 2. Local flags (demo + Telegram)?
  if (localStorage.getItem("tgl_auth") === "1" || localStorage.getItem("email_auth") === "1") { showApp(); return; }
  showAuth();
  mountTelegramWidget();
}

function mountTelegramWidget() {
  const wrap = document.getElementById("telegram-widget");
  wrap.innerHTML = "";
  if (!TELEGRAM_BOT_NAME || TELEGRAM_BOT_NAME.includes("YOUR_")) {
    wrap.innerHTML = "<p style='color:#aaa;font-size:13px'>Demo mode: enter any Telegram username to continue. For real login, create bot via @BotFather and set TELEGRAM_BOT_NAME in js/config.js.</p>"
      + "<input id='tg-demo' placeholder='@username' style='width:100%;padding:11px;margin:6px 0;border-radius:8px;border:1px solid #333;background:#111;color:#fff'/>"
      + "<button class='btn' onclick='demoTelegramLogin()'>Continue with Telegram</button>";
    return;
  }
  const s = document.createElement("script");
  s.src = "https://telegram.org/js/telegram-widget.js?22";
  s.async = true;
  s.setAttribute("data-telegram-login", TELEGRAM_BOT_NAME);
  s.setAttribute("data-size", "large");
  s.setAttribute("data-onauth", "onTelegramAuth(user)");
  s.setAttribute("data-request-access", "write");
  wrap.appendChild(s);
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
  if (!u || u.type !== "telegram") return false;
  return (APP_CONFIG.ADMIN_TELEGRAM_USERNAMES || []).map(e=>e.toLowerCase().replace(/^@/,"")).includes((u.username || "").toLowerCase());
}

function updateAdminUI() {
  const b = document.getElementById("admin-btn");
  if (b) b.classList.toggle("hidden", !isAdmin());
}
window.updateAdminUI = updateAdminUI;

function switchTab(which) {
  document.getElementById("tab-telegram").classList.toggle("active", which === "telegram");
  document.getElementById("tab-email").classList.toggle("active", which === "email");
  document.getElementById("pane-telegram").classList.toggle("hidden", which !== "telegram");
  document.getElementById("pane-email").classList.toggle("hidden", which !== "email");
}

function demoTelegramLogin() {
  const v = ((document.getElementById("tg-demo") || {}).value || "telegram_user").replace(/^@/, "");
  localStorage.setItem("tgl_auth", "1");
  localStorage.setItem("tgl_user", JSON.stringify({ username: v }));
  showApp();
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
