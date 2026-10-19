// BuildBin fabricator spec: configurable pod layout -> drawings, schedule, BOM
const MOD = 622, NMOD = 10, L = 6300, W = 2450, WALL = 40, RAIL = 220, SIDE_W = 1165;
const GAP = 35, PW = 20, PTOP = 120, SILL = 1000, MAXM = 6;
const PRESETS = {
  default: { A: [['general', 4], ['plastic', 2], ['eps', 1], ['card', 3]], B: [['timber', 6], ['rubble', 1], ['steel', 1], ['plaster', 2]] },
  brick:   { A: [['general', 4], ['plastic', 2], ['eps', 1], ['card', 3]], B: [['timber', 5], ['rubble', 2], ['steel', 1], ['plaster', 2]] },
  plaster: { A: [['general', 4], ['plastic', 2], ['eps', 1], ['card', 3]], B: [['timber', 5], ['rubble', 1], ['steel', 1], ['plaster', 3]] },
};
const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('en-AU');
const m3 = (n) => n.toFixed(2);
let S = {}; let state;

const geo = (H) => { const IH = H - WALL, PH = IH - PTOP; return { H, IH, PH, flapTop: WALL + PH - 80, roofTop: RAIL + H + 50 }; };
function pod(n, H) {
  const g = geo(H), ex = [n * MOD - 2 * GAP, SIDE_W - 2 * GAP, g.PH], inn = [ex[0] - 2 * PW, ex[1] - 2 * PW, ex[2] - PW];
  return { ex, inn, net: inn[0] * inn[1] * inn[2] / 1e9, gross: n * MOD * SIDE_W * g.IH / 1e9, len: n * MOD };
}

// ---------- state <-> URL ----------
function clone(p) { return { A: p.A.map((x) => [...x]), B: p.B.map((x) => [...x]) }; }
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const st = { H: +q.get('h') === 2400 ? 2400 : 2200, swl: [1000, 1500, 2000].includes(+q.get('swl')) ? +q.get('swl') : 1500, sides: clone(PRESETS.default) };
  if (q.get('A') && q.get('B')) {
    const parse = (v) => v.split(',').map((t) => t.split('.')).map(([id, n]) => [id, Math.max(1, Math.min(MAXM, +n || 1))]);
    const sides = { A: parse(q.get('A')), B: parse(q.get('B')) };
    const ids = [...sides.A, ...sides.B].map((x) => x[0]).sort().join();
    const ok = ids === Object.keys(S).sort().join() && ['A', 'B'].every((k) => sides[k].reduce((a, x) => a + x[1], 0) <= NMOD);
    if (ok) st.sides = sides;
  }
  return st;
}
function writeHash() {
  const enc = (a) => a.map(([id, n]) => `${id}.${n}`).join(',');
  history.replaceState(null, '', `#h=${state.H}&swl=${state.swl}&A=${enc(state.sides.A)}&B=${enc(state.sides.B)}`);
}
const used = (side) => state.sides[side].reduce((a, x) => a + x[1], 0);

// ---------- configurator ----------
function renderCfg() {
  const box = $('#cfg'); box.innerHTML = '';
  for (const side of ['A', 'B']) {
    const free = NMOD - used(side);
    const col = document.createElement('div'); col.className = 'cfg-side';
    col.innerHTML = `<h3>Side ${side} <span class="${free ? 'warn' : 'ok'}">${used(side)} of 10 modules${free ? ` · ${free} free` : ''}</span></h3>`;
    const strip = document.createElement('div'); strip.className = 'strip'; strip.setAttribute('aria-hidden', 'true');
    strip.innerHTML = state.sides[side].map(([id, n]) => `<i style="flex:${n};--n:${n}"><b>${String(S[id].n).padStart(2, '0')}</b></i>`).join('') + (free ? `<i class="free" style="flex:${free}"></i>` : '');
    col.appendChild(strip);
    state.sides[side].forEach(([id, n], i) => {
      const s = S[id], other = side === 'A' ? 'B' : 'A', p = pod(n, state.H);
      const row = document.createElement('div'); row.className = 'pod-row';
      row.innerHTML = `<span class="num">${String(s.n).padStart(2, '0')}</span><span class="nm">${s.name}<small>${n} module${n > 1 ? 's' : ''} · ${fmt(p.len)} mm · ${m3(p.net)} m³</small></span>
        <span class="ctl">
          <button type="button" data-a="left" ${i === 0 ? 'disabled' : ''} aria-label="Move ${s.name} toward the rear">◀</button>
          <button type="button" data-a="right" ${i === state.sides[side].length - 1 ? 'disabled' : ''} aria-label="Move ${s.name} toward the hook end">▶</button>
          <button type="button" data-a="swap" ${NMOD - used(other) < n || state.sides[side].length < 2 ? 'disabled' : ''} aria-label="Move ${s.name} to side ${other}">→${other}</button>
          <button type="button" data-a="minus" ${n <= 1 ? 'disabled' : ''} aria-label="Shrink ${s.name} by one module">−</button>
          <b>${n}</b>
          <button type="button" data-a="plus" ${n >= MAXM || free < 1 ? 'disabled' : ''} aria-label="Grow ${s.name} by one module">+</button>
        </span>`;
      row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => act(side, i, b.dataset.a)));
      col.appendChild(row);
    });
    box.appendChild(col);
  }
}
function act(side, i, a) {
  const arr = state.sides[side], other = side === 'A' ? 'B' : 'A';
  if (a === 'minus') arr[i][1]--;
  if (a === 'plus') arr[i][1]++;
  if (a === 'left') [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
  if (a === 'right') [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
  if (a === 'swap') state.sides[other].push(arr.splice(i, 1)[0]);
  document.querySelectorAll('[data-preset]').forEach((b) => b.classList.remove('is-on'));
  update();
}

// ---------- SVG helpers ----------
const NS = 'http://www.w3.org/2000/svg';
function el(parent, tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  parent.appendChild(e); return e;
}
function sheet(id, x0, y0, w, h) {
  const svg = $(id); svg.innerHTML = '';
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  const defs = el(svg, 'defs');
  const mk = el(defs, 'marker', { id: id.slice(1) + 'ar', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  el(mk, 'path', { d: 'M0,1 L10,5 L0,9 z', fill: '#0E1114' });
  const hp = el(defs, 'pattern', { id: id.slice(1) + 'hx', width: 60, height: 60, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  el(hp, 'line', { x1: 0, y1: 0, x2: 0, y2: 60, stroke: '#9aa3ab', 'stroke-width': 8 });
  svg.style.setProperty('--k', { '#dSection': 1.35, '#dPod': 1.25 }[id] || 1);
  svg._ar = `url(#${id.slice(1)}ar)`; svg._hx = `url(#${id.slice(1)}hx)`;
  return svg;
}
function rect(p, x, y, w, h, cls) { return el(p, 'rect', { x, y, width: w, height: h, class: cls }); }
function line(p, x1, y1, x2, y2, cls) { return el(p, 'line', { x1, y1, x2, y2, class: cls }); }
function txt(p, x, y, s, cls, anchor = 'middle') { return el(p, 'text', { x, y, class: cls, 'text-anchor': anchor }, s); }
// dimension: horizontal (dir 'h') between x1..x2 at y; vertical between y1..y2 at x
function dimH(svg, x1, x2, y, label, ext0, small) {
  const g = el(svg, 'g', { class: 'dim' + (small ? ' sm' : '') });
  if (ext0 != null) { line(g, x1, ext0, x1, y + (y > ext0 ? 40 : -40), 'ext'); line(g, x2, ext0, x2, y + (y > ext0 ? 40 : -40), 'ext'); }
  el(g, 'line', { x1, y1: y, x2, y2: y, 'marker-start': svg._ar, 'marker-end': svg._ar });
  txt(g, (x1 + x2) / 2, y - 22, label);
}
function dimV(svg, y1, y2, x, label, ext0, small) {
  const g = el(svg, 'g', { class: 'dim' + (small ? ' sm' : '') });
  if (ext0 != null) { line(g, ext0, y1, x + (x > ext0 ? 40 : -40), y1, 'ext'); line(g, ext0, y2, x + (x > ext0 ? 40 : -40), y2, 'ext'); }
  el(g, 'line', { x1: x, y1, x2: x, y2, 'marker-start': svg._ar, 'marker-end': svg._ar });
  const t = txt(g, x - 22, (y1 + y2) / 2, label); t.setAttribute('transform', `rotate(-90 ${x - 22} ${(y1 + y2) / 2})`);
}
// pods on a side as [{id,n,start}] in module units from the rear end
function placed(side) { let k = 0; return state.sides[side].map(([id, n]) => { const o = { id, n, start: k }; k += n; return o; }); }
const nn = (id) => String(S[id].n).padStart(2, '0');

// ---------- GA-01 plan ----------
function drawPlan() {
  const svg = sheet('#dPlan', -700, -760, L + 1500, W + 1520);
  rect(svg, 0, 0, L, W, 'body');
  rect(svg, WALL, WALL, L - 2 * WALL, SIDE_W, 'void'); rect(svg, WALL, W - WALL - SIDE_W, L - 2 * WALL, SIDE_W, 'void');
  const sideY = { A: WALL, B: WALL * 2 + SIDE_W };
  for (const side of ['A', 'B']) {
    const y0 = sideY[side];
    for (let k = 0; k <= NMOD; k++) line(svg, WALL + k * MOD, side === 'A' ? 0 : W - WALL, WALL + k * MOD, side === 'A' ? WALL : W, 'post');
    const used_ = used(side);
    if (used_ < NMOD) rect(svg, WALL + used_ * MOD, y0, (NMOD - used_) * MOD, SIDE_W, 'free').setAttribute('fill', svg._hx);
    for (const p of placed(side)) {
      const x = WALL + p.start * MOD, d = pod(p.n, state.H);
      rect(svg, x + GAP, y0 + GAP, d.ex[0], d.ex[1], 'pod');
      rect(svg, x + GAP + PW, y0 + GAP + PW, d.inn[0], d.inn[1], 'podin');
      // flaps on the outer face, one per module
      for (let f = 0; f < p.n; f++) { const fx = x + f * MOD; const fy = side === 'A' ? y0 + GAP : y0 + GAP + d.ex[1]; line(svg, fx + 60, fy, fx + MOD - 60, fy, 'flap'); }
      const cx = x + p.n * MOD / 2, cy = y0 + SIDE_W / 2;
      txt(svg, cx, cy + 40, nn(p.id), 'bayno');
      txt(svg, cx, cy + 190, p.n > 1 ? S[p.id].name : S[p.id].short, 'bayname');
      txt(svg, cx, cy + 320, `${p.n} × 622`, 'baysub');
    }
    // pod length chain
    const yy = side === 'A' ? -170 : W + 170;
    for (const p of placed(side)) dimH(svg, WALL + p.start * MOD, WALL + (p.start + p.n) * MOD, yy, fmt(p.n * MOD), side === 'A' ? 0 : W, true);
    if (used_ < NMOD) dimH(svg, WALL + used_ * MOD, L - WALL, yy, `${fmt((NMOD - used_) * MOD)} free`, side === 'A' ? 0 : W, true);
    txt(svg, -90, y0 + SIDE_W / 2 + 40, side, 'sidelbl');
  }
  line(svg, WALL, WALL + SIDE_W + WALL / 2, L - WALL, WALL + SIDE_W + WALL / 2, 'spine');
  dimH(svg, 0, L, -480, '6,300 overall body', 0);
  dimH(svg, WALL, L - WALL, W + 470, '6,220 internal = 10 × 622 modules', W);
  dimV(svg, 0, W, L + 380, '2,450', L);
  dimV(svg, WALL, WALL + SIDE_W, L + 190, '1,165', L, true);
  dimV(svg, W - WALL - SIDE_W, W - WALL, L + 190, '1,165', L, true);
  txt(svg, L + 420, -620, 'HOOK END →', 'note', 'end');
  txt(svg, -600, -620, '← REAR', 'note', 'start');
}

// ---------- GA-02/03 side elevations ----------
function drawSide(side) {
  const g = geo(state.H), id = side === 'A' ? '#dSideA' : '#dSideB';
  const top = RAIL + g.H;
  const svg = sheet(id, -800, -(g.roofTop + 520), L + 1700, g.roofTop + 1150);
  // viewer at side A sees the hook end on the left: mirror x
  const X = side === 'A' ? (x) => L - x : (x) => x;
  const Y = (z) => -z;
  const hx = X(L), hookDir = side === 'A' ? -1 : 1;
  line(svg, -700, 0, L + 800, 0, 'ground');
  rect(svg, Math.min(X(100), X(L - 100)), Y(RAIL), L - 200, RAIL, 'chassis');
  el(svg, 'circle', { cx: X(250), cy: Y(120), r: 120, class: 'chassis' });
  // hook frame (to suit fleet)
  el(svg, 'path', { d: `M${hx} ${Y(RAIL)} L${hx + hookDir * 180} ${Y(RAIL)} L${hx + hookDir * 180} ${Y(top + 120)} L${hx} ${Y(top - 300)}`, class: 'hook' });
  el(svg, 'circle', { cx: hx + hookDir * 180, cy: Y(top + 220), r: 90, class: 'hook' });
  txt(svg, hx + hookDir * 260, Y(top + 380), 'HOOK TO SUIT FLEET', 'note', side === 'A' ? 'start' : 'end');
  // body
  rect(svg, 0, Y(top), L, g.H, 'body');
  rect(svg, 0, Y(RAIL + SILL), L, SILL, 'lower');
  rect(svg, 0, Y(top), L, 90, 'band');
  rect(svg, -20, Y(g.roofTop), L + 40, 50, 'roof');
  rect(svg, -20, Y(g.roofTop + 30), L + 40, 30, 'band');
  for (const ex of [350, L - 350]) el(svg, 'circle', { cx: X(ex), cy: Y(g.roofTop + 90), r: 55, class: 'eye' });
  // module posts and flaps
  const flapBot = RAIL + SILL + 15, flapTop = RAIL + g.flapTop;
  const used_ = used(side);
  for (let k = 0; k <= NMOD; k++) { const x = X(WALL + k * MOD); line(svg, x, Y(RAIL + SILL), x, Y(top - 90), 'post'); }
  for (let k = 0; k < NMOD; k++) {
    const x1 = X(WALL + k * MOD + 45), x2 = X(WALL + (k + 1) * MOD - 45);
    if (k < used_) rect(svg, Math.min(x1, x2), Y(flapTop), Math.abs(x2 - x1), flapTop - flapBot, 'flapleaf');
    else rect(svg, Math.min(x1, x2), Y(flapTop), Math.abs(x2 - x1), flapTop - flapBot, 'free').setAttribute('fill', svg._hx);
  }
  for (const p of placed(side)) {
    const xl = X(WALL + p.start * MOD + (side === 'A' ? p.n * MOD : 0)) + 110;
    txt(svg, xl, Y(RAIL + 470), nn(p.id), 'elno', 'start');
    txt(svg, xl, Y(RAIL + 260), (p.n > 1 ? S[p.id].name : S[p.id].short).toUpperCase(), 'elname', 'start');
  }
  if (side === 'B') { txt(svg, -60, Y(RAIL + 800), 'BUILDBIN', 'note', 'end'); }
  // dims
  for (const p of placed(side)) { const a = X(WALL + p.start * MOD), b = X(WALL + (p.start + p.n) * MOD); dimH(svg, Math.min(a, b), Math.max(a, b), 200, fmt(p.n * MOD), 0, true); }
  dimH(svg, 0, L, 430, '6,300', 0);
  const rx = side === 'A' ? -330 : L + 330, rx2 = side === 'A' ? -600 : L + 600, ext = side === 'A' ? 0 : L;
  dimV(svg, Y(RAIL + SILL), 0, rx, fmt(RAIL + SILL), ext, true);
  dimV(svg, Y(flapTop), Y(RAIL + SILL), rx, fmt(flapTop - RAIL - SILL), ext, true);
  dimV(svg, Y(g.roofTop), 0, rx2, fmt(g.roofTop), ext);
}

// ---------- GA-04 section ----------
function drawSection() {
  const g = geo(state.H), top = RAIL + g.H;
  const svg = sheet('#dSection', -900, -(g.roofTop + 420), W + 1800, g.roofTop + 900);
  const Y = (z) => -z;
  line(svg, -800, 0, W + 800, 0, 'ground');
  for (const y of [W / 2 - 550 - 70, W / 2 + 550 - 70]) rect(svg, y, Y(RAIL), 140, RAIL, 'chassis');
  rect(svg, 0, Y(RAIL + WALL), W, WALL, 'body');
  rect(svg, 0, Y(RAIL + SILL), WALL, SILL, 'body'); rect(svg, W - WALL, Y(RAIL + SILL), WALL, SILL, 'body');
  rect(svg, 0, Y(top), WALL, g.H - SILL, 'frame'); rect(svg, W - WALL, Y(top), WALL, g.H - SILL, 'frame');
  rect(svg, WALL + SIDE_W, Y(top), WALL, g.H, 'body');
  rect(svg, -20, Y(g.roofTop), W + 40, 50, 'roof');
  for (const ey of [300, W - 300]) el(svg, 'circle', { cx: ey, cy: Y(g.roofTop + 90), r: 55, class: 'eye' });
  for (const [x0, outer] of [[WALL, 0], [WALL * 2 + SIDE_W, W]]) {
    const px = x0 + GAP, pz = RAIL + WALL;
    rect(svg, px, Y(pz + g.PH), SIDE_W - 2 * GAP, g.PH, 'pod');
    rect(svg, px + PW, Y(pz + g.PH), SIDE_W - 2 * GAP - 2 * PW, g.PH - PW, 'podin');
    // flap on the pod front (outer side)
    const fx = outer === 0 ? px - 12 : px + SIDE_W - 2 * GAP + 2;
    rect(svg, fx, Y(RAIL + g.flapTop), 10, g.flapTop - SILL - 15, 'flapleaf');
  }
  dimH(svg, 0, W, 300, '2,450', 0);
  dimH(svg, WALL, WALL + SIDE_W, 140, '1,165', 0, true);
  dimH(svg, WALL * 2 + SIDE_W + GAP, W - WALL - GAP, 140, fmt(SIDE_W - 2 * GAP) + ' pod', 0, true);
  dimV(svg, Y(RAIL + WALL + g.PH), Y(RAIL + WALL), -250, fmt(g.PH) + ' pod', 0, true);
  dimV(svg, Y(top), Y(RAIL + WALL), -520, fmt(g.IH) + ' internal', 0, true);
  dimV(svg, Y(g.roofTop), 0, -790, fmt(g.roofTop), 0);
  dimV(svg, Y(RAIL + SILL), 0, W + 260, fmt(RAIL + SILL) + ' sill', W, true);
  txt(svg, W / 2, Y(g.roofTop + 260), 'ROOF LIFTS OFF', 'note');
  txt(svg, WALL + SIDE_W / 2, Y(RAIL + g.H / 2), 'A', 'sidelbl'); txt(svg, W - WALL - SIDE_W / 2, Y(RAIL + g.H / 2), 'B', 'sidelbl');
}

// ---------- GA-05 typical pod (largest in layout) ----------
function drawPod() {
  const all = [...placed('A'), ...placed('B')].sort((a, b) => b.n - a.n);
  const p = all[0], d = pod(p.n, state.H), g = geo(state.H);
  const [PL, PWd, PH] = d.ex;
  const svg = sheet('#dPod', -600, -(PH + 520), PL + PWd + 1500, PH + 1000);
  const Y = (z) => -z;
  // front elevation
  rect(svg, 0, Y(PH), PL, PH, 'pod');
  const sillZ = SILL - WALL;
  for (let k = 0; k < p.n; k++) rect(svg, k * MOD + 30, Y(g.flapTop - WALL), MOD - 130, g.flapTop - WALL - sillZ, 'flapleaf');
  for (const lx of [0, PL - 80]) rect(svg, lx, Y(PH + 60), 80, 60, 'eye');
  const pc = Math.max(350, Math.min(1100, PL * 0.5));
  for (const fx of [PL / 2 - pc / 2 - 100, PL / 2 + pc / 2 - 100]) rect(svg, fx, Y(90), 200, 90, 'void');
  dimH(svg, 0, PL, 250, fmt(PL), 0);
  dimV(svg, Y(PH), 0, -260, fmt(PH), 0);
  dimV(svg, Y(sillZ), 0, PL + 200, fmt(sillZ) + ' sill', PL, true);
  txt(svg, PL / 2, Y(PH + 260), `FRONT · ${p.n}-MODULE POD`, 'note');
  // end elevation
  const ox = PL + 700;
  rect(svg, ox, Y(PH), PWd, PH, 'pod');
  rect(svg, ox - 12, Y(g.flapTop - WALL), 10, g.flapTop - WALL - sillZ, 'flapleaf');
  rect(svg, ox + PWd / 2 - 300, Y(90), 600, 90, 'void');
  dimH(svg, ox, ox + PWd, 250, fmt(PWd), 0);
  txt(svg, ox + PWd / 2, Y(PH + 260), 'END', 'note');
  $('#podCap').textContent = `${p.n}-module pod shown. Lugs at four top corners, forklift pockets under.`;
}

// ---------- schedule, totals, BOM, dims ----------
function schedule() {
  const rows = [];
  let net = 0, gross = 0, load = 0, mods = 0, pods = 0;
  for (const side of ['A', 'B']) for (const p of placed(side)) {
    const s = S[p.id], d = pod(p.n, state.H), full = d.net * s.density;
    const area = d.inn[0] * d.inn[1] / 1e6, over = full > state.swl;
    const fill = over ? Math.floor(state.swl / (s.density * area) * 100) * 10 : null;
    net += d.net; gross += d.gross; load += over ? state.swl : full; mods += p.n; pods++;
    rows.push(`<tr${over ? ' class="over"' : ''}><td class="n">${nn(p.id)}</td><td>${s.name}</td><td>${side}</td><td>${p.n}</td><td>${fmt(d.len)}</td><td>${d.ex.map(fmt).join(' × ')}</td><td>${d.inn.map(fmt).join(' × ')}</td><td>${m3(d.net)}</td><td>${m3(d.gross)}</td><td>${p.n}</td><td>${fmt(s.density)}</td><td>${fmt(full)}</td><td>${fill ? `${fmt(fill)} mm` : 'To top'}</td></tr>`);
  }
  $('#sched').innerHTML = `<thead><tr><th>Bay</th><th>Stream</th><th>Side</th><th>Modules</th><th>Bay length</th><th>Pod external L × W × H</th><th>Pod internal L × W × H</th><th>Pod net m³</th><th>Gross bay m³</th><th>Flaps</th><th>Loose kg/m³</th><th>Full load kg</th><th>Fill line</th></tr></thead><tbody>${rows.join('')}</tbody>
  <tfoot><tr><td colspan="3">Station</td><td>${mods}</td><td></td><td></td><td></td><td>${m3(net)}</td><td>${m3(gross)}</td><td>${mods}</td><td></td><td>${fmt(load)}</td><td></td></tr></tfoot>`;
  const g = geo(state.H), freeA = NMOD - used('A'), freeB = NMOD - used('B');
  $('#totals').innerHTML = `<div><b>${m3(net)} m³</b><span>usable in ${pods} pods</span></div><div><b>${m3(gross)} m³</b><span>gross bay space</span></div><div><b>${fmt(load)} kg</b><span>indicative contents, all pods full</span></div><div><b>${fmt(g.roofTop)} mm</b><span>ground to roof</span></div><p class="cfgline">Body height ${fmt(g.H)} mm · pod rated load ${fmt(state.swl)} kg · Side A: ${state.sides.A.map(([id, n]) => `${nn(id)} ${S[id].short} ×${n}`).join(', ')} · Side B: ${state.sides.B.map(([id, n]) => `${nn(id)} ${S[id].short} ×${n}`).join(', ')}</p>` +
    (freeA + freeB ? `<p class="warn">${freeA + freeB} module${freeA + freeB > 1 ? 's are' : ' is'} unused. Give ${freeA + freeB > 1 ? 'them' : 'it'} to a pod or the station carries empty space.</p>` : '');
  $('#dimList').innerHTML = [
    ['Design basis', `Body 6,300 long × 2,450 wide × ${fmt(g.H)} high, on 220 chassis rails.`],
    ['Design basis', `Ground to top of body ${fmt(RAIL + g.H)}; to top of roof ${fmt(g.roofTop)}, plus lifting eyes.`],
    ['Design basis', `Internal: two sides of 6,220 × 1,165 × ${fmt(g.IH)}, split by a 40 spine wall. Gross ${m3(2 * 6.22 * 1.165 * g.IH / 1000)} m³.`],
    ['Design basis', `Loading sill 1,220 above the ground. Flap opening about ${fmt(g.flapTop - SILL)} high.`],
    ['To confirm', 'Length over the hook frame, hook height and loaded travel height on the operator\'s trucks.'],
  ].map(([t, s]) => `<li><span class="st ${t === 'To confirm' ? 'st-t' : 'st-b'}">${t}</span>${s}</li>`).join('');
  const bom = [
    ['Body and chassis with hook A-frame, rails and rear rollers', 1, 'Hook interface to suit fleet'],
    ['Side frame posts at module lines', 22, '11 per side'],
    ['Lift-off roof, one piece', 1, 'With seal, 4 locating cones, 4 latches'],
    ['Roof lifting eyes', 4, 'Rated, proof tested'],
    ['Pods', pods, placed('A').concat(placed('B')).map((p) => `${p.n}-module`).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}), true],
    ['Pod lifting lugs', pods * 4, '4 per pod'],
    ['Pod forklift pocket pairs', pods, '1 pair per pod'],
    ['Loading flaps (on pods)', mods, '1 per module in use'],
    ['Flap hold-open stays or gas struts', mods, '1 per flap'],
    ['Electric flap latches', mods, '1 per module, on the sill rail'],
    ['Bluetooth lock controller, battery and override', 1, 'In a lockable box at the hook end'],
    ['Bay number and stream name plates', pods, 'Movable, clip to sill rail'],
  ];
  $('#bom').innerHTML = `<thead><tr><th>Component</th><th>Qty</th><th>Note</th></tr></thead><tbody>${bom.map(([a, q, n, isMap]) => `<tr><td>${a}</td><td class="n">${q}</td><td>${isMap ? Object.entries(n).sort().map(([k, v]) => `${v} × ${k}`).join(', ') : n}</td></tr>`).join('')}</tbody>`;
}

function update() {
  writeHash(); renderCfg(); drawPlan(); drawSide('A'); drawSide('B'); drawSection(); drawPod(); schedule();
}

fetch('data/model.json').then((r) => r.json()).then((m) => {
  const SHORT = { plastic: 'Plastics', timber: 'Timber', plaster: 'Plaster', card: 'Card', eps: 'EPS', rubble: 'Rubble', general: 'General', steel: 'Steel' };
  for (const s of m.streams) S[s.id] = { n: s.n, name: s.name, density: s.density, short: SHORT[s.id] || s.name };
  state = readHash();
  $('#hSel').value = state.H; $('#swlSel').value = state.swl;
  $('#hSel').addEventListener('change', (e) => { state.H = +e.target.value; update(); });
  $('#swlSel').addEventListener('change', (e) => { state.swl = +e.target.value; update(); });
  document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    state.sides = clone(PRESETS[b.dataset.preset]);
    document.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('is-on', x === b));
    update();
  }));
  update();
});
$('#printBtn').addEventListener('click', () => print());
$('#linkBtn').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText(location.href); e.target.textContent = 'Link copied'; }
  catch { e.target.textContent = 'Copy the address bar'; }
  setTimeout(() => { e.target.textContent = 'Copy link to this layout'; }, 2200);
});
document.querySelector('.menu')?.addEventListener('click', (e) => { const o = document.getElementById('nav').classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
