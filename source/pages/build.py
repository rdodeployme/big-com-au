"""Assemble BIG pages: shared head/header/footer + pages/<name>.html bodies."""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

NAV = [("station.html", "The station"), ("sizing.html", "How it's sized"), ("savings.html", "Savings"),
       ("standard.html", "The BIG Standard"), ("your-home.html", "Your Home"), ("pilot.html", "Pilot")]

PAGES = {
    "index.html": ("BIG — Think BIG. Recycle better.", "One recycling station on every new home site. Eight streams, each bay sized to what a house build actually throws out. A Recycle Group initiative.", True),
    "station.html": ("The BIG station — eight bays, one footprint", "The BIG station: a weatherproof, hook-lift recycling station with eight numbered bays, sized by data, for every new home site.", True),
    "sizing.html": ("How BIG bays are sized", "Why BIG sizes bins by space, not weight: the data, conversion, assumptions and sources behind each bay.", False),
    "savings.html": ("What BIG saves", "Estimate the landfill levy, truck visits and tonnes BIG keeps out of landfill across your build program.", False),
    "standard.html": ("The BIG Standard — recycle to standard", "A model subcontract clause, stage checks and trade sheet for recycling on new home sites.", False),
    "your-home.html": ("Your Home and BIG", "How the BIG system delivers the Australian Government Your Home waste minimisation guidance on site.", False),
    "pilot.html": ("Start a BIG pilot", "Run BIG on a set of your homes next to your current skips. We weigh everything and report back.", False),
}

def head(title, desc, three):
    imp = ('<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",'
           '"three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>\n') if three else ''
    return f'''<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="img/og.jpg">
<meta name="theme-color" content="#0E1114">
<link rel="icon" href="img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/big.css">
{imp}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
'''

def header(active):
    cur = ' aria-current="page"'
    links = "\n".join(f'      <a href="{h}"{cur if h == active else ""}>{t}</a>' for h, t in NAV)
    return f'''<header class="top">
  <div class="wrap">
    <a class="mark" href="./" aria-label="BIG home"><b>BIG</b><span>A Recycle Group initiative</span></a>
    <nav class="nav" id="nav" aria-label="Main">
{links}
      <a class="nav-cta" href="pilot.html#form">Start a pilot</a>
    </nav>
    <a class="btn btn-cu" href="pilot.html#form">Start a pilot</a>
    <button class="menu" aria-expanded="false" aria-controls="nav">Menu</button>
  </div>
</header>
'''

def nextpage(active):
    """Big 'next page' link at the foot of every inner page."""
    order = [h for h, _ in NAV]
    if active not in order: return ''
    i = order.index(active); nh, nt = NAV[(i + 1) % len(NAV)]
    return f'''<a class="next" href="{nh}"><span class="wrap"><small>Next</small><b>{nt}</b></span></a>
'''

FOOTER = '''<footer>
  <div class="wrap">
    <div><a class="mark" href="./"><b>BIG</b></a><p style="margin-top:12px">Think BIG. Recycle better.<br>A Recycle Group initiative.</p></div>
    <ul>''' + "".join(f'<li><a href="{h}">{t}</a></li>' for h, t in NAV[:3]) + '''</ul>
    <ul>''' + "".join(f'<li><a href="{h}">{t}</a></li>' for h, t in NAV[3:]) + '''<li><a href="https://recycle.net.au" rel="noopener">recycle.net.au</a></li></ul>
    <p class="fine">BIG doesn't accept asbestos, chemicals or other hazardous waste. Figures are estimates from published studies and are replaced by measured pilot data. Images marked illustrative are AI-generated. BIG is an independent Recycle Group initiative and is not endorsed by the Australian Government.</p>
  </div>
</footer>
<script type="module" src="js/site.js"></script>
</body>
</html>
'''

for out, (title, desc, three) in PAGES.items():
    src = "pages" if os.path.isdir("pages") else "."
    body = open(os.path.join(src, out)).read()
    html = head(title, desc, three) + header(out) + body + (nextpage(out)) + FOOTER
    open(out, "w").write(html)
    print("wrote", out, len(html))

open("method.html", "w").write('<!doctype html><meta charset="utf-8"><title>Moved</title><meta http-equiv="refresh" content="0;url=sizing.html"><link rel="canonical" href="sizing.html"><a href="sizing.html">This page has moved</a>')
