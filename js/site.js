// BIG site — interactions
const $ = (s, r = document) => r.querySelector(s);
const fmt = (n, d = 0) => n.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d });
const money = (n) => '$' + fmt(Math.round(n));

// hero video: respect reduced motion
const hv = document.getElementById('heroVid');
if (hv && matchMedia('(prefers-reduced-motion: reduce)').matches) { hv.removeAttribute('autoplay'); hv.pause(); }

// menu
const menuBtn = $('.menu');
menuBtn?.addEventListener('click', () => {
  const open = $('#nav').classList.toggle('open');
  menuBtn.setAttribute('aria-expanded', open);
});
document.querySelectorAll('#nav a').forEach((a) => a.addEventListener('click', () => { $('#nav')?.classList.remove('open'); menuBtn?.setAttribute('aria-expanded', false); }));

// what goes where — on-site guidance per bay
const BAY = {
  plastic: { in: 'Plastic wrap and film, strapping, pipe and conduit offcuts, plastic packaging and buckets (empty and dry).', out: 'Polystyrene (that goes in bay 05), anything with paint, sealant or food in it.', where: 'Sorted by polymer for plastics recovery.' },
  timber: { in: 'Framing offcuts, untreated timber, pallets, dunnage and formwork.', out: 'Painted, laminated or treated timber, until the pilot confirms it can be taken. Those go in General.', where: 'Timber recovery through Recycle Group.' },
  plaster: { in: 'Clean plasterboard offcuts and broken sheets, kept dry.', out: 'Wet or painted board, cornice cement tubs, tape and nails in bulk.', where: 'Plasterboard recycling through Recycle Group.' },
  card: { in: 'Cardboard boxes and packaging, flattened.', out: 'Wet or waxed cardboard, food packaging, plastic-lined board.', where: 'Baled and sent for paper recycling.' },
  eps: { in: 'White polystyrene packaging and clean offcuts.', out: 'Food trays and polystyrene with tape, glue or render on it.', where: 'Densified for polystyrene recycling.' },
  rubble: { in: 'Broken bricks, concrete, mortar, tiles and pavers.', out: 'Soil, plasterboard, and never asbestos or fibro.', where: 'Crushed into recycled aggregate.' },
  general: { in: 'Whatever can\'t go in bays 01 to 06 or 08: mixed offcuts, sweepings, fibre cement.', out: 'Asbestos, chemicals, paint, liquids, batteries and gas bottles. These never go in the station.', where: 'Final sort, then licensed disposal.' },
  steel: { in: 'Steel and metal offcuts, mesh, roofing and flashing offcuts, strapping, copper and aluminium.', out: 'Gas bottles, aerosol cans, anything with liquid in it.', where: 'Scrap metal recycling.' },
};

let MODEL;
fetch('data/model.json').then((r) => r.json()).then((m) => { MODEL = m; initAll(); });

function initAll() {
  initBays(); initSlope(); initPlan(); initHouse(); initCalc(); initBayGrid(); initElevation(); initReport();
}

// ---------- bays + 3D ----------
let viewer;
function initBays() {
  const list = $('#bayList'); if (!list) return;
  list.innerHTML = MODEL.streams.map((s) => `<li><button type="button" data-id="${s.id}" aria-pressed="false"><b>${String(s.n).padStart(2, '0')}</b>${s.name}</button></li>`).join('');
  list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(b.dataset.id, true); });
  pick('timber', false);
  const el = $('#viewer');
  const io = new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting) return; io.disconnect();
    try {
      const { mountStation } = await import('./station.js');
      viewer = mountStation(el, { onPick: (id) => pick(id, false) });
    } catch (err) { el.querySelector('.loading').textContent = 'The 3D view needs a newer browser. Here is the render instead.'; }
  }, { rootMargin: '200px' });
  io.observe(el);
}
function pick(id, from3d) {
  const s = MODEL.streams.find((x) => x.id === id); const g = BAY[id];
  document.querySelectorAll('#bayList button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.id === id));
  $('#bayDetail').innerHTML = `<h3><span>${String(s.n).padStart(2, '0')}</span>${s.name}</h3>
    <p class="vol">${fmt(s.bayM3, 1)} m³ bay · ${fmt(s.volume, 0)}% of the space · ${fmt(s.weight, s.weight < 1 ? 1 : 0)}% of the weight</p>
    <dl><div><dt>Goes in</dt><dd>${g.in}</dd></div><div><dt>Stays out</dt><dd>${g.out}</dd></div><div><dt>Where it goes</dt><dd>${g.where}</dd></div></dl>`;
  if (from3d) viewer?.select(id);
}

// ---------- weight vs space slope ----------
function initSlope() {
  const svg = $('#slope'); if (!svg) return;
  const sm = innerWidth < 640;
  const W = sm ? 380 : 560, H = 420, xL = sm ? 118 : 172, xR = sm ? 262 : 400, top = 26, bot = 396;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const SHORT = { plastic: 'Plastics', timber: 'Timber', plaster: 'Plaster', card: 'Cardboard', eps: 'Poly', rubble: 'Bricks', general: 'General', steel: 'Steel' };
  const nm = (s) => sm ? SHORT[s.id] : s.name;
  const fs = sm ? 13 : 13.5;
  const max = 32;
  const y = (v) => bot - (v / max) * (bot - top);
  const ss = [...MODEL.streams];
  // nudge labels apart on each side
  const spread = (key) => {
    const pts = ss.map((s) => ({ id: s.id, y: y(s[key]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < pts.length; i++) if (pts[i].y - pts[i - 1].y < 19) pts[i].y = pts[i - 1].y + 19;
    for (let i = pts.length - 2; i >= 0; i--) if (pts[i + 1].y > bot + 6 && pts[i + 1].y - pts[i].y < 19) pts[i].y = pts[i + 1].y - 19;
    return Object.fromEntries(pts.map((p) => [p.id, p.y]));
  };
  const lw = spread('weight'), lv = spread('volume');
  let html = `<text x="${xL}" y="12" text-anchor="middle" font-size="14" font-weight="700" fill="#0E1114">By weight</text>
    <text x="${xR}" y="12" text-anchor="middle" font-size="14" font-weight="700" fill="#0E1114">By space</text>
    <line x1="${xL}" x2="${xL}" y1="${top}" y2="${bot}" stroke="rgba(14,17,20,.18)"/><line x1="${xR}" x2="${xR}" y1="${top}" y2="${bot}" stroke="rgba(14,17,20,.18)"/>`;
  for (const s of ss) {
    const up = s.volume > s.weight;
    const hot = s.id === 'rubble' || s.id === 'card';
    const c = hot ? '#5E3A22' : 'rgba(14,17,20,.38)';
    html += `<g class="ln" data-id="${s.id}">
      <line x1="${xL}" y1="${y(s.weight)}" x2="${xR}" y2="${y(s.volume)}" stroke="${c}" stroke-width="${hot ? 3 : 1.6}"/>
      <circle cx="${xL}" cy="${y(s.weight)}" r="${hot ? 5 : 3.5}" fill="${c}"/><circle cx="${xR}" cy="${y(s.volume)}" r="${hot ? 5 : 3.5}" fill="${c}"/>
      <text x="${xL - 12}" y="${lw[s.id] + 4.5}" text-anchor="end" font-size="${fs}" fill="#0E1114" font-weight="${hot ? 700 : 500}">${nm(s)} ${fmt(s.weight, s.weight < 1 ? 1 : 0)}%</text>
      <text x="${xR + 12}" y="${lv[s.id] + 4.5}" font-size="${fs}" fill="#0E1114" font-weight="${hot ? 700 : 500}">${fmt(s.volume, s.volume < 3 ? 1 : 0)}% ${nm(s)}</text></g>`;
  }
  svg.innerHTML = html;
  document.querySelectorAll('.toggle button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.toggle button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    drawPlan(b.dataset.mode);
  }));
}

// ---------- plan overlay (bay geometry from the Blender build) ----------
let BAYS;
function initPlan() {
  fetch('data/bays.json').then((r) => r.json()).then((b) => { BAYS = b.bays; drawPlan('volume'); });
}
function drawPlan(mode) {
  const svg = $('#planSvg'); if (!svg || !BAYS) return;
  const pxm = 1800 / 7.4, cx = 900, cy = 558;
  const rowY = { A: [0.04, 1.185], B: [-1.185, -0.04] };
  const tot = MODEL.streams.reduce((a, s) => a + s[mode === 'weight' ? 'weight' : 'built'], 0);
  let html = '';
  for (const b of BAYS) {
    const s = MODEL.streams.find((x) => x.id === b.id);
    const [y0, y1] = rowY[b.side];
    const X = cx + b.x0 * pxm, Wd = b.len * pxm, Y = cy - y1 * pxm, Hh = (y1 - y0) * pxm;
    const share = mode === 'weight' ? s.weight : s.volume;
    html += `<g><rect x="${X + 10}" y="${Y + 10}" width="${Math.max(120, Math.min(Wd - 20, 330))}" height="${Wd > 330 ? 92 : 104}" rx="6" fill="rgba(14,17,20,.82)"/>
      <text x="${X + 24}" y="${Y + 52}" font-family="Archivo" font-weight="800" font-size="34" fill="#C2804F">${String(s.n).padStart(2, '0')}</text>
      <text x="${X + 24}" y="${Y + 84}" font-family="Inter" font-weight="600" font-size="22" fill="#EEF1F3">${fmt(share, share < 1 ? 1 : 0)}% ${mode === 'weight' ? 'wt' : 'vol'}</text></g>`;
  }
  if (mode === 'weight') {
    // draw "sized by weight" ghost lengths as a bar under each row
    for (const side of ['A', 'B']) {
      const row = BAYS.filter((x) => x.side === side);
      const rowTot = row.reduce((a, x) => a + MODEL.streams.find((q) => q.id === x.id).weight, 0);
      let x = cx + row[0].x0 * pxm; const [y0, y1] = rowY[side];
      const Y = cy - (side === 'A' ? y0 : y1) * pxm + (side === 'A' ? -16 : 4);
      for (const b of row) {
        const s = MODEL.streams.find((q) => q.id === b.id);
        const w = 6.22 * pxm * (s.weight / rowTot);
        html += `<rect x="${x + 2}" y="${Y}" width="${Math.max(0, w - 4)}" height="12" rx="2" fill="#C2804F" opacity=".95"/>`;
        x += w;
      }
    }
  }
  svg.innerHTML = html;
  $('.plan-cap').textContent = mode === 'weight'
    ? 'Copper bars show how long each bay would be if sized by weight. The rubble bay would take a third of the station and fill a fraction of it, while cardboard and timber overflowed.'
    : 'Lid off, from above. Each bay\'s length is its share of the loose volume a new home produces. The smallest bays are held at a 0.6 m minimum so they can still be loaded by hand.';
}

// ---------- house size ----------
function initHouse() {
  const r = $('#area'); if (!r) return;
  const upd = () => {
    const a = +r.value; $('#areaOut').textContent = a;
    const t = a * MODEL.kgPerM2.central / 1000, v = t * MODEL.m3PerTonne, lifts = v / (MODEL.stationInternalM3 * 0.85);
    $('#tOut').textContent = fmt(t, 1) + ' t'; $('#vOut').textContent = fmt(v) + ' m³'; $('#lOut').textContent = fmt(lifts, 1);
    const skips = v / 6; const whole = Math.floor(skips);
    $('#skips').innerHTML = Array.from({ length: Math.ceil(skips) }, (_, i) => `<i class="${i >= whole ? 'part' : ''}"></i>`).join('');
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
    const n = Math.round(skips);
    $('#skipsCap').textContent = `That's about ${words[n] || n} 6 m³ skips of mixed waste, or ${fmt(lifts, 1)} BIG change-overs, already sorted.`;
    drawStreamBars('#streamBars', t, 'home');
  };
  r.addEventListener('input', upd); upd();
}

// ---------- savings calculator ----------
function initCalc() {
  const f = $('#calc'); if (!f) return;
  const upd = () => {
    const homes = Math.max(0, +$('#homes').value || 0), area = Math.max(0, +$('#farea').value || 0);
    const levy = +$('#levy').value, base = +$('#base').value / 100, tgt = +$('#target').value / 100;
    $('#baseOut').textContent = Math.round(base * 100); $('#targetOut').textContent = Math.round(tgt * 100);
    const t1 = area * MODEL.kgPerM2.central / 1000, d1 = t1 * Math.max(0, tgt - base), s1 = d1 * levy, v1 = t1 * MODEL.m3PerTonne;
    $('#cT1').textContent = fmt(t1, 1) + ' t'; $('#cTy').textContent = fmt(t1 * homes) + ' t';
    $('#cD1').textContent = fmt(d1, 1) + ' t'; $('#cDy').textContent = fmt(d1 * homes) + ' t';
    $('#cS1').textContent = money(s1); $('#cSy').textContent = money(s1 * homes);
    $('#cV1').textContent = fmt(v1) + ' m³'; $('#cVy').textContent = fmt(v1 * homes) + ' m³';
    $('#cSave').textContent = money(s1 * homes);
    // truck visits
    const mixed = Math.ceil(v1 / 6) * homes, big = Math.ceil(v1 / (MODEL.stationInternalM3 * 0.85)) * homes;
    if ($('#tkMixed')) {
      $('#tkMixed').textContent = fmt(mixed); $('#tkBig').textContent = fmt(big);
      $('#tkMixedBar').style.width = '100%'; $('#tkBigBar').style.width = (mixed ? 100 * big / mixed : 0) + '%';
    }
    drawStreamBars('#streamBarsYear', t1 * homes, 'year');
    drawLevyChart(d1 * homes);
    const sc = $('#scenTbl tbody');
    if (sc) sc.innerHTML = [100, 250, 1000, 2500].map((h) => {
      const tv = Math.ceil(v1 / 6) * h - Math.ceil(v1 / (MODEL.stationInternalM3 * 0.85)) * h;
      return `<tr${h === homes ? ' class="hl"' : ''}><td><b>${fmt(h)}</b></td><td class="n">${fmt(t1 * h)} t</td><td class="n">${fmt(d1 * h)} t</td><td class="n">${money(s1 * h)}</td><td class="n">${fmt(tv)}</td></tr>`;
    }).join('');
  };
  f.addEventListener('input', upd); upd();
}

// ---------- stream bars (big numbers, real scale) ----------
function drawStreamBars(sel, tonnes, mode) {
  const el = $(sel); if (!el) return;
  const rows = MODEL.streams.map((s) => ({ ...s, t: tonnes * s.weight / 100, v: tonnes * MODEL.m3PerTonne * s.volume / 100 }));
  const maxV = Math.max(...rows.map((r) => r.v));
  el.innerHTML = rows.map((r) => `<div class="sb"><p class="sb-n"><b>${String(r.n).padStart(2, '0')}</b>${r.name}</p>
    <div class="sb-bar"><i style="width:${(100 * r.v / maxV).toFixed(1)}%"></i></div>
    <p class="sb-v"><b>${fmt(r.v, mode === 'home' && r.v < 10 ? 1 : 0)} m³</b><span>${fmt(r.t, r.t < 0.1 ? 2 : (r.t < 10 ? 1 : 0))} t</span></p></div>`).join('')
    + `<p class="sb-foot">Bar length is space, because that's what fills a bin. ${mode === 'home' ? 'Per home.' : 'Per year, across your program.'}</p>`;
}

// ---------- levy chart (Qld legislated schedule) ----------
function drawLevyChart(tonnesKept) {
  const svg = $('#lvChart'); if (!svg) return;
  const yrs = [['2025–26', 125], ['2026–27', 135], ['2027–28', 145], ['2028–29', 155], ['2029–30', 165]];
  const vals = yrs.map(([, r]) => tonnesKept * r), max = Math.max(...vals) || 1;
  const W = 560, H = 300, b = 250, bw = 76, gap = (W - bw * 5) / 6;
  svg.innerHTML = yrs.map(([y], i) => {
    const h = 200 * vals[i] / max, x = gap + i * (bw + gap);
    return `<rect x="${x}" y="${b - h}" width="${bw}" height="${h}" rx="3" fill="${i === 4 ? '#5E3A22' : '#0E1114'}"/>
      <text x="${x + bw / 2}" y="${b - h - 10}" text-anchor="middle" font-size="15" font-weight="700" font-family="Inter" fill="#0E1114">${money(vals[i])}</text>
      <text x="${x + bw / 2}" y="${b + 22}" text-anchor="middle" font-size="13" font-family="Inter" fill="rgba(14,17,20,.7)">${y}</text>`;
  }).join('') + `<line x1="0" x2="${W}" y1="${b}" y2="${b}" stroke="rgba(14,17,20,.3)"/>`;
}

// ---------- station page: bay grid ----------
function initBayGrid() {
  const g = $('#bayGrid'); if (!g) return;
  g.innerHTML = MODEL.streams.map((s) => { const b = BAY[s.id]; return `<article class="bg">
    <img src="img/bay-${s.id}.jpg" alt="" loading="lazy">
    <div class="bg-b"><h3><span>${String(s.n).padStart(2, '0')}</span>${s.name}</h3>
    <p class="bg-m">${fmt(s.bayM3, 1)} m³ bay · ${fmt(s.volume, s.volume < 3 ? 1 : 0)}% of the space · ${fmt(s.weight, s.weight < 1 ? 1 : 0)}% of the weight</p>
    <dl><dt>Goes in</dt><dd>${b.in}</dd><dt>Stays out</dt><dd>${b.out}</dd><dt>Where it goes</dt><dd>${b.where}</dd></dl></div></article>`; }).join('');
}

// ---------- station page: dimensioned side elevation ----------
function initElevation() {
  const svg = $('#elevSvg'); if (!svg) return;
  fetch('data/bays.json').then((r) => r.json()).then(({ bays }) => {
    const k = 1800 / 7.6, X = (x) => 900 + x * k, Z = (z) => 558 - (z - 1.35) * k;
    const ink = '#0E1114', sw = 2.5, fs = 26;
    const dimH = (x0, x1, y, label) => `<line x1="${X(x0)}" x2="${X(x1)}" y1="${y}" y2="${y}" stroke="${ink}" stroke-width="${sw}" marker-start="url(#ar)" marker-end="url(#ar)"/>
      <line x1="${X(x0)}" x2="${X(x0)}" y1="${y - 16}" y2="${y + 16}" stroke="${ink}" stroke-width="1.5"/><line x1="${X(x1)}" x2="${X(x1)}" y1="${y - 16}" y2="${y + 16}" stroke="${ink}" stroke-width="1.5"/>
      <rect x="${(X(x0) + X(x1)) / 2 - label.length * 8 - 10}" y="${y - 20}" width="${label.length * 16 + 20}" height="40" fill="#ECEFF1"/>
      <text x="${(X(x0) + X(x1)) / 2}" y="${y + 9}" text-anchor="middle" font-family="Inter" font-weight="600" font-size="${fs}" fill="${ink}">${label}</text>`;
    const dimV = (z0, z1, x, label) => `<line x1="${x}" x2="${x}" y1="${Z(z0)}" y2="${Z(z1)}" stroke="${ink}" stroke-width="${sw}" marker-start="url(#ar)" marker-end="url(#ar)"/>
      <line x1="${x - 16}" x2="${x + 16}" y1="${Z(z0)}" y2="${Z(z0)}" stroke="${ink}" stroke-width="1.5"/><line x1="${x - 16}" x2="${x + 16}" y1="${Z(z1)}" y2="${Z(z1)}" stroke="${ink}" stroke-width="1.5"/>
      <text x="${x - 22}" y="${(Z(z0) + Z(z1)) / 2 + 9}" text-anchor="end" font-family="Inter" font-weight="600" font-size="${fs}" fill="${ink}">${label}</text>`;
    let h = `<defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="${ink}"/></marker><marker id="arw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#EEF1F3"/></marker></defs>`;
    h += `<line x1="60" x2="1740" y1="${Z(0)}" y2="${Z(0)}" stroke="${ink}" stroke-width="2" stroke-dasharray="10 8"/>`;
    h += dimH(-3.15, 3.15, 120, '6,300');
    h += dimV(0, 2.42, 110, '2,420');
    const lx = X(-0.55), wht = '#EEF1F3';
    h += `<line x1="${lx}" x2="${lx}" y1="${Z(0)}" y2="${Z(1.22)}" stroke="${wht}" stroke-width="${sw}" marker-start="url(#arw)" marker-end="url(#arw)"/>
      <line x1="${lx - 16}" x2="${lx + 16}" y1="${Z(1.22)}" y2="${Z(1.22)}" stroke="${wht}" stroke-width="1.5"/>
      <text x="${lx - 20}" y="${Z(0.72)}" text-anchor="end" font-family="Inter" font-weight="600" font-size="${fs}" fill="${wht}">1,220</text>
      <text x="${lx - 20}" y="${Z(0.72) + 28}" text-anchor="end" font-family="Inter" font-size="20" fill="rgba(238,241,243,.7)">loading lip</text>`;
    const side = bays.filter((b) => b.side === 'B').sort((a, b) => a.x0 - b.x0);
    for (const b of side) h += dimH(b.x0, b.x0 + b.len, Z(0) + 70, fmt(Math.round(b.len * 1000 / 10) * 10));
    svg.innerHTML = h;
  });
}

// ---------- pilot page: example report bars (demo) ----------
function initReport() {
  const el = $('#rpBars'); if (!el) return;
  const demo = { plastic: 0.18, timber: 1.92, plaster: 0.86, card: 0.31, eps: 0.04, rubble: 2.29, general: 1.55, steel: 0.25 };
  const max = Math.max(...Object.values(demo));
  el.innerHTML = MODEL.streams.map((s) => `<div class="rb"><span>${String(s.n).padStart(2, '0')} ${s.name}</span><div><i style="width:${100 * demo[s.id] / max}%"></i></div><b>${fmt(demo[s.id], 2)} t</b></div>`).join('');
}

// ---------- pilot form → email ----------
const TO = 'toby@recycle.au';
$('#pilotForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const body = `Name: ${d.name}\nCompany: ${d.company}\nEmail: ${d.email}\nPhone: ${d.phone || ''}\nHomes a year: ${d.homes}\nWhere we build: ${d.region || ''}\n\n${d.message || ''}`;
  location.href = `mailto:${TO}?subject=${encodeURIComponent('BIG pilot request: ' + d.company)}&body=${encodeURIComponent(body)}`;
});
