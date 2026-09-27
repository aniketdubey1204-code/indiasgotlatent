# VPS proxy setup (permanent fix for video playback + Supabase quota)

Cheapest: Hostinger / Contabo VPS, ~Rs 250-500/mo, Ubuntu 22.04. 1TB+ bandwidth included.

## On the VPS (copy-paste, one line at a time)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
npm install -g pm2
mkdir ~/igl-proxy && cd ~/igl-proxy
# upload server.mjs here (scp or paste via nano server.mjs)
PORT=8080 pm2 start server.mjs --name igl-proxy
pm2 startup   # run the command it prints
pm2 save
sudo ufw allow 8080
```

Test: `http://YOUR-VPS-IP:8080/watch?dataId=s2-07&list=1` should return qualities JSON.

## Switch the site to it

`js/config.js`:
```js
STREAM_PROXY: "http://YOUR-VPS-IP:8080/watch",
THUMB_PROXY: "http://YOUR-VPS-IP:8080/thumb",
```
Push. Done — video bytes flow VPS -> viewer, Supabase only serves tiny JSON rows.

## Why this exists

okcdn.ru answers `400` to every browser User-Agent (verified: Chrome, Firefox
rejected even with correct Referer; non-browser UAs get 206). So the browser
can NEVER fetch video directly — a server must pipe it. Supabase works but its
free plan allows only 5GB egress (we burned 48GB). A cheap VPS has terabytes.
