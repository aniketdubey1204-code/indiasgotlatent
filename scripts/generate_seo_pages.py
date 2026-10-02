import json
import re
import os
import html

# Load LOCAL_VIDEOS
with open("js/videos.js", encoding="utf-8") as f:
    js_content = f.read()

m = re.search(r"const LOCAL_VIDEOS = (\[.*?\]);", js_content, re.DOTALL)
if not m:
    raise ValueError("Could not parse LOCAL_VIDEOS from js/videos.js")

videos = json.loads(m.group(1))
print(f"Loaded {len(videos)} videos.")

os.makedirs("episodes", exist_ok=True)

def parse_duration_to_iso(dur_str):
    if not dur_str:
        return "PT45M"
    m_h = re.search(r"(\d+)h", dur_str)
    m_m = re.search(r"(\d+)m", dur_str)
    m_s = re.search(r"(\d+)s", dur_str)
    h = int(m_h.group(1)) if m_h else 0
    m = int(m_m.group(1)) if m_m else 0
    s = int(m_s.group(1)) if m_s else 0
    res = "PT"
    if h: res += f"{h}H"
    if m: res += f"{m}M"
    if s: res += f"{s}S"
    return res if res != "PT" else "PT45M"

def parse_duration_seconds(dur_str):
    if not dur_str:
        return 2700
    m_h = re.search(r"(\d+)h", dur_str)
    m_m = re.search(r"(\d+)m", dur_str)
    m_s = re.search(r"(\d+)s", dur_str)
    h = int(m_h.group(1)) if m_h else 0
    m = int(m_m.group(1)) if m_m else 0
    s = int(m_s.group(1)) if m_s else 0
    return h * 3600 + m * 60 + s

def thumb_url(v):
    if v.get("youtubeId"):
        return f"https://i.ytimg.com/vi/{v['youtubeId']}/maxresdefault.jpg"
    if v.get("localImage"):
        return f"https://indiasgotlatent-opal.vercel.app/assets/thumbs/{v['localImage']}"
    if v.get("thumbnail_url"):
        t = v["thumbnail_url"]
        if t.startswith("/"):
            return f"https://indiasgotlatent-opal.vercel.app{t}"
        return t
    if v.get("archive_id"):
        return f"https://archive.org/services/img/{v['archive_id']}"
    return "https://indiasgotlatent-opal.vercel.app/assets/og-cover.png"

def cat_badge(v):
    c = (v.get("category") or "").lower()
    num = v.get("episode_number")
    if c == "season1": return f"Season 1 • EP {num}" if num else "Season 1"
    if c == "season2": return f"Season 2 • EP {num}" if num else "Season 2"
    if c == "s1bonus": return f"Season 1 • Bonus {num}" if num else "Season 1 • Bonus"
    if c == "s2bonus": return f"Season 2 • Bonus {num}" if num else "Season 2 • Bonus"
    if c == "s1bts": return f"Season 1 • BTS {num}" if num else "Season 1 • BTS"
    if c == "s2bts": return f"Season 2 • BTS {num}" if num else "Season 2 • BTS"
    if c == "bonus": return f"Bonus {num}" if num else "Bonus"
    if c == "bts": return f"BTS {num}" if num else "BTS"
    if c == "special": return "Special"
    return f"EP {num}" if num else "Special"

for i, v in enumerate(videos):
    vid_id = v["id"]
    title = html.escape(v.get("title", "India's Got Latent Episode"))
    desc = html.escape(v.get("description", "Watch India's Got Latent episode free on IGL Fan Vault."))
    thumb = thumb_url(v)
    duration_iso = parse_duration_to_iso(v.get("duration"))
    duration_sec = parse_duration_seconds(v.get("duration"))
    badge = cat_badge(v)
    canonical = f"https://indiasgotlatent-opal.vercel.app/episodes/{vid_id}.html"
    stream_url = v.get("video_url") or ""
    if not stream_url.startswith("http") and v.get("archive_id") and v.get("filename"):
        stream_url = f"https://archive.org/download/{v['archive_id']}/{v['filename']}"

    prev_v = videos[i - 1] if i > 0 else None
    next_v = videos[i + 1] if i < len(videos) - 1 else None

    # Video JSON-LD schema
    schema = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": f"India's Got Latent — {title}",
        "description": desc,
        "thumbnailUrl": [thumb],
        "uploadDate": "2024-08-01T08:00:00+05:30",
        "duration": duration_iso,
        "contentUrl": stream_url or canonical,
        "embedUrl": canonical,
        "inLanguage": "hi",
        "publisher": {
            "@type": "Organization",
            "name": "IGL Fan Vault",
            "logo": {
                "@type": "ImageObject",
                "url": "https://indiasgotlatent-opal.vercel.app/assets/brand.svg"
            }
        }
    }

    breadcrumb_schema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": "https://indiasgotlatent-opal.vercel.app/"
            },
            {
                "@type": "ListItem",
                "position": 2,
                "name": badge.split("•")[0].strip(),
                "item": "https://indiasgotlatent-opal.vercel.app/#rail"
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": title,
                "item": canonical
            }
        ]
    }

    faq_schema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f"Where can I watch India's Got Latent {title} free?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": f"You can watch the full uncut stream of India's Got Latent {title} in high definition right here on the IGL Fan Vault."
                }
            },
            {
                "@type": "Question",
                "name": "Who is featured in this episode?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": desc
                }
            }
        ]
    }

    html_page = f"""<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>India's Got Latent — {title} | Watch Free Full Episode</title>
<meta name="description" content="Watch India's Got Latent {title} free in HD. {desc} Complete uncut comedy talent show episode by Samay Raina."/>
<meta name="keywords" content="India's Got Latent, {title}, Samay Raina, watch India's Got Latent free, {badge}, IGL episodes"/>
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>
<link rel="canonical" href="{canonical}"/>
<link rel="icon" type="image/svg+xml" href="../assets/brand.svg"/>
<meta name="theme-color" content="#0C0C0E"/>
<meta name="google-site-verification" content="googlee60e2c77866452b7"/>

<!-- Open Graph -->
<meta property="og:type" content="video.episode"/>
<meta property="og:site_name" content="IGL Fan Vault"/>
<meta property="og:title" content="India's Got Latent — {title} | Watch Free"/>
<meta property="og:description" content="Watch India's Got Latent {title} free on IGL Fan Vault. {desc}"/>
<meta property="og:image" content="{thumb}"/>
<meta property="og:url" content="{canonical}"/>
<meta property="og:locale" content="en_IN"/>

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="India's Got Latent — {title} | Watch Free"/>
<meta name="twitter:description" content="{desc}"/>
<meta name="twitter:image" content="{thumb}"/>

<!-- Structured Data -->
<script type="application/ld+json">
{json.dumps(schema, indent=2)}
</script>
<script type="application/ld+json">
{json.dumps(breadcrumb_schema, indent=2)}
</script>
<script type="application/ld+json">
{json.dumps(faq_schema, indent=2)}
</script>

<link rel="stylesheet" href="../css/styles.css"/>
<link rel="stylesheet" href="https://cdn.plyr.io/3.7.8/plyr.css"/>
<style>
.ep-hero {{ max-width: 1100px; margin: 80px auto 40px; padding: 0 20px; }}
.ep-stage {{ position: relative; border-radius: 16px; overflow: hidden; background: #000; aspect-ratio: 16/9; box-shadow: 0 20px 60px rgba(0,0,0,.7); margin-bottom: 24px; border: 1px solid rgba(255,255,255,.12); }}
.ep-details {{ display: flex; flex-direction: column; gap: 14px; text-align: left; }}
.ep-details h1 {{ font-family: 'Syne', sans-serif; font-size: clamp(22px, 3.5vw, 32px); margin: 0; color: #fff; }}
.ep-meta-row {{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }}
.ep-nav-row {{ display: flex; justify-content: space-between; gap: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--line); flex-wrap: wrap; }}
</style>
</head>
<body>
<nav class="nav-dock">
  <a href="../" class="brand">IGL ◈ FAN VAULT</a>
  <a href="../" class="nav-link">Home</a>
  <a href="../#rail" class="nav-link">All Episodes</a>
  <a href="../" class="pill solid" style="padding:6px 14px;font-size:12px">← Browse Vault</a>
</nav>

<main class="ep-hero">
  <div class="ep-stage">
    {f'<iframe src="https://www.youtube-nocookie.com/embed/{v["youtubeId"]}?autoplay=1&rel=0" style="width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' if v.get("youtubeId") else f'<video id="player" controls playsinline poster="{thumb}" style="width:100%;height:100%"><source src="{stream_url}" type="video/mp4"/></video>'}
  </div>

  <div class="ep-details">
    <div class="ep-meta-row">
      <span class="badge live">● {badge}</span>
      {f'<span class="mini" style="background:rgba(255,255,255,.08);padding:4px 10px;border-radius:6px;font-size:12px">⏱ {v["duration"]}</span>' if v.get("duration") else ''}
    </div>
    <h1>India's Got Latent — {title}</h1>
    <p style="color:#C8BDB6;font-size:15px;line-height:1.6;margin:0">{desc}</p>
    <div class="action-dock" style="margin-top:10px">
      <a href="../?ep={vid_id}" class="pill solid">▶ Watch In Cinematic Theater</a>
      <a href="{stream_url}" download class="pill glass" target="_blank" rel="noopener">⬇ Download MP4</a>
      <a href="../" class="pill glass">⭐ Save to Watchlist</a>
    </div>
  </div>

  <div class="ep-nav-row">
    {f'<a href="{prev_v["id"]}.html" class="pbtn" style="text-decoration:none">⏮ Previous: {html.escape(prev_v["title"])}</a>' if prev_v else '<span></span>'}
    {f'<a href="{next_v["id"]}.html" class="pbtn" style="text-decoration:none">Next: {html.escape(next_v["title"])} ⏭</a>' if next_v else '<span></span>'}
  </div>
</main>

<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <span class="brand">IGL ◈ FAN VAULT</span>
      <p>Free, non-commercial fan archive for India's Got Latent episodes by Samay Raina.</p>
    </div>
    <div class="footer-links">
      <div class="footer-col">
        <h4>Browse</h4>
        <a href="../">All Episodes</a>
        <a href="../#rail">Season 1</a>
        <a href="../#rail">Season 2</a>
      </div>
      <div class="footer-col">
        <h4>Legal</h4>
        <a href="../">About &amp; DMCA</a>
      </div>
    </div>
  </div>
</footer>

<script src="https://cdn.plyr.io/3.7.8/plyr.js"></script>
<script>
if (document.getElementById("player")) {{
  new Plyr("#player", {{ seekTime: 10 }});
}}
</script>
</body>
</html>
"""

    with open(f"episodes/{vid_id}.html", "w", encoding="utf-8") as f_out:
        f_out.write(html_page)

print(f"Generated {len(videos)} static episode pages in /episodes/ folder.")

# Generate updated sitemap.xml
sitemap_xml = ['<?xml version="1.0" encoding="UTF-8"?>',
'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
'        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">',
'  <url>',
'    <loc>https://indiasgotlatent-opal.vercel.app/</loc>',
'    <lastmod>2026-10-02</lastmod>',
'    <changefreq>daily</changefreq>',
'    <priority>1.0</priority>',
'  </url>']

for v in videos:
    vid_id = v["id"]
    title = html.escape(v.get("title", ""))
    desc = html.escape(v.get("description", ""))
    thumb = thumb_url(v)
    dur_sec = parse_duration_seconds(v.get("duration"))
    stream_url = v.get("video_url") or ""
    if not stream_url.startswith("http") and v.get("archive_id") and v.get("filename"):
        stream_url = f"https://archive.org/download/{v['archive_id']}/{v['filename']}"

    sitemap_xml.append('  <url>')
    sitemap_xml.append(f'    <loc>https://indiasgotlatent-opal.vercel.app/episodes/{vid_id}.html</loc>')
    sitemap_xml.append('    <lastmod>2026-10-02</lastmod>')
    sitemap_xml.append('    <changefreq>weekly</changefreq>')
    sitemap_xml.append('    <priority>0.85</priority>')
    sitemap_xml.append('    <video:video>')
    sitemap_xml.append(f'      <video:thumbnail_loc>{thumb}</video:thumbnail_loc>')
    sitemap_xml.append(f'      <video:title>{title}</video:title>')
    sitemap_xml.append(f'      <video:description>{desc}</video:description>')
    if stream_url:
        sitemap_xml.append(f'      <video:content_loc>{html.escape(stream_url)}</video:content_loc>')
    sitemap_xml.append(f'      <video:player_loc>https://indiasgotlatent-opal.vercel.app/episodes/{vid_id}.html</video:player_loc>')
    sitemap_xml.append(f'      <video:duration>{dur_sec}</video:duration>')
    sitemap_xml.append('    </video:video>')
    sitemap_xml.append('  </url>')

sitemap_xml.append('</urlset>')

with open("sitemap.xml", "w", encoding="utf-8") as f_sm:
    f_sm.write("\n".join(sitemap_xml) + "\n")

print("Updated sitemap.xml with 42 self-canonical episode landing pages.")
