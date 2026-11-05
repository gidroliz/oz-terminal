'use strict';

// ═══════════════════════════════════════════════
// НАСТРОЙКИ
// ═══════════════════════════════════════════════
const L = (tol) => ({ type: 'lock', tol });
const T = (len, count) => ({ type: 'term', len, count });

const DIFFS = {
  easy:   { name: 'НОВИЧОК',  picks: 3, wearRate: 55,  stages: [L(14), T(5, 10), L(9)] },
  normal: { name: 'ВЗЛОМЩИК', picks: 2, wearRate: 75,  stages: [L(10), T(6, 12), L(6.5), T(7, 14), L(4)] },
  hard:   { name: 'МАСТЕР',   picks: 1, wearRate: 100, stages: [L(7), T(7, 14), L(4), T(8, 16), L(2.5)] },
};

const CFG = {
  ROT_SPEED: 70,       // градусов поворота цилиндра в секунду
  RETURN_SPEED: 260,   // скорость возврата цилиндра
  OPEN_ANGLE: 90,      // угол, при котором замок открыт
  FALLOFF: 38,         // на сколько градусов за пределами зоны цилиндр перестаёт двигаться
  PICK_LIMIT: 88,
  DRAG_SENS: 0.55,
  REQ_COOLDOWN: 6,     // секунд блокировки резерва после неверного ответа
  TERM_LOCKOUT: 10,    // секунд перезагрузки терминала
};

const ACHIEVEMENTS = [
  { id: 'first',   name: 'ПЕРВЫЙ ДОСТУП', desc: 'Пройти любой взлом до конца' },
  { id: 'ghost',   name: 'ПРИЗРАК',       desc: 'Пройти взлом, не сломав ни одной отмычки' },
  { id: 'hacker',  name: 'ХАКЕР',         desc: 'Взломать терминал с первой попытки' },
  { id: 'master',  name: 'МАСТЕР',        desc: 'Пройти режим «Мастер»' },
  { id: 'speed',   name: 'СКОРОСТРЕЛ',    desc: 'Пройти «Взломщика» или «Мастера» быстрее 2 минут' },
  { id: 'erudite', name: 'ЭРУДИТ',        desc: 'Дать 10 верных ответов на контрольные вопросы' },
  { id: 'brute',   name: 'ГРУБАЯ СИЛА',   desc: 'Сломать 10 отмычек' },
  { id: 'veteran', name: 'ВЕТЕРАН',       desc: 'Пройти 10 взломов' },
];

// ═══════════════════════════════════════════════
// ПРОФИЛЬ (статистика за всё время)
// ═══════════════════════════════════════════════
const PROFILE_KEY = 'oz.profile';
const RUN_KEY = 'oz.run';

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}

function emptyProfile() {
  return { runs: 0, finished: 0, locks: 0, terms: 0, broken: 0, right: 0, wrong: 0, lockouts: 0, playMs: 0, best: {}, history: [], ach: {} };
}

const P = Object.assign(emptyProfile(), loadJSON(PROFILE_KEY, {}));
// Перенос рекордов из прошлой версии
['easy', 'normal', 'hard'].forEach((d) => {
  const old = loadJSON('oz.best.' + d, null);
  if (old && !P.best[d]) P.best[d] = old;
  localStorage.removeItem('oz.best.' + d);
});

function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(P)); }

function unlock(id) {
  if (P.ach[id]) return false;
  P.ach[id] = Date.now();
  saveProfile();
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  toast(`★ ДОСТИЖЕНИЕ: ${a.name}`);
  log(`Достижение: ${a.name}`, 'good');
  Sound.good();
  return true;
}

// ═══════════════════════════════════════════════
// СОСТОЯНИЕ ВЗЛОМА
// ═══════════════════════════════════════════════
const S = {
  diff: localStorage.getItem('oz.diff') || 'normal',
  topics: loadJSON('oz.topics', Object.keys(QUESTION_TOPICS)),
  tab: 'hack',
  started: false,
  finished: false,
  modalOpen: false,
  stage: 0,
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
  advancing: false,
  shake: 0,
  flash: 0,
  term: null,
  termLockLeft: 0,
  usedQs: [],
  cooldownLeft: 0,
  elapsed: 0,
  stats: { broken: 0, right: 0, wrong: 0, lockouts: 0 },
  journal: [],
};
if (!DIFFS[S.diff]) S.diff = 'normal';
let chosenDiff = S.diff; // режим, выбранный на стартовом экране для нового взлома

const cfg = () => DIFFS[S.diff];
const stageCfg = () => cfg().stages[S.stage];
const isLock = () => stageCfg().type === 'lock';
const tol = () => stageCfg().tol;

function stageLabel(i) {
  const st = cfg().stages;
  const n = st.slice(0, i + 1).filter((s) => s.type === st[i].type).length;
  return (st[i].type === 'lock' ? 'ЗАМОК ' : 'ТЕРМ ') + n;
}

function protectionName(t) {
  if (t >= 10) return 'НИЗКАЯ ЗАЩИТА';
  if (t >= 6) return 'СРЕДНЯЯ ЗАЩИТА';
  if (t >= 3.5) return 'ВЫСОКАЯ ЗАЩИТА';
  return 'ПРЕДЕЛЬНАЯ ЗАЩИТА';
}

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
const lockView = $('lockView');
const termView = $('termView');
const actionPanel = $('actionPanel');
const qOverlay = $('questionOverlay');
const modalTitle = $('modalTitle');
const modalQ = $('modalQ');
const modalOpts = $('modalOpts');
const modalRes = $('modalResult');
const modalCont = $('modalContBtn');
const winOverlay = $('winOverlay');
const startOverlay = $('startOverlay');
const startBtn = $('startBtn');
const continueBtn = $('continueBtn');
const restartBtn = $('restartBtn');
const bootLog = $('bootLog');
const bestLine = $('bestLine');
const toastEl = $('toast');

// ═══════════════════════════════════════════════
// ИНТЕРФЕЙС
// ═══════════════════════════════════════════════
function buildBadges() {
  levelIndicator.innerHTML = '';
  cfg().stages.forEach((st, i) => {
    const b = document.createElement('div');
    b.className = 'level-badge ' + st.type;
    b.textContent = stageLabel(i);
    levelIndicator.appendChild(b);
  });
}

function updateBadges() {
  [...levelIndicator.children].forEach((b, i) => {
    b.classList.remove('completed', 'active', 'locked');
    if (S.done[i]) b.classList.add('completed');
    else if (i === S.stage) b.classList.add('active');
    else b.classList.add('locked');
  });
  const st = stageCfg();
  lvlTitle.textContent = st.type === 'lock'
    ? `[ ${stageLabel(S.stage)}: ${protectionName(st.tol)} ]`
    : `[ ТЕРМИНАЛ ${stageLabel(S.stage).split(' ')[1]}: ПАРОЛЬ ИЗ ${st.len} БУКВ ]`;
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
  S.journal.push({ t: fmtTime(S.elapsed), m: msg, k: kind });
  if (S.journal.length > 200) S.journal.shift();
  renderLog();
  if (S.tab === 'data') renderData();
}

function renderLog() {
  logEl.innerHTML = '';
  S.journal.slice(-3).forEach((l) => {
    const line = document.createElement('div');
    line.className = 'log-line ' + l.k;
    line.textContent = '> ' + l.m;
    logEl.appendChild(line);
  });
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2600);
}

function updateButtons() {
  const blocked = S.finished || S.modalOpen || !S.started || S.advancing;
  hackBtn.disabled = blocked || S.picks <= 0 || !isLock();
  const cd = Math.ceil(S.cooldownLeft / 1000);
  getPinBtn.disabled = blocked || S.picks > 0 || cd > 0;
  getPinBtn.textContent = cd > 0 ? `БЛОК ${cd}с` : '+ РЕЗЕРВ';
  getPinBtn.classList.toggle('attention', !getPinBtn.disabled && isLock());
  canvas.classList.toggle('disabled-canvas', blocked || S.picks <= 0);
  Terminal.setEnabled(!blocked && S.termLockLeft <= 0);

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

function fmtLong(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} ч ${m % 60} мин` : `${m} мин ${Math.floor(ms / 1000) % 60} с`;
}

function updateSoundBtn() {
  soundBtn.textContent = AudioEngine.enabled ? '♪ ВКЛ' : '♪ ВЫКЛ';
  soundBtn.classList.toggle('off', !AudioEngine.enabled);
}

// ═══════════════════════════════════════════════
// ЭТАПЫ
// ═══════════════════════════════════════════════
function newTarget() {
  let t;
  do { t = Math.random() * 160 - 80; } while (Math.abs(t) < tol() * 1.5);
  S.target = t;
}

function enterStage(fresh) {
  S.rot = 0;
  S.turning = false;
  S.jammed = false;
  if (isLock()) {
    if (fresh) { S.angle = 0; newTarget(); }
    S.term = null;
  } else if (fresh || !S.term) {
    const st = stageCfg();
    S.term = Terminal.create({ len: st.len, count: st.count });
    S.termLockLeft = 0;
  }
  renderStage();
}

function renderStage() {
  const lock = isLock();
  lockView.hidden = !lock;
  termView.hidden = lock;
  actionPanel.classList.toggle('hidden', !lock);
  hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
  hackBar.style.width = '0%';
  setLamp('');
  if (lock) {
    resizeCanvas();
  } else {
    Terminal.mount(termView, S.term, {
      sound: (n) => Sound[n] && Sound[n](),
      onSolved: termSolved,
      onLockout: termLockout,
      onChange: () => saveRun(),
    });
    Terminal.showLock(S.termLockLeft / 1000);
  }
  updateBadges();
  updateButtons();
}

function completeStage(msg) {
  S.advancing = true;
  S.done[S.stage] = true;
  updateBadges();
  log(msg, 'good');
  updateButtons();
  saveRun();
  setTimeout(nextStage, 1300);
}

function nextStage() {
  canvas.classList.remove('success-glow');
  S.advancing = false;
  if (S.stage + 1 < cfg().stages.length) {
    S.stage++;
    enterStage(true);
    log(isLock() ? `${stageLabel(S.stage)}: допуск ±${tol()}°.` : `Терминал: пароль из ${stageCfg().len} букв.`);
    saveRun();
  } else {
    finishGame();
  }
}

// ─── Замок ───────────────────────────────────
function maxRotation() {
  const diff = Math.abs(S.angle - S.target);
  if (diff <= tol()) return CFG.OPEN_ANGLE;
  const k = Math.max(0, 1 - (diff - tol()) / CFG.FALLOFF);
  return CFG.OPEN_ANGLE * 0.85 * k;
}

function turnStart() {
  if (S.turning || S.finished || S.modalOpen || !S.started || S.advancing || S.picks <= 0 || !isLock() || S.tab !== 'hack') return;
  AudioEngine.init();
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
  if (!S.advancing) setLamp('');
  updateButtons();
  saveRun();
}

function breakPick() {
  S.picks--;
  S.wear = 0;
  S.stats.broken++;
  P.broken++;
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
  setTimeout(() => { if (!S.turning && !S.advancing) hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)'; }, 1100);
  log(S.picks > 0 ? `Отмычка сломана. Осталось: ${S.picks}` : 'Последняя отмычка сломана. Нужен резерв.', 'bad');
  if (P.broken >= 10) unlock('brute');
  saveProfile();
  updateButtons();
  saveRun();
}

function unlockLock() {
  S.flash = 1;
  turnStop();
  setLamp('active-green');
  Sound.unlock();
  vibrate(40);
  hackTxt.textContent = 'ЗАМОК ОТКРЫТ!';
  canvas.classList.add('success-glow');
  P.locks++;
  saveProfile();
  completeStage(`${stageLabel(S.stage)} вскрыт.`);
}

// ─── Терминал ────────────────────────────────
function termSolved(t) {
  Sound.granted();
  vibrate(40);
  P.terms++;
  if (t.wrong === 0) unlock('hacker');
  saveProfile();
  completeStage('Терминал взломан.');
}

function termLockout() {
  S.stats.lockouts++;
  P.lockouts++;
  saveProfile();
  Sound.lockout();
  vibrate([100, 50, 100]);
  S.termLockLeft = CFG.TERM_LOCKOUT * 1000;
  Terminal.showLock(CFG.TERM_LOCKOUT);
  log(`Терминал заблокирован. Перезагрузка ${CFG.TERM_LOCKOUT} с.`, 'bad');
  updateButtons();
  saveRun();
}

function termReboot() {
  const st = stageCfg();
  S.term = Terminal.create({ len: st.len, count: st.count });
  S.termLockLeft = 0;
  renderStage();
  log('Терминал перезагружен. Новый пароль.');
  saveRun();
}

// ═══════════════════════════════════════════════
// ИГРОВОЙ ЦИКЛ
// ═══════════════════════════════════════════════
let saveAcc = 0;

function update(dt) {
  const active = S.started && !S.finished && S.tab === 'hack';

  AudioEngine.update({
    hum: S.started && !S.finished,
    turning: S.turning,
    rot: S.rot,
    jammed: S.jammed,
    wear: S.wear,
  });

  if (!active) return;

  S.elapsed += dt * 1000;
  P.playMs += dt * 1000;
  timerEl.textContent = fmtTime(S.elapsed);

  saveAcc += dt;
  if (saveAcc > 3) { saveAcc = 0; saveRun(); saveProfile(); }

  if (S.cooldownLeft > 0) {
    const before = Math.ceil(S.cooldownLeft / 1000);
    S.cooldownLeft = Math.max(0, S.cooldownLeft - dt * 1000);
    if (Math.ceil(S.cooldownLeft / 1000) !== before) updateButtons();
  }

  if (S.termLockLeft > 0) {
    S.termLockLeft -= dt * 1000;
    Terminal.showLock(S.termLockLeft / 1000);
    if (S.termLockLeft <= 0) termReboot();
  }

  if (!isLock()) return;

  if (S.turning) {
    const limit = maxRotation();
    if (S.rot < limit) {
      S.rot = Math.min(limit, S.rot + CFG.ROT_SPEED * dt);
      S.jammed = false;
    }
    if (S.rot >= CFG.OPEN_ANGLE) { unlockLock(); return; }
    if (S.rot >= limit - 0.01) {
      if (!S.jammed) { S.jammed = true; setLamp('red'); hintText.textContent = '[ ЗАКЛИНИЛО! ОТПУСТИ! ]'; vibrate(30); }
      S.wear += cfg().wearRate * dt;
      const f = 1 + S.wear / 25;
      hackBtn.style.transform = `translate(${(Math.random() - .5) * f}px, ${(Math.random() - .5) * f}px)`;
      updateWear();
      if (S.wear >= 100) { breakPick(); return; }
    }
    if (S.rot - S.lastTickRot > 6) { Sound.tick(); S.lastTickRot = S.rot; }
  } else if (S.rot > 0 && !S.advancing) {
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
  else if (!S.advancing && hackTxt.textContent.startsWith('ЦИЛИНДР')) hackTxt.textContent = 'ПРОВЕРНУТЬ (УДЕРЖ.)';
}

// ═══════════════════════════════════════════════
// ОТРИСОВКА ЗАМКА
// ═══════════════════════════════════════════════
const VIEW = 240;

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

  // Шкала
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
  [45, 135].forEach((deg) => {
    const r = deg * Math.PI / 180;
    const bx = cx + (R - 16) * Math.cos(r), by = cy + (R - 16) * Math.sin(r);
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
  ctx.fillStyle = 'rgba(51,255,51,0.5)';
  ctx.fillRect(-1.5, -cylR + 2, 3, 7);
  ctx.fillStyle = '#010301';
  ctx.beginPath();
  ctx.arc(0, -6, 8, 0, Math.PI * 2);
  ctx.moveTo(-4, -2); ctx.lineTo(4, -2); ctx.lineTo(6, 20); ctx.lineTo(-6, 20); ctx.closePath();
  ctx.fill();
  // Натяжитель
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
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(1, 2); ctx.lineTo(1, -len + 2); ctx.stroke();
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
  if (!lockView.hidden && S.tab === 'hack') drawFrame();
  requestAnimationFrame(loop);
}

// ═══════════════════════════════════════════════
// УПРАВЛЕНИЕ
// ═══════════════════════════════════════════════
function canMovePick() {
  return S.started && !S.finished && !S.modalOpen && !S.turning && !S.advancing && S.picks > 0 && S.rot < 1 && isLock();
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
  AudioEngine.init();
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
const endDrag = () => { if (S.dragging) { S.dragging = false; saveRun(); } };
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
    const n = parseInt(e.key, 10);
    const btns = modalOpts.querySelectorAll('.opt-btn');
    if (n >= 1 && n <= btns.length && !btns[n - 1].disabled) btns[n - 1].click();
    else if ((e.key === 'Enter' || e.key === ' ') && modalCont.style.display === 'block') { e.preventDefault(); modalCont.click(); }
    return;
  }
  if (startOverlay.classList.contains('visible')) {
    if (e.key === 'Enter') { e.preventDefault(); (continueBtn.hidden ? startBtn : continueBtn).click(); }
    return;
  }
  if (S.finished) {
    if (e.key === 'Enter') restartBtn.click();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'm' || k === 'ь') { toggleSound(); return; }
  if (S.tab !== 'hack') return;

  if (!isLock()) {
    AudioEngine.init();
    Terminal.handleKey(e);
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    if (canMovePick()) {
      AudioEngine.init();
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
  if ((k === 'r' || k === 'к') && !getPinBtn.disabled) getPinBtn.click();
});
window.addEventListener('keyup', (e) => {
  if (keysHeld.delete(e.key) && keysHeld.size === 0) turnStop();
});

// ═══════════════════════════════════════════════
// КОНТРОЛЬНЫЕ ВОПРОСЫ
// ═══════════════════════════════════════════════
function nextQuestion() {
  const pool = QUESTIONS.map((q, i) => i).filter((i) => S.topics.includes(QUESTIONS[i].cat));
  let fresh = pool.filter((i) => !S.usedQs.includes(i));
  if (!fresh.length) { S.usedQs = S.usedQs.filter((i) => !pool.includes(i)); fresh = pool; }
  const idx = fresh[Math.floor(Math.random() * fresh.length)];
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

  modalTitle.textContent = `ЗАПРОС ИДЕНТИФИКАЦИИ // ${QUESTION_TOPICS[q.cat]}`;
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
        P.right++;
        updatePicks(true);
        updateWear();
        modalRes.textContent = 'ДОСТУП ПОДТВЕРЖДЁН: ВЫДАНА ОТМЫЧКА (+1)';
        modalRes.classList.add('good');
        Sound.good();
        log('Резерв выдан: +1 отмычка.', 'good');
        if (P.right >= 10) unlock('erudite');
      } else {
        S.stats.wrong++;
        P.wrong++;
        S.cooldownLeft = CFG.REQ_COOLDOWN * 1000;
        modalRes.textContent = `ОТКАЗАНО. ПОВТОРНЫЙ ЗАПРОС ЧЕРЕЗ ${CFG.REQ_COOLDOWN} С`;
        modalRes.classList.add('bad');
        Sound.fail();
        log('Идентификация провалена.', 'bad');
      }
      saveProfile();
      saveRun();
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
  AudioEngine.init();
  Sound.click();
  if (!S.finished && !S.modalOpen && S.picks <= 0) openQuestion();
});
modalCont.addEventListener('click', closeQuestion);

// ═══════════════════════════════════════════════
// СОХРАНЕНИЕ ПРОГРЕССА
// ═══════════════════════════════════════════════
function saveRun() {
  if (!S.started || S.finished) return;
  const data = {
    v: 2,
    diff: S.diff,
    stage: S.stage,
    done: S.done,
    picks: S.picks,
    wear: S.wear,
    angle: S.angle,
    target: S.target,
    term: S.term,
    termLockLeft: S.termLockLeft,
    usedQs: S.usedQs,
    cooldownLeft: S.cooldownLeft,
    elapsed: S.elapsed,
    stats: S.stats,
    journal: S.journal.slice(-100),
    saved: Date.now(),
  };
  // Этап, завершённый прямо перед перезагрузкой, засчитываем
  if (S.advancing) data.advancing = true;
  try { localStorage.setItem(RUN_KEY, JSON.stringify(data)); } catch (e) {}
}

function clearRun() { localStorage.removeItem(RUN_KEY); }

function loadRun() {
  const r = loadJSON(RUN_KEY, null);
  if (!r || r.v !== 2 || !DIFFS[r.diff]) return null;
  return r;
}

function applyRun(r) {
  S.diff = r.diff;
  S.started = false;
  S.finished = false;
  S.stage = r.stage;
  S.done = r.done;
  S.picks = r.picks;
  S.wear = r.wear;
  S.angle = r.angle;
  S.target = r.target;
  S.term = r.term;
  S.termLockLeft = r.termLockLeft || 0;
  S.usedQs = r.usedQs || [];
  S.cooldownLeft = r.cooldownLeft || 0;
  S.elapsed = r.elapsed || 0;
  S.stats = Object.assign({ broken: 0, right: 0, wrong: 0, lockouts: 0 }, r.stats);
  S.journal = r.journal || [];
  S.advancing = false;
  buildBadges();
  updatePicks(false);
  updateWear();
  timerEl.textContent = fmtTime(S.elapsed);
  renderLog();
  if (r.advancing && S.done[S.stage]) {
    // Сохранились в момент перехода — сразу переходим к следующему этапу
    if (S.stage + 1 < cfg().stages.length) { S.stage++; enterStage(true); }
    else { enterStage(false); }
  } else {
    enterStage(false);
  }
}

window.addEventListener('pagehide', () => { saveRun(); saveProfile(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { turnStop(); saveRun(); saveProfile(); }
});

// ═══════════════════════════════════════════════
// СТАРТ / ФИНАЛ
// ═══════════════════════════════════════════════
function resetGame() {
  S.diff = chosenDiff;
  S.started = false;
  S.finished = false;
  S.modalOpen = false;
  S.stage = 0;
  S.done = cfg().stages.map(() => false);
  S.picks = cfg().picks;
  S.wear = 0;
  S.angle = 0;
  S.rot = 0;
  S.turning = false;
  S.jammed = false;
  S.advancing = false;
  S.flash = 0;
  S.term = null;
  S.termLockLeft = 0;
  S.cooldownLeft = 0;
  S.elapsed = 0;
  S.stats = { broken: 0, right: 0, wrong: 0, lockouts: 0 };
  S.journal = [];
  buildBadges();
  enterStage(true);
  updatePicks(false);
  updateWear();
  timerEl.textContent = '00:00';
  renderLog();
  canvas.classList.remove('success-glow');
  updateButtons();
}

function showStartScreen() {
  const saved = loadRun();
  continueBtn.hidden = !saved;
  if (saved) {
    const d = DIFFS[saved.diff];
    continueBtn.innerHTML = `&gt; ПРОДОЛЖИТЬ: ${d.name}, ЭТАП ${saved.stage + 1}/${d.stages.length}, ${fmtTime(saved.elapsed)}`;
    startBtn.classList.add('secondary');
    applyRun(saved);
  } else {
    startBtn.classList.remove('secondary');
    resetGame();
  }
  showBest();
  startOverlay.classList.add('visible');
}

function beginPlaying() {
  AudioEngine.init();
  Sound.click();
  startOverlay.classList.remove('visible');
  S.started = true;
  switchTab('hack');
  updateButtons();
  if (isLock()) resizeCanvas();
}

function startNew() {
  clearRun();
  resetGame();
  P.runs++;
  saveProfile();
  beginPlaying();
  log(`Режим «${cfg().name}». Отмычек: ${S.picks}. Этапов: ${cfg().stages.length}.`);
  log(`${stageLabel(0)}: допуск ±${tol()}°.`);
  saveRun();
}

function continueRun() {
  beginPlaying();
  log('Сеанс восстановлен.');
}

function showBest() {
  const best = P.best[chosenDiff];
  bestLine.textContent = best ? `РЕКОРД (${DIFFS[chosenDiff].name}): ${fmtTime(best.time)} · сломано отмычек: ${best.broken}` : '';
}

function rankFor(broken, wrong, lockouts) {
  const score = broken + wrong * 0.5 + lockouts;
  if (score === 0) return 'ПРИЗРАК';
  if (score <= 1) return 'ПРОФЕССИОНАЛ';
  if (score <= 3) return 'ВЗЛОМЩИК';
  return 'ГРУБАЯ СИЛА';
}

function finishGame() {
  S.finished = true;
  turnStop();
  clearRun();
  updateButtons();
  Sound.win();

  const time = S.elapsed;
  const prev = P.best[S.diff];
  const isRecord = !prev || time < prev.time;
  if (isRecord) P.best[S.diff] = { time, broken: S.stats.broken };
  const rank = rankFor(S.stats.broken, S.stats.wrong, S.stats.lockouts);

  P.finished++;
  P.history.unshift({ d: Date.now(), diff: S.diff, time, broken: S.stats.broken, rank });
  P.history = P.history.slice(0, 20);
  saveProfile();

  const gained = [
    'first',
    S.stats.broken === 0 && 'ghost',
    S.diff === 'hard' && 'master',
    S.diff !== 'easy' && time < 120000 && 'speed',
    P.finished >= 10 && 'veteran',
  ].filter((id) => id && unlock(id)).map((id) => ACHIEVEMENTS.find((a) => a.id === id));

  $('endTitle').textContent = 'ДОСТУП РАЗРЕШЁН';
  $('endMsg').innerHTML = '';
  ['ВСЕ СИСТЕМЫ ВЗЛОМАНЫ.', `РЕЖИМ: ${cfg().name}`, `РАНГ: ${rank}`].forEach((t, i) => {
    const p = document.createElement('p');
    p.className = 'line-reveal';
    p.style.animationDelay = (0.3 + i * 0.6) + 's';
    p.textContent = t;
    $('endMsg').appendChild(p);
  });

  $('stats').innerHTML = `
    <div class="stat"><span>ВРЕМЯ</span><b>${fmtTime(time)}${isRecord ? ' ★' : ''}</b></div>
    <div class="stat"><span>СЛОМАНО</span><b>${S.stats.broken}</b></div>
    <div class="stat"><span>БЛОКИРОВКИ</span><b>${S.stats.lockouts}</b></div>
  `;
  $('newAch').innerHTML = gained.map((a) => `<div>★ ${a.name} — ${a.desc}</div>`).join('');
  log(isRecord ? `Взлом завершён за ${fmtTime(time)}. Новый рекорд!` : `Взлом завершён за ${fmtTime(time)}.`, 'good');

  winOverlay.classList.add('visible');
  startRain();
}

startBtn.addEventListener('click', startNew);
continueBtn.addEventListener('click', continueRun);
restartBtn.addEventListener('click', () => {
  Sound.click();
  winOverlay.classList.remove('visible');
  stopRain();
  showStartScreen();
});
$('statsLinkBtn').addEventListener('click', () => {
  AudioEngine.init();
  Sound.click();
  startOverlay.classList.remove('visible');
  switchTab('stat');
});

function selectDiff(d) {
  chosenDiff = d;
  localStorage.setItem('oz.diff', d);
  document.querySelectorAll('.diff-btn').forEach((x) => {
    const on = x.dataset.diff === d;
    x.classList.toggle('active', on);
    x.setAttribute('aria-checked', on);
  });
}

document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    AudioEngine.init();
    Sound.key();
    selectDiff(b.dataset.diff);
    if (continueBtn.hidden) resetGame();
    showBest();
  });
});

function buildTopics() {
  const box = $('topics');
  box.innerHTML = '';
  Object.entries(QUESTION_TOPICS).forEach(([id, name]) => {
    const b = document.createElement('button');
    b.className = 'chip topic-btn' + (S.topics.includes(id) ? ' active' : '');
    b.textContent = name;
    b.setAttribute('aria-pressed', S.topics.includes(id));
    b.addEventListener('click', () => {
      AudioEngine.init();
      Sound.key();
      if (S.topics.includes(id)) {
        if (S.topics.length === 1) { toast('Нужна хотя бы одна тема'); return; }
        S.topics = S.topics.filter((t) => t !== id);
      } else {
        S.topics.push(id);
      }
      localStorage.setItem('oz.topics', JSON.stringify(S.topics));
      buildTopics();
    });
    box.appendChild(b);
  });
}

function toggleSound() {
  AudioEngine.init();
  AudioEngine.setEnabled(!AudioEngine.enabled);
  updateSoundBtn();
  if (AudioEngine.enabled) Sound.click();
}
soundBtn.addEventListener('click', toggleSound);

// ═══════════════════════════════════════════════
// ВКЛАДКИ: СТАТ / ИНВ / ДАННЫЕ
// ═══════════════════════════════════════════════
function switchTab(tab) {
  if (tab !== 'hack') turnStop();
  S.tab = tab;
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  if (tab === 'stat') renderStat();
  if (tab === 'inv') renderInv();
  if (tab === 'data') renderData();
  if (tab === 'hack') {
    if (!S.started && !S.finished) showStartScreen();
    else if (isLock()) resizeCanvas();
  }
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  AudioEngine.init();
  Sound.key();
  switchTab(t.dataset.tab);
}));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bar(pct, cls = '') {
  const n = 10;
  const on = Math.round(pct / 100 * n);
  return `<span class="tbar ${cls}">${'█'.repeat(on)}${'░'.repeat(n - on)}</span>`;
}

function renderStat() {
  const answers = P.right + P.wrong;
  const rows = [
    ['ВЗЛОМОВ НАЧАТО', P.runs],
    ['ВЗЛОМОВ ЗАВЕРШЕНО', P.finished],
    ['ЗАМКОВ ВСКРЫТО', P.locks],
    ['ТЕРМИНАЛОВ ВЗЛОМАНО', P.terms],
    ['ОТМЫЧЕК СЛОМАНО', P.broken],
    ['БЛОКИРОВОК ТЕРМИНАЛА', P.lockouts],
    ['ВЕРНЫХ ОТВЕТОВ', answers ? `${P.right}/${answers} (${Math.round(P.right / answers * 100)}%)` : '—'],
    ['ВРЕМЯ ВО ВЗЛОМЕ', fmtLong(P.playMs)],
  ];
  const best = Object.entries(DIFFS).map(([id, d]) => {
    const b = P.best[id];
    return `<div class="rec"><span>${d.name}</span><b>${b ? fmtTime(b.time) : '--:--'}</b></div>`;
  }).join('');
  const got = ACHIEVEMENTS.filter((a) => P.ach[a.id]).length;
  $('statPane').innerHTML = `
    <h3>РЕКОРДЫ</h3>
    <div class="records">${best}</div>
    <h3>ПОКАЗАТЕЛИ</h3>
    <div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    <h3>ДОСТИЖЕНИЯ ${got}/${ACHIEVEMENTS.length}</h3>
    <div class="ach">${ACHIEVEMENTS.map((a) => `
      <div class="ach-item ${P.ach[a.id] ? 'got' : ''}">
        <span class="ach-icon">${P.ach[a.id] ? '★' : '☆'}</span>
        <span><b>${a.name}</b><br><small>${a.desc}</small></span>
      </div>`).join('')}
    </div>`;
}

function renderInv() {
  const inRun = S.started || loadRun();
  let picks = '';
  if (!inRun) {
    picks = '<div class="muted">Нет активного взлома.</div>';
  } else if (S.picks <= 0) {
    picks = '<div class="muted">ПУСТО — запроси резерв.</div>';
  } else {
    for (let i = 0; i < S.picks; i++) {
      const hp = i === 0 ? Math.round(100 - S.wear) : 100;
      picks += `<div class="inv-item"><span>ОТМЫЧКА #${i + 1}${i === 0 ? ' (В ЗАМКЕ)' : ''}</span>${bar(hp, hp < 35 ? 'low' : '')}<b>${hp}%</b></div>`;
    }
  }
  const keys = cfg().stages.map((st, i) =>
    `<div class="inv-item ${S.done[i] || i === S.stage ? '' : 'dim'}"><span>${S.done[i] ? '✓' : '·'} ${stageLabel(i)}</span><b>${S.done[i] ? 'ВЗЛОМАН' : i === S.stage ? 'ТЕКУЩИЙ' : 'ЗАКРЫТ'}</b></div>`).join('');
  $('invPane').innerHTML = `
    <h3>ОТМЫЧКИ</h3>
    <div class="inv-list">${picks}</div>
    <h3>КЛЮЧИ ДОСТУПА · ${cfg().name}</h3>
    <div class="inv-list">${inRun ? keys : '<div class="muted">—</div>'}</div>
    <h3>ТЕКУЩИЙ ВЗЛОМ</h3>
    <div class="kv">
      <div><span>ВРЕМЯ</span><b>${fmtTime(S.elapsed)}</b></div>
      <div><span>СЛОМАНО ОТМЫЧЕК</span><b>${S.stats.broken}</b></div>
      <div><span>ОТВЕТЫ</span><b>${S.stats.right}/${S.stats.right + S.stats.wrong}</b></div>
      <div><span>БЛОКИРОВКИ ТЕРМИНАЛА</span><b>${S.stats.lockouts}</b></div>
    </div>`;
}

let resetArmed = false;
function renderData() {
  const hist = P.history.length
    ? P.history.map((h) => {
        const d = new Date(h.d);
        const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return `<div class="hist"><span>${date}</span><span>${DIFFS[h.diff] ? DIFFS[h.diff].name : h.diff}</span><b>${fmtTime(h.time)}</b><span>✕${h.broken}</span><span class="hist-rank">${esc(h.rank)}</span></div>`;
      }).join('')
    : '<div class="muted">Пока пусто.</div>';
  const journal = S.journal.length
    ? S.journal.slice().reverse().map((l) => `<div class="${l.k}"><span class="jt">${l.t}</span> ${esc(l.m)}</div>`).join('')
    : '<div class="muted">Пока пусто.</div>';
  $('dataPane').innerHTML = `
    <h3>ЖУРНАЛ ТЕКУЩЕГО ВЗЛОМА</h3>
    <div class="journal">${journal}</div>
    <h3>ИСТОРИЯ ВЗЛОМОВ</h3>
    <div class="history">${hist}</div>
    <button class="link-btn danger" id="resetStatsBtn">${resetArmed ? '[ ТОЧНО? НАЖМИ ЕЩЁ РАЗ ]' : '[ СБРОСИТЬ СТАТИСТИКУ ]'}</button>`;
  $('resetStatsBtn').addEventListener('click', () => {
    if (!resetArmed) { resetArmed = true; renderData(); setTimeout(() => { resetArmed = false; if (S.tab === 'data') renderData(); }, 3000); return; }
    resetArmed = false;
    Object.assign(P, emptyProfile());
    saveProfile();
    toast('Статистика сброшена');
    renderData();
  });
}

// ═══════════════════════════════════════════════
// ЭФФЕКТЫ: загрузочный лог и цифровой дождь
// ═══════════════════════════════════════════════
const BOOT_LINES = [
  'ROBUST-OS BIOS v4.1 ............ OK',
  'ПАМЯТЬ: 64K ..................... OK',
  'ДАТЧИК ДАВЛЕНИЯ ЦИЛИНДРА ........ OK',
  'ЗАМКИ И ТЕРМИНАЛЫ ............... ЗАБЛОКИРОВАНЫ',
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
window.addEventListener('resize', () => { if (isLock()) resizeCanvas(); });
selectDiff(S.diff);
buildTopics();
updateSoundBtn();
showStartScreen();
runBoot();
requestAnimationFrame(loop);
