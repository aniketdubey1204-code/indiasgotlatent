import json
import re
import os
import html

# Load LOCAL_VIDEOS from js/videos.js
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

def extract_guests(title_text):
    m = re.search(r"ft\.\s*([^|\[\]]+)", title_text, re.IGNORECASE)
    if m:
        raw = m.group(1).strip()
        parts = re.split(r",|\band\b|&", raw)
        clean = [p.strip() for p in parts if p.strip()]
        return clean
    return []

# Generate all 42 individual static SEO landing pages
for i, v in enumerate(videos):
    vid_id = v["id"]
    raw_title = v.get("title", "India's Got Latent Episode")
    title = html.escape(raw_title)
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

    guests = extract_guests(raw_title)
    guest_str = ", ".join(guests) if guests else "Special Guests"

    # Actors and judges array for rich Google Schema
    actors = [{"@type": "Person", "name": "Samay Raina"}]
    for g in guests:
        actors.append({"@type": "Person", "name": g})

    # Video JSON-LD schema with complete Rich Result attributes
    schema = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": f"India's Got Latent — {title}",
        "description": f"Watch India's Got Latent {title} hosted by Samay Raina" + (f" with guest judges {guest_str}." if guests else " on IGL Fan Vault.") + f" {desc}",
        "thumbnailUrl": [thumb],
        "uploadDate": "2024-08-01T08:00:00+05:30",
        "duration": duration_iso,
        "contentUrl": stream_url or canonical,
        "embedUrl": canonical,
        "inLanguage": ["hi", "en"],
        "genre": ["Stand-up Comedy", "Reality TV", "Talent Show", "Comedy Roast"],
        "director": {
            "@type": "Person",
            "name": "Samay Raina"
        },
        "actor": actors,
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
                "name": f"Where can I watch India's Got Latent {title} free online?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": f"You can watch the full uncut stream of India's Got Latent {title} in high definition right here on the IGL Fan Vault directory without hidden fees."
                }
            },
            {
                "@type": "Question",
                "name": f"Who are the celebrity guest judges in India's Got Latent {title}?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": f"This episode is hosted by Samay Raina" + (f" and features special guest judges: {guest_str}." if guests else ".")
                }
            },
            {
                "@type": "Question",
                "name": "How does the latent scoring mechanism work?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "In India's Got Latent, each contestant self-predicts their latent talent score from 0 to 10 before performing. Celebrity judges then submit their real score. If the contestant correctly predicted their score, they win prize money."
                }
            },
            {
                "@type": "Question",
                "name": "Is IGL Fan Vault an official platform?",
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "No. IGL Fan Vault is an independent, non-commercial community archive created for fans of Samay Raina's India's Got Latent show. All media streams are embedded from publicly accessible sources."
                }
            }
        ]
    }

    guest_badges_html = "".join([f'<span class="mini" style="background:rgba(255,188,149,.15);border-color:rgba(255,188,149,.3);color:#FFBC95">⭐ Judge: {html.escape(g)}</span>' for g in guests])

    html_page = f"""<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>India's Got Latent — {title} | Watch Free Full Episode</title>
<meta name="description" content="Watch India's Got Latent {title} free in HD. Hosted by Samay Raina{f' with guest judges {guest_str}' if guests else ''}. {desc} Complete uncut comedy talent show episode."/>
<meta name="keywords" content="India's Got Latent, {title}, Samay Raina, {guest_str}, watch India's Got Latent free, {badge}, IGL episodes, comedy roast"/>
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/>
<link rel="canonical" href="{canonical}"/>
<link rel="icon" type="image/svg+xml" href="../assets/brand.svg"/>
<meta name="theme-color" content="#0C0C0E"/>
<meta name="google-site-verification" content="googlee60e2c77866452b7"/>

<!-- Open Graph -->
<meta property="og:type" content="video.episode"/>
<meta property="og:site_name" content="IGL Fan Vault"/>
<meta property="og:title" content="India's Got Latent — {title} | Watch Free"/>
<meta property="og:description" content="Watch India's Got Latent {title} free on IGL Fan Vault. Hosted by Samay Raina{f' with judges {guest_str}' if guests else ''}."/>
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
.ep-details h1 {{ font-family: 'Syne', sans-serif; font-size: clamp(22px, 3.5vw, 32px); margin: 0; color: #fff; line-height: 1.25; }}
.ep-meta-row {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
.ep-nav-row {{ display: flex; justify-content: space-between; gap: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--line); flex-wrap: wrap; }}
.faq-box {{ margin-top: 36px; padding: 24px; border-radius: 16px; background: rgba(255,255,255,.03); border: 1px solid var(--line); }}
.faq-box h2 {{ font-family: 'Syne', sans-serif; font-size: 20px; margin: 0 0 16px; color: #fff; }}
.faq-item {{ margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,.07); padding-bottom: 12px; }}
.faq-item summary {{ cursor: pointer; font-weight: 600; color: #EDE6E0; font-size: 15px; outline: none; list-style: none; display: flex; justify-content: space-between; align-items: center; }}
.faq-item summary::-webkit-details-marker {{ display: none; }}
.faq-item summary::after {{ content: '+'; font-size: 18px; color: var(--gold); }}
.faq-item[open] summary::after {{ content: '−'; }}
.faq-item p {{ margin: 10px 0 0; color: #C8BDB6; font-size: 14px; line-height: 1.6; }}
.show-info-box {{ margin-top: 24px; padding: 20px; border-radius: 14px; background: rgba(20,20,24,.6); border: 1px solid var(--line); }}
.show-info-box h3 {{ font-family: 'Syne', sans-serif; font-size: 16px; margin: 0 0 8px; color: #FFBC95; }}
.show-info-box p {{ color: #C8BDB6; font-size: 13.5px; line-height: 1.55; margin: 0; }}
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
      <span class="mini">Host: Samay Raina</span>
      {guest_badges_html}
      {f'<span class="mini" style="background:rgba(255,255,255,.08);padding:4px 10px;border-radius:6px;font-size:12px">⏱ {v["duration"]}</span>' if v.get("duration") else ''}
    </div>
    <h1>India's Got Latent — {title}</h1>
    <p style="color:#EDE6E0;font-size:15px;line-height:1.6;margin:0">{desc}</p>
    
    <div class="action-dock" style="margin-top:10px">
      <a href="../?ep={vid_id}" class="pill solid">▶ Watch In Cinematic Theater</a>
      <a href="{stream_url}" download class="pill glass" target="_blank" rel="noopener">⬇ Download MP4</a>
      <a href="../" class="pill glass">⭐ Save to Watchlist</a>
    </div>

    <div class="show-info-box">
      <h3>About India's Got Latent Format</h3>
      <p>India's Got Latent is an unscripted comedy talent show created and hosted by stand-up comedian <strong>Samay Raina</strong>. In every episode, contestants showcase unconventional, raw, and latent abilities. Before performing, each contestant guesses their own score on a scale of 0 to 10. Celebrity guest judges then award their scores — if the predictions match, the contestant wins cash rewards. Uncensored, raw, and filled with spontaneous roasts and banter.</p>
    </div>

    <div class="faq-box">
      <h2>Frequently Asked Questions</h2>
      <details class="faq-item" open>
        <summary>Where can I watch India's Got Latent {title} free online?</summary>
        <p>You can stream this full episode in high definition directly on the IGL Fan Vault. Choose between the standard web player, the cinematic theater view, or direct MP4 download.</p>
      </details>
      <details class="faq-item">
        <summary>Who are the guest judges in this episode?</summary>
        <p>This episode features stand-up comedian & creator <strong>Samay Raina</strong> alongside {f'guest judges <strong>{guest_str}</strong>' if guests else 'featured celebrity guest judges'}.</p>
      </details>
      <details class="faq-item">
        <summary>How does scoring work in India's Got Latent?</summary>
        <p>Contestants perform raw talents and must accurately predict their own score before receiving the judges' verdict. Exact matches win cash prizes!</p>
      </details>
      <details class="faq-item">
        <summary>Is this episode uncut?</summary>
        <p>Yes. The IGL Fan Vault features the complete runtime of {v.get("duration") or "the full broadcast"} with full banter, performances, and judging comments preserved.</p>
      </details>
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
        <a href="../#rail">Bonus &amp; BTS</a>
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

print(f"Generated {len(videos)} enriched static episode pages in /episodes/ folder.")

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
    title = html.escape(re.sub(r"\s+", " ", v.get("title", "")).strip())
    raw_desc = re.sub(r"\s+", " ", v.get("description", "")).strip()
    if not raw_desc:
        raw_desc = f"Watch India's Got Latent {title} free on IGL Fan Vault."
    desc = html.escape(raw_desc[:1000])
    thumb = thumb_url(v)
    dur_sec = max(60, parse_duration_seconds(v.get("duration")))
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
    if v.get("youtubeId"):
        sitemap_xml.append(f'      <video:player_loc allow_embed="yes">https://www.youtube-nocookie.com/embed/{v["youtubeId"]}</video:player_loc>')
    elif stream_url:
        sitemap_xml.append(f'      <video:content_loc>{html.escape(stream_url)}</video:content_loc>')
    sitemap_xml.append(f'      <video:duration>{dur_sec}</video:duration>')
    sitemap_xml.append('    </video:video>')
    sitemap_xml.append('  </url>')

sitemap_xml.append('</urlset>')

with open("sitemap.xml", "w", encoding="utf-8") as f_sm:
    f_sm.write("\n".join(sitemap_xml) + "\n")

print("Updated sitemap.xml with 42 self-canonical episode landing pages.")

# Pre-render crawlable cards directly into index.html
prerendered_cards = []
for v in videos:
    vid_id = v["id"]
    title = html.escape(v.get("title", ""))
    desc = html.escape((v.get("description") or "")[:90])
    badge = cat_badge(v)
    thumb = thumb_url(v)
    dur = v.get("duration") or ""
    card_html = f'''      <a href="episodes/{vid_id}.html" class="cin-card" role="button" aria-label="Play {title}">
        <div class="thumb"><img src="{thumb}" loading="lazy" class="img-on" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block" alt="{title}"/></div>
        <div class="tags"><span class="mini">{badge}</span></div>
        {f'<span class="dur">{dur}</span>' if dur else ''}
        <div class="shade"></div>
        <div class="play-ov"><span>▶</span></div>
        <div class="cmeta"><h3>{title}</h3><p>{desc}</p></div>
      </a>'''
    prerendered_cards.append(card_html)

cards_block = "\n".join(prerendered_cards)

with open("index.html", encoding="utf-8") as f_in:
    idx_content = f_in.read()

# Replace inner of <div id="video-grid" class="grid">...</div>
grid_pattern = r'(<div id="video-grid" class="grid">)(.*?)(</div>\s*</section>)'
m_grid = re.search(grid_pattern, idx_content, re.DOTALL)
if m_grid:
    new_idx = idx_content[:m_grid.start(2)] + "\n" + cards_block + "\n    " + idx_content[m_grid.end(2):]
    with open("index.html", "w", encoding="utf-8") as f_out:
        f_out.write(new_idx)
    print("Pre-rendered 42 crawlable episode cards into index.html.")
else:
    print("Warning: Could not locate #video-grid in index.html for card pre-rendering.")
