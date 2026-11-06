'use strict';

// ═══════════════════════════════════════════════
// МИНИ-ИГРЫ: СЕЙФ, ЩИТОК, КЛЮЧ-КАРТА
// safe — крути диск, лови вибрацию и фиксируй числа кода;
// wire — поворачивай участки схемы, чтобы ток дошёл от источника до выхода;
// card — жми, когда луч считывателя проходит по светящемуся блоку.
// Состояние — простой объект: сохраняется вместе со взломом.
// ═══════════════════════════════════════════════
const MiniGames = (() => {
  const TYPES = ['safe', 'wire', 'card'];
  const rnd = (n) => Math.floor(Math.random() * n);

  let G = null;
  let view = null;
  let cb = {};
  let enabled = true;
  let blind = false;

  const say = (key, k = '') => {
    G.log.push({ t: key, k });
    if (G.log.length > 6) G.log.shift();
    if (view) paintLog();
  };
  const sound = (n, a) => cb.sound && cb.sound(n, a);

  // ─── СЕЙФ ────────────────────────────────────
  const SAFE = { N: 40, nums: [2, 3, 4], win: [6, 4, 3], noise: [25, 34, 50] };
  const circ = (a, b) => { const d = Math.abs(((a - b) % SAFE.N + SAFE.N) % SAFE.N); return Math.min(d, SAFE.N - d); };
  const wrap = (v) => ((Math.round(v) % SAFE.N) + SAFE.N) % SAFE.N;

  function createSafe(lvl) {
    const i = lvl - 1;
    const combo = [];
    while (combo.length < SAFE.nums[i]) {
      const v = rnd(SAFE.N);
      const prev = combo.length ? combo[combo.length - 1] : 0;
      if (circ(v, prev) >= 7) combo.push(v);
    }
    return { type: 'safe', lvl, combo, idx: 0, pos: 0, errors: 0, noise: 0, hint: null, solved: false, log: [] };
  }

  const safeNear = () => Math.max(0, 1 - circ(wrap(G.pos), G.combo[G.idx]) / SAFE.win[G.lvl - 1]);

  function safeSetPos(p) {
    const before = wrap(G.pos);
    G.pos = p;
    const now = wrap(G.pos);
    if (now !== before) {
      const n = Math.max(0, 1 - circ(now, G.combo[G.idx]) / SAFE.win[G.lvl - 1]);
      sound('dial', n);
      if (n >= 0.999) cb.vibrate && cb.vibrate(15);
      paintSafeInfo();
    }
  }

  function safeSet() {
    G.pos = wrap(G.pos);
    if (G.pos === G.combo[G.idx]) {
      G.idx++;
      G.hint = null;
      sound('tumbler');
      if (G.idx >= G.combo.length) { finish(); return; }
      say(t('mg.safe.digit', { n: G.idx, total: G.combo.length }), 'good');
    } else {
      G.errors++;
      G.noise = Math.min(100, G.noise + SAFE.noise[G.lvl - 1]);
      sound('denied');
      cb.vibrate && cb.vibrate(40);
      if (G.noise >= 100) { say(t('mg.safe.alarm'), 'bad'); lockout(); return; }
      say(t('mg.safe.wrong', { n: G.noise }), 'bad');
    }
    paintSafeInfo();
    cb.onChange && cb.onChange(G);
  }

  // ─── ЩИТОК ───────────────────────────────────
  // Биты соединений: 1 — верх, 2 — право, 4 — низ, 8 — лево
  const WIRE = { size: [[4, 3], [5, 4], [6, 4]], slack: [10, 8, 6] };
  const rot = (m, r) => { for (let i = 0; i < (r % 4); i++) m = ((m << 1) | (m >> 3)) & 15; return m; };
  const DIRS = [[0, -1, 1, 4], [1, 0, 2, 8], [0, 1, 4, 1], [-1, 0, 8, 2]];
  const isStraight = (m) => m === 5 || m === 10;

  function wirePath(w, h, sr, er) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const path = [[0, sr]];
      const seen = new Set(['0,' + sr]);
      let ok = false;
      for (let step = 0; step < w * h * 2; step++) {
        const [x, y] = path[path.length - 1];
        if (x === w - 1 && y === er) { ok = true; break; }
        const opts = DIRS.map(([dx, dy]) => [x + dx, y + dy])
          .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && !seen.has(nx + ',' + ny));
        if (!opts.length) break;
        // Слегка тянемся вправо, но разрешаем петлять
        opts.sort(() => Math.random() - 0.5);
        const right = opts.find(([nx]) => nx > x);
        const next = right && Math.random() < 0.45 ? right : opts[0];
        path.push(next);
        seen.add(next.join(','));
      }
      if (ok && path.length >= w + 1) return path;
    }
    // Запасной путь: прямо по строке, потом вниз/вверх
    const p = [];
    for (let x = 0; x < w; x++) p.push([x, sr]);
    for (let y = sr; y !== er; y += er > sr ? 1 : -1) p.push([w - 1, y + (er > sr ? 1 : -1)]);
    return p;
  }

  function createWire(lvl) {
    const [w, h] = WIRE.size[lvl - 1];
    const sr = rnd(h);
    const er = rnd(h);
    const path = wirePath(w, h, sr, er);
    const tiles = Array.from({ length: w * h }, () => {
      const r = Math.random();
      const base = r < 0.4 ? 10 : r < 0.85 ? 3 : 7;
      return { m: rot(base, rnd(4)), r: 0, path: false, fixed: false };
    });
    path.forEach(([x, y], k) => {
      let m = 0;
      const link = (p) => { if (!p) return; const [px, py] = p; DIRS.forEach(([dx, dy, bit]) => { if (x + dx === px && y + dy === py) m |= bit; }); };
      link(path[k - 1]);
      link(path[k + 1]);
      if (k === 0) m |= 8;
      if (k === path.length - 1) m |= 2;
      tiles[y * w + x] = { m, r: 0, path: true, fixed: false };
    });
    const state = { type: 'wire', lvl, w, h, sr, er, tiles, moves: 0, par: 0, budget: 0, cur: sr * w, solved: false, log: [] };
    do { tiles.forEach((tl) => { tl.r = rnd(4); }); } while (wirePowered(state).done);
    state.par = tiles.reduce((a, tl) => a + (tl.path ? need(tl) : 0), 0);
    state.budget = state.par * 2 + WIRE.slack[lvl - 1];
    return state;
  }

  const need = (tl) => (isStraight(tl.m) ? tl.r % 2 : (4 - (tl.r % 4)) % 4);
  const cur = (tl) => rot(tl.m, tl.r);

  function wirePowered(s) {
    const on = new Set();
    const start = s.sr * s.w;
    if (!(cur(s.tiles[start]) & 8)) return { on, done: false };
    const q = [start];
    on.add(start);
    while (q.length) {
      const i = q.shift();
      const x = i % s.w;
      const y = Math.floor(i / s.w);
      const m = cur(s.tiles[i]);
      DIRS.forEach(([dx, dy, bit, back]) => {
        const nx = x + dx;
        const ny = y + dy;
        if (!(m & bit) || nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) return;
        const j = ny * s.w + nx;
        if (on.has(j) || !(cur(s.tiles[j]) & back)) return;
        on.add(j);
        q.push(j);
      });
    }
    const end = s.er * s.w + s.w - 1;
    return { on, done: on.has(end) && !!(cur(s.tiles[end]) & 2) };
  }

  function wireRotate(i) {
    if (!G || G.type !== 'wire' || G.solved || !enabled) return;
    const tl = G.tiles[i];
    if (!tl) return;
    G.cur = i;
    if (tl.fixed) { sound('denied'); paintWire(); return; }
    tl.r = (tl.r + 1) % 4;
    G.moves++;
    sound('rotate');
    const p = wirePowered(G);
    if (p.done) { paintWire(); finish(); return; }
    if (G.moves >= G.budget) { paintWire(); say(t('mg.wire.short'), 'bad'); lockout(); return; }
    if (G.budget - G.moves === 5) say(t('mg.wire.warn', { n: 5 }), 'bad');
    paintWire();
    cb.onChange && cb.onChange(G);
  }

  // ─── КЛЮЧ-КАРТА ──────────────────────────────
  const CARD = { seg: 30, need: [3, 4, 5], width: [4, 3, 2], speed: [9, 12, 15], misses: [4, 3, 3] };

  function cardZone(s) {
    let a;
    let guard = 0;
    do { a = rnd(CARD.seg - s.width + 1); guard++; } while (guard < 50 && Math.abs(a + s.width / 2 - s.beam) < 7);
    s.zone = [a, a + s.width];
  }

  function createCard(lvl) {
    const i = lvl - 1;
    const s = {
      type: 'card', lvl, need: CARD.need[i], got: 0, width: CARD.width[i], speed: CARD.speed[i], maxErr: CARD.misses[i],
      beam: 0, dir: 1, slow: false, errors: 0, zone: [0, 0], solved: false, log: [],
    };
    cardZone(s);
    return s;
  }

  function cardPress() {
    if (!G || G.type !== 'card' || G.solved || !enabled) return;
    const [a, b] = G.zone;
    if (G.beam >= a - 0.2 && G.beam <= b + 0.2) {
      G.got++;
      G.slow = false;
      sound('swipe');
      if (G.got >= G.need) { paintCard(); finish(); return; }
      G.speed *= 1.06;
      cardZone(G);
      say(t('mg.card.hit', { n: G.got, total: G.need }), 'good');
    } else {
      G.errors++;
      sound('denied');
      cb.vibrate && cb.vibrate(40);
      if (G.errors >= G.maxErr) { say(t('mg.card.rejected'), 'bad'); paintCard(); lockout(); return; }
      say(t('mg.card.miss', { n: G.maxErr - G.errors }), 'bad');
    }
    paintCard();
    cb.onChange && cb.onChange(G);
  }

  // ─── Общее ───────────────────────────────────
  function create(type, lvl) {
    lvl = Math.max(1, Math.min(3, lvl || 1));
    if (type === 'safe') return createSafe(lvl);
    if (type === 'wire') return createWire(lvl);
    return createCard(lvl);
  }

  function finish() {
    G.solved = true;
    say(t('mg.' + G.type + '.done'), 'good');
    cb.onSolved && cb.onSolved(G);
  }

  function lockout() {
    paintLog();
    cb.onLockout && cb.onLockout(G);
  }

  // Третья звезда: аккуратная работа
  function clean(s) {
    if (!s) return false;
    if (s.type === 'wire') return s.moves <= s.par + Math.ceil(s.par * 0.5) + 2;
    return s.errors <= 1;
  }

  function title(s) {
    if (s.type === 'safe') return t('mg.safe.title', { n: s.combo.length });
    if (s.type === 'wire') return t('mg.wire.title', { w: s.w, h: s.h });
    return t('mg.card.title', { n: s.need });
  }

  function mount(root, state, callbacks) {
    G = state;
    G.log = G.log || [];
    cb = callbacks || {};
    root.innerHTML = `
      <div class="term-head mg-head">
        <div class="term-h1">${t('mg.' + G.type + '.h1')}</div>
        <div class="term-sub">${t('mg.' + G.type + '.sub')}</div>
        <div class="mg-status"></div>
      </div>
      <div class="mg-body mg-${G.type}"></div>
      <div class="term-bottom mg-bottom">
        <div class="term-log mg-log"></div>
        <button class="hack-btn mg-act"><span>${t('mg.' + G.type + '.act')}</span></button>
      </div>
      <div class="term-lock hidden"><div class="term-lock-box"><div class="term-lock-title">${t('mg.' + G.type + '.locked')}</div><div class="term-lock-sub"></div></div></div>`;
    view = {
      root,
      body: root.querySelector('.mg-body'),
      status: root.querySelector('.mg-status'),
      log: root.querySelector('.mg-log'),
      act: root.querySelector('.mg-act'),
      lock: root.querySelector('.term-lock'),
      lockSub: root.querySelector('.term-lock-sub'),
    };
    if (G.type === 'safe') mountSafe();
    if (G.type === 'wire') mountWire();
    if (G.type === 'card') mountCard();
    view.act.addEventListener('click', act);
    paintLog();
  }

  function act() {
    if (!G || G.solved || !enabled) return;
    if (G.type === 'safe') safeSet();
    else if (G.type === 'wire') wireRotate(G.cur);
    else cardPress();
  }

  function paintLog() {
    if (!view) return;
    view.log.innerHTML = '';
    G.log.slice(-3).forEach((l) => {
      const d = document.createElement('div');
      if (l.k) d.className = l.k;
      d.textContent = '>' + l.t;
      view.log.appendChild(d);
    });
  }

  // Сейф: холст с диском
  const DV = 200;
  function mountSafe() {
    view.body.innerHTML = `
      <canvas class="safe-dial" width="200" height="200"></canvas>
      <div class="safe-read"><span class="safe-num"></span><span class="safe-meter"></span></div>
      <div class="safe-code"></div>`;
    view.canvas = view.body.querySelector('canvas');
    view.ctx = view.canvas.getContext('2d');
    view.num = view.body.querySelector('.safe-num');
    view.meter = view.body.querySelector('.safe-meter');
    view.code = view.body.querySelector('.safe-code');
    resize();
    let drag = null;
    const angleOf = (e) => {
      const r = view.canvas.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    view.canvas.addEventListener('pointerdown', (e) => {
      if (!enabled || G.solved) return;
      e.preventDefault();
      view.canvas.setPointerCapture(e.pointerId);
      drag = { a: angleOf(e), p: G.pos };
    });
    view.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!enabled) { drag = null; return; }
      let d = angleOf(e) - drag.a;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      drag.a = angleOf(e);
      // По часовой стрелке числа на диске растут
      safeSetPos(G.pos - d / (Math.PI * 2) * SAFE.N);
    });
    const end = () => { if (drag) { drag = null; G.pos = wrap(G.pos); paintSafeInfo(); cb.onChange && cb.onChange(G); } };
    view.canvas.addEventListener('pointerup', end);
    view.canvas.addEventListener('pointercancel', end);
    paintSafeInfo();
  }

  function paintSafeInfo() {
    if (!view || G.type !== 'safe' || !view.num) return;
    view.num.textContent = String(wrap(G.pos)).padStart(2, '0');
    const near = safeNear();
    const bars = 8;
    const on = Math.round(near * bars);
    view.meter.textContent = blind ? t('mg.safe.blind') : `${t('mg.safe.vibe')} ${'▮'.repeat(on)}${'▯'.repeat(bars - on)}`;
    view.meter.classList.toggle('hot', !blind && near >= 0.999);
    view.code.innerHTML = G.combo.map((v, i) => {
      if (i < G.idx) return `<span class="done">${String(v).padStart(2, '0')}</span>`;
      return `<span class="${i === G.idx ? 'cur' : ''}">--</span>`;
    }).join('');
    const noise = Math.round(G.noise / 34);
    view.status.innerHTML = `${t('mg.safe.noise')} <span class="mg-pips">${Array.from({ length: 3 }, (_, i) => `<i class="${i < noise ? 'bad' : ''}">■</i>`).join('')}</span>`;
  }

  function drawSafe(now) {
    const c = view.ctx;
    const s = view.canvas.width / DV;
    c.setTransform(s, 0, 0, s, 0, 0);
    c.clearRect(0, 0, DV, DV);
    const cx = DV / 2;
    const cy = DV / 2;
    const R = 92;
    const near = blind ? 0 : safeNear();
    const g = c.createRadialGradient(cx, cy - 15, 8, cx, cy, R);
    g.addColorStop(0, pri(0.14));
    g.addColorStop(1, pri(0.04));
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = pri(0.4); c.lineWidth = 3; c.stroke();

    const ang = (k) => ((k - G.pos) / SAFE.N) * Math.PI * 2 - Math.PI / 2;
    if (G.hint && G.hint.idx === G.idx) {
      c.strokeStyle = acc(0.35 + 0.2 * Math.sin(now / 250));
      c.lineWidth = 8;
      c.beginPath();
      c.arc(cx, cy, R - 10, ang(G.hint.a - 0.5), ang(G.hint.b + 0.5));
      c.stroke();
    }
    c.font = '13px "Ubuntu Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k < SAFE.N; k++) {
      const a = ang(k);
      const big = k % 5 === 0;
      const len = big ? 10 : 5;
      c.strokeStyle = pri(1, big ? 0.6 : 0.28);
      c.lineWidth = big ? 2 : 1;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4));
      c.lineTo(cx + Math.cos(a) * (R - 4 - len), cy + Math.sin(a) * (R - 4 - len));
      c.stroke();
      if (big) {
        c.fillStyle = pri(1, 0.75);
        c.fillText(String(k), cx + Math.cos(a) * (R - 25), cy + Math.sin(a) * (R - 25));
      }
    }
    // Ручка
    c.save();
    c.translate(cx, cy);
    c.rotate(-G.pos / SAFE.N * Math.PI * 2);
    c.fillStyle = pri(0.2);
    c.strokeStyle = pri(0.55);
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 42, 0, Math.PI * 2); c.fill(); c.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 34, Math.sin(a) * 34);
      c.lineTo(Math.cos(a) * 42, Math.sin(a) * 42);
      c.stroke();
    }
    c.fillStyle = pri(1, 0.6);
    c.fillRect(-2, -40, 4, 12);
    c.restore();
    // Неподвижная метка сверху: светится, когда диск «отзывается»
    const jit = near > 0 ? (Math.random() - 0.5) * near * 2 : 0;
    c.fillStyle = near >= 0.999 ? priLight(1) : near > 0 ? acc(0.4 + near * 0.6) : pri(0.6);
    c.beginPath();
    c.moveTo(cx - 7 + jit, 1); c.lineTo(cx + 7 + jit, 1); c.lineTo(cx + jit, 13); c.closePath();
    c.fill();
  }

  // Щиток: сетка кнопок с участками схемы
  function mountWire() {
    view.body.style.setProperty('--w', G.w);
    view.body.addEventListener('click', (e) => {
      const b = e.target.closest('.wt');
      if (b) wireRotate(+b.dataset.i);
    });
    paintWire();
  }

  function tileSvg(m, on) {
    const ends = [[50, 0], [100, 50], [50, 100], [0, 50]];
    const lines = ends.map(([x, y], k) => ((m >> k) & 1 ? `<line x1="50" y1="50" x2="${x}" y2="${y}"/>` : '')).join('');
    return `<svg viewBox="0 0 100 100" class="${on ? 'on' : ''}">${lines}<circle cx="50" cy="50" r="9"/></svg>`;
  }

  function paintWire() {
    if (!view || G.type !== 'wire') return;
    const p = wirePowered(G);
    let html = '';
    for (let y = 0; y < G.h; y++) {
      html += `<span class="wire-src">${y === G.sr ? '⚡' : ''}</span>`;
      for (let x = 0; x < G.w; x++) {
        const i = y * G.w + x;
        const tl = G.tiles[i];
        html += `<button class="wt${tl.fixed ? ' fixed' : ''}${i === G.cur ? ' cur' : ''}" data-i="${i}">${tileSvg(cur(tl), p.on.has(i))}</button>`;
      }
      html += `<span class="wire-out${y === G.er && p.done ? ' lit' : ''}">${y === G.er ? '◉' : ''}</span>`;
    }
    view.body.innerHTML = html;
    const left = Math.max(0, G.budget - G.moves);
    view.status.innerHTML = `${t('mg.wire.moves', { n: left })}`;
    view.status.classList.toggle('warn', left <= 5);
  }

  // Ключ-карта: дорожка из блоков и бегущий луч
  function mountCard() {
    view.body.innerHTML = `
      <div class="card-strip">${Array.from({ length: CARD.seg }, (_, i) => `<i data-i="${i}"></i>`).join('')}<b class="card-beam"></b></div>
      <div class="card-blocks"></div>`;
    view.strip = view.body.querySelector('.card-strip');
    view.beam = view.body.querySelector('.card-beam');
    view.blocks = view.body.querySelector('.card-blocks');
    view.cells = [...view.strip.querySelectorAll('i')];
    view.strip.addEventListener('pointerdown', (e) => { e.preventDefault(); cardPress(); });
    paintCard();
  }

  function paintCard() {
    if (!view || G.type !== 'card' || !view.cells) return;
    view.cells.forEach((c, i) => c.classList.toggle('z', !G.solved && i >= G.zone[0] && i < G.zone[1]));
    view.blocks.innerHTML = `${t('mg.card.blocks')} ${Array.from({ length: G.need }, (_, i) => `<span class="${i < G.got ? 'on' : ''}">■</span>`).join('')}`;
    view.status.innerHTML = `${t('mg.card.errors')} <span class="mg-pips">${Array.from({ length: G.maxErr }, (_, i) => `<i class="${i < G.errors ? 'bad' : ''}">■</i>`).join('')}</span>`;
    paintBeam();
  }

  function paintBeam() {
    view.beam.style.left = (G.beam / CARD.seg * 100) + '%';
  }

  // Каждый кадр из игрового цикла
  function frame(dt, now, active) {
    if (!G || !view) return;
    if (G.type === 'safe' && view.ctx) drawSafe(now);
    if (G.type === 'card' && view.beam && active && enabled && !G.solved) {
      const sp = G.speed * (G.slow ? 0.5 : 1);
      G.beam += G.dir * sp * dt;
      if (G.beam >= CARD.seg) { G.beam = CARD.seg; G.dir = -1; }
      if (G.beam <= 0) { G.beam = 0; G.dir = 1; }
      paintBeam();
    }
  }

  function resize() {
    if (!view || !view.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const css = view.canvas.getBoundingClientRect().width || DV;
    view.canvas.width = Math.round(css * dpr);
    view.canvas.height = Math.round(css * dpr);
  }

  function handleKey(e) {
    if (!G || !enabled || G.solved) return false;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); return true; }
    if (G.type === 'safe' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      safeSetPos(wrap(G.pos) + (e.key === 'ArrowRight' ? 1 : -1));
      cb.onChange && cb.onChange(G);
      return true;
    }
    if (G.type === 'wire') {
      const map = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (map[e.key]) {
        e.preventDefault();
        const x = Math.max(0, Math.min(G.w - 1, (G.cur % G.w) + map[e.key][0]));
        const y = Math.max(0, Math.min(G.h - 1, Math.floor(G.cur / G.w) + map[e.key][1]));
        G.cur = y * G.w + x;
        paintWire();
        return true;
      }
    }
    return false;
  }

  // Сканер: сейф — подсвечивает зону числа, щиток — чинит участок, карта — замедляет луч
  function canScan() {
    if (!G || G.solved) return false;
    if (G.type === 'safe') return !(G.hint && G.hint.idx === G.idx);
    if (G.type === 'wire') return G.tiles.some((tl) => tl.path && !tl.fixed && need(tl) > 0);
    return !G.slow;
  }

  function scan() {
    if (!canScan()) return false;
    if (G.type === 'safe') {
      const v = G.combo[G.idx];
      const off = rnd(5);
      G.hint = { idx: G.idx, a: v - off, b: v - off + 4 };
      say(t('mg.safe.scanned'), 'good');
    } else if (G.type === 'wire') {
      const bad = G.tiles.filter((tl) => tl.path && !tl.fixed && need(tl) > 0);
      const tl = bad[rnd(bad.length)];
      tl.r = 0;
      tl.fixed = true;
      say(t('mg.wire.scanned'), 'good');
      paintWire();
      if (wirePowered(G).done) finish();
    } else {
      G.slow = true;
      G.zone = [Math.max(0, G.zone[0] - 1), Math.min(CARD.seg, G.zone[1] + 1)];
      say(t('mg.card.scanned'), 'good');
      paintCard();
    }
    cb.onChange && cb.onChange(G);
    return true;
  }

  function setEnabled(on) {
    enabled = on;
    if (view && view.act) view.act.disabled = !on || (G && G.solved);
  }

  function setBlind(on) { blind = !!on; if (G && G.type === 'safe') paintSafeInfo(); }

  function showLock(secondsLeft) {
    if (!view) return;
    view.lock.classList.toggle('hidden', secondsLeft <= 0);
    view.lockSub.textContent = t('mg.reboot', { n: Math.ceil(secondsLeft) });
  }

  return { TYPES, create, mount, frame, resize, handleKey, act, rotate: wireRotate, canScan, scan, clean, title, setEnabled, setBlind, showLock, need };
})();
