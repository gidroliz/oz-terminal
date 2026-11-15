'use strict';

// ═══════════════════════════════════════════════
// ГРАФИКА
// Замок и диск сейфа рисуются как металлические детали: шлифованные поверхности, фаски,
// тени, искры. Металл подкрашен цветом темы, поэтому картинка подходит к любому экрану.
// Неподвижные части рисуются один раз в отдельный холст и потом только копируются.
// ═══════════════════════════════════════════════
const GFX = (() => {
  const TAU = Math.PI * 2;
  const cache = new Map();
  let particles = [];
  let rings = [];
  let lastNow = 0;
  let prevFlash = 0;

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // Оттенок металла: серый с примесью основного цвета темы
  function tone() { return THEME.pri.map((v) => 0.6 + 0.4 * v / 255); }
  function metal(l, a = 1) {
    const tn = tone();
    return `rgba(${tn.map((k) => Math.max(0, Math.min(255, Math.round(k * l)))).join(',')},${a})`;
  }
  const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(v)).join(',')},${a})`;
  const mixc = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const themeLight = (a = 1) => rgb(mixc(THEME.pri, [255, 255, 255], 0.45), a);

  function layer(key, w, h, draw) {
    const full = `${key}|${w}|${h}|${THEME.pri.join()}|${THEME.acc.join()}`;
    let cv = cache.get(full);
    if (!cv) {
      if (cache.size > 24) cache.clear();
      cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      draw(cv.getContext('2d'));
      cache.set(full, cv);
    }
    return cv;
  }

  // Шлифованный диск: секторные блики и тонкие кольца от резца
  function brushed(c, cx, cy, r, base, rnd, start = -0.6) {
    if (c.createConicGradient) {
      const g = c.createConicGradient(start, cx, cy);
      const ks = [0.62, 1.12, 0.66, 0.9, 0.55, 1.05, 0.64, 0.95, 0.62];
      ks.forEach((k, i) => g.addColorStop(i / (ks.length - 1), metal(base * k)));
      c.fillStyle = g;
    } else {
      const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, metal(base * 1.1));
      g.addColorStop(1, metal(base * 0.55));
      c.fillStyle = g;
    }
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.fill();
    const n = Math.round(r * 1.1);
    for (let i = 0; i < n; i++) {
      const rr = 2 + rnd() * (r - 2);
      const a0 = rnd() * TAU;
      c.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${0.02 + rnd() * 0.05})` : `rgba(0,0,0,${0.05 + rnd() * 0.12})`;
      c.lineWidth = 0.4 + rnd() * 0.7;
      c.beginPath(); c.arc(cx, cy, rr, a0, a0 + (0.4 + rnd() * 1.4) * Math.PI); c.stroke();
    }
  }

  // Кольцо с фаской: свет падает слева сверху
  function bevel(c, cx, cy, r1, r0, light, dark) {
    const g = c.createLinearGradient(cx - r1 * 0.7, cy - r1 * 0.7, cx + r1 * 0.7, cy + r1 * 0.7);
    g.addColorStop(0, metal(light));
    g.addColorStop(0.5, metal((light + dark) / 2));
    g.addColorStop(1, metal(dark));
    c.fillStyle = g;
    c.beginPath();
    c.arc(cx, cy, r1, 0, TAU);
    c.arc(cx, cy, r0, 0, TAU, true);
    c.fill('evenodd');
  }

  function screw(c, x, y, r, ang) {
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath(); c.arc(x + 0.8, y + 1.2, r + 1, 0, TAU); c.fill();
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, metal(190));
    g.addColorStop(0.6, metal(95));
    g.addColorStop(1, metal(40));
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.7; c.stroke();
    c.save();
    c.translate(x, y); c.rotate(ang);
    c.fillStyle = 'rgba(0,0,0,0.8)';
    c.fillRect(-r * 0.75, -r * 0.16, r * 1.5, r * 0.32);
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.fillRect(-r * 0.75, r * 0.16, r * 1.5, 0.5);
    c.restore();
  }

  function rust(c, cx, cy, r, rnd) {
    c.save();
    c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.clip();
    for (let k = 0; k < 6; k++) {
      const a = rnd() * TAU;
      const d = (0.35 + rnd() * 0.6) * r;
      const bx = cx + Math.cos(a) * d;
      const by = cy + Math.sin(a) * d;
      const spread = 8 + rnd() * 16;
      for (let i = 0; i < 34; i++) {
        const pa = rnd() * TAU;
        const pd = rnd() * rnd() * spread;
        const pr = 1 + rnd() * 6;
        c.fillStyle = rnd() < 0.25
          ? `rgba(35,14,5,${0.15 + rnd() * 0.25})`
          : `rgba(${150 + rnd() * 50 | 0},${62 + rnd() * 40 | 0},${14 + rnd() * 18 | 0},${0.07 + rnd() * 0.16})`;
        c.beginPath(); c.arc(bx + Math.cos(pa) * pd, by + Math.sin(pa) * pd, pr, 0, TAU); c.fill();
      }
      // Потёк вниз
      const lg = c.createLinearGradient(0, by, 0, by + 30 + rnd() * 30);
      lg.addColorStop(0, 'rgba(140,62,18,0.28)');
      lg.addColorStop(1, 'rgba(140,62,18,0)');
      c.fillStyle = lg;
      c.fillRect(bx - 2 - rnd() * 3, by, 3 + rnd() * 5, 60);
    }
    c.restore();
  }

  // ─── ЗАМОК ───────────────────────────────────
  const LOCK = { V: 240, R: 110, plate: 98, cyl: 55 };

  function lockPlate(px, kind, blind) {
    return layer(`plate:${kind}:${blind ? 1 : 0}`, px, px, (c) => {
      const s = px / LOCK.V;
      c.setTransform(s, 0, 0, s, 0, 0);
      const cx = LOCK.V / 2;
      const cy = LOCK.V / 2;
      const { R, plate, cyl } = LOCK;
      const rnd = seeded(kind === 'rusty' ? 77 : 41);

      // Корпус за кольцом
      c.fillStyle = '#000';
      c.fillRect(0, 0, LOCK.V, LOCK.V);
      bevel(c, cx, cy, R + 12, R - 9, 150, 28);
      bevel(c, cx, cy, R - 9, plate, 22, 120);
      c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, R - 9, 0, TAU); c.stroke();

      // Лицевая пластина
      brushed(c, cx, cy, plate, kind === 'rusty' ? 66 : 76, rnd);
      const sh = c.createLinearGradient(cx - plate, cy - plate, cx + plate, cy + plate);
      sh.addColorStop(0, 'rgba(255,255,255,0.10)');
      sh.addColorStop(0.45, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = sh;
      c.beginPath(); c.arc(cx, cy, plate, 0, TAU); c.fill();
      // Мелкие царапины
      for (let i = 0; i < 22; i++) {
        const a = rnd() * TAU;
        const d = rnd() * plate * 0.9;
        const l = 4 + rnd() * 16;
        const dir = rnd() * TAU;
        c.strokeStyle = `rgba(255,255,255,${0.03 + rnd() * 0.07})`;
        c.lineWidth = 0.4;
        c.beginPath();
        c.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        c.lineTo(cx + Math.cos(a) * d + Math.cos(dir) * l, cy + Math.sin(a) * d + Math.sin(dir) * l);
        c.stroke();
      }
      if (kind === 'rusty') {
        rust(c, cx, cy, plate, rnd);
        c.strokeStyle = 'rgba(150,72,24,0.5)'; c.lineWidth = 9;
        c.beginPath(); c.arc(cx, cy, R - 4.5, 0, TAU); c.stroke();
      }

      // Шкала: гравировка, залитая светящейся краской
      if (!blind) {
        c.save();
        c.shadowColor = rgb(THEME.pri, 0.8);
        c.shadowBlur = 3;
        for (let a = -90; a <= 90; a += 5) {
          const rad = (a - 90) * Math.PI / 180;
          const big = a % 30 === 0;
          const len = big ? 11 : a % 15 === 0 ? 7 : 4;
          const r1 = plate - 4;
          c.strokeStyle = 'rgba(0,0,0,0.65)';
          c.lineWidth = big ? 3.4 : 2.2;
          c.beginPath();
          c.moveTo(cx + (r1 - len) * Math.cos(rad), cy + (r1 - len) * Math.sin(rad));
          c.lineTo(cx + r1 * Math.cos(rad), cy + r1 * Math.sin(rad));
          c.stroke();
          c.strokeStyle = rgb(THEME.pri, big ? 0.95 : 0.55);
          c.lineWidth = big ? 1.8 : 1;
          c.stroke();
        }
        c.restore();
      }

      // Винты и табличка
      screw(c, cx + (plate - 16) * Math.cos(0.72), cy + (plate - 16) * Math.sin(0.72), 5.5, 0.5);
      screw(c, cx + (plate - 16) * Math.cos(Math.PI - 0.72), cy + (plate - 16) * Math.sin(Math.PI - 0.72), 5.5, -0.9);

      // Гнездо цилиндра
      const rec = c.createRadialGradient(cx, cy, cyl, cx, cy, cyl + 14);
      rec.addColorStop(0, 'rgba(0,0,0,0.85)');
      rec.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rec;
      c.beginPath(); c.arc(cx, cy, cyl + 14, 0, TAU); c.fill();
      bevel(c, cx, cy, cyl + 5, cyl + 1, 30, 135);
      c.fillStyle = '#000';
      c.beginPath(); c.arc(cx, cy, cyl + 1, 0, TAU); c.fill();
    });
  }

  function lockCylinder(px) {
    const size = Math.ceil(px * (LOCK.cyl * 2 + 4) / LOCK.V);
    return layer('cyl', size, size, (c) => {
      const s = px / LOCK.V;
      c.setTransform(s, 0, 0, s, 0, 0);
      const m = LOCK.cyl + 2;
      const r = LOCK.cyl;
      const rnd = seeded(9);
      brushed(c, m, m, r, 128, rnd, 0.4);
      bevel(c, m, m, r, r - 3.5, 215, 60);
      bevel(c, m, m, r - 3.5, r - 5, 50, 150);
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1;
      c.beginPath(); c.arc(m, m, r - 11, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.6;
      c.beginPath(); c.arc(m, m, r - 12, 0, TAU); c.stroke();
      const sh = c.createLinearGradient(m - r, m - r, m + r, m + r);
      sh.addColorStop(0, 'rgba(255,255,255,0.14)');
      sh.addColorStop(0.5, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.42)');
      c.fillStyle = sh;
      c.beginPath(); c.arc(m, m, r, 0, TAU); c.fill();
    });
  }

  function keyway(c) {
    c.beginPath();
    c.arc(0, -6, 8, 0, TAU);
    c.moveTo(-4, -2); c.lineTo(4, -2); c.lineTo(6.5, 21); c.lineTo(-6.5, 21); c.closePath();
  }

  // Отвёртка-натяжитель: клинок из скважины и рукоять, уходящая за край
  function wrench(c, R, shadow) {
    const bladeEnd = R * 0.5;
    const handleEnd = R * 1.12;
    if (shadow) {
      c.fillStyle = 'rgba(0,0,0,0.42)';
      c.fillRect(-2.6, 12, 5.2, bladeEnd - 10);
      roundRect(c, -8, bladeEnd - 2, 16, handleEnd - bladeEnd, 4); c.fill();
      return;
    }
    const bg = c.createLinearGradient(-2.6, 0, 2.6, 0);
    bg.addColorStop(0, metal(70));
    bg.addColorStop(0.35, metal(225));
    bg.addColorStop(0.6, metal(150));
    bg.addColorStop(1, metal(55));
    c.fillStyle = bg;
    c.fillRect(-2.6, 12, 5.2, bladeEnd - 10);
    // Втулка
    const fg = c.createLinearGradient(-6, 0, 6, 0);
    fg.addColorStop(0, metal(60));
    fg.addColorStop(0.4, metal(210));
    fg.addColorStop(1, metal(50));
    c.fillStyle = fg;
    roundRect(c, -5.5, bladeEnd - 5, 11, 7, 1.5); c.fill();
    // Рукоять в цвет акцента
    const a = THEME.acc;
    const hg = c.createLinearGradient(-8, 0, 8, 0);
    hg.addColorStop(0, rgb(a.map((v) => v * 0.16)));
    hg.addColorStop(0.3, rgb(a.map((v) => v * 0.7)));
    hg.addColorStop(0.55, rgb(a.map((v) => v * 0.42)));
    hg.addColorStop(1, rgb(a.map((v) => v * 0.1)));
    c.fillStyle = hg;
    roundRect(c, -8, bladeEnd + 1, 16, handleEnd - bladeEnd, 4); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1;
    for (let x = -4.5; x <= 4.5; x += 3) {
      c.beginPath(); c.moveTo(x, bladeEnd + 7); c.lineTo(x, handleEnd); c.stroke();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // Контур шпильки: прямая ножка, петля и волнистая ножка
  function pinPath(c, len, broken) {
    c.beginPath();
    c.moveTo(0, 0);
    if (broken) {
      c.lineTo(0, -len * 0.42);
      c.lineTo(1.5, -len * 0.45);
      return;
    }
    const top = -len + 5;
    c.lineTo(0, top);
    c.arc(3.6, top, 3.6, Math.PI, 0, false);
    const end = -len * 0.36;
    const steps = 7;
    for (let i = 1; i <= steps; i++) {
      const y0 = top + (end - top) * (i - 1) / steps;
      const y1 = top + (end - top) * i / steps;
      const bulge = i > 1 && i < steps ? (i % 2 ? 1.7 : -1.1) : 0;
      c.quadraticCurveTo(7.2 + bulge, (y0 + y1) / 2, 7.2, y1);
    }
  }

  function spark(x, y, ang, speed, col, life) {
    particles.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life, max: life, col });
  }

  function burst(x, y, n, col, speed) {
    for (let i = 0; i < n; i++) spark(x, y, Math.random() * TAU, speed * (0.3 + Math.random()), col, 0.25 + Math.random() * 0.5);
  }

  function drawParticles(c, dt) {
    if (!particles.length && !rings.length) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    particles = particles.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      p.vy += 320 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      if (p.frag) {
        p.rot += p.vr * dt;
        c.save();
        c.translate(p.x, p.y); c.rotate(p.rot);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = Math.min(1, k * 2);
        c.strokeStyle = p.col; c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, -p.len / 2); c.lineTo(0, p.len / 2); c.stroke();
        c.restore();
        return true;
      }
      c.strokeStyle = rgb(p.col, k);
      c.lineWidth = 0.8 + k * 1.2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      c.stroke();
      return true;
    });
    rings = rings.filter((r) => {
      r.life -= dt;
      if (r.life <= 0) return false;
      const k = r.life / r.max;
      c.strokeStyle = themeLight(k * 0.8);
      c.lineWidth = 1 + k * 5;
      c.beginPath(); c.arc(r.x, r.y, r.r0 + (1 - k) * r.grow, 0, TAU); c.stroke();
      return true;
    });
    c.restore();
  }

  function drawLock(c, now, st) {
    const px = c.canvas.width;
    const V = LOCK.V;
    const s = px / V;
    const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const cx = V / 2;
    const cy = V / 2;
    const { R, cyl } = LOCK;
    const sx = (Math.random() - 0.5) * st.shake;
    const sy = (Math.random() - 0.5) * st.shake;
    const rot = st.rot * Math.PI / 180;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(lockPlate(px, st.kind, st.blind), 0, 0);
    c.setTransform(s, 0, 0, s, 0, 0);

    // Зона сканера
    if (st.scan) {
      const pulse = 0.45 + 0.25 * Math.sin(now / 250);
      c.save();
      c.shadowColor = rgb(THEME.acc, 0.9); c.shadowBlur = 10;
      c.strokeStyle = rgb(THEME.acc, pulse);
      c.lineWidth = 8;
      c.beginPath();
      c.arc(cx, cy, LOCK.plate - 22, (st.scan[0] - 90) * Math.PI / 180, (st.scan[1] - 90) * Math.PI / 180);
      c.stroke();
      c.restore();
    }

    // Лампы штифтов двойного замка
    if (st.kind === 'double') {
      for (let i = 0; i < 2; i++) {
        const on = i < 2 - st.pinsLeft;
        const a = Math.PI / 2 + (i ? -0.36 : 0.36);
        const x = cx + Math.cos(a) * (LOCK.plate - 13);
        const y = cy + Math.sin(a) * (LOCK.plate - 13);
        c.fillStyle = 'rgba(0,0,0,0.7)';
        c.beginPath(); c.arc(x, y, 5.5, 0, TAU); c.fill();
        c.save();
        if (on) { c.shadowColor = rgb(THEME.pri, 1); c.shadowBlur = 10; }
        const g = c.createRadialGradient(x - 1.2, y - 1.2, 0.5, x, y, 4);
        g.addColorStop(0, on ? '#fff' : metal(90));
        g.addColorStop(0.5, on ? rgb(THEME.pri) : metal(40));
        g.addColorStop(1, on ? rgb(THEME.pri.map((v) => v * 0.5)) : metal(18));
        c.fillStyle = g;
        c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
        c.restore();
      }
    }

    // Плавающий замок: вокруг цилиндра бежит пунктир
    if (st.kind === 'float') {
      c.save();
      c.strokeStyle = rgb(THEME.acc, 0.55);
      c.lineWidth = 1.5;
      c.setLineDash([3, 7]);
      c.lineDashOffset = -now / 60;
      c.beginPath(); c.arc(cx, cy, cyl + 10, 0, TAU); c.stroke();
      c.restore();
    }

    // Цилиндр: блики неподвижны, вращаются только детали
    const cxs = cx + sx * 0.4;
    const cys = cy + sy * 0.4;
    const cylImg = lockCylinder(px);
    c.drawImage(cylImg, cxs - cyl - 2, cys - cyl - 2, cyl * 2 + 4, cyl * 2 + 4);
    c.save();
    c.translate(cxs, cys);
    c.rotate(rot);
    // Риска и точки показывают поворот
    c.save();
    c.shadowColor = rgb(THEME.pri, 0.9); c.shadowBlur = 5;
    c.fillStyle = st.flash > 0 ? themeLight(1) : rgb(THEME.pri, 0.9);
    c.fillRect(-1.4, -cyl + 6, 2.8, 8);
    c.restore();
    [2.1, 4.2].forEach((a) => {
      const x = Math.sin(a) * (cyl - 17);
      const y = -Math.cos(a) * (cyl - 17);
      c.fillStyle = 'rgba(0,0,0,0.6)';
      c.beginPath(); c.arc(x, y, 2.4, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.beginPath(); c.arc(x + 0.5, y + 0.6, 1.2, 0, TAU); c.fill();
    });
    // Скважина
    keyway(c);
    c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#020202'; c.fill();
    c.save();
    keyway(c); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1.5;
    c.translate(-1.2, -1.2);
    keyway(c); c.stroke();
    c.restore();
    c.restore();

    // Тень и сама отвёртка
    c.save();
    c.translate(cxs + 3, cys + 4); c.rotate(rot);
    wrench(c, R, true);
    c.restore();
    c.save();
    c.translate(cxs, cys); c.rotate(rot);
    wrench(c, R, false);
    c.restore();

    // Шпилька
    const px0 = cx + sx;
    const py0 = cy - 6 + sy;
    const pinAng = st.angle * Math.PI / 180 + (st.jammed ? (Math.random() - 0.5) * 0.03 * st.shake : 0);
    const len = R * 0.9;
    const broken = st.flash < 0;
    if (st.picks > 0 || broken) {
      const w = Math.min(1, st.wear / 100);
      const base = mixc(st.skin || THEME.pri, [255, 80, 40], w * w * 0.9 + w * 0.1);
      const alpha = broken ? Math.max(0, 1 + st.flash * 2) : 1;
      c.save();
      c.globalAlpha = alpha;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.translate(px0 + 2.5, py0 + 3.5); c.rotate(pinAng);
      pinPath(c, len, broken);
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 3.6; c.stroke();
      c.restore();

      c.save();
      c.globalAlpha = alpha;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.translate(px0, py0); c.rotate(pinAng);
      pinPath(c, len, broken);
      c.strokeStyle = rgb(base.map((v) => v * 0.32)); c.lineWidth = 3.8; c.stroke();
      if (!st.skin || w > 0.5) { c.shadowColor = rgb(base, 0.9); c.shadowBlur = st.skin ? 10 * w : 6 + 8 * w; }
      c.strokeStyle = rgb(base); c.lineWidth = 2.4; c.stroke();
      c.shadowBlur = 0;
      c.translate(-0.6, 0);
      pinPath(c, len, broken);
      c.strokeStyle = rgb(mixc(base, [255, 255, 255], 0.75), 0.75); c.lineWidth = 0.8; c.stroke();
      if (!broken) {
        // Шарик на конце волнистой ножки
        c.fillStyle = rgb(mixc(base, [255, 255, 255], 0.3));
        c.beginPath(); c.arc(7.8, -len * 0.36, 1.9, 0, TAU); c.fill();
      }
      c.restore();
    }

    // Искры: заело — летят из скважины, сломалась — вспышка и обломки, открыто — кольца
    const tipX = px0 + Math.sin(pinAng) * 6;
    const tipY = py0 - Math.cos(pinAng) * 6;
    if (st.jammed && st.picks > 0 && !broken && Math.random() < 0.55 + st.wear / 200) {
      spark(tipX, tipY, pinAng - Math.PI / 2 + (Math.random() - 0.5) * 2.4, 50 + Math.random() * 130, [255, 215, 140], 0.2 + Math.random() * 0.35);
    }
    if (st.flash < 0 && prevFlash >= 0) {
      burst(tipX, tipY, 30, [255, 190, 110], 220);
      for (let i = 0; i < 2; i++) {
        const a = pinAng - Math.PI / 2 + (i ? 0.7 : -0.7);
        particles.push({
          x: px0 + Math.sin(pinAng) * len * 0.6, y: py0 - Math.cos(pinAng) * len * 0.6,
          vx: Math.cos(a) * (70 + Math.random() * 60), vy: Math.sin(a) * (70 + Math.random() * 60) - 60,
          life: 0.9, max: 0.9, frag: true, rot: pinAng, vr: (Math.random() - 0.5) * 16, len: len * 0.28,
          col: rgb(st.skin || THEME.pri),
        });
      }
    }
    if (st.flash > 0 && prevFlash <= 0) {
      rings.push({ x: cx, y: cy, r0: cyl, grow: 60, life: 0.7, max: 0.7 });
      rings.push({ x: cx, y: cy, r0: cyl - 20, grow: 95, life: 1, max: 1 });
      burst(cx, cy, 26, mixc(THEME.pri, [255, 255, 255], 0.4), 190);
    }
    prevFlash = st.flash;
    drawParticles(c, dt);

    // Стекло: блик сверху и затемнение по краям
    const gl = c.createRadialGradient(cx - R * 0.35, cy - R * 0.55, 4, cx - R * 0.2, cy - R * 0.3, R * 1.05);
    gl.addColorStop(0, 'rgba(255,255,255,0.10)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    gl.addColorStop(1, 'rgba(0,0,0,0.22)');
    c.fillStyle = gl;
    c.fillRect(0, 0, V, V);

    if (st.flash > 0) {
      c.save();
      c.shadowColor = themeLight(1); c.shadowBlur = 16;
      c.strokeStyle = themeLight(0.3 + st.flash * 0.7);
      c.lineWidth = 3;
      c.beginPath(); c.arc(cx, cy, cyl + 3, 0, TAU); c.stroke();
      c.restore();
    }
  }

  // ─── ДИСК СЕЙФА ──────────────────────────────
  const SAFE = { V: 200, out: 98, ring: 86, knob: 44 };

  function safeBase(px) {
    return layer('safe-base', px, px, (c) => {
      const s = px / SAFE.V;
      c.setTransform(s, 0, 0, s, 0, 0);
      const m = SAFE.V / 2;
      c.fillStyle = '#000';
      c.fillRect(0, 0, SAFE.V, SAFE.V);
      bevel(c, m, m, SAFE.out + 8, SAFE.out - 6, 160, 30);
      bevel(c, m, m, SAFE.out - 6, SAFE.ring, 24, 125);
      const g = c.createRadialGradient(m, m, SAFE.knob, m, m, SAFE.ring);
      g.addColorStop(0, metal(12));
      g.addColorStop(0.7, metal(30));
      g.addColorStop(1, metal(20));
      c.fillStyle = g;
      c.beginPath(); c.arc(m, m, SAFE.ring, 0, TAU); c.fill();
    });
  }

  function safeKnob(px) {
    const size = Math.ceil(px * (SAFE.knob * 2 + 4) / SAFE.V);
    return layer('safe-knob', size, size, (c) => {
      const s = px / SAFE.V;
      c.setTransform(s, 0, 0, s, 0, 0);
      const m = SAFE.knob + 2;
      const r = SAFE.knob - 7;
      brushed(c, m, m, r, 120, seeded(5), 0.2);
      bevel(c, m, m, r, r - 3, 210, 55);
      const sh = c.createLinearGradient(m - r, m - r, m + r, m + r);
      sh.addColorStop(0, 'rgba(255,255,255,0.16)');
      sh.addColorStop(0.5, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.45)');
      c.fillStyle = sh;
      c.beginPath(); c.arc(m, m, r, 0, TAU); c.fill();
    });
  }

  function drawSafe(c, now, st) {
    const px = c.canvas.width;
    const V = SAFE.V;
    const s = px / V;
    const m = V / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(safeBase(px), 0, 0);
    c.setTransform(s, 0, 0, s, 0, 0);

    const dial = -st.pos / st.N * TAU;
    const ang = (k) => ((k - st.pos) / st.N) * TAU - Math.PI / 2;

    if (st.hint) {
      c.save();
      c.shadowColor = rgb(THEME.acc, 0.9); c.shadowBlur = 10;
      c.strokeStyle = rgb(THEME.acc, 0.4 + 0.2 * Math.sin(now / 250));
      c.lineWidth = 9;
      c.beginPath(); c.arc(m, m, SAFE.ring - 8, ang(st.hint.a - 0.5), ang(st.hint.b + 0.5)); c.stroke();
      c.restore();
    }

    // Кольцо с делениями и числами
    c.save();
    c.translate(m, m);
    c.rotate(dial);
    c.font = 'bold 12px "Ubuntu Mono", monospace';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k < st.N; k++) {
      const big = k % 5 === 0;
      c.save();
      c.rotate(k / st.N * TAU);
      c.fillStyle = rgb(mixc(THEME.pri, [255, 255, 255], 0.35), big ? 0.95 : 0.5);
      c.fillRect(big ? -1 : -0.5, -SAFE.ring + 2, big ? 2 : 1, big ? 9 : 5);
      if (big) {
        c.shadowColor = rgb(THEME.pri, 0.8); c.shadowBlur = 4;
        c.fillText(String(k), 0, -SAFE.ring + 20);
      }
      c.restore();
    }
    c.restore();

    // Ручка: тень, накатка по краю, шлифованный торец, хват
    const kr = SAFE.knob;
    const shd = c.createRadialGradient(m + 3, m + 5, kr - 4, m + 3, m + 5, kr + 12);
    shd.addColorStop(0, 'rgba(0,0,0,0.75)');
    shd.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = shd;
    c.beginPath(); c.arc(m + 3, m + 5, kr + 12, 0, TAU); c.fill();
    c.fillStyle = metal(52);
    c.beginPath(); c.arc(m, m, kr, 0, TAU); c.fill();
    c.save();
    c.translate(m, m);
    c.rotate(dial);
    const teeth = 56;
    for (let i = 0; i < teeth; i++) {
      const a = i / teeth * TAU;
      // Освещённость зубца зависит от того, куда он повёрнут сейчас
      const lit = 0.5 + 0.5 * Math.cos(a + dial + Math.PI * 0.75);
      c.strokeStyle = metal(40 + lit * 170);
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(Math.cos(a) * (kr - 7), Math.sin(a) * (kr - 7));
      c.lineTo(Math.cos(a) * (kr - 0.5), Math.sin(a) * (kr - 0.5));
      c.stroke();
    }
    c.restore();
    c.drawImage(safeKnob(px), m - kr - 2, m - kr - 2, kr * 2 + 4, kr * 2 + 4);
    c.save();
    c.translate(m, m);
    c.rotate(dial);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(c, -6 + 1.5, -kr + 10 + 2, 12, (kr - 10) * 2, 6); c.fill();
    const gg = c.createLinearGradient(-6, 0, 6, 0);
    gg.addColorStop(0, metal(70));
    gg.addColorStop(0.35, metal(215));
    gg.addColorStop(1, metal(55));
    c.fillStyle = gg;
    roundRect(c, -6, -kr + 10, 12, (kr - 10) * 2, 6); c.fill();
    c.shadowColor = rgb(THEME.pri, 0.9); c.shadowBlur = 5;
    c.fillStyle = rgb(THEME.pri);
    c.fillRect(-1.2, -kr + 13, 2.4, 11);
    c.restore();

    // Неподвижная метка сверху
    const near = st.near;
    const hot = near >= 0.999;
    const jit = near > 0 ? (Math.random() - 0.5) * near * 2.4 : 0;
    c.save();
    const col = hot ? mixc(THEME.pri, [255, 255, 255], 0.45) : near > 0 ? THEME.acc : THEME.pri;
    c.shadowColor = rgb(col, 1);
    c.shadowBlur = hot ? 16 : 4 + near * 10;
    c.fillStyle = rgb(col, hot ? 1 : near > 0 ? 0.5 + near * 0.5 : 0.75);
    c.beginPath();
    c.moveTo(m - 7 + jit, 0.5); c.lineTo(m + 7 + jit, 0.5); c.lineTo(m + jit, 15); c.closePath();
    c.fill();
    c.restore();
    if (hot) {
      c.save();
      c.shadowColor = themeLight(1); c.shadowBlur = 14;
      c.strokeStyle = themeLight(0.35 + 0.2 * Math.sin(now / 90));
      c.lineWidth = 2;
      c.beginPath(); c.arc(m, m, SAFE.ring, 0, TAU); c.stroke();
      c.restore();
    }

    const gl = c.createRadialGradient(m - 40, m - 60, 4, m - 20, m - 30, 110);
    gl.addColorStop(0, 'rgba(255,255,255,0.09)');
    gl.addColorStop(0.4, 'rgba(255,255,255,0.015)');
    gl.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = gl;
    c.fillRect(0, 0, V, V);
  }

  function reset() { particles = []; rings = []; prevFlash = 0; }

  return { drawLock, drawSafe, reset, LOCK, SAFE };
})();
