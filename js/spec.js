// BuildBin fabricator spec, Rev B: hook skid + 8 stand-alone bins -> drawings, schedule, BOM
const L = 6300, W = 2450, DECK = 100, RAIL_H = 100, RAIL_W = 50, CW = 50, REAR = 150, HOOKZ = 300;
const MOD = 585, NMOD = 10, PER_SIDE = 4, GAP = 20, T = 4, DEPTH = 1150, MAXM = 6;
const FT = 2000, BT = 1900, FB = 1200, PB = 300, PH = 100, FLOOR = 400;   // heights from the ground, bins on the skid
const X0 = REAR, HOOK_Z = 1450;
const IH_F = FT - T - (FLOOR + T), IH_B = BT - T - (FLOOR + T), IH = (IH_F + IH_B) / 2, ID = DEPTH - 2 * T;
const DOOR = { z0: FLOOR + 60, z1: BT - 100, w: DEPTH - 120 };
const PRESETS = {
  default: { A: [['general', 4], ['plastic', 2], ['eps', 1], ['card', 3]], B: [['timber', 6], ['rubble', 1], ['steel', 1], ['plaster', 2]] },
  brick:   { A: [['general', 4], ['plastic', 2], ['eps', 1], ['card', 3]], B: [['timber', 5], ['rubble', 2], ['steel', 1], ['plaster', 2]] },
  plaster: { A: [['general', 4], ['plastic', 2], ['eps', 1], ['card', 3]], B: [['timber', 5], ['rubble', 1], ['steel', 1], ['plaster', 3]] },
};
const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('en-AU');
const m3 = (n) => n.toFixed(2);
let S = {}; let state;

function bin(n) {
  const w = n * MOD - GAP, iw = w - 2 * T;
  const net = iw * ID * IH / 1e9;
  const hAvg = (FT + BT) / 2 - FLOOR, lid = w * Math.hypot(DEPTH, FT - BT);
  const area = (2 * w * hAvg + 2 * DEPTH * hAvg + w * DEPTH + lid) / 1e6;
  const tare = area * (T / 1000) * 7850 * 1.25;
  const pc = Math.max(300, Math.min(1000, w * 0.55));
  return { w, iw, net, tare, pc, flapW: w - 70, flapH: FT - 12 - FB };
}

// ---------- state <-> URL ----------
function clone(p) { return { A: p.A.map((x) => [...x]), B: p.B.map((x) => [...x]) }; }
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const st = { swl: [1000, 1500, 2000].includes(+q.get('swl')) ? +q.get('swl') : 1500, sides: clone(PRESETS.default) };
  if (q.get('A') && q.get('B')) {
    const parse = (v) => v.split(',').map((t) => t.split('.')).map(([id, n]) => [id, Math.max(1, Math.min(MAXM, +n || 1))]);
    const sides = { A: parse(q.get('A')), B: parse(q.get('B')) };
    const ids = [...sides.A, ...sides.B].map((x) => x[0]).sort().join();
    const ok = ids === Object.keys(S).sort().join() && ['A', 'B'].every((k) => sides[k].length === PER_SIDE && sides[k].reduce((a, x) => a + x[1], 0) <= NMOD);
    if (ok) st.sides = sides;
  }
  return st;
}
function writeHash() {
  const enc = (a) => a.map(([id, n]) => `${id}.${n}`).join(',');
  history.replaceState(null, '', `#swl=${state.swl}&A=${enc(state.sides.A)}&B=${enc(state.sides.B)}`);
}
const used = (side) => state.sides[side].reduce((a, x) => a + x[1], 0);

// ---------- configurator ----------
function renderCfg() {
  const box = $('#cfg'); box.innerHTML = '';
  for (const side of ['A', 'B']) {
    const free = NMOD - used(side), other = side === 'A' ? 'B' : 'A';
    const col = document.createElement('div'); col.className = 'cfg-side';
    col.innerHTML = `<h3>Side ${side} <span class="${free ? 'warn' : 'ok'}">${used(side)} of 10 modules${free ? ` · ${free} free` : ''}</span></h3>`;
    const strip = document.createElement('div'); strip.className = 'strip'; strip.setAttribute('aria-hidden', 'true');
    strip.innerHTML = state.sides[side].map(([id, n]) => `<i style="flex:${n};--n:${n}"><b>${String(S[id].n).padStart(2, '0')}</b></i>`).join('') + (free ? `<i class="free" style="flex:${free}"></i>` : '');
    col.appendChild(strip);
    state.sides[side].forEach(([id, n], i) => {
      const s = S[id], b = bin(n), opp = state.sides[other][i];
      const swapOk = used(side) - n + opp[1] <= NMOD && used(other) - opp[1] + n <= NMOD;
      const row = document.createElement('div'); row.className = 'pod-row';
      row.innerHTML = `<span class="num">${String(s.n).padStart(2, '0')}</span><span class="nm">${s.name}<small>${n} module${n > 1 ? 's' : ''} · ${fmt(b.w)} wide · ${m3(b.net)} m³</small></span>
        <span class="ctl">
          <button type="button" data-a="left" ${i === 0 ? 'disabled' : ''} aria-label="Move ${s.name} toward the rear">◀</button>
          <button type="button" data-a="right" ${i === PER_SIDE - 1 ? 'disabled' : ''} aria-label="Move ${s.name} toward the hook end">▶</button>
          <button type="button" data-a="swap" ${swapOk ? '' : 'disabled'} aria-label="Swap ${s.name} with ${S[opp[0]].name} on side ${other}">⇄</button>
          <button type="button" data-a="minus" ${n <= 1 ? 'disabled' : ''} aria-label="Shrink ${s.name} by one module">−</button>
          <b>${n}</b>
          <button type="button" data-a="plus" ${n >= MAXM || free < 1 ? 'disabled' : ''} aria-label="Grow ${s.name} by one module">+</button>
        </span>`;
      row.querySelectorAll('button').forEach((bt) => bt.addEventListener('click', () => act(side, i, bt.dataset.a)));
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
  if (a === 'swap') [arr[i], state.sides[other][i]] = [state.sides[other][i], arr[i]];
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
  svg.style.setProperty('--k', { '#dSection': 1.0, '#dPod': 1.05 }[id] || 1);
  svg._ar = `url(#${id.slice(1)}ar)`; svg._hx = `url(#${id.slice(1)}hx)`;
  return svg;
}
function rect(p, x, y, w, h, cls) { return el(p, 'rect', { x, y, width: w, height: h, class: cls }); }
function line(p, x1, y1, x2, y2, cls) { return el(p, 'line', { x1, y1, x2, y2, class: cls }); }
function poly(p, pts, cls) { return el(p, 'polygon', { points: pts.map((q) => q.join(',')).join(' '), class: cls }); }
function txt(p, x, y, s, cls, anchor = 'middle') { return el(p, 'text', { x, y, class: cls, 'text-anchor': anchor }, s); }
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
function placed(side) { let k = 0; return state.sides[side].map(([id, n]) => { const o = { id, n, start: k, x: X0 + k * MOD + GAP / 2, ...bin(n) }; k += n; return o; }); }
const nn = (id) => String(S[id].n).padStart(2, '0');

// ---------- GA-01 plan (lids off). Plan y: 0 = side A outer edge, W = side B outer edge ----------
function drawPlan() {
  const svg = sheet('#dPlan', -700, -760, L + 1500, W + 1520);
  rect(svg, 0, 0, L, W, 'body');
  rect(svg, X0, 0, NMOD * MOD, RAIL_W, 'band'); rect(svg, X0, W - RAIL_W, NMOD * MOD, RAIL_W, 'band');
  rect(svg, X0, W / 2 - CW / 2, NMOD * MOD, CW, 'chassis');
  rect(svg, X0 - 50, 0, 50, W, 'chassis');
  for (const y of [W / 2 - 750 - 110, W / 2 + 750 - 110]) rect(svg, 10, y, 140, 220, 'chassis');
  // hook frame
  rect(svg, L - 190, W / 2 - 80, 140, 160, 'chassis'); rect(svg, L - 180, 50, 60, W - 100, 'chassis');
  for (const [ly, lbl] of [[110, 'LIGHT'], [W - 110, 'LIGHT']]) { el(svg, 'circle', { cx: L - 210, cy: ly, r: 60, class: 'lampdot' }); txt(svg, L - 300, ly + 20, lbl, 'tiny', 'end'); }
  el(svg, 'circle', { cx: 50, cy: W / 2, r: 60, class: 'lampdot' });
  const yRow = { A: [RAIL_W, RAIL_W + DEPTH], B: [W - RAIL_W - DEPTH, W - RAIL_W] };
  for (const side of ['A', 'B']) {
    const [y0, y1] = yRow[side], used_ = used(side);
    if (used_ < NMOD) rect(svg, X0 + used_ * MOD, y0, (NMOD - used_) * MOD, DEPTH, 'free').setAttribute('fill', svg._hx);
    for (const p of placed(side)) {
      rect(svg, p.x, y0, p.w, DEPTH, 'pod');
      rect(svg, p.x + 40, y0 + 40, p.w - 80, DEPTH - 80, 'podin');
      const fy = side === 'A' ? y0 : y1;
      line(svg, p.x + 35, fy, p.x + p.w - 35, fy, 'flap');                       // drop-down flap on the outer face
      const dx = side === 'A' ? p.x + p.w : p.x;                                  // trap door: right-hand side as you face the flap
      line(svg, dx, y0 + 60, dx, y1 - 60, 'door');
      for (const k of [-1, 1]) rect(svg, p.x + p.w / 2 + k * p.pc / 2 - 100, y0 + 30, 200, DEPTH - 60, 'pockethid');
      const cx = p.x + p.w / 2, cy = (y0 + y1) / 2;
      txt(svg, cx, cy + 40, nn(p.id), 'bayno');
      txt(svg, cx, cy + 190, p.n > 1 ? S[p.id].name : S[p.id].short, 'bayname');
      txt(svg, cx, cy + 320, `${p.n} × 585`, 'baysub');
    }
    const yy = side === 'A' ? -170 : W + 170;
    for (const p of placed(side)) dimH(svg, p.x, p.x + p.w, yy, fmt(p.w), side === 'A' ? 0 : W, true);
    txt(svg, -90, (y0 + y1) / 2 + 40, side, 'sidelbl');
  }
  dimH(svg, 0, L, -480, '6,300 overall', 0);
  dimH(svg, X0, X0 + NMOD * MOD, W + 470, '5,850 bin zone = 10 × 585 modules', W);
  dimH(svg, 0, X0, W + 470, '150', W, true);
  dimH(svg, L - HOOKZ, L, W + 470, '300 hook', W, true);
  dimV(svg, 0, W, L + 380, '2,450', L);
  dimV(svg, RAIL_W, RAIL_W + DEPTH, L + 190, '1,150', L, true);
  dimV(svg, W - RAIL_W - DEPTH, W - RAIL_W, L + 190, '1,150', L, true);
  txt(svg, L + 420, -620, 'HOOK END →', 'note', 'end');
  txt(svg, -600, -620, '← REAR', 'note', 'start');
  txt(svg, L / 2, W / 2 + 30, 'CENTRE RAIL · DRAIN', 'tiny');
}

// ---------- GA-02/03 side elevations ----------
function drawSide(side) {
  const id = side === 'A' ? '#dSideA' : '#dSideB';
  const svg = sheet(id, -1050, -(FT + 450), L + 2100, FT + 1100);
  const X = side === 'A' ? (x) => L - x : (x) => x;            // standing at side A the hook end is on your left
  const Y = (z) => -z, R = (x1, x2) => [Math.min(X(x1), X(x2)), Math.abs(X(x2) - X(x1))];
  line(svg, -700, 0, L + 800, 0, 'ground');
  let [a, w] = R(0, L); rect(svg, a, Y(DECK), w, DECK, 'chassis');
  [a, w] = R(X0, X0 + NMOD * MOD); rect(svg, a, Y(DECK + RAIL_H), w, RAIL_H, 'band');
  el(svg, 'circle', { cx: X(75), cy: Y(70), r: 70, class: 'chassis' });
  // hook frame, lights, controller, siren
  [a, w] = R(L - 190, L - 50); rect(svg, a, Y(DECK + HOOK_Z), w, HOOK_Z, 'chassis');
  el(svg, 'circle', { cx: X(L - 120), cy: Y(DECK + HOOK_Z + 100), r: 100, class: 'hook' });
  [a, w] = R(L - 260, L - 150); rect(svg, a, Y(DECK + HOOK_Z + 110), w, 100, 'lamp');
  [a, w] = R(L - 50, L + 90); rect(svg, a, Y(DECK + 1120), w, 340, 'ctrl');
  [a, w] = R(20, 80); rect(svg, a, Y(1850), w, 1850 - DECK, 'chassis');
  [a, w] = R(0, 100); rect(svg, a, Y(1910), w, 100, 'lamp');
  txt(svg, X(50), Y(2010), 'LIGHT', 'tiny');
  for (const p of placed(side)) {
    [a, w] = R(p.x, p.x + p.w);
    rect(svg, a, Y(FT), w, FT - DECK, 'body');                                 // bin outline (front face)
    for (const k of [-1, 1]) { const [pa, pw] = R(p.x + p.w / 2 + k * p.pc / 2 - 100, p.x + p.w / 2 + k * p.pc / 2 + 100); rect(svg, pa, Y(PB + PH), pw, PH, 'pocket'); }
    const [sa, sw] = R(p.x + 40, p.x + p.w - 40);
    rect(svg, sa, Y(FB - 35), sw, FB - 35 - FLOOR - 30, 'sign');
    rect(svg, sa, Y(FB - 35), sw, 210, 'band');
    txt(svg, sa + 50, Y(FB - 210), nn(p.id), 'signno', 'start');
    txt(svg, sa + 50, Y(FB - 360), p.n > 1 ? S[p.id].name.toUpperCase() : S[p.id].short.toUpperCase(), p.n > 1 ? 'signname' : 'signname sm', 'start');
    for (let r = 0; r < 3; r++) rect(svg, sa + 50, Y(FB - 480 - r * 100), Math.min(sw * 0.38, 500), 26, 'listbar');
    if (p.n > 1) for (let r = 0; r < 2; r++) rect(svg, sa + sw / 2 + 30, Y(FB - 480 - r * 100), Math.min(sw * 0.3, 400), 26, 'listbar no');
    const [fa, fw] = R(p.x + 35, p.x + p.w - 35);
    rect(svg, fa, Y(FT - 12), fw, p.flapH, 'flapleaf');
    txt(svg, X(p.x + p.w / 2), Y(FB + 330), nn(p.id), 'flapno');
    el(svg, 'circle', { cx: X(p.x + p.w / 2), cy: Y(FT - 40), r: 22, class: 'lockdot' });
  }
  // dims
  for (const p of placed(side)) { const [da, dw] = R(p.x, p.x + p.w); dimH(svg, da, da + dw, 200, fmt(p.w), 0, true); }
  dimH(svg, 0, L, 430, '6,300', 0);
  const sg = side === 'A' ? -1 : 1, ext = side === 'A' ? 0 : L, rx = (d) => (side === 'A' ? 0 : L) + sg * d;
  dimV(svg, Y(PB), 0, rx(300), '300', ext, true);
  dimV(svg, Y(FB), Y(PB), rx(300), '900', ext, true);
  dimV(svg, Y(FT), Y(FB), rx(300), '800 flap', ext, true);
  dimV(svg, Y(FB), 0, rx(560), '1,200', ext, true);
  dimV(svg, Y(FT), 0, rx(800), '2,000 max', ext);
}

// ---------- GA-04 section across the skid ----------
function drawSection() {
  const svg = sheet('#dSection', -1000, -(FT + 480), W + 2000, FT + 1080);
  const Y = (z) => -z;
  line(svg, -900, 0, W + 900, 0, 'ground');
  rect(svg, 0, Y(DECK), W, DECK, 'chassis');
  rect(svg, 0, Y(DECK + RAIL_H), RAIL_W, RAIL_H, 'band'); rect(svg, W - RAIL_W, Y(DECK + RAIL_H), RAIL_W, RAIL_H, 'band');
  rect(svg, W / 2 - CW / 2, Y(DECK + RAIL_H), CW, RAIL_H, 'chassis');
  for (const [yf, yb, dir] of [[RAIL_W, RAIL_W + DEPTH, -1], [W - RAIL_W, W - RAIL_W - DEPTH, 1]]) {
    const ya = Math.min(yf, yb), yz = Math.max(yf, yb);
    poly(svg, [[yf, Y(DECK)], [yf, Y(FT)], [yb, Y(BT)], [yb, Y(DECK)]], 'body');
    rect(svg, ya + 40, Y(PB + PH), DEPTH - 80, PH, 'pocket');
    rect(svg, ya, Y(FLOOR + T), DEPTH, T + 6, 'chassis');
    poly(svg, [[yf, Y(FT)], [yb, Y(BT)], [yb + (yb > yf ? 30 : -30), Y(BT - 3)], [yb, Y(BT - 14)], [yf, Y(FT - 14)]], 'lidline');
    // flap closed, and dashed at 90 degrees as a ledge
    rect(svg, yf + (dir < 0 ? -12 : 2), Y(FT - 12), 10, FT - 12 - FB, 'flapleaf');
    line(svg, yf, Y(FB), yf + dir * (FT - 12 - FB), Y(FB), 'ledge');
    // trap door seen face-on in this section (shown dashed)
    rect(svg, ya + 60, Y(DOOR.z1), DEPTH - 120, DOOR.z1 - DOOR.z0, 'doorface');
    txt(svg, (ya + yz) / 2, Y((DOOR.z0 + DOOR.z1) / 2), 'TRAP DOOR', 'tiny');
  }
  txt(svg, W / 2, Y(BT + 160), 'FALLS TO CENTRE', 'tiny');
  dimH(svg, 0, W, 300, '2,450', 0);
  dimH(svg, RAIL_W, RAIL_W + DEPTH, 140, '1,150', 0, true);
  dimH(svg, W - RAIL_W - DEPTH, W - RAIL_W, 140, '1,150', 0, true);
  dimV(svg, Y(FLOOR), 0, -200, '400 floor', 0, true);
  dimV(svg, Y(FB), 0, -460, '1,200', 0, true);
  dimV(svg, Y(FT), 0, -720, '2,000', 0);
  dimV(svg, Y(BT), 0, W / 2 + 300, '1,900', W / 2, true);
  dimV(svg, Y(DECK + RAIL_H), Y(DECK), W + 200, '100 rail', W, true);
  dimV(svg, Y(PB), Y(DECK), W + 460, '200 to pocket', W, true);
  txt(svg, -60, Y(FB + 180), 'LEDGE', 'tiny', 'end');
  txt(svg, RAIL_W + DEPTH / 2, Y(FT + 220), 'A', 'sidelbl'); txt(svg, W - RAIL_W - DEPTH / 2, Y(FT + 220), 'B', 'sidelbl');
}

// ---------- GA-05 typical bin (largest in layout): front and right-hand side ----------
function drawPod() {
  const p = [...placed('A'), ...placed('B')].sort((a, b) => b.n - a.n)[0];
  const svg = sheet('#dPod', -950, -(FT + 520), p.w + DEPTH + 2050, FT + 1100);
  const Y = (z) => -z;            // heights from the bin base: subtract the deck
  const zb = (z) => z - DECK;
  // front
  rect(svg, 0, Y(zb(FT)), p.w, zb(FT), 'body');
  for (const k of [-1, 1]) rect(svg, p.w / 2 + k * p.pc / 2 - 100, Y(zb(PB + PH)), 200, PH, 'pocket');
  rect(svg, 35, Y(zb(FT - 12)), p.w - 70, p.flapH, 'flapleaf');
  rect(svg, 40, Y(zb(FB - 35)), p.w - 80, FB - 35 - FLOOR - 30, 'sign');
  rect(svg, 40, Y(zb(FB - 35)), p.w - 80, 210, 'band');
  el(svg, 'circle', { cx: p.w / 2, cy: Y(zb(FT - 40)), r: 22, class: 'lockdot' });
  dimH(svg, 0, p.w, 250, fmt(p.w), 0);
  dimH(svg, 35, p.w - 35, -(zb(FT) + 140), `${fmt(p.w - 70)} flap`, -zb(FT), true);
  dimV(svg, Y(zb(PB)), 0, -230, '200', 0, true);
  dimV(svg, Y(zb(FB)), 0, -460, fmt(zb(FB)), 0, true);
  dimV(svg, Y(zb(FT)), 0, -680, fmt(zb(FT)), 0);
  txt(svg, p.w / 2, Y(zb(FT) + 300), `FRONT · ${p.n}-MODULE BIN`, 'note');
  // right-hand side: trap door, hinged along its top edge
  const ox = p.w + 900;
  poly(svg, [[ox, Y(0)], [ox, Y(zb(FT))], [ox + DEPTH, Y(zb(BT))], [ox + DEPTH, Y(0)]], 'body');
  rect(svg, ox, Y(zb(PB + PH)), DEPTH, PH, 'pocket');
  rect(svg, ox + 60, Y(zb(DOOR.z1)), DOOR.w, DOOR.z1 - DOOR.z0, 'doorface solid');
  line(svg, ox + 60, Y(zb(DOOR.z1)), ox + 60 + DOOR.w, Y(zb(DOOR.z1)), 'hingeline');
  for (const k of [0, 1]) rect(svg, ox + 60 + 120 + k * (DOOR.w - 240) - 30, Y(zb(DOOR.z0) + 50), 60, 40, 'band');
  dimH(svg, ox, ox + DEPTH, 250, '1,150', 0);
  dimH(svg, ox + 60, ox + 60 + DOOR.w, -(zb(FT) + 140), `${fmt(DOOR.w)} door`, -zb(BT), true);
  dimV(svg, Y(zb(DOOR.z1)), Y(zb(DOOR.z0)), ox + DEPTH + 220, `${fmt(DOOR.z1 - DOOR.z0)} door`, ox + DEPTH, true);
  dimV(svg, Y(zb(BT)), 0, ox + DEPTH + 480, fmt(zb(BT)), ox + DEPTH);
  txt(svg, ox + DEPTH / 2, Y(zb(FT) + 300), 'RIGHT SIDE · TRAP DOOR', 'note');
  txt(svg, ox + DEPTH / 2, Y(zb(DOOR.z1) - 70), 'HINGE', 'tiny');
  $('#podCap').textContent = `${p.n}-module bin shown, heights from the bin base. Flap on the front, trap door on the right.`;
}

// ---------- schedule, totals, BOM, dims ----------
function schedule() {
  const rows = []; let net = 0, load = 0, tare = 0, mods = 0;
  const sizes = {};
  for (const side of ['A', 'B']) for (const p of placed(side)) {
    const s = S[p.id], full = p.net * s.density, over = full > state.swl;
    const fill = over ? Math.floor(state.swl / (s.density * (p.iw * ID / 1e6)) / 10) * 10 : null;
    net += p.net; load += over ? state.swl : full; tare += p.tare; mods += p.n; sizes[`${p.n}-module (${fmt(p.w)})`] = (sizes[`${p.n}-module (${fmt(p.w)})`] || 0) + 1;
    rows.push(`<tr${over ? ' class="over"' : ''}><td class="n">${nn(p.id)}</td><td>${s.name}</td><td>${side}</td><td>${p.n}</td><td>${fmt(p.w)} × 1,150 × 1,900/1,800</td><td>${fmt(p.iw)} × ${fmt(ID)} × ${fmt(IH_F)}/${fmt(IH_B)}</td><td>${m3(p.net)}</td><td>${fmt(p.flapW)} × ${fmt(p.flapH)}</td><td>${fmt(DOOR.w)} × ${fmt(DOOR.z1 - DOOR.z0)}</td><td>${fmt(Math.round(p.tare / 10) * 10)}</td><td>${fmt(s.density)}</td><td>${fmt(full)}</td><td>${fill ? `${fmt(fill)} above floor` : 'To top'}</td></tr>`);
  }
  $('#sched').innerHTML = `<thead><tr><th>Bin</th><th>Stream</th><th>Side</th><th>Modules</th><th>External W × D × H front/back</th><th>Internal W × D × H front/back</th><th>Net m³</th><th>Flap opening</th><th>Trap door</th><th>Tare kg (est.)</th><th>Loose kg/m³</th><th>Full load kg</th><th>Fill line</th></tr></thead><tbody>${rows.join('')}</tbody>
  <tfoot><tr><td colspan="3">Station</td><td>${mods}</td><td></td><td></td><td>${m3(net)}</td><td></td><td></td><td>${fmt(Math.round(tare / 10) * 10)}</td><td></td><td>${fmt(load)}</td><td></td></tr></tfoot>`;
  const freeA = NMOD - used('A'), freeB = NMOD - used('B');
  $('#totals').innerHTML = `<div><b>${m3(net)} m³</b><span>usable in 8 bins</span></div><div><b>2,000 mm</b><span>max height, 6,300 long</span></div><div><b>${fmt(Math.round(tare / 50) * 50)} kg</b><span>bins tare (est., before skid)</span></div><div><b>${fmt(load)} kg</b><span>indicative contents, all full</span></div><p class="cfgline">Bin rated load ${fmt(state.swl)} kg · Side A: ${state.sides.A.map(([id, n]) => `${nn(id)} ${S[id].short} ×${n}`).join(', ')} · Side B: ${state.sides.B.map(([id, n]) => `${nn(id)} ${S[id].short} ×${n}`).join(', ')}</p>` +
    (freeA + freeB ? `<p class="warn">${freeA + freeB} module${freeA + freeB > 1 ? 's are' : ' is'} unused. Give ${freeA + freeB > 1 ? 'them' : 'it'} to a bin or the skid carries empty space.</p>` : '');
  $('#dimList').innerHTML = [
    ['Design basis', 'Skid 6,300 long × 2,450 wide, deck 100 above the ground.'],
    ['Design basis', 'Bins: 1,150 deep, modules × 585 − 20 wide, top 2,000 at the front and 1,900 at the back.'],
    ['Design basis', 'Flap 1,200 to 2,000. Fork pockets 200 above the bin base (300 above the ground on the skid), floor at 400, rail 100 high on the deck.'],
    ['Design basis', `Usable volume ${m3(net)} m³ across eight bins.`],
    ['To confirm', 'Hook height, runner spacing and roller size on the operator\'s trucks.'],
  ].map(([t, s]) => `<li><span class="st ${t === 'To confirm' ? 'st-t' : 'st-b'}">${t}</span>${s}</li>`).join('');
  const bom = [
    ['Hook skid: runners, deck, rear rollers, A-frame, rear stop', 1, 'Hook interface to suit fleet'],
    ['100 mm retaining rails', 3, 'Both outer edges and centre, 5,850 long'],
    ['Bins, 4 mm plate', 8, Object.entries(sizes).sort().map(([k, v]) => `${v} × ${k}`).join(', ')],
    ['Hard lids, welded, 100 fall', 8, '1 per bin'],
    ['Drop-down front flaps', 8, '2 hinges and 2 check chains or stays each'],
    ['Trap doors, top-hinged, right-hand side', 8, '2 over-centre latches with safety pins each'],
    ['Fork pocket pairs', 8, '200 × 100, front to back'],
    ['Bluetooth smart latches (battery)', 8, '1 per flap, on the lid lip'],
    ['Controller, battery, keyed override', 1, 'On the hook frame. Runs locks, lights and alarm'],
    ['Motion-sensor LED security lights', 3, '2 on the hook-frame arm, 1 on the rear post'],
    ['Alarm siren', 1, 'Arms on a schedule set in the app'],
    ['Rear post with sign panel', 1, 'BuildBin, alarmed after hours, no hazardous waste'],
    ['Bin sign plates (number, name, yes/no)', 8, 'Sized to each bin'],
  ];
  $('#bom').innerHTML = `<thead><tr><th>Component</th><th>Qty</th><th>Note</th></tr></thead><tbody>${bom.map(([a, q, n]) => `<tr><td>${a}</td><td class="n">${q}</td><td>${n}</td></tr>`).join('')}</tbody>`;
}

function update() { writeHash(); renderCfg(); drawPlan(); drawSide('A'); drawSide('B'); drawSection(); drawPod(); schedule(); }

fetch('data/model.json').then((r) => r.json()).then((m) => {
  const SHORT = { plastic: 'Plastics', timber: 'Timber', plaster: 'Plaster', card: 'Card', eps: 'EPS', rubble: 'Rubble', general: 'General', steel: 'Steel' };
  for (const s of m.streams) S[s.id] = { n: s.n, name: s.name, density: s.density, short: SHORT[s.id] || s.name };
  state = readHash();
  $('#swlSel').value = state.swl;
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
