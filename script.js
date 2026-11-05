'use strict';

// ═══════════════════════════════════════════════
// ЗВУК (синтез через Web Audio API)
// ═══════════════════════════════════════════════
let audioCtx = null;
let soundOn = localStorage.getItem('oz.sound') !== 'off';

function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, vol = 0.1, delay = 0) {
  if (!audioCtx || !soundOn) return;
  try {
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch (e) {}
}

function playNoise(duration, vol = 0.1, freq = 900, type = 'bandpass') {
  if (!audioCtx || !soundOn) return;
  try {
    const size = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    src.connect(filter).connect(gain).connect(audioCtx.destination);
    src.start();
  } catch (e) {}
}

const Sound = {
  key()     { playTone(1200 + Math.random() * 300, 'square', 0.015, 0.02); },
  click()   { playTone(950, 'sine', 0.03, 0.08); },
  scratch() { playNoise(0.03, 0.05, 2200 + Math.random() * 1500); },
  tick()    { playTone(320 + Math.random() * 60, 'triangle', 0.02, 0.06); },
  grind()   { playNoise(0.07, 0.12, 180 + Math.random() * 80, 'lowpass'); playTone(55 + Math.random() * 15, 'sawtooth', 0.06, 0.04); },
  snap()    { playNoise(0.25, 0.4, 2500); playTone(110, 'triangle', 0.25, 0.3); },
  unlock()  { playNoise(0.08, 0.25, 600); [523, 659, 784].forEach((f, i) => playTone(f, 'sine', 0.22, 0.12, 0.08 + i * 0.09)); },
  win()     { [440, 554, 659, 880, 1109, 1319].forEach((f, i) => playTone(f, 'sine', 0.3, 0.12, i * 0.11)); },
  good()    { [660, 990].forEach((f, i) => playTone(f, 'sine', 0.18, 0.1, i * 0.09)); },
  fail()    { playTone(120, 'sawtooth', 0.4, 0.15); playTone(90, 'sawtooth', 0.5, 0.15, 0.05); },
};

function vibrate(pattern) {
  if (soundOn && navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) {} }
}

// ═══════════════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════════════
const DIFFS = {
  easy:   { name: 'НОВИЧОК',  picks: 3, wearRate: 55,  levels: [14, 10, 7] },
  normal: { name: 'ВЗЛОМЩИК', picks: 2, wearRate: 75,  levels: [10, 6.5, 4] },
  hard:   { name: 'МАСТЕР',   picks: 1, wearRate: 100, levels: [7, 4.5, 3, 2] },
};

const LEVEL_NAMES = ['НИЗКАЯ ЗАЩИТА', 'СРЕДНЯЯ ЗАЩИТА', 'ВЫСОКАЯ ЗАЩИТА', 'ПРЕДЕЛЬНАЯ ЗАЩИТА'];

const CFG = {
  ROT_SPEED: 70,      // градусов поворота цилиндра в секунду
  RETURN_SPEED: 260,  // скорость возврата цилиндра
  OPEN_ANGLE: 90,     // угол, при котором замок открыт
  FALLOFF: 38,        // на сколько градусов за пределами зоны цилиндр перестаёт двигаться
  PICK_LIMIT: 88,
  DRAG_SENS: 0.55,
  REQ_COOLDOWN: 6,    // секунд блокировки после неверного ответа
};

const S = {
  diff: localStorage.getItem('oz.diff') || 'normal',
  started: false,
  finished: false,
  modalOpen: false,
  level: 0,
  done: [],
  picks: 0,
  wear: 0,
  angle: 0,
  target: 0,
  rot: 0,
  turning: false,
  jammed: false,
  dragging: false,
  dragX0: 0,
  angleBase: 0,
  lastScratchAngle: 0,
  lastTickRot: 0,
  grindT: 0,
  unlocking: false,
  shake: 0,
  flash: 0,
  usedQs: [],
  cooldownUntil: 0,
  startTime: 0,
  elapsed: 0,
  stats: { broken: 0, right: 0, wrong: 0 },
};

const cfg = () => DIFFS[S.diff];
const tol = () => cfg().levels[S.level];

// ═══════════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const canvas = $('lockCanvas');
const ctx = canvas.getContext('2d');
const screenEl = $('screen');
const hackBtn = $('hackBtn');
const hackBar = $('hackBar');
const hackTxt = $('hackBtnText');
const lamp = $('lamp');
const pickCountEl = $('pickCount');
const wearBar = $('wearBar');
const getPinBtn = $('getPinBtn');
const lvlTitle = $('levelTitle');
const levelIndicator = $('levelIndicator');
const hintText = $('hintText');
const logEl = $('log');
const timerEl = $('timer');
const soundBtn = $('soundBtn');
const qOverlay = $('questionOverlay');
const modalTitle = $('modalTitle');
const modalQ = $('modalQ');
const modalOpts = $('modalOpts');
const modalRes = $('modalResult');
const modalCont = $('modalContBtn');
const winOverlay = $('winOverlay');
const startOverlay = $('startOverlay');
const startBtn = $('startBtn');
const restartBtn = $('restartBtn');
const bootLog = $('bootLog');
const bestLine = $('bestLine');

// ═══════════════════════════════════════════════
// ИНТЕРФЕЙС
// ═══════════════════════════════════════════════
function buildBadges() {
  levelIndicator.innerHTML = '';
  cfg().levels.forEach((_, i) => {
    const b = document.createElement('div');
    b.className = 'level-badge';
    b.textContent = `ЗАМОК ${i + 1}`;
    levelIndicator.appendChild(b);
  });
}

function updateBadges() {
  [...levelIndicator.children].forEach((b, i) => {
    b.className = 'level-badge';
    if (S.done[i]) b.classList.add('completed');
    else if (i === S.level) b.classList.add('active');
    else b.classList.add('locked');
  });
  lvlTitle.textContent = `[ ЗАМОК ${S.level + 1}: ${LEVEL_NAMES[S.level]} ]`;
}

function updatePicks(bump) {
  pickCountEl.textContent = S.picks;
  pickCountEl.classList.toggle('empty', S.picks <= 0);
  if (bump) {
    pickCountEl.classList.remove('bump');
    void pickCountEl.offsetWidth;
    pickCountEl.classList.add('bump');
  }
}

function updateWear() {
  const hp = S.picks > 0 ? Math.max(0, 100 - S.wear) : 0;
  wearBar.style.width = hp + '%';
  wearBar.classList.toggle('low', hp < 35);
}

function setLamp(state) {
  lamp.className = 'lamp' + (state ? ' ' + state : '');
}

function log(msg, kind = '') {
  const line = document.createElement('div');
  line.className = 'log-line ' + kind;
  line.textContent = '> ' + msg;
  logEl.appendChild(line);
  while (logEl.children.length > 3) logEl.removeChild(logEl.firstChild);
}

function updateButtons() {
  const blocked = S.finished || S.modalOpen || !S.started || S.unlocking;
  hackBtn.disabled = blocked || S.picks <= 0;
  const cd = Math.ceil((S.cooldownUntil - performance.now()) / 1000);
  getPinBtn.disabled = blocked || S.picks > 0 || cd > 0;
  getPinBtn.textContent = cd > 0 ? `БЛОК ${cd}с` : '+ РЕЗЕРВ';
  getPinBtn.classList.toggle('attention', !getPinBtn.disabled);
  canvas.classList.toggle('disabled-canvas', blocked || S.picks <= 0);

  if (S.started && !S.finished && S.picks <= 0 && !S.modalOpen) {
    hintText.textContent = '[ ОТМЫЧЕК НЕТ — ЗАПРОСИ РЕЗЕРВ ]';
  } else if (!S.turning) {
    hintText.textContent = '[ ТЯНИ ВЛЕВО / ВПРАВО ]';
  }
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function updateSoundBtn() {
  soundBtn.textContent = soundOn ? '♪ ВКЛ' : '♪ ВЫКЛ';
  soundBtn.classList.toggle('off', !soundOn);
}

// ═══════════════════════════════════════════════
// ИГРОВАЯ ЛОГИКА
// ═══════════════════════════════════════════════
function newTarget() {
  // Цель не совпадает со стартовой позицией отмычки
  let t;
  do { t = Math.random() * 160 - 80; } while (Math.abs(t) < tol() * 1.5);
  S.target = t;
}

function maxRotation() {
  const diff = Math.abs(S.angle - S.target);
  if (diff <= tol()) return CFG.OPEN_ANGLE;
  const k = Math.max(0, 1 - (diff - tol()) / CFG.FALLOFF);
  return CFG.OPEN_ANGLE * 0.85 * k;
}

function turnStart() {
  if (S.turning || S.finished || S.modalOpen || !S.started || S.unlocking || S.picks <= 0) return;
  initAudio();
  S.turning = true;
  S.dragging = false;
  hackBtn.classList.add('pressed');
  setLamp('active-green');
  hintText.textContent = '[ ДЕРЖИ... ]';
}

function turnStop() {
  if (!S.turning) return;
  S.turning = false;
  S.jammed = false;
  hackBtn.classList.remove('pressed');
  hackBtn.style.transform = '';
  if (!S.unlocking) setLamp('');
  updateButtons();
}

function breakPick() {
  S.picks--;
  S.wear = 0;
  S.stats.broken++;
  S.rot = 0;
  S.flash = -1;
  turnStop();
  updatePicks(true);
  updateWear();
  Sound.snap();
  vibrate([60, 40, 120]);
  screenEl.classList.remove('hit');
  void screenEl.offsetWidth;
  screenEl.classList.add('hit');
  setLamp('red');
  setTimeout(() => { if (!S.turning) setLamp(''); }, 600);
  hackTxt.textContent = 'ОТМЫЧКА СЛОМАНА';
  setTimeout(() => { if (!S.turning && !S.unlocking) hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)'; }, 1100);
  log(S.picks > 0 ? `Отмычка сломана. Осталось: ${S.picks}` : 'Последняя отмычка сломана. Нужен резерв.', 'bad');
  updateButtons();
}

function unlockLevel() {
  S.unlocking = true;
  S.done[S.level] = true;
  S.flash = 1;
  turnStop();
  setLamp('active-green');
  Sound.unlock();
  vibrate(40);
  hackTxt.textContent = 'ЗАМОК ОТКРЫТ!';
  canvas.classList.add('success-glow');
  updateBadges();
  log(`Замок ${S.level + 1} вскрыт.`, 'good');
  updateButtons();
  setTimeout(advanceLevel, 1300);
}

function advanceLevel() {
  canvas.classList.remove('success-glow');
  S.unlocking = false;
  if (S.level + 1 < cfg().levels.length) {
    S.level++;
    S.rot = 0;
    S.angle = 0;
    newTarget();
    updateBadges();
    setLamp('');
    hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
    log(`Замок ${S.level + 1}: допуск ±${tol()}°.`);
    updateButtons();
  } else {
    finishGame();
  }
}

function update(dt) {
  if (!S.started || S.finished) return;

  S.elapsed = performance.now() - S.startTime;
  timerEl.textContent = fmtTime(S.elapsed);

  if (S.turning) {
    const limit = maxRotation();
    if (S.rot < limit) {
      S.rot = Math.min(limit, S.rot + CFG.ROT_SPEED * dt);
      S.jammed = false;
    }
    if (S.rot >= CFG.OPEN_ANGLE) { unlockLevel(); return; }
    if (S.rot >= limit - 0.01) {
      // Цилиндр упёрся — отмычка изнашивается
      if (!S.jammed) { S.jammed = true; setLamp('red'); hintText.textContent = '[ ЗАКЛИНИЛО! ОТПУСТИ! ]'; }
      S.wear += cfg().wearRate * dt;
      S.grindT -= dt;
      if (S.grindT <= 0) { Sound.grind(); vibrate(25); S.grindT = 0.08; }
      const f = 1 + S.wear / 25;
      hackBtn.style.transform = `translate(${(Math.random() - .5) * f}px, ${(Math.random() - .5) * f}px)`;
      updateWear();
      if (S.wear >= 100) { breakPick(); return; }
    }
    if (S.rot - S.lastTickRot > 6) { Sound.tick(); S.lastTickRot = S.rot; }
  } else if (S.rot > 0 && !S.unlocking) {
    S.rot = Math.max(0, S.rot - CFG.RETURN_SPEED * dt);
    S.lastTickRot = S.rot;
  }

  S.shake = S.jammed ? Math.min(S.shake + dt * 12, 3 + S.wear / 30) : S.shake * 0.82;
  if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 1.2);
  if (S.flash < 0) S.flash = Math.min(0, S.flash + dt * 2);

  const pct = Math.min(100, S.rot / CFG.OPEN_ANGLE * 100);
  hackBar.style.width = pct + '%';
  hackBar.classList.toggle('jam', S.jammed);
  if (S.turning) hackTxt.textContent = `ЦИЛИНДР: ${Math.floor(pct)}%`;
  else if (!S.unlocking && hackTxt.textContent.startsWith('ЦИЛИНДР')) hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
}

// ═══════════════════════════════════════════════
// ОТРИСОВКА ЗАМКА
// ═══════════════════════════════════════════════
const VIEW = 240; // логический размер холста

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const css = canvas.getBoundingClientRect().width || VIEW;
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
}

function drawFrame() {
  const scale = canvas.width / VIEW;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, VIEW, VIEW);

  const cx = VIEW / 2, cy = VIEW / 2, R = VIEW * 0.46;
  const sx = (Math.random() - 0.5) * S.shake;
  const sy = (Math.random() - 0.5) * S.shake;
  const rotRad = S.rot * Math.PI / 180;
  const green = S.flash > 0 ? `rgba(120,255,120,${0.4 + S.flash * 0.6})` : 'rgba(51,255,51,0.85)';

  // Корпус
  const body = ctx.createRadialGradient(cx, cy - 20, 10, cx, cy, R);
  body.addColorStop(0, '#0f1f0f');
  body.addColorStop(1, '#040904');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a5a2a'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = 'rgba(51,255,51,0.08)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, R - 7, 0, Math.PI * 2); ctx.stroke();

  // Шкала (верхняя полуокружность — зона хода отмычки)
  for (let a = -90; a <= 90; a += 5) {
    const rad = (a - 90) * Math.PI / 180;
    const big = a % 30 === 0;
    const len = big ? 10 : a % 15 === 0 ? 6 : 3;
    ctx.strokeStyle = big ? 'rgba(51,255,51,0.45)' : 'rgba(51,255,51,0.2)';
    ctx.lineWidth = big ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + (R - 10 - len) * Math.cos(rad), cy + (R - 10 - len) * Math.sin(rad));
    ctx.lineTo(cx + (R - 10) * Math.cos(rad), cy + (R - 10) * Math.sin(rad));
    ctx.stroke();
  }

  // Болты
  ctx.fillStyle = '#1a331a';
  ctx.strokeStyle = '#3c6b3c';
  [45, 135, 225, 315].forEach((deg) => {
    const r = deg * Math.PI / 180;
    const bx = cx + (R - 16) * Math.cos(r), by = cy + (R - 16) * Math.sin(r);
    if (by < cy) return; // верхние болты мешают шкале
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - 3, by); ctx.lineTo(bx + 3, by); ctx.stroke();
  });

  // Цилиндр
  ctx.save();
  ctx.translate(cx + sx * 0.4, cy + sy * 0.4);
  ctx.rotate(rotRad);
  const cylR = R * 0.5;
  const cyl = ctx.createRadialGradient(-10, -10, 4, 0, 0, cylR);
  cyl.addColorStop(0, '#1d3a1d');
  cyl.addColorStop(1, '#0a160a');
  ctx.fillStyle = cyl;
  ctx.beginPath(); ctx.arc(0, 0, cylR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = S.flash > 0 ? green : '#3f8f3f';
  ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(51,255,51,0.12)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(0, 0, cylR - 6, 0, Math.PI * 2); ctx.stroke();
  // Метка поворота
  ctx.fillStyle = 'rgba(51,255,51,0.5)';
  ctx.fillRect(-1.5, -cylR + 2, 3, 7);
  // Замочная скважина
  ctx.fillStyle = '#010301';
  ctx.beginPath();
  ctx.arc(0, -6, 8, 0, Math.PI * 2);
  ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.lineTo(6, 20); ctx.lineTo(-6, 20); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  // Натяжитель (вставлен снизу скважины, поворачивается вместе с цилиндром)
  ctx.strokeStyle = '#6f8f66'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(0, R * 0.62); ctx.lineTo(R * 0.3, R * 0.75); ctx.stroke();
  ctx.strokeStyle = '#a5c49a'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-1, 16); ctx.lineTo(-1, R * 0.6); ctx.stroke();
  ctx.restore();

  // Отмычка
  if (S.picks > 0 || S.flash < 0) {
    ctx.save();
    ctx.translate(cx + sx, cy - 6 + sy);
    ctx.rotate(S.angle * Math.PI / 180 + (S.jammed ? (Math.random() - 0.5) * 0.03 * S.shake : 0));
    const len = R * 0.92;
    const broken = S.flash < 0;
    ctx.globalAlpha = broken ? Math.max(0, 1 + S.flash * 2) : 1;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Тень
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(1, 2); ctx.lineTo(1, -len + 2); ctx.stroke();
    // Тело
    const wearC = Math.min(1, S.wear / 100);
    ctx.strokeStyle = `rgb(${Math.round(150 + 90 * wearC)}, ${Math.round(190 - 90 * wearC)}, ${Math.round(140 - 80 * wearC)})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, broken ? -len * 0.45 : -len + 6);
    if (!broken) ctx.arc(5, -len + 6, 5, Math.PI, Math.PI * 1.9, false);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-1, broken ? -len * 0.4 : -len + 10); ctx.stroke();
    ctx.restore();
  }

  // Подсветка при успехе
  if (S.flash > 0) {
    ctx.strokeStyle = green;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, Math.PI * 2); ctx.stroke();
  }
}

let lastT = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  update(dt);
  drawFrame();
  if (S.cooldownUntil && now < S.cooldownUntil + 1000) updateButtons();
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════
// УПРАВЛЕНИЕ ОТМЫЧКОЙ
// ═══════════════════════════════════════════════
function canMovePick() {
  return S.started && !S.finished && !S.modalOpen && !S.turning && !S.unlocking && S.picks > 0 && S.rot < 1;
}

function setAngle(a) {
  S.angle = Math.max(-CFG.PICK_LIMIT, Math.min(CFG.PICK_LIMIT, a));
  if (Math.abs(S.angle - S.lastScratchAngle) > 3) {
    Sound.scratch();
    S.lastScratchAngle = S.angle;
  }
}

canvas.addEventListener('pointerdown', (e) => {
  if (!canMovePick()) return;
  initAudio();
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  S.dragging = true;
  S.dragX0 = e.clientX;
  S.angleBase = S.angle;
});
canvas.addEventListener('pointermove', (e) => {
  if (!S.dragging) return;
  if (!canMovePick()) { S.dragging = false; return; }
  const rect = canvas.getBoundingClientRect();
  const dx = (e.clientX - S.dragX0) * (VIEW / rect.width);
  setAngle(S.angleBase + dx * CFG.DRAG_SENS);
});
const endDrag = () => { S.dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

hackBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); turnStart(); });
hackBtn.addEventListener('pointerup', turnStop);
hackBtn.addEventListener('pointerleave', turnStop);
hackBtn.addEventListener('pointercancel', turnStop);
hackBtn.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', turnStop);

const keysHeld = new Set();
window.addEventListener('keydown', (e) => {
  if (S.modalOpen) {
    // Ответ на вопрос цифрами 1–4, продолжить — Enter
    const n = parseInt(e.key, 10);
    const btns = modalOpts.querySelectorAll('.opt-btn');
    if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) btns[n - 1].click();
    else if ((e.key === 'Enter' || e.key === ' ') && modalCont.style.display === 'block') { e.preventDefault(); modalCont.click(); }
    return;
  }
  if (!S.started) {
    if (e.key === 'Enter') startBtn.click();
    return;
  }
  if (S.finished) {
    if (e.key === 'Enter') restartBtn.click();
    return;
  }
  if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') { toggleSound(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (canMovePick()) {
      initAudio();
      const step = (e.shiftKey ? 0.5 : 2) * (e.key === 'ArrowLeft' ? -1 : 1);
      setAngle(S.angle + step);
    }
    return;
  }
  if (e.key === ' ' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!keysHeld.has(e.key)) { keysHeld.add(e.key); turnStart(); }
    return;
  }
  if ((e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') && !getPinBtn.disabled) getPinBtn.click();
});
window.addEventListener('keyup', (e) => {
  if (keysHeld.delete(e.key) && keysHeld.size === 0) turnStop();
});

// ═══════════════════════════════════════════════
// КОНТРОЛЬНЫЕ ВОПРОСЫ
// ═══════════════════════════════════════════════
function nextQuestion() {
  if (S.usedQs.length >= QUESTIONS.length) S.usedQs = [];
  let idx;
  do { idx = Math.floor(Math.random() * QUESTIONS.length); } while (S.usedQs.includes(idx));
  S.usedQs.push(idx);
  return QUESTIONS[idx];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function openQuestion() {
  S.modalOpen = true;
  turnStop();
  updateButtons();

  const q = nextQuestion();
  const opts = shuffle(q.opts.map((text, i) => ({ text, ok: i === q.ok })));

  modalTitle.textContent = 'ЗАПРОС ИДЕНТИФИКАЦИИ';
  modalQ.textContent = q.text;
  modalOpts.innerHTML = '';
  modalRes.textContent = '';
  modalRes.className = 'modal-result';
  modalCont.style.display = 'none';

  let answered = false;
  opts.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = 'opt-btn';
    btn.innerHTML = `<span class="opt-key">${i + 1}</span>`;
    btn.appendChild(document.createTextNode(opt.text));
    btn.addEventListener('click', () => {
      if (answered) return;
      answered = true;
      modalOpts.querySelectorAll('.opt-btn').forEach((b, idx) => {
        b.disabled = true;
        if (opts[idx].ok) b.classList.add('correct');
        else if (idx === i) b.classList.add('wrong');
      });
      if (opt.ok) {
        S.picks++;
        S.wear = 0;
        S.stats.right++;
        updatePicks(true);
        updateWear();
        modalRes.textContent = 'ДОСТУП ПОДТВЕРЖДЁН: ВЫДАНА ОТМЫЧКА (+1)';
        modalRes.classList.add('good');
        Sound.good();
        log('Резерв выдан: +1 отмычка.', 'good');
      } else {
        S.stats.wrong++;
        S.cooldownUntil = performance.now() + CFG.REQ_COOLDOWN * 1000;
        modalRes.textContent = `ОТКАЗАНО. ПОВТОРНЫЙ ЗАПРОС ЧЕРЕЗ ${CFG.REQ_COOLDOWN} С`;
        modalRes.classList.add('bad');
        Sound.fail();
        log('Идентификация провалена.', 'bad');
      }
      modalCont.style.display = 'block';
      modalCont.focus({ preventScroll: true });
    });
    modalOpts.appendChild(btn);
  });

  qOverlay.classList.add('visible');
}

function closeQuestion() {
  Sound.click();
  qOverlay.classList.remove('visible');
  S.modalOpen = false;
  updateButtons();
}

getPinBtn.addEventListener('click', () => {
  initAudio();
  Sound.click();
  if (!S.finished && !S.modalOpen && S.picks <= 0) openQuestion();
});
modalCont.addEventListener('click', closeQuestion);

// ═══════════════════════════════════════════════
// СТАРТ / ФИНАЛ
// ═══════════════════════════════════════════════
function bestKey() { return 'oz.best.' + S.diff; }

function showBest() {
  const best = JSON.parse(localStorage.getItem(bestKey()) || 'null');
  bestLine.textContent = best ? `РЕКОРД (${cfg().name}): ${fmtTime(best.time)} · сломано отмычек: ${best.broken}` : '';
}

function resetGame() {
  S.started = false;
  S.finished = false;
  S.modalOpen = false;
  S.level = 0;
  S.done = cfg().levels.map(() => false);
  S.picks = cfg().picks;
  S.wear = 0;
  S.angle = 0;
  S.rot = 0;
  S.turning = false;
  S.jammed = false;
  S.unlocking = false;
  S.flash = 0;
  S.cooldownUntil = 0;
  S.stats = { broken: 0, right: 0, wrong: 0 };
  newTarget();
  buildBadges();
  updateBadges();
  updatePicks(false);
  updateWear();
  setLamp('');
  hackBar.style.width = '0%';
  hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
  timerEl.textContent = '00:00';
  logEl.innerHTML = '';
  canvas.classList.remove('success-glow');
  updateButtons();
}

function startGame() {
  initAudio();
  Sound.click();
  startOverlay.classList.remove('visible');
  S.started = true;
  S.startTime = performance.now();
  log(`Режим «${cfg().name}». Отмычек: ${S.picks}. Допуск ±${tol()}°.`);
  updateButtons();
}

function rankFor(broken, wrong) {
  const score = broken + wrong * 0.5;
  if (score === 0) return 'ПРИЗРАК — ни одной сломанной отмычки';
  if (score <= 1) return 'ПРОФЕССИОНАЛ';
  if (score <= 3) return 'ВЗЛОМЩИК';
  return 'ГРУБАЯ СИЛА';
}

function finishGame() {
  S.finished = true;
  turnStop();
  updateButtons();
  Sound.win();

  const time = S.elapsed;
  const prev = JSON.parse(localStorage.getItem(bestKey()) || 'null');
  const isRecord = !prev || time < prev.time;
  if (isRecord) localStorage.setItem(bestKey(), JSON.stringify({ time, broken: S.stats.broken }));

  $('endTitle').textContent = 'ДОСТУП РАЗРЕШЁН';
  $('endMsg').innerHTML = '';
  [
    'ВСЕ ЗАМКИ ВСКРЫТЫ.',
    `РЕЖИМ: ${cfg().name}`,
    `РАНГ: ${rankFor(S.stats.broken, S.stats.wrong)}`,
  ].forEach((t, i) => {
    const p = document.createElement('p');
    p.className = 'line-reveal';
    p.style.animationDelay = (0.3 + i * 0.6) + 's';
    p.textContent = t;
    $('endMsg').appendChild(p);
  });

  $('stats').innerHTML = `
    <div class="stat"><span>ВРЕМЯ</span><b>${fmtTime(time)}${isRecord ? ' ★' : ''}</b></div>
    <div class="stat"><span>СЛОМАНО</span><b>${S.stats.broken}</b></div>
    <div class="stat"><span>ОТВЕТЫ</span><b>${S.stats.right}/${S.stats.right + S.stats.wrong}</b></div>
  `;
  if (isRecord && prev) log('Новый рекорд!', 'good');

  winOverlay.classList.add('visible');
  startRain();
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
  Sound.click();
  winOverlay.classList.remove('visible');
  stopRain();
  resetGame();
  showBest();
  startOverlay.classList.add('visible');
});

document.querySelectorAll('.diff-btn').forEach((b) => {
  b.classList.toggle('active', b.dataset.diff === S.diff);
  b.setAttribute('aria-checked', b.dataset.diff === S.diff);
  b.addEventListener('click', () => {
    initAudio();
    Sound.key();
    S.diff = b.dataset.diff;
    localStorage.setItem('oz.diff', S.diff);
    document.querySelectorAll('.diff-btn').forEach((x) => {
      x.classList.toggle('active', x === b);
      x.setAttribute('aria-checked', x === b);
    });
    resetGame();
    showBest();
  });
});

function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem('oz.sound', soundOn ? 'on' : 'off');
  updateSoundBtn();
  if (soundOn) { initAudio(); Sound.click(); }
}
soundBtn.addEventListener('click', toggleSound);

// ═══════════════════════════════════════════════
// ЭФФЕКТЫ: загрузочный лог и цифровой дождь
// ═══════════════════════════════════════════════
const BOOT_LINES = [
  'ROBUST-OS BIOS v4.1 ............ OK',
  'ПАМЯТЬ: 64K ..................... OK',
  'ДАТЧИК ДАВЛЕНИЯ ЦИЛИНДРА ........ OK',
  'ЗАМКИ В ЦЕПИ .................... ЗАБЛОКИРОВАНЫ',
  'ЗАГРУЗКА УТИЛИТЫ ВЗЛОМА ......... ГОТОВО',
];

function runBoot() {
  bootLog.innerHTML = '';
  let i = 0;
  const next = () => {
    if (i >= BOOT_LINES.length) return;
    const line = document.createElement('div');
    line.textContent = BOOT_LINES[i++];
    bootLog.appendChild(line);
    setTimeout(next, 180);
  };
  next();
}

const rainCanvas = $('rainCanvas');
const rctx = rainCanvas.getContext('2d');
let rainRAF = null;
function startRain() {
  const chars = '01ΔΣΩ#$%&@ЖЮЯ7<>/\\=+*';
  const fs = 16;
  rainCanvas.width = window.innerWidth;
  rainCanvas.height = window.innerHeight;
  const cols = Math.ceil(rainCanvas.width / fs);
  const drops = Array.from({ length: cols }, () => Math.random() * -50);
  let last = 0;
  const step = (t) => {
    rainRAF = requestAnimationFrame(step);
    if (t - last < 50) return;
    last = t;
    rctx.fillStyle = 'rgba(0,0,0,0.12)';
    rctx.fillRect(0, 0, rainCanvas.width, rainCanvas.height);
    rctx.font = fs + 'px VT323, monospace';
    drops.forEach((y, i) => {
      rctx.fillStyle = Math.random() < 0.05 ? '#caffca' : 'rgba(51,255,51,0.55)';
      rctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fs, y * fs);
      drops[i] = y * fs > rainCanvas.height && Math.random() > 0.97 ? 0 : y + 1;
    });
  };
  rainRAF = requestAnimationFrame(step);
}
function stopRain() {
  if (rainRAF) cancelAnimationFrame(rainRAF);
  rainRAF = null;
  rctx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
}

// ═══════════════════════════════════════════════
// ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
updateSoundBtn();
resetGame();
showBest();
runBoot();
requestAnimationFrame(loop);
