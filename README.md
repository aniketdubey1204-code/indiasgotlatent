# Setup

1. Supabase:
   - Create project at supabase.com
   - Run `sql/schema.sql` in SQL Editor
   - Auth > Providers > Email > Enable Email OTP
   - Copy Project URL + anon key into `js/config.js`
   - Add your email to ADMIN_EMAILS

2. Telegram bot (for default login):
   - Chat @BotFather on Telegram > /newbot > copy token + username
   - Set username in `js/config.js` TELEGRAM_BOT_NAME
   - In BotFather: /setdomain > set your website domain (required for Login Widget)

3. Videos:
   - Put mp4 files in `/videos/` OR use cloud URLs (Supabase Storage / R2 / S3 with public read)
   - Add via `admin.html` (writes to Supabase `videos` table) -> homepage auto-loads
   - Fallback: edit `js/videos.js` LOCAL_VIDEOS directly

4. Run locally: `npx serve .` then open index.html. Deploy to Netlify/Vercel.

Note: Only upload content you own rights to. You stated you own these videos.
