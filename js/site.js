// BuildBin site — interactions
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
  initBays(); initSlope(); initPlan(); initHouse(); initCalc();
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
let current = 'timber';
document.getElementById('roofBtn')?.addEventListener('click', (e) => {
  if (!viewer) return;
  const up = viewer.setRoof(!viewer.isRoofUp());
  e.currentTarget.textContent = up ? 'Put the roof back' : 'Lift the roof off';
});
document.getElementById('podBtn')?.addEventListener('click', () => {
  if (!viewer) return;
  viewer.liftPod(current);
  const rb = document.getElementById('roofBtn'); if (rb) rb.textContent = 'Put the roof back';
});
function pick(id, from3d) {
  current = id;
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
    $('#skipsCap').textContent = `That's about ${words[n] || n} 6 m³ skips of mixed waste, or ${fmt(lifts, 1)} BuildBin change-overs, already sorted.`;
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
  };
  f.addEventListener('input', upd); upd();
}

// ---------- pilot form → email ----------
const TO = 'toby@recycle.au';
$('#pilotForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const body = `Name: ${d.name}\nCompany: ${d.company}\nEmail: ${d.email}\nPhone: ${d.phone || ''}\nHomes a year: ${d.homes}\nWhere we build: ${d.region || ''}\n\n${d.message || ''}`;
  location.href = `mailto:${TO}?subject=${encodeURIComponent('BuildBin pilot request: ' + d.company)}&body=${encodeURIComponent(body)}`;
});
